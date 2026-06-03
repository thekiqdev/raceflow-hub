import { query } from '../config/database.js';

type RunParams = {
  eventId?: string;
};

type KitUsageRow = {
  kit_id: string;
  kit_name: string | null;
  event_id: string;
  registration_count: number;
  paid_count: number;
  invited_count: number;
  deleted_at: string | null;
};

type AuditResult = {
  mode: 'read_only_kit_usage_audit';
  eventId: string | null;
  totals: {
    kits_total: number;
    kits_with_registrations: number;
    kits_without_registrations: number;
    kits_soft_deleted: number;
    soft_deleted_with_registrations: number;
    orphan_registration_kit_refs: number;
  };
  kits_with_registrations: KitUsageRow[];
  kits_without_registrations_sample: Array<{
    kit_id: string;
    kit_name: string | null;
    event_id: string;
    deleted_at: string | null;
  }>;
  orphan_registration_kit_refs_sample: Array<{
    registration_id: string;
    event_id: string;
    kit_id: string;
  }>;
  safety: {
    read_only: true;
    inserts: false;
    updates: false;
    deletes: false;
  };
  logs: string[];
};

const createStructuredLogger = () => {
  const logs: string[] = [];
  return {
    logs,
    log: (message: string) => {
      logs.push(`[${new Date().toISOString()}] ${message}`);
    },
  };
};

const columnExists = async (tableName: string, columnName: string): Promise<boolean> => {
  const result = await query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1`,
    [tableName, columnName]
  );
  return (result.rowCount ?? 0) > 0;
};

export default async function run(params: RunParams = {}): Promise<AuditResult> {
  const { log, logs } = createStructuredLogger();
  const eventId = params.eventId?.trim() || null;
  const hasDeletedAt = await columnExists('event_kits', 'deleted_at');
  const eventFilter = eventId ? 'WHERE ek.event_id = $1' : '';
  const registrationEventFilter = eventId ? 'AND r.event_id = $1' : '';
  const queryParams = eventId ? [eventId] : [];
  const deletedAtSelect = hasDeletedAt ? 'ek.deleted_at' : 'NULL::timestamptz AS deleted_at';
  const deletedAtCondition = hasDeletedAt ? 'ek.deleted_at IS NOT NULL' : 'false';

  log(`Iniciando auditoria read-only de kits${eventId ? ` para evento ${eventId}` : ''}`);
  log('Nenhum kit será removido, restaurado ou alterado.');

  const [kitUsageResult, totalsResult, unusedResult, orphanResult] = await Promise.all([
    query(
      `SELECT
          ek.id::text AS kit_id,
          ek.name AS kit_name,
          ek.event_id::text AS event_id,
          ${deletedAtSelect},
          COUNT(r.id)::int AS registration_count,
          COUNT(*) FILTER (WHERE r.payment_status = 'paid')::int AS paid_count,
          COUNT(*) FILTER (WHERE r.payment_status = 'convidado' OR r.payment_method = 'free_bonus')::int AS invited_count
         FROM event_kits ek
         LEFT JOIN registrations r ON r.kit_id = ek.id
        ${eventFilter}
        GROUP BY ek.id
       HAVING COUNT(r.id) > 0
        ORDER BY COUNT(r.id) DESC, ek.name ASC
        LIMIT 500`,
      queryParams
    ),
    query(
      `SELECT
          COUNT(*)::int AS kits_total,
          COUNT(*) FILTER (
            WHERE EXISTS (SELECT 1 FROM registrations r WHERE r.kit_id = ek.id)
          )::int AS kits_with_registrations,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (SELECT 1 FROM registrations r WHERE r.kit_id = ek.id)
          )::int AS kits_without_registrations,
          COUNT(*) FILTER (WHERE ${deletedAtCondition})::int AS kits_soft_deleted,
          COUNT(*) FILTER (
            WHERE ${deletedAtCondition}
              AND EXISTS (SELECT 1 FROM registrations r WHERE r.kit_id = ek.id)
          )::int AS soft_deleted_with_registrations
         FROM event_kits ek
        ${eventFilter}`,
      queryParams
    ),
    query(
      `SELECT
          ek.id::text AS kit_id,
          ek.name AS kit_name,
          ek.event_id::text AS event_id,
          ${deletedAtSelect}
         FROM event_kits ek
        ${eventFilter}
          ${eventFilter ? 'AND' : 'WHERE'} NOT EXISTS (SELECT 1 FROM registrations r WHERE r.kit_id = ek.id)
        ORDER BY ek.created_at DESC
        LIMIT 50`,
      queryParams
    ),
    query(
      `SELECT
          r.id::text AS registration_id,
          r.event_id::text AS event_id,
          r.kit_id::text AS kit_id
         FROM registrations r
         LEFT JOIN event_kits ek ON ek.id = r.kit_id
        WHERE r.kit_id IS NOT NULL
          AND ek.id IS NULL
          ${registrationEventFilter}
        ORDER BY r.created_at DESC
        LIMIT 50`,
      queryParams
    ),
  ]);

  const orphanCountResult = await query(
    `SELECT COUNT(*)::int AS count
       FROM registrations r
       LEFT JOIN event_kits ek ON ek.id = r.kit_id
      WHERE r.kit_id IS NOT NULL
        AND ek.id IS NULL
        ${registrationEventFilter}`,
    queryParams
  );

  const totalsRow = totalsResult.rows[0] ?? {};
  const totals = {
    kits_total: Number(totalsRow.kits_total ?? 0) || 0,
    kits_with_registrations: Number(totalsRow.kits_with_registrations ?? 0) || 0,
    kits_without_registrations: Number(totalsRow.kits_without_registrations ?? 0) || 0,
    kits_soft_deleted: Number(totalsRow.kits_soft_deleted ?? 0) || 0,
    soft_deleted_with_registrations: Number(totalsRow.soft_deleted_with_registrations ?? 0) || 0,
    orphan_registration_kit_refs: Number(orphanCountResult.rows[0]?.count ?? 0) || 0,
  };

  log(`Kits totais: ${totals.kits_total}`);
  log(`Kits com inscrições: ${totals.kits_with_registrations}`);
  log(`Kits sem uso: ${totals.kits_without_registrations}`);
  log(`Kits soft deletados: ${totals.kits_soft_deleted}`);
  log(`Inscrições com kit_id órfão: ${totals.orphan_registration_kit_refs}`);

  return {
    mode: 'read_only_kit_usage_audit',
    eventId,
    totals,
    kits_with_registrations: kitUsageResult.rows.map((row) => ({
      kit_id: String(row.kit_id),
      kit_name: row.kit_name ?? null,
      event_id: String(row.event_id),
      registration_count: Number(row.registration_count ?? 0) || 0,
      paid_count: Number(row.paid_count ?? 0) || 0,
      invited_count: Number(row.invited_count ?? 0) || 0,
      deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    })),
    kits_without_registrations_sample: unusedResult.rows.map((row) => ({
      kit_id: String(row.kit_id),
      kit_name: row.kit_name ?? null,
      event_id: String(row.event_id),
      deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    })),
    orphan_registration_kit_refs_sample: orphanResult.rows.map((row) => ({
      registration_id: String(row.registration_id),
      event_id: String(row.event_id),
      kit_id: String(row.kit_id),
    })),
    safety: {
      read_only: true,
      inserts: false,
      updates: false,
      deletes: false,
    },
    logs,
  };
}
