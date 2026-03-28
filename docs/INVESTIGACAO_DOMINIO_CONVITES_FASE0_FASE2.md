# Investigação Domínio de Convites — Fase 0 + Fase 2 (somente leitura)

**Versão:** 0.1 (snapshot do estado atual do código)  
**Escopo:** inventário real (fase 0) + auditoria funcional real (fase 2).  
**Regra principal:** não implementar correções de negócio nesta etapa.

---

## 0. Padrões mandatórios (fonte de verdade e vínculo canônico)

- Fonte de verdade de **convite concedido válido**: `leader_invitations`.
- Vínculo canônico / lastro: `leader_invitations.bonus_registration_id = registrations.id`.
- `registrations` com `payment_method = 'free_bonus'` **sem** esse vínculo canônico **não são convites concedidos válidos** (são inconsistentes/lixo operacional/pendência).
- Déficit (`faltantes`) e lixo operacional (`free_bonus` inválidas) são problemas distintos.
- Leitura **não** pode escrever no domínio.

---

## A. Inventário real encontrado (Fase 0)

### A.1 Backend — serviços que tocam o domínio de convites

#### (1) Concessão / escrita canônica (registration free_bonus + leader_invitations)

1. `backend/src/services/invitationBonusGrantService.ts`
   - `grantInvitationBonusSlotAtomic(params)`
     - `BEGIN` → INSERT em `registrations` (`payment_method='free_bonus'`, `status='confirmed'`, `payment_status='convidado'`) → INSERT em `leader_invitations` (`bonus_registration_id` = id da registration) → `COMMIT`.
     - Em qualquer falha pós-INSERT, executa `ROLLBACK` (não fica `registration` órfã).
   - `grantInvitationBonusSlotWithClient(client, params)`
     - Realiza apenas as duas inserções no client (sem gerenciar transação).

2. `backend/src/services/leaderBonusService.ts`
   - `checkAndGrantInvitationBonus(leaderId, eventId)`
     - Lê configuração em `leader_event_commissions` (bonus_type `invitation|both`).
     - Para cada comissão: calcula `paidCount` via `getRegistrationsByLeaderCoupons` e `timesGranted` via COUNT de `leader_invitations`.
     - Quando `expectedBonuses > timesGranted`, concede **via `grantInvitationBonusSlotAtomic`**.
   - `checkInvitationBonusForCommission(leaderId, eventId, commissionId)`
     - Mesmo mecanismo de cálculo, mas no escopo de uma comissão.
     - Concede via `grantInvitationBonusSlotAtomic`.
     - Revoga convites em excesso (expira) se `timesGranted > expectedBonuses`.

#### (2) Criação de convites a partir de lastro existente

3. `backend/src/services/leaderInvitationsService.ts`
   - `createInvitationFromBonus(leaderId, bonusRegistrationId, eventId, commissionId?)`
     - Só insere em `leader_invitations`.
     - Faz “idempotência suave” por `unique_bonus_registration`: se 23505, busca e retorna o convite existente.

#### (3) Cálculo de “vendas elegíveis” para meta

4. `backend/src/services/leaderRegistrationsService.ts`
   - `getRegistrationsByLeaderCoupons(leaderId, filters?)`
     - Query que conta inscrições:
       - (a) com `coupon_code` que pertence ao líder (EXISTS em `coupons` com `leader_id`)
       - OU (b) inscrições de usuários referidos (`user_referrals`)
     - Filtro opcional por `event_id`, `payment_status`, e `coupon_code` (quando fornecido).

#### (4) Resolução de cupons (cupom da comissão)

5. `backend/src/services/couponsService.ts`
   - Usado via import dinâmico por:
     - `leaderBonusService.getCouponByEventCommission(...)` (via `getCouponByEventCommission`)
   - Impacta o cálculo de `paidCount` em produção/código (escopo por cupom vs fallback por referral).

#### (5) Gate de gatilhos pós-pagamento (disparo de bônus)

6. `backend/src/services/registrationBonusService.ts`
   - `checkInvitationBonusesOnPaymentConfirmation(registrationId)`
     - Lê `registrations` (runner/event/coupon_code).
     - Resolve `leaderId` via:
       - `user_referrals` (runner_id) ou
       - `coupons.code` (coupon_code do registro)
     - Chama `checkAllInvitationBonuses(leaderId, registration.event_id)`.

