/**
 * Fase 1 — Auditoria / simulador de bônus de convite (somente leitura).
 * Não executa INSERT/UPDATE/DELETE. Não chama checkAndGrantInvitationBonus.
 * Ref: docs/PLANO_AUDITORIA_CORRECAO_CONVITES_POS_MIGRACAO_ORGANIZADOR.md v1.2, FRONTE_0
 */

import { query } from '../config/database.js';
import { getRegistrationsByLeaderCoupons } from './leaderRegistrationsService.js';
import { getCouponByEventCommission } from './couponsService.js';
import { getCanonicalPaidRegistrationIds } from './invitationBonusCanonicalCore.js';

export const AUDIT_SCHEMA_VERSION = '1.1';

export type RegistrationOrigin = 'cupom' | 'referral' | 'ambos';

export type ErrorClassificationCode =
  | 'commission_coupon_matching'
  | 'wrongful_count_cupom_referral'
  | 'migration_organizer'
  | 'bonus_reprocessing'
  | 'ui_scope_event_vs_global_leader';

export type InvitationBonusDiagnostic =
  | 'cálculo inflado'
  | 'convites não concedidos apesar do esperado'
  | 'convites concedidos mas não exibidos ao líder'
  | 'registros free_bonus aparecendo na aba inscrições sem equivalência em convites disponíveis';

export type BonusRegistrationClassification =
  | 'valida'
  | 'sem_convite_correspondente'
  | 'duplicada'
  | 'orfa'
  | 'acima_do_esperado'
  | 'criada_fora_da_regra_da_comissao';

export interface EventBonusRegistrationAuditItem {
  registration_id: string;
  leader_id: string | null;
  commission_id: string | null;
  event_id: string;
  created_at: string | null;
  status: string | null;
  payment_status: string | null;
  coupon_code: string | null;
  bonus_registration_id: string | null;
  leader_invitation_id: string | null;
  classification: BonusRegistrationClassification[];
}

export interface InvitationBonusAuditCommissionRow {
  leader_id: string;
  commission_id: string;
  event_id: string;
  bonus_type: string;
  required_purchases: number;
  commission_percentage: number | null;
  commission_name: string | null;

  coupon_id: string | null;
  coupon_code: string | null;
  coupon_organizer_id: string | null;
  coupon_resolved: boolean;
  coupon_resolution_rule: string;

  registration_ids_production: string[];
  registration_ids_canonical: string[];
  registration_ids_only_production: string[];
  registration_ids_only_canonical: string[];
  origem_por_registration_id: Record<string, RegistrationOrigin>;

  paidCount_production: number;
  paidCount_canonical: number;
  expectedBonuses_production: number;
  expectedBonuses_canonical: number;

  times_granted_db: number;
  convites_por_status_comissao: Record<string, number>;
  times_available_db: number;
  times_sent_db: number;
  times_used_db: number;
  times_expired_db: number;

  /** leader_invitations.bonus_registration_id agrupados por status (quando não-nulos). */
  bonus_registration_ids_por_status: Record<string, string[]>;

  /** Canônico esperado para esta comissão mas não encontrado como bonus_registration_id em leader_invitations (statuses available/sent/used). */
  registration_ids_canonical_expected_but_missing_invites: string[];
  /** Concedidos no DB (available/sent/used) mas não explicados pelos ids canônicos. */
  bonus_registration_ids_in_db_not_in_canonical: string[];

  /** Produção (atual) explicada por inscrições mas sem equivalência em convites concedidos (available/sent/used). */
  registration_ids_production_without_equivalent_in_invites: string[];

  /** Hipóteses diagnósticas para facilitar o entendimento no log técnico. */
  diagnostic_hypotheses: InvitationBonusDiagnostic[];

  comparativo_bonus_extras: {
    convites_esperados: number;
    convites_existentes: number;
    inscricoes_bonus_existentes: number;
    inscricoes_bonus_validas: number;
    inscricoes_bonus_excedentes: number;
    inscricoes_bonus_sem_lastro_em_leader_invitations: number;
    convites_sem_inscricao_bonus_correspondente: number;
  };

  registration_ids_bonus_validos: string[];
  registration_ids_bonus_excesso: string[];
  registration_ids_bonus_orfaos: string[];
  registration_ids_bonus_sem_convite: string[];
  leader_invitation_ids_validos: string[];
  leader_invitation_ids_sem_registration: string[];
  leader_invitation_ids_excesso: string[];

  /** Convites deste evento por status (escopo do líder, agregados). Útil pra separar “global vs evento” no report. */
  convites_no_evento_por_status: Record<string, number>;
  divergencia_paid_count: number;
  divergencia_expected_bonuses: number;
  error_classification_row: ErrorClassificationCode[];
}

export interface InvitationBonusAuditLeaderScope {
  leader_id: string;
  /** Todos os convites do líder em qualquer evento. */
  convites_globais_por_status: Record<string, number>;
  /** Convites deste evento apenas (sem duplicar por comissão). */
  convites_neste_evento_por_status: Record<string, number>;
}

export interface InvitationBonusAuditResult {
  schema_version: string;
  generated_at: string;
  event_id: string;
  event_title: string | null;
  organizer_id: string | null;
  leader_id_filter: string | null;
  functional_report_markdown: string;
  technical_log: {
    rows: InvitationBonusAuditCommissionRow[];
    leaders_scope: InvitationBonusAuditLeaderScope[];
    bonus_registrations_event: EventBonusRegistrationAuditItem[];
    bonus_event_summary: {
      convites_esperados: number;
      convites_existentes: number;
      inscricoes_bonus_existentes: number;
      inscricoes_bonus_validas: number;
      inscricoes_bonus_excedentes: number;
      inscricoes_bonus_sem_lastro_em_leader_invitations: number;
      convites_sem_inscricao_bonus_correspondente: number;
      registration_ids_bonus_validos: string[];
      registration_ids_bonus_excesso: string[];
      registration_ids_bonus_orfaos: string[];
      registration_ids_bonus_sem_convite: string[];
      leader_invitation_ids_validos: string[];
      leader_invitation_ids_sem_registration: string[];
      leader_invitation_ids_excesso: string[];
    };
    diagnostic_conclusion: {
      principal_cause:
        | 'bonus_reprocessing'
        | 'ui_scope_event_vs_global_leader'
        | 'criacao_indevida_real_de_inscricoes_bonus'
        | 'inconclusivo';
      confidence: 'baixa' | 'media' | 'alta';
      evidence: string[];
    };
    error_classification_aggregate: ErrorClassificationCode[];
    notes: string[];
  };
}

function requiredPurchasesSafe(v: unknown): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return n >= 1 ? n : 1;
}

