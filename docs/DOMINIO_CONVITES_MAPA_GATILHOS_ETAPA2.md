# Mapa de gatilhos — Bônus de convite (Etapa 2)

**Objetivo:** documentar **onde** a plataforma dispara verificação/concessão de convites, com **origem rastreável** e **fila por contexto** (`leader_id` + `event_id`).  
**Implementação:** `backend/src/services/invitationBonusTriggerGate.ts` + parâmetro opcional `InvitationBonusTriggerContext` em `leaderBonusService.ts`.

---

## 1. Funções centrais (API pública)

| Função | Papel | Dedup / fila | Log estruturado `event=invitation_bonus_trigger` |
|--------|--------|----------------|-----------------------------------------------------|
| `checkAndGrantInvitationBonus(leaderId, eventId, ctx?)` | Percorre comissões de convite e concede via `grantInvitationBonusSlotAtomic` | Sim — `runExclusiveLeaderEventInvitationBonus` | `op: checkAndGrantInvitationBonus` |
| `checkAllInvitationBonuses(leaderId, eventId, ctx?)` | Delega para `checkAndGrantInvitationBonus` | Sim (via função acima) | Indireto (delegação) |
| `checkInvitationBonusForCommission(leaderId, eventId, commissionId, ctx?)` | Uma comissão: concede/revoga excesso | Sim — mesma fila por líder+evento | `op: checkInvitationBonusForCommission` |
| `triggerInvitationBonusAfterPaidWithCoupon(leaderId, eventId, couponCode, ctx?)` | Cupom pago: comissão do cupom + checagem global | Sim — sequencial: comissão depois `checkAll` | `op: triggerInvitationBonusAfterPaidWithCoupon` |

**Regra de deduplicação:** para o mesmo par `(leader_id, event_id)`, execuções concorrentes entram numa **FIFO** em memória (processo Node). Não altera regra canônica nem `grantInvitationBonusSlotAtomic`.

---

## 2. Mapa de gatilhos (origem → chamada)

| # | Origem (`source`) | Arquivo / contexto | Função chamada | `correlation_id` típico |
|---|-------------------|---------------------|----------------|-------------------------|
| 1 | `asaas_webhook` | `asaasWebhookController.ts` — confirmação de pagamento / PAYMENT_UPDATED | `triggerInvitationBonusAfterPaidWithCoupon` | `registrationId` |
| 2 | `commissions_service_create_commission` | `commissionsService.createCommission` — após INSERT com `bonus_type` invitation/both | `checkAllInvitationBonuses` | `registration_id` |
| 3 | `commissions_service_invitation_only` | `commissionsService.createCommission` — ramo “invitation only” sem criar comissão | `triggerInvitationBonusAfterPaidWithCoupon` | `registration_id` |
| 4 | `registration_bonus_payment_confirmation` | `registrationBonusService.checkInvitationBonusesOnPaymentConfirmation` | `checkAllInvitationBonuses` | `registrationId` |
| 5 | `registrations_service` | `registrationsService` — falha/fluxo alternativo de comissão | `triggerInvitationBonusAfterPaidWithCoupon` | `registration.id` |
| 6 | `registrations_controller` | `registrationsController` — confirmação manual, update, attach/change commission | `checkAllInvitationBonuses` / `checkInvitationBonusForCommission` | `id` / `registrationId` da rota |
| 7 | `expired_registrations_job` | `expiredRegistrationsService` — reprocessa expirados → pagamento / comissão | `checkAllInvitationBonuses` | `registration.id` |
| 8 | `script_grant_missing_bonuses` | `backend/scripts/grant-missing-bonuses.ts` | `checkAndGrantInvitationBonus` | `leader_event_commissions.id` |
| 9 | `script_process_past_invitations` | `backend/scripts/process-past-invitations.ts` | `checkAllInvitationBonuses` | `leader_event_commissions.id` |

---

## 3. Fluxos que **não** disparam concessão

- Leituras: `getLeaderInvitationProgress`, `getLeaderEventCommissions` (comentários no código).
- Auditoria Fase 1: `runInvitationBonusAudit`.
- Reconciliação / missing delivery: fluxos próprios com `apply` (não listados aqui como “gatilho automático”).

---

## 4. Formato do log estruturado

Linha JSON única (um objeto por evento), exemplo:

```json
{
  "event": "invitation_bonus_trigger",
  "phase": "start",
  "op": "checkAndGrantInvitationBonus",
  "leader_id": "…",
  "event_id": "…",
  "source": "asaas_webhook",
  "correlation_id": "…",
  "detail": "opcional"
}
```

Campos: `phase` ∈ `start` | `end` | `error`; `op` conforme tabela; `message` em `error`.

---

## 5. Limitações e múltiplas instâncias

### 5.1 Comportamento atual

- A fila por `(leader_id, event_id)` é **in-process** (memória da instância Node).
- Em **uma instância**: gatilhos concorrentes para a mesma chave são serializados em FIFO.
- Em **múltiplas instâncias**: cada instância mantém sua própria fila; duas instâncias podem processar a mesma chave em paralelo.

### 5.2 Risco atual

- Em ambiente multi-instância, ainda existe risco residual de execução concorrente cross-instance para o mesmo `(leader_id, event_id)`.
- A Etapa 2 reduz corridas locais e melhora rastreabilidade, mas não substitui lock distribuído.

### 5.3 Recomendação futura (sem implementação nesta etapa)

- Implementar lock distribuído por chave `(leader_id, event_id)`:
  - opção A: advisory lock transacional em Postgres;
  - opção B: lock Redis com TTL e renovação.
- Manter os logs estruturados atuais como trilha de auditoria para detectar colisões entre instâncias.

### 5.4 Outros pontos

- Nenhum gatilho foi removido; apenas **ordenados** e **rotulados**.

---

## 6. Referências

- Contrato canônico: `docs/DOMINIO_CONVITES_CONTRATO_CANONICO.md`
- Núcleo de cálculo (Etapa 1): `backend/src/services/invitationBonusCanonicalCore.ts`
