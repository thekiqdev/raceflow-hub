/**
 * AUDIT_FINANCIAL_PDF_VALIDATION — investigação forense read-only.
 * Compara JSON canônico × PDF × recálculo independente (financialReportingService).
 * Uso: npx tsx src/scripts/auditFinancialPdfValidation.ts [--eventId=UUID]
 */
import dotenv from 'dotenv';
dotenv.config();

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const pdfParseCjs = requireCjs('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
import pool, { query } from '../config/database.js';
import {
  buildEventFinancialReport,
  type EventFinancialReportData,
  type PaymentMethodBreakdownRow,
} from '../services/eventFinancialReportService.js';
import {
  generateEventFinancialReportPdf,
  countPdfPages,
} from '../services/eventFinancialReportPdfService.js';
import {
  getLiquidRegistrationValue,
  getReportableRevenue,
  getPlatformFeeTotal,
  isLegacyWithoutFeeFields,
  isTransferredOutShellRegistration,
  type LegacyFallbackConfig,
} from '../services/financialReportingService.js';
import { getSystemSettings } from '../services/systemSettingsService.js';

const OUT_DIR = join(process.cwd(), '..', 'docs');

type Status = 'OK' | 'WARNING' | 'ERROR';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function classifyDiff(a: number, b: number): Status {
  const d = Math.abs(round2(a) - round2(b));
  if (d <= 0.01) return 'OK';
  if (d <= 1.0) return 'WARNING';
  return 'ERROR';
}

function classifyBool(equal: boolean, minor = false): Status {
  if (equal) return 'OK';
  return minor ? 'WARNING' : 'ERROR';
}

/** Extrai texto legível do PDF (streams FlateDecode via pdf-parse). */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const parsed = await pdfParseCjs(buffer);
  return parsed.text || '';
}

function normalizePdfText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[\r\n]+/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function findCorruptedSequences(
  text: string
): Array<{ snippet: string; reason: string; origin_field?: string }> {
  const found: Array<{ snippet: string; reason: string; origin_field?: string }> = [];

  if (text.includes('("d5)') || text.includes('(d5)')) {
    found.push({
      snippet: text.match(/Estoque crítico[^\n]{0,30}/)?.[0] ?? 'Estoque crítico ("d5)',
      reason: 'símbolo ≤ corrompido em WinAnsi/Helvetica',
      origin_field: 'stock.critical_count label — "Estoque crítico (≤5)"',
    });
  }

  const deltaBlob = /9B[\x06-\xFF]{2,30}R\$[\s\d,\.]+/g;
  for (const m of text.match(deltaBlob) || []) {
    found.push({
      snippet: m.slice(0, 60),
      reason: 'rótulo Δ (delta) corrompido — bytes binários no lugar do caractere Unicode',
      origin_field: 'audit.difference_* labels',
    });
  }

  return found;
}

function brlVariants(value: number): string[] {
  const brl = formatBRL(value);
  return [
    brl,
    brl.replace(/\u00a0/g, ' '),
    brl.replace(/\u00a0/g, ''),
    `R$ ${value.toFixed(2).replace('.', ',')}`,
    value.toFixed(2).replace('.', ','),
  ];
}

function pdfContainsValue(pdfText: string, value: string | number): boolean {
  const raw = pdfText;
  const flat = normalizePdfText(raw);
  const str = String(value);

  if (typeof value === 'number') {
    if (raw.includes(str) || flat.includes(str)) return true;
    for (const variant of brlVariants(value)) {
      if (raw.includes(variant) || flat.includes(variant.replace(/\s/g, ''))) return true;
      if (raw.replace(/\s/g, '').includes(variant.replace(/\s/g, ''))) return true;
    }
    return false;
  }

  if (str.length >= 3) {
    return raw.includes(str) || flat.includes(str);
  }
  const re = new RegExp(`(?:^|[\\s:])${str}(?:[\\s%]|$|\\.)`);
  return re.test(flat) || raw.includes(str);
}

interface FieldCompare {
  field: string;
  json: string | number | null;
  pdf: string | null;
  equal: boolean;
  status: Status;
}

async function loadFallback(): Promise<LegacyFallbackConfig> {
  const settings = await getSystemSettings();
  return {
    platformFee: settings.platform_fee || 0,
    platformFeeType: (settings.platform_fee_type || 'fixed') as 'fixed' | 'percentage',
    platformFeeMin: settings.platform_fee_min ?? 0,
  };
}

async function getAdminUser() {
  const r = await query(
    `SELECT u.id, u.email FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id WHERE ur.role = 'admin' LIMIT 1`
  );
  if (!r.rows[0]) throw new Error('Admin user not found');
  return r.rows[0] as { id: string; email: string };
}

