import pg from 'pg';
import { query } from '../config/database.js';

const { Pool } = pg;

type RunParams = {
  eventId: string;
};

type RegistrationRow = Record<string, unknown> & {
  id: string;
  event_id: string;
};

type DependencyClassification =
  | 'RESTORABLE_FULL'
  | 'RESTORABLE_WITH_NULL_KIT'
  | 'RESTORABLE_WITH_MISSING_CATEGORY'
  | 'RESTORABLE_WITH_MISSING_MODALITY'
  | 'RESTORABLE_WITH_MULTIPLE_MISSING_DEPENDENCIES'
  | 'ALREADY_EXISTS';

type DependencyDefinition = {
  column: string;
  target_table: string;
  target_column: string;
  source: 'fk' | 'known';
  requiredForClassification: boolean;
};

type MissingDependency = {
  column: string;
  value: string;
  target_table: string;
  target_column: string;
};

type SnapshotRecord = {
  id: string;
  table: string;
  name: string | null;
  attributes: Record<string, unknown>;
};

type RegistrationAnalysis = {
  registration_id: string;
  runner_id: string | null;
  runner_name: string | null;
  classification: DependencyClassification;
  missing_dependencies: MissingDependency[];
  snapshots: {
    kit?: SnapshotRecord;
    category?: SnapshotRecord;
    modality?: SnapshotRecord;
  };
  suggested_action: string;
};

type AnalyzerResult = {
  eventId: string;
  mode: 'analyze';
  totals: {
    backup: number;
    current: number;
    missing: number;
  };
  classification_counts: Record<DependencyClassification, number>;
  dependencies_checked: DependencyDefinition[];
  problematic_sample: RegistrationAnalysis[];
  summary_lines: string[];
  restore_plan: {
    immediate_full_restore_count: number;
    null_kit_restore_count: number;
    requires_category_strategy_count: number;
    requires_modality_strategy_count: number;
    requires_manual_review_count: number;
    recommendation: string;
  };
  safety: {
    read_only: true;
    inserts: false;
    updates: false;
    deletes: false;
    alters: false;
    restore_executed: false;
  };
  logs: string[];
};

type ForeignKeyRow = {
  source_column: string;
  target_table: string;
  target_column: string;
};

const CLASSIFICATIONS: DependencyClassification[] = [
  'RESTORABLE_FULL',
  'RESTORABLE_WITH_NULL_KIT',
  'RESTORABLE_WITH_MISSING_CATEGORY',
  'RESTORABLE_WITH_MISSING_MODALITY',
  'RESTORABLE_WITH_MULTIPLE_MISSING_DEPENDENCIES',
  'ALREADY_EXISTS',
];

const KNOWN_DEPENDENCIES: DependencyDefinition[] = [
  { column: 'category_id', target_table: 'categories', target_column: 'id', source: 'known', requiredForClassification: true },
  { column: 'modality_id', target_table: 'modalities', target_column: 'id', source: 'known', requiredForClassification: true },
  { column: 'kit_id', target_table: 'event_kits', target_column: 'id', source: 'known', requiredForClassification: true },
  { column: 'runner_id', target_table: 'profiles', target_column: 'id', source: 'known', requiredForClassification: true },
  { column: 'coupon_id', target_table: 'coupons', target_column: 'id', source: 'known', requiredForClassification: true },
  {
    column: 'transferred_from_registration_id',
    target_table: 'registrations',
    target_column: 'id',
    source: 'known',
    requiredForClassification: true,
  },
  {
    column: 'transferred_to_registration_id',
    target_table: 'registrations',
    target_column: 'id',
    source: 'known',
    requiredForClassification: true,
  },
];

const toStringOrNull = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
};

const quoteIdentifier = (identifier: string): string => {
  return `"${identifier.replace(/"/g, '""')}"`;
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

const createBackupPool = () => {
  const connectionString = process.env.BACKUP_DATABASE_URL;
  if (!connectionString) {
    throw new Error('BACKUP_DATABASE_URL não configurada');
  }

  return new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  });
};

