/**
 * Frente 2 — Correção controlada (integrada ao contexto da Frente 1).
 * Segurança:
 * - dry_run por padrão
 * - apply só com hash/contexto do dry_run imediatamente anterior no mesmo escopo
 * - sem correção de cupons
 * - sem delete físico
 * - Bloco B (free_bonus): plano alinhado a bonus_registrations_event + classificação da Fase 1
 *   (v1: apply não altera free_bonus — FREE_BONUS_REVERSAL_SAFE_IN_V1)
 */

import { createHash } from 'crypto';
import { getClient, query } from '../config/database.js';
import {
  runInvitationBonusAudit,
  type BonusRegistrationClassification,
  type EventBonusRegistrationAuditItem,
  type InvitationBonusAuditResult,
} from './invitationBonusAuditService.js';

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

/** Classes da Fase 1 que entram no plano Bloco B (dry_run), mesmo sem leader_invitation_id */
const BLOCO_B_TRIGGER_CLASSES: readonly BonusRegistrationClassification[] = [
  'sem_convite_correspondente',
  'orfa',
  'acima_do_esperado',
  'duplicada',
  'criada_fora_da_regra_da_comissao',
] as const;

export interface BlockBScopeExcludedItem {
  registration_id: string;
  leader_id: string | null;
  commission_id: string | null;
  event_id: string;
  classification_full: string[];
  reason: string;
}

export interface BlockBIgnoredItem {
  registration_id: string;
  leader_id: string | null;
  reason: string;
}

export interface BlockBItem {
  registration_id: string;
  leader_id: string | null;
  commission_id: string | null;
  event_id: string;
  leader_invitation_id: string | null;
  current_status: string | null;
  payment_status: string | null;
  /** Subset das flags que disparam o Bloco B */
  classification: string[];
  /** Classificação completa retornada pela Fase 1 */
  classification_full: string[];
  justification: string;
  action_proposed: 'none_in_v1_apply_blocked';
  action_proposed_human: string;
  reversibility_note: string;
  /** Por registro: executável só se houver estratégia segura global (v1: sempre dry_run-only) */
  item_executability: PlanBlockStatus;
}

export interface InvitationBonusReconciliationDiagnosticRow {
  leader_id: string;
  commission_id: string;
  required_purchases: number;
  paidCount_correto: number;
  expectedBonuses_correto: number;
  timesGranted_db: number;
  missing_invitations_count: number;
  correct_invitations_count: number;
  excess_invitations_count: number;
  bonus_rule_legible: string;
  calculation_source: 'fase1_audit_canonical';
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

  diagnostics_missing_excess: {
    calculation_source: 'fase1_audit_canonical';
    totals: {
      missing_invitations: number;
      correct_invitations: number;
      excess_invitations: number;
    };
    rows: InvitationBonusReconciliationDiagnosticRow[];
  };

  /** Transparência do filtro de líder no Bloco B */
  bloco_b_scope: {
    leader_filter_applied: boolean;
    leader_id_filter: string | null;
    note: string;
    excluded_count_orphan_no_leader: number;
    excluded_count_other_leader: number;
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
        /** Totais alinhados à Fase 1 no escopo do dry_run */
        summary: {
          /** Incluídos no plano (flags de risco + escopo) */
          detected_in_scope: number;
          /** Subset com item_executability executável (v1 free_bonus: 0) */
          executable_count: number;
          dry_run_only_count: number;
          /** Apenas válidos / sem flags de plano */
          ignored_valid_or_neutral_count: number;
          /** Tinham flags de plano mas ficaram fora do escopo de líder */
          excluded_by_leader_scope_count: number;
          /** Compat: igual a detected_in_scope */
          registrations_free_bonus_planned: number;
        };
        items: BlockBItem[];
        excluded_by_leader_scope: BlockBScopeExcludedItem[];
        ignored_not_in_plan: BlockBIgnoredItem[];
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

function uniqueStrings(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => String(s)))).sort();
}

/**
 * Mesma registration_id pode aparecer mais de uma vez no array da Fase 1; unifica classificações.
 */
