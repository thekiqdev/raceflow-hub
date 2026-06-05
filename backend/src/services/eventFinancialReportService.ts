import { createHash } from 'crypto';
import { query } from '../config/database.js';
import { getEventById } from './eventsService.js';
import { getEventInvitationStats } from './eventInvitationStatsService.js';
import { getEventProductStockReport } from './eventProductStockReportService.js';
import {
  getLiquidRegistrationValue,
  getPlatformFeeTotal,
  getReportableRevenue,
  isLegacyWithoutFeeFields,
  isTransferredOutShellRegistration,
  type FinancialRegistrationLike,
  type LegacyFallbackConfig,
} from './financialReportingService.js';
import { getSystemSettings } from './systemSettingsService.js';
import { hasRole } from './userRolesService.js';

export const EVENT_FINANCIAL_REPORT_VERSION = '1.0.0';
export const EVENT_FINANCIAL_REPORT_RULES_VERSION = 'financialReportingService@canonical';

export type FinancialReportAudience = 'organizer' | 'admin';
export type FinancialReportExportFormat = 'json' | 'pdf' | 'excel' | 'csv';

export interface AuthUser {
  id: string;
  email: string;
}

export interface EventFinancialReportMeta {
  event_id: string;
  generated_at: string;
  report_version: string;
  rules_version: string;
  audience: FinancialReportAudience;
  integrity_hash: string;
  export_formats: FinancialReportExportFormat[];
}

export interface EventFinancialReportSnapshot {
  registrations_total: number;
  paid_total: number;
  pending_total: number;
  refunded_total: number;
  invited_total: number;
  transferred_total: number;
}

export interface EventFinancialReportCover {
  event_title: string;
  event_date: string;
  city: string;
  state: string;
  status: string;
  organizer_name: string;
  organizer_organization_name?: string | null;
}

export interface EventFinancialReportExecutiveSummary {
  total_registrations: number;
  paid_registrations: number;
  invitation_registrations: number;
  courtesy_registrations: number;
  transferred_registrations: number;
  net_revenue: number;
  avg_ticket: number;
}

export interface PaymentMethodBreakdownRow {
  method: string;
  count: number;
  net_amount: number;
  share_pct: number;
}

export interface RegistrationStatusBreakdown {
  paid: number;
  pending: number;
  cancelled: number;
  refunded: number;
  convidado: number;
  transferred: number;
}

export interface DimensionRevenueRow {
  id: string;
  name: string;
  registrations: number;
  net_revenue: number;
  share_pct: number;
}

export interface EventFinancialReportStockSummary {
  products_count: number;
  variations_count: number;
  exhausted_count: number;
  critical_count: number;
  low_stock_count: number;
}

export interface EventFinancialReportInvitations {
  granted: number;
  available: number;
  sent: number;
  used: number;
  expired: number;
}

export interface OrganizerFinancialBlock {
  net_revenue: number;
  avg_ticket: number;
  payment_methods: PaymentMethodBreakdownRow[];
}

export interface AdminFinancialBlock extends OrganizerFinancialBlock {
  gross_revenue: number;
  platform_fee_total: number;
  edit_fee_total: number;
  platform_revenue: number;
  gross_net_delta: number;
}

export type FinancialConsistencyStatus = 'OK' | 'WARNING' | 'ERROR';

export interface EventFinancialReportAuditFinancialConsistency {
  status: FinancialConsistencyStatus;
  expected_net_revenue: number;
  payment_methods_total: number;
  categories_total: number;
  modalities_total: number;
  kits_total: number;
  difference_payment_methods: number;
  difference_categories: number;
  difference_modalities: number;
  difference_kits: number;
}

export interface EventFinancialReportAudit {
  financial_consistency: EventFinancialReportAuditFinancialConsistency;
}

export interface EventFinancialReportData {
  meta: EventFinancialReportMeta;
  cover: EventFinancialReportCover;
  financial_snapshot: EventFinancialReportSnapshot;
  executive_summary: EventFinancialReportExecutiveSummary;
  registration_status: RegistrationStatusBreakdown;
  payment_methods: PaymentMethodBreakdownRow[];
  categories: DimensionRevenueRow[];
  modalities: DimensionRevenueRow[];
  kits: DimensionRevenueRow[];
  stock: EventFinancialReportStockSummary;
  invitations: EventFinancialReportInvitations;
  financial: OrganizerFinancialBlock | AdminFinancialBlock;
  audit: EventFinancialReportAudit;
}