const tableExists = async (
  executor: Pick<pg.Pool, 'query'> | { query: typeof query },
  tableName: string
): Promise<boolean> => {
  const result = await executor.query(`SELECT to_regclass($1) AS table_name`, [`public.${tableName}`]);
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

const getRegistrationForeignKeys = async (): Promise<DependencyDefinition[]> => {
  const result = await query(
    `SELECT
        kcu.column_name AS source_column,
        ccu.table_name AS target_table,
        ccu.column_name AS target_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.constraint_schema = kcu.constraint_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.constraint_schema = tc.constraint_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = 'registrations'
        AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY kcu.column_name`
  );

  return result.rows.map((row: ForeignKeyRow) => ({
    column: row.source_column,
    target_table: row.target_table,
    target_column: row.target_column,
    source: 'fk',
    requiredForClassification: true,
  }));
};

const resolveDependencies = async (registrationColumns: string[]): Promise<DependencyDefinition[]> => {
  const fks = await getRegistrationForeignKeys();
  const byColumn = new Map<string, DependencyDefinition>();

  for (const fk of fks) {
    if (registrationColumns.includes(fk.column)) {
      byColumn.set(fk.column, fk);
    }
  }

  for (const known of KNOWN_DEPENDENCIES) {
    if (!registrationColumns.includes(known.column) || byColumn.has(known.column)) continue;
    let targetTable = known.target_table;
    if (known.column === 'kit_id' && !(await tableExists({ query }, targetTable))) {
      targetTable = 'kits';
    }
    if (known.column === 'category_id' && !(await tableExists({ query }, targetTable))) {
      targetTable = 'event_categories';
    }
    if (await tableExists({ query }, targetTable)) {
      byColumn.set(known.column, { ...known, target_table: targetTable });
    }
  }

  return [...byColumn.values()].sort((a, b) => a.column.localeCompare(b.column));
};

const loadExistingValues = async (
  dependencies: DependencyDefinition[],
  rows: RegistrationRow[]
): Promise<Map<string, Set<string>>> => {
  const existingByColumn = new Map<string, Set<string>>();

  for (const dependency of dependencies) {
    const values = [
      ...new Set(
        rows
          .map((row) => toStringOrNull(row[dependency.column]))
          .filter((value): value is string => Boolean(value))
      ),
    ];

    if (values.length === 0) {
      existingByColumn.set(dependency.column, new Set());
      continue;
    }

    const targetTableSql = quoteIdentifier(dependency.target_table);
    const targetColumnSql = quoteIdentifier(dependency.target_column);
    const result = await query(
      `SELECT ${targetColumnSql}::text AS id
         FROM ${targetTableSql}
        WHERE ${targetColumnSql} = ANY($1::uuid[])`,
      [values]
    );

    existingByColumn.set(
      dependency.column,
      new Set(result.rows.map((row) => String(row.id)))
    );
  }

  return existingByColumn;
};

const loadBackupSnapshots = async (
  backupPool: pg.Pool,
  tableName: string,
  ids: string[]
): Promise<Map<string, SnapshotRecord>> => {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const snapshotById = new Map<string, SnapshotRecord>();
  if (uniqueIds.length === 0) return snapshotById;

  if (!(await tableExists(backupPool, tableName))) return snapshotById;

  const tableSql = quoteIdentifier(tableName);
  const result = await backupPool.query(
    `SELECT to_jsonb(t) AS payload
       FROM ${tableSql} t
      WHERE t.id = ANY($1::uuid[])`,
    [uniqueIds]
  );

  for (const row of result.rows) {
    const payload = row.payload as Record<string, unknown>;
    const id = String(payload.id);
    const name =
      toStringOrNull(payload.name) ??
      toStringOrNull(payload.title) ??
      toStringOrNull(payload.code) ??
      toStringOrNull(payload.description);

    snapshotById.set(id, {
      id,
      table: tableName,
      name,
      attributes: payload,
    });
  }

  return snapshotById;
};

const loadRunnerNames = async (backupPool: pg.Pool, rows: RegistrationRow[]): Promise<Map<string, string>> => {
  const runnerIds = [
    ...new Set(
      rows
        .map((row) => toStringOrNull(row.runner_id))
        .filter((value): value is string => Boolean(value))
    ),
  ];
  const names = new Map<string, string>();
  if (runnerIds.length === 0 || !(await tableExists(backupPool, 'profiles'))) return names;

  const result = await backupPool.query(
    `SELECT to_jsonb(p) AS payload
       FROM profiles p
      WHERE id = ANY($1::uuid[])`,
    [runnerIds]
  );

  for (const row of result.rows) {
    const payload = row.payload as Record<string, unknown>;
    const id = String(payload.id);
    const name =
      toStringOrNull(payload.full_name) ??
      toStringOrNull(payload.name) ??
      toStringOrNull(payload.email) ??
      id;
    names.set(id, name);
  }

  return names;
};

const classify = (missing: MissingDependency[]): DependencyClassification => {
  if (missing.length === 0) return 'RESTORABLE_FULL';
  if (missing.length > 1) return 'RESTORABLE_WITH_MULTIPLE_MISSING_DEPENDENCIES';
  const onlyMissing = missing[0]?.column;
  if (onlyMissing === 'kit_id') return 'RESTORABLE_WITH_NULL_KIT';
  if (onlyMissing === 'category_id') return 'RESTORABLE_WITH_MISSING_CATEGORY';
  if (onlyMissing === 'modality_id') return 'RESTORABLE_WITH_MISSING_MODALITY';
  return 'RESTORABLE_WITH_MULTIPLE_MISSING_DEPENDENCIES';
};

const suggestedAction = (classification: DependencyClassification, missing: MissingDependency[]): string => {
  if (classification === 'ALREADY_EXISTS') return 'Nenhuma ação. Inscrição já existe na produção.';
  if (classification === 'RESTORABLE_FULL') return 'Pode ser restaurada integralmente em etapa futura.';
  if (classification === 'RESTORABLE_WITH_NULL_KIT') {
    return 'Em etapa futura, restaurar com kit_id NULL e preservar snapshot textual do kit original.';
  }
  if (classification === 'RESTORABLE_WITH_MISSING_CATEGORY') {
    return 'Não restaurar automaticamente ainda. Definir estratégia de fallback/recriação segura de categoria.';
  }
  if (classification === 'RESTORABLE_WITH_MISSING_MODALITY') {
    return 'Não restaurar automaticamente ainda. Definir estratégia de fallback/recriação segura de modalidade.';
  }
  return `Revisão manual obrigatória antes do restore. Dependências ausentes: ${missing.map((item) => item.column).join(', ')}.`;
};

const buildSummaryLines = (
  eventId: string,
  totals: AnalyzerResult['totals'],
  counts: Record<DependencyClassification, number>
): string[] => [
  `Evento: ${eventId}`,
  `Total no backup: ${totals.backup}`,
  `Total atual: ${totals.current}`,
  `Faltantes: ${totals.missing}`,
  `RESTORABLE_FULL: ${counts.RESTORABLE_FULL}`,
  `RESTORABLE_WITH_NULL_KIT: ${counts.RESTORABLE_WITH_NULL_KIT}`,
  `RESTORABLE_WITH_MISSING_CATEGORY: ${counts.RESTORABLE_WITH_MISSING_CATEGORY}`,
  `RESTORABLE_WITH_MISSING_MODALITY: ${counts.RESTORABLE_WITH_MISSING_MODALITY}`,
  `RESTORABLE_WITH_MULTIPLE_MISSING_DEPENDENCIES: ${counts.RESTORABLE_WITH_MULTIPLE_MISSING_DEPENDENCIES}`,
  `ALREADY_EXISTS: ${counts.ALREADY_EXISTS}`,
];

export default async function run(params: RunParams): Promise<AnalyzerResult> {
  if (!params?.eventId) {
    throw new Error('eventId é obrigatório');
  }

  const { log, logs } = createStructuredLogger();
  const eventId = params.eventId;
  const backupPool = createBackupPool();

  try {
    log(`Iniciando analyzer read-only para evento ${eventId}`);
    log('Carregando inscrições do backup e produção');

    const [backupRegistrationsResult, currentRegistrationsResult, registrationColumns] = await Promise.all([
      backupPool.query<RegistrationRow>(
        `SELECT *
           FROM registrations
          WHERE event_id = $1
          ORDER BY created_at ASC NULLS LAST, id ASC`,
        [eventId]
      ),
      query(`SELECT id FROM registrations WHERE event_id = $1`, [eventId]),
      getTableColumns('registrations'),
    ]);

    const backupRows = backupRegistrationsResult.rows;
    const currentIds = new Set(currentRegistrationsResult.rows.map((row) => String(row.id)));
    const alreadyExistingRows = backupRows.filter((row) => currentIds.has(String(row.id)));
    const missingRows = backupRows.filter((row) => !currentIds.has(String(row.id)));

    log(`Backup encontrado: ${backupRows.length}`);
    log(`Produção encontrada: ${currentIds.size}`);
    log(`Faltantes por ID: ${missingRows.length}`);

    const dependencies = await resolveDependencies(registrationColumns);
    log(`Dependências verificadas: ${dependencies.map((item) => item.column).join(', ') || 'nenhuma'}`);

    const existingByColumn = await loadExistingValues(dependencies, missingRows);
    const kitIds = missingRows.map((row) => toStringOrNull(row.kit_id)).filter((value): value is string => Boolean(value));
    const categoryIds = missingRows.map((row) => toStringOrNull(row.category_id)).filter((value): value is string => Boolean(value));
    const modalityIds = missingRows.map((row) => toStringOrNull(row.modality_id)).filter((value): value is string => Boolean(value));
    const kitTable = dependencies.find((item) => item.column === 'kit_id')?.target_table ?? 'event_kits';
    const categoryTable = dependencies.find((item) => item.column === 'category_id')?.target_table ?? 'categories';
    const modalityTable = dependencies.find((item) => item.column === 'modality_id')?.target_table ?? 'modalities';

    const [kitSnapshots, categorySnapshots, modalitySnapshots, runnerNames] = await Promise.all([
      loadBackupSnapshots(backupPool, kitTable, kitIds),
      loadBackupSnapshots(backupPool, categoryTable, categoryIds),
      loadBackupSnapshots(backupPool, modalityTable, modalityIds),
      loadRunnerNames(backupPool, backupRows),
    ]);

    const counts = CLASSIFICATIONS.reduce(
      (acc, classification) => ({ ...acc, [classification]: 0 }),
      {} as Record<DependencyClassification, number>
    );
    const problematic: RegistrationAnalysis[] = [];

    counts.ALREADY_EXISTS = alreadyExistingRows.length;

    for (const row of missingRows) {
      const registrationId = String(row.id);
      const missingDependencies: MissingDependency[] = [];
      log(`Analisando registration ${registrationId}`);

      for (const dependency of dependencies) {
        const value = toStringOrNull(row[dependency.column]);
        if (!value) continue;
        const existingValues = existingByColumn.get(dependency.column) ?? new Set<string>();
        if (!existingValues.has(value)) {
          log(`${dependency.column} inexistente detectado para registration ${registrationId}`);
          missingDependencies.push({
            column: dependency.column,
            value,
            target_table: dependency.target_table,
            target_column: dependency.target_column,
          });
        }
      }

      const classification = classify(missingDependencies);
      counts[classification]++;

      if (classification !== 'RESTORABLE_FULL' && problematic.length < 50) {
        const kitId = toStringOrNull(row.kit_id);
        const categoryId = toStringOrNull(row.category_id);
        const modalityId = toStringOrNull(row.modality_id);
        const runnerId = toStringOrNull(row.runner_id);
        problematic.push({
          registration_id: registrationId,
          runner_id: runnerId,
          runner_name: runnerId ? runnerNames.get(runnerId) ?? null : null,
          classification,
          missing_dependencies: missingDependencies,
          snapshots: {
            kit: kitId ? kitSnapshots.get(kitId) : undefined,
            category: categoryId ? categorySnapshots.get(categoryId) : undefined,
            modality: modalityId ? modalitySnapshots.get(modalityId) : undefined,
          },
          suggested_action: suggestedAction(classification, missingDependencies),
        });
      }
    }

    const totals = {
      backup: backupRows.length,
      current: currentIds.size,
      missing: missingRows.length,
    };

    return {
      eventId,
      mode: 'analyze',
      totals,
      classification_counts: counts,
      dependencies_checked: dependencies,
      problematic_sample: problematic,
      summary_lines: buildSummaryLines(eventId, totals, counts),
      restore_plan: {
        immediate_full_restore_count: counts.RESTORABLE_FULL,
        null_kit_restore_count: counts.RESTORABLE_WITH_NULL_KIT,
        requires_category_strategy_count: counts.RESTORABLE_WITH_MISSING_CATEGORY,
        requires_modality_strategy_count: counts.RESTORABLE_WITH_MISSING_MODALITY,
        requires_manual_review_count: counts.RESTORABLE_WITH_MULTIPLE_MISSING_DEPENDENCIES,
        recommendation:
          'Validar este relatório antes de implementar restore. Próxima etapa deve separar restore integral, restore com kit_id NULL e casos que exigem fallback/recriação controlada.',
      },
      safety: {
        read_only: true,
        inserts: false,
        updates: false,
        deletes: false,
        alters: false,
        restore_executed: false,
      },
      logs,
    };
  } finally {
    await backupPool.end();
  }
}
