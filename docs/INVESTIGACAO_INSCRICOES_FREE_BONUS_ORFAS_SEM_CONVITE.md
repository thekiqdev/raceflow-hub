# Investigação técnica (somente leitura): inscrições `free_bonus` com `sem_convite_correspondente`

**Versão:** 1.0  
**Escopo:** mapeamento ponta a ponta, sem alteração de código.  
**Objetivo:** localizar **quais fluxos** podem criar `registrations` com `payment_method = 'free_bonus'` **sem** linha correspondente em `leader_invitations` (`bonus_registration_id = registration.id`), reproduzindo o padrão auditado como **lixo** / **órfã**.

---

## 1. Resumo executivo

- A classificação **`sem_convite_correspondente`** na Fase 1 **não é** um campo gravado no banco: é derivada na auditoria quando, para uma `registration` `free_bonus`, **não existe** `leader_invitation` com `bonus_registration_id` apontando para ela (`invitationIds.length === 0` após o join). Ver `buildCommissionBonusArtifacts` em `invitationBonusAuditService.ts` (trecho ~446).
- **`leader_id` / `commission_id` “nulos”** na visão do relatório vêm em grande parte do **LEFT JOIN** com `leader_invitations` / `leader_event_commissions`: se não há convite, não há líder/comissão vinda do vínculo — **não** implica necessariamente colunas `leader_id` em `registrations` (a tabela padrão de inscrições não expõe esses campos como lastro do bônus; o lastro esperado é **`leader_invitations.bonus_registration_id`**).
- **Causa raiz mais forte (código):** em `checkAndGrantInvitationBonus`, o sistema **sempre** chama `createRegistration({ payment_method: 'free_bonus' })` **antes** de `createInvitationFromBonus`. Se a criação do convite **falhar**, o erro é **apenas logado** e o fluxo **continua**; a inscrição `free_bonus` **permanece** sem `leader_invitations`. O laço ainda recalcula `timesGranted` só a partir de **convites existentes**; se o convite não foi criado, `timesGranted` não sobe → o loop pode **tentar de novo** e gerar **várias** inscrições órfãs.
- **Amplificadores:** o mesmo padrão “registration primeiro, convite depois” existe em `checkInvitationBonusForCommission` (um único `try`; falha no convite deixa registration órfã). **Leituras com efeito colateral** disparam `checkAndGrantInvitationBonus` ao abrir telas (`getLeaderInvitationProgress`, `getLeaderEventCommissions`), podendo recriar cenários sem um evento de pagamento novo. **Cupom de líder** entra no ciclo indiretamente: pagamento confirmado → `createCommission` / fallback → `triggerInvitationBonusAfterPaidWithCoupon` → `checkAndGrantInvitationBonus`.

---

## 2. Definição do problema (alinhamento com o código)

| Critério | Origem no sistema |
|----------|-------------------|
| `classification` contém `sem_convite_correspondente` | Calculado em `invitationBonusAuditService.ts`: nenhum `leader_invitation_id` ligado à `registration` via join `li.bonus_registration_id = r.id`. |
| `leader_invitation_id` ausente | Não há linha em `leader_invitations` com `bonus_registration_id = r.id`. |
| `leader_id` / `commission_id` nulos (no relatório) | Vêm do join: sem `leader_invitations`, `invitation_leader_id` / `invitation_commission_id` são nulos. |
| `payment_method = 'free_bonus'` | Filtro da query de massa de bônus + inserções que usam esse método. |

---

## 3. Fluxo ponta a ponta (cupom de líder → bônus)

### 3.1 Inscrição paga com cupom de líder

1. **Criação/atualização da inscrição** — `createRegistration` em `registrationsService.ts` (INSERT em `registrations`). Não cria `free_bonus` de bônus automaticamente; pode ter `coupon_code`.
2. **Pós-criação (pagamento já `paid` no fluxo que aplica):** tentativa de `createCommission` com `leader_id` resolvido pelo cupom (`coupons.leader_id`) ou referral — trecho ~750–817 em `registrationsService.ts`.
3. **Se `createCommission` falha** com mensagens do tipo “invitation only” / “no commission” / valor 0 → chama **`triggerInvitationBonusAfterPaidWithCoupon(leaderId, eventId, coupon_code)`** (mesmo arquivo).
4. **`triggerInvitationBonusAfterPaidWithCoupon`** (`leaderBonusService.ts` ~231): se há cupom, resolve `commissionId` e chama **`checkInvitationBonusForCommission`**; em seguida **`checkAllInvitationBonuses`** → internamente **`checkAndGrantInvitationBonus`**.

### 3.2 Webhook Asaas / confirmação de pagamento