interface RegistrationReportRow extends FinancialRegistrationLike {
  id: string;
  category_id: string;
  category_name: string | null;
  kit_id: string | null;
  kit_name: string | null;
  modality_id: string | null;
  modality_name: string | null;
  from_invitation: boolean;
}

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

const roundPct = (value: number): number => Math.round(value * 100) / 100;

async function loadLegacyFallback(): Promise<LegacyFallbackConfig> {
  const settings = await getSystemSettings();
  return {
    platformFee: settings.platform_fee || 0,
    platformFeeType: (settings.platform_fee_type || 'fixed') as 'fixed' | 'percentage',
    platformFeeMin: settings.platform_fee_min ?? 0,
  };
}

function isPaidForReportableRevenue(reg: RegistrationReportRow): boolean {
  return reg.payment_status === 'paid' && !isTransferredOutShellRegistration(reg);
}

function normalizePaymentMethod(method: string | null | undefined): string {
  if (method === 'pix' || method === 'credit_card' || method === 'boleto') {
    return method;
  }
  return 'other';
}

function buildSharePct(part: number, total: number): number {
  if (total <= 0) return 0;
  return roundPct((part / total) * 100);
}

function aggregateDimensionRows(
  map: Map<string, { id: string; name: string; registrations: number; net_revenue: number }>,
  netRevenueTotal: number
): DimensionRevenueRow[] {
  return Array.from(map.values())
    .map((row) => ({
      id: row.id,
      name: row.name,
      registrations: row.registrations,
      net_revenue: roundMoney(row.net_revenue),
      share_pct: buildSharePct(row.net_revenue, netRevenueTotal),
    }))
    .sort((a, b) => b.net_revenue - a.net_revenue || a.name.localeCompare(b.name));
}

function sumDimensionNetRevenue(rows: { net_revenue: number }[]): number {
  return roundMoney(rows.reduce((acc, row) => acc + row.net_revenue, 0));
}

function consistencyStatusForDifference(absDifference: number): FinancialConsistencyStatus {
  if (absDifference <= 0.01) return 'OK';
  if (absDifference <= 1.0) return 'WARNING';
  return 'ERROR';
}

function worstConsistencyStatus(...statuses: FinancialConsistencyStatus[]): FinancialConsistencyStatus {
  if (statuses.includes('ERROR')) return 'ERROR';
  if (statuses.includes('WARNING')) return 'WARNING';
  return 'OK';
}

/**
 * Audita consistência do DTO já montado — não recalcula receita canônica.
 */
export function buildFinancialConsistencyAudit(input: {
  financial: OrganizerFinancialBlock | AdminFinancialBlock;
  payment_methods: PaymentMethodBreakdownRow[];
  categories: DimensionRevenueRow[];
  modalities: DimensionRevenueRow[];
  kits: DimensionRevenueRow[];
}): EventFinancialReportAuditFinancialConsistency {
  const expected_net_revenue = roundMoney(input.financial.net_revenue);
  const payment_methods_total = roundMoney(
    input.payment_methods.reduce((acc, row) => acc + row.net_amount, 0)
  );
  const categories_total = sumDimensionNetRevenue(input.categories);
  const modalities_total = sumDimensionNetRevenue(input.modalities);
  const kits_total = sumDimensionNetRevenue(input.kits);

  const difference_payment_methods = roundMoney(Math.abs(expected_net_revenue - payment_methods_total));
  const difference_categories = roundMoney(Math.abs(expected_net_revenue - categories_total));
  const difference_modalities = roundMoney(Math.abs(expected_net_revenue - modalities_total));
  const difference_kits = roundMoney(Math.abs(expected_net_revenue - kits_total));

  const status = worstConsistencyStatus(
    consistencyStatusForDifference(difference_payment_methods),
    consistencyStatusForDifference(difference_categories),
    consistencyStatusForDifference(difference_modalities),
    consistencyStatusForDifference(difference_kits)
  );

  return {
    status,
    expected_net_revenue,
    payment_methods_total,
    categories_total,
    modalities_total,
    kits_total,
    difference_payment_methods,
    difference_categories,
    difference_modalities,
    difference_kits,
  };
}

