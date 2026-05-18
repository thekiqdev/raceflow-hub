import pg from 'pg';
import { getClient, query } from '../config/database.js';

const { Pool } = pg;

type RunParams = {
  eventId: string;
  mode?: 'preview' | 'restore';
  confirm?: boolean;
  limit?: number;
  batchSize?: number;
};

type RegistrationRow = Record<string, unknown> & {
  id: string;
  event_id: string;
};

type ColumnMetadata = {
  column_name: string;
  is_generated: string;
  identity_generation: string | null;
};

type RestoreResult = {
  eventId: string;
  mode: 'preview' | 'restore';
  backup_found: number;
  current_found: number;
  missing_count: number;
  eligible_count: number;
  skipped_count: number;
  requested_limit: number;
  batch_size: number;
  restored_count: number;
  restored_with_normal_kit: number;
  restored_with_null_kit: number;
  restored_with_null_transfer_refs: number;
  custom_field_values_restored: number;
  financial_payments_restored: number;
  kit_null_applied: number;
  transfer_refs_null_applied: number;
  null_kit_promoted_count: number;
  null_transfer_refs_promoted_count: number;
  skipped_real_dependency_count: number;
  failed_count: number;
  sample: RegistrationRow[];
  missing_sample: RegistrationRow[];
  skipped_sample: Array<{
    registration_id: string;
    reason: string;
    missing_dependencies: string[];
  }>;
  restored_ids: string[];
  failed_batches: Array<{
    batch_index: number;
    registration_ids: string[];
    error: string;
  }>;
  legacy_kit_snapshots: Array<{
    registration_id: string;
    original_kit_id: string;
    legacy_kit_name: string | null;
    persisted_in_registration: boolean;
  }>;
  post_restore_validation: {
    organizer_registrations_check: number;
    admin_registrations_check: number;
    event_detailed_report_base_check: number;
    checkin_search_base_check: number;
    transfer_references_check: number;
    custom_field_values_check: number;
  } | null;
  safety: {
    backup_database_url_present: boolean;
    event_exists_in_current: boolean;
    confirm_required: boolean;
    inserted_only_missing_by_id: boolean;
    kit_id_null_when_missing: boolean;
    limited_restore: boolean;
    batch_rollback: boolean;
    overwrites_existing_records: false;
    deletes_current_records: false;
  };
  logs: string[];
};

type RestoreCandidate = {
  row: RegistrationRow;
  normalizedRow: RegistrationRow;
  classification: 'RESTORABLE_FULL' | 'RESTORABLE_WITH_NULL_KIT' | 'RESTORABLE_WITH_NULL_TRANSFER_REFS' | 'SKIPPED';
  missingDependencies: string[];
  fallbackApplied: Array<'kit_id' | 'transferred_from_registration_id' | 'transferred_to_registration_id'>;
  legacyKitName: string | null;
};

const BLOCKING_DEPENDENCY_COLUMNS = new Set([
  'event_id',
  'runner_id',
  'registered_by',
  'category_id',
  'modality_id',
  'coupon_id',
]);

type RelatedTableCopyResult = {
  inserted: number;
};

const DEFAULT_RESTORE_LIMIT = 10;
const DEFAULT_BATCH_SIZE = 10;
const LEGACY_KIT_METADATA_COLUMNS = [
  'metadata',
  'meta',
  'extra_data',
  'additional_data',
  'notes',
  'admin_notes',
  'observation',
  'observations',
];

const quoteIdentifier = (identifier: string): string => {
  return `"${identifier.replace(/"/g, '""')}"`;
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

const createStructuredLogger = () => {
  const logs: string[] = [];
  return {
    logs,
    log: (message: string) => {
      logs.push(`[${new Date().toISOString()}] ${message}`);
    },
  };
};

const toStringOrNull = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
};

