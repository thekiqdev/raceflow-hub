import PDFDocument from 'pdfkit';
import type {
  AdminFinancialBlock,
  DimensionRevenueRow,
  EventFinancialReportData,
  FinancialConsistencyStatus,
  PaymentMethodBreakdownRow,
} from './eventFinancialReportService.js';

const PAGE = { width: 595.28, height: 841.89 }; // A4 pt
const MARGIN = 50;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const HEADER_H = 52;
const FOOTER_H = 36;

const COLORS = {
  primary: '#1e3a5f',
  text: '#1a1a1a',
  muted: '#666666',
  line: '#dddddd',
  ok: '#15803d',
  warning: '#b45309',
  error: '#b91c1c',
  sealBg: {
    OK: '#dcfce7',
    WARNING: '#fef3c7',
    ERROR: '#fee2e2',
  } as Record<FinancialConsistencyStatus, string>,
};

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function formatEventDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { dateStyle: 'long' });
  } catch {
    return iso;
  }
}

function paymentMethodLabel(method: string): string {
  const map: Record<string, string> = {
    pix: 'PIX',
    credit_card: 'Cartão de crédito',
    boleto: 'Boleto',
    other: 'Outros',
  };
  return map[method] ?? method;
}

function isAdminFinancial(
  report: EventFinancialReportData
): report is EventFinancialReportData & { financial: AdminFinancialBlock } {
  return report.meta.audience === 'admin';
}

function auditSealLabel(status: FinancialConsistencyStatus): string {
  switch (status) {
    case 'OK':
      return 'VALIDADO';
    case 'WARNING':
      return 'ATENÇÃO';
    case 'ERROR':
      return 'INCONSISTENTE';
  }
}

type PdfDoc = InstanceType<typeof PDFDocument>;

class PdfLayout {
  private y = MARGIN + HEADER_H;
  private pageNumber = 0;

  constructor(
    private doc: PdfDoc,
    private report: EventFinancialReportData,
    private platformName: string
  ) {}

  private contentBottom(): number {
    return PAGE.height - MARGIN - FOOTER_H;
  }

  private ensureSpace(height: number): void {
    if (this.y + height > this.contentBottom()) {
      this.doc.addPage();
      this.pageNumber += 1;
      this.y = MARGIN + HEADER_H;
      this.drawHeader();
    }
  }

  private drawHeader(): void {
    const { cover } = this.report;
    this.doc
      .save()
      .rect(0, 0, PAGE.width, HEADER_H)
      .fill(COLORS.primary)
      .restore();

    this.doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11);
    this.doc.text(this.platformName, MARGIN, 16, { width: CONTENT_WIDTH * 0.55 });

    this.doc.font('Helvetica').fontSize(8);
    this.doc.text('Relatório Financeiro Oficial', MARGIN, 32, { width: CONTENT_WIDTH * 0.55 });

    this.doc.fontSize(7);
    const rightW = CONTENT_WIDTH * 0.42;
    const rightX = PAGE.width - MARGIN - rightW;
    this.doc.text(cover.event_title, rightX, 14, { width: rightW, align: 'right' });
    this.doc.text(`${cover.city} — ${cover.state}`, rightX, 26, { width: rightW, align: 'right' });
    this.doc.text(`Versão ${this.report.meta.report_version}`, rightX, 38, { width: rightW, align: 'right' });