function buildStockSummary(
  stockReport: Awaited<ReturnType<typeof getEventProductStockReport>>
): EventFinancialReportStockSummary {
  const variations = stockReport.variations;
  let critical_count = 0;
  let low_stock_count = 0;

  for (const item of variations) {
    if (item.stock_available === null) continue;
    if (item.stock_available <= 5) {
      critical_count++;
    } else if (item.stock_available <= 10) {
      low_stock_count++;
    }
  }

  return {
    products_count: stockReport.summary.products_count,
    variations_count: variations.length,
    exhausted_count: stockReport.summary.exhausted_variations_count,
    critical_count,
    low_stock_count,
  };
}

type EventFinancialReportHashPayload = Omit<EventFinancialReportData, 'meta' | 'audit'> & {
  meta: Omit<EventFinancialReportMeta, 'integrity_hash'>;
};

function computeIntegrityHash(payload: EventFinancialReportHashPayload): string {
  const canonical = JSON.stringify(payload);
  return createHash('sha256').update(canonical).digest('hex');
}

async function loadRegistrationRows(eventId: string): Promise<RegistrationReportRow[]> {
  const result = await query(
    `SELECT
       r.id,
       r.status,
       r.payment_status,
       r.payment_method,
       r.total_amount,
       r.platform_fee_amount,
       r.registration_edit_fee_amount,
       r.transferred_to_registration_id,
       r.category_id,
       c.name AS category_name,
       r.kit_id,
       ek.name AS kit_name,
       r.modality_id,
       m.name AS modality_name,
       EXISTS (
         SELECT 1 FROM leader_invitations li
         WHERE li.bonus_registration_id = r.id
       ) AS from_invitation
     FROM registrations r
     LEFT JOIN categories c ON c.id = r.category_id
     LEFT JOIN event_kits ek ON ek.id = r.kit_id
     LEFT JOIN modalities m ON m.id = r.modality_id
     WHERE r.event_id = $1`,
    [eventId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    status: row.status,
    payment_status: row.payment_status,
    payment_method: row.payment_method,
    total_amount: row.total_amount,
    platform_fee_amount: row.platform_fee_amount,
    registration_edit_fee_amount: row.registration_edit_fee_amount,
    transferred_to_registration_id: row.transferred_to_registration_id,
    category_id: row.category_id,
    category_name: row.category_name ?? null,
    kit_id: row.kit_id ?? null,
    kit_name: row.kit_name ?? null,
    modality_id: row.modality_id ?? null,
    modality_name: row.modality_name ?? null,
    from_invitation: Boolean(row.from_invitation),
  }));
}

function buildPaymentMethodBreakdown(
  rows: RegistrationReportRow[],
  fallback: LegacyFallbackConfig,
  netRevenue: number
): PaymentMethodBreakdownRow[] {
  const map = new Map<string, { count: number; net_amount: number }>();

  for (const reg of rows) {
    if (!isPaidForReportableRevenue(reg)) continue;
    const liquid = getLiquidRegistrationValue(reg, fallback);
    if (liquid <= 0) continue;

    const method = normalizePaymentMethod(reg.payment_method);
    const entry = map.get(method) ?? { count: 0, net_amount: 0 };
    entry.count += 1;
    entry.net_amount += liquid;
    map.set(method, entry);
  }

  const order = ['pix', 'credit_card', 'boleto', 'other'];
  return order
    .filter((method) => map.has(method))
    .map((method) => {
      const entry = map.get(method)!;
      return {
        method,
        count: entry.count,
        net_amount: roundMoney(entry.net_amount),
        share_pct: buildSharePct(entry.net_amount, netRevenue),
      };
    });
}