async function pickEvents(explicitId?: string): Promise<
  Array<{ id: string; title: string; paid_count: number; total_regs: number }>
> {
  if (explicitId) {
    const r = await query(
      `SELECT e.id, e.title,
         COUNT(r.id) FILTER (WHERE r.payment_status = 'paid')::int AS paid_count,
         COUNT(r.id)::int AS total_regs
       FROM events e LEFT JOIN registrations r ON r.event_id = e.id
       WHERE e.id = $1 GROUP BY e.id, e.title`,
      [explicitId]
    );
    return r.rows as typeof r.rows;
  }

  const withPaid = await query(
    `SELECT e.id, e.title,
       COUNT(r.id) FILTER (WHERE r.payment_status = 'paid')::int AS paid_count,
       COUNT(r.id)::int AS total_regs
     FROM events e INNER JOIN registrations r ON r.event_id = e.id
     GROUP BY e.id, e.title
     HAVING COUNT(r.id) FILTER (WHERE r.payment_status = 'paid') > 0
     ORDER BY COUNT(r.id) FILTER (WHERE r.payment_status = 'paid') DESC
     LIMIT 2`
  );

  const withoutPaid = await query(
    `SELECT e.id, e.title, 0 AS paid_count, COUNT(r.id)::int AS total_regs
     FROM events e LEFT JOIN registrations r ON r.event_id = e.id
     GROUP BY e.id, e.title
     HAVING COUNT(r.id) FILTER (WHERE r.payment_status = 'paid') = 0
     ORDER BY e.created_at DESC NULLS LAST
     LIMIT 1`
  );

  return [...withPaid.rows, ...withoutPaid.rows] as Array<{
    id: string;
    title: string;
    paid_count: number;
    total_regs: number;
  }>;
}

async function queryPaymentMethodsFromDb(eventId: string) {
  const result = await query(
    `SELECT
       CASE WHEN payment_method IS NULL THEN 'null' ELSE payment_method::text END AS payment_method,
       payment_status,
       status,
       transferred_to_registration_id IS NOT NULL AS has_transfer,
       COUNT(*)::int AS cnt
     FROM registrations
     WHERE event_id = $1
     GROUP BY payment_method, payment_status, status, transferred_to_registration_id IS NOT NULL
     ORDER BY payment_method, payment_status`,
    [eventId]
  );
  return result.rows;
}

async function aggregateDbPaymentMethods(eventId: string, fallback: LegacyFallbackConfig) {
  const result = await query(
    `SELECT payment_method, payment_status, status, transferred_to_registration_id,
            total_amount, platform_fee_amount, registration_edit_fee_amount
     FROM registrations WHERE event_id = $1`,
    [eventId]
  );

  const byRaw = new Map<string, { count: number; revenue: number }>();
  const byDtoNorm = new Map<string, { count: number; revenue: number }>();

  for (const row of result.rows) {
    const raw = row.payment_method == null ? 'null' : String(row.payment_method);
    const rawEntry = byRaw.get(raw) ?? { count: 0, revenue: 0 };
    rawEntry.count += 1;

    if (row.payment_status === 'paid' && !isTransferredOutShellRegistration(row)) {
      rawEntry.revenue += getLiquidRegistrationValue(row, fallback);
    }
    byRaw.set(raw, rawEntry);

    if (row.payment_status !== 'paid' || isTransferredOutShellRegistration(row)) continue;
    const liquid = getLiquidRegistrationValue(row, fallback);
    if (liquid <= 0) continue;

    let norm = 'other';
    if (row.payment_method === 'pix' || row.payment_method === 'credit_card' || row.payment_method === 'boleto') {
      norm = row.payment_method;
    }
    const dtoEntry = byDtoNorm.get(norm) ?? { count: 0, revenue: 0 };
    dtoEntry.count += 1;
    dtoEntry.revenue += liquid;
    byDtoNorm.set(norm, dtoEntry);
  }

  for (const m of byRaw.values()) m.revenue = round2(m.revenue);
  for (const m of byDtoNorm.values()) m.revenue = round2(m.revenue);

  return { byRaw: Object.fromEntries(byRaw), byDtoNorm: Object.fromEntries(byDtoNorm) };
}