async function classifyOrigins(
  leaderId: string,
  registrationIds: string[]
): Promise<Record<string, RegistrationOrigin>> {
  const out: Record<string, RegistrationOrigin> = {};
  if (registrationIds.length === 0) return out;

  const result = await query(
    `SELECT r.id::text AS id,
       (r.coupon_code IS NOT NULL AND EXISTS (
          SELECT 1 FROM coupons cp
          WHERE UPPER(TRIM(cp.code)) = UPPER(TRIM(r.coupon_code)) AND cp.leader_id = $2
        )) AS via_cupom,
       EXISTS (
          SELECT 1 FROM user_referrals ur
          WHERE ur.user_id = r.runner_id AND ur.leader_id = $2
        ) AS via_referral
     FROM registrations r
     WHERE r.id = ANY($1::uuid[])`,
    [registrationIds, leaderId]
  );
  for (const row of result.rows as { id: string; via_cupom: boolean; via_referral: boolean }[]) {
    const c = row.via_cupom;
    const ref = row.via_referral;
    if (c && ref) out[row.id] = 'ambos';
    else if (c) out[row.id] = 'cupom';
    else if (ref) out[row.id] = 'referral';
    else out[row.id] = 'referral'; // fallback teórico
  }
  return out;
}

async function countInvitationsByStatus(
  leaderId: string,
  eventId: string | null
): Promise<Record<string, number>> {
  let sql =
    `SELECT li.status::text AS status, COUNT(*)::int AS cnt
     FROM leader_invitations li
     WHERE li.leader_id = $1`;
  const params: unknown[] = [leaderId];
  if (eventId) {
    sql += ` AND li.event_id = $2`;
    params.push(eventId);
  }
  sql += ` GROUP BY li.status`;
  const result = await query(sql, params);
  const map: Record<string, number> = {};
  for (const row of result.rows as { status: string; cnt: number }[]) {
    map[row.status] = row.cnt;
  }
  return map;
}

function setDiff(a: string[], b: string[]): string[] {
  const bs = new Set(b);
  return a.filter((x) => !bs.has(x));
}

function classifyRow(row: InvitationBonusAuditCommissionRow): ErrorClassificationCode[] {
  const codes = new Set<ErrorClassificationCode>();
  if (!row.coupon_resolved && row.paidCount_production > row.paidCount_canonical) {
    codes.add('commission_coupon_matching');
  }
  if (row.divergencia_paid_count > 0) {
    for (const id of row.registration_ids_only_production) {
      const o = row.origem_por_registration_id[id];
      if (o === 'referral') {
        codes.add('wrongful_count_cupom_referral');
        break;
      }
    }
  }
  if (row.expectedBonuses_production > row.times_granted_db + 2) {
    codes.add('bonus_reprocessing');
  }
  return Array.from(codes);
}

function uniqueSorted<T extends string>(ids: T[]): T[] {
  return Array.from(new Set(ids)).sort() as T[];
}

function sumByKeys(map: Record<string, number>, keys: string[]): number {
  let s = 0;
  for (const k of keys) s += map[k] ?? 0;
  return s;
}

function buildDiagnosticHypotheses(params: {
  paidCount_production: number;
  paidCount_canonical: number;
  expectedBonuses_canonical: number;
  times_granted_db: number;
  bonus_registration_ids_in_db_not_in_canonical: string[];
  registration_ids_canonical_expected_but_missing_invites: string[];
  registration_ids_production_without_equivalent_in_invites: string[];
}): InvitationBonusDiagnostic[] {
  const out: InvitationBonusDiagnostic[] = [];

  if (params.paidCount_production > params.paidCount_canonical) {
    out.push('cálculo inflado');
  }

  if (params.expectedBonuses_canonical > params.times_granted_db) {
    out.push('convites não concedidos apesar do esperado');
  }

  if (params.bonus_registration_ids_in_db_not_in_canonical.length > 0) {
    out.push('convites concedidos mas não exibidos ao líder');
  }

  if (
    params.registration_ids_production_without_equivalent_in_invites.length > 0 &&
    params.registration_ids_canonical_expected_but_missing_invites.length > 0
  ) {
    out.push('registros free_bonus aparecendo na aba inscrições sem equivalência em convites disponíveis');
  }

  return uniqueSorted(out);
}

function formatIdList(ids: string[], maxIds = 25): { text: string; truncated: boolean } {
  if (!ids.length) return { text: '—', truncated: false };
  const truncated = ids.length > maxIds;
  const shown = truncated ? ids.slice(0, maxIds) : ids;
  const compact = shown.map((id) => `\`${id.slice(0, 8)}…\``).join(', ');
  return { text: truncated ? `${compact} (+${ids.length - maxIds} outros)` : compact, truncated };
}

function formatIdListWithOrigin(
  ids: string[],
  originMap: Record<string, RegistrationOrigin>,
  maxIds = 25
): { text: string; truncated: boolean } {
  if (!ids.length) return { text: '—', truncated: false };
  const truncated = ids.length > maxIds;
  const shown = truncated ? ids.slice(0, maxIds) : ids;
  const compact = shown
    .map((id) => {
      const origin = originMap[id] ?? '?';
      return `\`${id.slice(0, 8)}…\`(${origin})`;
    })
    .join(', ');
  return {
    text: truncated ? `${compact} (+${ids.length - maxIds} outros)` : compact,
    truncated,
  };
}

interface RawBonusEventRow {
  registration_id: string;
  event_id: string;
  created_at: string | null;
  status: string | null;
  payment_status: string | null;
  coupon_code: string | null;
  leader_invitation_id: string | null;
  invitation_leader_id: string | null;
  invitation_commission_id: string | null;
  bonus_registration_id: string | null;
  invitation_status: string | null;
  commission_bonus_type: string | null;
  commission_event_id: string | null;
}

interface CommissionBonusAuditArtifacts {
  items: EventBonusRegistrationAuditItem[];
  registration_ids_bonus_validos: string[];
  registration_ids_bonus_excesso: string[];
  registration_ids_bonus_orfaos: string[];
  registration_ids_bonus_sem_convite: string[];
  leader_invitation_ids_validos: string[];
  leader_invitation_ids_sem_registration: string[];
  leader_invitation_ids_excesso: string[];
  comparativo_bonus_extras: InvitationBonusAuditCommissionRow['comparativo_bonus_extras'];
}

function hasRegClass(
  cls: BonusRegistrationClassification[],
  target: BonusRegistrationClassification
): boolean {
  return cls.includes(target);
}

function groupByRegistration(rows: RawBonusEventRow[]): Map<string, RawBonusEventRow[]> {
  const out = new Map<string, RawBonusEventRow[]>();
  for (const r of rows) {
    const arr = out.get(r.registration_id) ?? [];
    arr.push(r);
    out.set(r.registration_id, arr);
  }
  return out;
}

function pickLeaderInvitationId(rows: RawBonusEventRow[]): string | null {
  for (const r of rows) {
    if (r.leader_invitation_id) return r.leader_invitation_id;
  }
  return null;
}

