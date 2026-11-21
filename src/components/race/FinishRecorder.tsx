"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { removeFinish, saveEarly, saveFinishes, setCode } from "@/app/manage/races";
import { sendWithRetry, useRaceBroadcast, useServerClock } from "./clock";
import { PENALTY_CODES } from "@/lib/scoring";

type E = { id: string; sailNumber: string | null; skipper: string | null; boatName: string | null };
type F = { entryId: string; finishedAt: string | null; position: number | null; code: string | null };
const EARLY = ["OCS", "UFD", "BFD"];

/** Everything recorded on this device for one race. Kept in localStorage so a reload or a dead spot loses nothing. */
type Desk = {
  early: Record<string, string>; earlyDirty: boolean;
  laps: Record<string, number[]>; lapLog: string[];
  fin: { id: string; at: number }[]; sent: string[];
};

function loadDesk(key: string, finishes: F[]): Desk {
  try { const s = localStorage.getItem(key); if (s) return JSON.parse(s); } catch { /* private mode */ }
  const fin = finishes.filter((f) => f.finishedAt).map((f) => ({ id: f.entryId, at: Date.parse(f.finishedAt!) })).sort((a, b) => a.at - b.at);
  return {
    early: Object.fromEntries(finishes.filter((f) => f.code && EARLY.includes(f.code)).map((f) => [f.entryId, f.code!])), earlyDirty: false,
    laps: {}, lapLog: [], fin, sent: fin.map((f) => f.id),
  };
}

