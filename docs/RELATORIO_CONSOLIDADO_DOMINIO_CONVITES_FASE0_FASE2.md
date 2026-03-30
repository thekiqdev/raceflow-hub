# Relatório consolidado — Domínio de Convites (Fase 0 + Fase 2)

**Status:** investigação e consolidação (sem implementação de correção de negócio).  
**Base oficial:** `docs/RESUMO_EXECUTIVO_DOMINIO_CONVITES.md` e `docs/INVESTIGACAO_DOMINIO_CONVITES_FASE0_FASE2.md`, **priorizando o código real** quando houver divergência.  
**Data de referência:** snapshot do repositório na elaboração deste relatório.

---

## Fonte de verdade e regras mandatórias (fixas)

| Regra | Descrição |
|-------|-----------|
| Convite concedido válido | `leader_invitations` (não inferir só por `registrations`). |
| Vínculo canônico | `leader_invitations.bonus_registration_id = registrations.id`. |
| `free_bonus` isolada | `payment_method = 'free_bonus'` **sem** vínculo canônico **não** é convite válido. |
| Faltante vs lixo | Classes distintas; lixo **não** prova faltante; faltante **não** autoriza reaproveitar lixo automaticamente. |
| Leitura | Não deve escrever no domínio de convites (concessão/reconciliação). |
| Correção futura | Onde “produção” divergir do canônico, **prevalece o canônico** na correção definitiva. |

---

## 1. Resumo executivo atualizado

- O núcleo de **concessão canônica** está concentrado em `invitationBonusGrantService.grantInvitationBonusSlotAtomic`: cria `registrations` (`free_bonus`) e `leader_invitations` com lastro na **mesma transação** (rollback se falhar).
- O cálculo “**produção**” usado na concessão (`leaderBonusService` + `getRegistrationsByLeaderCoupons`) pode **inflar** `paidCount` quando o cupom da comissão **não** é resolvido: entra o fallback **cupom do líder OR referral**, alterando `expectedBonuses` e podendo gerar excesso ou reprocessamento.
- A **auditoria Fase 1** (`invitationBonusAuditService`) calcula **produção** e **canônico** em paralelo (`paidCount_production` vs `paidCount_canonical`) e classifica `free_bonus` com/sem lastro — base para separar lixo de faltante **em teoria**; na prática, `free_bonus` mistura **administrativa/organizador** e **lastro de convite**, exigindo recorte futuro por origem/campo.
- **Reprocessamento** ocorre em vários gatilhos (webhook, update manual, comissão, expirados, troca de cupom/comissão). A atomicidade do slot reduz órfãos de concessão; o risco restante é **excesso/divergência** por contagem e por múltiplas passagens.
- **Leitura de progresso/comissões** (`getLeaderInvitationProgress`, `getLeaderEventCommissions`) **não** dispara concessão. Há **leitura com efeito colateral** em `GET .../pending-difference-payment` (sincroniza `payment_status` da inscrição — não é domínio de convites, mas altera base usada depois).
- **Reconciliação** e **geração de faltantes** são fluxos explícitos (`apply` + hashes + confirmação); não fazem parte desta etapa de execução.

---

## 2. Inventário final do domínio

### 2.A Mapa por camada (arquivo → função → papel)

#### `backend/src/services`