function buildCommissionBonusArtifacts(params: {
  eventId: string;
  leaderId: string;
  commissionId: string;
  expectedBonusesCanonical: number;
  rawRows: RawBonusEventRow[];
  invitationIdsNoRegistration: string[];
}): CommissionBonusAuditArtifacts {
  const filtered = params.rawRows.filter(
    (r) => r.invitation_leader_id === params.leaderId && r.invitation_commission_id === params.commissionId
  );
  const byReg = groupByRegistration(filtered);

  const items: EventBonusRegistrationAuditItem[] = [];
  const validRegIds: string[] = [];
  const excessRegIds: string[] = [];
  const orphanRegIds: string[] = [];
  const noInvitationRegIds: string[] = [];
  const validInvitationIds: string[] = [];
  const excessInvitationIds: string[] = [];
  const invitationsNoRegistration = uniqueSorted(params.invitationIdsNoRegistration);

  const regIdsByCreatedAsc = Array.from(byReg.entries())
    .sort((a, b) => {
      const ca = a[1][0]?.created_at || '';
      const cb = b[1][0]?.created_at || '';
      return ca.localeCompare(cb);
    })
    .map((x) => x[0]);
  const allowedSet = new Set<string>(regIdsByCreatedAsc.slice(0, Math.max(0, params.expectedBonusesCanonical)));

  for (const [registrationId, regRows] of byReg.entries()) {
    const first = regRows[0];
    const invitationIds = uniqueSorted(
      regRows
        .map((r) => r.leader_invitation_id)
        .filter((x): x is string => !!x)
    );
    const classes: BonusRegistrationClassification[] = [];

    if (invitationIds.length === 0) classes.push('sem_convite_correspondente');
    if (invitationIds.length > 1) classes.push('duplicada');

    const outsideRule = regRows.some((r) => {
      if (!r.invitation_commission_id) return true;
      if (!r.commission_bonus_type || !['invitation', 'both'].includes(String(r.commission_bonus_type))) return true;
      if (r.commission_event_id && r.commission_event_id !== params.eventId) return true;
      return false;
    });
    if (outsideRule) classes.push('criada_fora_da_regra_da_comissao');

    const orphan =
      regRows.some((r) => !r.invitation_leader_id || !r.invitation_commission_id) || invitationIds.length === 0;
    if (orphan) classes.push('orfa');

    if (!allowedSet.has(registrationId)) classes.push('acima_do_esperado');

    if (classes.length === 0) classes.push('valida');

    const dedupClasses = uniqueSorted(classes);
    const liId = pickLeaderInvitationId(regRows);
    items.push({
      registration_id: registrationId,
      leader_id: first?.invitation_leader_id ?? null,
      commission_id: first?.invitation_commission_id ?? null,
      event_id: first?.event_id ?? params.eventId,
      created_at: first?.created_at ?? null,
      status: first?.status ?? null,
      payment_status: first?.payment_status ?? null,
      coupon_code: first?.coupon_code ?? null,
      bonus_registration_id: first?.bonus_registration_id ?? registrationId,
      leader_invitation_id: liId,
      classification: dedupClasses,
    });

    if (dedupClasses.length === 1 && dedupClasses[0] === 'valida') {
      validRegIds.push(registrationId);
      if (liId) validInvitationIds.push(liId);
    }
    if (hasRegClass(dedupClasses, 'acima_do_esperado') || hasRegClass(dedupClasses, 'duplicada')) {
      excessRegIds.push(registrationId);
      for (const id of invitationIds) excessInvitationIds.push(id);
    }
    if (
      hasRegClass(dedupClasses, 'orfa') ||
      hasRegClass(dedupClasses, 'sem_convite_correspondente') ||
      hasRegClass(dedupClasses, 'criada_fora_da_regra_da_comissao')
    ) {
      orphanRegIds.push(registrationId);
    }
    if (hasRegClass(dedupClasses, 'sem_convite_correspondente')) {
      noInvitationRegIds.push(registrationId);
    }
  }

  const registration_ids_bonus_validos = uniqueSorted(validRegIds);
  const registration_ids_bonus_excesso = uniqueSorted(excessRegIds);
  const registration_ids_bonus_orfaos = uniqueSorted(orphanRegIds);
  const registration_ids_bonus_sem_convite = uniqueSorted(noInvitationRegIds);
  const leader_invitation_ids_validos = uniqueSorted(validInvitationIds);
  const leader_invitation_ids_excesso = uniqueSorted(excessInvitationIds);
  const leader_invitation_ids_sem_registration = invitationsNoRegistration;

  return {
    items: items.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')),
    registration_ids_bonus_validos,
    registration_ids_bonus_excesso,
    registration_ids_bonus_orfaos,
    registration_ids_bonus_sem_convite,
    leader_invitation_ids_validos,
    leader_invitation_ids_sem_registration,
    leader_invitation_ids_excesso,
    comparativo_bonus_extras: {
      convites_esperados: params.expectedBonusesCanonical,
      convites_existentes: filtered.length + invitationsNoRegistration.length,
      inscricoes_bonus_existentes: byReg.size,
      inscricoes_bonus_validas: registration_ids_bonus_validos.length,
      inscricoes_bonus_excedentes: registration_ids_bonus_excesso.length,
      inscricoes_bonus_sem_lastro_em_leader_invitations: registration_ids_bonus_orfaos.length,
      convites_sem_inscricao_bonus_correspondente: invitationsNoRegistration.length,
    },
  };
}

/**
 * Executa auditoria + simulador (leitura apenas).
 */