    this.doc.fillColor(COLORS.text);
    this.y = MARGIN + HEADER_H + 12;
  }

  private drawFooters(): void {
    const range = this.doc.bufferedPageRange();
    const total = range.count;
    const hashShort = this.report.meta.integrity_hash.slice(0, 16);

    for (let i = range.start; i < range.start + total; i++) {
      this.doc.switchToPage(i);
      const footerY = PAGE.height - MARGIN - 18;

      this.doc
        .moveTo(MARGIN, footerY - 8)
        .lineTo(PAGE.width - MARGIN, footerY - 8)
        .strokeColor(COLORS.line)
        .stroke();

      this.doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7);
      this.doc.text(
        `${this.report.cover.event_title} · Gerado em ${formatDate(this.report.meta.generated_at)} · v${this.report.meta.report_version} · hash ${hashShort}…`,
        MARGIN,
        footerY,
        { width: CONTENT_WIDTH * 0.78 }
      );
      this.doc.text(`Página ${i - range.start + 1}/${total}`, PAGE.width - MARGIN - 80, footerY, {
        width: 80,
        align: 'right',
      });
    }
    this.doc.fillColor(COLORS.text);
  }

  sectionTitle(title: string): void {
    this.ensureSpace(28);
    this.doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(13);
    this.doc.text(title, MARGIN, this.y, { width: CONTENT_WIDTH });
    this.y += 18;
    this.doc
      .moveTo(MARGIN, this.y)
      .lineTo(PAGE.width - MARGIN, this.y)
      .strokeColor(COLORS.line)
      .lineWidth(1)
      .stroke();
    this.y += 12;
    this.doc.fillColor(COLORS.text);
  }

  keyValueRows(rows: Array<[string, string]>, colWidth = CONTENT_WIDTH / 2): void {
    const rowH = 16;
    for (const [label, value] of rows) {
      this.ensureSpace(rowH);
      this.doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
      this.doc.text(label, MARGIN, this.y, { width: colWidth - 10 });
      this.doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(9);
      this.doc.text(value, MARGIN + colWidth, this.y, { width: colWidth, align: 'right' });
      this.y += rowH;
    }
    this.y += 6;
  }

  table(
    headers: string[],
    colWidths: number[],
    rows: string[][],
    alignRightFromCol = 1
  ): void {
    const rowH = 18;
    const headerH = 20;

    const drawHeader = () => {
      this.doc.rect(MARGIN, this.y, CONTENT_WIDTH, headerH).fill('#f3f4f6');
      let x = MARGIN + 4;
      this.doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(8);
      headers.forEach((h, i) => {
        this.doc.text(h, x, this.y + 6, {
          width: colWidths[i] - 8,
          align: i >= alignRightFromCol ? 'right' : 'left',
        });
        x += colWidths[i];
      });
      this.y += headerH;
    };

    this.ensureSpace(headerH + rowH);
    drawHeader();

    this.doc.font('Helvetica').fontSize(8);
    for (let r = 0; r < rows.length; r++) {
      if (this.y + rowH > this.contentBottom()) {
        this.doc.addPage();
        this.pageNumber += 1;
        this.y = MARGIN + HEADER_H;
        this.drawHeader();
        drawHeader();
      }
      if (r % 2 === 1) {
        this.doc.rect(MARGIN, this.y, CONTENT_WIDTH, rowH).fill('#fafafa');
      }
      let x = MARGIN + 4;
      this.doc.fillColor(COLORS.text);
      rows[r].forEach((cell, i) => {
        this.doc.text(cell, x, this.y + 5, {
          width: colWidths[i] - 8,
          align: i >= alignRightFromCol ? 'right' : 'left',
        });
        x += colWidths[i];
      });
      this.y += rowH;
    }
    this.y += 10;
  }

  renderCover(): void {
    this.pageNumber = 0;
    this.drawHeader();
    this.y = 120;

    this.doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(22);
    this.doc.text('Relatório Financeiro', MARGIN, this.y, { width: CONTENT_WIDTH, align: 'center' });
    this.y += 36;

    this.doc.fontSize(16).fillColor(COLORS.text);
    this.doc.text(this.report.cover.event_title, MARGIN, this.y, { width: CONTENT_WIDTH, align: 'center' });
    this.y += 40;

    this.doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted);
    const coverLines = [
      `Data do evento: ${formatEventDate(this.report.cover.event_date)}`,
      `Local: ${this.report.cover.city} — ${this.report.cover.state}`,
      `Organizador: ${this.report.cover.organizer_name}${
        this.report.cover.organizer_organization_name
          ? ` (${this.report.cover.organizer_organization_name})`
          : ''
      }`,
      `Status: ${this.report.cover.status}`,
      `Relatório gerado em: ${formatDate(this.report.meta.generated_at)}`,
      `Público: ${this.report.meta.audience === 'admin' ? 'Administrador' : 'Organizador'}`,
    ];
    for (const line of coverLines) {
      this.doc.text(line, MARGIN, this.y, { width: CONTENT_WIDTH, align: 'center' });
      this.y += 18;
    }

    this.y += 24;
    this.doc.font('Helvetica-Bold').fontSize(12).fillColor(COLORS.primary);
    this.doc.text(formatBRL(this.report.executive_summary.net_revenue), MARGIN, this.y, {
      width: CONTENT_WIDTH,
      align: 'center',
    });
    this.y += 16;
    this.doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
    this.doc.text('Receita líquida reportável', MARGIN, this.y, { width: CONTENT_WIDTH, align: 'center' });

    this.doc.addPage();
    this.pageNumber += 1;
    this.y = MARGIN + HEADER_H;
    this.drawHeader();
  }

  renderExecutiveSummary(): void {
    const s = this.report.executive_summary;
    const snap = this.report.financial_snapshot;
    this.sectionTitle('Resumo executivo');
    this.keyValueRows([
      ['Total de inscrições', String(s.total_registrations)],
      ['Inscrições pagas', String(s.paid_registrations)],
      ['Inscrições por convite', String(s.invitation_registrations)],
      ['Inscrições cortesia', String(s.courtesy_registrations)],
      ['Inscrições transferidas', String(s.transferred_registrations)],
      ['Receita líquida', formatBRL(s.net_revenue)],
      ['Ticket médio', formatBRL(s.avg_ticket)],
    ]);

    this.sectionTitle('Status das inscrições');
    const rs = this.report.registration_status;
    this.keyValueRows([
      ['Pagas', String(rs.paid)],
      ['Pendentes', String(rs.pending)],
      ['Canceladas', String(rs.cancelled)],
      ['Reembolsadas', String(rs.refunded)],
      ['Convidado', String(rs.convidado)],
      ['Transferidas', String(rs.transferred)],
    ]);

    this.sectionTitle('Snapshot financeiro');
    this.keyValueRows([
      ['Total registros', String(snap.registrations_total)],
      ['Pagas', String(snap.paid_total)],
      ['Pendentes', String(snap.pending_total)],
      ['Reembolsadas', String(snap.refunded_total)],
      ['Convidado', String(snap.invited_total)],
      ['Transferidas', String(snap.transferred_total)],
    ]);

    if (isAdminFinancial(this.report)) {
      const f = this.report.financial;
      this.sectionTitle('Financeiro (administrador)');
      this.keyValueRows([
        ['Receita bruta', formatBRL(f.gross_revenue)],
        ['Receita líquida', formatBRL(f.net_revenue)],
        ['Taxa plataforma', formatBRL(f.platform_fee_total)],
        ['Taxa edição', formatBRL(f.edit_fee_total)],
        ['Receita plataforma', formatBRL(f.platform_revenue)],
        ['Diferença bruto × líquido', formatBRL(f.gross_net_delta)],
        ['Ticket médio', formatBRL(f.avg_ticket)],
      ]);
    } else {
      const f = this.report.financial;
      this.sectionTitle('Financeiro (organizador)');
      this.keyValueRows([
        ['Receita líquida', formatBRL(f.net_revenue)],
        ['Ticket médio', formatBRL(f.avg_ticket)],
      ]);
    }
  }

  renderPaymentMethods(): void {
    this.sectionTitle('Métodos de pagamento');
    const rows = this.report.payment_methods.map((p: PaymentMethodBreakdownRow) => [
      paymentMethodLabel(p.method),
      String(p.count),
      formatBRL(p.net_amount),
      `${p.share_pct.toFixed(1)}%`,
    ]);
    if (rows.length === 0) {
      this.doc.fontSize(9).fillColor(COLORS.muted).text('Nenhum pagamento registrado.', MARGIN, this.y);
      this.y += 20;
      return;
    }
    this.table(['Método', 'Qtd', 'Valor líquido', 'Participação'], [140, 60, 120, 80], rows, 1);
  }

  renderDimensionTable(title: string, rows: DimensionRevenueRow[]): void {
    this.sectionTitle(title);
    if (rows.length === 0) {
      this.doc.fontSize(9).fillColor(COLORS.muted).text('Sem dados.', MARGIN, this.y);
      this.y += 20;
      return;
    }
    this.table(
      ['Nome', 'Inscritos', 'Receita líquida', '%'],
      [200, 70, 110, 50],
      rows.map((r) => [r.name, String(r.registrations), formatBRL(r.net_revenue), `${r.share_pct.toFixed(1)}%`]),
      1
    );
  }

  renderInvitations(): void {
    const inv = this.report.invitations;
    this.sectionTitle('Convites');
    this.keyValueRows([
      ['Concedidos', String(inv.granted)],
      ['Disponíveis', String(inv.available)],
      ['Enviados', String(inv.sent)],
      ['Usados', String(inv.used)],
      ['Expirados', String(inv.expired)],
    ]);
  }

  renderStock(): void {
    const st = this.report.stock;
    this.sectionTitle('Estoque');
    this.keyValueRows([
      ['Produtos', String(st.products_count)],
      ['Variações', String(st.variations_count)],
      ['Variações esgotadas', String(st.exhausted_count)],
      ['Estoque crítico (≤5)', String(st.critical_count)],
      ['Baixo estoque (6–10)', String(st.low_stock_count)],
    ]);
  }

  renderAudit(): void {
    const fc = this.report.audit.financial_consistency;
    const status = fc.status;
    const seal = auditSealLabel(status);

    this.sectionTitle('Auditoria de consistência financeira');
    this.ensureSpace(44);

    this.doc
      .roundedRect(MARGIN, this.y, CONTENT_WIDTH, 36, 4)
      .fill(COLORS.sealBg[status]);
    this.doc.fillColor(COLORS[status === 'OK' ? 'ok' : status === 'WARNING' ? 'warning' : 'error']);
    this.doc.font('Helvetica-Bold').fontSize(11);
    this.doc.text(`Selo: ${seal}`, MARGIN + 12, this.y + 12, { width: CONTENT_WIDTH - 24 });
    this.y += 48;

    this.doc.fillColor(COLORS.text).font('Helvetica').fontSize(9);
    this.keyValueRows([
      ['Receita líquida esperada', formatBRL(fc.expected_net_revenue)],
      ['Total métodos de pagamento', formatBRL(fc.payment_methods_total)],
      ['Total categorias', formatBRL(fc.categories_total)],
      ['Total modalidades', formatBRL(fc.modalities_total)],
      ['Total kits', formatBRL(fc.kits_total)],
      ['Δ métodos de pagamento', formatBRL(fc.difference_payment_methods)],
      ['Δ categorias', formatBRL(fc.difference_categories)],
      ['Δ modalidades', formatBRL(fc.difference_modalities)],
      ['Δ kits', formatBRL(fc.difference_kits)],
    ]);
  }

  finish(): void {
    this.drawFooters();
  }
}

/**
 * Gera PDF A4 do relatório financeiro canônico (somente transformação do DTO — sem recálculo).
 */
export async function generateEventFinancialReportPdf(
  report: EventFinancialReportData,
  options?: { platformName?: string }
): Promise<Buffer> {
  const platformName = options?.platformName ?? 'Cronoteam';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: `Relatório Financeiro — ${report.cover.event_title}`,
        Author: platformName,
        Subject: 'Relatório financeiro oficial do evento',
        CreationDate: new Date(report.meta.generated_at),
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const layout = new PdfLayout(doc, report, platformName);
    layout.renderCover();
    layout.renderExecutiveSummary();
    layout.renderPaymentMethods();
    layout.renderDimensionTable('Categorias', report.categories);
    layout.renderDimensionTable('Modalidades', report.modalities);
    layout.renderDimensionTable('Kits', report.kits);
    layout.renderInvitations();
    layout.renderStock();
    layout.renderAudit();
    layout.finish();
    doc.end();
  });
}

/** Contagem de páginas (útil para validação). */
export function countPdfPages(buffer: Buffer): number {
  const matches = buffer.toString('latin1').match(/\/Type[\s]*\/Page[^s]/g);
  return matches?.length ?? 0;
}
