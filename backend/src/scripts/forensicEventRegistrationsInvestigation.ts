import { query } from '../config/database.js';

type RunParams = {
  eventId?: string;
};

type EventInfo = {
  id: string;
  name: string;
  created_at: string | null;
};

type CountByEvent = {
  event_id: string;
  event_name?: string;
  total: number;
};

type CountByRunner = {
  runner_id: string | null;
  total: number;
};

type CountByDay = {
  date: string;
  total: number;
};

type ForeignKeyRule = {
  constraint_name: string;
  delete_rule: string;
};

type AuditSignal = {
  table: string;
  count: number;
  sample: Array<Record<string, unknown>>;
};

type RelatedData = {
  leader_invitations: number;
  transfers: number;
  registration_payments?: number;
  registration_history?: number;
  audit_signals: AuditSignal[];
};

type EventComparison = {
  id: string;
  name: string;
  registrations_count: number;
};

type ForensicResult = {
  event: EventInfo;
  registrations_found: number;
  global_distribution: CountByEvent[];
  runner_history: CountByRunner[];
  registrations_by_day: CountByDay[];
  possible_soft_deleted: number;
  related_data: RelatedData;
  fk_rules: ForeignKeyRule[];
  event_comparison: EventComparison[];
  anomaly_detected: boolean;
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

const countRelatedTable = async (tableName: string, eventId: string): Promise<number | undefined> => {
  if (!(await tableExists(tableName))) return undefined;

  if (await columnExists(tableName, 'event_id')) {
    return countOne(`SELECT COUNT(*)::int AS count FROM ${tableName} WHERE event_id = $1`, [eventId]);
  }

  if (await columnExists(tableName, 'registration_id')) {
    return countOne(
      `SELECT COUNT(*)::int AS count
         FROM ${tableName} related
         JOIN registrations r ON r.id = related.registration_id
        WHERE r.event_id = $1`,
      [eventId]
    );
  }

  return undefined;
};

const getAuditSignals = async (): Promise<AuditSignal[]> => {
  const auditTables = ['audit_logs', 'activity_logs', 'event_logs'];
  const signals: AuditSignal[] = [];

  for (const tableName of auditTables) {
    if (!(await tableExists(tableName))) continue;

    const count = await countOne(
      `SELECT COUNT(*)::int AS count
         FROM ${tableName} t
        WHERE to_jsonb(t)::text ILIKE '%DELETE%'
          AND to_jsonb(t)::text ILIKE '%registrations%'`
    );

    const sampleResult = await query(
      `SELECT to_jsonb(t) AS payload
         FROM ${tableName} t
        WHERE to_jsonb(t)::text ILIKE '%DELETE%'
          AND to_jsonb(t)::text ILIKE '%registrations%'
        LIMIT 5`
    );

    signals.push({
      table: tableName,
      count,
      sample: sampleResult.rows.map((row) => row.payload as Record<string, unknown>),
    });
  }

  return signals;
};

const detectAbruptDrop = (registrationsByDay: CountByDay[]): boolean => {
  const chronological = [...registrationsByDay].reverse();
  for (let index = 1; index < chronological.length; index++) {
    const previous = chronological[index - 1].total;
    const current = chronological[index].total;
    if (previous >= 10 && current <= Math.floor(previous * 0.2)) {
      return true;
    }
  }
  return false;
};

const buildConclusion = (params: {
  registrationsFound: number;
  maxOtherEventRegistrations: number;
  leaderInvitations: number;
  auditDeleteSignals: number;
  possibleSoftDeleted: number;
  abruptDropDetected: boolean;
}): { anomalyDetected: boolean; conclusion: string } => {
  const reasons: string[] = [];

  if (params.registrationsFound === 0 && params.maxOtherEventRegistrations > 0) {
    reasons.push('o evento selecionado não possui inscrições, enquanto outros eventos possuem volume relevante');
  }

  if (params.registrationsFound === 0 && params.leaderInvitations > 0) {
    reasons.push('há leader_invitations para o evento, mas nenhuma inscrição em registrations');
  }

  if (params.auditDeleteSignals > 0) {
    reasons.push('há sinais de DELETE relacionados a registrations em tabelas de auditoria/log');
  }

  if (params.possibleSoftDeleted > 0) {
    reasons.push('existem inscrições soft-deletadas para o evento');
  }

  if (params.abruptDropDetected) {
    reasons.push('a distribuição por data mostra queda abrupta no volume de inscrições criadas');
  }

  if (reasons.length === 0) {
    return {
      anomalyDetected: false,
      conclusion:
        'Nenhuma anomalia forense forte detectada. Os dados atuais não indicam deleção, migração ou inconsistência estrutural evidente.',
    };
  }

  return {
    anomalyDetected: true,
    conclusion: `Possível deleção real, dados movidos ou inconsistência estrutural: ${reasons.join('; ')}.`,
  };
};

export default async function run(params?: RunParams): Promise<ForensicResult> {
  const event = await resolveEvent(params?.eventId);
  const hasRegistrationDeletedAt = await columnExists('registrations', 'deleted_at');
  const hasTransferredFrom = await columnExists('registrations', 'transferred_from_registration_id');
  const hasTransferredTo = await columnExists('registrations', 'transferred_to_registration_id');
  const { nameExpression } = await resolveEventColumns();

  const registrationsFound = await countOne(
    `SELECT COUNT(*)::int AS count
       FROM registrations
      WHERE event_id = $1`,
    [event.id]
  );

  const globalDistributionResult = await query(
    `SELECT event_id, COUNT(*)::int AS total
       FROM registrations
      GROUP BY event_id
      ORDER BY COUNT(*) DESC
      LIMIT 20`
  );

  const runnerHistoryResult = await query(
    `SELECT runner_id, COUNT(*)::int AS total
       FROM registrations
      GROUP BY runner_id
      ORDER BY COUNT(*) DESC
      LIMIT 20`
  );

  const registrationsByDayResult = await query(
    `SELECT DATE(created_at) AS date, COUNT(*)::int AS total
       FROM registrations
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) DESC
      LIMIT 30`
  );

  const possibleSoftDeleted = hasRegistrationDeletedAt
    ? await countOne(
        `SELECT COUNT(*)::int AS count
           FROM registrations
          WHERE event_id = $1
            AND deleted_at IS NOT NULL`,
        [event.id]
      )
    : 0;

  const transfers = hasTransferredFrom || hasTransferredTo
    ? await countOne(
        `SELECT COUNT(*)::int AS count
           FROM registrations
          WHERE ${[
            hasTransferredFrom ? 'transferred_from_registration_id IS NOT NULL' : null,
            hasTransferredTo ? 'transferred_to_registration_id IS NOT NULL' : null,
          ].filter(Boolean).join(' OR ') || 'FALSE'}`
      )
    : 0;

  const auditSignals = await getAuditSignals();
  const auditDeleteSignals = auditSignals.reduce((sum, signal) => sum + signal.count, 0);

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

  const leaderInvitations = (await countRelatedTable('leader_invitations', event.id)) ?? 0;
  const registrationPayments = await countRelatedTable('registration_payments', event.id);
  const registrationHistory = await countRelatedTable('registration_history', event.id);

  const eventComparisonResult = await query(
    `SELECT e.id, e.${nameExpression} AS name, COUNT(r.id)::int AS registrations_count
       FROM events e
       LEFT JOIN registrations r ON r.event_id = e.id
      GROUP BY e.id, e.${nameExpression}
      ORDER BY COUNT(r.id) DESC
      LIMIT 20`
  );

  const globalDistribution = globalDistributionResult.rows.map((row) => ({
    event_id: String(row.event_id),
    total: toNumber(row.total),
  }));

  const registrationsByDay = registrationsByDayResult.rows.map((row) => ({
    date: row.date ? new Date(row.date).toISOString().slice(0, 10) : '',
    total: toNumber(row.total),
  }));

  const maxOtherEventRegistrations = globalDistribution
    .filter((row) => row.event_id !== event.id)
    .reduce((max, row) => Math.max(max, row.total), 0);

  const abruptDropDetected = detectAbruptDrop(registrationsByDay);
  const { anomalyDetected, conclusion } = buildConclusion({
    registrationsFound,
    maxOtherEventRegistrations,
    leaderInvitations,
    auditDeleteSignals,
    possibleSoftDeleted,
    abruptDropDetected,
  });

  return {
    event,
    registrations_found: registrationsFound,
    global_distribution: globalDistribution,
    runner_history: runnerHistoryResult.rows.map((row) => ({
      runner_id: row.runner_id ? String(row.runner_id) : null,
      total: toNumber(row.total),
    })),
    registrations_by_day: registrationsByDay,
    possible_soft_deleted: possibleSoftDeleted,
    related_data: {
      leader_invitations: leaderInvitations,
      transfers,
      registration_payments: registrationPayments,
      registration_history: registrationHistory,
      audit_signals: auditSignals,
    },
    fk_rules: fkRulesResult.rows.map((row) => ({
      constraint_name: String(row.constraint_name),
      delete_rule: String(row.delete_rule),
    })),
    event_comparison: eventComparisonResult.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
      registrations_count: toNumber(row.registrations_count),
    })),
    anomaly_detected: anomalyDetected,
    conclusion,
  };
}
