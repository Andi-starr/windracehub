import Papa from "papaparse";

export type Table = { headers: string[]; rows: string[][] };

const ENT: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", szlig: "ß", ndash: "–", mdash: "—", deg: "°",
};
// letter + accent entities: &uuml; &eacute; &Agrave; &ccedil; &oslash; &aring; ...
const ACC: Record<string, string> = { uml: "\u0308", acute: "\u0301", grave: "\u0300", circ: "\u0302", tilde: "\u0303", cedil: "\u0327", ring: "\u030A" };
function named(e: string) {
  if (ENT[e.toLowerCase()]) return ENT[e.toLowerCase()];
  const m = e.match(/^([a-zA-Z])(uml|acute|grave|circ|tilde|cedil|ring)$/);
  if (m) return (m[1] + ACC[m[2]]).normalize("NFC");
  if (e === "oslash") return "ø";
  if (e === "Oslash") return "Ø";
  return null;
}
function decode(s: string) {
  return s
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return named(e) ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** Picks the largest <table> in an HTML document (e.g. a Sailwave export). */
export function parseHtmlTable(html: string): Table | null {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  let best: string[][] = [];
  for (const t of tables) {
    const rows = (t.match(/<tr[\s\S]*?<\/tr>/gi) ?? [])
      .map((tr) => (tr.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) ?? []).map((c) => decode(c.replace(/<[^>]+>/g, " "))))
      .filter((r) => r.some((c) => c));
    if (rows.length > best.length) best = rows;
  }
  return best.length ? normalize(best) : null;
}

/** CSV, semicolon-CSV (Swiss Excel) or tab-separated text pasted from Excel. */
export function parseDelimited(text: string): Table | null {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const res = Papa.parse<string[]>(text.trim(), { delimiter, skipEmptyLines: true });
  const rows = res.data.map((r) => r.map((c) => (c ?? "").toString().trim()));
  return rows.length ? normalize(rows) : null;
}

export function parseResults(text: string): Table | null {
  return /<table/i.test(text) ? parseHtmlTable(text) : parseDelimited(text);
}

function normalize(rows: string[][]): Table {
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
  const [headers, ...rest] = rows.map(pad);
  // drop columns that are empty everywhere
  const keep = headers.map((_, i) => rows.some((r) => (r[i] ?? "") !== ""));
  return {
    headers: headers.filter((_, i) => keep[i]),
    rows: rest.map((r) => r.filter((_, i) => keep[i])),
  };
}