| Arquivo | Função (principal) | Categoria | Cria `leader_invitations` | Cria `free_bonus` | Vincula `bonus_registration_id` | Escrita indireta | Risco |
|---------|-------------------|-----------|----------------------------|-------------------|----------------------------------|------------------|-------|
| `invitationBonusGrantService.ts` | `grantInvitationBonusSlotAtomic` / `grantInvitationBonusSlotWithClient` | concessão | sim | sim | sim | não | baixo (transação) |
| `leaderBonusService.ts` | `checkAndGrantInvitationBonus` | cálculo + concessão | indireto | indireto | indireto | não | alto (fallback cupom/referral) |
| `leaderBonusService.ts` | `checkInvitationBonusForCommission` | cálculo + concessão + revogação | indireto | indireto | indireto | não | alto |
| `leaderBonusService.ts` | `checkAllInvitationBonuses` | gatilho (delega) | indireto | indireto | indireto | não | médio |
| `leaderBonusService.ts` | `triggerInvitationBonusAfterPaidWithCoupon` | gatilho | indireto | indireto | indireto | não | médio |
| `leaderBonusService.ts` | `recalculateAndRevokeExcessInvitations` | saneamento parcial | não (UPDATE expire) | não | não | não | **médio** — ver §7 (COUNT sem filtro de status) |
| `leaderBonusService.ts` | `getLeaderInvitationProgress` | leitura / cálculo | não | não | não | não | baixo |
| `leaderRegistrationsService.ts` | `getRegistrationsByLeaderCoupons` | cálculo | não | não | não | não | médio (OR referral) |
| `leaderInvitationsService.ts` | `createInvitationFromBonus` | concessão parcial | sim | não | sim se bônus já existe | não | médio |
| `leaderInvitationsService.ts` | `sendInvitationByCpf` (e afins) | uso de convite | UPDATE `leader_invitations` + UPDATE `registrations` do lastro | não cria slot novo | mantém vínculo | não | médio |
| `invitationBonusAuditService.ts` | `runInvitationBonusAudit` | leitura / auditoria | não | não | não | não | baixo |
| `invitationBonusReconciliationService.ts` | `runInvitationBonusReconciliation` | reconciliação | UPDATE expire; DELETE condicional | DELETE `registrations` | N/A | só `apply` | alto |
| `missingInvitationDeliveryService.ts` | `runMissingInvitationDelivery` / `tryInsertOneMissingInviteSlot` | geração faltantes | sim | sim | sim | só `apply` | alto |
| `commissionsService.ts` | `createCommission` | gatilho | indireto | indireto | indireto | não | alto |
| `registrationBonusService.ts` | `checkInvitationBonusesOnPaymentConfirmation` | gatilho | indireto | indireto | indireto | não | médio |
| `expiredRegistrationsService.ts` | `cancelExpiredRegistrations` | job / gatilho | indireto | indireto | indireto | não | médio |
| `changeEventOrganizerService.ts` | `executeChangeEventOrganizer` / `migrateInvitations` | migração | UPDATE `leader_invitations` | não | não altera vínculo | não | médio |
| `leaderEventCommissionsService.ts` | `getLeaderEventCommissions` | leitura / cálculo | não | não | não | não | baixo |
| `asaasService.ts` | `syncRegistrationPaymentStatus` | infra (pagamento) | não | não | não | pode ser chamado por GET | médio (efeito colateral) |

#### `backend/src/controllers`

| Arquivo | Controller / fluxo | Categoria | Escreve domínio convites? | Notas |
|---------|---------------------|-----------|---------------------------|-------|
| `asaasWebhookController.ts` | webhook pagamento | gatilho | indireto (`checkAllInvitationBonuses`, `recalculateAndRevokeExcessInvitations`) | |
| `registrationsController.ts` | confirmação manual, update, attach/change commission, organizer create | gatilho + escrita `free_bonus` | sim indireto / sim `free_bonus` sem lastro em fluxos manuais | |
| `invitationBonusAuditController.ts` | simulador | leitura | não | |
| `invitationBonusAuditContextController.ts` | contexto auditoria | leitura | não | |
| `invitationBonusReconciliationController.ts` | reconcile | reconciliação | só POST `apply` | |
| `missingInvitationDeliveryController.ts` | missing delivery | geração faltantes | só POST `apply` | |
| `groupLeadersController.ts` | `getLeaderInvitationProgressController` | leitura | não | |
| `leaderEventCommissionsController.ts` | CRUD + listagens | leitura / escrita comissão | comissão/cupom; não concede convite na listagem | |
| `leaderInvitationsController.ts` | listar / enviar convite | leitura + ação | envio altera convite/registro lastro | |
| `changeEventOrganizerController.ts` | migração | migração | indireto | |
| `adminScriptsController.ts` | scripts admin | script operacional | depende do endpoint | |

#### `backend/src/routes` (trechos relevantes)

| Rota (prefixo típico) | Domínio |
|----------------------|---------|
| `adminRoutes`: `GET .../invitation-progress`, `POST .../audit/invitation-bonus-simulator`, `POST .../reconcile/*`, `POST .../events/:id/change-organizer` | leitura progresso; auditoria; reconcile; migração |
| `groupLeaders`: `GET/POST .../me/invitations*` | convites do líder |
| `organizerRoutes`: `GET .../invitation-progress`, event-commissions | progresso; comissões |
| `registrations`: `POST .../:id/complete-invitation` | completar fluxo do convite (não é concessão de slot) |

