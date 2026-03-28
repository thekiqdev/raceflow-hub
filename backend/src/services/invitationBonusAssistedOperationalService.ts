/**
 * Etapa 6 — observabilidade e tratamento controlado de comandos assistidos (auditoria).
 * Somente leitura + fluxo administrativo explícito; não altera regra canônica nem concessão atômica.
 */
import { query, getClient } from '../config/database.js';

export const DEFAULT_STUCK_MINUTES = 30;

export function getStuckThresholdMinutes(): number {
  const raw = process.env.INVITE_BONUS_ASSISTED_STUCK_MINUTES;
  if (!raw?.trim()) return DEFAULT_STUCK_MINUTES;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 24 * 60) return DEFAULT_STUCK_MINUTES;
  return n;
}

export interface AssistedAuditListFilters {
  command_type?: string;
  status?: 'started' | 'succeeded' | 'failed';
  actor_email?: string;
  event_id?: string;
  leader_id?: string;
  created_from?: string;
  created_to?: string;
  limit?: number;
  offset?: number;
}

export interface AssistedAuditListRow {
  id: string;
  command_type: string;
  mode: string;
  actor_id: string;
  actor_email: string;
  reason: string;
  source: string;
  correlation_id: string | null;
  leader_id: string | null;
  event_id: string;
  commission_id: string | null;
  status: string;
  detail: string | null;
  idempotency_key: string | null;
  distributed_lock_key: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface AssistedAuditSummary {
  started: number;
  succeeded: number;
  failed: number;
}

export interface StuckAssistedAuditRow extends AssistedAuditListRow {
  age_seconds: number;
  stuck_threshold_minutes_applied: number;
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

export async function listAssistedCommandAudits(
  filters: AssistedAuditListFilters
): Promise<{ rows: AssistedAuditListRow[]; total: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];
  let p = 1;

  if (filters.command_type?.trim()) {
    conditions.push(`command_type = $${p++}`);
    params.push(filters.command_type.trim());
  }
  if (filters.status) {
    conditions.push(`status = $${p++}`);
    params.push(filters.status);
  }
  if (filters.actor_email?.trim()) {
    conditions.push(`actor_email ILIKE $${p++}`);
    params.push(`%${filters.actor_email.trim()}%`);
  }
  if (filters.event_id?.trim()) {
    conditions.push(`event_id = $${p++}::uuid`);
    params.push(filters.event_id.trim());
  }
  if (filters.leader_id?.trim()) {
    conditions.push(`leader_id = $${p++}::uuid`);
    params.push(filters.leader_id.trim());
  }
  if (filters.created_from?.trim()) {
    conditions.push(`created_at >= $${p++}::timestamptz`);
    params.push(filters.created_from.trim());
  }
  if (filters.created_to?.trim()) {
    conditions.push(`created_at <= $${p++}::timestamptz`);
    params.push(filters.created_to.trim());
  }

  const whereSql = conditions.join(' AND ');

  const countRes = await query(`SELECT COUNT(*)::text AS c FROM invitation_bonus_assisted_command_audit WHERE ${whereSql}`, params);
  const total = parseInt(String(countRes.rows[0]?.c ?? '0'), 10) || 0;