export function FinishRecorder({ raceId, startAt: initialStart, status: initialStatus = "RUNNING", entries, finishes }: { raceId: string; startAt: number | null; status?: string; entries: E[]; finishes: F[] }) {
  const { t, intl } = useT();
  const sync = useServerClock();
  const router = useRouter();
  const [pending, start] = useTransition();
  const { startAt } = useRaceBroadcast(raceId, { startAt: initialStart, status: initialStatus });
  const key = `wrh-desk-${raceId}`;
  const [desk, setDesk] = useState<Desk>(() => ({ early: {}, earlyDirty: false, laps: {}, lapLog: [], fin: [], sent: [] }));
  const loaded = useRef(false);
  useEffect(() => { setDesk(loadDesk(key, finishes)); loaded.current = true; }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded.current) try { localStorage.setItem(key, JSON.stringify(desk)); } catch { /* full or private */ } }, [desk, key]);
  const upd = (fn: (d: Desk) => Desk) => setDesk((d) => fn(d));
  // the start device sends early starters; the finish device picks them up (unless it has its own unsent marks)
  useEffect(() => {
    const pull = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/race/${raceId}?early=1`, { cache: "no-store" });
        if (!r.ok) return;
        const { early } = await r.json() as { early?: Record<string, string> };
        if (early) setDesk((d) => (d.earlyDirty || JSON.stringify(d.early) === JSON.stringify(early) ? d : { ...d, early }));
      } catch { /* offline */ }
    };
    const i = setInterval(pull, 10e3);
    return () => clearInterval(i);
  }, [raceId]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(i); }, []);
  const clock = () => Date.now() + (sync?.offset ?? 0);
  const t0 = now + (sync?.offset ?? 0);
  const started = !!startAt && t0 >= startAt;
  // early starters can be marked from one minute before the start; until 3 min after the start that is the default
  const earlyOpen = !!startAt && t0 >= startAt - 60e3;
  const [modePick, setModePick] = useState<"early" | "laps" | "finish" | null>(null);
  const autoMode = !earlyOpen ? "finish" : startAt && t0 < startAt + 3 * 60e3 ? "early" : desk.fin.length ? "finish" : "laps";
  const mode = !earlyOpen ? "finish" : modePick ?? autoMode;
  const [earlyCode, setEarlyCode] = useState("OCS");
  const [sending, setSending] = useState<"" | "early" | "fin" | "wait">("");
  const [msg, setMsg] = useState("");

  const finished = new Set(desk.fin.map((f) => f.id));
  const coded = new Set(finishes.filter((f) => f.code && !EARLY.includes(f.code)).map((f) => f.entryId)); // DNS, DNF … set on the server
  // boats in lap order: most laps first, then who completed that lap earliest; boats without laps keep sail-number order
  const order = useMemo(() => {
    const lastLap = (id: string) => desk.laps[id]?.[desk.laps[id].length - 1] ?? Infinity;
    return [...entries].sort((a, b) => (desk.laps[b.id]?.length ?? 0) - (desk.laps[a.id]?.length ?? 0) || lastLap(a.id) - lastLap(b.id));
  }, [entries, desk.laps]);
  const unsent = desk.fin.filter((f) => !desk.sent.includes(f.id));

  const tapFinish = (id: string) => upd((d) => ({ ...d, fin: [...d.fin, { id, at: clock() }] }));
  const tapLap = (id: string) => upd((d) => ({ ...d, laps: { ...d.laps, [id]: [...(d.laps[id] ?? []), clock()] }, lapLog: [...d.lapLog, id] }));
  const undoLap = () => upd((d) => {
    const id = d.lapLog[d.lapLog.length - 1]; if (!id) return d;
    return { ...d, laps: { ...d.laps, [id]: d.laps[id].slice(0, -1) }, lapLog: d.lapLog.slice(0, -1) };
  });
  const toggleEarly = (id: string) => upd((d) => {
    const early = { ...d.early }; if (early[id]) delete early[id]; else early[id] = earlyCode;
    return { ...d, early, earlyDirty: true };
  });
  const undoFinish = (id: string) => {
    const wasSent = desk.sent.includes(id);
    upd((d) => ({ ...d, fin: d.fin.filter((f) => f.id !== id), sent: d.sent.filter((x) => x !== id) }));
    if (wasSent) start(async () => {
      await removeFinish(raceId, id);
      if (desk.early[id]) await saveEarly(raceId, desk.early); // removing the finish must not drop the OCS
      router.refresh();
    });
  };

  const sendEarly = async () => {
    setSending("early"); setMsg("");
    try {
      await sendWithRetry(() => saveEarly(raceId, desk.early), (w) => setSending(w ? "wait" : "early"));
      upd((d) => ({ ...d, earlyDirty: false })); setMsg(t.race.earlySent); router.refresh();
    } catch { setMsg(t.race.sendFailed); } finally { setSending(""); }
  };
  const sendFinishes = async () => {
    const batch = unsent.map((f) => ({ entryId: f.id, at: f.at }));
    if (!batch.length) return;
    setSending("fin"); setMsg("");
    try {
      await sendWithRetry(() => saveFinishes(raceId, batch), (w) => setSending(w ? "wait" : "fin"));
      upd((d) => ({ ...d, sent: Array.from(new Set([...d.sent, ...batch.map((b) => b.entryId)])) }));
      setMsg(t.race.finSent.replace("{n}", String(batch.length))); router.refresh();
    } catch { setMsg(t.race.sendFailed); } finally { setSending(""); }
  };

  const byId = new Map(entries.map((e) => [e.id, e]));
  const fmt = (at: number) => {
    const el = startAt ? Math.round((at - startAt) / 1000) : null;
    const tod = new Intl.DateTimeFormat(intl, { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(at);
    return el != null ? `${tod} · ${Math.floor(el / 3600)}:${String(Math.floor((el % 3600) / 60)).padStart(2, "0")}:${String(el % 60).padStart(2, "0")}` : tod;
  };
  const Boat = ({ e, onTap, hot, sub }: { e: E; onTap: () => void; hot?: boolean; sub?: React.ReactNode }) => (
    <button type="button" onClick={onTap} className={`border-2 border-ink px-1 py-3 text-center font-bold text-ink active:scale-95 ${hot ? "bg-accent" : "bg-white active:bg-accent"}`}>
      <span className="block text-lg leading-tight">{e.sailNumber}</span>
      <span className="block truncate text-xs font-normal">{sub ?? e.skipper ?? e.boatName}</span>
    </button>
  );
  const modes = [["early", `${t.race.modeEarly}${Object.keys(desk.early).length ? ` (${Object.keys(desk.early).length})` : ""}`], ["laps", t.race.modeLaps], ["finish", `${t.race.modeFinish}${desk.fin.length ? ` (${desk.fin.length})` : ""}`]] as const;
  let place = 0;

  return (
    <div className="space-y-4">
      {earlyOpen && (
        <div className="grid grid-cols-3 border-2 border-ink text-xs font-semibold uppercase sm:text-sm">
          {modes.map(([m, label]) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setModePick(m)} className={`px-1 py-3 ${mode === m ? "bg-ink text-paper" : "bg-white"}`}>{label}</button>
          ))}
        </div>
      )}

      {mode === "early" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink/70">{t.race.earlyHint}</span>
            {EARLY.map((c) => <button key={c} type="button" onClick={() => setEarlyCode(c)} className={`border-2 border-ink px-3 py-1 text-xs font-bold ${earlyCode === c ? "bg-ink text-paper" : "bg-white"}`}>{c}</button>)}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {entries.map((e) => <Boat key={e.id} e={e} onTap={() => toggleEarly(e.id)} hot={!!desk.early[e.id]} sub={desk.early[e.id]} />)}
          </div>
          <button type="button" disabled={!!sending || !desk.earlyDirty} onClick={sendEarly} className="btn w-full py-4 text-base disabled:opacity-40">
            {sending === "wait" ? t.race.offlineQueued : desk.earlyDirty ? t.race.earlySend.replace("{n}", String(Object.keys(desk.early).length)) : t.race.earlyClear}
          </button>
        </div>
      )}

      {mode === "laps" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-ink/70">{t.race.lapHint}</span>
            <button type="button" onClick={undoLap} disabled={!desk.lapLog.length} className="btn-ghost px-3 py-1 text-xs disabled:opacity-40">↶ {t.race.undo}</button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {order.filter((e) => !finished.has(e.id) && !coded.has(e.id)).map((e) => (
              <Boat key={e.id} e={e} onTap={() => tapLap(e.id)}
                sub={<>{desk.laps[e.id]?.length ? <b>{t.race.lapShort}{desk.laps[e.id].length}</b> : (e.skipper ?? e.boatName)}{desk.early[e.id] ? <b className="text-accent"> {desk.early[e.id]}</b> : null}</>} />
            ))}
          </div>
        </div>
      )}

      {mode === "finish" && (
        <div className="space-y-3">
          <p className="text-sm text-ink/70">{started ? t.race.tapToFinish : t.race.finishAfterStart}</p>
          {started && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {order.filter((e) => !finished.has(e.id) && !coded.has(e.id)).map((e) => (
                <Boat key={e.id} e={e} onTap={() => tapFinish(e.id)}
                  sub={<>{desk.laps[e.id]?.length ? `${t.race.lapShort}${desk.laps[e.id].length} · ` : ""}{desk.early[e.id] ? <b className="text-accent">{desk.early[e.id]}</b> : (e.skipper ?? e.boatName)}</>} />
              ))}
            </div>
          )}
          {desk.fin.length > 0 && (
            <button type="button" disabled={!!sending || !unsent.length} onClick={sendFinishes} className="btn w-full py-4 text-base disabled:opacity-40">
              {sending === "wait" ? t.race.offlineQueued : unsent.length ? t.race.finSend.replace("{n}", String(unsent.length)) : t.race.finAllSent}
            </button>
          )}
        </div>
      )}
      {msg && <p className="text-sm font-semibold">{msg}</p>}

      {desk.fin.length > 0 && (
        <ol className="divide-y divide-ink/10 border border-ink/20 bg-white text-sm">
          {desk.fin.map((f) => {
            const e = byId.get(f.id); const code = desk.early[f.id];
            if (!code) place++;
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="w-8 font-bold">{code ? "–" : place}</span>
                <span className="w-24 font-semibold">{e?.sailNumber}</span>
                <span className="flex-1 text-ink/70">{e?.skipper}</span>
                <span className="font-mono text-xs text-ink/60">{[code, fmt(f.at)].filter(Boolean).join(" · ")}</span>
                {!desk.sent.includes(f.id) && <span className="text-[10px] font-semibold uppercase text-accent">{t.race.notSent}</span>}
                <button className="btn-danger" disabled={pending} onClick={() => undoFinish(f.id)}>{t.race.undo}</button>
              </li>
            );
          })}
        </ol>
      )}

      {entries.some((e) => !finished.has(e.id)) && (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink/60">{t.race.codeHint} (DNS, DNF, …)</summary>
          <ul className="mt-2 space-y-1">
            {entries.filter((e) => !finished.has(e.id)).map((e) => {
              const cur = finishes.find((f) => f.entryId === e.id && f.code && !EARLY.includes(f.code))?.code ?? "";
              return (
                <li key={e.id} className="flex items-center gap-2">
                  <span className="w-24 font-semibold">{e.sailNumber}</span>
                  <select className="input w-28 py-1 text-xs" value={cur} disabled={pending} onChange={(ev) => start(async () => { await setCode(raceId, e.id, ev.target.value); router.refresh(); })}>
                    <option value="">–</option>
                    {PENALTY_CODES.filter((c) => !EARLY.includes(c)).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