#### `backend/scripts`

| Script | Categoria | Risco |
|--------|-----------|-------|
| `grant-missing-bonuses.ts` | script operacional | alto — chama `checkAndGrantInvitationBonus` |
| `fix-missing-invitations.ts`, `process-past-invitations.ts` | script operacional | médio — `createInvitationFromBonus` |
| `fix-invitation-registrations.ts`, `fix-organizer-registrations.ts` | saneamento legado | alto — força `free_bonus` sem lastro |
| `check-bonus-status.ts`, `debug-invitations.ts`, `verify-bonus-eligibility.ts` | leitura | baixo |

#### `src/components` / `src/lib/api`

| Área | Ficheiros | Papel |
|------|-----------|-------|
| Admin auditoria | `InvitationBonusAuditPanel.tsx`, `src/lib/api/invitationBonusAudit.ts` | chama simulador/reconcile/missing (escrita só se operador usar `apply`) |
| Líder | `LeaderDashboard.tsx`, APIs de group-leaders | progresso e convites |
| Admin líder | `GroupLeaderDetails.tsx` | progresso |
| Organizador | `LeaderEventCommissions.tsx`, `EventDetailedReport.tsx`, `src/lib/api/leaderEventCommissions.ts` | stats por comissão / relatórios |
| Convite público | `invitationCompletion.ts`, rotas `invitations` / auth | completar inscrição via token |

---

## 3. Fluxo real ponta a ponta (síntese)

1. **Compra paga** (webhook Asaas ou confirmação manual): `registrations.payment_status` → `paid` (e fluxos associados).
2. **Identificar líder**: `coupon_code` → `coupons.leader_id` ou `user_referrals`.
3. **Comissão**: `createCommission` ou, se só convite, `triggerInvitationBonusAfterPaidWithCoupon`.
4. **Bônus**: `checkInvitationBonusForCommission` (comissão do cupom se identificável) + `checkAllInvitationBonuses` → `checkAndGrantInvitationBonus`.
5. **Cálculo**: `paidCount` via `getRegistrationsByLeaderCoupons` com ou sem `coupon_code`; `expectedBonuses = floor(paidCount/required)`; `timesGranted` = COUNT `leader_invitations` em `available|sent|used` por comissão.
6. **Concessão**: se `expectedBonuses > timesGranted`, laços chamando `grantInvitationBonusSlotAtomic` até equilibrar (com limite de tentativas).
7. **Lastro**: `leader_invitations.bonus_registration_id` aponta para `registrations.id` criada como `free_bonus`.
8. **Uso**: envio por CPF altera `leader_invitations` e a `registration` lastreada (não cria novo slot de meta).

---

## 4. Tabela — funções que escrevem no domínio (criação / vínculo / expire / delete)

| Função | Tabelas | Transacional | Idempotência | Risco duplicidade |
|--------|---------|--------------|--------------|-------------------|
| `grantInvitationBonusSlotAtomic` | `registrations`, `leader_invitations` | sim (BEGIN/COMMIT) | parcial (constraints + retries em outros fluxos) | baixo no slot |
| `createInvitationFromBonus` | `leader_invitations` | não (statement único) | sim (`unique_bonus_registration`) | baixo |
| `tryInsertOneMissingInviteSlot` | `registrations`, `leader_invitations` | sim (BEGIN + SAVEPOINT) | parcial (23505 tratado) | médio (corrida) |
| `checkInvitationBonusForCommission` | via `grantInvitationBonusSlotAtomic`; UPDATE `leader_invitations` expire | parcial | não | médio |
| `recalculateAndRevokeExcessInvitations` | UPDATE `leader_invitations` expire | não (vários UPDATEs) | não | ver §7 |
| `runInvitationBonusReconciliation` (apply) | UPDATE + DELETE + backup | sim (BEGIN) | dry_run+hash | alto |
| `runMissingInvitationDelivery` (apply) | INSERT pair | sim | hash + loops | alto |
| Fluxos manuais `registrationsController` | INSERT/UPDATE `registrations` | varia | não | gera “lixo” sem lastro |

