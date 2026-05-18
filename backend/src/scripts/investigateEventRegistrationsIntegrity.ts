import { query } from '../config/database.js';

type RunParams = {
  eventId?: string;
};

type EventInfo = {
  id: string;
  name: string;
};

type IntegrityStatus =
  | 'OK'
  | 'INSCRICOES_OCULTAS'
  | 'POSSIVEL_DELECAO'
  | 'SOFT_DELETE_PROBLEMA';

type ForeignKeyRule = {
  constraint_name: string;
  delete_rule: string;
};

type HiddenRegistrationSample = {
  id: string;
  runner_id: string | null;
  kit_id: string | null;
  category_id: string | null;
};

type IntegrityDiagnosis = {
  event: EventInfo;
  metrics: {
    total: number;
    with_kit: number;
    visible: number;
    hidden: number;
    hidden_difference: number;
    without_kit: number;
    kits_soft_deleted: number;
    registrations_with_soft_deleted_kit: number;
  };
  sample_hidden: HiddenRegistrationSample[];
  fk_rules: ForeignKeyRule[];
  status: IntegrityStatus;
  conclusion: string;
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const countOne = async (sql: string, params: unknown[] = []): Promise<number> => {
  const result = await query(sql, params);
  return toNumber(result.rows[0]?.count ?? result.rows[0]?.total ?? 0);
};

const tableExists = async (tableName: string): Promise<boolean> => {
  const result = await query(`SELECT to_regclass($1) AS table_name`, [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
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

const resolveEvent = async (eventId?: string): Promise<EventInfo> => {
  const hasNameColumn = await columnExists('events', 'name');
  const hasStartDateColumn = await columnExists('events', 'start_date');
  const nameExpression = hasNameColumn ? 'name' : 'title';
  const dateExpression = hasStartDateColumn ? 'start_date' : 'event_date';

  const result = eventId
    ? await query(
        `SELECT id, ${nameExpression} AS name
           FROM events
          WHERE id = $1
          LIMIT 1`,
        [eventId]
      )
    : await query(
        `SELECT id, ${nameExpression} AS name
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
  };
};

const resolveKitTable = async (): Promise<'kits' | 'event_kits'> => {
  if (await tableExists('event_kits')) return 'event_kits';
  if (await tableExists('kits')) return 'kits';
  throw new Error('Nenhuma tabela de kits encontrada (kits/event_kits)');
};

const buildConclusion = (diagnosis: {
  total: number;
  visible: number;
  hidden: number;
  hiddenDifference: number;
  kitsSoftDeleted: number;
  registrationsWithSoftDeletedKit: number;
  kitTable: string;
  hasDeletedAt: boolean;
}): { status: IntegrityStatus; conclusion: string } => {
  if (diagnosis.registrationsWithSoftDeletedKit > 0) {
    return {
      status: 'SOFT_DELETE_PROBLEMA',
      conclusion:
        `Há ${diagnosis.registrationsWithSoftDeletedKit} inscrição(ões) vinculada(s) a kit(s) soft deletado(s). ` +
        'A listagem pode variar conforme filtros que ignorem ou incluam deleted_at.',
    };
  }

  if (diagnosis.hidden > 0) {
    return {
      status: 'INSCRICOES_OCULTAS',
      conclusion:
        `Há ${diagnosis.hidden} inscrição(ões) com kit_id apontando para kit inexistente em ${diagnosis.kitTable}. ` +
        `A diferença total vs INNER JOIN é ${diagnosis.hiddenDifference}. Causa provável: JOIN interno ou integridade quebrada após exclusão de kits.`,
    };
  }

  if (diagnosis.total === 0) {
    return {
      status: 'POSSIVEL_DELECAO',
      conclusion:
        'Nenhuma inscrição foi encontrada para o evento. Se eram esperadas inscrições, investigar histórico de exclusões ou filtros anteriores.',
    };
  }

  return {
    status: 'OK',
    conclusion:
      `Nenhuma inscrição oculta por kit inexistente foi encontrada. ` +
      `A simulação com INNER JOIN vê ${diagnosis.visible} de ${diagnosis.total} inscrição(ões). ` +
      (diagnosis.hasDeletedAt
        ? `Kits soft deletados no evento: ${diagnosis.kitsSoftDeleted}.`
        : 'A tabela de kits não possui coluna deleted_at.'),
  };
};

export default async function run(params?: RunParams): Promise<IntegrityDiagnosis> {
  const event = await resolveEvent(params?.eventId);
  const kitTable = await resolveKitTable();
  const hasDeletedAt = await columnExists(kitTable, 'deleted_at');

  const total = await countOne(
    `SELECT COUNT(*)::int AS count
       FROM registrations
      WHERE event_id = $1`,
    [event.id]
  );

  const withKit = await countOne(
    `SELECT COUNT(*)::int AS count
       FROM registrations
      WHERE event_id = $1
        AND kit_id IS NOT NULL`,
    [event.id]
  );

  const withoutKit = await countOne(
    `SELECT COUNT(*)::int AS count
       FROM registrations
      WHERE event_id = $1
        AND kit_id IS NULL`,
    [event.id]
  );

  const hidden = await countOne(
    `SELECT COUNT(*)::int AS hidden
       FROM registrations r
       LEFT JOIN ${kitTable} k ON k.id = r.kit_id
      WHERE r.event_id = $1
        AND r.kit_id IS NOT NULL
        AND k.id IS NULL`,
    [event.id]
  );

  const sampleHiddenResult = await query(
    `SELECT r.id, r.runner_id, r.kit_id, r.category_id
       FROM registrations r
       LEFT JOIN ${kitTable} k ON k.id = r.kit_id
      WHERE r.event_id = $1
        AND r.kit_id IS NOT NULL
        AND k.id IS NULL
      LIMIT 20`,
    [event.id]
  );

  const visible = await countOne(
    `SELECT COUNT(*)::int AS count
       FROM registrations r
       INNER JOIN ${kitTable} k ON k.id = r.kit_id
      WHERE r.event_id = $1`,
    [event.id]
  );

  const hiddenDifference = total - visible;

  const kitsSoftDeleted = hasDeletedAt
    ? await countOne(
        `SELECT COUNT(*)::int AS count
           FROM ${kitTable}
          WHERE event_id = $1
            AND deleted_at IS NOT NULL`,
        [event.id]
      )
    : 0;

  const registrationsWithSoftDeletedKit = hasDeletedAt
    ? await countOne(
        `SELECT COUNT(*)::int AS count
           FROM registrations r
           JOIN ${kitTable} k ON k.id = r.kit_id
          WHERE r.event_id = $1
            AND k.deleted_at IS NOT NULL`,
        [event.id]
      )
    : 0;

  const withoutCategory = await countOne(
    `SELECT COUNT(*)::int AS count
       FROM registrations
      WHERE event_id = $1
        AND category_id IS NULL`,
    [event.id]
  );

  const fkRulesResult = await query(
    `SELECT
        tc.constraint_name,
        rc.delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.referential_constraints rc
         ON tc.constraint_name = rc.constraint_name
        AND tc.constraint_schema = rc.constraint_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = 'registrations'
        AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.constraint_name`
  );

  const { status, conclusion } = buildConclusion({
    total,
    visible,
    hidden,
    hiddenDifference,
    kitsSoftDeleted,
    registrationsWithSoftDeletedKit,
    kitTable,
    hasDeletedAt,
  });

  return {
    event,
    metrics: {
      total,
      with_kit: withKit,
      visible,
      hidden,
      hidden_difference: hiddenDifference,
      without_kit: withoutKit,
      kits_soft_deleted: kitsSoftDeleted,
      registrations_with_soft_deleted_kit: registrationsWithSoftDeletedKit,
    },
    sample_hidden: sampleHiddenResult.rows.map((row) => ({
      id: String(row.id),
      runner_id: row.runner_id ? String(row.runner_id) : null,
      kit_id: row.kit_id ? String(row.kit_id) : null,
      category_id: row.category_id ? String(row.category_id) : null,
    })),
    fk_rules: fkRulesResult.rows.map((row) => ({
      constraint_name: String(row.constraint_name),
      delete_rule: String(row.delete_rule),
    })),
    status,
    conclusion:
      `${conclusion} Inscrições sem categoria: ${withoutCategory}. ` +
      `Tabela de kits avaliada: ${kitTable}. Script executado em modo read-only.`,
  };
}
