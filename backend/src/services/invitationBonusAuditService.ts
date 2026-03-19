/**
 * Fase 1 — Auditoria / simulador de bônus de convite (somente leitura).
 * Não executa INSERT/UPDATE/DELETE. Não chama checkAndGrantInvitationBonus.
 * Ref: docs/PLANO_AUDITORIA_CORRECAO_CONVITES_POS_MIGRACAO_ORGANIZADOR.md v1.2, FRONTE_0
 */

import { query } from '../config/database.js';
import { getRegistrationsByLeaderCoupons } from './leaderRegistrationsService.js';
import { getCouponByEventCommission } from './couponsService.js';

export const AUDIT_SCHEMA_VERSION = '1.0';

export type RegistrationOrigin = 'cupom' | 'referral' | 'ambos';

export type ErrorClassificationCode =
  | 'commission_coupon_matching'
  | 'wrongful_count_cupom_referral'
  | 'migration_organizer'
  | 'bonus_reprocessing'
  | 'ui_scope_event_vs_global_leader';

export interface InvitationBonusAuditCommissionRow {
  leader_id: string;
  commission_id: string;
  bonus_type: string;
  required_purchases: number;
  coupon_id: string | null;
  coupon_code: string | null;
  coupon_resolved: boolean;
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
    error_classification_aggregate: ErrorClassificationCode[];
    notes: string[];
  };
}

function requiredPurchasesSafe(v: unknown): number {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10);
  return n >= 1 ? n : 1;
}

