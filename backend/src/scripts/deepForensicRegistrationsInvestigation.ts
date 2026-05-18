import pg from 'pg';
import { query } from '../config/database.js';

const { Pool } = pg;

type RunParams = {
  eventId?: string;
};

type EventInfo = {
  id: string;
  name: string;
  created_at: string | null;
};

type SoftDeleteFinding = {
  columns_present: string[];
  deleted_at_count?: number;
  is_deleted_count?: number;
  inactive_count?: number;
  status_counts?: Array<{ status: string; total: number }>;
};

type RelatedTableFinding = {
  table: string;
  exists: boolean;
  total_rows: number;
  event_id_matches?: number;
  registration_id_matches_current_event?: number;
  orphan_registration_id_count?: number;
  soft_delete: SoftDeleteFinding;
  sample?: Array<Record<string, unknown>>;
};

type OrphanRecordFinding = {
  table: string;
  orphan_count: number;
  sample: Array<Record<string, unknown>>;
};

type FinancialRecordFinding = {
  table: string;
  exists: boolean;
  event_id_matches?: number;
  registration_id_matches_current_event?: number;
  orphan_registration_id_count?: number;
  sample?: Array<Record<string, unknown>>;
};

type TriggerFinding = {
  trigger_schema: string;
  trigger_name: string;
  event_manipulation: string;
  event_object_table: string;
  action_timing: string;
  action_statement: string;
};

type ForeignKeyFinding = {
  constraint_name: string;
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  delete_rule: string;
  update_rule: string;
};

type HiddenTableFinding = {
  table: string;
  total_rows: number;
  columns: string[];
};

type KitFinding = {
  table: string | null;
  current_total: number;
  current_soft_deleted: number;
  backup_total?: number;
  backup_missing_in_current?: number;
  backup_missing_ids_sample?: string[];
};

type DeepFindings = {
  registrations: RelatedTableFinding[];
  orphan_records: OrphanRecordFinding[];
  financial_records: FinancialRecordFinding[];
  triggers: TriggerFinding[];
  foreign_keys: ForeignKeyFinding[];
  hidden_tables: HiddenTableFinding[];
  kits: KitFinding;
};

type ProbableCause =
  | 'DELECAO_REAL'
  | 'SOFT_DELETE'
  | 'CASCADE_DELETE'
  | 'DADOS_ORFAOS'
  | 'INCONSISTENCIA_ESTRUTURAL'
  | 'EVENTO_RECRIADO'
  | 'SEM_ANOMALIA_FORTE';

type DeepForensicResult = {
  event: EventInfo;
  findings: DeepFindings;
  probable_cause: ProbableCause;
  recovery_recommendation: string;
};

const RELATED_TABLES = [
  'registrations',
  'registration_history',
  'registration_logs',
  'deleted_registrations',
  'registration_items',
  'registration_kits',
  'registration_payments',
  'registration_audit',
  'registration_transfers',
  'leader_invitations',
];

const FINANCIAL_TABLES = [
  'registration_payments',
  'payments',
  'payment_transactions',
  'transactions',
  'pix_payments',
  'asaas_payments',
  'asaas_webhook_events',
  'financial_transactions',
  'payment_logs',
  'invoices',
];

const SOFT_DELETE_COLUMNS = ['deleted_at', 'is_deleted', 'active', 'status'];

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const quoteIdentifier = (identifier: string): string => {
  return `"${identifier.replace(/"/g, '""')}"`;
};

const countOne = async (sql: string, params: unknown[] = []): Promise<number> => {
  const result = await query(sql, params);
  return toNumber(result.rows[0]?.count ?? result.rows[0]?.total ?? 0);
};

