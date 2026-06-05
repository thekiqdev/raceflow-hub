/**
 * Gera PDFs de teste e reporta tamanho/páginas.
 * Uso: npx tsx src/scripts/testEventFinancialReportPdf.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import pool, { query } from '../config/database.js';
import { buildEventFinancialReport } from '../services/eventFinancialReportService.js';
import {
  countPdfPages,
  generateEventFinancialReportPdf,
} from '../services/eventFinancialReportPdfService.js';

async function getAdminUser() {
  const r = await query(
    `SELECT u.id, u.email FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id WHERE ur.role = 'admin' LIMIT 1`
  );
  return r.rows[0] as { id: string; email: string };
}

async function main() {
  const admin = await getAdminUser();
  const events = await query(
    `SELECT DISTINCT e.id, e.title FROM events e
     INNER JOIN registrations r ON r.event_id = e.id
     WHERE r.payment_status = 'paid'`
  );

  const outDir = join(process.cwd(), 'tmp', 'financial-report-pdf-test');
  mkdirSync(outDir, { recursive: true });

  const stats: Array<{ title: string; audience: string; bytes: number; pages: number }> = [];

  for (const ev of events.rows) {
    for (const audienceMode of ['admin', 'organizer'] as const) {
      const report = await buildEventFinancialReport(ev.id, admin);
      if (audienceMode === 'organizer') {
        report.meta.audience = 'organizer';
        if ('gross_revenue' in report.financial) {
          report.financial = {
            net_revenue: report.financial.net_revenue,
            avg_ticket: report.financial.avg_ticket,
            payment_methods: report.financial.payment_methods,
          };
        }
      }
      const pdf = await generateEventFinancialReportPdf(report);
      const pages = countPdfPages(pdf);
      const file = join(outDir, `${ev.id}_${audienceMode}.pdf`);
      writeFileSync(file, pdf);
      stats.push({
        title: ev.title,
        audience: audienceMode,
        bytes: pdf.length,
        pages,
      });
      console.log(`${ev.title} [${audienceMode}]: ${pdf.length} bytes, ~${pages} páginas → ${file}`);
    }
  }

  if (stats.length > 0) {
    const avgBytes = Math.round(stats.reduce((s, x) => s + x.bytes, 0) / stats.length);
    const avgPages = (stats.reduce((s, x) => s + x.pages, 0) / stats.length).toFixed(1);
    console.log(`\nMédia: ${avgBytes} bytes (~${(avgBytes / 1024).toFixed(1)} KB), ${avgPages} páginas`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