/** Canônico: apenas inscrições pagas no evento com o cupom da comissão pertencente ao líder (sem OR referral). */
async function getCanonicalPaidRegistrationIds(
  leaderId: string,
  eventId: string,
  couponCode: string | null
): Promise<string[]> {
  if (!couponCode || !String(couponCode).trim()) {
    return [];
  }
  const result = await query(
    `SELECT DISTINCT r.id::text AS id
     FROM registrations r
     WHERE r.event_id = $1
       AND r.payment_status = 'paid'
       AND (r.status IS NULL OR r.status != 'cancelled')
       AND r.coupon_code IS NOT NULL
       AND UPPER(TRIM(r.coupon_code)) = UPPER(TRIM($3))
       AND EXISTS (
         SELECT 1 FROM coupons cp
         WHERE UPPER(TRIM(cp.code)) = UPPER(TRIM(r.coupon_code))
           AND cp.leader_id = $2
       )`,
    [eventId, leaderId, couponCode.trim()]
  );
  return (result.rows as { id: string }[]).map((r) => r.id);
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
  const notes: string[] = [
    'Cálculo PRODUÇÃO: espelha getCouponByEventCommission + getRegistrationsByLeaderCoupons (com ou sem coupon_code), como em checkAndGrantInvitationBonus.',
    'Cálculo CANÔNICO: apenas inscrições pagas, não canceladas, no evento, com coupon_code igual ao cupom da comissão e cupom do líder (sem contar só-referral).',
    'times_granted_db: COUNT leader_invitations com status IN (available, sent, used) por comissão.',
  ];

  for (const leaderId of leaderIds) {
    const globalCounts = await countInvitationsByStatus(leaderId, null);
    const eventCounts = await countInvitationsByStatus(leaderId, eventId);
    leadersScope.push({
      leader_id: leaderId,
      convites_globais_por_status: globalCounts,
      convites_neste_evento_por_status: eventCounts,
    });

    const commissions = await query(
      `SELECT id::text AS id, bonus_type::text AS bonus_type, required_purchases, leader_id::text AS leader_id
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
      leader_id: string;
    }[]) {
      const req = requiredPurchasesSafe(comm.required_purchases);
      let coupon: { id: string; code: string } | null = null;
      try {
        const c = await getCouponByEventCommission(leaderId, eventId, comm.id);
        if (c?.id && c?.code) {
          coupon = { id: c.id, code: c.code };
        }
      } catch {
        coupon = null;
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

      const grantedResult = await query(
        `SELECT COUNT(*)::text AS cnt FROM leader_invitations
         WHERE leader_id = $1 AND event_id = $2 AND commission_id = $3
           AND status IN ('available', 'sent', 'used')`,
        [leaderId, eventId, comm.id]
      );
      const times_granted_db = parseInt((grantedResult.rows[0] as { cnt: string })?.cnt || '0', 10) || 0;

      const convites_no_evento_por_status = await countInvitationsByStatus(leaderId, eventId);

      const baseRow: InvitationBonusAuditCommissionRow = {
        leader_id: leaderId,
        commission_id: comm.id,
        bonus_type: comm.bonus_type,
        required_purchases: req,
        coupon_id: coupon?.id ?? null,
        coupon_code: coupon?.code ?? null,
        coupon_resolved: !!coupon,
        registration_ids_production,
        registration_ids_canonical,
        registration_ids_only_production: onlyProd,
        registration_ids_only_canonical: onlyCanon,
        origem_por_registration_id,
        paidCount_production,
        paidCount_canonical,
        expectedBonuses_production,
        expectedBonuses_canonical,
        times_granted_db,
        convites_no_evento_por_status,
        divergencia_paid_count: paidCount_production - paidCount_canonical,
        divergencia_expected_bonuses: expectedBonuses_production - expectedBonuses_canonical,
        error_classification_row: [],
      };
      baseRow.error_classification_row = classifyRow(baseRow);
      rows.push(baseRow);
    }
  }

  const agg = new Set<ErrorClassificationCode>();
  for (const r of rows) {
    for (const c of r.error_classification_row) agg.add(c);
  }
  if (leadersScope.some((l) => Object.values(l.convites_globais_por_status).reduce((a, b) => a + b, 0) > 0)) {
    agg.add('ui_scope_event_vs_global_leader');
  }

  const functional_report_markdown = buildFunctionalMarkdown({
    eventId,
    eventTitle: eventRow.title,
    leaderIdFilter,
    rows,
    leadersScope,
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
  lines.push(`## Convites: evento vs global por líder`);
  for (const ls of p.leadersScope) {
    lines.push(`### Líder \`${ls.leader_id}\``);
    lines.push(`- **Globais (todos os eventos):** ${JSON.stringify(ls.convites_globais_por_status)}`);
    const noEvento = p.rows.filter((r) => r.leader_id === ls.leader_id);
    const ev = p.leadersScope.find((x) => x.leader_id === ls.leader_id);
    lines.push(`- **Neste evento (total real por status):** ${JSON.stringify(ev?.convites_neste_evento_por_status || {})}`);
    if (noEvento.length === 0) {
      lines.push(`- **Comissões invitation/both neste evento:** nenhuma linha analisada`);
    }
    lines.push('');
  }
  lines.push(`## Por comissão (produção vs canônico)`);
  lines.push(`| Líder | Comissão | Cupom resolvido | paid ∏ | paid ✓ | exp ∏ | exp ✓ | concedidos (DB) | Δ paid |`);
  lines.push(`|-------|----------|-----------------|--------|--------|-------|-------|-----------------|--------|`);
  for (const r of p.rows) {
    lines.push(
      `| ${r.leader_id.slice(0, 8)}… | ${r.commission_id.slice(0, 8)}… | ${r.coupon_resolved ? 'sim' : 'não'} | ${r.paidCount_production} | ${r.paidCount_canonical} | ${r.expectedBonuses_production} | ${r.expectedBonuses_canonical} | ${r.times_granted_db} | ${r.divergencia_paid_count} |`
    );
  }
  lines.push('');
  lines.push(`## Divergências detalhadas (registration_ids)`);
  for (const r of p.rows) {
    if (
      r.registration_ids_only_production.length === 0 &&
      r.registration_ids_only_canonical.length === 0
    ) {
      continue;
    }
    lines.push(`### Comissão \`${r.commission_id}\` — líder \`${r.leader_id}\``);
    if (r.registration_ids_only_production.length) {
      lines.push(`- **Só na produção (excesso):** ${r.registration_ids_only_production.join(', ')}`);
      for (const id of r.registration_ids_only_production) {
        lines.push(`  - \`${id}\` → origem: **${r.origem_por_registration_id[id] || '?'}**`);
      }
    }
    if (r.registration_ids_only_canonical.length) {
      lines.push(`- **Só no canônico (faltando na produção):** ${r.registration_ids_only_canonical.join(', ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