7. `backend/src/services/commissionsService.ts`
   - `createCommission(...)`
     - Após criar `leader_commissions`, pode disparar:
       - `checkAllInvitationBonuses(leader_id, event_id)` se o tipo de bônus da comissão inclui `invitation/both`
       - ou `triggerInvitationBonusAfterPaidWithCoupon(leader_id, event_id, couponCode)` em fluxos de invitation-only / sem comissão.

8. `backend/src/controllers/asaasWebhookController.ts` (cadeia de pagamento)
   - Quando pagamento fica `paid/confirmed/received`, chama rotas internas que podem:
     - criar comissão
     - disparar `triggerInvitationBonusAfterPaidWithCoupon`
     - o que por sua vez chama `checkInvitationBonusForCommission` e `checkAllInvitationBonuses`.

#### (6) Reprocessamento

9. `backend/src/services/expiredRegistrationsService.ts`
   - Reprocessa registros expirados e chama `checkAllInvitationBonuses`.

10. `backend/src/services/invitationBonusReconciliationService.ts`
   - **apply** (com `apply_confirmed`) faz:
     - `UPDATE leader_invitations` (expire) e
     - `DELETE registrations` (somente recorte de `free_bonus` elegível para remoção).

11. `backend/src/services/missingInvitationDeliveryService.ts`
   - **apply** (com guard de hashes e `apply_confirmed`) faz:
     - inserir `registrations` (`free_bonus`) e inserir `leader_invitations` (com savepoints e idempotência por duplicate/23505).

#### (7) Migração de organizador

12. `backend/src/services/changeEventOrganizerService.ts`
   - Executa migração transacional e atualiza contexto:
     - `UPDATE events.organizer_id`
     - migra/resolve líderes para `organizer_group_leaders`
     - atualiza registros de migração em `event_organizer_migration_log`
     - e pode atualizar artefatos de rastreio/migração em tabelas ligadas ao modelo.
   - Não deve ser tratada como “fluxo de concessão” de bônus; é um recontexto que pode influenciar matching/escopo depois.

---

### A.2 Backend — controllers/rotas/gatilhos

- `backend/src/controllers/asaasWebhookController.ts`
  - Webhook/cadeia de pagamento → cria comissão + dispara verificação de bônus.
- `backend/src/controllers/registrationsController.ts`
  - confirmação manual/updates de pagamento → dispara verificação de bônus.
  - há também endpoints que transformam registros em `payment_method='free_bonus'` (admin/organizer).
- `backend/src/controllers/invitationBonusAuditController.ts`
  - Fase 1 — simulador/auditoria somente leitura.
- `backend/src/controllers/invitationBonusReconciliationController.ts`
  - Frente 2 reconciliação — dry_run/apply com guard.
- `backend/src/controllers/missingInvitationDeliveryController.ts`
  - Geração assistida — dry_run/apply com guard e idempotência.
- `backend/src/routes/adminRoutes.ts`
  - rotas `/audit/...` e `/reconcile/...` (escrita apenas em `apply`).
- `backend/src/routes/groupLeaders.ts`
  - convites do líder (leitura e ações de envio).

---

### A.3 Scripts operacionais

- `backend/scripts/grant-missing-bonuses.ts`
  - usa `checkAndGrantInvitationBonus` (concessão).
- `backend/scripts/process-past-invitations.ts` e `backend/scripts/fix-missing-invitations.ts`
  - usam `createInvitationFromBonus` (só convites).
- `backend/scripts/fix-invitation-registrations.ts` e `backend/scripts/fix-organizer-registrations.ts`
  - atualizam `registrations` para `payment_method='free_bonus'` (escrita potencial que pode gerar órfãos se não houver lastro correspondente).
- `backend/scripts/check-bonus-status.ts`, `debug-invitations.ts`, etc.
  - predominantemente leitura.

---

### A.4 Frontend / leitura operacional (somente leitura, mas pode disparar chamadas)

- `src/components/admin/InvitationBonusAuditPanel.tsx`
  - chama auditoria e reconciliação/missing invitation delivery via admin (apply = escrita explícita).
