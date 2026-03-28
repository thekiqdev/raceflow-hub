# Etapa 6 — Observabilidade operacional e tratamento seguro de comandos assistidos interrompidos

## Objetivo

Melhorar a operação real dos comandos assistidos (`deliver_missing_assisted`, `reconcile_state`) com:

1. **Observabilidade** — listagens e resumos para suporte e auditoria.
2. **Diagnóstico** — identificação de comandos potencialmente **presos** (`started` sem `finished_at`).
3. **Tratamento controlado** — encerramento administrativo auditado (marcar preso como `failed`), sem automação agressiva de recovery.

Esta etapa **não** altera regra canônica, **não** altera `grantInvitationBonusSlotAtomic`, **não** transforma assistido em automático e **mantém** idempotência/replay das Etapas 4B e 5.

## Estratégia de observabilidade

| Recurso | Descrição |
|--------|-----------|
| Resumo por status | Contagem global: `started`, `succeeded`, `failed`. |
| Lista paginada | Filtros opcionais + ordenação por `created_at DESC`. |
| Duração | `duration_ms` = `finished_at - created_at` quando ambos existem. |
| Lista de presos | `status = started`, `finished_at IS NULL`, idade &gt; N minutos (configurável). |

### Endpoints (admin)

Base: `/api/admin` (middleware `authenticate` + `requireRole('admin')`).

| Método | Caminho | Uso |
|--------|---------|-----|
| `GET` | `/invitation-bonus/assisted-audits/summary` | Resumo por status. |
| `GET` | `/invitation-bonus/assisted-audits` | Lista com filtros (query string). |
| `GET` | `/invitation-bonus/assisted-audits/stuck` | Candidatos a presos; query `minutes` opcional (1–1440). |
| `POST` | `/invitation-bonus/assisted-audits/:auditId/mark-stuck-failed` | Marca preso como `failed` (corpo JSON com `reason` ≥ 8 caracteres). |

#### Filtros da lista (`GET .../assisted-audits`)

- `command_type` — texto exato.
- `status` — `started` \| `succeeded` \| `failed`.
- `actor_email` — `ILIKE` parcial (`%valor%`).
- `event_id`, `leader_id` — UUID.
- `created_from`, `created_to` — ISO timestamptz.
- `limit` — padrão 50, máximo 200.
- `offset` — paginação.

## Critérios para comandos potencialmente órfãos / presos

Considera-se **candidato a preso** uma linha em `invitation_bonus_assisted_command_audit` que satisfaz:

1. `status = 'started'`
2. `finished_at IS NULL`
3. `created_at < NOW() - (N minutes)` — **N** = parâmetro `minutes` no endpoint `stuck`, ou valor padrão da variável de ambiente abaixo.

### Limiar padrão (configurável)

- Variável: `INVITE_BONUS_ASSISTED_STUCK_MINUTES`
- Padrão: **30** minutos (se ausente ou inválido).
- Intervalo aceito ao interpretar env: **1** a **1440** (24 h).

**Importante:** presença na lista **não** prova falha de negócio; pode ser processo lento ou fila. A decisão de encerrar é **sempre** humana via endpoint administrativo.

## Fluxo seguro de tratamento (marcar como `failed`)

1. Operador autenticado como **admin** chama `POST .../mark-stuck-failed` com `reason` obrigatório (≥ 8 caracteres).
2. Transação:
   - `UPDATE` da linha de auditoria original **somente se** ainda `started` e `finished_at IS NULL` (evita corrida com conclusão legítima).
   - `INSERT` em `invitation_bonus_assisted_audit_resolution` com vínculo `original_audit_id`, `action = mark_stuck_as_failed`, executor e motivo.
3. O campo `result` (JSONB) da auditoria original recebe merge com `admin_resolution` (quem, quando, motivo).
4. `detail` é atualizado com texto operacional resumido.

Códigos de erro HTTP:

- **404** — auditoria inexistente.
- **409** — não está em estado elegível (já finalizado ou não preso).

## Logs estruturados

Novo evento (não substitui os existentes):

- `event`: `invitation_bonus_assisted_operational`
- `phase`: `start` \| `end` \| `error`
- `op`: `list_audits` \| `audit_summary` \| `list_stuck` \| `mark_stuck_failed`
- Campos opcionais: `audit_id`, `correlation_id`, `performed_by_user_id`, `detail`, `message`

Eventos **inalterados**: `invitation_bonus_trigger`, `invitation_bonus_domain_command`.

## Queries úteis (SQL)

```sql
-- Resumo rápido por status
SELECT status, COUNT(*) FROM invitation_bonus_assisted_command_audit GROUP BY status;

-- Presos com limiar manual (ex.: 45 minutos)
SELECT id, command_type, event_id, created_at,
       EXTRACT(EPOCH FROM (NOW() - created_at))/60 AS age_minutes
FROM invitation_bonus_assisted_command_audit
WHERE status = 'started' AND finished_at IS NULL
  AND created_at < NOW() - interval '45 minutes'
ORDER BY created_at;

-- Resoluções administrativas recentes
SELECT r.*, a.command_type, a.event_id
FROM invitation_bonus_assisted_audit_resolution r
JOIN invitation_bonus_assisted_command_audit a ON a.id = r.original_audit_id
ORDER BY r.created_at DESC
LIMIT 50;
```

## Migração

- `106_invitation_bonus_assisted_audit_resolution.sql` — tabela de resoluções vinculada à auditoria original.

## Riscos remanescentes

- **Falso positivo em “preso”:** comando legítimo ainda em execução longa.
- **Marcação manual incorreta:** mitigada por motivo obrigatório, papel admin e linha em `invitation_bonus_assisted_audit_resolution`.
- **Multi-instância:** a Etapa 5 já reduz corridas na concessão; este fluxo trata **linha de auditoria** presa após falha de processo.

## O que fica para etapa futura

- Jobs automáticos de alerta (Slack/e-mail) com base na lista `stuck`.
- UI dedicada no painel admin.
- Política de “reabrir” ou “reconciliar” automaticamente após timeout (somente com requisitos de produto explícitos).

## Rollout

1. Aplicar migração `106_invitation_bonus_assisted_audit_resolution.sql`.
2. Definir `INVITE_BONUS_ASSISTED_STUCK_MINUTES` em produção se o padrão 30 não for adequado.
3. Treinar operadores no uso de `mark-stuck-failed` e na leitura dos logs `invitation_bonus_assisted_operational`.