function buildAdminFinancialBlock(
  paidRows: RegistrationReportRow[],
  fallback: LegacyFallbackConfig,
  netRevenue: number,
  avgTicket: number,
  paymentMethods: PaymentMethodBreakdownRow[]
): AdminFinancialBlock {
  let gross_revenue = 0;
  let platform_fee_total = 0;
  let edit_fee_total = 0;
  let platform_revenue = 0;

  for (const reg of paidRows) {
    const total = Number(reg.total_amount) || 0;
    gross_revenue += total;

    if (isLegacyWithoutFeeFields(reg)) {
      const liquid = getLiquidRegistrationValue(reg, fallback);
      const inferred = Math.max(0, roundMoney(total - liquid));
      platform_fee_total += inferred;
      platform_revenue += inferred;
    } else {
      platform_fee_total += Number(reg.platform_fee_amount) || 0;
      edit_fee_total += Number(reg.registration_edit_fee_amount) || 0;
      platform_revenue += getPlatformFeeTotal(reg);
    }
  }

  gross_revenue = roundMoney(gross_revenue);
  platform_fee_total = roundMoney(platform_fee_total);
  edit_fee_total = roundMoney(edit_fee_total);
  platform_revenue = roundMoney(platform_revenue);

  return {
    net_revenue: netRevenue,
    avg_ticket: avgTicket,
    payment_methods: paymentMethods,
    gross_revenue,
    platform_fee_total,
    edit_fee_total,
    platform_revenue,
    gross_net_delta: roundMoney(gross_revenue - netRevenue),
  };
}

export interface BuildEventFinancialReportOptions {
  /** Força a variante do relatório (ex.: admin baixando PDF na rota do organizador). */
  audienceOverride?: FinancialReportAudience;
}

/**
 * Monta o relatório financeiro canônico do evento (JSON).
 * A variante admin vs organizador é derivada do role do usuário — nunca de query params.
 */