const tableExists = async (tableName: string): Promise<boolean> => {
  const result = await query(`SELECT to_regclass($1) AS table_name`, [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
};

const getTableColumns = async (tableName: string): Promise<string[]> => {
  const result = await query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position`,
    [tableName]
  );
  return result.rows.map((row) => String(row.column_name));
};

const columnExists = async (tableName: string, columnName: string): Promise<boolean> => {
  const columns = await getTableColumns(tableName);
  return columns.includes(columnName);
};

const resolveEventColumns = async () => {
  const hasNameColumn = await columnExists('events', 'name');
  const hasStartDateColumn = await columnExists('events', 'start_date');
  const hasCreatedAtColumn = await columnExists('events', 'created_at');
  return {
    nameExpression: hasNameColumn ? 'name' : 'title',
    dateExpression: hasStartDateColumn ? 'start_date' : 'event_date',
    createdAtExpression: hasCreatedAtColumn ? 'created_at' : 'NULL',
  };
};

const resolveEvent = async (eventId?: string): Promise<EventInfo> => {
  const { nameExpression, dateExpression, createdAtExpression } = await resolveEventColumns();
  const result = eventId
    ? await query(
        `SELECT id, ${nameExpression} AS name, ${createdAtExpression} AS created_at
           FROM events
          WHERE id = $1
          LIMIT 1`,
        [eventId]
      )
    : await query(
        `SELECT id, ${nameExpression} AS name, ${createdAtExpression} AS created_at
           FROM events
          ORDER BY ${dateExpression} DESC NULLS LAST
          LIMIT 1`
      );

  if (result.rows.length === 0) {
    throw new Error(eventId ? `Evento não encontrado: ${eventId}` : 'Nenhum evento encontrado');
  }

  return {
    id: String(result.rows[0].id),
    name: String(result.rows[0].name ?? ''),
    created_at: result.rows[0].created_at ? new Date(result.rows[0].created_at).toISOString() : null,
  };
};

const sampleRows = async (tableName: string, whereSql: string, params: unknown[]): Promise<Array<Record<string, unknown>>> => {
  const tableSql = quoteIdentifier(tableName);
  const result = await query(
    `SELECT to_jsonb(t) AS payload
       FROM ${tableSql} t
      ${whereSql}
      LIMIT 5`,
    params
  );
  return result.rows.map((row) => row.payload as Record<string, unknown>);
};

const getSoftDeleteFinding = async (tableName: string, columns: string[], eventId: string): Promise<SoftDeleteFinding> => {
  const tableSql = quoteIdentifier(tableName);
  const columnsPresent = SOFT_DELETE_COLUMNS.filter((column) => columns.includes(column));
  const eventFilter = columns.includes('event_id') ? 'WHERE event_id = $1' : '';
  const eventParams = columns.includes('event_id') ? [eventId] : [];

  const finding: SoftDeleteFinding = {
    columns_present: columnsPresent,
  };

  if (columns.includes('deleted_at')) {
    finding.deleted_at_count = await countOne(
      `SELECT COUNT(*)::int AS count
         FROM ${tableSql}
        ${eventFilter ? `${eventFilter} AND deleted_at IS NOT NULL` : 'WHERE deleted_at IS NOT NULL'}`,
      eventParams
    );
  }

  if (columns.includes('is_deleted')) {
    finding.is_deleted_count = await countOne(
      `SELECT COUNT(*)::int AS count
         FROM ${tableSql}
        ${eventFilter ? `${eventFilter} AND is_deleted IS TRUE` : 'WHERE is_deleted IS TRUE'}`,
      eventParams
    );
  }

  if (columns.includes('active')) {
    finding.inactive_count = await countOne(
      `SELECT COUNT(*)::int AS count
         FROM ${tableSql}
        ${eventFilter ? `${eventFilter} AND active IS FALSE` : 'WHERE active IS FALSE'}`,
      eventParams
    );
  }

  if (columns.includes('status')) {
    const result = await query(
      `SELECT status::text AS status, COUNT(*)::int AS total
         FROM ${tableSql}
        ${eventFilter}
        GROUP BY status
        ORDER BY COUNT(*) DESC
        LIMIT 20`,
      eventParams
    );
    finding.status_counts = result.rows.map((row) => ({
      status: String(row.status ?? 'NULL'),
      total: toNumber(row.total),
    }));
  }

  return finding;
};

const inspectRelatedTable = async (tableName: string, eventId: string): Promise<RelatedTableFinding> => {
  if (!(await tableExists(tableName))) {
    return {
      table: tableName,
      exists: false,
      total_rows: 0,
      soft_delete: { columns_present: [] },
    };
  }

  const columns = await getTableColumns(tableName);
  const tableSql = quoteIdentifier(tableName);
  const totalRows = await countOne(`SELECT COUNT(*)::int AS count FROM ${tableSql}`);
  const finding: RelatedTableFinding = {
    table: tableName,
    exists: true,
    total_rows: totalRows,
    soft_delete: await getSoftDeleteFinding(tableName, columns, eventId),
  };

  if (columns.includes('event_id')) {
    finding.event_id_matches = await countOne(
      `SELECT COUNT(*)::int AS count FROM ${tableSql} WHERE event_id = $1`,
      [eventId]
    );
    finding.sample = await sampleRows(tableName, 'WHERE event_id = $1', [eventId]);
  }

  if (columns.includes('registration_id')) {
    finding.registration_id_matches_current_event = await countOne(
      `SELECT COUNT(*)::int AS count
         FROM ${tableSql} t
         JOIN registrations r ON r.id = t.registration_id
        WHERE r.event_id = $1`,
      [eventId]
    );
    finding.orphan_registration_id_count = await countOne(
      `SELECT COUNT(*)::int AS count
         FROM ${tableSql} t
         LEFT JOIN registrations r ON r.id = t.registration_id
        WHERE t.registration_id IS NOT NULL
          AND r.id IS NULL`
    );
  }

  return finding;
};

const inspectOrphans = async (tableName: string): Promise<OrphanRecordFinding | null> => {
  if (!(await tableExists(tableName))) return null;
  const columns = await getTableColumns(tableName);
  if (!columns.includes('registration_id')) return null;

  const tableSql = quoteIdentifier(tableName);
  const orphanCount = await countOne(
    `SELECT COUNT(*)::int AS count
       FROM ${tableSql} t
       LEFT JOIN registrations r ON r.id = t.registration_id
      WHERE t.registration_id IS NOT NULL
        AND r.id IS NULL`
  );

  const result = await query(
    `SELECT to_jsonb(t) AS payload
       FROM ${tableSql} t
       LEFT JOIN registrations r ON r.id = t.registration_id
      WHERE t.registration_id IS NOT NULL
        AND r.id IS NULL
      LIMIT 10`
  );

  return {
    table: tableName,
    orphan_count: orphanCount,
    sample: result.rows.map((row) => row.payload as Record<string, unknown>),
  };
};

const inspectFinancialTable = async (tableName: string, eventId: string): Promise<FinancialRecordFinding> => {
  if (!(await tableExists(tableName))) {
    return { table: tableName, exists: false };
  }

  const columns = await getTableColumns(tableName);
  const tableSql = quoteIdentifier(tableName);
  const finding: FinancialRecordFinding = {
    table: tableName,
    exists: true,
  };

  if (columns.includes('event_id')) {
    finding.event_id_matches = await countOne(
      `SELECT COUNT(*)::int AS count FROM ${tableSql} WHERE event_id = $1`,
      [eventId]
    );
    finding.sample = await sampleRows(tableName, 'WHERE event_id = $1', [eventId]);
  }

  if (columns.includes('registration_id')) {
    finding.registration_id_matches_current_event = await countOne(
      `SELECT COUNT(*)::int AS count
         FROM ${tableSql} t
         JOIN registrations r ON r.id = t.registration_id
        WHERE r.event_id = $1`,
      [eventId]
    );
    finding.orphan_registration_id_count = await countOne(
      `SELECT COUNT(*)::int AS count
         FROM ${tableSql} t
         LEFT JOIN registrations r ON r.id = t.registration_id
        WHERE t.registration_id IS NOT NULL
          AND r.id IS NULL`
    );
  }

  return finding;
};

const getTriggers = async (): Promise<TriggerFinding[]> => {
  const result = await query(
    `SELECT
        trigger_schema,
        trigger_name,
        event_manipulation,
        event_object_table,
        action_timing,
        action_statement
       FROM information_schema.triggers
      WHERE event_object_table IN ('registrations', 'kits', 'event_kits')
      ORDER BY event_object_table, trigger_name`
  );

  return result.rows.map((row) => ({
    trigger_schema: String(row.trigger_schema),
    trigger_name: String(row.trigger_name),
    event_manipulation: String(row.event_manipulation),
    event_object_table: String(row.event_object_table),
    action_timing: String(row.action_timing),
    action_statement: String(row.action_statement),
  }));
};

const getForeignKeys = async (): Promise<ForeignKeyFinding[]> => {
  const result = await query(
    `SELECT
        tc.constraint_name,
        tc.table_name AS source_table,
        kcu.column_name AS source_column,
        ccu.table_name AS target_table,
        ccu.column_name AS target_column,
        rc.delete_rule,
        rc.update_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.constraint_schema = kcu.constraint_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.constraint_schema = tc.constraint_schema
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_name = tc.constraint_name
        AND rc.constraint_schema = tc.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND (
          tc.table_name = 'registrations'
          OR ccu.table_name = 'registrations'
          OR tc.table_name IN ('kits', 'event_kits')
          OR ccu.table_name IN ('kits', 'event_kits')
        )
      ORDER BY tc.table_name, tc.constraint_name`
  );

  return result.rows.map((row) => ({
    constraint_name: String(row.constraint_name),
    source_table: String(row.source_table),
    source_column: String(row.source_column),
    target_table: String(row.target_table),
    target_column: String(row.target_column),
    delete_rule: String(row.delete_rule),
    update_rule: String(row.update_rule),
  }));
};

const getHiddenTables = async (): Promise<HiddenTableFinding[]> => {
  const result = await query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name ILIKE '%registration%'
      ORDER BY table_name`
  );

  const explicitTables = new Set(RELATED_TABLES);
  const hiddenTables: HiddenTableFinding[] = [];

  for (const row of result.rows) {
    const tableName = String(row.table_name);
    if (explicitTables.has(tableName)) continue;
    const columns = await getTableColumns(tableName);
    hiddenTables.push({
      table: tableName,
      total_rows: await countOne(`SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(tableName)}`),
      columns,
    });
  }

  return hiddenTables;
};

const resolveKitTable = async (): Promise<string | null> => {
  if (await tableExists('event_kits')) return 'event_kits';
  if (await tableExists('kits')) return 'kits';
  return null;
};

const inspectKits = async (eventId: string): Promise<KitFinding> => {
  const kitTable = await resolveKitTable();
  if (!kitTable) {
    return {
      table: null,
      current_total: 0,
      current_soft_deleted: 0,
    };
  }

  const kitSql = quoteIdentifier(kitTable);
  const columns = await getTableColumns(kitTable);
  const currentTotal = columns.includes('event_id')
    ? await countOne(`SELECT COUNT(*)::int AS count FROM ${kitSql} WHERE event_id = $1`, [eventId])
    : 0;
  const currentSoftDeleted = columns.includes('deleted_at') && columns.includes('event_id')
    ? await countOne(`SELECT COUNT(*)::int AS count FROM ${kitSql} WHERE event_id = $1 AND deleted_at IS NOT NULL`, [eventId])
    : 0;

  const finding: KitFinding = {
    table: kitTable,
    current_total: currentTotal,
    current_soft_deleted: currentSoftDeleted,
  };

  if (process.env.BACKUP_DATABASE_URL && columns.includes('event_id')) {
    const backupPool = new Pool({
      connectionString: process.env.BACKUP_DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });

    try {
      const backupTableExists = await backupPool.query(`SELECT to_regclass($1) AS table_name`, [`public.${kitTable}`]);
      if (backupTableExists.rows[0]?.table_name) {
        const [backupResult, currentResult] = await Promise.all([
          backupPool.query(`SELECT id FROM ${kitSql} WHERE event_id = $1`, [eventId]),
          query(`SELECT id FROM ${kitSql} WHERE event_id = $1`, [eventId]),
        ]);
        const currentIds = new Set(currentResult.rows.map((row) => String(row.id)));
        const missingIds = backupResult.rows
          .map((row) => String(row.id))
          .filter((id) => !currentIds.has(id));
        finding.backup_total = backupResult.rows.length;
        finding.backup_missing_in_current = missingIds.length;
        finding.backup_missing_ids_sample = missingIds.slice(0, 20);
      }
    } finally {
      await backupPool.end();
    }
  }

  return finding;
};

const classifyCause = (findings: DeepFindings): { probable_cause: ProbableCause; recovery_recommendation: string } => {
  const registrations = findings.registrations.find((item) => item.table === 'registrations');
  const currentRegistrations = registrations?.event_id_matches ?? 0;
  const deletedRegistrations = findings.registrations.find((item) => item.table === 'deleted_registrations');
  const deletedArchiveMatches = deletedRegistrations?.event_id_matches ?? 0;
  const hasSoftDeleted = (registrations?.soft_delete.deleted_at_count ?? 0) > 0
    || (registrations?.soft_delete.is_deleted_count ?? 0) > 0
    || (registrations?.soft_delete.inactive_count ?? 0) > 0;
  const orphanTotal = findings.orphan_records.reduce((sum, item) => sum + item.orphan_count, 0);
  const hasCascadeRule = findings.foreign_keys.some((fk) => fk.delete_rule === 'CASCADE');
  const hasBackupMissingKits = (findings.kits.backup_missing_in_current ?? 0) > 0;
  const hasRelatedEventData = findings.registrations.some((item) => item.table !== 'registrations' && (item.event_id_matches ?? 0) > 0);
  const hasFinancialResidue = findings.financial_records.some(
    (item) => (item.event_id_matches ?? 0) > 0 || (item.orphan_registration_id_count ?? 0) > 0
  );

  if (hasSoftDeleted) {
    return {
      probable_cause: 'SOFT_DELETE',
      recovery_recommendation: 'Não restaurar ainda. Revisar registros soft-deletados e regras que filtram deleted_at/is_deleted/active/status.',
    };
  }

  if (orphanTotal > 0) {
    return {
      probable_cause: 'DADOS_ORFAOS',
      recovery_recommendation: 'Investigar tabelas órfãs por registration_id antes de restaurar. Elas podem permitir reconstrução ou indicar deleção parcial.',
    };
  }

  if (currentRegistrations === 0 && (deletedArchiveMatches > 0 || hasFinancialResidue || hasRelatedEventData)) {
    return {
      probable_cause: hasCascadeRule ? 'CASCADE_DELETE' : 'DELECAO_REAL',
      recovery_recommendation: 'Executar preview de recuperação por backup e comparar IDs antes de qualquer insert incremental.',
    };
  }

  if (hasBackupMissingKits) {
    return {
      probable_cause: 'INCONSISTENCIA_ESTRUTURAL',
      recovery_recommendation: 'Investigar kits ausentes no banco atual; inscrições podem ter perdido contexto por remoção física de kits.',
    };
  }

  if (currentRegistrations === 0 && !hasRelatedEventData && !hasFinancialResidue) {
    return {
      probable_cause: 'EVENTO_RECRIADO',
      recovery_recommendation: 'Comparar evento atual com backups e procurar registros pelo organizador/data; pode ser um novo event_id sem histórico associado.',
    };
  }

  return {
    probable_cause: 'SEM_ANOMALIA_FORTE',
    recovery_recommendation: 'Nenhuma ação de recuperação recomendada sem evidência adicional. Manter investigação em preview/read-only.',
  };
};

export default async function run(params?: RunParams): Promise<DeepForensicResult> {
  const event = await resolveEvent(params?.eventId);
  const relatedFindings = await Promise.all(RELATED_TABLES.map((tableName) => inspectRelatedTable(tableName, event.id)));
  const orphanFindings = (await Promise.all(RELATED_TABLES.map((tableName) => inspectOrphans(tableName))))
    .filter((finding): finding is OrphanRecordFinding => finding !== null);
  const financialFindings = await Promise.all(FINANCIAL_TABLES.map((tableName) => inspectFinancialTable(tableName, event.id)));
  const findings: DeepFindings = {
    registrations: relatedFindings,
    orphan_records: orphanFindings,
    financial_records: financialFindings,
    triggers: await getTriggers(),
    foreign_keys: await getForeignKeys(),
    hidden_tables: await getHiddenTables(),
    kits: await inspectKits(event.id),
  };
  const classification = classifyCause(findings);

  return {
    event,
    findings,
    probable_cause: classification.probable_cause,
    recovery_recommendation: classification.recovery_recommendation,
  };
}