- `src/components/runner/leader/LeaderDashboard.tsx`
  - lê dashboards (deve chamar endpoints de convites e progresso).
- `src/components/admin/GroupLeaderDetails.tsx`
  - chama leitura de progresso (`getLeaderInvitationProgress`).
- `src/components/organizer/LeaderEventCommissions.tsx`
  - chama leitura de comissões e estatísticas por comissão/evento.

---

## B. Matriz do domínio (Fase 0)

> **Legenda:** “pode rodar em leitura?” = se é chamado por endpoints de leitura (sem apply explícito).  

| Arquivo | Função | Categoria | Cria `leader_invitations`? | Cria `registrations free_bonus`? | Vincula `bonus_registration_id`? | Pode rodar em leitura? | Risco operacional | Observação |
|---|---|---|---|---|---|---|---|---|
| `invitationBonusGrantService.ts` | `grantInvitationBonusSlotAtomic` | escrita / concessão | sim | sim | sim | não (deve ser só em concessão) | alto | atômico: garante lastro na mesma transação |
| `leaderBonusService.ts` | `checkAndGrantInvitationBonus` | gatilho de concessão | sim (indiretamente) | sim (indiretamente) | sim | não | alto | concede por comissão quando `expected > timesGranted` |
| `leaderBonusService.ts` | `checkInvitationBonusForCommission` | gatilho de concessão | sim (indiretamente) | sim (indiretamente) | sim | não | médio/alto | inclui revogação/expire em excesso |
| `leaderInvitationsService.ts` | `createInvitationFromBonus` | escrita (convite) | sim | não | depende do `bonusRegistrationId` | scripts/saneamento | médio | 23505 é tratado retornando existente |
| `leaderRegistrationsService.ts` | `getRegistrationsByLeaderCoupons` | leitura (cálculo) | não | não | não | sim | baixo | “produção” conta cupom OR referral |
| `invitationBonusAuditService.ts` | `runInvitationBonusAudit` | leitura (auditoria) | não | não | não | sim | baixo | calcula produção vs canônico; classifica sem escrita |
| `invitationBonusReconciliationService.ts` | `runInvitationBonusReconciliation` | reconciliação | sim | sim (delete) | não (apaga) | não | alto | escreve apenas em `mode=apply` com guard |
| `missingInvitationDeliveryService.ts` | `runMissingInvitationDelivery` | reconciliação (faltantes) | sim | sim | sim | não | alto | gera faltantes até expected canônico; idempotente |
| `commissionsService.ts` | `createCommission` | gatilho pós-pagamento | indiretamente | indiretamente | indiretamente | não | alto | após criar comissão dispara bônus/verificação |
| `asaasWebhookController.ts` | cadeia webhook | gatilho pós-pagamento | indiretamente | indiretamente | indiretamente | não | alto | pagamento confirmado → dispara bônus |
| `expiredRegistrationsService.ts` | reprocessamento | gatilho | indiretamente | indiretamente | indiretamente | não | médio | reprocessa e recalcula bônus |
| `registrationsController.ts` | criação/edição `free_bonus` | escrita (admin/organizer) | não | sim | não | não (admin/organizer) | médio | gera `free_bonus` sem lastro convites por desenho |
| `changeEventOrganizerService.ts` | `executeChangeEventOrganizer` | migração | sim (possível) | não (provável) | dependente do update | não | médio | recontextualiza líderes/cupom/convites indiretamente |

---

## C. Fluxo ponta a ponta real (Fase 2 — auditoria funcional em código)

### C.1 Compra com cupom do líder → concessão

1. `asaasWebhookController.ts` / confirmação manual:
   - marca `registrations.payment_status` como `paid/confirmed/received`.
2. Disparo de pós-pagamento:
   - resolve `leaderId` via `coupon_code` (`coupons.leader_id`) ou via `user_referrals`.
   - cria comissão (`createCommission`) ou, quando não há comissão invitation-only, chama `triggerInvitationBonusAfterPaidWithCoupon`.
3. `leaderBonusService.triggerInvitationBonusAfterPaidWithCoupon`:
   - resolve `commissionId` via `getCommissionIdByCouponCode` e chama:
     - `checkInvitationBonusForCommission(leaderId, eventId, commissionId)`
     - depois chama `checkAllInvitationBonuses(leaderId, eventId)`.