- **`asaasWebhookController.ts`:** após marcar inscrição como paga, resolve líder por cupom/referral e chama **`triggerInvitationBonusAfterPaidWithCoupon`** (vários ramos ~740–971).
- **`registrationBonusService.checkInvitationBonusesOnPaymentConfirmation`:** com `payment_status = 'paid'`, resolve `leaderId` (referral ou cupom) e chama **`checkAllInvitationBonuses`** → **`checkAndGrantInvitationBonus`**.

### 3.3 Criação de `leader_commissions` (comissão monetária)

- **`commissionsService.createCommission`:** se a configuração é `both` ou `invitation` e há comissão criada com sucesso, após INSERT pode chamar **`checkAllInvitationBonuses`** (~232–245).  
- Se só existe tipo `invitation` ou não há config “commission”, lança erro esperado e **antes** dispara **`triggerInvitationBonusAfterPaidWithCoupon`** (~136–170).

### 3.4 Contagem (paidCount / expectedBonuses)

- **`getRegistrationsByLeaderCoupons`** (`leaderRegistrationsService.ts` — referenciado por `leaderBonusService`): alinha com a auditoria (“produção”) para inscrições pagas filtradas por cupom quando existir.
- **`expectedBonuses`** = `Math.floor(paidCount / required_purchases)`; **`timesGranted`** = COUNT de `leader_invitations` por `(leader_id, event_id, commission_id)` em `available|sent|used`.

### 3.5 Onde nasce a `registration` `free_bonus` “de bônus”

- **`checkAndGrantInvitationBonus`** e **`checkInvitationBonusForCommission`**: `createRegistration({ payment_method: 'free_bonus', runner_id: leader.user_id, ... })` seguido de **`createInvitationFromBonus(leaderId, freeRegistration.id, eventId, commissionId)`** (`leaderInvitationsService.ts`).

### 3.6 Fluxos que também criam `free_bonus` mas **não** são “bônus por meta”

- **`createRegistrationByOrganizerController`** (`registrationsController.ts` ~1696–1725): organizador cria inscrição com `payment_method: 'free_bonus'` para **excluir receita** — **não** cria `leader_invitations`. Isso pode aparecer na massa `free_bonus` da auditoria e misturar-se semanticamente com bônus de líder, mas **não** passa pelo cupom do líder no mesmo sentido.
- **`missingInvitationDeliveryService`**: apply cria par `registration` + `leader_invitations` em transação com SAVEPOINT — **fora** do escopo “cupom”, mas é outro criador legítimo de `free_bonus`.

---

## 4. Funções que criam ou disparam criação de `free_bonus` (checklist)

| Função / entrada | Cria `registration` `free_bonus`? | Condições de chamada | Idempotência / validação prévia |
|------------------|-------------------------------------|----------------------|-----------------------------------|
| **`checkAndGrantInvitationBonus`** | Sim (`createRegistration`) | `expectedBonuses > timesGranted` por comissão | Conta só `leader_invitations`; **não** verifica se já existe registration órfã sem convite; loop pode repetir se convite não incrementar COUNT. |
| **`checkInvitationBonusForCommission`** | Sim | Idem, escopo uma comissão | Mesmo padrão registration → convite. |
| **`createInvitationFromBonus`** | Não (só INSERT em `leader_invitations`) | Chamada após `createRegistration` no bônus | Trata 23505 buscando existente em alguns casos (`leaderInvitationsService.ts`). |
| **`triggerInvitationBonusAfterPaidWithCoupon`** | Indireto | Pós-pagamento / comissão invitation-only | Chama `checkInvitationBonusForCommission` + `checkAllInvitationBonuses` (dupla verificação no mesmo disparo). |
| **`checkAllInvitationBonuses`** | Indireto | Wrapper para `checkAndGrantInvitationBonus` | Erros engolidos (log). |
| **`checkInvitationBonusesOnPaymentConfirmation`** | Indireto | `payment_status = 'paid'` | Chama `checkAllInvitationBonuses`. |
| **`getLeaderInvitationProgress`** | Indireto (**efeito colateral em leitura**) | Ao listar progresso do líder | Chama `checkAndGrantInvitationBonus` por `event_id` (~492–499). |
| **`getLeaderEventCommissions`** | Idem | Ao listar comissões do líder | Chama `checkAndGrantInvitationBonus` por evento com bônus (~122–133). |
| **`createRegistration` (genérico)** | Sim, se `payment_method` passado for `free_bonus` | Qualquer chamada | Não exige `leader_invitations`. |
| **`expiredRegistrationsService`** | Indireto | Ao reprocessar expirados e marcar pago | Chama `checkAllInvitationBonuses` em ramos ~87–165. |
| **`registrationsController`** (vários) | Indireto | Após atrelar cupom / atualizar pagamento | Múltiplos `checkAllInvitationBonuses` (~1900–2550). |
| **Scripts** `grant-missing-bonuses.ts`, `process-past-invitations.ts` | Indireto | Manutenção | Chamam `checkAndGrantInvitationBonus` / `checkAllInvitationBonuses`. |

