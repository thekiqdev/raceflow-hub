/**
 * Frente 2 — Correção controlada (integrada ao contexto da Frente 1).
 * Segurança:
 * - dry_run por padrão
 * - apply só com hash/contexto do dry_run imediatamente anterior no mesmo escopo
 * - sem correção de cupons
 * - DELETE físico controlado (somente registrations free_bonus elegíveis)
 * - Bloco B (free_bonus): plano alinhado a bonus_registrations_event + classificação da Fase 1
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
  /**
   * Required for physical deletes to populate `registration_reconciliation_backup.executed_by`.
   */
  executed_by?: string;
  /**
   * Safety gate required for `mode=apply` before doing any physical deletion.
   * The controller is expected to enforce this too.
   */
  apply_confirmed?: boolean;
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
  // Plano de exclusão: somente candidatos operacionais às remoções.
  // "orfa" e outros rótulos podem existir em classification_full, mas não são candidatos
  // a exclusão no modelo atual de Bloco B desta Frente 2.
  'sem_convite_correspondente',
  'acima_do_esperado',
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

export type BlocoBOperationalGroup =
  | 'ORFA_SEM_CONVITE'
  | 'EXCESSO_ACIMA_DO_ESPERADO'
  | 'VALIDA_NAO_MEXER';

export interface BlocoBOperationalItem {
  registration_id: string;
  leader_id: string | null;
  commission_id: string | null;
  event_id: string;
  leader_invitation_id: string | null;
  status: string | null;
  payment_status: string | null;
  classification: string[];
  motivo_operacional: string;
  grupo_operacional: BlocoBOperationalGroup;
  planejada_para_exclusao: 'sim' | 'não';
}

export interface InvitationBonusReconciliationDiagnosticsBlocoBOperational {
  totals: {
    total_free_bonus_detectadas: number;
    total_free_bonus_orfas_sem_convite: number;
    total_free_bonus_acima_do_esperado: number;
    total_free_bonus_validas: number;
    total_free_bonus_planejadas_para_exclusao: number;
    total_free_bonus_bloqueadas_por_seguranca: number;
  };
  lists: {
    ORFA_SEM_CONVITE: BlocoBOperationalItem[];
    EXCESSO_ACIMA_DO_ESPERADO: BlocoBOperationalItem[];
    VALIDA_NAO_MEXER: BlocoBOperationalItem[];
  };
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

  diagnostics_bloco_b_operacional: InvitationBonusReconciliationDiagnosticsBlocoBOperational;

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
          physical_delete_plan: FreeBonusPhysicalDeletePlan;
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
      physical_delete?: {
        deleted_count: number;
        deleted_ids: string[];
        backup_saved_ids: string[];
        remaining_free_bonus_registrations_in_event: number;
      };
      note: string;
    };
  };
}

type PhysicalDeleteDecision = 'elegível_para_delete_fisico' | 'bloqueada_por_seguranca';

export interface FreeBonusPhysicalDeleteItem {
  registration_id: string;
  leader_id: string | null;
  commission_id: string | null;
  leader_invitation_id: string | null;
  status: string | null;
  payment_status: string | null;
  classification: string[];
  motivo_operacional: string;
  decision: PhysicalDeleteDecision;
}