4. `leaderBonusService.checkAndGrantInvitationBonus` (e `checkInvitationBonusForCommission`):
   - para cada comissão:
     - resolve cupom da comissão (`getCouponByEventCommission`).
     - calcula `paidCount` chamando `getRegistrationsByLeaderCoupons`:
       - se cupom resolvido: `coupon_code` filter aplicado → conta cupom daquela comissão (referal é excluído por filtro).
       - se cupom não resolvido: **não existe filtro de coupon_code** → conta também referral (fallback de escopo).
     - calcula `timesGranted` via COUNT `leader_invitations` em statuses `available|sent|used`.
     - se `expectedBonuses > timesGranted`, concede slot atômico:
       - `grantInvitationBonusSlotAtomic` cria `registration free_bonus` + `leader_invitations` com vínculo canônico.

### C.2 Leitura de progresso e estatísticas (sem escrita)

- `getLeaderInvitationProgress(leaderId, organizerId?)`:
  - consulta:
    - `leader_event_commissions`
    - resolve cupom
    - conta registros pagos (cálculo)
    - conta convites válidos por comissão (available)
  - **não** dispara concessão.

- `getLeaderEventCommissions(leaderId, organizerId?)`:
  - consulta comissões e enriquece com stats:
    - paidCount por comissão (com ou sem coupon filter)
    - invitationsCount via COUNT `leader_invitations` em `status='available'`
  - **não** dispara concessão.

### C.3 Auditoria funcional (Fase 1 / produção vs canônico)

Em `invitationBonusAuditService.runInvitationBonusAudit(event_id, leader_id?)`:

1. Produção (“produção” / atual):
   - `paidCount_production`:
     - usa `getRegistrationsByLeaderCoupons` com `coupon_code` = cupom resolvido da comissão (se existir) senão sem filtro (inclui referral).
2. Canônico:
   - `paidCount_canonical`:
     - usa `getCanonicalPaidRegistrationIds`:
       - somente inscrições pagas no evento
       - `coupon_code` igual ao cupom da comissão
       - e EXISTE cupom do líder com aquele código
3. Meta:
   - `expectedBonuses_production = floor(paidCount_production / required_purchases)`
   - `expectedBonuses_canonical = floor(paidCount_canonical / required_purchases)`
4. Concedidos reais (DB):
   - `times_granted_db = COUNT leader_invitations` em `available|sent|used`
5. “Invitations válidos” (para separar lixo x válido):
   - `buildCommissionBonusArtifacts` classifica cada `registration` com `payment_method='free_bonus'` via join com `leader_invitations`:
     - `valida` quando classificação lista contém somente `valida`.
     - `sem_convite_correspondente` quando `invitationIds.length === 0` para aquela `registration`.
   - produz:
     - `registration_ids_bonus_validos`
     - `leader_invitation_ids_validos`
6. Consumo do “válido” em reconciliação/geração de faltantes:
   - `missingInvitationDeliveryService` usa `leader_invitation_ids_validos` para contar `timesGranted_validos` e `timesGranted_inconsistentes`.

---

## H. Fase 2 — Auditoria funcional completa (validações objetivas)

### H.1 Cálculo real (produção vs auditoria)

#### H.1.1 `paidCount`

**Produção (no cálculo que alimenta concessão):**

- `leaderBonusService.checkAndGrantInvitationBonus` calcula `paidCount` a partir de `leaderRegistrationsService.getRegistrationsByLeaderCoupons`.
- Esse método conta inscrições que satisfazem:
  - (A) `r.coupon_code IS NOT NULL` e existe cupom (`coupons`) com `cp.leader_id = leaderId` e `cp.code == r.coupon_code`; OU
  - (B) existe linha em `user_referrals` com `ur.user_id = r.runner_id` e `ur.leader_id = leaderId`.
- Filtro opcional `coupon_code`:
  - quando `filters.coupon_code` é fornecido, adiciona `r.coupon_code IS NOT NULL AND r.coupon_code == filters.coupon_code`.
  - isso remove o ramo (B) (referral) do conjunto contado.
- Filtro `payment_status='paid'`:
  - adiciona `r.payment_status='paid'` e, adicionalmente, `r.status != 'cancelled'`.

