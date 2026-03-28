# Etapa 7 — Sinais operacionais, alertas leves e ergonomia de suporte (comandos assistidos)

## Objetivos

- Facilitar **detecção** e **entendimento** de incidentes em `deliver_missing_assisted` e `reconcile_state`.
- Oferecer **visão consolidada** por janela temporal e **sinais** comparativos (janela atual vs. anterior).
- Enriquecer **contexto** em stucks e em auditoria individual (idempotência, resoluções, hints).
- Manter **compatibilidade** com Etapas 4A–6; **sem** auto-retry, auto-fail ou mudança da regra canônica.

## Sinais operacionais implementados

Cada sinal gera um log JSON com `event: invitation_bonus_assisted_signal`, `phase: emit`, `signal_type`, `severity`, `value`, `threshold`, `detail`, `window_hours`.

| Tipo | Descrição |
|------|-----------|
| `stuck_above_threshold` | `stuck_count_now` ≥ `INVITE_BONUS_ASSISTED_STUCK_ALERT_MIN` (padrão 1). |
| `failed_volume_high` | `failed` na janela (por `created_at`) ≥ `INVITE_BONUS_ASSISTED_FAILED_ABSOLUTE_ALERT_MIN` (padrão 12). |
| `failed_spike_vs_previous_window` | Falhas na janela atual ≥ `ratio` × janela anterior e ≥ `INVITE_BONUS_ASSISTED_FAILED_SPIKE_MIN` (padrão 3). |
| `admin_resolution_volume_high` | Resoluções admin na janela ≥ `INVITE_BONUS_ASSISTED_RESOLUTION_ALERT_MIN` (padrão 8). |
| `idempotency_contention_or_retries` | Grupos com 2+ linhas na janela ≥ `INVITE_BONUS_ASSISTED_IDEMPOTENCY_GROUPS_ALERT_MIN` (padrão 2). |
| `in_flight_started_volume_high` | Linhas `started` criadas na janela ≥ `INVITE_BONUS_ASSISTED_IN_FLIGHT_STARTED_ALERT_MIN` (padrão 25) — *proxy* para pressão / repetição de tentativas (inclui interpretação próxima de `command_in_progress` no tráfego). |

**Variáveis de ambiente (opcionais)**

| Variável | Padrão | Função |
|----------|--------|--------|
| `INVITE_BONUS_ASSISTED_STUCK_ALERT_MIN` | 1 | Mínimo de stucks globais para alertar. |
| `INVITE_BONUS_ASSISTED_FAILED_ABSOLUTE_ALERT_MIN` | 12 | Volume absoluto de falhas na janela. |
| `INVITE_BONUS_ASSISTED_FAILED_SPIKE_RATIO` | 2 | Multiplicador vs. janela anterior. |
| `INVITE_BONUS_ASSISTED_FAILED_SPIKE_MIN` | 3 | Mínimo de falhas para considerar spike. |
| `INVITE_BONUS_ASSISTED_RESOLUTION_ALERT_MIN` | 8 | Resoluções admin (`mark_stuck_as_failed`) na janela. |
| `INVITE_BONUS_ASSISTED_IDEMPOTENCY_GROUPS_ALERT_MIN` | 2 | Grupos de idempotência com ≥2 linhas na janela. |
| `INVITE_BONUS_ASSISTED_IN_FLIGHT_STARTED_ALERT_MIN` | 25 | Linhas `started` criadas na janela. |
| `INVITE_BONUS_ASSISTED_SIGNALS_WEBHOOK_URL` | — | POST JSON opcional quando há sinais e `emit_webhook=true`. |

**Webhook:** falhas de rede não quebram a resposta HTTP; erros são logados com `event: invitation_bonus_assisted_signal`, `phase: webhook_error`.

## Visão consolidada (support snapshot)

`GET /api/admin/invitation-bonus/assisted-audits/support-snapshot?hours=24`

Retorno inclui:

- `counts_by_command_type`, `counts_by_status`
- `avg_duration_ms_completed`, `completed_count_for_avg`
- `stuck_count_now`, `stuck_threshold_minutes` (Etapa 5/6)
- `admin_resolutions_in_window`
- `audit_rows_in_window`
- `duplicate_idempotency_groups_in_window` (grupos com ≥2 linhas com `created_at` na janela)

## Sinais (relatório)

`GET /api/admin/invitation-bonus/assisted-audits/signals?hours=24&emit_logs=true&emit_webhook=false`

- `current` / `previous`: snapshots da janela atual e da janela **imediatamente anterior** (mesma duração).
- `signals`: lista avaliada conforme tabela acima.

## Mais contexto para stuck e auditoria

### Stuck enriquecido

`GET /api/admin/invitation-bonus/assisted-audits/stuck?minutes=30&enriched=true`

Campos extras por linha:

- `idempotency_attempt_count` — total de linhas no mesmo escopo de idempotência (Etapa 4B).
- `resolution_count_for_audit` — resoluções admin ligadas a essa linha.

### Detalhe de uma auditoria

`GET /api/admin/invitation-bonus/assisted-audits/:auditId/detail`

Inclui:

- `audit` completa
- `idempotency_group.attempts` — histórico ordenado (retries / tentativas anteriores)
- `resolutions` — linhas em `invitation_bonus_assisted_audit_resolution`
- `hints.has_prior_failed_retry`, `hints.has_duplicate_attempts`

## Logs estruturados (novos)

| Event | Uso |
|-------|-----|
| `invitation_bonus_assisted_signal` | Cada sinal emitido; opcional `webhook_error`. |
| `invitation_bonus_assisted_support` | Consultas de suporte: `support_snapshot`, `signals_report`, `audit_detail`. |

Eventos anteriores **inalterados**: `invitation_bonus_trigger`, `invitation_bonus_domain_command`, `invitation_bonus_assisted_operational`.

## Endpoints novos / alterados

| Método | Rota | Notas |
|--------|------|--------|
| `GET` | `/api/admin/invitation-bonus/assisted-audits/support-snapshot` | Visão consolidada. |
| `GET` | `/api/admin/invitation-bonus/assisted-audits/signals` | Relatório + sinais. |
| `GET` | `/api/admin/invitation-bonus/assisted-audits/:auditId/detail` | Detalhe + contexto. |
| `GET` | `/api/admin/invitation-bonus/assisted-audits/stuck` | Query `enriched=true` (Etapa 7). |

## Exemplos de troubleshooting

1. **Muitos stucks:** `support-snapshot` → `stuck_count_now`; depois `stuck?enriched=true` para ver `idempotency_attempt_count` e idade.
2. **Pico de falhas:** `signals` com `failed_spike_vs_previous_window` ou `failed_volume_high`; correlacionar com `GET .../detail` nos `audit_id` da lista filtrada por `status=failed`.
3. **Mesma idempotência repetida:** `duplicate_idempotency_groups_in_window` alto ou detalhe com `has_duplicate_attempts`.
4. **Volume de resoluções admin:** `admin_resolution_volume_high` — revisar processo operacional, não automação.

## Riscos remanescentes

- Sinais são **heurísticas**; falsos positivos em horários de pico ou após deploy.
- `started` na janela inclui comandos ainda saudáveis em execução.
- Webhook opcional não garante entrega; não substitui monitoramento externo.

## O que fica para etapa futura

- UI dedicada e alertas agendados (cron).
- Integração com Slack/PagerDuty além de URL genérica.
- Correlação automática com logs `invitation_bonus_domain_command` (correlation_id) em ferramenta de APM.
