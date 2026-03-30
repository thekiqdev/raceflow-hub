# Etapa 3 — Reprojeto lógico do domínio de convites (3A/3B inicial)

## Objetivo

Introduzir uma camada explícita de orquestração do domínio de convites, separando modos de operação sem alterar:

- regra canônica de cálculo (Etapa 1);
- concessão atômica (`grantInvitationBonusSlotAtomic`);
- fonte de verdade (`leader_invitations`) e lastro (`leader_invitations.bonus_registration_id = registrations.id`).

---

## 1) Nova camada de orquestração

### Arquivo

- `backend/src/services/invitationBonusDomainOrchestrator.ts`

### Função principal

- `executeInvitationBonusDomainCommand(command)`

### Responsabilidade

- receber comandos de domínio;
- normalizar contexto de origem/correlação;
- rotear para funções já existentes;
- preservar compatibilidade com gate/deduplicação por `(leader_id, event_id)` da Etapa 2;
- emitir log estruturado do comando de domínio.

---

## 2) Tipos/comandos formais de domínio

### Arquivo

- `backend/src/types/invitationBonusDomain.ts`

### Comandos implementados

- `payment_confirmed_with_coupon`
- `recheck_leader_event`
- `recheck_commission`
- `deliver_missing_assisted`
- `reconcile_state`

### Modos de operação

- `automatico`
- `operacional`
- `assistido`

### Retorno mínimo padronizado

- `operation`
- `mode`
- `leader_id`
- `event_id`
- `commission_id` (opcional)
- `executed`
- `detail` (opcional)

---

## 3) Logs de comando de domínio

Novo evento de log:

- `event = invitation_bonus_domain_command`

Campos:

- `type`
- `mode`
- `source`
- `correlation_id`
- `leader_id`
- `event_id`
- `commission_id`
- `phase` (`start` | `error` | `end`)
- `message` (quando erro)

---

## 4) Adaptação incremental dos gatilhos (sem mudança de regra)

Foram adaptados para chamar o orquestrador:

- `asaasWebhookController`
- `commissionsService`
- `registrationBonusService`
- `registrationsService`
- `registrationsController`
- `expiredRegistrationsService`
- scripts operacionais:
  - `grant-missing-bonuses.ts`
  - `process-past-invitations.ts`

Fluxos assistidos também passam por comando explícito:

- `missingInvitationDeliveryController` → `deliver_missing_assisted`
- `invitationBonusReconciliationController` → `reconcile_state`

---

## 5) Separação semântica de modos

### Automático

- gatilhos de pagamento/comissão/reprocessamento;
- somente rechecks e concessão segura conforme estado canônico atual.

### Operacional

- ações administrativas manuais e scripts operacionais;
- rechecks explícitos por líder/evento ou comissão.

### Assistido (histórico)

- reconciliation e missing-delivery;
- acionamento explícito por comando de domínio;
- não acionado por gatilho automático.

---

## 6) Compatibilidade e limites

### Mantido

- contrato canônico da Etapa 1;
- gate local da Etapa 2 (fila por `(leader_id,event_id)` nas funções de concessão);
- telemetria de trigger (`invitation_bonus_trigger`) e diagnóstico legado.

### Não incluído nesta etapa

- lock distribuído (multi-instância);
- migração de schema;
- saneamento histórico automático;
- alterações de frontend.

---

## 7) Riscos remanescentes (para próxima etapa)

1. Deduplicação continua **in-process** (risco residual cross-instance).
2. Alguns scripts operacionais agora retornam resultado padronizado de comando; uso de output legado deve considerar essa padronização.
3. Fase seguinte deve focar em governança operacional de comandos assistidos (perfis/permissões e trilha de auditoria externa, se necessário).

