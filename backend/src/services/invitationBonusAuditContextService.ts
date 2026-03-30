/**
 * Contexto operacional para a UI da auditoria de bônus de convite (somente leitura).
 * Não altera a lógica de runInvitationBonusAudit — apenas agrega dados para seleção e resumo.
 */

import { query } from '../config/database.js';

export type AuditContextLinkType = 'cupom' | 'comissão' | 'convite';

export interface InvitationBonusAuditContextEvent {
  id: string;
  title: string | null;
  event_date: string | null;
  status: string | null;
  registration_status: string | null;
  organizer_id: string | null;
  organizer_name: string | null;
}

export interface InvitationBonusAuditContextSummary {
  total_leaders_impacted: number;
  leaders_with_coupon: number;
  leaders_with_commission: number;
  leaders_with_invitations: number;
  /** Quantos líderes serão efetivamente percorridos pela auditoria Fase 1 */
  leaders_in_audit_scope: number;
  total_coupons_for_event: number;
  total_invitation_records_for_event: number;
}

export interface InvitationBonusAuditContextLeader {
  leader_id: string;
  leader_name: string | null;
  referral_code: string | null;
  link_types: AuditContextLinkType[];
  coupon_count: number;
  commission_count: number;
  invitation_count: number;
  /** Tipos de bônus nas comissões deste evento (ex.: commission, invitation, both) */
  commission_bonus_types: string[];
  /**
   * Mesmo critério de runInvitationBonusAudit: líder entra se tem comissão no evento com bonus_type
   * invitation/both OU tem linhas em leader_invitations para o evento.
   */
  included_in_audit_scope: boolean;
  notes: string[];
}

export interface InvitationBonusAuditContextResult {
  event: InvitationBonusAuditContextEvent;
  summary: InvitationBonusAuditContextSummary;
  leaders: InvitationBonusAuditContextLeader[];
}

function uniqueLinkTypes(row: {
  coupon_count: number;
  commission_count: number;
  invitation_count: number;
}): AuditContextLinkType[] {
  const t: AuditContextLinkType[] = [];
  if (row.coupon_count > 0) t.push('cupom');
  if (row.commission_count > 0) t.push('comissão');
  if (row.invitation_count > 0) t.push('convite');
  return t;
}

function isIncludedInAuditScope(commission_bonus_types: string[], invitation_count: number): boolean {
  const set = new Set(commission_bonus_types.map((x) => String(x).toLowerCase()));
  if (set.has('invitation') || set.has('both')) return true;
  if (invitation_count > 0) return true;
  return false;
}

function buildNotes(
  commission_bonus_types: string[],
  commission_count: number,
  invitation_count: number,
  included_in_audit_scope: boolean,
  coupon_count: number
): string[] {
  const notes: string[] = [];
  const set = new Set(commission_bonus_types.map((x) => String(x).toLowerCase()));
  if (commission_count > 0) {
    if (set.has('invitation') || set.has('both')) {
      notes.push('Possui comissão de evento com regra de bônus por convite (convites gratuitos).');
    } else if (set.has('commission')) {
      notes.push('Comissão apenas percentual (sem bônus por convite na configuração).');
    }
  }
  if (commission_count === 0 && invitation_count > 0) {
    notes.push('Há convites no evento sem linha atual em leader_event_commissions (vale conferir histórico/migração).');
  }
  if (commission_count > 0 && invitation_count === 0 && (set.has('invitation') || set.has('both'))) {
    notes.push('Regra de convite configurada, mas ainda sem registros em leader_invitations para este evento.');
  }
  if (!included_in_audit_scope && (coupon_count > 0 || commission_count > 0)) {
    notes.push(
      'Fora do escopo da auditoria Fase 1: a análise percorre só líderes com comissão convite/both ou com convites registrados neste evento.'
    );
  }
  return notes;
}

/**
 * Agrega líderes com cupom vinculado ao evento, comissão no evento ou convites no evento.
 */