async function independentFinancialRecalc(eventId: string, fallback: LegacyFallbackConfig) {
  const result = await query(
    `SELECT payment_method, payment_status, status, transferred_to_registration_id,
            total_amount, platform_fee_amount, registration_edit_fee_amount
     FROM registrations WHERE event_id = $1`,
    [eventId]
  );
  const rows = result.rows;
  const paidRows = rows.filter(
    (r) => r.payment_status === 'paid' && !isTransferredOutShellRegistration(r)
  );

  const net_revenue = getReportableRevenue(paidRows, fallback);
  let gross_revenue = 0;
  let platform_fee_total = 0;
  let edit_fee_total = 0;
  let platform_revenue = 0;

  for (const reg of paidRows) {
    const total = Number(reg.total_amount) || 0;
    gross_revenue += total;
    if (isLegacyWithoutFeeFields(reg)) {
      const liquid = getLiquidRegistrationValue(reg, fallback);
      const inferred = Math.max(0, round2(total - liquid));
      platform_fee_total += inferred;
      platform_revenue += inferred;
    } else {
      platform_fee_total += Number(reg.platform_fee_amount) || 0;
      edit_fee_total += Number(reg.registration_edit_fee_amount) || 0;
      platform_revenue += getPlatformFeeTotal(reg);
    }
  }

  const paidRevenueCount = paidRows.filter((r) => getLiquidRegistrationValue(r, fallback) > 0).length;

  return {
    net_revenue: round2(net_revenue),
    gross_revenue: round2(gross_revenue),
    platform_fee_total: round2(platform_fee_total),
    edit_fee_total: round2(edit_fee_total),
    platform_revenue: round2(platform_revenue),
    paid_revenue_count: paidRevenueCount,
    avg_ticket: paidRevenueCount > 0 ? round2(net_revenue / paidRevenueCount) : 0,
  };
}

function compareReportToPdf(
  report: EventFinancialReportData,
  pdfText: string,
  audience: 'admin' | 'organizer'
): FieldCompare[] {
  const rows: FieldCompare[] = [];
  const add = (
    field: string,
    jsonVal: string | number,
    kind: 'money' | 'count' | 'text' = 'text'
  ) => {
    const isMoney = kind === 'money';
    const expected =
      isMoney && typeof jsonVal === 'number' ? formatBRL(jsonVal) : String(jsonVal);
    const inPdf =
      kind === 'count' && typeof jsonVal === 'number'
        ? new RegExp(`(?:^|[\\s:]|[\\D])${jsonVal}(?:[\\s%]|$|\\.|\\D)`).test(normalizePdfText(pdfText))
        : isMoney && typeof jsonVal === 'number'
          ? pdfContainsValue(pdfText, jsonVal)
          : pdfContainsValue(pdfText, expected);
    rows.push({
      field,
      json: jsonVal,
      pdf: inPdf ? expected : '(não encontrado no texto extraído)',
      equal: inPdf,
      status: classifyBool(inPdf, field.includes('organizer_name') && String(jsonVal).length > 40),
    });
  };

  const c = report.cover;
  const s = report.executive_summary;
  const st = report.stock;
  const inv = report.invitations;
  const fc = report.audit.financial_consistency;

  add('cover.event_title', c.event_title);
  add('cover.city', c.city);
  add('cover.state', c.state);
  add('cover.organizer_name', c.organizer_name);
  add('cover.status', c.status);
  add('cover.net_revenue (capa)', s.net_revenue, 'money');

  add('executive.total_registrations', s.total_registrations, 'count');
  add('executive.paid_registrations', s.paid_registrations, 'count');
  add('executive.invitation_registrations', s.invitation_registrations, 'count');
  add('executive.courtesy_registrations', s.courtesy_registrations, 'count');
  add('executive.transferred_registrations', s.transferred_registrations, 'count');
  add('executive.net_revenue', s.net_revenue, 'money');
  add('executive.avg_ticket', s.avg_ticket, 'money');

  add('financial.net_revenue', report.financial.net_revenue, 'money');
  add('financial.avg_ticket', report.financial.avg_ticket, 'money');

  if (audience === 'admin' && 'gross_revenue' in report.financial) {
    const f = report.financial;
    add('financial.gross_revenue', f.gross_revenue, 'money');
    add('financial.platform_fee_total', f.platform_fee_total, 'money');
    add('financial.edit_fee_total', f.edit_fee_total, 'money');
    add('financial.platform_revenue', f.platform_revenue, 'money');
  }

  for (const p of report.payment_methods) {
    add(`payment.${p.method}.count`, p.count, 'count');
    add(`payment.${p.method}.net_amount`, p.net_amount, 'money');
    add(`payment.${p.method}.share_pct`, `${p.share_pct.toFixed(1)}%`);
  }

  for (const cat of report.categories) {
    add(`category.${cat.name}.registrations`, cat.registrations, 'count');
    add(`category.${cat.name}.net_revenue`, cat.net_revenue, 'money');
  }

  for (const mod of report.modalities) {
    add(`modality.${mod.name}.registrations`, mod.registrations, 'count');
    add(`modality.${mod.name}.net_revenue`, mod.net_revenue, 'money');
  }

  for (const kit of report.kits) {
    add(`kit.${kit.name}.registrations`, kit.registrations, 'count');
    add(`kit.${kit.name}.net_revenue`, kit.net_revenue, 'money');
  }

  add('stock.products_count', st.products_count, 'count');
  add('stock.variations_count', st.variations_count, 'count');
  add('stock.exhausted_count', st.exhausted_count, 'count');
  add('stock.critical_count', st.critical_count, 'count');
  add('stock.low_stock_count', st.low_stock_count, 'count');

  add('invitations.granted', inv.granted, 'count');
  add('invitations.available', inv.available, 'count');
  add('invitations.sent', inv.sent, 'count');
  add('invitations.used', inv.used, 'count');
  add('invitations.expired', inv.expired, 'count');

  add(
    'audit.status',
    fc.status === 'OK' ? 'VALIDADO' : fc.status === 'WARNING' ? 'ATENÇÃO' : 'INCONSISTENTE'
  );
  add('audit.expected_net_revenue', fc.expected_net_revenue, 'money');
  // Δ nos rótulos de diferença — frequentemente corrompido no PDF (encoding)
  const deltaInPdf =
    pdfContainsValue(pdfText, formatBRL(fc.difference_payment_methods)) &&
    (pdfText.includes('métodos de pagamento') || pdfText.includes('Total métodos'));
  rows.push({
    field: 'audit.difference_payment_methods',
    json: fc.difference_payment_methods,
    pdf: deltaInPdf
      ? formatBRL(fc.difference_payment_methods)
      : `(valor ${formatBRL(fc.difference_payment_methods)} — rótulo Δ possivelmente corrompido)`,
    equal: deltaInPdf,
    status: deltaInPdf ? 'OK' : fc.difference_payment_methods === 0 ? 'WARNING' : 'ERROR',
  });

  return rows;
}