**Onde cupom entra:**
- `leaderBonusService` resolve `couponCode` por comissão via `couponsService.getCouponByEventCommission`.
- quando `couponCode` resolve, `coupon_code` é passado ao `getRegistrationsByLeaderCoupons`, restringindo contagem ao cupom da comissão (sem referral).

**Onde referral entra:**
- se `couponCode` não é resolvido (ou não é fornecido), o filtro `coupon_code` não é aplicado e o método conta (A cupom do líder OR B referral).

#### H.1.2 `expectedBonuses`

- Tanto no cálculo que concede quanto na auditoria:
  - `expectedBonuses = floor(paidCount / required_purchases)`.

#### H.1.3 `timesGranted` / `times_granted_db`

**Na produção (concessão):**
- `leader_invitations` é contado com:
  - `status IN ('available','sent','used')`
  - escopo por `leader_id`, `event_id` e `commission_id`.

**Na auditoria (Fase 1 / simulador):**
- `invitationBonusAuditService` materializa:
  - `times_granted_db = COUNT leader_invitations` em `available|sent|used` por comissão.

#### H.1.4 `granted_validos` (e “válido”)

- `granted_validos` é computado no **fluxo de prova expandida** do `missingInvitationDeliveryService`:
  - `validLiIds = new Set(row.leader_invitation_ids_validos)` (vindo do audit).
  - para cada `leader_invitations` em statuses `available|sent|used`:
    - se `leader_invitation_id` está em `validLiIds`, incrementa `timesGranted_validos` (contagem do “válido”).
    - caso contrário, incrementa `timesGranted_inconsistentes` e marca evidencia/blockers.

Em outras palavras:
- `granted_validos` não é apenas “exists no DB”: é “existe no DB AND pertence ao conjunto `leader_invitation_ids_validos` definido pela auditoria/classificação da Fase 1”.

#### H.1.5 Divergência produção vs auditoria

- A auditoria distingue:
  - `paidCount_production` (segue a regra “cupom da comissão quando resolvido, senão sem filtro de cupom” e usa `getRegistrationsByLeaderCoupons`);
  - `paidCount_canonical` (mais estrito: usa apenas inscrições pagas do evento, com cupom de comissão e confirmação de que existe cupom do líder com aquele código).
- Resultado:
  - `expectedBonuses_production` pode ser maior que `expectedBonuses_canonical` quando o fallback por referral (ou cupom não resolvido) ocorre.

### H.2 Escrita real do domínio (lista exata por origem)

Abaixo, as **escritas reais** que criam ou deletam o domínio canônico:

#### H.2.1 `leader_invitations` (criação)

- `backend/src/services/invitationBonusGrantService.ts`
  - `grantInvitationBonusSlotWithClient(...)`:
    - `INSERT INTO leader_invitations (leader_id, bonus_registration_id, event_id, status, commission_id)`.
- `backend/src/services/leaderInvitationsService.ts`
  - `createInvitationFromBonus(...)`:
    - `INSERT INTO leader_invitations ... status='available'`.
    - idempotência por `unique_bonus_registration` (tratativa de 23505).
- `backend/src/services/missingInvitationDeliveryService.ts`
  - `tryInsertOneMissingInviteSlot(...)` (apply):
    - `INSERT INTO leader_invitations ... status='available'` (dentro de `SAVEPOINT`, com rollback to savepoint em erro).

#### H.2.2 `registrations` com `payment_method='free_bonus'` (criação)

- `backend/src/services/invitationBonusGrantService.ts`
  - `grantInvitationBonusSlotWithClient(...)`:
    - `INSERT INTO registrations (... payment_method='free_bonus', confirmation_code, status='confirmed', payment_status='convidado')`.
- `backend/src/services/missingInvitationDeliveryService.ts`
  - `tryInsertOneMissingInviteSlot(...)` (apply):
    - `INSERT INTO registrations (... payment_method='free_bonus', confirmation_code, status='confirmed', payment_status='convidado')`.

#### H.2.3 `bonus_registration_id` (vínculo canônico)

- O vínculo é feito em todos os caminhos que “criam canônico”:
  - `leader_invitations.bonus_registration_id = registrations.id` (sempre que `grant...Atomic` e `missingInvitationDeliveryService` criam/lastreiam).

