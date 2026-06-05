/**
 * Validação cruzada do relatório financeiro canônico vs outras fontes.
 * Uso: npx tsx src/scripts/validateEventFinancialReport.ts [eventId]
 */
import dotenv from 'dotenv';
dotenv.config();

import pool, { query } from '../config/database.js';
import { buildEventFinancialReport } from '../services/eventFinancialReportService.js';
import { getOrganizerEventRevenues } from '../services/organizerService.js';
import { getEvents } from '../services/eventsService.js';
import {
  getLiquidRegistrationValue,
  isTransferredOutShellRegistration,
} from '../services/financialReportingService.js';
import { getSystemSettings } from '../services/systemSettingsService.js';

const TOLERANCE = 0.01;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sum(arr: number[]): number {
  return round2(arr.reduce((a, b) => a + b, 0));
}

function ok(a: number, b: number, label: string): boolean {
  const diff = Math.abs(round2(a) - round2(b));
  const pass = diff <= TOLERANCE;
  console.log(
    `  ${pass ? '✅' : '❌'} ${label}: A=${round2(a)} B=${round2(b)} Δ=${round2(diff)}`
  );
  return pass;
}

async function loadFallback() {
  const settings = await getSystemSettings();
  return {
    platformFee: settings.platform_fee || 0,
    platformFeeType: (settings.platform_fee_type || 'fixed') as 'fixed' | 'percentage',
    platformFeeMin: settings.platform_fee_min ?? 0,
  };
}

async function detailedReportRevenue(eventId: string): Promise<number> {
  const fallback = await loadFallback();
  const result = await query(
    `SELECT payment_status, payment_method, total_amount, platform_fee_amount,
            registration_edit_fee_amount, status, transferred_to_registration_id
     FROM registrations WHERE event_id = $1`,
    [eventId]
  );
  let total = 0;
  for (const row of result.rows) {
    if (row.payment_status !== 'paid' || isTransferredOutShellRegistration(row)) continue;
    const amount = Number(row.total_amount) || 0;
    if (amount <= 0) continue;
    total += getLiquidRegistrationValue(row, fallback);
  }
  return round2(total);
}

async function pickEventId(arg?: string): Promise<string> {
  if (arg) return arg;
  const result = await query(
    `SELECT e.id, e.title, COUNT(r.id) FILTER (WHERE r.payment_status = 'paid') AS paid
     FROM events e
     INNER JOIN registrations r ON r.event_id = e.id
     GROUP BY e.id, e.title
     HAVING COUNT(r.id) FILTER (WHERE r.payment_status = 'paid') > 0
     ORDER BY COUNT(r.id) FILTER (WHERE r.payment_status = 'paid') DESC
     LIMIT 1`
  );
  if (result.rows.length === 0) throw new Error('Nenhum evento com inscrições pagas encontrado');
  console.log(`Evento selecionado: ${result.rows[0].title} (${result.rows[0].id}) — ${result.rows[0].paid} pagas\n`);
  return result.rows[0].id;
}

async function getAdminUser(): Promise<{ id: string; email: string }> {
  const result = await query(
    `SELECT u.id, u.email FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     WHERE ur.role = 'admin' LIMIT 1`
  );
  if (result.rows.length === 0) throw new Error('Nenhum admin encontrado');
  return { id: result.rows[0].id, email: result.rows[0].email };
}

