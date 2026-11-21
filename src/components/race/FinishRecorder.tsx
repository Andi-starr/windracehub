"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { recordFinish, removeFinish, setCode } from "@/app/manage/races";
import { useServerClock } from "./clock";
import { PENALTY_CODES } from "@/lib/scoring";

type E = { id: string; sailNumber: string | null; skipper: string | null; boatName: string | null };
type F = { entryId: string; finishedAt: string | null; position: number | null; code: string | null };

export function FinishRecorder({ raceId, startAt, entries, finishes }: { raceId: string; startAt: number | null; entries: E[]; finishes: F[] }) {
  const { t, intl } = useT();
  const sync = useServerClock();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState<string[]>([]);
  const done = new Set([...finishes.map((f) => f.entryId), ...optimistic]);
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
        <p className="mb-2 text-sm text-slate-600">{t.race.tapToFinish}</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {entries.filter((e) => !done.has(e.id)).map((e) => (
            <button key={e.id} onClick={() => tap(e.id)} className="rounded-xl border-2 border-sea-500 bg-white px-2 py-4 text-center font-bold text-sea-900 shadow-sm active:scale-95 active:bg-sea-100">
              <span className="block text-lg">{e.sailNumber}</span>
              <span className="block truncate text-xs font-normal text-slate-500">{e.skipper ?? e.boatName}</span>
            </button>
          ))}
        </div>
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
                <span className="font-mono text-xs text-slate-500">{f.code ?? fmt(f.finishedAt)}</span>
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
