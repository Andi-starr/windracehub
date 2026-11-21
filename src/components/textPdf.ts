import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Standard PDF fonts use WinAnsi: keep Latin-1 + its extras, replace the rest.
const EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const clean = (s: string) =>
  s.replace(/\t/g, "    ").replace(/[‐‑‒]/g, "-").replace(/[≤]/g, "<=").replace(/[≥]/g, ">=")
   .replace(/[^\n\x20-\x7e\xa0-\xff]/g, (c) => (EXTRA.includes(c) ? c : "?"));

/** Plain text → A4 PDF. First line = title, "1 HEADING" / UPPERCASE lines bold. */
export async function textToPdf(text: string, footer: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 56, maxW = W - 2 * M;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };

  const lines = clean(text).replace(/\r/g, "").split("\n");
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const isTitle = idx === 0;
    const isHead = !isTitle && (/^\d+\.?\s+\S/.test(line) && !/^\d+\.\d/.test(line) || (line.length > 3 && line === line.toUpperCase() && /[A-ZÄÖÜÉÈ]/.test(line)));
    const size = isTitle ? 16 : 10.5;
    const font = isTitle || isHead ? bold : reg;
    const lh = size * 1.4;
    if (!line.trim()) { y -= lh * 0.6; return; }
    if (isHead) y -= 4;
    const indent = (/^(\s*)(\d+\.\d+(\.\d+)*|[a-z]\)|-|•)\s/.exec(line)?.[1].length ?? 0) * 3;
    const words = line.trim().split(/\s+/);
    let cur = "";
    const flush = () => {
      if (y < M + lh) newPage();
      page.drawText(cur, { x: M + indent, y, size, font, color: rgb(0.08, 0.1, 0.15) });
      y -= lh; cur = "";
    };
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxW - indent && cur) { flush(); cur = w; } else cur = test;
    }
    if (cur) flush();
    if (isTitle) y -= 6;
  });

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const s = clean(`${footer} · ${i + 1}/${pages.length}`);
    p.drawText(s, { x: M, y: 28, size: 8, font: reg, color: rgb(0.45, 0.5, 0.55) });
  });
  return pdf.save();
}