---

## 5. Pontos que geram “inscrição lixo” (evidência)

### 5.1 Principal: convite falha após registration persistida

**Arquivo:** `backend/src/services/leaderBonusService.ts`

**Trecho conceitual — `checkAndGrantInvitationBonus` (~131–176):**

- `createRegistration(... free_bonus ...)` executa e **commit** implícito na query.
- `createInvitationFromBonus` está em **try/catch interno**; em falha: apenas `console.error`, **sem** DELETE da registration, **sem** rollback.
- `timesGranted` só sobe se o COUNT em `leader_invitations` aumentar; se o convite não foi criado, o laço **`while (timesGranted < expectedBonuses)`** pode **repetir**, criando **múltiplas** registrations órfãs.

**Cenário:** falha em `createInvitationFromBonus` (constraint, dados, race, erro transitório DB).

### 5.2 Mesmo padrão em `checkInvitationBonusForCommission` (~336–360)

- Um único `try` envolve `createRegistration` + `createInvitationFromBonus`.
- Se o segundo falha, o `catch` loga e dá **`break`** — a registration **já foi criada** (sem transação envolvendo os dois).

### 5.3 Leitura com efeito colateral

**`getLeaderInvitationProgress`** e **`getLeaderEventCommissions`**: chamam `checkAndGrantInvitationBonus` ao **carregar dados**. Isso pode gerar bônus (e órfãos, se 5.1) **sem** novo pagamento — explica “reaparece após exclusão” se alguém **abre painel** ou **API lista comissões** após DELETE físico das órfãs: o sistema recalcula `paidCount`, ainda há meta a cumprir, tenta conceder de novo.

### 5.4 Cupom do líder como gatilho (não como INSERT direto)

- O cupom **não** insere `free_bonus` sozinho; ele faz **`paidCount`** subir e dispara cadeias que chamam **`checkAndGrantInvitationBonus`**. O INSERT problemático continua sendo **sempre** em `checkAndGrantInvitationBonus` / `checkInvitationBonusForCommission` (ou fluxos que os chamam).

### 5.5 Inscrições `free_bonus` sem convite **por desenho** (não confundir com bug)

- **Organizador** criando atleta: `payment_method: 'free_bonus'` sem `leader_invitations` — intenção de reporting (`registrationsController` ~1696–1725).
- Auditoria pode classificar overlap com critérios de órfã dependendo dos filtros; o recorte de DELETE seguro usa `sem_convite_correspondente` + ausência de vínculos — documentado em `invitationBonusReconciliationService.ts`.

---

## 6. Fluxo correto vs incorreto

### 6.1 Correto (bônus por meta)

1. Existe `leader_event_commissions` com `bonus_type` invitation/both e `paidCount` coerente.
2. Para cada slot concedido: criar **par atômico** `registration` (lastro) + `leader_invitations` com `bonus_registration_id` = id da registration, `leader_id` e `commission_id` corretos.
3. **`timesGranted`** reflete convites em `available|sent|used`.

### 6.2 Incorreto (órfã)

1. `registration` `free_bonus` persistida.
2. `leader_invitations` **não** criado ou não aponta para essa registration.
3. Auditoria: `sem_convite_correspondente` + `orfa` (quando join não traz líder/comissão).

---

## 7. Hipótese principal (causa raiz)

1. **Ordem e tratamento de erro:** registration criada **antes** do convite, com falha do segundo passo **aceita** (catch que não desfaz o primeiro).
2. **Falta de idempotência por `bonus_registration_id`:** se o convite falha, não há incremento de `timesGranted`; o algoritmo pode **inserir de novo** outra registration órfã.
3. **Reprocessamento / leitura:** `getLeaderInvitationProgress` e `getLeaderEventCommissions` **reexecutam** concessão em consultas GET — após exclusão de órfãs, o “estado de meta” ainda pede convites → **novas** tentativas.

**O “cupom do líder”** é o **gatilho** que leva `paidCount` e as cadeias de pós-pagamento a chamarem `checkAndGrantInvitationBonus`; a **falha estrutural** está na **concessão** (registration vs convite), não no cupom em si.

---

## 8. O que está correto hoje (não quebrar)