export async function runInvitationBonusAudit(params: {
  event_id: string;
  leader_id?: string | null;
}): Promise<InvitationBonusAuditResult> {
  const { event_id: eventId, leader_id: leaderIdFilter } = params;

  const eventResult = await query(
    `SELECT id, title, organizer_id::text AS organizer_id FROM events WHERE id = $1`,
    [eventId]
  );
  if (eventResult.rows.length === 0) {
    throw new Error('Evento não encontrado');
  }
  const eventRow = eventResult.rows[0] as { id: string; title: string | null; organizer_id: string | null };

  let leaderIds: string[] = [];
  const qLeaders = await query(
    `SELECT DISTINCT lec.leader_id::text AS leader_id
     FROM leader_event_commissions lec
     WHERE lec.event_id = $1
       AND lec.bonus_type IN ('invitation', 'both')
     UNION
     SELECT DISTINCT li.leader_id::text
     FROM leader_invitations li
     WHERE li.event_id = $1`,
    [eventId]
  );
  leaderIds = (qLeaders.rows as { leader_id: string }[]).map((r) => r.leader_id);

  if (leaderIdFilter) {
    const gl = await query(`SELECT id::text FROM group_leaders WHERE id = $1`, [leaderIdFilter]);
    if (gl.rows.length === 0) {
      throw new Error('leader_id não encontrado em group_leaders');
    }
    leaderIds = [leaderIdFilter];
  }

  const rows: InvitationBonusAuditCommissionRow[] = [];
  const leadersScope: InvitationBonusAuditLeaderScope[] = [];
  const bonusRegistrationsEvent: EventBonusRegistrationAuditItem[] = [];
  const notes: string[] = [
    'Cálculo PRODUÇÃO: espelha getCouponByEventCommission + getRegistrationsByLeaderCoupons (com ou sem coupon_code), como em checkAndGrantInvitationBonus.',
    'Cálculo CANÔNICO: apenas inscrições pagas, não canceladas, no evento, com coupon_code igual ao cupom da comissão e cupom do líder (sem contar só-referral).',
    'times_granted_db: COUNT leader_invitations com status IN (available, sent, used) por comissão.',
    'Auditoria de inscrições bônus/extras (v1.3): leitura de registrations + leader_invitations, com classificação e arrays para futura correção na Fase 2.',
  ];

  const eventSummaryAcc = {
    convites_esperados: 0,
    convites_existentes: 0,
    inscricoes_bonus_existentes: 0,
    inscricoes_bonus_validas: 0,
    inscricoes_bonus_excedentes: 0,
    inscricoes_bonus_sem_lastro_em_leader_invitations: 0,
    convites_sem_inscricao_bonus_correspondente: 0,
    registration_ids_bonus_validos: [] as string[],
    registration_ids_bonus_excesso: [] as string[],
    registration_ids_bonus_orfaos: [] as string[],
    registration_ids_bonus_sem_convite: [] as string[],
    leader_invitation_ids_validos: [] as string[],
    leader_invitation_ids_sem_registration: [] as string[],
    leader_invitation_ids_excesso: [] as string[],
  };

  const rawBonusRowsResult = await query(
    `SELECT
       r.id::text AS registration_id,
       r.event_id::text AS event_id,
       r.created_at::text AS created_at,
       r.status::text AS status,
       r.payment_status::text AS payment_status,
       r.coupon_code::text AS coupon_code,
       li.id::text AS leader_invitation_id,
       li.leader_id::text AS invitation_leader_id,
       li.commission_id::text AS invitation_commission_id,
       li.bonus_registration_id::text AS bonus_registration_id,
       li.status::text AS invitation_status,
       lec.bonus_type::text AS commission_bonus_type,
       lec.event_id::text AS commission_event_id
     FROM registrations r
     LEFT JOIN leader_invitations li
       ON li.bonus_registration_id = r.id
      AND li.event_id = r.event_id
     LEFT JOIN leader_event_commissions lec
       ON lec.id = li.commission_id
     WHERE r.event_id = $1
       AND (
         LOWER(COALESCE(r.payment_method::text, '')) = 'free_bonus'
         OR li.id IS NOT NULL
       )
     ORDER BY r.created_at ASC`,
    [eventId]
  );
  const rawBonusRows = rawBonusRowsResult.rows as RawBonusEventRow[];

  const invitationNoRegistrationResult = await query(
    `SELECT
       li.id::text AS leader_invitation_id,
       li.leader_id::text AS leader_id,
       li.commission_id::text AS commission_id
     FROM leader_invitations li
     LEFT JOIN registrations r ON r.id = li.bonus_registration_id
     WHERE li.event_id = $1
       AND li.commission_id IS NOT NULL
       AND li.bonus_registration_id IS NOT NULL
       AND r.id IS NULL`,
    [eventId]
  );
  const invitationIdsNoRegistrationByPair = new Map<string, string[]>();
  for (const r of invitationNoRegistrationResult.rows as {
    leader_invitation_id: string;
    leader_id: string;
    commission_id: string;
  }[]) {
    const key = `${r.leader_id}:${r.commission_id}`;
    const arr = invitationIdsNoRegistrationByPair.get(key) ?? [];
    arr.push(r.leader_invitation_id);
    invitationIdsNoRegistrationByPair.set(key, arr);
  }

  for (const leaderId of leaderIds) {
    const globalCounts = await countInvitationsByStatus(leaderId, null);
    const eventCounts = await countInvitationsByStatus(leaderId, eventId);
    leadersScope.push({
      leader_id: leaderId,
      convites_globais_por_status: globalCounts,
      convites_neste_evento_por_status: eventCounts,
    });

    // Cupom: contagem de cupons do líder ligados ao evento para ajudar a explicar a regra de resolução.
    const eventCouponCountResult = await query(
      `SELECT COUNT(DISTINCT c.id)::int AS cnt
       FROM coupons c
       LEFT JOIN coupon_events ce ON ce.coupon_id = c.id
       WHERE c.leader_id = $1
         AND (ce.event_id = $2 OR c.event_id = $2)`,
      [leaderId, eventId]
    );
    const eventCouponCount = (eventCouponCountResult.rows[0] as { cnt: number })?.cnt ?? 0;

    const commissions = await query(
      `SELECT
         id::text AS id,
         bonus_type::text AS bonus_type,
         required_purchases,
         commission_percentage,
         name,
         leader_id::text AS leader_id
       FROM leader_event_commissions
       WHERE event_id = $1 AND leader_id = $2
         AND bonus_type IN ('invitation', 'both')
       ORDER BY created_at ASC`,
      [eventId, leaderId]
    );

    for (const comm of commissions.rows as {
      id: string;
      bonus_type: string;
      required_purchases: number | null;
      commission_percentage: number | null;
      name: string | null;
      leader_id: string;
    }[]) {
      const req = requiredPurchasesSafe(comm.required_purchases);

      let coupon: { id: string; code: string; organizer_id: string | null; name: string | null } | null = null;
      let coupon_resolution_rule = 'não resolvido';
      try {
        const c = await getCouponByEventCommission(leaderId, eventId, comm.id);
        if (c?.id && c?.code) {
          coupon = {
            id: c.id,
            code: c.code,
            organizer_id: (c as any).organizer_id ?? null,
            name: (c as any).name ?? null,
          };

          const commissionIdShort = comm.id.replace(/-/g, '').substring(0, 8).toUpperCase();
          const codeMatches = !!coupon?.code && coupon.code.includes(commissionIdShort);
          const nameMatches =
            !!comm.name && !!coupon?.name && coupon.name.includes(comm.name);

          if (codeMatches) {
            coupon_resolution_rule = 'cupom resolvido pelo match do commission_id_short no código';
          } else if (nameMatches) {
            coupon_resolution_rule = 'cupom resolvido pelo match do nome da comissão no nome do cupom';
          } else if (eventCouponCount === 1) {
            coupon_resolution_rule = 'fallback: único cupom do evento para o líder';
          } else {
            coupon_resolution_rule = 'fallback: múltiplos cupons do evento para o líder (primeiro após filtros)';
          }
        }
      } catch {
        coupon = null;
        coupon_resolution_rule = 'erro ao resolver cupom (tratado como não resolvido)';
      }

      if (!coupon) {
        coupon_resolution_rule = 'nenhum cupom encontrado para esta comissão';
      }

      const prodRegs = await getRegistrationsByLeaderCoupons(leaderId, {
        event_id: eventId,
        payment_status: 'paid',
        coupon_code: coupon?.code ? coupon.code : undefined,
      });
      const registration_ids_production = prodRegs.map((r) => r.id);

      const registration_ids_canonical = await getCanonicalPaidRegistrationIds(
        leaderId,
        eventId,
        coupon?.code ?? null
      );

      const origem_por_registration_id = await classifyOrigins(leaderId, registration_ids_production);

      const onlyProd = setDiff(registration_ids_production, registration_ids_canonical);
      const onlyCanon = setDiff(registration_ids_canonical, registration_ids_production);

      const paidCount_production = registration_ids_production.length;
      const paidCount_canonical = registration_ids_canonical.length;
      const expectedBonuses_production = Math.floor(paidCount_production / req);
      const expectedBonuses_canonical = Math.floor(paidCount_canonical / req);

      // Convites reais no DB para esta comissão (por status) + mapeamento do bonus_registration_id.
      const invRes = await query(
        `SELECT
           li.status::text AS status,
           li.bonus_registration_id::text AS bonus_registration_id
         FROM leader_invitations li
         WHERE li.leader_id = $1
           AND li.event_id = $2
           AND li.commission_id = $3`,
        [leaderId, eventId, comm.id]
      );
      const convites_por_status_comissao: Record<string, number> = {};
      const bonus_registration_ids_por_status: Record<string, string[]> = {};
      for (const r of invRes.rows as { status: string; bonus_registration_id: string | null }[]) {
        convites_por_status_comissao[r.status] = (convites_por_status_comissao[r.status] ?? 0) + 1;
        if (r.bonus_registration_id) {
          bonus_registration_ids_por_status[r.status] = bonus_registration_ids_por_status[r.status] ?? [];
          bonus_registration_ids_por_status[r.status].push(r.bonus_registration_id);
        }
      }

      const times_available_db = convites_por_status_comissao['available'] ?? 0;
      const times_sent_db = convites_por_status_comissao['sent'] ?? 0;
      const times_used_db = convites_por_status_comissao['used'] ?? 0;
      const times_expired_db = convites_por_status_comissao['expired'] ?? 0;
      const times_granted_db = times_available_db + times_sent_db + times_used_db;

      // Convites deste evento por status (agregados do líder) — mantém separação global vs evento no report.
      const convites_no_evento_por_status = await countInvitationsByStatus(leaderId, eventId);

      const bonusActiveSet = new Set<string>([
        ...(bonus_registration_ids_por_status['available'] ?? []),
        ...(bonus_registration_ids_por_status['sent'] ?? []),
        ...(bonus_registration_ids_por_status['used'] ?? []),
      ]);

      const canonicalSet = new Set<string>(registration_ids_canonical);

      const registration_ids_canonical_expected_but_missing_invites = registration_ids_canonical.filter(
        (id) => !bonusActiveSet.has(id)
      );

      const bonusActiveIds = uniqueSorted([
        ...(bonus_registration_ids_por_status['available'] ?? []),
        ...(bonus_registration_ids_por_status['sent'] ?? []),
        ...(bonus_registration_ids_por_status['used'] ?? []),
      ]);

      const bonus_registration_ids_in_db_not_in_canonical = bonusActiveIds.filter((id) => !canonicalSet.has(id));

      const registration_ids_production_without_equivalent_in_invites = registration_ids_production.filter(
        (id) => !bonusActiveSet.has(id)
      );

      const pairKey = `${leaderId}:${comm.id}`;
      const commissionBonusArtifacts = buildCommissionBonusArtifacts({
        eventId,
        leaderId,
        commissionId: comm.id,
        expectedBonusesCanonical: expectedBonuses_canonical,
        rawRows: rawBonusRows,
        invitationIdsNoRegistration: invitationIdsNoRegistrationByPair.get(pairKey) ?? [],
      });
      bonusRegistrationsEvent.push(...commissionBonusArtifacts.items);

      const baseRow: InvitationBonusAuditCommissionRow = {
        leader_id: leaderId,
        commission_id: comm.id,
        event_id: eventId,
        bonus_type: comm.bonus_type,
        required_purchases: req,
        commission_percentage:
          comm.commission_percentage === null || comm.commission_percentage === undefined
            ? null
            : Number.isFinite(Number(comm.commission_percentage))
              ? Number(comm.commission_percentage)
              : parseFloat(String(comm.commission_percentage)),
        commission_name: comm.name,
        coupon_id: coupon?.id ?? null,
        coupon_code: coupon?.code ?? null,
        coupon_organizer_id: coupon?.organizer_id ?? null,
        coupon_resolved: !!coupon,
        coupon_resolution_rule,
        registration_ids_production,
        registration_ids_canonical,
        registration_ids_only_production: onlyProd,
        registration_ids_only_canonical: onlyCanon,
        origem_por_registration_id,
        paidCount_production,
        paidCount_canonical,
        expectedBonuses_production,
        expectedBonuses_canonical,

        times_available_db,
        times_sent_db,
        times_used_db,
        times_expired_db,
        times_granted_db,
        convites_por_status_comissao,
        bonus_registration_ids_por_status,
        registration_ids_canonical_expected_but_missing_invites,
        bonus_registration_ids_in_db_not_in_canonical,
        registration_ids_production_without_equivalent_in_invites,
        diagnostic_hypotheses: buildDiagnosticHypotheses({
          paidCount_production,
          paidCount_canonical,
          expectedBonuses_canonical,
          times_granted_db,
          bonus_registration_ids_in_db_not_in_canonical,
          registration_ids_canonical_expected_but_missing_invites,
          registration_ids_production_without_equivalent_in_invites,
        }),
        comparativo_bonus_extras: commissionBonusArtifacts.comparativo_bonus_extras,
        registration_ids_bonus_validos: commissionBonusArtifacts.registration_ids_bonus_validos,
        registration_ids_bonus_excesso: commissionBonusArtifacts.registration_ids_bonus_excesso,
        registration_ids_bonus_orfaos: commissionBonusArtifacts.registration_ids_bonus_orfaos,
        registration_ids_bonus_sem_convite: commissionBonusArtifacts.registration_ids_bonus_sem_convite,
        leader_invitation_ids_validos: commissionBonusArtifacts.leader_invitation_ids_validos,
        leader_invitation_ids_sem_registration: commissionBonusArtifacts.leader_invitation_ids_sem_registration,
        leader_invitation_ids_excesso: commissionBonusArtifacts.leader_invitation_ids_excesso,

        convites_no_evento_por_status,
        divergencia_paid_count: paidCount_production - paidCount_canonical,
        divergencia_expected_bonuses: expectedBonuses_production - expectedBonuses_canonical,
        error_classification_row: [],
      };
      baseRow.error_classification_row = classifyRow(baseRow);
      rows.push(baseRow);

      eventSummaryAcc.convites_esperados += baseRow.comparativo_bonus_extras.convites_esperados;
      eventSummaryAcc.convites_existentes += baseRow.comparativo_bonus_extras.convites_existentes;
      eventSummaryAcc.inscricoes_bonus_existentes += baseRow.comparativo_bonus_extras.inscricoes_bonus_existentes;
      eventSummaryAcc.inscricoes_bonus_validas += baseRow.comparativo_bonus_extras.inscricoes_bonus_validas;
      eventSummaryAcc.inscricoes_bonus_excedentes += baseRow.comparativo_bonus_extras.inscricoes_bonus_excedentes;
      eventSummaryAcc.inscricoes_bonus_sem_lastro_em_leader_invitations +=
        baseRow.comparativo_bonus_extras.inscricoes_bonus_sem_lastro_em_leader_invitations;
      eventSummaryAcc.convites_sem_inscricao_bonus_correspondente +=
        baseRow.comparativo_bonus_extras.convites_sem_inscricao_bonus_correspondente;
      eventSummaryAcc.registration_ids_bonus_validos.push(...baseRow.registration_ids_bonus_validos);
      eventSummaryAcc.registration_ids_bonus_excesso.push(...baseRow.registration_ids_bonus_excesso);
      eventSummaryAcc.registration_ids_bonus_orfaos.push(...baseRow.registration_ids_bonus_orfaos);
      eventSummaryAcc.registration_ids_bonus_sem_convite.push(...baseRow.registration_ids_bonus_sem_convite);
      eventSummaryAcc.leader_invitation_ids_validos.push(...baseRow.leader_invitation_ids_validos);
      eventSummaryAcc.leader_invitation_ids_sem_registration.push(...baseRow.leader_invitation_ids_sem_registration);
      eventSummaryAcc.leader_invitation_ids_excesso.push(...baseRow.leader_invitation_ids_excesso);
    }
  }

  const agg = new Set<ErrorClassificationCode>();
  for (const r of rows) {
    for (const c of r.error_classification_row) agg.add(c);
  }
  if (leadersScope.some((l) => Object.values(l.convites_globais_por_status).reduce((a, b) => a + b, 0) > 0)) {
    agg.add('ui_scope_event_vs_global_leader');
  }

  // Complementa a seção de inscrições bônus/extras com itens do evento que não entraram em linhas de comissão auditadas.
  const existingBonusItemKeys = new Set(
    bonusRegistrationsEvent.map(
      (x) => `${x.registration_id}:${x.leader_id ?? 'null'}:${x.commission_id ?? 'null'}`
    )
  );
  const rawByReg = groupByRegistration(rawBonusRows);
  for (const [regId, regRows] of rawByReg.entries()) {
    const first = regRows[0];
    const leaderId = first?.invitation_leader_id ?? null;
    const commissionId = first?.invitation_commission_id ?? null;
    const itemKey = `${regId}:${leaderId ?? 'null'}:${commissionId ?? 'null'}`;
    if (existingBonusItemKeys.has(itemKey)) continue;

    const invitationIds = uniqueSorted(
      regRows
        .map((r) => r.leader_invitation_id)
        .filter((x): x is string => !!x)
    );
    const classes: BonusRegistrationClassification[] = [];
    if (invitationIds.length === 0) classes.push('sem_convite_correspondente');
    if (invitationIds.length > 1) classes.push('duplicada');
    const outsideRule = regRows.some((r) => {
      if (!r.invitation_commission_id) return false;
      if (!r.commission_bonus_type || !['invitation', 'both'].includes(String(r.commission_bonus_type))) return true;
      if (r.commission_event_id && r.commission_event_id !== eventId) return true;
      return false;
    });
    if (outsideRule) classes.push('criada_fora_da_regra_da_comissao');
    if (classes.length === 0) classes.push('valida');

    bonusRegistrationsEvent.push({
      registration_id: regId,
      leader_id: leaderId,
      commission_id: commissionId,
      event_id: first?.event_id ?? eventId,
      created_at: first?.created_at ?? null,
      status: first?.status ?? null,
      payment_status: first?.payment_status ?? null,
      coupon_code: first?.coupon_code ?? null,
      bonus_registration_id: first?.bonus_registration_id ?? regId,
      leader_invitation_id: pickLeaderInvitationId(regRows),
      classification: uniqueSorted(classes),
    });
  }

  const bonusRegistrationsEventSorted = bonusRegistrationsEvent.sort((a, b) =>
    `${a.created_at ?? ''}:${a.registration_id}`.localeCompare(`${b.created_at ?? ''}:${b.registration_id}`)
  );

  const bonusEventSummary = {
    convites_esperados: eventSummaryAcc.convites_esperados,
    convites_existentes: eventSummaryAcc.convites_existentes,
    inscricoes_bonus_existentes: eventSummaryAcc.inscricoes_bonus_existentes,
    inscricoes_bonus_validas: eventSummaryAcc.inscricoes_bonus_validas,
    inscricoes_bonus_excedentes: eventSummaryAcc.inscricoes_bonus_excedentes,
    inscricoes_bonus_sem_lastro_em_leader_invitations:
      eventSummaryAcc.inscricoes_bonus_sem_lastro_em_leader_invitations,
    convites_sem_inscricao_bonus_correspondente:
      eventSummaryAcc.convites_sem_inscricao_bonus_correspondente,
    registration_ids_bonus_validos: uniqueSorted(eventSummaryAcc.registration_ids_bonus_validos),
    registration_ids_bonus_excesso: uniqueSorted(eventSummaryAcc.registration_ids_bonus_excesso),
    registration_ids_bonus_orfaos: uniqueSorted(eventSummaryAcc.registration_ids_bonus_orfaos),
    registration_ids_bonus_sem_convite: uniqueSorted(eventSummaryAcc.registration_ids_bonus_sem_convite),
    leader_invitation_ids_validos: uniqueSorted(eventSummaryAcc.leader_invitation_ids_validos),
    leader_invitation_ids_sem_registration: uniqueSorted(eventSummaryAcc.leader_invitation_ids_sem_registration),
    leader_invitation_ids_excesso: uniqueSorted(eventSummaryAcc.leader_invitation_ids_excesso),
  };

  const totalGlobalInvites = leadersScope.reduce(
    (acc, ls) => acc + sumByKeys(ls.convites_globais_por_status, ['available', 'sent', 'used', 'expired']),
    0
  );
  const totalEventInvites = leadersScope.reduce(
    (acc, ls) => acc + sumByKeys(ls.convites_neste_evento_por_status, ['available', 'sent', 'used', 'expired']),
    0
  );
  const hasRealBonusCreationIssue =
    bonusEventSummary.inscricoes_bonus_excedentes > 0 ||
    bonusEventSummary.inscricoes_bonus_sem_lastro_em_leader_invitations > 0 ||
    bonusEventSummary.registration_ids_bonus_sem_convite.length > 0;

  const diagnosticConclusion: InvitationBonusAuditResult['technical_log']['diagnostic_conclusion'] = hasRealBonusCreationIssue
    ? {
        principal_cause: 'criacao_indevida_real_de_inscricoes_bonus',
        confidence: 'alta',
        evidence: [
          `inscricoes_bonus_excedentes=${bonusEventSummary.inscricoes_bonus_excedentes}`,
          `inscricoes_bonus_sem_lastro_em_leader_invitations=${bonusEventSummary.inscricoes_bonus_sem_lastro_em_leader_invitations}`,
          `registration_ids_bonus_sem_convite=${bonusEventSummary.registration_ids_bonus_sem_convite.length}`,
        ],
      }
    : totalGlobalInvites > totalEventInvites && totalEventInvites > 0
      ? {
          principal_cause: 'ui_scope_event_vs_global_leader',
          confidence: 'media',
          evidence: [
            `total_global_invites=${totalGlobalInvites}`,
            `total_event_invites=${totalEventInvites}`,
            'não foram encontrados excedentes/órfãos relevantes de inscrições bônus no evento',
          ],
        }
      : agg.has('bonus_reprocessing')
        ? {
            principal_cause: 'bonus_reprocessing',
            confidence: 'media',
            evidence: ['classificação automática bonus_reprocessing acionada por divergência convites esperados vs concedidos'],
          }
        : {
            principal_cause: 'inconclusivo',
            confidence: 'baixa',
            evidence: ['sem evidência forte para uma causa única nesta execução'],
          };

  const functional_report_markdown = buildFunctionalMarkdown({
    eventId,
    eventTitle: eventRow.title,
    leaderIdFilter,
    rows,
    leadersScope,
    bonusRegistrationsEvent: bonusRegistrationsEventSorted,
    bonusEventSummary,
    diagnosticConclusion,
    agg: Array.from(agg),
  });

  return {
    schema_version: AUDIT_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    event_id: eventId,
    event_title: eventRow.title,
    organizer_id: eventRow.organizer_id,
    leader_id_filter: leaderIdFilter ?? null,
    functional_report_markdown,
    technical_log: {
      rows,
      leaders_scope: leadersScope,
      bonus_registrations_event: bonusRegistrationsEventSorted,
      bonus_event_summary: bonusEventSummary,
      diagnostic_conclusion: diagnosticConclusion,
      error_classification_aggregate: Array.from(agg),
      notes,
    },
  };
}

