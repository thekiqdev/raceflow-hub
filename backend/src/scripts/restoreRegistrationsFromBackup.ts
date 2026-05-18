import pg from 'pg';
import { getClient, query } from '../config/database.js';

const { Pool } = pg;

type RunParams = {
  eventId: string;
  confirm?: boolean;
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
  restored_count: number;
  sample: RegistrationRow[];
  missing_sample: RegistrationRow[];
  safety: {
    backup_database_url_present: boolean;
    event_exists_in_current: boolean;
    confirm_required: boolean;
    inserted_only_missing_by_id: boolean;
    overwrites_existing_records: false;
    deletes_current_records: false;
  };
};

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

const filterInsertableColumns = (row: RegistrationRow, currentColumns: string[]): string[] => {
  const rowColumns = new Set(Object.keys(row));
  return currentColumns.filter((column) => rowColumns.has(column));
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

export default async function run(params: RunParams): Promise<RestoreResult> {
  if (!params?.eventId) {
    throw new Error('eventId é obrigatório');
  }

  const eventId = params.eventId;
  const backupPool = createBackupPool();

  try {
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

    if (params.confirm !== true) {
      return {
        eventId,
        mode: 'preview',
        backup_found: backupRows.length,
        current_found: currentIds.size,
        missing_count: missingRows.length,
        restored_count: 0,
        sample: backupRows.slice(0, 10),
        missing_sample: missingRows.slice(0, 10),
        safety: {
          backup_database_url_present: true,
          event_exists_in_current: eventExistsInCurrent,
          confirm_required: true,
          inserted_only_missing_by_id: true,
          overwrites_existing_records: false,
          deletes_current_records: false,
        },
      };
    }

    if (!eventExistsInCurrent) {
      throw new Error(`Evento ${eventId} não existe no banco atual. Restauração bloqueada por segurança.`);
    }

    const client = await getClient();
    let restoredCount = 0;

    try {
      await client.query('BEGIN');

      for (const row of missingRows) {
        const inserted = await insertMissingRegistration(client, row, currentColumns);
        if (inserted) restoredCount++;
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return {
      eventId,
      mode: 'restore',
      backup_found: backupRows.length,
      current_found: currentIds.size,
      missing_count: missingRows.length,
      restored_count: restoredCount,
      sample: backupRows.slice(0, 10),
      missing_sample: missingRows.slice(0, 10),
      safety: {
        backup_database_url_present: true,
        event_exists_in_current: eventExistsInCurrent,
        confirm_required: false,
        inserted_only_missing_by_id: true,
        overwrites_existing_records: false,
        deletes_current_records: false,
      },
    };
  } finally {
    await backupPool.end();
  }
}