---

## 5. Tabela — funções e endpoints de leitura (e efeitos colaterais)

| Função / endpoint | Escreve convites? | Observação |
|-------------------|-------------------|------------|
| `getLeaderInvitationProgress` | não | só SELECT + contagens |
| `getLeaderEventCommissions` | não | enriquecimento; sem concessão |
| `runInvitationBonusAudit` | não | simulador |
| `GET /api/registrations/:id/pending-difference-payment` | não convites | **sim** altera `registrations` via `syncRegistrationPaymentStatus` |
| `GET .../invitation-progress` | não | delega a `getLeaderInvitationProgress` |

---

## 6. Diferenças entre produção (legado em operação) e canônico (deve prevalecer)

| Tema | Comportamento atual “produção” (legado operacional) | Comportamento canônico (alvo de correção) |
|------|-----------------------------------------------------|------------------------------------------|
| `paidCount` na concessão | `getRegistrationsByLeaderCoupons` **com** `coupon_code` se cupom resolve; **sem** filtro de cupom → entra **referral** | Contagem estrita por **cupom da comissão** (e vendas elegíveis definidas no contrato único) — como `paidCount_canonical` na auditoria |
| `expectedBonuses` | `floor(paidCount_production/required)` | `floor(paidCount_canonical/required)` quando o negócio fixar a mesma base da auditoria |
| Contagem de convites na UI “comissão” (`getLeaderEventCommissions` stats) | `invitations_earned` só `status='available'` | Alinhar com negócio: frequentemente “ganhos” = `available|sent|used` (como progresso e auditoria) |
| Contagem em `recalculateAndRevokeExcessInvitations` | COUNT **todos** os `leader_invitations` da comissão (**sem** filtro `status`) | Alinhar com `available|sent|used` ou política explícita; hoje pode divergir de `checkInvitationBonusForCommission` |

**Divergência explícita anexo vs código:** o resumo executivo enfatiza fallback de cupom; o código confirma que **sem** `coupon_code` no filtro entram vendas por **referral**. O relatório de investigação já detalha isso — mantém-se como **fonte técnica** o código.

---

## 7. Causas raiz

### Confirmadas

1. Fallback **cupom OR referral** em `getRegistrationsByLeaderCoupons` quando não há filtro de `coupon_code`.
2. Múltiplos **gatilhos** chamando `checkAllInvitationBonuses` / `checkAndGrantInvitationBonus`.
3. **`free_bonus` sem lastro** por fluxos manuais (organizador/admin) e scripts de fix.
4. **`recalculateAndRevokeExcessInvitations`** usa COUNT de convites **sem** restringir a `available|sent|used`, diferente de `checkInvitationBonusForCommission` — risco de decisão errada de revogação vs meta.

### Suspeitas (exigem evidência por evento)

5. Corridas entre gatilhos concorrentes gerando **tentativas extras** (mitigado em parte por constraints e loops com limite).
6. Migração de organizador alterando **mapeamento de cupom/líder** e impactando auditoria posterior.

### Descartadas (para o escopo “leitura escreve convite”)

7. `getLeaderInvitationProgress` / `getLeaderEventCommissions` **não** concedem convite (código atual).

---

## 8. Violações ao modelo canônico (estado atual)

| Violação | Evidência |
|----------|-----------|
| `free_bonus` sem `leader_invitations.bonus_registration_id` | Fluxos em `registrationsController` e scripts |
| Leitura com escrita em outro domínio | `GET pending-difference-payment` + `syncRegistrationPaymentStatus` |
| Possível inconsistência interna de contagem | `recalculateAndRevokeExcessInvitations` vs `checkInvitationBonusForCommission` |
| Mistura semântica `free_bonus` | Mesmo `payment_method` para lastro e administrativo |

---

## 9. O que já está correto e não deve ser quebrado

- **Transação** em `grantInvitationBonusSlotAtomic` (evita registration órfã sem convite).
- **Auditoria Fase 1** com par produção/canônico e classificação de registos.
- **Reconcile / missing delivery** com modo `dry_run`, hashes e `apply_confirmed` (padrão de segurança).
- **Remoção de concessão por leitura** em progresso/comissões (comentários + ausência de chamadas a concessão).