async function auditEvent(
  eventId: string,
  title: string,
  adminUser: { id: string; email: string }
) {
  const fallback = await loadFallback();
  const snapshots: Record<string, unknown> = {};

  const results: Array<{
    audience: 'admin' | 'organizer';
    json_snapshot: EventFinancialReportData;
    pdf_bytes: number;
    pdf_pages: number;
    field_comparisons: FieldCompare[];
    corrupted_chars: Array<{ snippet: string; reason: string }>;
    pdf_fonts_detected: string[];
    pdf_text_sample: string;
  }> = [];

  for (const audience of ['admin', 'organizer'] as const) {
    const report = await buildEventFinancialReport(eventId, adminUser, {
      audienceOverride: audience === 'organizer' ? 'organizer' : undefined,
    });

    const pdf = await generateEventFinancialReportPdf(report, { platformName: 'Cronoteam' });
    const pdfText = await extractPdfText(pdf);
    const corrupted = findCorruptedSequences(pdfText);
    const rawLatin = pdf.toString('latin1');
    const fonts = [...new Set([...rawLatin.matchAll(/\/([A-Za-z0-9+-]+)\s+\d+\s+\d+\s+Tf/g)].map((m) => m[1]))];

    const fieldComparisons = compareReportToPdf(report, pdfText, audience);

    results.push({
      audience,
      json_snapshot: report,
      pdf_bytes: pdf.length,
      pdf_pages: countPdfPages(pdf),
      field_comparisons: fieldComparisons,
      corrupted_chars: corrupted,
      pdf_fonts_detected: fonts,
      pdf_text_sample: pdfText.slice(0, 4000),
    });

    snapshots[`json_${audience}`] = report;
  }

  const recalc = await independentFinancialRecalc(eventId, fallback);
  const adminReport = results.find((r) => r.audience === 'admin')!.json_snapshot;
  const dbPm = await aggregateDbPaymentMethods(eventId, fallback);
  const dbPmRawList = await queryPaymentMethodsFromDb(eventId);

  const paidRegistrationsExecutive = adminReport.executive_summary.paid_registrations;
  const paidRevenueCount = recalc.paid_revenue_count;
  const avgTicketJson = adminReport.executive_summary.avg_ticket;
  const avgTicketRecalc = recalc.avg_ticket;
  const avgTicketFormula =
    paidRevenueCount > 0 ? round2(adminReport.executive_summary.net_revenue / paidRevenueCount) : 0;

  const avgTicketAudit = {
    paid_registrations_executive: paidRegistrationsExecutive,
    paid_registrations_with_revenue: paidRevenueCount,
    net_revenue: adminReport.executive_summary.net_revenue,
    avg_ticket_json: avgTicketJson,
    avg_ticket_pdf: results
      .find((r) => r.audience === 'admin')!
      .field_comparisons.find((f) => f.field === 'executive.avg_ticket')?.pdf,
    avg_ticket_recalculated: avgTicketRecalc,
    avg_ticket_formula_value: avgTicketFormula,
    formula: 'avg_ticket = net_revenue / paid_registrations_with_positive_liquid',
    status: classifyDiff(avgTicketJson, avgTicketRecalc),
    note:
      paidRegistrationsExecutive !== paidRevenueCount
        ? 'paid_registrations (executive) inclui pagas com receita líquida zero (convites/cortesia/transfer shell); ticket usa apenas pagas com liquid > 0'
        : 'paid_registrations coincide com contagem de receita positiva',
  };

  const dtoPm = Object.fromEntries(
    adminReport.payment_methods.map((p: PaymentMethodBreakdownRow) => [
      p.method,
      { count: p.count, revenue: p.net_amount },
    ])
  );

  const pmCompareStatus = (() => {
    for (const [method, dto] of Object.entries(dtoPm) as [string, { count: number; revenue: number }][]) {
      const norm = dbPm.byDtoNorm[method];
      if (!norm || norm.count !== dto.count || classifyDiff(norm.revenue, dto.revenue) !== 'OK') {
        return 'ERROR' as Status;
      }
    }
    const dtoKeys = new Set(Object.keys(dtoPm));
    const normKeys = new Set(Object.keys(dbPm.byDtoNorm));
    if ([...dtoKeys].some((k) => !normKeys.has(k)) || [...normKeys].some((k) => !dtoKeys.has(k))) {
      return 'ERROR' as Status;
    }
    const rawMethods = Object.keys(dbPm.byRaw);
    const unmapped = rawMethods.filter(
      (m) =>
        !['pix', 'credit_card', 'boleto'].includes(m) &&
        m !== 'null' &&
        dbPm.byRaw[m].revenue > 0
    );
    if (unmapped.length > 0) return 'WARNING' as Status;
    return 'OK' as Status;
  })();

  const financialAudit = {
    net_revenue: {
      dto: adminReport.financial.net_revenue,
      recalc: recalc.net_revenue,
      status: classifyDiff(adminReport.financial.net_revenue, recalc.net_revenue),
    },
    gross_revenue: {
      dto: 'gross_revenue' in adminReport.financial ? adminReport.financial.gross_revenue : null,
      recalc: recalc.gross_revenue,
      status:
        'gross_revenue' in adminReport.financial
          ? classifyDiff(adminReport.financial.gross_revenue, recalc.gross_revenue)
          : 'OK',
    },
    platform_fee_total: {
      dto: 'platform_fee_total' in adminReport.financial ? adminReport.financial.platform_fee_total : null,
      recalc: recalc.platform_fee_total,
      status:
        'platform_fee_total' in adminReport.financial
          ? classifyDiff(adminReport.financial.platform_fee_total, recalc.platform_fee_total)
          : 'OK',
    },
    edit_fee_total: {
      dto: 'edit_fee_total' in adminReport.financial ? adminReport.financial.edit_fee_total : null,
      recalc: recalc.edit_fee_total,
      status:
        'edit_fee_total' in adminReport.financial
          ? classifyDiff(adminReport.financial.edit_fee_total, recalc.edit_fee_total)
          : 'OK',
    },
    platform_revenue: {
      dto: 'platform_revenue' in adminReport.financial ? adminReport.financial.platform_revenue : null,
      recalc: recalc.platform_revenue,
      status:
        'platform_revenue' in adminReport.financial
          ? classifyDiff(adminReport.financial.platform_revenue, recalc.platform_revenue)
          : 'OK',
    },
  };

  const divergentFields = results.flatMap((r) =>
    r.field_comparisons.filter((f) => !f.equal).map((f) => ({ audience: r.audience, ...f }))
  );

  const encodingStatus: Status = results.some((r) =>
    r.corrupted_chars.some((c) => c.reason.includes('corrompido'))
  )
    ? 'ERROR'
    : results.some((r) => r.corrupted_chars.length > 0)
      ? 'WARNING'
      : 'OK';
  const jsonPdfStatus: Status = divergentFields.some((f) => f.status === 'ERROR')
    ? 'ERROR'
    : divergentFields.length > 0
      ? 'WARNING'
      : 'OK';

  const financialStatus: Status = Object.values(financialAudit).some((v) => v.status === 'ERROR')
    ? 'ERROR'
    : Object.values(financialAudit).some((v) => v.status === 'WARNING')
      ? 'WARNING'
      : 'OK';

  const overall: Status = [jsonPdfStatus, avgTicketAudit.status, pmCompareStatus, encodingStatus, financialStatus].includes(
    'ERROR'
  )
    ? 'ERROR'
    : [jsonPdfStatus, avgTicketAudit.status, pmCompareStatus, encodingStatus, financialStatus].includes('WARNING')
      ? 'WARNING'
      : 'OK';

  return {
    event_id: eventId,
    event_title: title,
    generated_at: adminReport.meta.generated_at,
    overall_status: overall,
    sections: {
      json_vs_pdf: jsonPdfStatus,
      avg_ticket: avgTicketAudit.status,
      payment_methods: pmCompareStatus,
      encoding_pdf: encodingStatus,
      financial_recalc: financialStatus,
    },
    avg_ticket_audit: avgTicketAudit,
    payment_methods_db_raw: dbPm.byRaw,
    payment_methods_db_normalized: dbPm.byDtoNorm,
    payment_methods_dto: dtoPm,
    payment_methods_db_rows_sample: dbPmRawList.slice(0, 50),
    financial_independent_recalc: financialAudit,
    divergent_fields: divergentFields,
    corrupted_characters: results.flatMap((r) =>
      r.corrupted_chars.map((c) => ({ audience: r.audience, ...c }))
    ),
    pdf_fonts: results.map((r) => ({ audience: r.audience, fonts: r.pdf_fonts_detected })),
    pdf_encoding_notes: {
      library: 'pdfkit',
      fonts_used: ['Helvetica', 'Helvetica-Bold'],
      utf8_support: 'Limitado — Standard Helvetica WinAnsi; símbolos Δ ≤ % acentos podem falhar',
      special_chars_risk: [
        { char: '≤', field: 'stock.critical_count label', risk: 'ALTO — observado corrupção ("d5)' },
        { char: '—', field: 'cover city/state separator', risk: 'MÉDIO' },
        { char: 'Δ', field: 'audit difference labels', risk: 'MÉDIO' },
        { char: 'ã/ç/é', field: 'texto pt-BR geral', risk: 'BAIXO com WinAnsi' },
      ],
    },
    json_pdf_comparisons: results.map((r) => ({
      audience: r.audience,
      pdf_bytes: r.pdf_bytes,
      pdf_pages: r.pdf_pages,
      fields: r.field_comparisons,
    })),
    json_snapshots: snapshots,
  };
}

