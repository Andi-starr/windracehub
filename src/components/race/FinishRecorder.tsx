"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { markEarly, recordFinish, removeFinish, setCode } from "@/app/manage/races";
import { useServerClock } from "./clock";
import { PENALTY_CODES } from "@/lib/scoring";

type E = { id: string; sailNumber: string | null; skipper: string | null; boatName: string | null };
const EARLY = ["OCS", "UFD", "BFD"];
type F = { entryId: string; finishedAt: string | null; position: number | null; code: string | null };

export function FinishRecorder({ raceId, startAt, entries, finishes }: { raceId: string; startAt: number | null; entries: E[]; finishes: F[] }) {
  const { t, intl } = useT();
  const sync = useServerClock();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState<string[]>([]);
  // boats can only finish once the start signal has been made
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(i); }, []);
  const t0 = now + (sync?.offset ?? 0);
  const started = !!startAt && t0 >= startAt;
  // early starters can be marked from one minute before the start; until 3 min after the start that is the default view
  const earlyOpen = !!startAt && t0 >= startAt - 60e3;
  const [modePick, setModePick] = useState<"early" | "finish" | null>(null);
  const mode = !earlyOpen ? "finish" : modePick ?? (startAt && t0 < startAt + 3 * 60e3 ? "early" : "finish");
  const [earlyCode, setEarlyCode] = useState("OCS");
  const earlyOf = new Map(finishes.filter((f) => f.code && EARLY.includes(f.code)).map((f) => [f.entryId, f.code as string]));
  const toggleEarly = (id: string) => start(async () => { await markEarly(raceId, id, earlyOf.has(id) ? "" : earlyCode); router.refresh(); });
  // "done" = has a finish time or a non-start code; boats only marked early (OCS…) can still finish
  const done = new Set([...finishes.filter((f) => f.finishedAt || (f.code && !EARLY.includes(f.code))).map((f) => f.entryId), ...optimistic]);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const fmt = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const el = startAt ? Math.round((d.getTime() - startAt) / 1000) : null;
    const tod = new Intl.DateTimeFormat(intl, { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);
    return el != null ? `${tod} · ${Math.floor(el / 3600)}:${String(Math.floor((el % 3600) / 60)).padStart(2, "0")}:${String(el % 60).padStart(2, "0")}` : tod;
  };
  const tap = (id: string) => {
    const at = Date.now() + (sync?.offset ?? 0);
    setOptimistic((o) => [...o, id]);
    start(async () => { await recordFinish(raceId, id, at); router.refresh(); setOptimistic((o) => o.filter((x) => x !== id)); });
  };
  const ordered = [...finishes].sort((a, b) => (a.code ? 1 : 0) - (b.code ? 1 : 0) || (a.position ?? 0) - (b.position ?? 0));

  return (
    <div className="space-y-4">
      <div>
        {earlyOpen && (
          <div className="mb-3 grid grid-cols-2 border-2 border-ink text-sm font-semibold uppercase">
            <button type="button" aria-pressed={mode === "early"} onClick={() => setModePick("early")} className={`py-3 ${mode === "early" ? "bg-ink text-paper" : "bg-white"}`}>{t.race.modeEarly}{earlyOf.size ? ` (${earlyOf.size})` : ""}</button>
            <button type="button" aria-pressed={mode === "finish"} onClick={() => setModePick("finish")} className={`py-3 ${mode === "finish" ? "bg-ink text-paper" : "bg-white"}`}>{t.race.modeFinish}</button>
          </div>
        )}
        {mode === "early" ? (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-600">{t.race.earlyHint}</span>
              {EARLY.map((c) => <button key={c} type="button" onClick={() => setEarlyCode(c)} className={`border-2 border-ink px-3 py-1 text-xs font-bold ${earlyCode === c ? "bg-ink text-paper" : "bg-white"}`}>{c}</button>)}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {entries.map((e) => {
                const c = earlyOf.get(e.id);
                return (
                  <button key={e.id} disabled={pending} onClick={() => toggleEarly(e.id)} aria-pressed={!!c}
                    className={`rounded-xl border-2 border-ink px-2 py-4 text-center text-lg font-bold active:scale-95 ${c ? "bg-accent text-ink" : "bg-white text-ink"}`}>
                    <span className="block text-lg">{e.sailNumber}</span>
                    <span className="block truncate text-xs font-normal">{c ?? e.skipper ?? e.boatName}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : <>
        <p className="mb-2 text-sm text-slate-600">{started ? t.race.tapToFinish : t.race.finishAfterStart}</p>
        {started && <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {entries.filter((e) => !done.has(e.id)).map((e) => (
            <button key={e.id} onClick={() => tap(e.id)} className="rounded-xl border-2 border-ink bg-white px-2 py-4 text-center text-lg font-bold text-ink active:scale-95 active:bg-accent">
              <span className="block text-lg">{e.sailNumber}</span>
              <span className="block truncate text-xs font-normal text-slate-500">{earlyOf.has(e.id) ? <b className="text-accent">{earlyOf.get(e.id)}</b> : e.skipper ?? e.boatName}</span>
            </button>
          ))}
        </div>}
        </>}
      </div>
      {ordered.length > 0 && (
        <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
          {ordered.map((f) => {
            const e = byId.get(f.entryId);
            return (
              <li key={f.entryId} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="w-8 font-bold text-sea-700">{f.code ? "–" : f.position}</span>
                <span className="w-24 font-semibold">{e?.sailNumber}</span>
                <span className="flex-1 text-slate-600">{e?.skipper}</span>
                <span className="font-mono text-xs text-slate-500">{[f.code, fmt(f.finishedAt)].filter(Boolean).join(" · ")}</span>
                <select aria-label={t.race.codeHint} className="input w-24 py-1 text-xs" value={f.code ?? ""} disabled={pending}
                  onChange={(ev) => start(async () => { await setCode(raceId, f.entryId, ev.target.value || ""); router.refresh(); })}>
                  <option value="">{f.code ? "–" : "✓"}</option>
                  {PENALTY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button className="btn-danger" disabled={pending} onClick={() => start(async () => { await removeFinish(raceId, f.entryId); router.refresh(); })}>{t.race.undo}</button>
              </li>
            );
          })}
        </ol>
      )}
      {entries.filter((e) => !done.has(e.id)).length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500">{t.race.codeHint} (DNS, OCS, …)</summary>
          <ul className="mt-2 space-y-1">
            {entries.filter((e) => !done.has(e.id)).map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <span className="w-24 font-semibold">{e.sailNumber}</span>
                <select className="input w-28 py-1 text-xs" defaultValue="" onChange={(ev) => ev.target.value && start(async () => { await setCode(raceId, e.id, ev.target.value); router.refresh(); })}>
                  <option value="">–</option>
                  {PENALTY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