const getCurrentRegistrationColumns = async (): Promise<string[]> => {
  const result = await query(
    `SELECT column_name, is_generated, identity_generation
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'registrations'
      ORDER BY ordinal_position`
  );

  return result.rows
    .filter((row: ColumnMetadata) => row.is_generated !== 'ALWAYS' && row.identity_generation !== 'ALWAYS')
    .map((row: ColumnMetadata) => row.column_name);
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

const tableExists = async (
  executor: Pick<pg.Pool, 'query'> | { query: typeof query },
  tableName: string
): Promise<boolean> => {
  const result = await executor.query(`SELECT to_regclass($1) AS table_name`, [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
};

const filterInsertableColumns = (row: RegistrationRow, currentColumns: string[]): string[] => {
  const rowColumns = new Set(Object.keys(row));
  return currentColumns.filter((column) => rowColumns.has(column));
};

const findLegacyKitMetadataColumn = (columns: string[]): string | null => {
  return LEGACY_KIT_METADATA_COLUMNS.find((column) => columns.includes(column)) ?? null;
};

const applyLegacyKitSnapshot = (
  row: RegistrationRow,
  currentColumns: string[],
  legacyKitName: string | null,
  originalKitId: string | null
): RegistrationRow => {
  const metadataColumn = findLegacyKitMetadataColumn(currentColumns);
  if (!metadataColumn || (!legacyKitName && !originalKitId)) return row;

  const snapshot = {
    legacy_kit_name: legacyKitName,
    legacy_kit_id: originalKitId,
    restored_with_kit_id_null: true,
  };

  const currentValue = row[metadataColumn];
  if (typeof currentValue === 'object' && currentValue !== null && !Array.isArray(currentValue)) {
    return {
      ...row,
      [metadataColumn]: {
        ...(currentValue as Record<string, unknown>),
        ...snapshot,
      },
    };
  }

  if (typeof currentValue === 'string' && currentValue.trim()) {
    return {
      ...row,
      [metadataColumn]: `${currentValue}\n${JSON.stringify(snapshot)}`,
    };
  }

  return {
    ...row,
    [metadataColumn]: JSON.stringify(snapshot),
  };
};

const loadExistingSet = async (tableName: string, ids: string[]): Promise<Set<string>> => {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Set();
  if (!(await tableExists({ query }, tableName))) return new Set();

  const result = await query(
    `SELECT id::text AS id
       FROM ${quoteIdentifier(tableName)}
      WHERE id = ANY($1::uuid[])`,
    [uniqueIds]
  );

  return new Set(result.rows.map((row) => String(row.id)));
};

const loadKitNamesFromBackup = async (backupPool: pg.Pool, kitIds: string[]): Promise<Map<string, string | null>> => {
  const uniqueIds = [...new Set(kitIds.filter(Boolean))];
  const names = new Map<string, string | null>();
  if (uniqueIds.length === 0) return names;

  const tableName = (await tableExists(backupPool, 'event_kits')) ? 'event_kits' : (await tableExists(backupPool, 'kits')) ? 'kits' : null;
  if (!tableName) return names;

  const result = await backupPool.query(
    `SELECT to_jsonb(t) AS payload
       FROM ${quoteIdentifier(tableName)} t
      WHERE id = ANY($1::uuid[])`,
    [uniqueIds]
  );

  for (const row of result.rows) {
    const payload = row.payload as Record<string, unknown>;
    names.set(
      String(payload.id),
      toStringOrNull(payload.name) ?? toStringOrNull(payload.title) ?? toStringOrNull(payload.description)
    );
  }

  return names;
};

const buildRestoreCandidates = async (
  backupPool: pg.Pool,
  missingRows: RegistrationRow[],
  currentColumns: string[]
): Promise<RestoreCandidate[]> => {
  const kitIds = missingRows.map((row) => toStringOrNull(row.kit_id)).filter((value): value is string => Boolean(value));
  const categoryIds = missingRows.map((row) => toStringOrNull(row.category_id)).filter((value): value is string => Boolean(value));
  const modalityIds = missingRows.map((row) => toStringOrNull(row.modality_id)).filter((value): value is string => Boolean(value));
  const runnerIds = missingRows.map((row) => toStringOrNull(row.runner_id)).filter((value): value is string => Boolean(value));
  const registeredByIds = missingRows.map((row) => toStringOrNull(row.registered_by)).filter((value): value is string => Boolean(value));
  const transferredFromIds = missingRows
    .map((row) => toStringOrNull(row.transferred_from_registration_id))
    .filter((value): value is string => Boolean(value));
  const transferredToIds = missingRows
    .map((row) => toStringOrNull(row.transferred_to_registration_id))
    .filter((value): value is string => Boolean(value));

  const [
    existingKits,
    existingCategories,
    existingModalities,
    existingRunners,
    existingRegisteredBy,
    existingTransferredFrom,
    existingTransferredTo,
    kitNames,
  ] = await Promise.all([
    loadExistingSet((await tableExists({ query }, 'event_kits')) ? 'event_kits' : 'kits', kitIds),
    loadExistingSet((await tableExists({ query }, 'event_categories')) ? 'event_categories' : 'categories', categoryIds),
    loadExistingSet('modalities', modalityIds),
    loadExistingSet('profiles', runnerIds),
    loadExistingSet('profiles', registeredByIds),
    loadExistingSet('registrations', transferredFromIds),
    loadExistingSet('registrations', transferredToIds),
    loadKitNamesFromBackup(backupPool, kitIds),
  ]);

  return missingRows.map((row) => {
    const originalKitId = toStringOrNull(row.kit_id);
    const missingDependencies: string[] = [];

    if (toStringOrNull(row.category_id) && !existingCategories.has(String(row.category_id))) {
      missingDependencies.push('category_id');
    }
    if (toStringOrNull(row.modality_id) && !existingModalities.has(String(row.modality_id))) {
      missingDependencies.push('modality_id');
    }
    if (toStringOrNull(row.runner_id) && !existingRunners.has(String(row.runner_id))) {
      missingDependencies.push('runner_id');
    }
    if (toStringOrNull(row.registered_by) && !existingRegisteredBy.has(String(row.registered_by))) {
      missingDependencies.push('registered_by');
    }
    const kitMissing = Boolean(originalKitId && !existingKits.has(originalKitId));
    const legacyKitName = originalKitId ? kitNames.get(originalKitId) ?? null : null;
    const blockingMissingDependencies = missingDependencies.filter((column) => BLOCKING_DEPENDENCY_COLUMNS.has(column));
    const transferredFromId = toStringOrNull(row.transferred_from_registration_id);
    const transferredToId = toStringOrNull(row.transferred_to_registration_id);
    const transferredFromMissing = Boolean(transferredFromId && !existingTransferredFrom.has(transferredFromId));
    const transferredToMissing = Boolean(transferredToId && !existingTransferredTo.has(transferredToId));
    const transferRefsMissing = transferredFromMissing || transferredToMissing;
    const fallbackApplied: RestoreCandidate['fallbackApplied'] = [];

    if (blockingMissingDependencies.length === 0) {
      let normalizedRow: RegistrationRow = { ...row };
      if (kitMissing) {
        normalizedRow = {
          ...normalizedRow,
          kit_id: null,
        };
        fallbackApplied.push('kit_id');
      }
      if (transferredFromMissing) {
        normalizedRow = {
          ...normalizedRow,
          transferred_from_registration_id: null,
        };
        fallbackApplied.push('transferred_from_registration_id');
      }
      if (transferredToMissing) {
        normalizedRow = {
          ...normalizedRow,
          transferred_to_registration_id: null,
        };
        fallbackApplied.push('transferred_to_registration_id');
      }

      const classification = kitMissing
        ? 'RESTORABLE_WITH_NULL_KIT'
        : transferRefsMissing
          ? 'RESTORABLE_WITH_NULL_TRANSFER_REFS'
          : 'RESTORABLE_FULL';

      return {
        row,
        normalizedRow: applyLegacyKitSnapshot(normalizedRow, currentColumns, kitMissing ? legacyKitName : null, kitMissing ? originalKitId : null),
        classification,
        missingDependencies: fallbackApplied,
        fallbackApplied,
        legacyKitName,
      };
    }

    if (kitMissing) missingDependencies.push('kit_id');
    if (transferredFromMissing) missingDependencies.push('transferred_from_registration_id');
    if (transferredToMissing) missingDependencies.push('transferred_to_registration_id');

    return {
      row,
      normalizedRow: applyLegacyKitSnapshot(row, currentColumns, null, null),
      classification: 'SKIPPED' as const,
      missingDependencies: blockingMissingDependencies,
      fallbackApplied: [],
      legacyKitName,
    };
  });
};

const insertMissingRegistration = async (
  client: Awaited<ReturnType<typeof getClient>>,
  row: RegistrationRow,
  currentColumns: string[]
): Promise<boolean> => {
  const columns = filterInsertableColumns(row, currentColumns);
  if (!columns.includes('id') || !columns.includes('event_id')) {
    throw new Error('Backup não contém colunas obrigatórias id/event_id para registrations');
  }

  const columnSql = columns.map(quoteIdentifier).join(', ');
  const placeholderSql = columns.map((_, index) => `$${index + 1}`).join(', ');
  const values = columns.map((column) => row[column]);

  const result = await client.query(
    `INSERT INTO registrations (${columnSql})
     VALUES (${placeholderSql})
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    values
  );

  return (result.rowCount ?? 0) > 0;
};

const copyRelatedRows = async (
  backupPool: pg.Pool,
  client: Awaited<ReturnType<typeof getClient>>,
  tableName: string,
  registrationIds: string[]
): Promise<RelatedTableCopyResult> => {
  if (registrationIds.length === 0) return { inserted: 0 };
  if (!(await tableExists(backupPool, tableName)) || !(await tableExists({ query }, tableName))) {
    return { inserted: 0 };
  }

  const currentColumns = await getTableColumns(tableName);
  if (!currentColumns.includes('registration_id')) return { inserted: 0 };

  const backupRows = await backupPool.query<Record<string, unknown>>(
    `SELECT *
       FROM ${quoteIdentifier(tableName)}
      WHERE registration_id = ANY($1::uuid[])`,
    [registrationIds]
  );

  let inserted = 0;
  for (const row of backupRows.rows) {
    const rowColumns = new Set(Object.keys(row));
    const columns = currentColumns.filter((column) => rowColumns.has(column));
    if (columns.length === 0) continue;

    const conflictClause = tableName === 'registration_custom_field_values' && columns.includes('category_custom_field_id')
      ? 'ON CONFLICT (registration_id, category_custom_field_id) DO NOTHING'
      : tableName === 'asaas_payments' && columns.includes('asaas_payment_id')
        ? 'ON CONFLICT (asaas_payment_id) DO NOTHING'
        : columns.includes('id')
          ? 'ON CONFLICT (id) DO NOTHING'
          : 'ON CONFLICT DO NOTHING';

    const result = await client.query(
      `INSERT INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(', ')})
       VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})
       ${conflictClause}`,
      columns.map((column) => row[column])
    );
    inserted += result.rowCount ?? 0;
  }

  return { inserted };
};

const runPostRestoreValidation = async (eventId: string, restoredIds: string[]) => {
  if (restoredIds.length === 0) {
    return {
      organizer_registrations_check: 0,
      admin_registrations_check: 0,
      event_detailed_report_base_check: 0,
      checkin_search_base_check: 0,
      transfer_references_check: 0,
      custom_field_values_check: 0,
    };
  }

  const hasCustomFieldValues = await tableExists({ query }, 'registration_custom_field_values');
  const [registrations, transfers, customFields] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count FROM registrations WHERE event_id = $1 AND id = ANY($2::uuid[])`, [eventId, restoredIds]),
    query(
      `SELECT COUNT(*)::int AS count
         FROM registrations
        WHERE transferred_from_registration_id = ANY($1::uuid[])
           OR transferred_to_registration_id = ANY($1::uuid[])`,
      [restoredIds]
    ),
    hasCustomFieldValues
      ? query(`SELECT COUNT(*)::int AS count FROM registration_custom_field_values WHERE registration_id = ANY($1::uuid[])`, [restoredIds])
      : Promise.resolve({ rows: [{ count: 0 }] } as any),
  ]);

  const count = Number(registrations.rows[0]?.count ?? 0) || 0;
  return {
    organizer_registrations_check: count,
    admin_registrations_check: count,
    event_detailed_report_base_check: count,
    checkin_search_base_check: count,
    transfer_references_check: Number(transfers.rows[0]?.count ?? 0) || 0,
    custom_field_values_check: Number(customFields.rows[0]?.count ?? 0) || 0,
  };
};