- Regra de negócio: **bônus por N compras** com cupom/referral e COUNT de convites por comissão.
- **`createInvitationFromBonus`** com tratamento de duplicidade (`unique_bonus_registration`) quando o convite já existe para o mesmo `bonus_registration_id`.
- Fluxos de **comissão monetária** + chamada a `checkAllInvitationBonuses` após pagamento quando aplicável.
- **Auditoria Fase 1** e reconciliação que **classificam** órfãos — são diagnóstico, não causa.
- **`missingInvitationDeliveryService`** como fluxo separado de correção (não misturar regra com o bug acima sem análise).

---

## 9. Próximo passo recomendado (sem implementar aqui)

1. **Transação atômica** ou **compensação**: ao falhar `createInvitationFromBonus`, remover ou marcar inválida a `registration` `free_bonus` criada no mesmo fluxo — **definir política** (rollback vs soft delete).
2. **Idempotência:** antes de novo INSERT de registration, verificar se já existe órfã pendente para a mesma comissão / mesma “tentativa”, ou usar chave de idempotência.
3. **Remover ou isolar efeitos colaterais** em `getLeaderInvitationProgress` / `getLeaderEventCommissions` (job assíncrono ou flag explícita “sync”).
4. **Métricas/logs** na concessão: correlacionar `registration.id` com sucesso/falha de `createInvitationFromBonus` (já há logs parciais).
5. **Separar semanticamente** `free_bonus` de “organizador” vs “slot de convite líder” (campo ou origem), para auditoria não misturar categorias.

---

## 10. Referência rápida de arquivos

| Arquivo | Papel |
|---------|--------|
| `backend/src/services/leaderBonusService.ts` | `checkAndGrantInvitationBonus`, `triggerInvitationBonusAfterPaidWithCoupon`, `checkInvitationBonusForCommission`, `checkAllInvitationBonuses`, `getLeaderInvitationProgress` (side effect) |
| `backend/src/services/leaderInvitationsService.ts` | `createInvitationFromBonus` |
| `backend/src/services/registrationsService.ts` | `createRegistration`; pós-hook comissão/bônus |
| `backend/src/services/registrationBonusService.ts` | Pós-confirmação pagamento → `checkAllInvitationBonuses` |
| `backend/src/services/commissionsService.ts` | `createCommission` → gatilhos de bônus |
| `backend/src/services/leaderEventCommissionsService.ts` | Lista comissões + **sync** `checkAndGrantInvitationBonus` |
| `backend/src/controllers/asaasWebhookController.ts` | Webhook → `triggerInvitationBonusAfterPaidWithCoupon` |
| `backend/src/controllers/registrationsController.ts` | Organizador `free_bonus`; vários `checkAllInvitationBonuses` |
| `backend/src/services/expiredRegistrationsService.ts` | Reprocessamento → `checkAllInvitationBonuses` |
| `backend/src/services/invitationBonusAuditService.ts` | Classificação `sem_convite_correspondente` |
| `backend/src/services/missingInvitationDeliveryService.ts` | Correção assistida (par consistente) |

---

## 11. Observação sobre `changeEventOrganizerService.ts`

- Busca no escopo desta investigação **não** encontrou criação direta de `free_bonus` ou chamadas aos gatilhos acima no trecho pesquisado; se existir migração de dados relacionada a convites, validar em revisão futura **apenas leitura** nesse arquivo completo.

---

## 12. Correção estrutural aplicada (backend)

- **Serviço novo:** `backend/src/services/invitationBonusGrantService.ts` — `grantInvitationBonusSlotAtomic` executa `BEGIN` → INSERT `registrations` (`free_bonus`) → INSERT `leader_invitations` → `COMMIT`. Em falha: `ROLLBACK` (a registration da tentativa não permanece). Log `[invitation_bonus_grant] concessao_falhou` com `event_id`, `leader_id`, `commission_id`, `registration_id_tentativa` quando o primeiro INSERT já ocorreu, `rollback_aplicado`, motivo e `pg_code`.
- **`checkAndGrantInvitationBonus` / `checkInvitationBonusForCommission`:** passam a usar apenas a concessão atômica (não mais `createRegistration` + `createInvitationFromBonus` em sequência desprotegida).
- **Leituras:** removido o disparo de `checkAndGrantInvitationBonus` em `getLeaderInvitationProgress` e em `getLeaderEventCommissions` — listagens são somente leitura.
- **Testes:** `backend/tests/invitationBonusGrantService.test.ts` — `npm run test:invitation-bonus-grant`.

---

*Documento gerado para suporte à decisão de correção; a seção 12 descreve o estado pós-correção no repositório.*
