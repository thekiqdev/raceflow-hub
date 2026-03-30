/**
 * Etapa 7 — visão consolidada para suporte, contexto de stuck e histórico por idempotência.
 * Somente leitura; não altera domínio canônico.
 */
import axios from 'axios';
import { query } from '../config/database.js';
import {
  getStuckThresholdMinutes,
  type AssistedAuditListRow,
  type StuckAssistedAuditRow,
} from './invitationBonusAssistedOperationalService.js';

export interface SupportTimeWindow {
  from: string;
  to: string;
  hours_applied: number;
}

export interface CountsByCommandType {
  deliver_missing_assisted: number;
  reconcile_state: number;
}

export interface CountsByStatus {
  started: number;
  succeeded: number;
  failed: number;
}

export interface SupportConsolidatedSnapshot {
  window: SupportTimeWindow;
  counts_by_command_type: CountsByCommandType;
  counts_by_status: CountsByStatus;
  /** Média de duração (ms) apenas para linhas com finished_at no período de criação da linha (created_at na janela). */
  avg_duration_ms_completed: number | null;
  /** Linhas com created_at na janela e status final com finished_at. */
  completed_count_for_avg: number;
  /** Presos atuais (estado global): started + sem finished_at + idade > limiar. */
  stuck_count_now: number;
  stuck_threshold_minutes: number;
  /** Resoluções administrativas registradas na janela (tabela Etapa 6). */
  admin_resolutions_in_window: number;
  /** Linhas de auditoria na janela (created_at). */
  audit_rows_in_window: number;
  /** Grupos de idempotência com 2+ linhas criadas na janela (possível contenção / retries). */
  duplicate_idempotency_groups_in_window: number;
}

export interface IdempotencySiblingRow extends AssistedAuditListRow {
  /** Ordem cronológica no grupo (1 = mais antigo). */
  attempt_index: number;
}

export interface AssistedAuditDetail {
  audit: AssistedAuditListRow;
  idempotency_group: {
    key_scope: {
      command_type: string;
      event_id: string;
      leader_id: string | null;
      commission_id: string | null;
      idempotency_key: string | null;
    };
    total_attempts: number;
    attempts: IdempotencySiblingRow[];
  };
  resolutions: Array<{
    id: string;
    action: string;
    performed_by_user_id: string;
    performed_by_email: string;
    reason: string;
    created_at: string;
  }>;
  /** Indicadores derivados para suporte. */
  hints: {
    has_prior_failed_retry: boolean;
    has_duplicate_attempts: boolean;
  };
}

function rowToListRow(r: Record<string, unknown>): AssistedAuditListRow {
  const createdAt = new Date(String(r.created_at)).getTime();
  const finishedAt = r.finished_at ? new Date(String(r.finished_at)).getTime() : null;
  const durationMs =
    finishedAt !== null && Number.isFinite(createdAt) ? Math.max(0, finishedAt - createdAt) : null;
  return {
    id: String(r.id),
    command_type: String(r.command_type),
    mode: String(r.mode),
    actor_id: String(r.actor_id),
    actor_email: String(r.actor_email),
    reason: String(r.reason),
    source: String(r.source),
    correlation_id: r.correlation_id != null ? String(r.correlation_id) : null,
    leader_id: r.leader_id != null ? String(r.leader_id) : null,
    event_id: String(r.event_id),
    commission_id: r.commission_id != null ? String(r.commission_id) : null,
    status: String(r.status),
    detail: r.detail != null ? String(r.detail) : null,
    idempotency_key: r.idempotency_key != null ? String(r.idempotency_key) : null,
    distributed_lock_key: r.distributed_lock_key != null ? String(r.distributed_lock_key) : null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    finished_at: r.finished_at != null ? String(r.finished_at) : null,
    duration_ms: durationMs,
  };
}

function parseWindow(hours: number): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
  return { from, to };
}

