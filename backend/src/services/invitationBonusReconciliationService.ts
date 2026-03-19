/**
 * Frente 2 — Correção controlada (integrada ao contexto da Frente 1).
 * Segurança:
 * - dry_run por padrão
 * - apply só com hash/contexto do dry_run imediatamente anterior no mesmo escopo
 * - sem correção de cupons
 * - sem delete físico
 * - Bloco B (free_bonus) só executável se houver estratégia segura (v1: dry_run-only)
 */

import { createHash } from 'crypto';
import { getClient, query } from '../config/database.js';
import { runInvitationBonusAudit, type InvitationBonusAuditResult } from './invitationBonusAuditService.js';

export type ReconciliationMode = 'dry_run' | 'apply';
export type ScopeType = 'single_leader' | 'all_event_leaders';
export type PlanBlockStatus = 'executável' | 'dry_run-only';

export interface ReconciliationRequest {
  event_id: string;
  leader_id?: string | null;
  mode: ReconciliationMode;
  audit_snapshot_hash?: string | null;
  dry_run_hash?: string | null;
}

interface BlockAItem {
  leader_invitation_id: string;
  leader_id: string;
  commission_id: string;
  event_id: string;
  current_status: string;
  justification: string;
  action_proposed: 'set_status_expired';
  reversibility_note: string;
}

interface BlockBItem {
  registration_id: string;
  leader_id: string | null;
  commission_id: string | null;
  event_id: string;
  current_status: string | null;
  payment_status: string | null;
  classification: string[];
  justification: string;
  action_proposed: 'none_in_v1_dry_run_only';
  reversibility_note: string;
}

export interface InvitationBonusReconciliationResult {
  mode: ReconciliationMode;
  event_id: string;
  leader_id: string | null;
  scope_type: ScopeType;
  free_bonus_block_status: PlanBlockStatus;
  free_bonus_block_reason: string;
  audit_snapshot_hash: string;
  dry_run_hash: string;
  consistency_guard: {
    can_apply: boolean;
    reason: string;
    expected_event_id: string;
    expected_leader_scope: string;
    expected_audit_snapshot_hash: string;
    expected_dry_run_hash: string;
  };
  reports: {
    before: {
      invitations_available: number;
      invitations_sent: number;
      invitations_used: number;
      invitations_expired: number;
      convites_esperados: number;
      free_bonus_total: number;
      free_bonus_validas: number;
      free_bonus_excesso: number;
      free_bonus_sem_convite: number;
    };
    change_plan: {
      bloco_a_leader_invitations: {
        status: PlanBlockStatus;
        items: BlockAItem[];
      };
      bloco_b_registrations_free_bonus: {
        status: PlanBlockStatus;
        items: BlockBItem[];
      };
      summary: {
        invitations_to_change: number;
        registrations_free_bonus_planned: number;
      };
    };
    preview_after: {
      invitations_available: number;
      invitations_expired: number;
      free_bonus_total: number;
      note: string;
    };
    after_apply?: {
      invitations_changed: number;
      invitations_changed_ids: string[];
      free_bonus_changed: number;
      note: string;
    };
  };
}

const FREE_BONUS_REVERSAL_SAFE_IN_V1 = false;

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

