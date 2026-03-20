/**
 * Fluxo separado: "Corrigir convites não entregues"
 * - Baseado no resultado canônico da auditoria (Fase 1), sem chamar checkAndGrantInvitationBonus.
 * - Gera apenas leader_invitations faltantes (com registrations free_bonus lastro), até expectedBonuses_canonical.
 */

import { createHash } from 'crypto';
import { getClient, query } from '../config/database.js';
import {
  runInvitationBonusAudit,
  type InvitationBonusAuditCommissionRow,
  type InvitationBonusAuditResult,
} from './invitationBonusAuditService.js';
import { getGroupLeaderById } from './groupLeadersService.js';

export type MissingDeliveryMode = 'dry_run' | 'apply';

export interface MissingInvitationDeliveryRequest {
  event_id: string;
  leader_id?: string | null;
  mode: MissingDeliveryMode;
  audit_snapshot_hash?: string | null;
  dry_run_hash?: string | null;
  apply_confirmed?: boolean;
  executed_by?: string;
}

export type MissingDeliveryStatus = 'apto' | 'bloqueado';

/** Códigos estáveis para auditoria (não alteram regra de bloqueio — apenas documentam). */
export type MissingDeliveryBlockReasonCode =
  | 'LEADER_INVALIDO'
  | 'TIMES_GRANTED_MAIOR_QUE_EXPECTED'
  | 'BONUS_REGISTRATION_FORA_CANONICO'
  | 'DIVERGENCIA_EXPECTED_BONUSES_PROD_VS_CANONICO'
  | 'BONUS_REPROCESSING'
  | 'COMMISSION_COUPON_MATCHING'
  | 'WRONGFUL_CUPOM_REFERRAL'
  | 'BONUS_TYPE_INELIGIVEL';

/** Avisos agregados (Fase 1) rebaixados quando não há evidência material em convites concedidos */
export type MissingDeliveryWarningCode =
  | 'BONUS_REGISTRATION_FORA_CANONICO_AGREGADO_SEM_EVIDENCIA_EM_GRANTED'
  | 'BONUS_REPROCESSING_AGREGADO_SEM_EVIDENCIA_EM_GRANTED'
  | 'COUNT_DIVERGENTE_AUDITORIA_VS_DB';

export interface MissingInvitationProvaBlocoAItem {
  leader_invitation_id: string;
  bonus_registration_id: string | null;
  registration_id: string | null;
  status: string;
  created_at: string | null;
  motivo_validade: string;
}

export interface MissingInvitationProvaBlocoBItem {
  leader_invitation_id: string | null;
  bonus_registration_id: string | null;
  registration_id: string | null;
  tipo_inconsistencia: string;
  motivo_detalhado: string;
  created_at: string | null;
  impacta_bloqueio_geracao_futura: boolean;
}

export interface MissingInvitationProvaBlocoC {
  paidCount_correto: number;
  expectedBonuses_correto: number;
  timesGranted_validos: number;
  timesGranted_inconsistentes: number;
  /** max(0, expected − timesGranted_db) — mesmo critério do COUNT agregado da auditoria */
  faltantes_teoricos: number;
  /**
   * max(0, expected − timesGranted_validos) — gap se apenas convites “válidos” contassem para o teto.
   * Pode ser &gt; faltantes_teoricos quando há convites inconsistentes ainda dentro do COUNT.
   */
  faltantes_vs_apenas_validos: number;
  /**
   * Quantos convites o apply poderia criar com as regras atuais: 0 se bloqueado;
   * se apto, max(0, expected − timesGranted_db) (mesmo critério do serviço de apply).
   */
  faltantes_liberados_para_apply: number;
}

export interface MissingInvitationProvaBlocoD {
  apto_para_apply: boolean;
  /** Bloqueadores com política atual (exige evidência para flags agregadas rebaixáveis) */
  motivos_bloqueio: string[];
  /** Avisos da Fase 1 / reconciliação que não impedem apply neste fluxo */
  motivos_warning_nao_bloqueantes: string[];
  quantos_convites_seriam_gerados_se_apto: number;
  /** Igual a faltantes_teoricos quando apto_para_apply */
  eligible_to_generate_missing_invitations: number;
  saneamento_sugerido: string[];
  /** Quando há bloqueio real sustentado por IDs materializados */
  blocking_ids_snapshot?: {
    leader_invitation_ids: string[];
    bonus_registration_ids: string[];
    registration_ids: string[];
  };
}