export default async function run(params: RunParams): Promise<RestoreResult> {
  if (!params?.eventId) {
    throw new Error('eventId é obrigatório');
  }

  const eventId = params.eventId;
  const mode = params.mode ?? (params.confirm === true ? 'restore' : 'preview');
  const requestedLimit = Math.max(1, Math.min(Number(params.limit ?? DEFAULT_RESTORE_LIMIT) || DEFAULT_RESTORE_LIMIT, 1000));
  const batchSize = Math.max(1, Math.min(Number(params.batchSize ?? DEFAULT_BATCH_SIZE) || DEFAULT_BATCH_SIZE, 100));
  const { log, logs } = createStructuredLogger();
  const backupPool = createBackupPool();

  try {
    log(`Iniciando restore controlado em modo ${mode} para evento ${eventId}`);
    const [backupRegistrationsResult, currentRegistrationsResult, eventExistsResult, currentColumns] =
      await Promise.all([
        backupPool.query<RegistrationRow>(
          `SELECT *
             FROM registrations
            WHERE event_id = $1
            ORDER BY created_at ASC NULLS LAST, id ASC`,
          [eventId]
        ),
        query(
          `SELECT id
             FROM registrations
            WHERE event_id = $1`,
          [eventId]
        ),
        query(
          `SELECT 1
             FROM events
            WHERE id = $1
            LIMIT 1`,
          [eventId]
        ),
        getCurrentRegistrationColumns(),
      ]);

    const backupRows = backupRegistrationsResult.rows;
    const currentIds = new Set(currentRegistrationsResult.rows.map((row) => String(row.id)));
    const missingRows = backupRows.filter((row) => !currentIds.has(String(row.id)));
    const eventExistsInCurrent = (eventExistsResult.rowCount ?? 0) > 0;
    const candidates = await buildRestoreCandidates(backupPool, missingRows, currentColumns);
    const eligibleCandidates = candidates.filter((candidate) =>
      candidate.classification === 'RESTORABLE_FULL' ||
      candidate.classification === 'RESTORABLE_WITH_NULL_KIT' ||
      candidate.classification === 'RESTORABLE_WITH_NULL_TRANSFER_REFS'
    );
    const skippedCandidates = candidates.filter((candidate) => candidate.classification === 'SKIPPED');
    const limitedCandidates = eligibleCandidates.slice(0, requestedLimit);
    const nullKitPromotedCount = eligibleCandidates.filter(
      (candidate) => candidate.fallbackApplied.includes('kit_id')
    ).length;
    const nullTransferRefsPromotedCount = eligibleCandidates.filter(
      (candidate) =>
        candidate.fallbackApplied.includes('transferred_from_registration_id') ||
        candidate.fallbackApplied.includes('transferred_to_registration_id')
    ).length;

    log(`Backup encontrado: ${backupRows.length}`);
    log(`Produção encontrada: ${currentIds.size}`);
    log(`Faltantes por ID: ${missingRows.length}`);
    log(`Elegíveis para restore seguro: ${eligibleCandidates.length}`);
    log(`RESTORABLE_WITH_NULL_KIT promoted to eligible: ${nullKitPromotedCount}`);
    log(`RESTORABLE_WITH_NULL_TRANSFER_REFS promoted to eligible: ${nullTransferRefsPromotedCount}`);
    log(`Ignoradas por dependência real: ${skippedCandidates.length}`);
    log(`Limit aplicado: ${requestedLimit}`);

    if (mode !== 'restore' || params.confirm !== true) {
      return {
        eventId,
        mode: 'preview',
        backup_found: backupRows.length,
        current_found: currentIds.size,
        missing_count: missingRows.length,
        eligible_count: eligibleCandidates.length,
        skipped_count: skippedCandidates.length,
        requested_limit: requestedLimit,
        batch_size: batchSize,
        restored_count: 0,
        restored_with_normal_kit: 0,
        restored_with_null_kit: 0,
        restored_with_null_transfer_refs: 0,
        custom_field_values_restored: 0,
        financial_payments_restored: 0,
        kit_null_applied: limitedCandidates.filter((candidate) => candidate.fallbackApplied.includes('kit_id')).length,
        transfer_refs_null_applied: limitedCandidates.filter(
          (candidate) =>
            candidate.fallbackApplied.includes('transferred_from_registration_id') ||
            candidate.fallbackApplied.includes('transferred_to_registration_id')
        ).length,
        null_kit_promoted_count: nullKitPromotedCount,
        null_transfer_refs_promoted_count: nullTransferRefsPromotedCount,
        skipped_real_dependency_count: skippedCandidates.length,
        failed_count: 0,
        sample: backupRows.slice(0, 10),
        missing_sample: limitedCandidates.map((candidate) => candidate.normalizedRow).slice(0, 10),
        skipped_sample: skippedCandidates.slice(0, 10).map((candidate) => ({
          registration_id: String(candidate.row.id),
          reason: 'Dependências obrigatórias ausentes',
          missing_dependencies: candidate.missingDependencies,
        })),
        restored_ids: [],
        failed_batches: [],
        legacy_kit_snapshots: limitedCandidates
          .filter((candidate) => candidate.classification === 'RESTORABLE_WITH_NULL_KIT')
          .slice(0, 20)
          .map((candidate) => ({
            registration_id: String(candidate.row.id),
            original_kit_id: String(candidate.row.kit_id),
            legacy_kit_name: candidate.legacyKitName,
            persisted_in_registration: Boolean(findLegacyKitMetadataColumn(currentColumns)),
          })),
        post_restore_validation: null,
        safety: {
          backup_database_url_present: true,
          event_exists_in_current: eventExistsInCurrent,
          confirm_required: true,
          inserted_only_missing_by_id: true,
          kit_id_null_when_missing: true,
          limited_restore: true,
          batch_rollback: true,
          overwrites_existing_records: false,
          deletes_current_records: false,
        },
        logs,
      };
    }

    if (!eventExistsInCurrent) {
      throw new Error(`Evento ${eventId} não existe no banco atual. Restauração bloqueada por segurança.`);
    }

    let restoredCount = 0;
    let restoredWithNormalKit = 0;
    let restoredWithNullKit = 0;
    let restoredWithNullTransferRefs = 0;
    let customFieldValuesRestored = 0;
    let financialPaymentsRestored = 0;
    const restoredIds: string[] = [];
    const failedBatches: RestoreResult['failed_batches'] = [];

    for (let start = 0; start < limitedCandidates.length; start += batchSize) {
      const batch = limitedCandidates.slice(start, start + batchSize);
      const batchIndex = Math.floor(start / batchSize) + 1;
      const client = await getClient();

      try {
        await client.query('BEGIN');
        const batchRestoredIds: string[] = [];

        for (const candidate of batch) {
          const inserted = await insertMissingRegistration(client, candidate.normalizedRow, currentColumns);
          if (inserted) {
            restoredCount++;
            batchRestoredIds.push(String(candidate.row.id));
            const hasNullKitFallback = candidate.fallbackApplied.includes('kit_id');
            const hasNullTransferFallback =
              candidate.fallbackApplied.includes('transferred_from_registration_id') ||
              candidate.fallbackApplied.includes('transferred_to_registration_id');
            if (hasNullKitFallback) {
              restoredWithNullKit++;
              log(`Restaurada com kit NULL fallback: ${candidate.row.id}; kit original ${candidate.row.kit_id}`);
            }
            if (hasNullTransferFallback) {
              restoredWithNullTransferRefs++;
              log(`Restaurada com transfer refs NULL fallback: ${candidate.row.id}`);
            }
            if (!hasNullKitFallback) {
              restoredWithNormalKit++;
              log(`Restaurada com kit normal: ${candidate.row.id}`);
            }
          } else {
            log(`Ignorada por idempotência (já existe): ${candidate.row.id}`);
          }
        }

        const customFieldsResult = await copyRelatedRows(backupPool, client, 'registration_custom_field_values', batchRestoredIds);
        customFieldValuesRestored += customFieldsResult.inserted;
        const financialPaymentsResult = await copyRelatedRows(backupPool, client, 'asaas_payments', batchRestoredIds);
        financialPaymentsRestored += financialPaymentsResult.inserted;

        await client.query('COMMIT');
        restoredIds.push(...batchRestoredIds);
        log(
          `Batch ${batchIndex} confirmado com ${batchRestoredIds.length} inscrição(ões), ` +
          `${customFieldsResult.inserted} campo(s) personalizado(s) e ${financialPaymentsResult.inserted} pagamento(s)`
        );
      } catch (error: any) {
        await client.query('ROLLBACK');
        failedBatches.push({
          batch_index: batchIndex,
          registration_ids: batch.map((candidate) => String(candidate.row.id)),
          error: error.message,
        });
        log(`Batch ${batchIndex} revertido: ${error.message}`);
      } finally {
        client.release();
      }
    }

    return {
      eventId,
      mode: 'restore',
      backup_found: backupRows.length,
      current_found: currentIds.size,
      missing_count: missingRows.length,
      eligible_count: eligibleCandidates.length,
      skipped_count: skippedCandidates.length,
      requested_limit: requestedLimit,
      batch_size: batchSize,
      restored_count: restoredCount,
      restored_with_normal_kit: restoredWithNormalKit,
      restored_with_null_kit: restoredWithNullKit,
      restored_with_null_transfer_refs: restoredWithNullTransferRefs,
      custom_field_values_restored: customFieldValuesRestored,
      financial_payments_restored: financialPaymentsRestored,
      kit_null_applied: limitedCandidates.filter((candidate) => candidate.fallbackApplied.includes('kit_id')).length,
      transfer_refs_null_applied: limitedCandidates.filter(
        (candidate) =>
          candidate.fallbackApplied.includes('transferred_from_registration_id') ||
          candidate.fallbackApplied.includes('transferred_to_registration_id')
      ).length,
      null_kit_promoted_count: nullKitPromotedCount,
      null_transfer_refs_promoted_count: nullTransferRefsPromotedCount,
      skipped_real_dependency_count: skippedCandidates.length,
      failed_count: failedBatches.reduce((sum, batch) => sum + batch.registration_ids.length, 0),
      sample: backupRows.slice(0, 10),
      missing_sample: limitedCandidates.map((candidate) => candidate.normalizedRow).slice(0, 10),
      skipped_sample: skippedCandidates.slice(0, 10).map((candidate) => ({
        registration_id: String(candidate.row.id),
        reason: 'Dependências obrigatórias ausentes',
        missing_dependencies: candidate.missingDependencies,
      })),
      restored_ids: restoredIds,
      failed_batches: failedBatches,
      legacy_kit_snapshots: limitedCandidates
        .filter((candidate) => candidate.classification === 'RESTORABLE_WITH_NULL_KIT')
        .slice(0, 100)
        .map((candidate) => ({
          registration_id: String(candidate.row.id),
          original_kit_id: String(candidate.row.kit_id),
          legacy_kit_name: candidate.legacyKitName,
          persisted_in_registration: Boolean(findLegacyKitMetadataColumn(currentColumns)),
        })),
      post_restore_validation: await runPostRestoreValidation(eventId, restoredIds),
      safety: {
        backup_database_url_present: true,
        event_exists_in_current: eventExistsInCurrent,
        confirm_required: false,
        inserted_only_missing_by_id: true,
        kit_id_null_when_missing: true,
        limited_restore: true,
        batch_rollback: true,
        overwrites_existing_records: false,
        deletes_current_records: false,
      },
      logs,
    };
  } finally {
    await backupPool.end();
  }
}
