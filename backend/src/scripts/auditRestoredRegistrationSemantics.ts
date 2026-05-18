import pg from 'pg';
import { query } from '../config/database.js';

const { Pool } = pg;

type RunParams = {
  eventId: string;
};

type RegistrationRow = Record<string, unknown> & {
  id: string;
};

type InvitationRow = Record<string, unknown> & {
  bonus_registration_id: string;
};

type ValueCount = {
  value: string;
  count: number;
};

type DivergenceSample = {
  registration_id: string;
  backup: {
    payment_method: string | null;
    payment_status: string | null;
    status: string | null;
    total_amount: number;
    has_leader_invitation: boolean;
  };
  current: {
    payment_method: string | null;
    payment_status: string | null;
    status: string | null;
    total_amount: number;
    has_leader_invitation: boolean;
  };
  divergences: string[];
};

type AuditResult = {
  eventId: string;
  mode: 'read_only_semantic_audit';
  totals: {
    backup_registrations: number;
    current_registrations: number;
    compared_registrations: number;
    current_not_in_backup: number;
  };
  payment_method_matrix: {
    backup: ValueCount[];
    current: ValueCount[];
  };
  payment_status_matrix: {
    backup: ValueCount[];
    current: ValueCount[];
  };
  combined_semantics_matrix: {
    backup: ValueCount[];
    current: ValueCount[];
  };
  leader_invitations: {
    backup_linked_count: number;
    current_linked_count: number;
    lost_link_count: number;
    gained_link_count: number;
    backup_rows: number;
    current_rows: number;
  };
  free_bonus_orphans: {
    current_count: number;
    sample_registration_ids: string[];
  };
  potential_inflated_revenue: {
    count: number;
    total_amount_sum: number;
    sample_registration_ids: string[];
  };
  divergences: {
    payment_method_count: number;
    payment_status_count: number;
    leader_invitation_link_count: number;
    sample: DivergenceSample[];
  };
  conclusion: string;
  safety: {
    read_only: true;
    inserts: false;
    updates: false;
    deletes: false;
    restore_executed: false;
    reconcile_executed: false;
  };
  logs: string[];
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

const tableExists = async (
  executor: Pick<pg.Pool, 'query'> | { query: typeof query },
  tableName: string
): Promise<boolean> => {
  const result = await executor.query(`SELECT to_regclass($1) AS table_name`, [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
};

const toStringOrNull = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const valueKey = (value: unknown): string => toStringOrNull(value) ?? '(null)';

const countValues = (rows: RegistrationRow[], column: string): ValueCount[] => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = valueKey(row[column]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
};

const countCombinedSemantics = (rows: RegistrationRow[]): ValueCount[] => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = `${valueKey(row.payment_status)} / ${valueKey(row.payment_method)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
};

const loadLeaderInvitations = async (
  executor: Pick<pg.Pool, 'query'> | { query: typeof query },
  registrationIds: string[]
): Promise<InvitationRow[]> => {
  if (registrationIds.length === 0 || !(await tableExists(executor, 'leader_invitations'))) return [];

  const result = await executor.query<InvitationRow>(
    `SELECT *
       FROM leader_invitations
      WHERE bonus_registration_id = ANY($1::uuid[])`,
    [registrationIds]
  );

  return result.rows;
};

const hasInvitationSemantics = (row: RegistrationRow, hasBackupInvitation: boolean): boolean => {
  return row.payment_method === 'free_bonus' || row.payment_status === 'convidado' || hasBackupInvitation;
};

export default async function run(params: RunParams): Promise<AuditResult> {
  if (!params?.eventId) {
    throw new Error('eventId é obrigatório');
  }

  const eventId = params.eventId;
  const { log, logs } = createStructuredLogger();
  const backupPool = createBackupPool();

  try {
    log(`Iniciando auditoria semântica read-only para evento ${eventId}`);
    log('Nenhum restore, reconcile, update, insert ou delete será executado.');

    const [backupResult, currentResult] = await Promise.all([
      backupPool.query<RegistrationRow>(
        `SELECT *
           FROM registrations
          WHERE event_id = $1
          ORDER BY created_at ASC NULLS LAST, id ASC`,
        [eventId]
      ),
      query(
        `SELECT *
           FROM registrations
          WHERE event_id = $1
          ORDER BY created_at ASC NULLS LAST, id ASC`,
        [eventId]
      ),
    ]);

    const backupRows = backupResult.rows;
    const currentRows = currentResult.rows as RegistrationRow[];
    const currentById = new Map(currentRows.map((row) => [String(row.id), row]));
    const backupById = new Map(backupRows.map((row) => [String(row.id), row]));
    const comparedBackupRows = backupRows.filter((row) => currentById.has(String(row.id)));
    const comparedCurrentRows = comparedBackupRows.map((row) => currentById.get(String(row.id)) as RegistrationRow);
    const comparedIds = comparedBackupRows.map((row) => String(row.id));

    log(`Backup encontrado: ${backupRows.length}`);
    log(`Atual encontrado: ${currentRows.length}`);
    log(`Inscrições comparadas por ID: ${comparedIds.length}`);

    const [backupInvitations, currentInvitations] = await Promise.all([
      loadLeaderInvitations(backupPool, comparedIds),
      loadLeaderInvitations({ query }, comparedIds),
    ]);

    const backupInvitationIds = new Set(backupInvitations.map((row) => String(row.bonus_registration_id)));
    const currentInvitationIds = new Set(currentInvitations.map((row) => String(row.bonus_registration_id)));
    const lostLinkIds = [...backupInvitationIds].filter((id) => !currentInvitationIds.has(id));
    const gainedLinkIds = [...currentInvitationIds].filter((id) => !backupInvitationIds.has(id));
    const freeBonusOrphanIds = comparedCurrentRows
      .filter((row) => row.payment_method === 'free_bonus' && !currentInvitationIds.has(String(row.id)))
      .map((row) => String(row.id));

    const potentialInflatedRows = comparedCurrentRows.filter((currentRow) => {
      const registrationId = String(currentRow.id);
      const backupRow = backupById.get(registrationId);
      if (!backupRow) return false;
      return (
        hasInvitationSemantics(backupRow, backupInvitationIds.has(registrationId)) &&
        currentRow.payment_status === 'paid' &&
        currentRow.payment_method !== 'free_bonus'
      );
    });

    let paymentMethodDivergences = 0;
    let paymentStatusDivergences = 0;
    let leaderInvitationDivergences = 0;
    const sample: DivergenceSample[] = [];

    for (const backupRow of comparedBackupRows) {
      const registrationId = String(backupRow.id);
      const currentRow = currentById.get(registrationId);
      if (!currentRow) continue;

      const divergences: string[] = [];
      if (toStringOrNull(backupRow.payment_method) !== toStringOrNull(currentRow.payment_method)) {
        paymentMethodDivergences++;
        divergences.push('payment_method');
      }
      if (toStringOrNull(backupRow.payment_status) !== toStringOrNull(currentRow.payment_status)) {
        paymentStatusDivergences++;
        divergences.push('payment_status');
      }
      const backupHasInvitation = backupInvitationIds.has(registrationId);
      const currentHasInvitation = currentInvitationIds.has(registrationId);
      if (backupHasInvitation !== currentHasInvitation) {
        leaderInvitationDivergences++;
        divergences.push('leader_invitations');
      }

      if (divergences.length > 0 && sample.length < 50) {
        sample.push({
          registration_id: registrationId,
          backup: {
            payment_method: toStringOrNull(backupRow.payment_method),
            payment_status: toStringOrNull(backupRow.payment_status),
            status: toStringOrNull(backupRow.status),
            total_amount: toNumber(backupRow.total_amount),
            has_leader_invitation: backupHasInvitation,
          },
          current: {
            payment_method: toStringOrNull(currentRow.payment_method),
            payment_status: toStringOrNull(currentRow.payment_status),
            status: toStringOrNull(currentRow.status),
            total_amount: toNumber(currentRow.total_amount),
            has_leader_invitation: currentHasInvitation,
          },
          divergences,
        });
      }
    }

    const potentialInflatedIds = potentialInflatedRows.map((row) => String(row.id));
    const potentialInflatedAmount = potentialInflatedRows.reduce((sum, row) => sum + toNumber(row.total_amount), 0);
    const hasSemanticRisk =
      lostLinkIds.length > 0 ||
      freeBonusOrphanIds.length > 0 ||
      potentialInflatedRows.length > 0 ||
      paymentMethodDivergences > 0 ||
      paymentStatusDivergences > 0;

    log(`Leader invitations no backup: ${backupInvitations.length}`);
    log(`Leader invitations no atual: ${currentInvitations.length}`);
    log(`Vínculos perdidos: ${lostLinkIds.length}`);
    log(`Free_bonus órfãos no atual: ${freeBonusOrphanIds.length}`);
    log(`Receita potencialmente inflada: ${potentialInflatedRows.length} inscrição(ões), total ${potentialInflatedAmount.toFixed(2)}`);
    log(`Divergências payment_method: ${paymentMethodDivergences}`);
    log(`Divergências payment_status: ${paymentStatusDivergences}`);

    return {
      eventId,
      mode: 'read_only_semantic_audit',
      totals: {
        backup_registrations: backupRows.length,
        current_registrations: currentRows.length,
        compared_registrations: comparedIds.length,
        current_not_in_backup: currentRows.filter((row) => !backupById.has(String(row.id))).length,
      },
      payment_method_matrix: {
        backup: countValues(comparedBackupRows, 'payment_method'),
        current: countValues(comparedCurrentRows, 'payment_method'),
      },
      payment_status_matrix: {
        backup: countValues(comparedBackupRows, 'payment_status'),
        current: countValues(comparedCurrentRows, 'payment_status'),
      },
      combined_semantics_matrix: {
        backup: countCombinedSemantics(comparedBackupRows),
        current: countCombinedSemantics(comparedCurrentRows),
      },
      leader_invitations: {
        backup_linked_count: backupInvitationIds.size,
        current_linked_count: currentInvitationIds.size,
        lost_link_count: lostLinkIds.length,
        gained_link_count: gainedLinkIds.length,
        backup_rows: backupInvitations.length,
        current_rows: currentInvitations.length,
      },
      free_bonus_orphans: {
        current_count: freeBonusOrphanIds.length,
        sample_registration_ids: freeBonusOrphanIds.slice(0, 50),
      },
      potential_inflated_revenue: {
        count: potentialInflatedRows.length,
        total_amount_sum: Number(potentialInflatedAmount.toFixed(2)),
        sample_registration_ids: potentialInflatedIds.slice(0, 50),
      },
      divergences: {
        payment_method_count: paymentMethodDivergences,
        payment_status_count: paymentStatusDivergences,
        leader_invitation_link_count: leaderInvitationDivergences,
        sample,
      },
      conclusion: hasSemanticRisk
        ? 'Foram encontradas divergências semânticas. Antes de continuar o restore completo, avaliar restauração/correção de leader_invitations e vínculos auxiliares de convite.'
        : 'A semântica financeira e de convites aparenta estar preservada para as inscrições comparadas.',
      safety: {
        read_only: true,
        inserts: false,
        updates: false,
        deletes: false,
        restore_executed: false,
        reconcile_executed: false,
      },
      logs,
    };
  } finally {
    await backupPool.end();
  }
}