#### H.2.4 Destruição/expiração (reconciliação)

- `backend/src/services/invitationBonusReconciliationService.ts` (apply):
  - `UPDATE leader_invitations SET status='expired'` (Bloco A).
  - `DELETE FROM registrations WHERE payment_method='free_bonus' ... AND NOT EXISTS (leader_invitations ... bonus_registration_id=r.id)` (Bloco B físico controlado).

### H.2.5 Origens (separação por gatilho)

- webhook / pagamento confirmado:
  - `backend/src/controllers/asaasWebhookController.ts` → `createCommission`/`triggerInvitationBonusAfterPaidWithCoupon` → `checkAllInvitationBonuses` → concessão (`grantInvitationBonusSlotAtomic`).
- confirmação manual / updates:
  - `backend/src/controllers/registrationsController.ts`
    - em update de pagamento/conteúdo, chama `checkAllInvitationBonuses` após confirmação.
- script:
  - `backend/scripts/grant-missing-bonuses.ts`: chama `checkAndGrantInvitationBonus` (escrita canônica).
  - `backend/scripts/fix-missing-invitations.ts` / `process-past-invitations.ts`: chama `createInvitationFromBonus` (escrita em `leader_invitations`).
- job/reprocessamento:
  - `backend/src/services/expiredRegistrationsService.ts` chama `checkAllInvitationBonuses` após marcar pagos.
- leitura/dashboard:
  - as leituras de progresso/comissões (`getLeaderInvitationProgress`, `getLeaderEventCommissions`) foram ajustadas para não disparar concessão.
- migração de organizador:
  - `backend/src/services/changeEventOrganizerService.ts` atualiza `leader_invitations.leader_id` (recontextualização), mas não cria `registrations free_bonus`.
- reconciliação:
  - endpoints `.../reconcile/...` executam `invitationBonusReconciliationService` (apply).
- geração de faltantes:
  - endpoint `.../missing-invitation-delivery` executa `missingInvitationDeliveryService` (apply).

### H.3 Leitura com efeito colateral (o que ainda escreve)

#### H.3.1 “Progresso” e “comissões” (mitigação existente)

- `leaderBonusService.getLeaderInvitationProgress(...)`:
  - faz apenas SELECT (inclui contagem de `leader_invitations`).
  - não chama concessão.
- `leaderEventCommissionsService.getLeaderEventCommissions(...)`:
  - faz SELECT e “enrichment”; não chama concessão.

#### H.3.2 Exceção relevante encontrada: leitura `pending-difference-payment`

- `backend/src/controllers/registrationsController.ts`
  - `GET /api/registrations/:id/pending-difference-payment` chama:
    - `syncRegistrationPaymentStatus(id)` (atualiza `registrations.payment_status` e `registrations.status`).
  - este endpoint é leitura com efeito colateral (escrita em `registrations`), embora não crie `leader_invitations` diretamente.

### H.4 Padrão de lixo crítico (sem_convite_correspondente / lastro ausente)

#### H.4.1 Definição operacional (como o sistema efetivamente enxerga)

- Em `invitationBonusAuditService.runInvitationBonusAudit`:
  - `rawBonusRows` inclui `registrations` com `payment_method='free_bonus'` e registros com `leader_invitations` (via join por `bonus_registration_id`).
  - a classificação de “sem lastro convites” / `sem_convite_correspondente` deriva do conjunto de `leader_invitations` ligado à registration.

#### H.4.2 Caminhos que podem gerar este padrão hoje (ativos)

1. **Organizador cria inscrição manualmente como free bonus**
   - `backend/src/controllers/registrationsController.ts`:
     - payload para organizer-creates usa `payment_method='free_bonus'`, `status='confirmed'`, `payment_status='convidado'`.
   - não cria `leader_invitations` no mesmo fluxo.
2. **Admin/organizador marca uma inscrição como “convite” (update de convite)**
   - `backend/src/controllers/registrationsController.ts`:
     - quando `willBeConvite` é true, força `payment_method='free_bonus'` e zera totais.
   - não cria `leader_invitations` no mesmo fluxo.