function buildFunctionalMarkdown(p: {
  eventId: string;
  eventTitle: string | null;
  leaderIdFilter?: string | null;
  rows: InvitationBonusAuditCommissionRow[];
  leadersScope: InvitationBonusAuditLeaderScope[];
  bonusRegistrationsEvent: EventBonusRegistrationAuditItem[];
  bonusEventSummary: InvitationBonusAuditResult['technical_log']['bonus_event_summary'];
  diagnosticConclusion: InvitationBonusAuditResult['technical_log']['diagnostic_conclusion'];
  agg: ErrorClassificationCode[];
}): string {
  const lines: string[] = [];
  lines.push(`# Relatório funcional — Bônus de convite (auditoria / simulador)`);
  lines.push('');
  lines.push(`- **Evento:** ${p.eventTitle || p.eventId} (\`${p.eventId}\`)`);
  if (p.leaderIdFilter) lines.push(`- **Filtro líder:** \`${p.leaderIdFilter}\``);
  else lines.push(`- **Filtro líder:** (todos os líderes no escopo do evento)`);
  lines.push(`- **Modo:** somente leitura — nenhuma alteração no banco.`);
  lines.push('');
  lines.push(`## Classificação agregada (indicativa)`);
  lines.push(p.agg.length ? p.agg.map((x) => `- \`${x}\``).join('\n') : '- (nenhum sinal automático)');
  lines.push('');
  lines.push(`## Convites reais: global vs neste evento por líder`);
  for (const ls of p.leadersScope) {
    lines.push(`### Líder \`${ls.leader_id}\``);
    lines.push(`- **Globais (todos os eventos) por status:** ${JSON.stringify(ls.convites_globais_por_status)}`);
    lines.push(
      `- **Convites disponíveis reais (globais: available+sent+used):** ${sumByKeys(ls.convites_globais_por_status, [
        'available',
        'sent',
        'used',
      ])}`
    );
    lines.push(`- **Neste evento por status:** ${JSON.stringify(ls.convites_neste_evento_por_status)}`);
    lines.push(
      `- **Convites disponíveis reais (neste evento: available+sent+used):** ${sumByKeys(ls.convites_neste_evento_por_status, [
        'available',
        'sent',
        'used',
      ])}`
    );
    lines.push('');
  }
  lines.push(`## Inscrições bônus/extras do evento (v1.3)`);
  lines.push(`- **Total mapeado no evento:** ${p.bonusRegistrationsEvent.length}`);
  lines.push(
    `- **Classificações:** valida | sem_convite_correspondente | duplicada | orfa | acima_do_esperado | criada_fora_da_regra_da_comissao`
  );
  lines.push('');
  lines.push(
    `| registration_id | leader_id | commission_id | event_id | created_at | status | payment_status | coupon_code | bonus_registration_id | leader_invitation_id | classificação |`
  );
  lines.push(`|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const b of p.bonusRegistrationsEvent) {
    lines.push(
      `| ${b.registration_id} | ${b.leader_id ?? '—'} | ${b.commission_id ?? '—'} | ${b.event_id} | ${b.created_at ?? '—'} | ${b.status ?? '—'} | ${b.payment_status ?? '—'} | ${b.coupon_code ?? '—'} | ${b.bonus_registration_id ?? '—'} | ${b.leader_invitation_id ?? '—'} | ${b.classification.join(', ')} |`
    );
  }
  lines.push('');
  lines.push(`### Consolidado do evento (convites x inscrições bônus)`);
  lines.push(`- **convites_esperados:** ${p.bonusEventSummary.convites_esperados}`);
  lines.push(`- **convites_existentes:** ${p.bonusEventSummary.convites_existentes}`);
  lines.push(`- **inscricoes_bonus_existentes:** ${p.bonusEventSummary.inscricoes_bonus_existentes}`);
  lines.push(`- **inscricoes_bonus_validas:** ${p.bonusEventSummary.inscricoes_bonus_validas}`);
  lines.push(`- **inscricoes_bonus_excedentes:** ${p.bonusEventSummary.inscricoes_bonus_excedentes}`);
  lines.push(
    `- **inscricoes_bonus_sem_lastro_em_leader_invitations:** ${p.bonusEventSummary.inscricoes_bonus_sem_lastro_em_leader_invitations}`
  );
  lines.push(
    `- **convites_sem_inscricao_bonus_correspondente:** ${p.bonusEventSummary.convites_sem_inscricao_bonus_correspondente}`
  );
  lines.push('');
  lines.push(`### Diagnóstico automático consolidado`);
  lines.push(`- **causa principal sugerida:** \`${p.diagnosticConclusion.principal_cause}\``);
  lines.push(`- **confiança:** ${p.diagnosticConclusion.confidence}`);
  for (const e of p.diagnosticConclusion.evidence) {
    lines.push(`- evidência: ${e}`);
  }
  lines.push('');
  lines.push(`## Por comissão (configuração, cálculo e convites reais)`);
  for (const r of p.rows) {
    lines.push(`### Líder \`${r.leader_id}\` · Comissão \`${r.commission_id}\``);

    // 1) Configuração do bônus identificada (obrigatória)
    lines.push('');
    lines.push(`#### Configuração do bônus identificada`);
    lines.push(`- **event_id:** \`${r.event_id}\``);
    lines.push(`- **leader_id:** \`${r.leader_id}\``);
    lines.push(`- **commission_id:** \`${r.commission_id}\``);
    lines.push(`- **bonus_type:** \`${r.bonus_type}\``);
    lines.push(`- **required_purchases:** ${r.required_purchases}`);
    lines.push(`- **commission_percentage:** ${r.commission_percentage ?? '—'}`);
    if (r.commission_name) lines.push(`- **commission name:** ${r.commission_name}`);
    lines.push(
      `- **Regra legível:** 1 convite a cada **${r.required_purchases}** vendas (expectedBonuses = floor(paidCount / required_purchases)).`
    );

    // 2) Cupom resolvido
    lines.push('');
    lines.push(`#### Cupom resolvido (e regra usada)`);
    lines.push(`- **cupom resolvido com sucesso:** ${r.coupon_resolved ? 'sim' : 'não'}`);
    lines.push(`- **coupon_id:** ${r.coupon_id ? `\`${r.coupon_id}\`` : '—'}`);
    lines.push(`- **coupon_code:** ${r.coupon_code ? `\`${r.coupon_code}\`` : '—'}`);
    lines.push(`- **coupon organizer_id:** ${r.coupon_organizer_id ? `\`${r.coupon_organizer_id}\`` : '—'}`);
    lines.push(`- **regra de resolução do cupom:** ${r.coupon_resolution_rule}`);

    // 3) Transparência do cálculo
    lines.push('');
    lines.push(`#### Transparência do cálculo (produção vs canônico)`);
    lines.push(`- **paidCount_atual (produção):** ${r.paidCount_production}`);
    lines.push(`- **paidCount_correto (canônico):** ${r.paidCount_canonical}`);
    lines.push(`- **expectedBonuses_atual (produção):** ${r.expectedBonuses_production}`);
    lines.push(`- **expectedBonuses_correto (canônico):** ${r.expectedBonuses_canonical}`);
    lines.push(`- **timesGranted_db (DB, available/sent/used):** ${r.times_granted_db}`);
    lines.push(
      `- **status (DB, por comissão):** available=${r.times_available_db} | sent=${r.times_sent_db} | used=${r.times_used_db} | expired=${r.times_expired_db}`
    );
    lines.push(`- **convites por status (esta comissão):** ${JSON.stringify(r.convites_por_status_comissao)}`);
    lines.push(`- **Δ paid (produção - canônico):** ${r.divergencia_paid_count}`);
    lines.push(`- **Δ expectedBonuses (produção - canônico):** ${r.divergencia_expected_bonuses}`);

    // Registro / ids list
    const onlyCanonFmt = formatIdList(r.registration_ids_only_canonical, 18);
    lines.push('');
    lines.push(
      `- **registration_ids_considerados_como_producao (com origem):** ${formatIdListWithOrigin(r.registration_ids_production, r.origem_por_registration_id, 18).text}`
    );
    lines.push(
      `- **registration_ids_considerados_correto (com origem se aplicável):** ${formatIdListWithOrigin(r.registration_ids_canonical, r.origem_por_registration_id, 18).text}`
    );
    lines.push(
      `- **registration_ids_excesso (só na produção, com origem):** ${formatIdListWithOrigin(r.registration_ids_only_production, r.origem_por_registration_id, 18).text}`
    );
    lines.push(`- **registration_ids_faltando na produção (só no canônico):** ${onlyCanonFmt.text}`);

    // 4) Convites reais vs inscrições vinculadas
    lines.push('');
    lines.push(`#### Convites reais e equivalência com registros (bonus_registration_id)`);
    lines.push(
      `- **inscrições bônus/free_bonus ligadas à comissão (bonus_registration_id em leader_invitations por status):** ${JSON.stringify(
        Object.fromEntries(
          Object.entries(r.bonus_registration_ids_por_status).map(([k, v]) => [k, v.length])
        )
      )}`
    );

    lines.push(
      `- **bonus_registration_id ativo (available+sent+used):** ${formatIdList(
        [
          ...(r.bonus_registration_ids_por_status['available'] ?? []),
          ...(r.bonus_registration_ids_por_status['sent'] ?? []),
          ...(r.bonus_registration_ids_por_status['used'] ?? []),
        ],
        18
      ).text}`
    );
    lines.push(
      `- **bonus_registration_id expirado (expired):** ${formatIdList(
        r.bonus_registration_ids_por_status['expired'] ?? [],
        18
      ).text}`
    );

    const missingFmt = formatIdList(r.registration_ids_canonical_expected_but_missing_invites, 18);
    lines.push(`- **canônico esperado mas sem convite disponível (available/sent/used):** ${missingFmt.text}`);

    const notExpectedFmt = formatIdList(r.bonus_registration_ids_in_db_not_in_canonical, 18);
    lines.push(`- **convites concedidos no DB mas sem equivalência no canônico esperado:** ${notExpectedFmt.text}`);

    // 5) Separação: "produção sem equivalência" (auxilia diagnóstico)
    const prodWithoutInvitesFmt = formatIdList(r.registration_ids_production_without_equivalent_in_invites, 18);
    lines.push(`- **produção (atual) sem equivalência em convites concedidos:** ${prodWithoutInvitesFmt.text}`);

    lines.push('');
    lines.push(`#### Comparativo obrigatório (convites x inscrições bônus)`);
    lines.push(`- **convites_esperados:** ${r.comparativo_bonus_extras.convites_esperados}`);
    lines.push(`- **convites_existentes:** ${r.comparativo_bonus_extras.convites_existentes}`);
    lines.push(`- **inscrições_bonus_existentes:** ${r.comparativo_bonus_extras.inscricoes_bonus_existentes}`);
    lines.push(`- **inscrições_bonus_válidas:** ${r.comparativo_bonus_extras.inscricoes_bonus_validas}`);
    lines.push(`- **inscrições_bonus_excedentes:** ${r.comparativo_bonus_extras.inscricoes_bonus_excedentes}`);
    lines.push(
      `- **inscrições_bonus_sem_lastro_em_leader_invitations:** ${r.comparativo_bonus_extras.inscricoes_bonus_sem_lastro_em_leader_invitations}`
    );
    lines.push(
      `- **convites_sem_inscrição_bonus_correspondente:** ${r.comparativo_bonus_extras.convites_sem_inscricao_bonus_correspondente}`
    );

    lines.push('');
    lines.push(`#### Arrays explícitos para futura correção (somente referência)`);
    lines.push(`- **registration_ids_bonus_validos:** ${formatIdList(r.registration_ids_bonus_validos, 18).text}`);
    lines.push(`- **registration_ids_bonus_excesso:** ${formatIdList(r.registration_ids_bonus_excesso, 18).text}`);
    lines.push(`- **registration_ids_bonus_orfaos:** ${formatIdList(r.registration_ids_bonus_orfaos, 18).text}`);
    lines.push(
      `- **registration_ids_bonus_sem_convite:** ${formatIdList(r.registration_ids_bonus_sem_convite, 18).text}`
    );
    lines.push(`- **leader_invitation_ids_validos:** ${formatIdList(r.leader_invitation_ids_validos, 18).text}`);
    lines.push(
      `- **leader_invitation_ids_sem_registration:** ${formatIdList(r.leader_invitation_ids_sem_registration, 18).text}`
    );
    lines.push(`- **leader_invitation_ids_excesso:** ${formatIdList(r.leader_invitation_ids_excesso, 18).text}`);

    lines.push('');
    lines.push(`#### Diagnóstico (hipóteses — para log técnico)`);
    lines.push(
      r.diagnostic_hypotheses.length ? r.diagnostic_hypotheses.map((x) => `- \`${x}\``).join('\n') : '- (sem hipótese automática)'
    );
  }
  lines.push('');
  lines.push(`## Plano sugerido para correção futura (somente leitura)`);
  lines.push(
    `- **inscrições bônus potencialmente removíveis/revogáveis:** ${p.bonusEventSummary.inscricoes_bonus_excedentes}`
  );
  lines.push(`- **convites válidos:** ${p.bonusEventSummary.leader_invitation_ids_validos.length}`);
  lines.push(
    `- **convites sem inscrição correspondente:** ${p.bonusEventSummary.convites_sem_inscricao_bonus_correspondente}`
  );
  lines.push(
    `- **inscrições bônus sem convite correspondente:** ${p.bonusEventSummary.registration_ids_bonus_sem_convite.length}`
  );
  lines.push(`- **observação:** esta seção não executa correção automática (Fase 1, somente leitura).`);
  return lines.join('\n');
}