function dedupeBonusRegistrationsEvent(items: EventBonusRegistrationAuditItem[]): EventBonusRegistrationAuditItem[] {
  const map = new Map<string, EventBonusRegistrationAuditItem>();
  for (const it of items) {
    const cur = map.get(it.registration_id);
    if (!cur) {
      map.set(it.registration_id, { ...it, classification: [...it.classification] });
      continue;
    }
    const mergedClass = uniqueStrings([...cur.classification, ...it.classification]) as BonusRegistrationClassification[];
    map.set(it.registration_id, {
      ...cur,
      leader_id: cur.leader_id ?? it.leader_id,
      commission_id: cur.commission_id ?? it.commission_id,
      leader_invitation_id: cur.leader_invitation_id ?? it.leader_invitation_id,
      bonus_registration_id: cur.bonus_registration_id ?? it.bonus_registration_id,
      coupon_code: cur.coupon_code ?? it.coupon_code,
      created_at: cur.created_at ?? it.created_at,
      status: cur.status ?? it.status,
      payment_status: cur.payment_status ?? it.payment_status,
      event_id: cur.event_id || it.event_id,
      classification: mergedClass,
    });
  }
  return Array.from(map.values());
}

function pickTriggerClasses(classes: BonusRegistrationClassification[]): BonusRegistrationClassification[] {
  return uniqueStrings(
    classes.filter((c) => BLOCO_B_TRIGGER_CLASSES.includes(c)) as string[]
  ) as BonusRegistrationClassification[];
}

function buildBlockBJustification(
  x: EventBonusRegistrationAuditItem,
  triggers: BonusRegistrationClassification[]
): string {
  const bits: string[] = [
    `Derivado da Fase 1 (bonus_registrations_event): flags ${triggers.join(', ')}.`,
  ];
  if (triggers.includes('sem_convite_correspondente')) {
    bits.push('Sem convite (leader_invitation) correspondente na junção usada pela auditoria.');
  }
  if (triggers.includes('orfa')) {
    bits.push('Marcada como órfã (vínculo líder/comissão/convite incompleto ou sem convite).');
  }
  if (triggers.includes('duplicada')) {
    bits.push('Múltiplos leader_invitation_id apontando para a mesma inscrição.');
  }
  if (triggers.includes('acima_do_esperado')) {
    bits.push('Quantidade de inscrições bônus acima do esperado pela regra canônica de comissão.');
  }
  if (triggers.includes('criada_fora_da_regra_da_comissao')) {
    bits.push('Fora da regra de bônus da comissão (tipo/evento) segundo a Fase 1.');
  }
  if (!x.leader_invitation_id) {
    bits.push('leader_invitation_id ausente — o plano não depende desse campo para listar o registro.');
  }
  return bits.join(' ');
}

