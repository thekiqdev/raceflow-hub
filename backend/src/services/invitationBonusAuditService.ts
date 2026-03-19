/**
 * Fase 1 — Auditoria / simulador de bônus de convite (somente leitura).
 * Não executa INSERT/UPDATE/DELETE. Não chama checkAndGrantInvitationBonus.
 * Ref: docs/PLANO_AUDITORIA_CORRECAO_CONVITES_POS_MIGRACAO_ORGANIZADOR.md v1.2, FRONTE_0
 */

import { query } from '../config/database.js';
import { getRegistrationsByLeaderCoupons } from './leaderRegistrationsService.js';
import { getCouponByEventCommission } from './couponsService.js';

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
    lines.push(`#### Diagnóstico (hipóteses — para log técnico)`);
    lines.push(
      r.diagnostic_hypotheses.length ? r.diagnostic_hypotheses.map((x) => `- \`${x}\``).join('\n') : '- (sem hipótese automática)'
    );
  }
  return lines.join('\n');
}