export interface FreeBonusPhysicalDeletePlan {
  /**
   * Recorte descrito para candidatas à exclusão física.
   * O front deve validar que este recorte está sendo usado na execução.
   */
  recorte: {
    must_include_classification: 'sem_convite_correspondente';
    must_have_leader_invitation_id_null: true;
    must_have_leader_id_null: true;
    must_have_commission_id_null: true;
    must_have_payment_method_free_bonus: true;
    must_not_be_classified_as_valida: true;
    must_not_be_classified_as_acima_do_esperado: true;
  };
  totals: {
    total_free_bonus_analisadas: number;
    total_candidatas_exclusao_fisica: number;
    total_elegiveis_para_delete_fisico: number;
    total_excluidas_do_escopo_por_seguranca: number;
  };
  elegiveis_para_delete_fisico: FreeBonusPhysicalDeleteItem[];
  bloqueadas_por_seguranca: FreeBonusPhysicalDeleteItem[];
}

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

    // Regra de escopo operacional:
    // - quando existe filtro de leader, registros ORFÃOS (leader_id=null) NÃO devem ser escondidos do evento
    //   (eles continuam entrando nos diagnósticos/plano de exclusão física).
    const inLeaderScope =
      !leaderScopeFilter ||
      x.leader_id === null ||
      x.leader_id === leaderScopeFilter;

    if (!inLeaderScope) {
      let reason: string;
      if (x.leader_id === null) {
        // Em teoria não acontece porque inLeaderScope já inclui leader_id=null.
        excludedCountOrphanNoLeader += 1;
        reason = 'Líder ausente (null) fora do escopo (condição inesperada).';
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
      action_proposed_human:
        'DELETE físico controlado acontece somente no recorte elegível; este item permanece em dry_run-only.',
      reversibility_note:
        'DELETE físico somente para IDs elegíveis no apply (com backup). Registros fora do recorte não são alterados.',
      item_executability: 'dry_run-only',
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
  excludedCountOtherLeader: number;
}): { scope: InvitationBonusReconciliationResult['bloco_b_scope']; note: string } {
  const { leaderScopeFilter, excludedCountOtherLeader } = params;
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
      'Com filtro de líder: orfas (leader_id=null) continuam dentro do escopo do Bloco B. ' +
      'Apenas registros de outro líder (leader_id diferente do filtro) são excluídos.',
    excluded_count_orphan_no_leader: 0,
    excluded_count_other_leader: other,
  };

  const note =
    `Filtro de líder ativo (${leaderScopeFilter}). ` +
    `Excluídos do plano: ${other} de outro(s) líder(es).`;

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
    excludedCountOtherLeader: blocoB.excludedCountOtherLeader,
  });

  const blockBItems = blocoB.items;

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

  // Diagnóstico operacional Bloco B: separa convites (saldo) de registros free_bonus candidatos à exclusão.
  const mergedBonusRegs = dedupeBonusRegistrationsEvent(audit.technical_log.bonus_registrations_event);
  const inLeaderScope = (x: EventBonusRegistrationAuditItem) =>
    !leaderScopeFilter || x.leader_id === null || x.leader_id === leaderScopeFilter;

  const getGrupoOperacional = (x: EventBonusRegistrationAuditItem): BlocoBOperationalGroup | null => {
    if (x.classification.includes('sem_convite_correspondente')) return 'ORFA_SEM_CONVITE';
    if (x.classification.includes('acima_do_esperado')) return 'EXCESSO_ACIMA_DO_ESPERADO';
    if (x.classification.length === 1 && x.classification[0] === 'valida') return 'VALIDA_NAO_MEXER';
    return null;
  };

  const diagnostics_bloco_b_operacional: InvitationBonusReconciliationDiagnosticsBlocoBOperational = {
    totals: {
      total_free_bonus_detectadas: 0,
      total_free_bonus_orfas_sem_convite: 0,
      total_free_bonus_acima_do_esperado: 0,
      total_free_bonus_validas: 0,
      total_free_bonus_planejadas_para_exclusao: 0,
      total_free_bonus_bloqueadas_por_seguranca: 0,
    },
    lists: {
      ORFA_SEM_CONVITE: [],
      EXCESSO_ACIMA_DO_ESPERADO: [],
      VALIDA_NAO_MEXER: [],
    },
  };

  for (const x of mergedBonusRegs) {
    if (!inLeaderScope(x)) continue;
    const group = getGrupoOperacional(x);
    if (!group) continue;

    const planejada = group === 'ORFA_SEM_CONVITE' || group === 'EXCESSO_ACIMA_DO_ESPERADO';

    const motivo_operacional =
      group === 'ORFA_SEM_CONVITE'
        ? `Classificação inclui sem_convite_correspondente (flags: ${x.classification.join(', ') || '—'}).`
        : group === 'EXCESSO_ACIMA_DO_ESPERADO'
          ? `Classificação inclui acima_do_esperado (flags: ${x.classification.join(', ') || '—'}).`
          : 'Classificação valida — não candidata a exclusão.';

    const item: BlocoBOperationalItem = {
      registration_id: x.registration_id,
      leader_id: x.leader_id,
      commission_id: x.commission_id,
      event_id: x.event_id,
      leader_invitation_id: x.leader_invitation_id,
      status: x.status,
      payment_status: x.payment_status,
      classification: x.classification,
      motivo_operacional,
      grupo_operacional: group,
      planejada_para_exclusao: planejada ? 'sim' : 'não',
    };

    if (group === 'ORFA_SEM_CONVITE') diagnostics_bloco_b_operacional.lists.ORFA_SEM_CONVITE.push(item);
    if (group === 'EXCESSO_ACIMA_DO_ESPERADO') diagnostics_bloco_b_operacional.lists.EXCESSO_ACIMA_DO_ESPERADO.push(item);
    if (group === 'VALIDA_NAO_MEXER') diagnostics_bloco_b_operacional.lists.VALIDA_NAO_MEXER.push(item);
  }

  const orfaCount = diagnostics_bloco_b_operacional.lists.ORFA_SEM_CONVITE.length;
  const excessoCount = diagnostics_bloco_b_operacional.lists.EXCESSO_ACIMA_DO_ESPERADO.length;
  const validaCount = diagnostics_bloco_b_operacional.lists.VALIDA_NAO_MEXER.length;
  const plannedCount = orfaCount + excessoCount;

  diagnostics_bloco_b_operacional.totals = {
    total_free_bonus_detectadas: orfaCount + excessoCount + validaCount,
    total_free_bonus_orfas_sem_convite: orfaCount,
    total_free_bonus_acima_do_esperado: excessoCount,
    total_free_bonus_validas: validaCount,
    total_free_bonus_planejadas_para_exclusao: plannedCount,
    total_free_bonus_bloqueadas_por_seguranca: plannedCount, // será sobrescrito com base no recorte de delete físico
  };

  // Plano de exclusao física (apply) — recorte exato definido pelo usuário.
  const physicalDeleteCandidatesRecorte: EventBonusRegistrationAuditItem[] = [];
  for (const x of mergedBonusRegs) {
    if (!inLeaderScope(x)) continue;
    const matchesRecorte =
      x.classification.includes('sem_convite_correspondente') &&
      x.leader_invitation_id === null &&
      x.leader_id === null &&
      x.commission_id === null;

    if (matchesRecorte) physicalDeleteCandidatesRecorte.push(x);
  }

  const candidateIds = physicalDeleteCandidatesRecorte.map((x) => x.registration_id);

  // Verificações de segurança no banco (pagamento_method e inexistência de leader_invitations).
  const paymentMethodById = new Map<string, string>();
  if (candidateIds.length > 0) {
    const paymentRes = await query(
      `SELECT
         r.id::text AS registration_id,
         r.payment_method::text AS payment_method
       FROM registrations r
       WHERE r.event_id = $1
         AND r.id = ANY($2::uuid[])`,
      [params.event_id, candidateIds]
    );

    for (const row of paymentRes.rows as { registration_id: string; payment_method: string | null }[]) {
      if (row.payment_method) paymentMethodById.set(row.registration_id, row.payment_method);
    }
  }

  const leaderInvitationIds = new Set<string>();
  if (candidateIds.length > 0) {
    const liRes = await query(
      `SELECT li.bonus_registration_id::text AS registration_id
       FROM leader_invitations li
       WHERE li.event_id = $1
         AND li.bonus_registration_id = ANY($2::uuid[])`,
      [params.event_id, candidateIds]
    );
    for (const row of liRes.rows as { registration_id: string }[]) {
      leaderInvitationIds.add(row.registration_id);
    }
  }

  const elegiveis_para_delete_fisico: FreeBonusPhysicalDeleteItem[] = [];
  const bloqueadas_por_seguranca: FreeBonusPhysicalDeleteItem[] = [];

  for (const x of physicalDeleteCandidatesRecorte) {
    const hasValida = x.classification.includes('valida');
    const hasAcima = x.classification.includes('acima_do_esperado');
    const paymentMethod = paymentMethodById.get(x.registration_id) ?? null;
    const hasLeaderInvitation = leaderInvitationIds.has(x.registration_id);

    const isEligible =
      !hasValida &&
      !hasAcima &&
      paymentMethod === 'free_bonus' &&
      !hasLeaderInvitation;

    const base = {
      registration_id: x.registration_id,
      leader_id: x.leader_id,
      commission_id: x.commission_id,
      leader_invitation_id: x.leader_invitation_id,
      status: x.status,
      payment_status: x.payment_status,
      classification: [...x.classification],
    };

    if (isEligible) {
      elegiveis_para_delete_fisico.push({
        ...base,
        motivo_operacional: 'Atende recorte e segurança para DELETE físico (apply): somente sem convite correspondente.',
        decision: 'elegível_para_delete_fisico',
      });
    } else {
      const reasons: string[] = [];
      if (hasValida) reasons.push('classificacao inclui valida');
      if (hasAcima) reasons.push('classificacao inclui acima_do_esperado');
      if (paymentMethod !== 'free_bonus') reasons.push(`payment_method=${paymentMethod ?? 'null/ausente'}`);
      if (hasLeaderInvitation) reasons.push('existe leader_invitations para este bonus_registration_id');

      bloqueadas_por_seguranca.push({
        ...base,
        motivo_operacional: `Bloqueada por seguranca: ${reasons.join('; ') || 'falha de criterios'}.`,
        decision: 'bloqueada_por_seguranca',
      });
    }
  }

  const physicalDeletePlan: FreeBonusPhysicalDeletePlan = {
    recorte: {
      must_include_classification: 'sem_convite_correspondente',
      must_have_leader_invitation_id_null: true,
      must_have_leader_id_null: true,
      must_have_commission_id_null: true,
      must_have_payment_method_free_bonus: true,
      must_not_be_classified_as_valida: true,
      must_not_be_classified_as_acima_do_esperado: true,
    },
    totals: {
      total_free_bonus_analisadas: diagnostics_bloco_b_operacional.totals.total_free_bonus_detectadas,
      total_candidatas_exclusao_fisica: physicalDeleteCandidatesRecorte.length,
      total_elegiveis_para_delete_fisico: elegiveis_para_delete_fisico.length,
      total_excluidas_do_escopo_por_seguranca: bloqueadas_por_seguranca.length,
    },
    elegiveis_para_delete_fisico,
    bloqueadas_por_seguranca,
  };

  // Para visibilidade no painel (diagnostico), refletimos o total bloqueado do recorte físico.
  diagnostics_bloco_b_operacional.totals.total_free_bonus_bloqueadas_por_seguranca =
    physicalDeletePlan.totals.total_excluidas_do_escopo_por_seguranca;

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
    note:
      physicalDeletePlan.totals.total_elegiveis_para_delete_fisico > 0
        ? 'Bloco B com DELETE físico controlado disponível para o recorte elegível (apply).'
        : 'Sem DELETE físico elegível no recorte atual (apply não deletará registros).',
  };

  const dry_run_hash = hashStable({
    event_id: params.event_id,
    leader_scope: leaderScopeKey,
    scope_type: scopeType,
    audit_snapshot_hash,
    block_a_ids: blockAItems.map((x) => x.leader_invitation_id).sort(),
    block_b_ids: blockBItems.map((x) => x.registration_id).sort(),
    bloco_b_excluded_ids: blocoB.excludedByLeaderScope.map((x) => x.registration_id).sort(),
    physical_delete_eligible_ids: physicalDeletePlan.elegiveis_para_delete_fisico.map((x) => x.registration_id).sort(),
    physical_delete_blocked_ids: physicalDeletePlan.bloqueadas_por_seguranca.map((x) => x.registration_id).sort(),
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
    free_bonus_block_status:
      physicalDeletePlan.totals.total_elegiveis_para_delete_fisico > 0 ? 'executável' : 'dry_run-only',
    free_bonus_block_reason:
      physicalDeletePlan.totals.total_elegiveis_para_delete_fisico > 0
        ? 'Exclusao física habilitada apenas para registrations free_bonus órfãs sem_convite_correspondente (recorte seguro).'
        : 'Nenhuma registration free_bonus órfã sem_convite_correspondente atende ao recorte/safety para DELETE físico.',
    audit_snapshot_hash,
    dry_run_hash,
    diagnostics_missing_excess,
    diagnostics_bloco_b_operacional,
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
          status:
            physicalDeletePlan.totals.total_elegiveis_para_delete_fisico > 0 ? 'executável' : 'dry_run-only',
          summary: {
            detected_in_scope: detectedInScope,
            executable_count: physicalDeletePlan.totals.total_elegiveis_para_delete_fisico,
            dry_run_only_count: blockBItems.filter((i) => i.item_executability === 'dry_run-only').length,
            ignored_valid_or_neutral_count: blocoB.ignoredNotInPlan.length,
            excluded_by_leader_scope_count: blocoB.excludedByLeaderScope.length,
            registrations_free_bonus_planned: detectedInScope,
          },
          items: blockBItems,
          excluded_by_leader_scope: blocoB.excludedByLeaderScope,
          ignored_not_in_plan: blocoB.ignoredNotInPlan,
          physical_delete_plan: physicalDeletePlan,
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

  if (!params.apply_confirmed) {
    throw appError('apply_confirmed é obrigatório para mode=apply.', 400);
  }
  if (!params.executed_by) {
    throw appError('executed_by é obrigatório para mode=apply.', 400);
  }

  const idsToExpire = dryRun.reports.change_plan.bloco_a_leader_invitations.items.map(
    (x) => x.leader_invitation_id
  );
  const eligibleDeleteItems =
    dryRun.reports.change_plan.bloco_b_registrations_free_bonus.physical_delete_plan.elegiveis_para_delete_fisico;
  const idsToDeleteEligible = eligibleDeleteItems.map((x) => x.registration_id);
  const motivoById = new Map<string, string>(
    eligibleDeleteItems.map((x) => [x.registration_id, x.motivo_operacional])
  );

  let changedIds: string[] = [];
  let physicalDeletedIds: string[] = [];
  let backupSavedIds: string[] = [];
  let remainingFreeBonusRegistrations = 0;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1) Bloco A — expirar leader_invitations em excesso (lógica já existente)
    if (idsToExpire.length > 0) {
      const upd = await client.query(
        `UPDATE leader_invitations
         SET status = 'expired', updated_at = NOW()
         WHERE id = ANY($1::uuid[])
           AND status = 'available'
         RETURNING id::text AS id`,
        [idsToExpire]
      );
      changedIds = (upd.rows as { id: string }[]).map((r) => r.id);
    }

    // 2) Bloco B (DELETE físico controlado) — backup obrigatório + DELETE apenas elegíveis
    if (idsToDeleteEligible.length > 0) {
      // Revalidação no banco: garante que o DELETE atende recorte operacional mínimo
      // (event_id, payment_method='free_bonus' e ausência de leader_invitations).
      const candidatesToActuallyDeleteResult = await client.query(
        `SELECT *
         FROM registrations r
         WHERE r.event_id = $1
           AND r.id = ANY($2::uuid[])
           AND r.payment_method = 'free_bonus'
           AND NOT EXISTS (
             SELECT 1
             FROM leader_invitations li
             WHERE li.event_id = $1
               AND li.bonus_registration_id = r.id
           )`,
        [params.event_id, idsToDeleteEligible]
      );

      const candidatesToActuallyDelete = candidatesToActuallyDeleteResult.rows as any[];
      const candidateIdsFinal = candidatesToActuallyDelete.map((r) => String(r.id));

      if (candidateIdsFinal.length > 0) {
        // Backup append-only (um por registro deletado)
        for (const r of candidatesToActuallyDelete) {
          const registrationId = String(r.id);
          await client.query(
            `INSERT INTO registration_reconciliation_backup (
               registration_id,
               event_id,
               original_registration,
               motivo_exclusao,
               audit_snapshot_hash,
               dry_run_hash,
               executed_by,
               executed_at
             ) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,NOW())`,
            [
              registrationId,
              params.event_id,
              JSON.stringify(r),
              motivoById.get(registrationId) ??
                'DELETE físico no recorte elegível (sem_convite_correspondente, leader_invitation_id ausente, payment_method=free_bonus).',
              dryRun.audit_snapshot_hash,
              dryRun.dry_run_hash,
              params.executed_by,
            ]
          );
        }

        backupSavedIds = candidateIdsFinal;

        const del = await client.query(
          `DELETE FROM registrations r
           WHERE r.event_id = $1
             AND r.id = ANY($2::uuid[])
             AND r.payment_method = 'free_bonus'
             AND NOT EXISTS (
               SELECT 1
               FROM leader_invitations li
               WHERE li.event_id = $1
                 AND li.bonus_registration_id = r.id
             )
           RETURNING r.id::text AS id`,
          [params.event_id, candidateIdsFinal]
        );
        physicalDeletedIds = (del.rows as { id: string }[]).map((row) => row.id);
      }
    }

    // 3) Quantidade restante no evento (toda a massa free_bonus por event_id)
    const remainingRes = await client.query(
      `SELECT COUNT(*)::int AS cnt
       FROM registrations
       WHERE event_id = $1
         AND payment_method = 'free_bonus'`,
      [params.event_id]
    );
    remainingFreeBonusRegistrations = (remainingRes.rows[0] as { cnt: number }).cnt ?? 0;

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return {
    ...dryRun,
    mode: 'apply',
    reports: {
      ...dryRun.reports,
      after_apply: {
        invitations_changed: changedIds.length,
        invitations_changed_ids: changedIds,
        free_bonus_changed: physicalDeletedIds.length,
        physical_delete: {
          deleted_count: physicalDeletedIds.length,
          deleted_ids: physicalDeletedIds,
          backup_saved_ids: backupSavedIds,
          remaining_free_bonus_registrations_in_event: remainingFreeBonusRegistrations,
        },
        note: physicalDeletedIds.length > 0
          ? 'Apply executado: DELETE físico controlado para free_bonus elegíveis + expiração de leader_invitations do Bloco A.'
          : 'Apply executado: sem DELETE físico em free_bonus (nenhum ID elegível confirmou critérios no momento).',
      },
    },
  };
}