---

## 10. Ordem recomendada para a próxima etapa (correção segura)

1. Congelar **contrato único de contagem** (alinhado ao canônico da auditoria) para concessão e painéis.
2. Definir **marcador de origem** (ou tabela/tipo) para `free_bonus` administrativa vs lastro de convite — antes de saneamento em massa.
3. Corrigir **inconsistência** `recalculateAndRevokeExcessInvitations` vs política de COUNT (status).
4. Reduzir **gatilhos duplicados** ou documentar idempotência forte por evento/comissão.
5. Só então **Fase 3** saneamento e **Fase 4** endurecimento de API/UI.

---

## 11. O que deverá entrar nas futuras Fase 3 e Fase 4 (objetivo)

### Fase 3 (saneamento / dados)

- Recortes auditáveis por evento/líder; backup antes de DELETE; política explícita para administrativo vs lixo.
- Revisão de scripts legados (`fix-*`) — desativar ou adaptar ao contrato único.

### Fase 4 (produto / engenharia)

- Unificar métricas nas telas (`available` vs `available|sent|used`).
- Eliminar efeitos colaterais de GETs onde possível; separar “sync pagamento” de “ler PIX”.
- Endurecer API de convites: um caminho de escrita documentado; testes de regressão na concessão e na auditoria.

---

## Anexo A — Matriz operacional resumida (funções críticas)

| Função | Entrada principal | Saída esperada | Escrita | Transacional | Idempotente | Duplicidade |
|--------|-------------------|----------------|---------|--------------|-------------|-------------|
| `checkAndGrantInvitationBonus` | `leaderId`, `eventId` | conceder até `expectedBonuses` | `registrations`+`leader_invitations` via atomic | por slot sim | parcial | médio |
| `checkInvitationBonusForCommission` | `leaderId`, `eventId`, `commissionId` | grant/revoke por comissão | idem + expire | por slot sim | parcial | médio |
| `runInvitationBonusAudit` | `event_id`, `leader_id?` | relatório | nenhuma | N/A | sim (leitura) | — |
| `runInvitationBonusReconciliation` | `mode`, hashes | plano / apply | apply: UPDATE/DELETE | sim | com dry_run+hash | — |
| `runMissingInvitationDelivery` | `mode`, hashes | plano / apply | apply: INSERT pair | sim | com dry_run+hash | médio |

---

## Anexo B — Pontos de reprocessamento (checklist)

| Ponto | Funções | Risco | Excesso | Divergência | Lixo | Cupom não resolvido |
|-------|---------|-------|---------|-------------|------|---------------------|
| Webhook | `createCommission`, `triggerInvitationBonusAfterPaidWithCoupon`, `recalculateAndRevokeExcessInvitations` | médio | sim | sim | indireto | sim |
| Update manual | `registrationsController` + `checkAllInvitationBonuses` | médio | sim | sim | indireto | sim |
| Job expirados | `cancelExpiredRegistrations` → `checkAllInvitationBonuses` | médio | sim | sim | indireto | sim |
| Troca cupom/comissão | `checkInvitationBonusForCommission`, `recalculateAndRevokeExcessInvitations` | alto | sim | sim | indireto | sim |
| Scripts | `grant-missing-bonuses`, `process-past-invitations` | alto | sim | sim | sim | varia |

---

## Anexo C — Lixo operacional vs faltante (clareza obrigatória)

- **Faltante (deficit real de convite concedido):** para uma comissão, `expectedBonuses` (na base canônica acordada) **>** `times_granted_db` em `available|sent|used` **e** sem lixo crítico a invalidar geração — conforme política do `missingInvitationDeliveryService`.
- **Lixo operacional (`free_bonus` inválida no domínio de convites):** `payment_method='free_bonus'` **sem** linha em `leader_invitations` com `bonus_registration_id = registrations.id` (ou com classificação `sem_convite_correspondente` na auditoria).
- **Administrativo/organizador:** mesma coluna `payment_method='free_bonus'`, intenção **não** é lastro de convite; a auditoria pode rotular como sem convite — **não** implica faltante.
- **Frase-chave:** **“free_bonus inválida” não é sinónimo automático de “convite faltante”.**

---

*Fim do relatório consolidado (Fase 0 + Fase 2).*