3. **Scripts legados de “fix” para status free_bonus**
   - `backend/scripts/fix-invitation-registrations.ts`:
     - atualiza `registrations` com `payment_method='free_bonus'` para `status='confirmed'` e `payment_status='convidado'` (sem criar `leader_invitations`).
   - `backend/scripts/fix-organizer-registrations.ts`:
     - atualiza inscrições do organizador para `payment_method='free_bonus'`/`payment_status='convidado'` (sem lastro).

#### H.4.3 Caminhos que NÃO deveriam criar órfãos (mitigação atual)

- `grantInvitationBonusSlotAtomic` (concessão canônica):
  - cria registration e leader_invitations em transação (`BEGIN/COMMIT`) ou reverte.
- `missingInvitationDeliveryService` (geração controlada):
  - usa `SAVEPOINT` e rollback to savepoint para evitar persistência parcial.

### H.5 Divergência entre telas e fontes

Principais diferenças que aparecem no código:

1. `leaderEventCommissionsService.getLeaderEventCommissions(...)`
   - para convites usa contagem apenas `status='available'`.
   - já `leaderBonusService.getLeaderInvitationProgress(...)` conta `available|sent|used`.
2. `paidCount` em telas pode usar fallback de escopo (cupom não resolvido → conta referral).
3. Auditoria canônica é mais restrita e pode mostrar `paidCount_canonical` menor.

### H.6 Migração de organizador (riscos reais)

- `backend/src/services/changeEventOrganizerService.ts`:
  - `migrateInvitations(...)` executa:
    - `UPDATE leader_invitations SET leader_id = new_leader_id ... WHERE status IN ('available','sent') AND migration_id IS NULL`.
  - `migrateCoupons(...)` atualiza/duplica `coupons` e `coupon_events`.
- O efeito no domínio de convites:
  - não cria `registrations free_bonus`.
  - recontextualiza quem “recebe” convites e quem “possui” cupom, o que pode alterar matching e causar divergências em auditoria vs produção.

### H.7 Scripts legados (classificação operacional para risco)

Baseado no que os scripts fazem hoje:

- Relevante e relativamente seguro (usa funções com idempotência ou só escreve convites):
  - `backend/scripts/fix-missing-invitations.ts` (`createInvitationFromBonus`):
    - idempotente por `unique_bonus_registration`.
  - `backend/scripts/process-past-invitations.ts`:
    - cria convites via `createInvitationFromBonus` (idempotente).
- Relevante mas potencialmente perigoso (pode criar/alterar concessões):
  - `backend/scripts/grant-missing-bonuses.ts`:
    - chama `checkAndGrantInvitationBonus` (escreve registration+leader_invitations).
- Capaz de gerar inconsistência (marca `free_bonus` sem lastro canônico):
  - `backend/scripts/fix-invitation-registrations.ts` (status/payment_status em `free_bonus` sem lastro).
  - `backend/scripts/fix-organizer-registrations.ts` (converte inscrições do organizador para `free_bonus`).
- Predominantemente leitura (baixo risco):
  - `check-bonus-status.ts`, `debug-invitations.ts`, `verify-bonus-eligibility.ts`.

## D. Classes do domínio (Fase 1 em código; usado como “base”)

Base derivada do classificador do audit:

### D.1 Convite

- **Convite concedido válido**: `leader_invitations` em `available|sent|used` com vínculo canônico na registration bônus.
- **Convite faltante**: `expectedBonuses > times_granted_db` no recorte de comissão.
- **Convite excedente**: `times_granted_db > expectedBonuses` no recorte de comissão.

### D.2 Registration free_bonus

- **free_bonus válida (lastro canônico)**: registration com `payment_method='free_bonus'` e existência de `leader_invitations` com `bonus_registration_id = registration.id`.
- **free_bonus lixo (operacional / inconsistência)**: `payment_method='free_bonus'` sem vínculo canônico:
  - classifica como `sem_convite_correspondente` (entre outras flags).
- **free_bonus administrativa**:
  - registros criados por admin/organizador com `payment_method='free_bonus'` sem intenção de lastro de convite (não devem ser tratados como convite concedido).
- **free_bonus dados inconsistente/fora de regra**:
  - classificação `orfa`, `acima_do_esperado`, `criada_fora_da_regra_da_comissao` etc.

---

## E. Causas raiz — confirmadas, suspeitas, descartadas (com base no código atual)