async function validateEvent(eventId: string): Promise<boolean> {
  const admin = await getAdminUser();
  const report = await buildEventFinancialReport(eventId, admin);
  const net = report.financial.net_revenue;

  console.log(`\n━━━ Evento: ${report.cover.event_title} (${eventId}) ━━━`);
  console.log(`meta.audience=${report.meta.audience} integrity_hash=${report.meta.integrity_hash.slice(0, 12)}…`);

  const eventRow = await query(`SELECT organizer_id FROM events WHERE id = $1`, [eventId]);
  const organizerId = eventRow.rows[0]?.organizer_id;

  const organizerRevenues = await getOrganizerEventRevenues(organizerId);
  const orgEventRev = organizerRevenues.find((e) => e.eventId === eventId)?.totalRevenue ?? null;

  const allEvents = await getEvents({ organizer_id: organizerId });
  const listEvent = allEvents.find((e: { id: string }) => e.id === eventId);
  const listRevenue = listEvent?.revenue ?? null;

  const detailedRev = await detailedReportRevenue(eventId);

  console.log('\n── Receita líquida (net_revenue) ──');
  let allPass = true;
  allPass = ok(net, detailedRev, 'Relatório detalhado (lógica canônica)') && allPass;
  if (orgEventRev != null) allPass = ok(net, orgEventRev, 'Organizer event-revenues') && allPass;
  if (listRevenue != null) allPass = ok(net, listRevenue, 'Listagem de eventos (eventsService)') && allPass;
  allPass = ok(net, report.executive_summary.net_revenue, 'executive_summary.net_revenue') && allPass;

  console.log('\n── payment_methods vs net_revenue ──');
  const pmSum = sum(report.payment_methods.map((p) => p.net_amount));
  allPass = ok(pmSum, net, 'Σ payment_methods.net_amount') && allPass;

  console.log('\n── audit.financial_consistency ──');
  const fc = report.audit.financial_consistency;
  console.log(`  status: ${fc.status}`);
  console.log(`  expected_net_revenue: ${fc.expected_net_revenue}`);
  console.log(`  payment_methods_total: ${fc.payment_methods_total} (Δ ${fc.difference_payment_methods})`);
  console.log(`  categories_total: ${fc.categories_total} (Δ ${fc.difference_categories})`);
  console.log(`  modalities_total: ${fc.modalities_total} (Δ ${fc.difference_modalities})`);
  console.log(`  kits_total: ${fc.kits_total} (Δ ${fc.difference_kits})`);
  if (fc.status !== 'OK') allPass = false;

  console.log('\n── Dimensões vs net_revenue ──');
  const catSum = sum(report.categories.map((c) => c.net_revenue));
  const modSum = sum(report.modalities.map((m) => m.net_revenue));
  const kitSum = sum(report.kits.map((k) => k.net_revenue));

  allPass = ok(catSum, net, 'Σ categorias.net_revenue') && allPass;
  allPass = ok(modSum, net, 'Σ modalidades.net_revenue') && allPass;
  allPass = ok(kitSum, net, 'Σ kits.net_revenue') && allPass;

  if (Math.abs(catSum - net) > TOLERANCE) {
    console.log('  ℹ️  categorias:', report.categories.length, 'linhas');
  }
  if (Math.abs(modSum - net) > TOLERANCE) {
    const fallback = await loadFallback();
    const regs = await query(
      `SELECT modality_id, total_amount, payment_status, platform_fee_amount, registration_edit_fee_amount,
              status, transferred_to_registration_id, payment_method
       FROM registrations WHERE event_id = $1 AND payment_status = 'paid'`,
      [eventId]
    );
    let withoutMod = 0;
    let liquidWithoutMod = 0;
    for (const r of regs.rows) {
      if (isTransferredOutShellRegistration(r)) continue;
      const liq = getLiquidRegistrationValue(r, fallback);
      if (liq <= 0) continue;
      if (!r.modality_id) {
        withoutMod++;
        liquidWithoutMod += liq;
      }
    }
    console.log(`  ℹ️  Paid com receita sem modality_id: ${withoutMod} (R$ ${round2(liquidWithoutMod)})`);
  }
  if (Math.abs(kitSum - net) > TOLERANCE) {
    const fallback = await loadFallback();
    const regs = await query(
      `SELECT kit_id, total_amount, payment_status, platform_fee_amount, registration_edit_fee_amount,
              status, transferred_to_registration_id, payment_method
       FROM registrations WHERE event_id = $1 AND payment_status = 'paid'`,
      [eventId]
    );
    let withoutKit = 0;
    let liquidWithoutKit = 0;
    for (const r of regs.rows) {
      if (isTransferredOutShellRegistration(r)) continue;
      const liq = getLiquidRegistrationValue(r, fallback);
      if (liq <= 0) continue;
      if (!r.kit_id) {
        withoutKit++;
        liquidWithoutKit += liq;
      }
    }
    console.log(`  ℹ️  Paid com receita sem kit_id: ${withoutKit} (R$ ${round2(liquidWithoutKit)})`);
  }

  console.log('\n── payment_methods detalhe ──');
  for (const p of report.payment_methods) {
    console.log(`  ${p.method}: count=${p.count} net=${p.net_amount} share=${p.share_pct}%`);
  }

  console.log(`\n${allPass ? '✅ VALIDAÇÃO OK' : '❌ DIVERGÊNCIAS ENCONTRADAS'}\n`);
  return allPass;
}

async function main() {
  const eventIdArg = process.argv[2];
  const scanAll = process.argv.includes('--all');
  try {
    if (scanAll) {
      const all = await query(
        `SELECT DISTINCT e.id FROM events e
         INNER JOIN registrations r ON r.event_id = e.id
         WHERE r.payment_status = 'paid'`
      );
      let fails = 0;
      for (const row of all.rows) {
        const p = await validateEvent(row.id);
        if (!p) fails++;
      }
      console.log(`\nTotal eventos: ${all.rows.length}, falhas: ${fails}`);
      if (fails > 0) process.exitCode = 1;
      return;
    }

    const eventId = await pickEventId(eventIdArg);
    const pass = await validateEvent(eventId);

    // Validar mais 2 eventos se não passou id
    if (!eventIdArg) {
      const others = await query(
        `SELECT e.id FROM events e
         INNER JOIN registrations r ON r.event_id = e.id
         WHERE r.payment_status = 'paid' AND e.id != $1
         GROUP BY e.id
         ORDER BY COUNT(*) DESC LIMIT 2`,
        [eventId]
      );
      for (const row of others.rows) {
        const p = await validateEvent(row.id);
        if (!p) process.exitCode = 1;
      }
    }

    if (!pass) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
