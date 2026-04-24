import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { DocumentInput, DocumentSection } from "@/lib/files/types";

const MARGIN = 72;   // 1 inch
const PAGE_W = 612;  // US Letter
const PAGE_H = 792;
const CONTENT_W = PAGE_W - MARGIN * 2;

const SIZE_BODY = 11;
const SIZE_H1   = 20;
const SIZE_H2   = 16;
const SIZE_H3   = 13;
const LH_BODY   = 17;
const LH_H1     = 28;
const LH_H2     = 22;
const LH_H3     = 19;

interface Ctx {
  doc:         PDFDocument;
  page:        PDFPage;
  regular:     PDFFont;
  bold:        PDFFont;
  y:           number;
}

function addPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y    = PAGE_H - MARGIN;
}

function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN) addPage(ctx);
}

function wrapLines(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words  = text.split(" ");
  const lines: string[] = [];
  let   cur    = "";

  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxW && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function drawText(
  ctx: Ctx,
  text: string,
  font: PDFFont,
  size: number,
  lineHeight: number,
  indent = 0,
): void {
  for (const line of wrapLines(text, font, size, CONTENT_W - indent)) {
    ensureSpace(ctx, lineHeight);
    ctx.page.drawText(line, {
      x: MARGIN + indent,
      y: ctx.y,
      size,
      font,
      color: rgb(0, 0, 0),
    });
    ctx.y -= lineHeight;
  }
}

function drawSection(ctx: Ctx, section: DocumentSection): void {
  switch (section.type) {
    case "heading": {
      const [size, lh, spBefore] =
        section.level === 1 ? [SIZE_H1, LH_H1, 20] :
        section.level === 2 ? [SIZE_H2, LH_H2, 14] :
                              [SIZE_H3, LH_H3, 10];
      ctx.y -= spBefore;
      drawText(ctx, section.text ?? "", ctx.bold, size, lh);
      ctx.y -= 6;
      break;
    }

    case "paragraph": {
      const font = section.bold ? ctx.bold : ctx.regular;
      drawText(ctx, section.text ?? "", font, SIZE_BODY, LH_BODY);
      ctx.y -= 6;
      break;
    }

    case "bullet_list": {
      for (const item of (section.items ?? [])) {
        const lines = wrapLines(item ?? "", ctx.regular, SIZE_BODY, CONTENT_W - 16);
        for (let i = 0; i < lines.length; i++) {
          ensureSpace(ctx, LH_BODY);
          if (i === 0) {
            ctx.page.drawText("•", { x: MARGIN, y: ctx.y, size: SIZE_BODY, font: ctx.bold, color: rgb(0, 0, 0) });
          }
          ctx.page.drawText(lines[i], { x: MARGIN + 14, y: ctx.y, size: SIZE_BODY, font: ctx.regular, color: rgb(0, 0, 0) });
          ctx.y -= LH_BODY;
        }
      }
      ctx.y -= 4;
      break;
    }

    case "numbered_list": {
      const items = section.items ?? [];
      for (let n = 0; n < items.length; n++) {
        const lines = wrapLines(items[n] ?? "", ctx.regular, SIZE_BODY, CONTENT_W - 22);
        for (let i = 0; i < lines.length; i++) {
          ensureSpace(ctx, LH_BODY);
          if (i === 0) {
            ctx.page.drawText(`${n + 1}.`, { x: MARGIN, y: ctx.y, size: SIZE_BODY, font: ctx.bold, color: rgb(0, 0, 0) });
          }
          ctx.page.drawText(lines[i], { x: MARGIN + 20, y: ctx.y, size: SIZE_BODY, font: ctx.regular, color: rgb(0, 0, 0) });
          ctx.y -= LH_BODY;
        }
      }
      ctx.y -= 4;
      break;
    }

    case "table": {
      const headers = section.headers ?? [];
      const rows    = section.rows    ?? [];
      const numCols   = Math.max(headers.length, 1);
      const colWidth  = CONTENT_W / numCols;
      const rowH      = 20;
      const cellSize  = SIZE_BODY - 1;
      const allRows   = [headers, ...rows];

      for (let ri = 0; ri < allRows.length; ri++) {
        ensureSpace(ctx, rowH + 2);
        const row      = allRows[ri] ?? [];
        const isHeader = ri === 0;
        const rowY     = ctx.y - rowH + cellSize;

        for (let ci = 0; ci < numCols; ci++) {
          const x = MARGIN + ci * colWidth;
          if (isHeader) {
            ctx.page.drawRectangle({ x, y: rowY, width: colWidth, height: rowH, color: rgb(0.94, 0.94, 0.94) });
          }
          ctx.page.drawRectangle({ x, y: rowY, width: colWidth, height: rowH, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5 });

          const cellText  = row[ci] ?? "";
          const font      = isHeader ? ctx.bold : ctx.regular;
          const maxChars  = Math.floor((colWidth - 8) / (cellSize * 0.55));
          const display   = cellText.length > maxChars ? `${cellText.slice(0, maxChars - 1)}…` : cellText;
          ctx.page.drawText(display, { x: x + 4, y: ctx.y, size: cellSize, font, color: rgb(0, 0, 0) });
        }
        ctx.y -= rowH;
      }
      ctx.y -= 10;
      break;
    }

    default:
      break;
  }
}

export async function generatePdf(input: DocumentInput): Promise<Buffer> {
  const doc     = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);

  const firstPage = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: Ctx  = { doc, page: firstPage, regular, bold, y: PAGE_H - MARGIN };

  // Title
  drawText(ctx, input.title, bold, SIZE_H1, LH_H1);
  ctx.y -= 4;

  // Rule under title
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end:   { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 0.75,
    color: rgb(0.75, 0.75, 0.75),
  });
  ctx.y -= 14;

  for (const section of input.sections) {
    drawSection(ctx, section);
  }

  return Buffer.from(await doc.save());
}