async function buildSupportSnapshotForRange(
  fromIso: string,
  toIso: string,
  hoursApplied: number
): Promise<SupportConsolidatedSnapshot> {
  const stuckMinutes = getStuckThresholdMinutes();

  const byType = await query(
    `SELECT command_type, COUNT(*)::int AS c
     FROM invitation_bonus_assisted_command_audit
     WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
     GROUP BY command_type`,
    [fromIso, toIso]
  );
  const counts_by_command_type: CountsByCommandType = {
    deliver_missing_assisted: 0,
    reconcile_state: 0,
  };
  for (const row of byType.rows as { command_type: string; c: number }[]) {
    if (row.command_type === 'deliver_missing_assisted') counts_by_command_type.deliver_missing_assisted = row.c;
    if (row.command_type === 'reconcile_state') counts_by_command_type.reconcile_state = row.c;
  }

  const byStatus = await query(
    `SELECT status, COUNT(*)::int AS c
     FROM invitation_bonus_assisted_command_audit
     WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
     GROUP BY status`,
    [fromIso, toIso]
  );
  const counts_by_status: CountsByStatus = { started: 0, succeeded: 0, failed: 0 };
  for (const row of byStatus.rows as { status: string; c: number }[]) {
    if (row.status === 'started') counts_by_status.started = row.c;
    if (row.status === 'succeeded') counts_by_status.succeeded = row.c;
    if (row.status === 'failed') counts_by_status.failed = row.c;
  }

  const avgRes = await query(
    `SELECT
       COUNT(*)::int AS n,
       AVG(EXTRACT(EPOCH FROM (finished_at - created_at)) * 1000)::double precision AS avg_ms
     FROM invitation_bonus_assisted_command_audit
     WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
       AND finished_at IS NOT NULL
       AND status IN ('succeeded', 'failed')`,
    [fromIso, toIso]
  );
  const avgRow = avgRes.rows[0] as { n: number; avg_ms: number | null } | undefined;
  const completed_count_for_avg = avgRow?.n ?? 0;
  const avg_duration_ms_completed =
    avgRow?.avg_ms != null && Number.isFinite(avgRow.avg_ms) ? Math.round(avgRow.avg_ms) : null;

  const stuckRes = await query(
    `SELECT COUNT(*)::int AS c
     FROM invitation_bonus_assisted_command_audit
     WHERE status = 'started'
       AND finished_at IS NULL
       AND created_at < NOW() - ($1::int * INTERVAL '1 minute')`,
    [stuckMinutes]
  );
  const stuck_count_now = (stuckRes.rows[0] as { c: number })?.c ?? 0;

  const resWindow = await query(
    `SELECT COUNT(*)::int AS c
     FROM invitation_bonus_assisted_audit_resolution
     WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz`,
    [fromIso, toIso]
  );
  const admin_resolutions_in_window = (resWindow.rows[0] as { c: number })?.c ?? 0;

  const auditRows = await query(
    `SELECT COUNT(*)::int AS c
     FROM invitation_bonus_assisted_command_audit
     WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz`,
    [fromIso, toIso]
  );
  const audit_rows_in_window = (auditRows.rows[0] as { c: number })?.c ?? 0;

  const dupRes = await query(
    `SELECT COUNT(*)::int AS c FROM (
       SELECT 1
       FROM invitation_bonus_assisted_command_audit
       WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
       GROUP BY command_type, mode, event_id, leader_id, commission_id, idempotency_key
       HAVING COUNT(*) >= 2
     ) sub`,
    [fromIso, toIso]
  );
  const duplicate_idempotency_groups_in_window = (dupRes.rows[0] as { c: number })?.c ?? 0;

  return {
    window: {
      from: fromIso,
      to: toIso,
      hours_applied: hoursApplied,
    },
    counts_by_command_type,
    counts_by_status,
    avg_duration_ms_completed,
    completed_count_for_avg,
    stuck_count_now,
    stuck_threshold_minutes: stuckMinutes,
    admin_resolutions_in_window,
    audit_rows_in_window,
    duplicate_idempotency_groups_in_window,
  };
}

export async function getSupportConsolidatedSnapshot(params: {
  hours: number;
}): Promise<SupportConsolidatedSnapshot> {
  const hours = Math.min(Math.max(params.hours, 1), 24 * 90);
  const { from, to } = parseWindow(hours);
  return buildSupportSnapshotForRange(from.toISOString(), to.toISOString(), hours);
}

/** Janela imediatamente anterior à última de `hours` (para comparar tendência). */
export async function getPreviousWindowSnapshot(hours: number): Promise<SupportConsolidatedSnapshot> {
  const h = Math.min(Math.max(hours, 1), 24 * 90);
  const to = new Date(Date.now() - h * 60 * 60 * 1000);
  const from = new Date(to.getTime() - h * 60 * 60 * 1000);
  return buildSupportSnapshotForRange(from.toISOString(), to.toISOString(), h);
}

export interface StuckEnrichedRow extends StuckAssistedAuditRow {
  idempotency_attempt_count: number;
  resolution_count_for_audit: number;
}