export async function getInvitationBonusAuditContext(eventId: string): Promise<InvitationBonusAuditContextResult> {
  const evRes = await query(
    `SELECT
       e.id::text AS id,
       e.title,
       e.event_date::text AS event_date,
       e.status::text AS status,
       e.registration_status::text AS registration_status,
       e.organizer_id::text AS organizer_id,
       p.full_name AS organizer_name
     FROM events e
     LEFT JOIN profiles p ON p.id = e.organizer_id
     WHERE e.id = $1`,
    [eventId]
  );
  if (evRes.rows.length === 0) {
    throw new Error('Evento não encontrado');
  }
  const event = evRes.rows[0] as InvitationBonusAuditContextEvent;

  const couponsRes = await query(
    `SELECT c.leader_id::text AS leader_id, COUNT(DISTINCT c.id)::int AS cnt
     FROM coupons c
     LEFT JOIN coupon_events ce ON ce.coupon_id = c.id
     WHERE c.leader_id IS NOT NULL
       AND (ce.event_id = $1 OR c.event_id = $1)
     GROUP BY c.leader_id`,
    [eventId]
  );
  const couponByLeader = new Map<string, number>();
  for (const r of couponsRes.rows as { leader_id: string; cnt: number }[]) {
    couponByLeader.set(r.leader_id, r.cnt);
  }

  const totalCouponsRes = await query(
    `SELECT COUNT(DISTINCT c.id)::int AS cnt
     FROM coupons c
     LEFT JOIN coupon_events ce ON ce.coupon_id = c.id
     WHERE c.leader_id IS NOT NULL
       AND (ce.event_id = $1 OR c.event_id = $1)`,
    [eventId]
  );
  const total_coupons_for_event = (totalCouponsRes.rows[0] as { cnt: number })?.cnt ?? 0;

  const lecRes = await query(
    `SELECT
       lec.leader_id::text AS leader_id,
       COUNT(*)::int AS commission_count,
       ARRAY_AGG(DISTINCT COALESCE(lec.bonus_type::text, 'commission')) AS bonus_types
     FROM leader_event_commissions lec
     WHERE lec.event_id = $1
     GROUP BY lec.leader_id`,
    [eventId]
  );
  const commissionByLeader = new Map<string, { count: number; bonus_types: string[] }>();
  for (const r of lecRes.rows as { leader_id: string; commission_count: number; bonus_types: string[] }[]) {
    commissionByLeader.set(r.leader_id, {
      count: r.commission_count,
      bonus_types: r.bonus_types || [],
    });
  }

  const invRes = await query(
    `SELECT leader_id::text AS leader_id, COUNT(*)::int AS cnt
     FROM leader_invitations
     WHERE event_id = $1
     GROUP BY leader_id`,
    [eventId]
  );
  const invitesByLeader = new Map<string, number>();
  for (const r of invRes.rows as { leader_id: string; cnt: number }[]) {
    invitesByLeader.set(r.leader_id, r.cnt);
  }

  const totalInvRes = await query(
    `SELECT COUNT(*)::int AS cnt FROM leader_invitations WHERE event_id = $1`,
    [eventId]
  );
  const total_invitation_records_for_event = (totalInvRes.rows[0] as { cnt: number })?.cnt ?? 0;

  const leaderIdSet = new Set<string>();
  for (const id of couponByLeader.keys()) leaderIdSet.add(id);
  for (const id of commissionByLeader.keys()) leaderIdSet.add(id);
  for (const id of invitesByLeader.keys()) leaderIdSet.add(id);

  const leaderIds = Array.from(leaderIdSet);
  if (leaderIds.length === 0) {
    return {
      event,
      summary: {
        total_leaders_impacted: 0,
        leaders_with_coupon: 0,
        leaders_with_commission: 0,
        leaders_with_invitations: 0,
        leaders_in_audit_scope: 0,
        total_coupons_for_event,
        total_invitation_records_for_event,
      },
      leaders: [],
    };
  }

  const glRes = await query(
    `SELECT gl.id::text AS id, gl.referral_code, p.full_name AS leader_name
     FROM group_leaders gl
     LEFT JOIN profiles p ON p.id = gl.user_id
     WHERE gl.id = ANY($1::uuid[])`,
    [leaderIds]
  );
  const metaByLeader = new Map<string, { leader_name: string | null; referral_code: string | null }>();
  for (const r of glRes.rows as { id: string; referral_code: string | null; leader_name: string | null }[]) {
    metaByLeader.set(r.id, { leader_name: r.leader_name, referral_code: r.referral_code });
  }

  let leaders_with_coupon = 0;
  let leaders_with_commission = 0;
  let leaders_with_invitations = 0;
  let leaders_in_audit_scope = 0;

  const leaders: InvitationBonusAuditContextLeader[] = leaderIds.map((leader_id) => {
    const coupon_count = couponByLeader.get(leader_id) ?? 0;
    const com = commissionByLeader.get(leader_id);
    const commission_count = com?.count ?? 0;
    const commission_bonus_types = com?.bonus_types ?? [];
    const invitation_count = invitesByLeader.get(leader_id) ?? 0;
    const included_in_audit_scope = isIncludedInAuditScope(commission_bonus_types, invitation_count);

    if (coupon_count > 0) leaders_with_coupon++;
    if (commission_count > 0) leaders_with_commission++;
    if (invitation_count > 0) leaders_with_invitations++;
    if (included_in_audit_scope) leaders_in_audit_scope++;

    const meta = metaByLeader.get(leader_id);
    const notes = buildNotes(
      commission_bonus_types,
      commission_count,
      invitation_count,
      included_in_audit_scope,
      coupon_count
    );

    return {
      leader_id,
      leader_name: meta?.leader_name ?? null,
      referral_code: meta?.referral_code ?? null,
      link_types: uniqueLinkTypes({ coupon_count, commission_count, invitation_count }),
      coupon_count,
      commission_count,
      invitation_count,
      commission_bonus_types,
      included_in_audit_scope,
      notes,
    };
  });

  leaders.sort((a, b) => {
    const na = (a.leader_name || a.referral_code || a.leader_id).toLowerCase();
    const nb = (b.leader_name || b.referral_code || b.leader_id).toLowerCase();
    return na.localeCompare(nb, 'pt-BR');
  });

  return {
    event,
    summary: {
      total_leaders_impacted: leaders.length,
      leaders_with_coupon,
      leaders_with_commission,
      leaders_with_invitations,
      leaders_in_audit_scope,
      total_coupons_for_event,
      total_invitation_records_for_event,
    },
    leaders,
  };
}
