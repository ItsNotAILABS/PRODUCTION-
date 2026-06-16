// pdf.mjs — hand-rolled minimal PDF writer. Zero deps. Produces valid PDF 1.4
// files that open in Acrobat, Preview, Chrome, etc.
//
// Supports: title + subtitle + paragraphs + headings + bullet lists +
// page breaks. Helvetica only (core PDF font, no embedding required).
// Good enough for legal artifacts; not a typesetting engine.

const PAGE_W = 612;   // US Letter, points
const PAGE_H = 792;
const MARGIN = 54;    // 0.75"
const FONT_NORMAL  = 11;
const FONT_HEADING = 14;
const FONT_TITLE   = 18;
const FONT_SUB     = 12;
const LINE         = 1.35;

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Build a PDF buffer from a structured document.
 *
 * doc = {
 *   title:    "MUTUAL NDA",
 *   subtitle: "Effective 2026-06-16",
 *   blocks: [
 *     { type: 'heading', text: '1. Definitions' },
 *     { type: 'paragraph', text: '…' },
 *     { type: 'bullets', items: ['a', 'b', 'c'] },
 *     { type: 'spacer', height: 12 },
 *     { type: 'page' },
 *   ],
 *   footer: 'CONFIDENTIAL · Medina Vault generated 2026-06-16'
 * }
 *
 * Returns a Uint8Array suitable for writeFile or base64 encoding.
 */
export function buildPDF(doc) {
  const pages = []; // each page: array of content lines
  let cur = [];
  let y = PAGE_H - MARGIN;
  let pageNum = 1;

  const lineHeight = (size) => Math.round(size * LINE);
  const wrap = (text, size, maxWidth) => {
    // Approximate character width for Helvetica @ size points.
    const charW = size * 0.5;
    const maxChars = Math.max(20, Math.floor(maxWidth / charW));
    const out = [];
    const paragraphs = String(text).split(/\n+/);
    for (const para of paragraphs) {
      const words = para.split(/\s+/);
      let line = '';
      for (const w of words) {
        if ((line + ' ' + w).trim().length > maxChars) {
          if (line) out.push(line);
          line = w;
        } else line = (line ? line + ' ' : '') + w;
      }
      if (line) out.push(line);
    }
    return out;
  };
  const newPage = () => {
    if (cur.length) pages.push(cur);
    cur = [];
    y = PAGE_H - MARGIN;
    pageNum++;
  };
  const need = (h) => { if (y - h < MARGIN + 24) newPage(); };

  const drawText = (size, font, text, x = MARGIN) => {
    cur.push(`BT /F${font} ${size} Tf ${x} ${y} Td (${esc(text)}) Tj ET`);
  };

  // Title
  if (doc.title) {
    need(lineHeight(FONT_TITLE));
    drawText(FONT_TITLE, 2, doc.title);
    y -= lineHeight(FONT_TITLE);
  }
  if (doc.subtitle) {
    need(lineHeight(FONT_SUB));
    drawText(FONT_SUB, 1, doc.subtitle);
    y -= lineHeight(FONT_SUB) + 8;
  }
  if (doc.title || doc.subtitle) y -= 6;

  const maxW = PAGE_W - MARGIN * 2;

  for (const block of (doc.blocks || [])) {
    switch (block.type) {
      case 'page': newPage(); break;
      case 'spacer': y -= block.height ?? 12; break;
      case 'heading': {
        y -= 8;
        const lines = wrap(block.text, FONT_HEADING, maxW);
        for (const ln of lines) {
          need(lineHeight(FONT_HEADING));
          drawText(FONT_HEADING, 2, ln);
          y -= lineHeight(FONT_HEADING);
        }
        y -= 4;
        break;
      }
      case 'paragraph': {
        const lines = wrap(block.text, FONT_NORMAL, maxW);
        for (const ln of lines) {
          need(lineHeight(FONT_NORMAL));
          drawText(FONT_NORMAL, 1, ln);
          y -= lineHeight(FONT_NORMAL);
        }
        y -= 6;
        break;
      }
      case 'bullets': {
        for (const item of (block.items || [])) {
          const lines = wrap('• ' + item, FONT_NORMAL, maxW - 12);
          for (const ln of lines) {
            need(lineHeight(FONT_NORMAL));
            drawText(FONT_NORMAL, 1, ln, MARGIN + 4);
            y -= lineHeight(FONT_NORMAL);
          }
          y -= 2;
        }
        y -= 4;
        break;
      }
    }
  }
  if (cur.length) pages.push(cur);

  // ── Serialize ─────────────────────────────────────────────────────────
  const objects = [];
  const ref = (n) => `${n} 0 R`;
  const add = (body) => { objects.push(body); return objects.length; };

  const fontHelv      = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const fontHelvBold  = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

  // Build content streams + page objects, then a Pages tree.
  const contentObjIds = [];
  const pageObjIds    = [];
  // We'll fill them in two passes since pages reference Pages via parent.

  // Reserve Pages object id (predicted) — we know object order: contents,
  // pages individually, Pages root, Catalog, footer adornments are inline.
  // Easier: build content streams, build page objects pointing at content
  // streams, build Pages root, build Catalog. Track ids carefully.

  for (const lines of pages) {
    const stream = lines.join('\n');
    const id = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    contentObjIds.push(id);
  }

  // Predict pagesRootId for back-reference in each page.
  const predictedPagesRootId = objects.length + pages.length + 1;

  for (let i = 0; i < pages.length; i++) {
    const id = add(
      `<< /Type /Page /Parent ${ref(predictedPagesRootId)} ` +
      `/MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${ref(fontHelv)} /F2 ${ref(fontHelvBold)} >> >> ` +
      `/Contents ${ref(contentObjIds[i])} >>`
    );
    pageObjIds.push(id);
  }
  const pagesRootId = add(
    `<< /Type /Pages /Count ${pageObjIds.length} ` +
    `/Kids [${pageObjIds.map(ref).join(' ')}] >>`
  );
  // Sanity
  if (pagesRootId !== predictedPagesRootId) {
    throw new Error(`PDF assembly: pagesRootId mismatch ${pagesRootId} vs ${predictedPagesRootId}`);
  }
  const catalogId = add(`<< /Type /Catalog /Pages ${ref(pagesRootId)} >>`);

  // ── Write file bytes ──────────────────────────────────────────────────
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0]; // object 0 is free
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${ref(catalogId)} >>\n`;
  out += `startxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(out, 'binary');
}