export async function buildEventFinancialReport(
  eventId: string,
  currentUser: AuthUser,
  options?: BuildEventFinancialReportOptions
): Promise<EventFinancialReportData> {
  const event = await getEventById(eventId);
  if (!event) {
    throw new Error('Evento não encontrado');
  }

  const isAdmin = await hasRole(currentUser.id, 'admin');
  const audience: FinancialReportAudience =
    options?.audienceOverride ?? (isAdmin ? 'admin' : 'organizer');
  if (audience === 'admin' && !isAdmin) {
    throw new Error('Sem permissão para relatório financeiro administrativo');
  }
  const generatedAt = new Date().toISOString();

  const [fallback, registrationRows, invitationStats, stockReport] = await Promise.all([
    loadLegacyFallback(),
    loadRegistrationRows(eventId),
    getEventInvitationStats(eventId),
    getEventProductStockReport(eventId),
  ]);

  const paidRows = registrationRows.filter(isPaidForReportableRevenue);
  const netRevenue = getReportableRevenue(paidRows, fallback);
  const paidRevenueCount = paidRows.filter(
    (reg) => getLiquidRegistrationValue(reg, fallback) > 0
  ).length;
  const avgTicket = paidRevenueCount > 0 ? roundMoney(netRevenue / paidRevenueCount) : 0;

  let paid_total = 0;
  let pending_total = 0;
  let refunded_total = 0;
  let invited_total = 0;
  let transferred_total = 0;
  let cancelled_total = 0;
  let invitation_registrations = 0;
  let courtesy_registrations = 0;

  const categoryMap = new Map<string, { id: string; name: string; registrations: number; net_revenue: number }>();
  const modalityMap = new Map<string, { id: string; name: string; registrations: number; net_revenue: number }>();
  const kitMap = new Map<string, { id: string; name: string; registrations: number; net_revenue: number }>();

  for (const reg of registrationRows) {
    if (reg.payment_status === 'paid') paid_total++;
    if (reg.payment_status === 'pending') pending_total++;
    if (reg.payment_status === 'refunded') refunded_total++;
    if (reg.payment_status === 'convidado') invited_total++;
    if (reg.status === 'transferred') transferred_total++;
    if (reg.status === 'cancelled') cancelled_total++;

    if (reg.from_invitation) invitation_registrations++;
    if (reg.payment_method === 'free_bonus' && !reg.from_invitation) {
      courtesy_registrations++;
    }

    if (!isPaidForReportableRevenue(reg)) continue;

    const liquid = getLiquidRegistrationValue(reg, fallback);
    if (liquid <= 0) continue;

    const categoryId = reg.category_id || 'unknown';
    const categoryName = reg.category_name || 'Sem categoria';
    const categoryEntry = categoryMap.get(categoryId) ?? {
      id: categoryId,
      name: categoryName,
      registrations: 0,
      net_revenue: 0,
    };
    categoryEntry.registrations += 1;
    categoryEntry.net_revenue += liquid;
    categoryMap.set(categoryId, categoryEntry);

    if (reg.modality_id) {
      const modalityEntry = modalityMap.get(reg.modality_id) ?? {
        id: reg.modality_id,
        name: reg.modality_name || 'Modalidade',
        registrations: 0,
        net_revenue: 0,
      };
      modalityEntry.registrations += 1;
      modalityEntry.net_revenue += liquid;
      modalityMap.set(reg.modality_id, modalityEntry);
    }

    if (reg.kit_id) {
      const kitEntry = kitMap.get(reg.kit_id) ?? {
        id: reg.kit_id,
        name: reg.kit_name || 'Kit',
        registrations: 0,
        net_revenue: 0,
      };
      kitEntry.registrations += 1;
      kitEntry.net_revenue += liquid;
      kitMap.set(reg.kit_id, kitEntry);
    }
  }

  const paymentMethods = buildPaymentMethodBreakdown(registrationRows, fallback, netRevenue);

  const financial_snapshot: EventFinancialReportSnapshot = {
    registrations_total: registrationRows.length,
    paid_total,
    pending_total,
    refunded_total,
    invited_total,
    transferred_total,
  };

  const registration_status: RegistrationStatusBreakdown = {
    paid: paid_total,
    pending: pending_total,
    cancelled: cancelled_total,
    refunded: refunded_total,
    convidado: invited_total,
    transferred: transferred_total,
  };

  const executive_summary: EventFinancialReportExecutiveSummary = {
    total_registrations: registrationRows.length,
    paid_registrations: paid_total,
    invitation_registrations,
    courtesy_registrations,
    transferred_registrations: transferred_total,
    net_revenue: netRevenue,
    avg_ticket: avgTicket,
  };

  const organizerFinancial: OrganizerFinancialBlock = {
    net_revenue: netRevenue,
    avg_ticket: avgTicket,
    payment_methods: paymentMethods,
  };

  const financial: OrganizerFinancialBlock | AdminFinancialBlock =
    audience === 'admin'
      ? buildAdminFinancialBlock(paidRows, fallback, netRevenue, avgTicket, paymentMethods)
      : organizerFinancial;

  const cover: EventFinancialReportCover = {
    event_title: event.title,
    event_date: event.event_date,
    city: event.city,
    state: event.state,
    status: event.status,
    organizer_name: event.organizer_name || '',
    organizer_organization_name: event.organizer_organization_name ?? null,
  };

  const invitations: EventFinancialReportInvitations = {
    granted: invitationStats.total_invitations,
    available: invitationStats.available_invitations,
    sent: invitationStats.sent_invitations,
    used: invitationStats.used_invitations,
    expired: invitationStats.expired_invitations,
  };

  const metaWithoutHash: Omit<EventFinancialReportMeta, 'integrity_hash'> = {
    event_id: eventId,
    generated_at: generatedAt,
    report_version: EVENT_FINANCIAL_REPORT_VERSION,
    rules_version: EVENT_FINANCIAL_REPORT_RULES_VERSION,
    audience,
    export_formats: ['json', 'pdf'],
  };

  const bodyWithoutHash = {
    meta: metaWithoutHash,
    cover,
    financial_snapshot,
    executive_summary,
    registration_status,
    payment_methods: paymentMethods,
    categories: aggregateDimensionRows(categoryMap, netRevenue),
    modalities: aggregateDimensionRows(modalityMap, netRevenue),
    kits: aggregateDimensionRows(kitMap, netRevenue),
    stock: buildStockSummary(stockReport),
    invitations,
    financial,
  };

  const integrity_hash = computeIntegrityHash(bodyWithoutHash);

  const reportCore = {
    ...bodyWithoutHash,
    meta: {
      ...metaWithoutHash,
      integrity_hash,
    },
  };

  const audit: EventFinancialReportAudit = {
    financial_consistency: buildFinancialConsistencyAudit({
      financial: reportCore.financial,
      payment_methods: reportCore.payment_methods,
      categories: reportCore.categories,
      modalities: reportCore.modalities,
      kits: reportCore.kits,
    }),
  };

  return {
    ...reportCore,
    audit,
  };
}