> Observação: “causa raiz” aqui é para o domínio de convites (divergência, lixo, falta/duplicidade).

### E.1 Confirmadas (alto impacto)

1. **Fallback de escopo quando o cupom da comissão não resolve**
   - `leaderBonusService` e o auditor usam `getRegistrationsByLeaderCoupons` sem filtro `coupon_code` quando cupom não existe.
   - Como a query de `getRegistrationsByLeaderCoupons` conta **cupom do líder OR referral**, o `paidCount` pode inflar (produção), afetando `expectedBonuses`.
   - Isso pode gerar excesso de convites e, secundariamente, churn histórico (lixo e reprocessamentos).

2. **Múltiplos gatilhos que disparam verificação**
   - `asaasWebhookController`, `registrationsController` (confirmação manual), `commissionsService.createCommission`, `expiredRegistrationsService` disparam `checkAllInvitationBonuses`.
   - Sem instrumentação/guard por “processado”, pode haver janela de reprocessamento (mesmo com atomicidade do slot).

### E.2 Suspeitas (médio impacto; requer auditoria funcional completa por evento/líder)

3. **Inconsistência de “produção vs canônico” (painéis e auditoria)**
   - O audit calcula canônico estrito, mas telas podem usar estatísticas com fallback sem filtro de cupom.
   - Isso explica divergências entre painel e auditoria.

4. **Mistura semântica de `free_bonus` (admin/organizer vs convite)**
   - O audit trata `payment_method='free_bonus'` como elegível a classificação `sem_convite_correspondente`.
   - Se telas/reconciliações não diferenciam “admin/organizer” vs “bônus por convite”, podem ocorrer ações indesejadas.

### E.3 Descartadas (ou mitigadas no código atual)

5. **Leitura que gera escrita**
   - `getLeaderInvitationProgress` e `getLeaderEventCommissions` foram ajustados para não chamar rotinas de concessão.
   - Em estado atual do código, essas leituras **não deveriam** recriar bônus.

---

## F. Violações atuais ao modelo canônico

### F.1 “Leitura não pode escrever”

- No código atual, as funções de leitura de progresso/comissões **não chamam** `checkAndGrantInvitationBonus`.
- Violação **não encontrada** nessas leituras específicas (com base no que foi inspecionado no snapshot do código).

### F.2 “Fonte de verdade e vínculo canônico”

- O canônico é respeitado na concessão (slot atômico cria `registration free_bonus` e `leader_invitations` com vínculo).
- **Violação semântica**: `registrations.payment_method='free_bonus'` é usado também para freebies administrativas/organizador sem vínculo de convite; o audit reconcilia isso como inconsistência quando não há lastro.

### F.3 “Déficit vs lixo”

- O audit classifica e agrega `sem_convite_correspondente`, mas o sistema precisa garantir que:
  - isso não seja usado como prova de “faltantes”,
  - nem reaproveitado sem regra explícita.
- Em código atual, o missing delivery e reconciliação são fluxos controlados, mas a distinção semântica de origem pode ainda causar interpretações erradas em telas e análises.

---

## G. Prioridade de correção futura (a partir do que o código sugere)

### Núcleo (core)

1. Governança da regra de contagem: remover fallback implícito (ou torná-lo explicitamente “production” vs “canônico”), garantindo consistência entre:
   - concessão,
   - auditoria,
   - e painéis.

2. Deduplicação operacional por evento/líder/comissão:
   - instrumentar e garantir que reprocessamentos por múltiplos gatilhos não causem excesso após metas.

### Dependente de saneamento

3. Classificação/ação sobre `free_bonus` administrativa vs convite:
   - definir recorte rígido para “lixo operacional” real.

### Dependente de UI/relatórios

4. Unificar visão global vs evento e produção vs canônico para que “painel” e “auditoria” não divergirem sem explicação.

---

## Nota final desta investigação (importante)

Este documento descreve o **estado atual do código** (snapshot do repositório) e a auditoria funcional em “produção vs canônico” que já existe em `invitationBonusAuditService.ts`.

Se existir divergência ainda entre reprocessamento histórico e comportamento atual, a confirmação deve ser feita rodando auditoria Fase 1 em um **evento crítico** (definição no plano mestre).