function hashStable(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

async function getBlockAItems(audit: InvitationBonusAuditResult, eventId: string): Promise<BlockAItem[]> {
  const out: BlockAItem[] = [];

  for (const row of audit.technical_log.rows) {
    const expected = row.comparativo_bonus_extras.convites_esperados;
    const sentUsed = row.times_sent_db + row.times_used_db;
    const allowedAvailable = Math.max(0, expected - sentUsed);
    const excessAvailable = Math.max(0, row.times_available_db - allowedAvailable);
    if (excessAvailable <= 0) continue;

    const q = await query(
      `SELECT id::text AS id, status::text AS status
       FROM leader_invitations
       WHERE event_id = $1
         AND leader_id = $2
         AND commission_id = $3
         AND status = 'available'
       ORDER BY created_at DESC
       LIMIT $4`,
      [eventId, row.leader_id, row.commission_id, excessAvailable]
    );

    for (const inv of q.rows as { id: string; status: string }[]) {
      out.push({
        leader_invitation_id: inv.id,
        leader_id: row.leader_id,
        commission_id: row.commission_id,
        event_id: eventId,
        current_status: inv.status,
        justification: `Convite available excedente: available=${row.times_available_db}, allowed=${allowedAvailable}, expected=${expected}, sent+used=${sentUsed}`,
        action_proposed: 'set_status_expired',
        reversibility_note: 'Reversível por atualização de status (sem delete físico).',
      });
    }
  }

  return out;
}

function getBlockBItems(audit: InvitationBonusAuditResult): BlockBItem[] {
  const problematic = new Set<string>(
    [
      ...audit.technical_log.bonus_event_summary.registration_ids_bonus_excesso,
      ...audit.technical_log.bonus_event_summary.registration_ids_bonus_orfaos,
      ...audit.technical_log.bonus_event_summary.registration_ids_bonus_sem_convite,
    ].filter(Boolean)
  );

  return audit.technical_log.bonus_registrations_event
    .filter((x) => problematic.has(x.registration_id))
    .map((x) => ({
      registration_id: x.registration_id,
      leader_id: x.leader_id,
      commission_id: x.commission_id,
      event_id: x.event_id,
      current_status: x.status,
      payment_status: x.payment_status,
      classification: x.classification,
      justification: `Classificação de risco: ${x.classification.join(', ')}`,
      action_proposed: 'none_in_v1_dry_run_only',
      reversibility_note: FREE_BONUS_REVERSAL_SAFE_IN_V1
        ? 'Existe estratégia reversível definida para free_bonus.'
        : 'Sem estratégia de reversão lógica segura definida na v1 (bloco B dry_run-only).',
    }));
}

async function buildDryRun(params: {
  event_id: string;
  leader_id?: string | null;
}): Promise<InvitationBonusReconciliationResult> {
  const scopeType: ScopeType = params.leader_id ? 'single_leader' : 'all_event_leaders';
  const leaderScopeKey = params.leader_id ?? '__all__';

  const audit = await runInvitationBonusAudit({
    event_id: params.event_id,
    leader_id: params.leader_id ?? undefined,
  });

  const audit_snapshot_hash = hashStable({
    event_id: audit.event_id,
    leader_id_filter: audit.leader_id_filter,
    rows: audit.technical_log.rows,
    bonus_event_summary: audit.technical_log.bonus_event_summary,
    bonus_registrations_event: audit.technical_log.bonus_registrations_event,
  });

  const blockAItems = await getBlockAItems(audit, params.event_id);
  const blockBItems = getBlockBItems(audit);

  const before = {
    invitations_available: audit.technical_log.rows.reduce((a, r) => a + r.times_available_db, 0),
    invitations_sent: audit.technical_log.rows.reduce((a, r) => a + r.times_sent_db, 0),
    invitations_used: audit.technical_log.rows.reduce((a, r) => a + r.times_used_db, 0),
    invitations_expired: audit.technical_log.rows.reduce((a, r) => a + r.times_expired_db, 0),
    convites_esperados: audit.technical_log.bonus_event_summary.convites_esperados,
    free_bonus_total: audit.technical_log.bonus_event_summary.inscricoes_bonus_existentes,
    free_bonus_validas: audit.technical_log.bonus_event_summary.inscricoes_bonus_validas,
    free_bonus_excesso: audit.technical_log.bonus_event_summary.inscricoes_bonus_excedentes,
    free_bonus_sem_convite: audit.technical_log.bonus_event_summary.registration_ids_bonus_sem_convite.length,
  };

  const preview_after = {
    invitations_available: Math.max(0, before.invitations_available - blockAItems.length),
    invitations_expired: before.invitations_expired + blockAItems.length,
    free_bonus_total: before.free_bonus_total,
    note: FREE_BONUS_REVERSAL_SAFE_IN_V1
      ? 'Bloco B executável nesta configuração.'
      : 'Bloco B permanece planejado (dry_run-only) por ausência de reversão segura na v1.',
  };

  const dry_run_hash = hashStable({
    event_id: params.event_id,
    leader_scope: leaderScopeKey,
    scope_type: scopeType,
    audit_snapshot_hash,
    block_a_ids: blockAItems.map((x) => x.leader_invitation_id).sort(),
    block_b_ids: blockBItems.map((x) => x.registration_id).sort(),
    before,
    preview_after,
  });

  return {
    mode: 'dry_run',
    event_id: params.event_id,
    leader_id: params.leader_id ?? null,
    scope_type: scopeType,
    free_bonus_block_status: FREE_BONUS_REVERSAL_SAFE_IN_V1 ? 'executável' : 'dry_run-only',
    free_bonus_block_reason: FREE_BONUS_REVERSAL_SAFE_IN_V1
      ? 'Mecanismo seguro de reversão está disponível.'
      : 'Sem mecanismo seguro de reversão lógica para free_bonus na v1.',
    audit_snapshot_hash,
    dry_run_hash,
    consistency_guard: {
      can_apply: true,
      reason: 'Dry run válido para apply no mesmo contexto, sem divergência.',
      expected_event_id: params.event_id,
      expected_leader_scope: leaderScopeKey,
      expected_audit_snapshot_hash: audit_snapshot_hash,
      expected_dry_run_hash: dry_run_hash,
    },
    reports: {
      before,
      change_plan: {
        bloco_a_leader_invitations: {
          status: 'executável',
          items: blockAItems,
        },
        bloco_b_registrations_free_bonus: {
          status: FREE_BONUS_REVERSAL_SAFE_IN_V1 ? 'executável' : 'dry_run-only',
          items: blockBItems,
        },
        summary: {
          invitations_to_change: blockAItems.length,
          registrations_free_bonus_planned: blockBItems.length,
        },
      },
      preview_after,
    },
  };
}

export async function runInvitationBonusReconciliation(
  params: ReconciliationRequest
): Promise<InvitationBonusReconciliationResult> {
  const dryRun = await buildDryRun({
    event_id: params.event_id,
    leader_id: params.leader_id ?? undefined,
  });

  if (params.mode === 'dry_run') {
    return dryRun;
  }

  if (!params.audit_snapshot_hash || !params.dry_run_hash) {
    throw appError('Para apply, audit_snapshot_hash e dry_run_hash são obrigatórios.', 400);
  }

  const sameAudit = params.audit_snapshot_hash === dryRun.audit_snapshot_hash;
  const sameDryRun = params.dry_run_hash === dryRun.dry_run_hash;
  if (!sameAudit || !sameDryRun) {
    throw appError(
      'Divergência de consistência detectada. Execute novo dry_run no mesmo contexto antes do apply.',
      409
    );
  }

  const idsToExpire = dryRun.reports.change_plan.bloco_a_leader_invitations.items.map((x) => x.leader_invitation_id);
  let changedIds: string[] = [];

  if (idsToExpire.length > 0) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const upd = await client.query(
        `UPDATE leader_invitations
         SET status = 'expired', updated_at = NOW()
         WHERE id = ANY($1::uuid[])
           AND status = 'available'
         RETURNING id::text AS id`,
        [idsToExpire]
      );
      changedIds = (upd.rows as { id: string }[]).map((r) => r.id);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  return {
    ...dryRun,
    mode: 'apply',
    reports: {
      ...dryRun.reports,
      after_apply: {
        invitations_changed: changedIds.length,
        invitations_changed_ids: changedIds,
        free_bonus_changed: 0,
        note: FREE_BONUS_REVERSAL_SAFE_IN_V1
          ? 'Apply executado para blocos habilitados.'
          : 'Bloco B (free_bonus) permaneceu dry_run-only por segurança.',
      },
    },
  };
}

