const TZ = "Europe/Zurich";

export function fmtDate(d: Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Intl.DateTimeFormat("de-CH", { timeZone: "UTC", ...opts }).format(d);
}

export function fmtRange(a: Date, b: Date) {
  const same = a.getTime() === b.getTime();
  if (same) return fmtDate(a, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  return sameMonth
    ? `${a.getUTCDate()}.–${fmtDate(b)}`
    : `${fmtDate(a, { day: "numeric", month: "short" })} – ${fmtDate(b)}`;
}

export function fmtDateTime(d: Date) {
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

export function fmtTime(d: Date) {
  return new Intl.DateTimeFormat("de-CH", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
}

export function fmtSize(n: number) {
  return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
}

/** "2026-05-14" -> Date at UTC midnight (event dates are calendar days). */
export function parseDay(s: string) {
  return new Date(`${s}T00:00:00Z`);
}
export function toDayInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** "2026-05-14T10:30" in Zurich local time -> Date */
export function parseZurichLocal(s: string) {
  const guess = new Date(`${s}:00Z`);
  const offsetMin = zurichOffset(guess);
  return new Date(guess.getTime() - offsetMin * 60000);
}
export function toZurichInput(d: Date) {
  return new Date(d.getTime() + zurichOffset(d) * 60000).toISOString().slice(0, 16);
}
function zurichOffset(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" }).formatToParts(d);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const m = tz.match(/GMT([+-]\d+)(?::(\d+))?/);
  return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] ?? 0) : 60;
}

export function slugify(s: string) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export const DOC_TYPES = {
  NOR: "Ausschreibung (NoR)",
  SI: "Segelanweisungen (SI)",
  AMENDMENT: "Änderung",
  NOTICE: "Mitteilung",
  PROTEST: "Protest / Entscheid",
  OTHER: "Weiteres",
} as const;
