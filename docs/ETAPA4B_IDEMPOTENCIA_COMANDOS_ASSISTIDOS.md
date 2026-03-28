# Etapa 4B — Idempotência operacional dos comandos assistidos

## Objetivo

Tornar previsível a reexecução de comandos assistidos (`deliver_missing_assisted` e `reconcile_state`) diante de:

- duplo clique;
- retry HTTP;
- rerun de script;
- repetição operacional acidental.

Sem alterar:

- regra canônica de cálculo;
- concessão atômica (`grantInvitationBonusSlotAtomic`);
- separação entre `automatico`, `operacional`, `assistido`.

---

## Mudanças implementadas

## 1) Campo de idempotência no contexto operacional

Comandos assistidos agora exigem:

- `operational_context.idempotency_key`

Nos controllers assistidos:

- `reason` obrigatório (já da 4A)
- `idempotency_key` obrigatório (mín. 8 chars)

---

## 2) Política de replay (mesma chave + mesmo escopo)

Escopo de consulta:

- `command_type`
- `mode`
- `event_id`
- `leader_id` (nullable)
- `commission_id` (nullable)
- `idempotency_key`

Comportamento:

1. Se último registro está `started`:
   - não reexecuta;
   - retorna `executed=false`, `detail=command_in_progress`.

2. Se último registro está `succeeded`:
   - não reexecuta;
   - retorna `executed=false`, `detail=command_already_processed`.

3. Se último registro está `failed`:
   - retry permitido com a **mesma chave**;
   - comando é executado novamente;
   - retorno padrão com `executed=true`;
   - logs marcam `replay_status=retried_after_failure`.

---

## 3) Persistência e índice (auditoria)

Migração aditiva:

- `backend/migrations/104_add_idempotency_to_invitation_bonus_assisted_audit.sql`

Inclui:

- coluna `idempotency_key` em `invitation_bonus_assisted_command_audit`;
- índice para lookup de replay/idempotência.

---

## 4) Logs estruturados complementares

`event=invitation_bonus_domain_command` agora pode incluir:

- `idempotency_key`
- `replay_status` (`none` | `in_progress` | `already_processed` | `retried_after_failure`)

Fases mantidas:

- `start`
- `error`
- `end`

---

## 5) Compatibilidade

- sem quebra do retorno padrão do orquestrador (`operation/mode/executed/detail/...`);
- sem quebra da trilha de auditoria da 4A;
- sem alteração da telemetria existente (`invitation_bonus_trigger`).

---

## 6) Riscos remanescentes

1. Idempotência assistida é baseada em consulta + política de estado, mas ainda sem lock distribuído.
2. Em multi-instância, duas requisições com a mesma chave podem competir em janelas extremas.
3. Mitigação definitiva fica para etapa futura (lock distribuído / estratégia transacional mais forte).