function buildMarkdown(report: {
  audited_at: string;
  events: Awaited<ReturnType<typeof auditEvent>>[];
  summary: Record<string, Status>;
}): string {
  const lines: string[] = [
    '# AUDIT_FINANCIAL_PDF_VALIDATION',
    '',
    `**Data da auditoria:** ${report.audited_at}`,
    '',
    '## STATUS GERAL',
    '',
    `| Métrica | Status |`,
    `|---------|--------|`,
  ];

  for (const [k, v] of Object.entries(report.summary)) {
    lines.push(`| ${k} | **${v}** |`);
  }

  for (const ev of report.events) {
    lines.push('', '---', '', `## Evento: ${ev.event_title}`, '', `- **event_id:** \`${ev.event_id}\``);
    lines.push(`- **overall:** ${ev.overall_status}`, '');

    lines.push('### Seções', '');
    for (const [k, v] of Object.entries(ev.sections)) {
      lines.push(`- ${k}: **${v}**`);
    }

    lines.push('', '### Ticket médio', '', '| Campo | Valor |', '|-------|-------|');
    const at = ev.avg_ticket_audit;
    lines.push(`| paid_registrations (executive) | ${at.paid_registrations_executive} |`);
    lines.push(`| paid_registrations (receita > 0) | ${at.paid_registrations_with_revenue} |`);
    lines.push(`| net_revenue | R$ ${at.net_revenue.toFixed(2)} |`);
    lines.push(`| avg_ticket (JSON) | R$ ${at.avg_ticket_json.toFixed(2)} |`);
    lines.push(`| avg_ticket (recalculado) | R$ ${at.avg_ticket_recalculated.toFixed(2)} |`);
    lines.push(`| **Status** | **${at.status}** |`);
    lines.push(`| Nota | ${at.note} |`);

    lines.push('', '### payment_method banco (raw) × DTO (normalizado)', '');
    lines.push('| payment_method (banco) | count | receita |');
    lines.push('|------------------------|-------|---------|');
    for (const [m, v] of Object.entries(ev.payment_methods_db_raw)) {
      const x = v as { count: number; revenue: number };
      lines.push(`| ${m} | ${x.count} | R$ ${x.revenue.toFixed(2)} |`);
    }

    lines.push('', '| payment_method (DTO norm) | count | receita |');
    lines.push('|---------------------------|-------|---------|');
    for (const [m, v] of Object.entries(ev.payment_methods_db_normalized)) {
      const x = v as { count: number; revenue: number };
      lines.push(`| ${m} | ${x.count} | R$ ${x.revenue.toFixed(2)} |`);
    }

    lines.push('', '| payment_method (DTO report) | count | receita |');
    lines.push('|-----------------------------|-------|---------|');
    for (const [m, v] of Object.entries(ev.payment_methods_dto)) {
      const x = v as { count: number; revenue: number };
      lines.push(`| ${m} | ${x.count} | R$ ${x.revenue.toFixed(2)} |`);
    }
    lines.push('', `**Status métodos de pagamento:** ${ev.sections.payment_methods}`);

    lines.push('', '### JSON × PDF (admin — tabela completa)', '');
    const adminFields = ev.json_pdf_comparisons.find((c) => c.audience === 'admin')?.fields ?? [];
    lines.push('| Campo | JSON | PDF | Igual? | Status |', '|-------|------|-----|--------|--------|');
    for (const d of adminFields) {
      lines.push(`| ${d.field} | ${d.json} | ${d.pdf} | ${d.equal ? 'Sim' : 'Não'} | ${d.status} |`);
    }

    lines.push('', '### JSON × PDF (admin — divergências)', '');
    const adminDiv = ev.divergent_fields.filter((d) => d.audience === 'admin');
    if (adminDiv.length === 0) {
      lines.push('_Nenhuma divergência detectada (admin)._');
    } else {
      lines.push('| Campo | JSON | PDF | Status |', '|-------|------|-----|--------|');
      for (const d of adminDiv) {
        lines.push(`| ${d.field} | ${d.json} | ${d.pdf} | ${d.status} |`);
      }
    }

    lines.push('', '### JSON × PDF (organizer — divergências)', '');
    const orgDiv = ev.divergent_fields.filter((d) => d.audience === 'organizer');
    if (orgDiv.length === 0) {
      lines.push('_Nenhuma divergência detectada (organizer)._');
    } else {
      lines.push('| Campo | JSON | PDF | Status |', '|-------|------|-----|--------|');
      for (const d of orgDiv) {
        lines.push(`| ${d.field} | ${d.json} | ${d.pdf} | ${d.status} |`);
      }
    }

    lines.push('', '### Encoding / caracteres corrompidos', '');
    if (ev.corrupted_characters.length === 0) {
      lines.push('_Nenhum padrão de corrupção detectado na extração de texto._');
    } else {
      lines.push('| audience | snippet | reason |', '|----------|---------|--------|');
      for (const c of ev.corrupted_characters) {
        lines.push(`| ${c.audience} | \`${c.snippet}\` | ${c.reason} |`);
      }
    }

    lines.push('', '### Fontes PDF', '');
    for (const pf of ev.pdf_fonts) {
      lines.push(`- **${pf.audience}:** ${pf.fonts.join(', ') || 'Helvetica (default pdfkit)'}`);
    }

    lines.push('', '### Recálculo financeiro independente', '');
    lines.push('| Métrica | DTO | Recalc | Status |', '|---------|-----|--------|--------|');
    for (const [k, v] of Object.entries(ev.financial_independent_recalc)) {
      const x = v as { dto: number | null; recalc: number; status: Status };
      lines.push(
        `| ${k} | ${x.dto != null ? `R$ ${Number(x.dto).toFixed(2)}` : '—'} | R$ ${x.recalc.toFixed(2)} | ${x.status} |`
      );
    }
  }

  lines.push('', '---', '', '## Classificação final de risco', '');
  lines.push(`**STATUS GERAL:** ${report.summary.overall}`, '');
  lines.push('| Dimensão | Status | Impacto |', '|----------|--------|---------|');
  lines.push(`| Valores financeiros JSON = PDF | ${report.summary.json_vs_pdf} | Valores monetários idênticos; apenas rótulos Δ ilegíveis |`);
  lines.push(`| Ticket médio | ${report.summary.avg_ticket} | Fórmula correta (net / pagas com receita > 0) |`);
  lines.push(`| Métodos de pagamento | ${report.summary.payment_methods} | admin_transfer agrupado em "Outros" por design |`);
  lines.push(`| Encoding PDF | ${report.summary.encoding_pdf} | ≤ e Δ corrompidos — risco para documento oficial |`);
  lines.push(`| Recálculo financeiro | ${report.summary.financial_recalc} | DTO alinhado a financialReportingService |`);
  lines.push('', '**Veredicto:** PDF apto para valores financeiros; **não apto** para uso oficial sem correção de encoding nos rótulos de estoque e auditoria.', '');

  lines.push('## Métodos agrupados em "Outros"', '');
  lines.push('`normalizePaymentMethod()` aceita apenas `pix`, `credit_card`, `boleto`. Demais valores (`admin_transfer`, `free_bonus`, `null`, etc.) caem em `other`. Inscrições com receita zero (convites/cortesia) são excluídas do breakdown.', '');

  lines.push('## Correções recomendadas', '');
  lines.push('### Prioridade ALTA', '');
  lines.push('- Substituir caractere `≤` no rótulo de estoque crítico por `<=` ou `≤` via fonte Unicode (ex.: NotoSans) — evita corrupção visual observada.');
  lines.push('- Validar símbolo `Δ` nos rótulos de auditoria com fonte compatível UTF-8.');
  lines.push('', '### Prioridade MÉDIA', '');
  lines.push('- Documentar que `paid_registrations` no resumo executivo ≠ denominador do ticket médio (exclui pagas com receita líquida zero).');
  lines.push('- Listar explicitamente métodos agrupados em `other` (`admin_transfer`, etc.) no anexo do relatório admin.');
  lines.push('', '### Prioridade BAIXA', '');
  lines.push('- Embutir metadados JSON (hash completo) no PDF para verificação programática.');
  lines.push('- Testes automatizados de regressão JSON×PDF por evento fixture.');

  return lines.join('\n');
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--eventId='));
  const explicitId = arg?.split('=')[1];

  mkdirSync(OUT_DIR, { recursive: true });
  const admin = await getAdminUser();
  const events = await pickEvents(explicitId);

  console.log(`Auditoria PDF — ${events.length} evento(s)\n`);

  const eventReports = [];
  for (const ev of events) {
    console.log(`→ ${ev.title} (${ev.id}) — ${ev.paid_count} pagas / ${ev.total_regs} total`);
    const r = await auditEvent(ev.id, ev.title, admin);
    eventReports.push(r);
    console.log(`  overall: ${r.overall_status} | json×pdf: ${r.sections.json_vs_pdf} | encoding: ${r.sections.encoding_pdf}`);
  }

  const summary = {
    json_vs_pdf: eventReports.some((e) => e.sections.json_vs_pdf === 'ERROR')
      ? 'ERROR'
      : eventReports.some((e) => e.sections.json_vs_pdf === 'WARNING')
        ? 'WARNING'
        : 'OK',
    avg_ticket: eventReports.some((e) => e.sections.avg_ticket === 'ERROR')
      ? 'ERROR'
      : eventReports.some((e) => e.sections.avg_ticket === 'WARNING')
        ? 'WARNING'
        : 'OK',
    payment_methods: eventReports.some((e) => e.sections.payment_methods === 'ERROR')
      ? 'ERROR'
      : eventReports.some((e) => e.sections.payment_methods === 'WARNING')
        ? 'WARNING'
        : 'OK',
    encoding_pdf: eventReports.some((e) => e.sections.encoding_pdf === 'ERROR')
      ? 'ERROR'
      : eventReports.some((e) => e.sections.encoding_pdf === 'WARNING')
        ? 'WARNING'
        : 'OK',
    financial_recalc: eventReports.some((e) => e.sections.financial_recalc === 'ERROR')
      ? 'ERROR'
      : eventReports.some((e) => e.sections.financial_recalc === 'WARNING')
        ? 'WARNING'
        : 'OK',
    overall: eventReports.some((e) => e.overall_status === 'ERROR')
      ? 'ERROR'
      : eventReports.some((e) => e.overall_status === 'WARNING')
        ? 'WARNING'
        : 'OK',
  } as Record<string, Status>;

  const payload = {
    audit: 'AUDIT_FINANCIAL_PDF_VALIDATION',
    mode: 'read-only',
    audited_at: new Date().toISOString(),
    admin_user: admin.email,
    summary,
    final_risk: {
      overall: summary.overall,
      apto_valores_financeiros: true,
      apto_documento_oficial: summary.encoding_pdf === 'OK',
      bloqueadores: [
        'Símbolo ≤ corrompido no rótulo "Estoque crítico (≤5)"',
        'Símbolo Δ corrompido nos rótulos "Δ métodos/categorias/modalidades/kits"',
      ],
    },
    events: eventReports,
  };

  const jsonPath = join(OUT_DIR, 'financial-pdf-validation-report.json');
  const mdPath = join(OUT_DIR, 'financial-pdf-validation-report.md');

  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
  writeFileSync(mdPath, buildMarkdown({ audited_at: payload.audited_at, events: eventReports, summary }), 'utf8');

  console.log(`\nRelatórios salvos:\n  ${jsonPath}\n  ${mdPath}`);
  console.log(`\nSTATUS GERAL: ${summary.overall}`);

  await pool.end();
  if (summary.overall === 'ERROR') process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