export interface MissingInvitationProvaExpandida {
  leader_id: string;
  commission_id: string;
  expectedBonuses_correto: number;
  timesGranted_validos: number;
  timesGranted_inconsistentes: number;
  faltantes_teoricos: number;
  /** max(0, expected − timesGranted_validos) */
  faltantes_vs_apenas_validos: number;
  faltantes_liberados_para_apply: number;
  /** Somente bloqueadores “reais” (não inclui avisos rebaixados) */
  block_reason_codes: MissingDeliveryBlockReasonCode[];
  block_reason_human_readable: string[];
  warning_codes: MissingDeliveryWarningCode[];
  warning_human_readable: string[];
  /** Evidência material em convites granted inconsistentes */
  inconsistent_leader_invitation_ids: string[];
  inconsistent_bonus_registration_ids: string[];
  inconsistent_registration_ids: string[];
  blocking_evidence_count: number;
  /** Quando apto: igual a faltantes_teoricos */
  eligible_to_generate_missing_invitations: number;
  bloco_a_convites_validos: MissingInvitationProvaBlocoAItem[];
  bloco_b_inconsistentes: MissingInvitationProvaBlocoBItem[];
  bloco_c_resumo: MissingInvitationProvaBlocoC;
  bloco_d_decisao: MissingInvitationProvaBlocoD;
}

export interface MissingInvitationPlanItem {
  leader_id: string;
  commission_id: string;
  event_id: string;
  required_purchases: number;
  paidCount_correto: number;
  expectedBonuses_correto: number;
  timesGranted_db: number;
  faltantes: number;
  acao_proposta: string;
  observacao_seguranca: string;
  status: MissingDeliveryStatus;
  bloqueio_motivos: string[];
  /** Reversibilidade / rastreabilidade (apply cria registrations + leader_invitations) */
  observacao_reversibilidade: string;
  /** Campos resumidos (espelho do topo da prova expandida) */
  timesGranted_validos: number;
  timesGranted_inconsistentes: number;
  faltantes_teoricos: number;
  faltantes_vs_apenas_validos: number;
  faltantes_liberados_para_apply: number;
  block_reason_codes: MissingDeliveryBlockReasonCode[];
  block_reason_human_readable: string[];
  warning_codes: MissingDeliveryWarningCode[];
  warning_human_readable: string[];
  inconsistent_leader_invitation_ids: string[];
  inconsistent_bonus_registration_ids: string[];
  inconsistent_registration_ids: string[];
  blocking_evidence_count: number;
  eligible_to_generate_missing_invitations: number;
  /** Dry-run expandido de prova (Blocos A–D) — somente leitura, sem apply */
  prova_expandida: MissingInvitationProvaExpandida;
}

export interface MissingInvitationDeliveryResult {
  mode: MissingDeliveryMode;
  flow: 'missing_invitation_delivery_v1';
  event_id: string;
  leader_id: string | null;
  scope_type: 'single_leader' | 'all_event_leaders';
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
  /** 1 — Relatório antes (snapshot canônico agregado) */
  relatorio_antes: {
    total_linhas_comissao_escopo: number;
    total_faltantes_somado: number;
    total_aptos_gerar: number;
    total_bloqueados: number;
    calculation_source: 'fase1_audit_canonical';
  };
  /** 2 — Plano de geração (itens detalhados) */
  plano_geracao: {
    bloco_a_aptos: MissingInvitationPlanItem[];
    bloco_b_bloqueados: MissingInvitationPlanItem[];
  };
  /** 3 — Relatório depois (somente apply) */
  relatorio_depois?: {
    convites_criados_total: number;
    leader_invitation_ids_criados: string[];
    registration_ids_bonus_criados: string[];
    por_comissao: Array<{
      leader_id: string;
      commission_id: string;
      criados_neste_apply: number;
      leader_invitation_ids: string[];
    }>;
    nota: string;
  };
}