function buildBlocoBPlan(params: {
  audit: InvitationBonusAuditResult;
  leaderScopeFilter: string | null;
}): {
  items: BlockBItem[];
  excludedByLeaderScope: BlockBScopeExcludedItem[];
  ignoredNotInPlan: BlockBIgnoredItem[];
  excludedCountOrphanNoLeader: number;
  excludedCountOtherLeader: number;
} {
  const { audit, leaderScopeFilter } = params;
  const merged = dedupeBonusRegistrationsEvent(audit.technical_log.bonus_registrations_event);

  const items: BlockBItem[] = [];
  const excludedByLeaderScope: BlockBScopeExcludedItem[] = [];
  const ignoredNotInPlan: BlockBIgnoredItem[] = [];
  let excludedCountOrphanNoLeader = 0;
  let excludedCountOtherLeader = 0;

  for (const x of merged) {
    const triggers = pickTriggerClasses(x.classification);
    const onlyValid =
      x.classification.length > 0 &&
      x.classification.length === 1 &&
      x.classification[0] === 'valida';

    if (triggers.length === 0) {
      ignoredNotInPlan.push({
        registration_id: x.registration_id,
        leader_id: x.leader_id,
        reason: onlyValid
          ? 'Apenas classificação “valida” na Fase 1 — fora do plano Bloco B.'
          : x.classification.length === 0
            ? 'Sem classificação na Fase 1 — ignorado no plano Bloco B.'
            : `Nenhuma flag de plano (${BLOCO_B_TRIGGER_CLASSES.join('|')}) — ignorado.`,
      });
      continue;
    }

    const inLeaderScope =
      !leaderScopeFilter ||
      (x.leader_id !== null && x.leader_id === leaderScopeFilter);

    if (!inLeaderScope) {
      let reason: string;
      if (x.leader_id === null) {
        excludedCountOrphanNoLeader += 1;
        reason =
          'Líder ausente (null) na linha auditada — com filtro por líder, o registro fica fora do escopo operacional do dry_run.';
      } else {
        excludedCountOtherLeader += 1;
        reason = `leader_id=${x.leader_id} difere do filtro (${leaderScopeFilter}) — fora do escopo.`;
      }
      excludedByLeaderScope.push({
        registration_id: x.registration_id,
        leader_id: x.leader_id,
        commission_id: x.commission_id,
        event_id: x.event_id,
        classification_full: [...x.classification],
        reason,
      });
      continue;
    }

    const itemExec: PlanBlockStatus = FREE_BONUS_REVERSAL_SAFE_IN_V1 ? 'executável' : 'dry_run-only';

    items.push({
      registration_id: x.registration_id,
      leader_id: x.leader_id,
      commission_id: x.commission_id,
      event_id: x.event_id,
      leader_invitation_id: x.leader_invitation_id,
      current_status: x.status,
      payment_status: x.payment_status,
      classification: [...triggers],
      classification_full: [...x.classification],
      justification: buildBlockBJustification(x, triggers),
      action_proposed: 'none_in_v1_apply_blocked',
      action_proposed_human: FREE_BONUS_REVERSAL_SAFE_IN_V1
        ? 'Após validação: reversão lógica segura da inscrição free_bonus (sem delete físico).'
        : 'v1: sem apply em free_bonus — apenas planejamento até existir reversão lógica segura aprovada.',
      reversibility_note: FREE_BONUS_REVERSAL_SAFE_IN_V1
        ? 'Reversão por atualização de status/campo conforme estratégia aprovada (sem DELETE).'
        : 'Sem estratégia de reversão lógica segura habilitada na v1 — mantido dry_run-only.',
      item_executability: itemExec,
    });
  }

  return {
    items,
    excludedByLeaderScope,
    ignoredNotInPlan,
    excludedCountOrphanNoLeader,
    excludedCountOtherLeader,
  };
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

function buildBlocoBScopeNote(params: {
  leaderScopeFilter: string | null;
  excludedCountOrphanNoLeader: number;
  excludedCountOtherLeader: number;
}): { scope: InvitationBonusReconciliationResult['bloco_b_scope']; note: string } {
  const { leaderScopeFilter, excludedCountOrphanNoLeader, excludedCountOtherLeader } = params;
  const other = excludedCountOtherLeader;

  if (!leaderScopeFilter) {
    return {
      scope: {
        leader_filter_applied: false,
        leader_id_filter: null,
        note: 'Escopo do Bloco B: todas as inscrições bônus do evento presentes em bonus_registrations_event (Fase 1), com flags de plano.',
        excluded_count_orphan_no_leader: 0,
        excluded_count_other_leader: 0,
      },
      note: 'Sem filtro de líder: nenhum registro excluído do plano Bloco B por escopo de líder.',
    };
  }

  const scope: InvitationBonusReconciliationResult['bloco_b_scope'] = {
    leader_filter_applied: true,
    leader_id_filter: leaderScopeFilter,
    note:
      'Com filtro de líder: o Bloco B lista apenas registration_id cuja leader_id na auditoria coincide com o filtro. ' +
      'Registros órfãos (leader_id null) ou de outro líder aparecem em excluded_by_leader_scope.',
    excluded_count_orphan_no_leader: excludedCountOrphanNoLeader,
    excluded_count_other_leader: other,
  };

  const note =
    `Filtro de líder ativo (${leaderScopeFilter}). ` +
    `Excluídos do plano: ${excludedCountOrphanNoLeader} sem leader_id, ${other} de outro(s) líder(es).`;

  return { scope, note };
}

async function buildDryRun(params: {
  event_id: string;
  leader_id?: string | null;
}): Promise<InvitationBonusReconciliationResult> {
  const scopeType: ScopeType = params.leader_id ? 'single_leader' : 'all_event_leaders';
  const leaderScopeKey = params.leader_id ?? '__all__';
  const leaderScopeFilter = params.leader_id ?? null;

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

  const blocoB = buildBlocoBPlan({ audit, leaderScopeFilter });
  const { scope: bloco_b_scope, note: blocoBScopeNote } = buildBlocoBScopeNote({
    leaderScopeFilter,
    excludedCountOrphanNoLeader: blocoB.excludedCountOrphanNoLeader,
    excludedCountOtherLeader: blocoB.excludedCountOtherLeader,
  });

  const blockBItems = blocoB.items;
  const executableBlockB = blockBItems.filter((i) => i.item_executability === 'executável').length;

  // Diagnóstico (visibilidade): reutiliza required/paid/expected/timesGranted canônicos da Fase 1.
  // missing/excess são apenas derivados desses valores (sem recalcular regra nova).
  const diagnostics_missing_excess: InvitationBonusReconciliationResult['diagnostics_missing_excess'] = {
    calculation_source: 'fase1_audit_canonical',
    rows: audit.technical_log.rows.map((r) => {
      const expectedBonuses = r.expectedBonuses_canonical;
      const timesGranted = r.times_granted_db;
      const missing = Math.max(expectedBonuses - timesGranted, 0);
      const excess = Math.max(timesGranted - expectedBonuses, 0);
      const correct = Math.min(expectedBonuses, timesGranted);
      const required = r.required_purchases;

      const bonus_rule_legible = `1 convite a cada ${required} venda${required === 1 ? '' : 's'}`;

      return {
        leader_id: r.leader_id,
        commission_id: r.commission_id,
        required_purchases: required,
        paidCount_correto: r.paidCount_canonical,
        expectedBonuses_correto: expectedBonuses,
        timesGranted_db: timesGranted,
        missing_invitations_count: missing,
        correct_invitations_count: correct,
        excess_invitations_count: excess,
        bonus_rule_legible,
        calculation_source: 'fase1_audit_canonical',
      };
    }),
    totals: { missing_invitations: 0, correct_invitations: 0, excess_invitations: 0 },
  };

  diagnostics_missing_excess.totals = diagnostics_missing_excess.rows.reduce(
    (acc, x) => {
      acc.missing_invitations += x.missing_invitations_count;
      acc.correct_invitations += x.correct_invitations_count;
      acc.excess_invitations += x.excess_invitations_count;
      return acc;
    },
    { missing_invitations: 0, correct_invitations: 0, excess_invitations: 0 }
  );

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
    bloco_b_excluded_ids: blocoB.excludedByLeaderScope.map((x) => x.registration_id).sort(),
    before,
    preview_after,
    bloco_b_scope_note: blocoBScopeNote,
  });

  const detectedInScope = blockBItems.length;

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
    diagnostics_missing_excess,
    bloco_b_scope,
    consistency_guard: {
      can_apply: true,
      reason: `Dry run válido para apply no mesmo contexto. Bloco B: ${blocoBScopeNote}`,
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
          summary: {
            detected_in_scope: detectedInScope,
            executable_count: executableBlockB,
            dry_run_only_count: blockBItems.filter((i) => i.item_executability === 'dry_run-only').length,
            ignored_valid_or_neutral_count: blocoB.ignoredNotInPlan.length,
            excluded_by_leader_scope_count: blocoB.excludedByLeaderScope.length,
            registrations_free_bonus_planned: detectedInScope,
          },
          items: blockBItems,
          excluded_by_leader_scope: blocoB.excludedByLeaderScope,
          ignored_not_in_plan: blocoB.ignoredNotInPlan,
        },
        summary: {
          invitations_to_change: blockAItems.length,
          registrations_free_bonus_planned: detectedInScope,
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