  params.push(limit, offset);
  const limIdx = p++;
  const offIdx = p++;
  const dataRes = await query(
    `SELECT id, command_type, mode, actor_id, actor_email, reason, source, correlation_id,
            leader_id, event_id, commission_id, status, detail, idempotency_key, distributed_lock_key,
            created_at, updated_at, finished_at
     FROM invitation_bonus_assisted_command_audit
     WHERE ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    params
  );

  const rows = (dataRes.rows as Record<string, unknown>[]).map(rowToListRow);
  return { rows, total };
}

export async function getAssistedCommandAuditSummary(): Promise<AssistedAuditSummary> {
  const res = await query(
    `SELECT status, COUNT(*)::int AS c
     FROM invitation_bonus_assisted_command_audit
     GROUP BY status`
  );
  const out: AssistedAuditSummary = { started: 0, succeeded: 0, failed: 0 };
  for (const row of res.rows as { status: string; c: number }[]) {
    if (row.status === 'started') out.started = row.c;
    else if (row.status === 'succeeded') out.succeeded = row.c;
    else if (row.status === 'failed') out.failed = row.c;
  }
  return out;
}

export async function listPotentiallyStuckAssistedAudits(
  olderThanMinutes?: number
): Promise<StuckAssistedAuditRow[]> {
  const minutes = olderThanMinutes ?? getStuckThresholdMinutes();
  const res = await query(
    `SELECT id, command_type, mode, actor_id, actor_email, reason, source, correlation_id,
            leader_id, event_id, commission_id, status, detail, idempotency_key, distributed_lock_key,
            created_at, updated_at, finished_at,
            EXTRACT(EPOCH FROM (NOW() - created_at))::bigint AS age_seconds
     FROM invitation_bonus_assisted_command_audit
     WHERE status = 'started'
       AND finished_at IS NULL
       AND created_at < NOW() - ($1::int * INTERVAL '1 minute')
     ORDER BY created_at ASC`,
    [minutes]
  );

  return (res.rows as Record<string, unknown>[]).map((r) => {
    const base = rowToListRow(r);
    return {
      ...base,
      age_seconds: Number(r.age_seconds ?? 0),
      stuck_threshold_minutes_applied: minutes,
    };
  });
}

export type MarkStuckFailedResult =
  | { ok: true; audit_id: string; resolution_id: string }
  | { ok: false; code: 'not_found' | 'not_stuck' };

/**
 * Marca um comando assistido preso (`started` sem `finished_at`) como `failed`, com trilha em
 * `invitation_bonus_assisted_audit_resolution`. Exige linha ainda elegível no momento do UPDATE.
 */
export async function markStuckAssistedAuditAsFailed(params: {
  auditId: string;
  reason: string;
  performedByUserId: string;
  performedByEmail: string;
}): Promise<MarkStuckFailedResult> {
  const reason = params.reason.trim();
  const performedAt = new Date().toISOString();
  const resolutionPayload = {
    admin_resolution: {
      action: 'mark_stuck_as_failed',
      reason,
      performed_by_user_id: params.performedByUserId,
      performed_by_email: params.performedByEmail,
      performed_at: performedAt,
    },
  };

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const upd = await client.query<{ id: string }>(
      `UPDATE invitation_bonus_assisted_command_audit
       SET status = 'failed',
           finished_at = NOW(),
           updated_at = NOW(),
           detail = $2,
           result = COALESCE(result, '{}'::jsonb) || $3::jsonb
       WHERE id = $1::uuid
         AND status = 'started'
         AND finished_at IS NULL
       RETURNING id::text AS id`,
      [
        params.auditId,
        `Stuck command closed as failed (admin). Reason: ${reason.slice(0, 500)}`,
        JSON.stringify(resolutionPayload),
      ]
    );

    if (upd.rows.length === 0) {
      const exists = await client.query(`SELECT id FROM invitation_bonus_assisted_command_audit WHERE id = $1::uuid`, [
        params.auditId,
      ]);
      await client.query('ROLLBACK');
      if (exists.rows.length === 0) return { ok: false, code: 'not_found' };
      return { ok: false, code: 'not_stuck' };
    }

    const ins = await client.query<{ id: string }>(
      `INSERT INTO invitation_bonus_assisted_audit_resolution (
        original_audit_id, action, performed_by_user_id, performed_by_email, reason
      ) VALUES ($1::uuid, 'mark_stuck_as_failed', $2::uuid, $3, $4)
      RETURNING id::text AS id`,
      [params.auditId, params.performedByUserId, params.performedByEmail, reason]
    );

    await client.query('COMMIT');
    return {
      ok: true,
      audit_id: upd.rows[0]!.id,
      resolution_id: ins.rows[0]!.id,
    };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}
