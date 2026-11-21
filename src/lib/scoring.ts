// Low point scoring (RRS Appendix A, simplified):
// place = points; DNC/DNS/OCS/DNF/RET/DSQ/BFD/UFD = entries in series + 1.
// Optional yardstick handicap: corrected = elapsed * 100 / handicap.
// Discards rule "4:1,8:2" = 1 discard from 4 races, 2 from 8.

export type SEntry = { id: string; sailNumber: string | null; boatName: string | null; skipper: string | null; club: string | null; handicap: number | null };
export type SFinish = { entryId: string; finishedAt: Date | null; position: number | null; code: string | null };
export type SRace = { id: string; number: number; startAt: Date | null; status: string; finishes: SFinish[] };

export const PENALTY_CODES = ["DNC", "DNS", "OCS", "DNF", "RET", "DSQ", "BFD", "UFD"] as const;

export function discardsFor(rule: string | null | undefined, races: number) {
  let n = 0;
  for (const part of (rule ?? "").split(",")) {
    const [from, d] = part.split(":").map(Number);
    if (races >= from && d > n) n = d;
  }
  return Math.min(n, Math.max(0, races - 1));
}

type Cell = { pts: number; label: string; discarded?: boolean; time?: number };

export function scoreRace(race: SRace, entries: SEntry[]): Map<string, Cell> {
  const penalty = entries.length + 1;
  const byEntry = new Map(race.finishes.map((f) => [f.entryId, f]));
  const useHandicap = entries.some((e) => e.handicap) && !!race.startAt;
  const finishers = entries
    .map((e) => {
      const f = byEntry.get(e.id);
      if (!f || f.code) return null;
      const elapsed = f.finishedAt && race.startAt ? (f.finishedAt.getTime() - race.startAt.getTime()) / 1000 : null;
      const corrected = useHandicap && elapsed != null ? (elapsed * 100) / (e.handicap || 100) : null;
      return { e, f, elapsed, corrected };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => {
      if (useHandicap && a.corrected != null && b.corrected != null) return a.corrected - b.corrected;
      const pa = a.f.position ?? Infinity, pb = b.f.position ?? Infinity;
      if (pa !== pb) return pa - pb;
      return (a.f.finishedAt?.getTime() ?? Infinity) - (b.f.finishedAt?.getTime() ?? Infinity);
    });
  const out = new Map<string, Cell>();
  finishers.forEach((x, i) => {
    // equal corrected times share the place
    const prev = i > 0 ? finishers[i - 1] : null;
    const tied = prev && useHandicap && prev.corrected != null && x.corrected != null && Math.abs(prev.corrected - x.corrected) < 0.5;
    const pts = tied ? out.get(prev!.e.id)!.pts : i + 1;
    out.set(x.e.id, { pts, label: String(pts), time: x.corrected ?? x.elapsed ?? undefined });
  });
  for (const e of entries) {
    if (out.has(e.id)) continue;
    const f = byEntry.get(e.id);
    const code = f?.code || (race.status === "FINISHED" ? "DNC" : null);
    if (code) out.set(e.id, { pts: penalty, label: `${penalty} ${code}` });
  }
  return out;
}

export function scoreSeries(races: SRace[], entries: SEntry[], discardRule: string | null | undefined) {
  const scored = races.filter((r) => r.status !== "ABANDONED" && r.finishes.length > 0).sort((a, b) => a.number - b.number);
  const cells = scored.map((r) => scoreRace(r, entries));
  const nDiscard = discardsFor(discardRule, scored.length);
  const penalty = entries.length + 1;
  const rows = entries.map((e) => {
    const c = cells.map((m) => m.get(e.id) ?? { pts: penalty, label: `${penalty} DNC` });
    const order = c.map((x, i) => [x.pts, i] as const).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    order.slice(0, nDiscard).forEach(([, i]) => (c[i] = { ...c[i], discarded: true }));
    const total = c.reduce((s, x) => s + x.pts, 0);
    const net = c.reduce((s, x) => s + (x.discarded ? 0 : x.pts), 0);
    return { e, c, total, net };
  });
  // ties: compare sorted kept scores (A8.1), then last race (A8.2)
  rows.sort((a, b) => {
    if (a.net !== b.net) return a.net - b.net;
    const sa = a.c.filter((x) => !x.discarded).map((x) => x.pts).sort((x, y) => x - y);
    const sb = b.c.filter((x) => !x.discarded).map((x) => x.pts).sort((x, y) => x - y);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i];
    for (let i = a.c.length - 1; i >= 0; i--) if (a.c[i].pts !== b.c[i].pts) return a.c[i].pts - b.c[i].pts;
    return 0;
  });
  return { races: scored, rows, nDiscard };
}

export function seriesTable(s: ReturnType<typeof scoreSeries>, labels: { rank: string; sailNo: string; boat: string; skipper: string; club: string; total: string; net: string }) {
  const headers = [labels.rank, labels.sailNo, labels.boat, labels.skipper, labels.club, ...s.races.map((r) => `R${r.number}`), labels.total, labels.net];
  const rows = s.rows.map((r, i) => {
    return [
      String(i + 1), r.e.sailNumber ?? "", r.e.boatName ?? "", r.e.skipper ?? "", r.e.club ?? "",
      ...r.c.map((x) => (x.discarded ? `(${x.label})` : x.label)), String(r.total), String(r.net),
    ];
  });
  return { headers, rows };
}
