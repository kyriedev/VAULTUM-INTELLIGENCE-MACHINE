import type { VaultumReportDocument, VaultumReportSection, VaultumReportTable } from './_builder';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 44;
const TOP_MARGIN = 96;
const BOTTOM_MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN_X * 2);

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(value: string, fontSize: number, width = CONTENT_WIDTH): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const maxChars = Math.max(18, Math.floor(width / Math.max(fontSize * 0.52, 1)));
  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      return;
    }
    current = next;
  });

  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

type PdfPage = {
  commands: string[];
};

class PdfWriter {
  readonly pages: PdfPage[] = [];

  addPage(): PdfPage {
    const page: PdfPage = { commands: [] };
    this.pages.push(page);
    return page;
  }

  fillRect(page: PdfPage, x: number, yTop: number, width: number, height: number, gray: number): void {
    const yBottom = PAGE_HEIGHT - yTop - height;
    page.commands.push(`${gray.toFixed(3)} g ${x.toFixed(2)} ${yBottom.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
  }

  line(page: PdfPage, x1: number, y1Top: number, x2: number, y2Top: number, gray = 0.75, width = 0.6): void {
    const y1 = PAGE_HEIGHT - y1Top;
    const y2 = PAGE_HEIGHT - y2Top;
    page.commands.push(`${gray.toFixed(3)} G ${width.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  text(page: PdfPage, x: number, yTop: number, value: string, fontSize = 10, bold = false, gray = 0.08): void {
    const y = PAGE_HEIGHT - yTop;
    const font = bold ? 'F2' : 'F1';
    page.commands.push(`BT /${font} ${fontSize.toFixed(2)} Tf ${gray.toFixed(3)} g 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(value)}) Tj ET`);
  }

  build(): Uint8Array {
    const objects: Array<string | null> = [];
    objects[1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    objects[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
    objects[3] = null;

    let nextId = 4;
    const pageIds: number[] = [];

    this.pages.forEach((page) => {
      const pageId = nextId++;
      const contentId = nextId++;
      pageIds.push(pageId);
      const stream = page.commands.join('\n');
      objects[pageId] = `<< /Type /Page /Parent 3 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 1 0 R /F2 2 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`;
    });

    const catalogId = nextId++;
    objects[3] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
    objects[catalogId] = '<< /Type /Catalog /Pages 3 0 R >>';

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];
    for (let id = 1; id < objects.length; id += 1) {
      const object = objects[id];
      if (!object) continue;
      offsets[id] = Buffer.byteLength(pdf, 'utf8');
      pdf += `${id} 0 obj\n${object}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length}\n`;
    pdf += '0000000000 65535 f \n';
    for (let id = 1; id < objects.length; id += 1) {
      const offset = offsets[id] ?? 0;
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new Uint8Array(Buffer.from(pdf, 'utf8'));
  }
}

function drawHeader(writer: PdfWriter, page: PdfPage, doc: VaultumReportDocument): void {
  writer.fillRect(page, MARGIN_X, 28, CONTENT_WIDTH, 50, 0.92);
  writer.text(page, MARGIN_X + 14, 48, 'VAULTUM INTELLIGENCE', 9.5, true, 0.12);
  writer.text(page, MARGIN_X + 14, 66, doc.title, 16, true, 0.1);
  writer.text(page, PAGE_WIDTH - MARGIN_X - 170, 48, doc.coveredLabel, 9.5, false, 0.2);
  writer.text(page, PAGE_WIDTH - MARGIN_X - 170, 64, `Ready ${doc.readyLocalLabel} | ${doc.timezoneLabel}`, 8.5, false, 0.3);
  writer.line(page, MARGIN_X, 84, PAGE_WIDTH - MARGIN_X, 84, 0.78, 0.8);
}

function drawFooter(writer: PdfWriter, page: PdfPage, pageNumber: number, doc: VaultumReportDocument): void {
  writer.line(page, MARGIN_X, PAGE_HEIGHT - BOTTOM_MARGIN + 6, PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - BOTTOM_MARGIN + 6, 0.82, 0.6);
  writer.text(page, MARGIN_X, PAGE_HEIGHT - BOTTOM_MARGIN + 24, doc.sourceLabel, 7.5, false, 0.45);
  writer.text(page, PAGE_WIDTH - MARGIN_X - 40, PAGE_HEIGHT - BOTTOM_MARGIN + 24, `Page ${pageNumber}`, 8, false, 0.45);
}

function drawBullets(writer: PdfWriter, page: PdfPage, y: number, bullets: string[]): number {
  let cursor = y;
  bullets.forEach((bullet) => {
    const lines = wrapText(bullet, 10, CONTENT_WIDTH - 20);
    lines.forEach((line, index) => {
      writer.text(page, MARGIN_X + (index === 0 ? 12 : 18), cursor, index === 0 ? `• ${line}` : line, 10, false, 0.12);
      cursor += 14;
    });
    cursor += 2;
  });
  return cursor;
}

function trimCell(value: string, max = 42): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function drawTable(writer: PdfWriter, page: PdfPage, y: number, table: VaultumReportTable): number {
  const widths = table.headers.length === 4
    ? [118, 184, 96, 105]
    : table.headers.length === 3
      ? [170, 210, 125]
      : new Array(table.headers.length).fill(Math.floor(CONTENT_WIDTH / Math.max(table.headers.length, 1)));
  let cursor = y;
  writer.fillRect(page, MARGIN_X, cursor - 10, CONTENT_WIDTH, 22, 0.93);
  let x = MARGIN_X + 8;
  table.headers.forEach((header, index) => {
    writer.text(page, x, cursor + 5, header, 9.5, true, 0.1);
    x += widths[index] ?? 100;
  });
  cursor += 22;

  table.rows.slice(0, 9).forEach((row) => {
    writer.line(page, MARGIN_X, cursor - 2, PAGE_WIDTH - MARGIN_X, cursor - 2, 0.88, 0.4);
    let colX = MARGIN_X + 8;
    row.forEach((cell, index) => {
      writer.text(page, colX, cursor + 9, trimCell(String(cell ?? '')), 8.8, false, 0.16);
      colX += widths[index] ?? 100;
    });
    cursor += 18;
  });
  return cursor + 8;
}

function estimateSectionHeight(section: VaultumReportSection): number {
  const leadLines = wrapText(section.lead, 10.5).length;
  const bulletLines = Math.max(1, section.bullets.reduce((sum, bullet) => sum + wrapText(bullet, 10, CONTENT_WIDTH - 20).length, 0));
  const tableHeight = section.table ? (32 + Math.min(section.table.rows.length, 9) * 18) : 0;
  return 30 + (leadLines * 14) + (bulletLines * 16) + tableHeight + 18;
}

export function buildVaultumPdfBytes(doc: VaultumReportDocument): Uint8Array {
  const writer = new PdfWriter();
  let page = writer.addPage();
  let pageNumber = 1;
  let cursor = TOP_MARGIN;

  const startPage = (): void => {
    drawHeader(writer, page, doc);
  };

  const newPage = (): void => {
    drawFooter(writer, page, pageNumber, doc);
    page = writer.addPage();
    pageNumber += 1;
    cursor = TOP_MARGIN;
    drawHeader(writer, page, doc);
  };

  startPage();

  writer.text(page, MARGIN_X, cursor, doc.subtitle, 11, false, 0.28);
  cursor += 20;
  writer.text(page, MARGIN_X, cursor, `Market ${doc.market} | Timeframe ${doc.timeframe.toUpperCase()} | Generated ${doc.generatedAt.slice(0, 16).replace('T', ' ')}`, 8.8, false, 0.3);
  cursor += 22;

  writer.fillRect(page, MARGIN_X, cursor - 6, CONTENT_WIDTH, 42, 0.96);
  doc.executiveSummary.forEach((line, index) => {
    writer.text(page, MARGIN_X + 12, cursor + (index * 12), trimCell(line, 112), index === 0 ? 10.5 : 9, index === 0, 0.12);
  });
  cursor += 54;

  doc.sections.forEach((section) => {
    const sectionHeight = estimateSectionHeight(section);
    if (cursor + sectionHeight > PAGE_HEIGHT - BOTTOM_MARGIN - 10) {
      newPage();
    }

    writer.text(page, MARGIN_X, cursor, section.title, 13, true, 0.08);
    cursor += 18;
    wrapText(section.lead, 10.5).forEach((line) => {
      writer.text(page, MARGIN_X, cursor, line, 10.5, false, 0.14);
      cursor += 14;
    });
    cursor += 8;
    cursor = drawBullets(writer, page, cursor, section.bullets.slice(0, 6));
    if (section.table) {
      cursor = drawTable(writer, page, cursor, section.table);
    }
    cursor += 10;
  });

  if (doc.warnings.length) {
    if (cursor + 90 > PAGE_HEIGHT - BOTTOM_MARGIN - 10) newPage();
    writer.text(page, MARGIN_X, cursor, 'Warnings And Caveats', 12.5, true, 0.08);
    cursor += 18;
    cursor = drawBullets(writer, page, cursor, doc.warnings.slice(0, 6));
    cursor += 10;
  }

  if (doc.appendix.length) {
    if (cursor + 110 > PAGE_HEIGHT - BOTTOM_MARGIN - 10) newPage();
    writer.text(page, MARGIN_X, cursor, 'Source Appendix', 12.5, true, 0.08);
    cursor += 18;
    cursor = drawBullets(writer, page, cursor, doc.appendix.slice(0, 8));
  }

  drawFooter(writer, page, pageNumber, doc);
  return writer.build();
}