export async function listStuckAssistedAuditsEnriched(
  olderThanMinutes?: number
): Promise<StuckEnrichedRow[]> {
  const minutes = olderThanMinutes ?? getStuckThresholdMinutes();
  const res = await query(
    `SELECT a.id, a.command_type, a.mode, a.actor_id, a.actor_email, a.reason, a.source, a.correlation_id,
            a.leader_id, a.event_id, a.commission_id, a.status, a.detail, a.idempotency_key, a.distributed_lock_key,
            a.created_at, a.updated_at, a.finished_at,
            EXTRACT(EPOCH FROM (NOW() - a.created_at))::bigint AS age_seconds,
            (
              SELECT COUNT(*)::int FROM invitation_bonus_assisted_command_audit b
              WHERE b.command_type = a.command_type
                AND b.mode = a.mode
                AND b.event_id = a.event_id
                AND b.leader_id IS NOT DISTINCT FROM a.leader_id
                AND b.commission_id IS NOT DISTINCT FROM a.commission_id
                AND b.idempotency_key IS NOT DISTINCT FROM a.idempotency_key
            ) AS idempotency_attempt_count,
            (
              SELECT COUNT(*)::int FROM invitation_bonus_assisted_audit_resolution r
              WHERE r.original_audit_id = a.id
            ) AS resolution_count_for_audit
     FROM invitation_bonus_assisted_command_audit a
     WHERE a.status = 'started'
       AND a.finished_at IS NULL
       AND a.created_at < NOW() - ($1::int * INTERVAL '1 minute')
     ORDER BY a.created_at ASC`,
    [minutes]
  );

  return (res.rows as Record<string, unknown>[]).map((r) => {
    const base = rowToListRow(r);
    return {
      ...base,
      age_seconds: Number(r.age_seconds ?? 0),
      stuck_threshold_minutes_applied: minutes,
      idempotency_attempt_count: Number(r.idempotency_attempt_count ?? 0),
      resolution_count_for_audit: Number(r.resolution_count_for_audit ?? 0),
    };
  });
}

export async function getAssistedAuditDetail(auditId: string): Promise<AssistedAuditDetail | null> {
  const main = await query(
    `SELECT id, command_type, mode, actor_id, actor_email, reason, source, correlation_id,
            leader_id, event_id, commission_id, status, detail, idempotency_key, distributed_lock_key,
            created_at, updated_at, finished_at
     FROM invitation_bonus_assisted_command_audit WHERE id = $1::uuid`,
    [auditId]
  );
  if (!main.rows.length) return null;

  const audit = rowToListRow(main.rows[0] as Record<string, unknown>);
  const r = main.rows[0] as Record<string, unknown>;

  const siblings = await query(
    `SELECT id, command_type, mode, actor_id, actor_email, reason, source, correlation_id,
            leader_id, event_id, commission_id, status, detail, idempotency_key, distributed_lock_key,
            created_at, updated_at, finished_at
     FROM invitation_bonus_assisted_command_audit
     WHERE command_type = $1 AND mode = $2 AND event_id = $3::uuid
       AND leader_id IS NOT DISTINCT FROM $4::uuid
       AND commission_id IS NOT DISTINCT FROM $5::uuid
       AND idempotency_key IS NOT DISTINCT FROM $6
     ORDER BY created_at ASC`,
    [r.command_type, r.mode, r.event_id, r.leader_id ?? null, r.commission_id ?? null, r.idempotency_key ?? null]
  );

  const attempts: IdempotencySiblingRow[] = (siblings.rows as Record<string, unknown>[]).map((row, idx) => ({
    ...rowToListRow(row),
    attempt_index: idx + 1,
  }));

  const resolutions = await query(
    `SELECT id::text, action, performed_by_user_id::text, performed_by_email, reason, created_at
     FROM invitation_bonus_assisted_audit_resolution
     WHERE original_audit_id = $1::uuid
     ORDER BY created_at DESC`,
    [auditId]
  );

  const resRows = resolutions.rows as Array<{
    id: string;
    action: string;
    performed_by_user_id: string;
    performed_by_email: string;
    reason: string;
    created_at: Date;
  }>;

  const has_prior_failed_retry = attempts.some((a) => a.id !== audit.id && a.status === 'failed');
  const has_duplicate_attempts = attempts.length > 1;

  return {
    audit,
    idempotency_group: {
      key_scope: {
        command_type: String(r.command_type),
        event_id: String(r.event_id),
        leader_id: r.leader_id != null ? String(r.leader_id) : null,
        commission_id: r.commission_id != null ? String(r.commission_id) : null,
        idempotency_key: r.idempotency_key != null ? String(r.idempotency_key) : null,
      },
      total_attempts: attempts.length,
      attempts,
    },
    resolutions: resRows.map((x) => ({
      id: x.id,
      action: x.action,
      performed_by_user_id: x.performed_by_user_id,
      performed_by_email: x.performed_by_email,
      reason: x.reason,
      created_at: x.created_at instanceof Date ? x.created_at.toISOString() : String(x.created_at),
    })),
    hints: {
      has_prior_failed_retry: has_prior_failed_retry,
      has_duplicate_attempts: has_duplicate_attempts,
    },
  };
}

/** Webhook opcional: POST JSON silencioso (falhas não quebram o fluxo). */
export async function postSignalsWebhookOptional(payload: unknown): Promise<void> {
  const url = process.env.INVITE_BONUS_ASSISTED_SIGNALS_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    await axios.post(url, payload, {
      timeout: 8000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });
  } catch (e: any) {
    console.log(
      JSON.stringify({
        event: 'invitation_bonus_assisted_signal',
        phase: 'webhook_error',
        message: e?.message,
      })
    );
  }
}