function hashStable(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

function buildAuditSnapshotHash(audit: InvitationBonusAuditResult): string {
  return hashStable({
    event_id: audit.event_id,
    leader_id_filter: audit.leader_id_filter,
    rows: audit.technical_log.rows,
    bonus_event_summary: audit.technical_log.bonus_event_summary,
  });
}

interface AggregateCandidateReason {
  code: MissingDeliveryBlockReasonCode;
  human: string;
}

function uniqueStrings(arr: (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(arr.filter((x): x is string => typeof x === 'string' && x.length > 0))
  ).sort();
}

/** Candidatos a bloqueio vindos só da Fase 1 (antes de evidência material em convites granted). */
function collectAggregateCandidateReasons(
  row: InvitationBonusAuditCommissionRow,
  leaderExists: boolean
): AggregateCandidateReason[] {
  const out: AggregateCandidateReason[] = [];

  if (!leaderExists) {
    out.push({
      code: 'LEADER_INVALIDO',
      human: 'Líder não encontrado em group_leaders (inválido ou inexistente).',
    });
  }

  if (row.times_granted_db > row.expectedBonuses_canonical) {
    out.push({
      code: 'TIMES_GRANTED_MAIOR_QUE_EXPECTED',
      human:
        'Inconsistência: timesGranted_db maior que expectedBonuses_correto (excesso no DB vs auditoria).',
    });
  }

  if (row.bonus_registration_ids_in_db_not_in_canonical.length > 0) {
    out.push({
      code: 'BONUS_REGISTRATION_FORA_CANONICO',
      human:
        'Risco de duplicidade/lastro: existem convites (bonus_registration_id) fora do conjunto canônico de inscrições pagas.',
    });
  }

  if (row.divergencia_expected_bonuses !== 0) {
    out.push({
      code: 'DIVERGENCIA_EXPECTED_BONUSES_PROD_VS_CANONICO',
      human:
        'Divergência entre expectedBonuses (produção) e canônico — corrigir dados/cupom antes de gerar convites.',
    });
  }

  for (const code of row.error_classification_row) {
    if (code === 'bonus_reprocessing') {
      out.push({
        code: 'BONUS_REPROCESSING',
        human: 'Classificação bonus_reprocessing: possível reprocessamento — bloqueado até saneamento.',
      });
    }
    if (code === 'commission_coupon_matching') {
      out.push({
        code: 'COMMISSION_COUPON_MATCHING',
        human: 'Cupom da comissão não resolvido de forma segura (commission_coupon_matching).',
      });
    }
    if (code === 'wrongful_count_cupom_referral') {
      out.push({
        code: 'WRONGFUL_CUPOM_REFERRAL',
        human: 'Inconsistência cupom/referral nas vendas (wrongful_count_cupom_referral).',
      });
    }
  }

  if (!['invitation', 'both'].includes(String(row.bonus_type))) {
    out.push({
      code: 'BONUS_TYPE_INELIGIVEL',
      human: `bonus_type "${row.bonus_type}" não elegível para convite (esperado invitation ou both).`,
    });
  }

  const seen = new Set<string>();
  return out.filter((x) => {
    const k = x.code;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function resolveBlockersAndWarnings(params: {
  row: InvitationBonusAuditCommissionRow;
  leaderExists: boolean;
  candidates: AggregateCandidateReason[];
  timesGranted_inconsistentes: number;
  blocking_evidence_count: number;
  hasReconciliacaoCountMismatch: boolean;
}): {
  apto: boolean;
  blockCodes: MissingDeliveryBlockReasonCode[];
  blockHuman: string[];
  warningCodes: MissingDeliveryWarningCode[];
  warningHuman: string[];
} {
  const evidenceOk =
    params.timesGranted_inconsistentes === 0 && params.blocking_evidence_count === 0;

  const blockCodes: MissingDeliveryBlockReasonCode[] = [];
  const blockHuman: string[] = [];
  const warningCodes: MissingDeliveryWarningCode[] = [];
  const warningHuman: string[] = [];

  for (const c of params.candidates) {
    const downgradeAggregate =
      evidenceOk &&
      (c.code === 'BONUS_REGISTRATION_FORA_CANONICO' || c.code === 'BONUS_REPROCESSING');

    if (downgradeAggregate) {
      if (c.code === 'BONUS_REGISTRATION_FORA_CANONICO') {
        warningCodes.push('BONUS_REGISTRATION_FORA_CANONICO_AGREGADO_SEM_EVIDENCIA_EM_GRANTED');
        const ids = params.row.bonus_registration_ids_in_db_not_in_canonical;
        warningHuman.push(
          `Heurística Fase 1: bonus_registration_ids_in_db_not_in_canonical não vazio (${ids.length}), porém ` +
            `nenhum convite granted (available|sent|used) materializa inconsistência — IDs auditados: ${ids.join(', ') || '—'}.`
        );
      }
      if (c.code === 'BONUS_REPROCESSING') {
        warningCodes.push('BONUS_REPROCESSING_AGREGADO_SEM_EVIDENCIA_EM_GRANTED');
        warningHuman.push(
          `${c.human} Rebaixado para aviso: granted_inconsistentes=0 e blocking_evidence_count=0 (sem IDs operacionais).`
        );
      }
      continue;
    }

    blockCodes.push(c.code);
    blockHuman.push(c.human);
  }

  if (params.hasReconciliacaoCountMismatch && params.blocking_evidence_count === 0) {
    warningCodes.push('COUNT_DIVERGENTE_AUDITORIA_VS_DB');
    warningHuman.push(
      'Soma válidos+inconsistentes difere de times_granted_db — revisar reconciliação DB vs agregado auditoria (aviso; não bloqueia apply neste fluxo).'
    );
  }

  const apto = params.leaderExists && blockCodes.length === 0;

  const uniqW = (codes: MissingDeliveryWarningCode[], human: string[]) => {
    const s = new Set<string>();
    const c2: MissingDeliveryWarningCode[] = [];
    const h2: string[] = [];
    for (let i = 0; i < codes.length; i++) {
      const k = codes[i];
      if (s.has(k)) continue;
      s.add(k);
      c2.push(k);
      h2.push(human[i]);
    }
    return { codes: c2, human: h2 };
  };
  const wu = uniqW(warningCodes, warningHuman);

  return {
    apto,
    blockCodes,
    blockHuman,
    warningCodes: wu.codes,
    warningHuman: wu.human,
  };
}

interface LiDbRow {
  leader_invitation_id: string;
  bonus_registration_id: string | null;
  status: string;
  created_at: Date | string | null;
}

async function fetchInvitationsForCommission(
  leaderId: string,
  eventId: string,
  commissionId: string
): Promise<LiDbRow[]> {
  const res = await query(
    `SELECT
       li.id::text AS leader_invitation_id,
       li.bonus_registration_id::text AS bonus_registration_id,
       li.status::text AS status,
       li.created_at
     FROM leader_invitations li
     WHERE li.leader_id = $1 AND li.event_id = $2 AND li.commission_id = $3
     ORDER BY li.created_at ASC NULLS LAST, li.id ASC`,
    [leaderId, eventId, commissionId]
  );
  return res.rows as LiDbRow[];
}

function buildExpandedProof(params: {
  row: InvitationBonusAuditCommissionRow;
  invites: LiDbRow[];
  leaderExists: boolean;
}): MissingInvitationProvaExpandida {
  const { row, invites, leaderExists } = params;

  const expected = row.expectedBonuses_canonical;
  const validLiIds = new Set(row.leader_invitation_ids_validos);
  const excessLiIds = new Set(row.leader_invitation_ids_excesso);
  const semRegLiIds = new Set(row.leader_invitation_ids_sem_registration);
  const bonusNotInCanon = new Set(row.bonus_registration_ids_in_db_not_in_canonical);

  const GRANTED = new Set(['available', 'sent', 'used']);

  const bloco_a: MissingInvitationProvaBlocoAItem[] = [];
  const bloco_b: MissingInvitationProvaBlocoBItem[] = [];

  let timesGranted_validos = 0;
  let timesGranted_inconsistentes = 0;

  for (const li of invites) {
    const st = String(li.status || '').toLowerCase();
    const regId = li.bonus_registration_id;
    const created =
      li.created_at instanceof Date
        ? li.created_at.toISOString()
        : li.created_at
          ? String(li.created_at)
          : null;

    if (!GRANTED.has(st)) {
      if (st === 'expired') {
        bloco_b.push({
          leader_invitation_id: li.leader_invitation_id,
          bonus_registration_id: regId,
          registration_id: regId,
          tipo_inconsistencia: 'CONVITE_EXPIRADO_NAO_CONTA_NO_GRANTED',
          motivo_detalhado:
            'Status expired — não entra em times_granted_db (available|sent|used). Listado apenas para rastreabilidade.',
          created_at: created,
          impacta_bloqueio_geracao_futura: false,
        });
      }
      continue;
    }

    const isValidLi = validLiIds.has(li.leader_invitation_id);

    if (isValidLi) {
      timesGranted_validos += 1;
      bloco_a.push({
        leader_invitation_id: li.leader_invitation_id,
        bonus_registration_id: regId,
        registration_id: regId,
        status: st,
        created_at: created,
        motivo_validade:
          'leader_invitation_id consta em leader_invitation_ids_validos (classificação Fase 1 / inscrição bônus “valida”).',
      });
    } else {
      timesGranted_inconsistentes += 1;

      let tipo = 'OUTRO_DIVERGENCIA_AUDITORIA';
      let motivo =
        'Convite concedido (available|sent|used) mas não está em leader_invitation_ids_validos — exige revisão da Fase 1.';
      const impacta = true;

      if (regId && bonusNotInCanon.has(regId)) {
        tipo = 'BONUS_REGISTRATION_FORA_DO_CONJUNTO_CANONICO';
        motivo =
          'bonus_registration_id aponta para inscrição que não fecha com o conjunto canônico esperado para esta comissão (lista bonus_registration_ids_in_db_not_in_canonical).';
      } else if (excessLiIds.has(li.leader_invitation_id)) {
        tipo = 'CLASSIFICADO_EXCESSO_AUDITORIA';
        motivo = 'leader_invitation_id em leader_invitation_ids_excesso (classificação Fase 1).';
      } else if (semRegLiIds.has(li.leader_invitation_id)) {
        tipo = 'CONVITE_SEM_LASTRO_REGISTRATION';
        motivo = 'Convite sem lastro de registration coerente (leader_invitation_ids_sem_registration).';
      }

      if (row.error_classification_row.includes('bonus_reprocessing') && tipo === 'OUTRO_DIVERGENCIA_AUDITORIA') {
        tipo = 'CONTEXTO_BONUS_REPROCESSING';
        motivo +=
          ' Comissão com flag bonus_reprocessing na auditoria — evidência em convite granted.';
      }

      bloco_b.push({
        leader_invitation_id: li.leader_invitation_id,
        bonus_registration_id: regId,
        registration_id: regId,
        tipo_inconsistencia: tipo,
        motivo_detalhado: motivo,
        created_at: created,
        impacta_bloqueio_geracao_futura: impacta,
      });
    }
  }

  const timesGranted_db = row.times_granted_db;
  const sumSplit = timesGranted_validos + timesGranted_inconsistentes;
  let hasReconciliacaoCountMismatch = false;
  if (sumSplit !== timesGranted_db) {
    hasReconciliacaoCountMismatch = true;
    bloco_b.push({
      leader_invitation_id: null,
      bonus_registration_id: null,
      registration_id: null,
      tipo_inconsistencia: 'RECONCILIACAO_COUNT',
      motivo_detalhado: `Soma validos+inconsistentes (${sumSplit}) difere de times_granted_db (${timesGranted_db}) — verificar convites no DB vs agregado da auditoria.`,
      created_at: null,
      impacta_bloqueio_geracao_futura: false,
    });
  }

  /** Evidência concreta: convites granted classificados como inconsistentes (exclui linha sintética RECONCILIACAO_COUNT). */
  const materialGrantedInconsistent = bloco_b.filter(
    (b) =>
      !!b.leader_invitation_id &&
      b.tipo_inconsistencia !== 'RECONCILIACAO_COUNT' &&
      b.tipo_inconsistencia !== 'CONVITE_EXPIRADO_NAO_CONTA_NO_GRANTED'
  );
  const inconsistent_leader_invitation_ids = uniqueStrings(
    materialGrantedInconsistent.map((b) => b.leader_invitation_id)
  );
  const inconsistent_bonus_registration_ids = uniqueStrings(
    materialGrantedInconsistent.map((b) => b.bonus_registration_id)
  );
  const inconsistent_registration_ids = uniqueStrings(
    materialGrantedInconsistent.map((b) => b.registration_id)
  );
  const blocking_evidence_count = inconsistent_leader_invitation_ids.length;

  const candidates = collectAggregateCandidateReasons(row, leaderExists);
  const resolved = resolveBlockersAndWarnings({
    row,
    leaderExists,
    candidates,
    timesGranted_inconsistentes,
    blocking_evidence_count,
    hasReconciliacaoCountMismatch,
  });

  const faltantes_teoricos = Math.max(0, expected - timesGranted_db);
  const faltantes_vs_apenas_validos = Math.max(0, expected - timesGranted_validos);
  const apto = resolved.apto;
  const faltantes_liberados_para_apply = apto ? faltantes_teoricos : 0;
  const eligible_to_generate_missing_invitations = apto ? faltantes_teoricos : 0;

  const saneamento_sugerido: string[] = [];
  for (const c of resolved.blockCodes) {
    if (c === 'BONUS_REGISTRATION_FORA_CANONICO') {
      saneamento_sugerido.push(
        'Reconciliar ou expirar convites cujo bonus_registration_id não pertence ao conjunto canônico; depois novo dry_run.'
      );
    }
    if (c === 'BONUS_REPROCESSING') {
      saneamento_sugerido.push(
        'Investigar reprocessamento de bônus (pagamentos/cupom) até a classificação bonus_reprocessing sumir na Fase 1.'
      );
    }
    if (c === 'COMMISSION_COUPON_MATCHING') {
      saneamento_sugerido.push(
        'Resolver vínculo cupom ↔ comissão conforme regras de negócio; não alterado por este fluxo.'
      );
    }
    if (c === 'WRONGFUL_CUPOM_REFERRAL') {
      saneamento_sugerido.push('Rever origens cupom vs referral nas vendas atribuídas ao líder.');
    }
    if (c === 'DIVERGENCIA_EXPECTED_BONUSES_PROD_VS_CANONICO') {
      saneamento_sugerido.push(
        'Alinhar contagem produção vs canônica (cupom / filtros) antes de gerar novos convites.'
      );
    }
    if (c === 'TIMES_GRANTED_MAIOR_QUE_EXPECTED') {
      saneamento_sugerido.push(
        'Reduzir excesso de convites concedidos (ex.: expirar disponíveis excedentes) até bater o expected.'
      );
    }
  }
  if (resolved.warningCodes.includes('BONUS_REGISTRATION_FORA_CANONICO_AGREGADO_SEM_EVIDENCIA_EM_GRANTED')) {
    saneamento_sugerido.push(
      '(Aviso) Validar na Fase 1 os IDs listados em bonus_registration_ids_in_db_not_in_canonical — sem impacto em apply neste fluxo.'
    );
  }
  if (resolved.warningCodes.includes('BONUS_REPROCESSING_AGREGADO_SEM_EVIDENCIA_EM_GRANTED')) {
    saneamento_sugerido.push(
      '(Aviso) Monitorar bonus_reprocessing na Fase 1 — sem convite granted inconsistente, apply permitido.'
    );
  }

  const blocking_ids_snapshot =
    resolved.blockCodes.length > 0 && blocking_evidence_count > 0
      ? {
          leader_invitation_ids: inconsistent_leader_invitation_ids,
          bonus_registration_ids: inconsistent_bonus_registration_ids,
          registration_ids: inconsistent_registration_ids,
        }
      : undefined;

  const bloco_c: MissingInvitationProvaBlocoC = {
    paidCount_correto: row.paidCount_canonical,
    expectedBonuses_correto: expected,
    timesGranted_validos,
    timesGranted_inconsistentes,
    faltantes_teoricos,
    faltantes_vs_apenas_validos,
    faltantes_liberados_para_apply,
  };

  const bloco_d: MissingInvitationProvaBlocoD = {
    apto_para_apply: apto,
    motivos_bloqueio: resolved.blockHuman,
    motivos_warning_nao_bloqueantes: resolved.warningHuman,
    quantos_convites_seriam_gerados_se_apto: eligible_to_generate_missing_invitations,
    eligible_to_generate_missing_invitations,
    saneamento_sugerido,
    blocking_ids_snapshot,
  };

  return {
    leader_id: row.leader_id,
    commission_id: row.commission_id,
    expectedBonuses_correto: expected,
    timesGranted_validos,
    timesGranted_inconsistentes,
    faltantes_teoricos,
    faltantes_vs_apenas_validos,
    faltantes_liberados_para_apply,
    block_reason_codes: resolved.blockCodes,
    block_reason_human_readable: resolved.blockHuman,
    warning_codes: resolved.warningCodes,
    warning_human_readable: resolved.warningHuman,
    inconsistent_leader_invitation_ids,
    inconsistent_bonus_registration_ids,
    inconsistent_registration_ids,
    blocking_evidence_count,
    eligible_to_generate_missing_invitations,
    bloco_a_convites_validos: bloco_a,
    bloco_b_inconsistentes: bloco_b,
    bloco_c_resumo: bloco_c,
    bloco_d_decisao: bloco_d,
  };
}

function rowToPlanItem(
  row: InvitationBonusAuditCommissionRow,
  eventId: string,
  prova: MissingInvitationProvaExpandida
): MissingInvitationPlanItem {
  const apto = prova.bloco_d_decisao.apto_para_apply;
  const expected = row.expectedBonuses_canonical;
  const granted = row.times_granted_db;
  const faltantes = Math.max(0, expected - granted);

  const acao_proposta = apto
    ? `Gerar ${faltantes} convite(s) faltante(s) (registration free_bonus + leader_invitations) até atingir expected=${expected}.`
    : 'Nenhuma ação automática — resolver bloqueios listados (com evidência) ou revisar avisos.';

  const observacao_seguranca = apto
    ? 'Planejamento derivado apenas da auditoria canônica; apply rechecará COUNT no banco antes de cada inserção.'
    : [
        ...prova.block_reason_human_readable,
        ...(prova.warning_human_readable.length
          ? [`Avisos (não bloqueantes): ${prova.warning_human_readable.join(' | ')}`]
          : []),
      ].join(' ');

  return {
    leader_id: row.leader_id,
    commission_id: row.commission_id,
    event_id: eventId,
    required_purchases: row.required_purchases,
    paidCount_correto: row.paidCount_canonical,
    expectedBonuses_correto: expected,
    timesGranted_db: granted,
    faltantes,
    acao_proposta,
    observacao_seguranca,
    status: apto ? 'apto' : 'bloqueado',
    bloqueio_motivos: apto ? [] : prova.block_reason_human_readable,
    observacao_reversibilidade:
      'Convites criados ficam em leader_invitations; inscrições free_bonus podem ser expiradas/canceladas por fluxos existentes (não automático neste serviço).',
    timesGranted_validos: prova.timesGranted_validos,
    timesGranted_inconsistentes: prova.timesGranted_inconsistentes,
    faltantes_teoricos: prova.faltantes_teoricos,
    faltantes_vs_apenas_validos: prova.faltantes_vs_apenas_validos,
    faltantes_liberados_para_apply: prova.faltantes_liberados_para_apply,
    block_reason_codes: prova.block_reason_codes,
    block_reason_human_readable: prova.block_reason_human_readable,
    warning_codes: prova.warning_codes,
    warning_human_readable: prova.warning_human_readable,
    inconsistent_leader_invitation_ids: prova.inconsistent_leader_invitation_ids,
    inconsistent_bonus_registration_ids: prova.inconsistent_bonus_registration_ids,
    inconsistent_registration_ids: prova.inconsistent_registration_ids,
    blocking_evidence_count: prova.blocking_evidence_count,
    eligible_to_generate_missing_invitations: prova.eligible_to_generate_missing_invitations,
    prova_expandida: prova,
  };
}

async function buildDryRunCore(params: {
  event_id: string;
  leader_id?: string | null;
}): Promise<{
  audit: InvitationBonusAuditResult;
  audit_snapshot_hash: string;
  dry_run_hash: string;
  plano: MissingInvitationDeliveryResult['plano_geracao'];
  relatorio_antes: MissingInvitationDeliveryResult['relatorio_antes'];
  leaderScopeKey: string;
  scope_type: MissingInvitationDeliveryResult['scope_type'];
}> {
  const scope_type: MissingInvitationDeliveryResult['scope_type'] = params.leader_id
    ? 'single_leader'
    : 'all_event_leaders';
  const leaderScopeKey = params.leader_id ?? '__all__';

  const audit = await runInvitationBonusAudit({
    event_id: params.event_id,
    leader_id: params.leader_id ?? undefined,
  });

  const audit_snapshot_hash = buildAuditSnapshotHash(audit);

  const bloco_a: MissingInvitationPlanItem[] = [];
  const bloco_b: MissingInvitationPlanItem[] = [];

  let totalFaltantes = 0;

  for (const row of audit.technical_log.rows) {
    const faltantesPre = Math.max(0, row.expectedBonuses_canonical - row.times_granted_db);
    if (faltantesPre <= 0) continue;

    const leaderRes = await query(`SELECT id FROM group_leaders WHERE id = $1`, [row.leader_id]);
    const leaderExists = leaderRes.rows.length > 0;

    const invites = await fetchInvitationsForCommission(row.leader_id, params.event_id, row.commission_id);
    const prova = buildExpandedProof({ row, invites, leaderExists });
    const apto = prova.bloco_d_decisao.apto_para_apply;
    const item = rowToPlanItem(row, params.event_id, prova);

    if (apto) {
      bloco_a.push(item);
      totalFaltantes += item.faltantes;
    } else {
      bloco_b.push(item);
    }
  }

  const dry_run_hash = hashStable({
    flow: 'missing_invitation_delivery_v1',
    event_id: params.event_id,
    leader_scope: leaderScopeKey,
    audit_snapshot_hash,
    bloco_a: bloco_a.map((x) => ({
      leader_id: x.leader_id,
      commission_id: x.commission_id,
      faltantes: x.faltantes,
      prova_resumo: {
        timesGranted_validos: x.timesGranted_validos,
        timesGranted_inconsistentes: x.timesGranted_inconsistentes,
        block_codes: x.block_reason_codes,
        warning_codes: x.warning_codes,
        blocking_evidence_count: x.blocking_evidence_count,
        eligible_to_generate: x.eligible_to_generate_missing_invitations,
      },
    })),
    bloco_b: bloco_b.map((x) => ({
      leader_id: x.leader_id,
      commission_id: x.commission_id,
      faltantes: x.faltantes,
      motivos: x.bloqueio_motivos,
      prova_resumo: {
        timesGranted_validos: x.timesGranted_validos,
        timesGranted_inconsistentes: x.timesGranted_inconsistentes,
        block_codes: x.block_reason_codes,
        warning_codes: x.warning_codes,
        blocking_evidence_count: x.blocking_evidence_count,
        bloco_a_count: x.prova_expandida.bloco_a_convites_validos.length,
        bloco_b_count: x.prova_expandida.bloco_b_inconsistentes.length,
      },
    })),
  });

  const relatorio_antes = {
    total_linhas_comissao_escopo: audit.technical_log.rows.length,
    total_faltantes_somado: totalFaltantes,
    total_aptos_gerar: bloco_a.length,
    total_bloqueados: bloco_b.length,
    calculation_source: 'fase1_audit_canonical' as const,
  };

  return {
    audit,
    audit_snapshot_hash,
    dry_run_hash,
    plano: { bloco_a_aptos: bloco_a, bloco_b_bloqueados: bloco_b },
    relatorio_antes,
    leaderScopeKey,
    scope_type,
  };
}

async function countTimesGrantedDb(
  client: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> },
  leaderId: string,
  eventId: string,
  commissionId: string
): Promise<number> {
  const r = await client.query(
    `SELECT COUNT(*)::int AS c FROM leader_invitations
     WHERE leader_id = $1 AND event_id = $2 AND commission_id = $3
       AND status IN ('available', 'sent', 'used')`,
    [leaderId, eventId, commissionId]
  );
  return ((r.rows[0] as { c: number }).c ?? 0) as number;
}

/**
 * Insere registration free_bonus + leader_invitation na mesma conexão (transação externa).
 */
async function insertOneMissingInviteSlot(
  client: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> },
  params: {
    eventId: string;
    groupLeaderId: string;
    leaderUserId: string;
    categoryId: string;
    commissionId: string;
  }
): Promise<{ registrationId: string; invitationId: string }> {
  const confirmationCode = `REG-${Date.now()}-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
  const reg = await client.query(
    `INSERT INTO registrations (
      event_id, runner_id, registered_by, category_id, kit_id, modality_id,
      payment_method, total_amount, platform_fee_amount, registration_edit_fee_amount,
      confirmation_code, status, payment_status, coupon_code
    )
    VALUES ($1, $2, $3, $4, NULL, NULL, 'free_bonus', 0, 0, 0, $5, 'confirmed', 'convidado', NULL)
    RETURNING id::text AS id`,
    [params.eventId, params.leaderUserId, params.leaderUserId, params.categoryId, confirmationCode]
  );
  const registrationId = (reg.rows[0] as { id: string }).id;

  const inv = await client.query(
    `INSERT INTO leader_invitations (
      leader_id, bonus_registration_id, event_id, status, commission_id
    ) VALUES ($1, $2, $3, 'available', $4)
    RETURNING id::text AS id`,
    [params.groupLeaderId, registrationId, params.eventId, params.commissionId]
  );
  const invitationId = (inv.rows[0] as { id: string }).id;
  return { registrationId, invitationId };
}

export async function runMissingInvitationDelivery(
  params: MissingInvitationDeliveryRequest
): Promise<MissingInvitationDeliveryResult> {
  const core = await buildDryRunCore({
    event_id: params.event_id,
    leader_id: params.leader_id ?? undefined,
  });

  const base: MissingInvitationDeliveryResult = {
    mode: 'dry_run',
    flow: 'missing_invitation_delivery_v1',
    event_id: params.event_id,
    leader_id: params.leader_id ?? null,
    scope_type: core.scope_type,
    audit_snapshot_hash: core.audit_snapshot_hash,
    dry_run_hash: core.dry_run_hash,
    consistency_guard: {
      can_apply: core.plano.bloco_a_aptos.length > 0,
      reason:
        core.plano.bloco_a_aptos.length > 0
          ? 'Existem comissões aptas com faltantes > 0; apply exige hashes + confirmação.'
          : 'Nenhuma comissão apta para geração no escopo atual (ver bloco bloqueados).',
      expected_event_id: params.event_id,
      expected_leader_scope: core.leaderScopeKey,
      expected_audit_snapshot_hash: core.audit_snapshot_hash,
      expected_dry_run_hash: core.dry_run_hash,
    },
    relatorio_antes: core.relatorio_antes,
    plano_geracao: core.plano,
  };

  if (params.mode === 'dry_run') {
    return base;
  }

  if (!params.audit_snapshot_hash || !params.dry_run_hash) {
    throw appError('Para apply, audit_snapshot_hash e dry_run_hash são obrigatórios.', 400);
  }

  const sameAudit = params.audit_snapshot_hash === core.audit_snapshot_hash;
  const sameDry = params.dry_run_hash === core.dry_run_hash;
  if (!sameAudit || !sameDry) {
    throw appError(
      'Divergência de consistência. Execute novo dry_run no mesmo evento/escopo antes do apply.',
      409
    );
  }

  if (!params.apply_confirmed) {
    throw appError('apply_confirmed é obrigatório para mode=apply.', 400);
  }
  if (!params.executed_by) {
    throw appError('executed_by é obrigatório para mode=apply.', 400);
  }

  if (core.plano.bloco_a_aptos.length === 0) {
    throw appError('Não há itens aptos para apply.', 400);
  }

  // Default category for event (mesma lógica conceitual do leaderBonusService)
  const catRes = await query(
    `SELECT id::text AS id FROM categories
     WHERE event_id = $1
     ORDER BY is_default DESC, price ASC, created_at ASC
     LIMIT 1`,
    [params.event_id]
  );
  if (catRes.rows.length === 0) {
    throw appError('Nenhuma categoria disponível para o evento.', 400);
  }
  const defaultCategoryId = (catRes.rows[0] as { id: string }).id;

  const allInvitationIds: string[] = [];
  const allRegistrationIds: string[] = [];
  type PorComissaoRow = {
    leader_id: string;
    commission_id: string;
    criados_neste_apply: number;
    leader_invitation_ids: string[];
  };
  const porComissaoList: PorComissaoRow[] = [];

  const client = await getClient();
  try {
    await client.query('BEGIN');

    for (const item of core.plano.bloco_a_aptos) {
      const leader = await getGroupLeaderById(item.leader_id);
      if (!leader?.user_id) {
        throw appError(`Líder ${item.leader_id} inválido no momento do apply.`, 400);
      }

      const expected = item.expectedBonuses_correto;
      let createdHere = 0;
      const idsHere: string[] = [];
      const regsHere: string[] = [];

      // Limite: nunca ultrapassar expected; rechecagem a cada passo evita duplicidade
      let safety = 0;
      const maxLoops = item.faltantes + 5;

      while (safety < maxLoops) {
        safety++;
        const current = await countTimesGrantedDb(client, item.leader_id, params.event_id, item.commission_id);
        if (current >= expected) break;

        const { registrationId, invitationId } = await insertOneMissingInviteSlot(client, {
          eventId: params.event_id,
          groupLeaderId: item.leader_id,
          leaderUserId: leader.user_id,
          categoryId: defaultCategoryId,
          commissionId: item.commission_id,
        });
        createdHere++;
        idsHere.push(invitationId);
        regsHere.push(registrationId);
        allInvitationIds.push(invitationId);
        allRegistrationIds.push(registrationId);

        const after = await countTimesGrantedDb(client, item.leader_id, params.event_id, item.commission_id);
        if (after > expected) {
          throw appError(
            `Segurança: após inserção, timesGranted (${after}) > expected (${expected}) para comissão ${item.commission_id}.`,
            500
          );
        }
      }

      if (createdHere > 0) {
        porComissaoList.push({
          leader_id: item.leader_id,
          commission_id: item.commission_id,
          criados_neste_apply: createdHere,
          leader_invitation_ids: idsHere,
        });
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return {
    ...base,
    mode: 'apply',
    relatorio_depois: {
      convites_criados_total: allInvitationIds.length,
      leader_invitation_ids_criados: allInvitationIds,
      registration_ids_bonus_criados: allRegistrationIds,
      por_comissao: porComissaoList,
      nota: `Apply executado por usuário ${params.executed_by}; geração idempotente por COUNT leader_invitations (available|sent|used) vs expectedBonuses_correto.`,
    },
  };
}
