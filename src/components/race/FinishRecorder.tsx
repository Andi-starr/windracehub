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
/** One tap, so "undo" can take back exactly the last thing that was done, in any mode. */
type Act = { k: "early"; id: string; prev?: string } | { k: "lap"; id: string } | { k: "fin"; id: string };
type Desk = {
  early: Record<string, string>; earlyDirty: boolean;
  laps: Record<string, number[]>; log: Act[];
  fin: { id: string; at: number }[]; sent: string[];
};

function loadDesk(key: string, finishes: F[]): Desk {
  try { const s = localStorage.getItem(key); if (s) { const d = JSON.parse(s); return { ...d, log: d.log ?? [] }; } } catch { /* private mode */ }
  const fin = finishes.filter((f) => f.finishedAt).map((f) => ({ id: f.entryId, at: Date.parse(f.finishedAt!) })).sort((a, b) => a.at - b.at);
  return {
    early: Object.fromEntries(finishes.filter((f) => f.code && EARLY.includes(f.code)).map((f) => [f.entryId, f.code!])), earlyDirty: false,
    laps: {}, log: [], fin, sent: fin.map((f) => f.id),
  };
}

export function FinishRecorder({ raceId, startAt: initialStart, status: initialStatus = "RUNNING", entries, finishes, role = "both" }: { raceId: string; startAt: number | null; status?: string; entries: E[]; finishes: F[]; role?: "start" | "finish" | "both" }) {
  const { t, intl } = useT();
  const sync = useServerClock();
  const router = useRouter();
  const [pending, start] = useTransition();
  const { startAt } = useRaceBroadcast(raceId, { startAt: initialStart, status: initialStatus });
  const key = `wrh-desk-${raceId}`;
  const [desk, setDesk] = useState<Desk>(() => ({ early: {}, earlyDirty: false, laps: {}, log: [], fin: [], sent: [] }));
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
  // start device: early starters only; finish device: laps and finish only
  const allowed = role === "start" ? ["early"] : role === "finish" ? ["laps", "finish"] : ["early", "laps", "finish"];
  const pickMode = !earlyOpen ? (role === "start" ? "early" : "finish") : modePick ?? autoMode;
  const mode = allowed.includes(pickMode) ? pickMode : role === "finish" ? (desk.fin.length ? "finish" : "laps") : "early";
  const [earlyCode, setEarlyCode] = useState("OCS");
  const [sending, setSending] = useState<"" | "early" | "fin" | "wait">("");
  const [msg, setMsg] = useState("");

  const byIdEarly = new Map(entries.map((e) => [e.id, e]));
  const finished = new Set(desk.fin.map((f) => f.id));
  const coded = new Set(finishes.filter((f) => f.code && !EARLY.includes(f.code)).map((f) => f.entryId)); // DNS, DNF … set on the server
  // boats in lap order: most laps first, then who completed that lap earliest; boats without laps keep sail-number order
  const order = useMemo(() => {
    const lastLap = (id: string) => desk.laps[id]?.[desk.laps[id].length - 1] ?? Infinity;
    return [...entries].sort((a, b) => (desk.laps[b.id]?.length ?? 0) - (desk.laps[a.id]?.length ?? 0) || lastLap(a.id) - lastLap(b.id));
  }, [entries, desk.laps]);
  // lap mode: boats that already came by on the leader's current lap turn dark, the ones still to come stay white
  const maxLap = Math.max(0, ...Object.values(desk.laps).map((a) => a.length));
  const lapDone = (id: string) => maxLap > 0 && (desk.laps[id]?.length ?? 0) >= maxLap;
  const unsent = desk.fin.filter((f) => !desk.sent.includes(f.id));

  const tapFinish = (id: string) => upd((d) => d.fin.some((f) => f.id === id) ? d : ({ ...d, fin: [...d.fin, { id, at: clock() }], log: [...d.log, { k: "fin", id }] }));
  const tapLap = (id: string) => upd((d) => ({ ...d, laps: { ...d.laps, [id]: [...(d.laps[id] ?? []), clock()] }, log: [...d.log, { k: "lap", id }] }));
  /** Take back exactly the last tap (in the current mode). */
  const undoLast = () => {
    const last = [...desk.log].reverse().find((a) => modeOf(a) === mode);
    if (!last) return;
    const idx = desk.log.lastIndexOf(last);
    if (last.k === "fin") { undoFinish(last.id); return; }
    upd((d) => {
      const log = d.log.filter((_, i) => i !== idx);
      if (last.k === "lap") return { ...d, log, laps: { ...d.laps, [last.id]: (d.laps[last.id] ?? []).slice(0, -1) } };
      const early = { ...d.early }; if (last.prev) early[last.id] = last.prev; else delete early[last.id];
      return { ...d, log, early, earlyDirty: true };
    });
  };
  const modeOf = (a: Act) => (a.k === "early" ? "early" : a.k === "lap" ? "laps" : "finish");
  const lastAct = [...desk.log].reverse().find((a) => modeOf(a) === mode);
  const lastLabel = lastAct ? `${byIdEarly.get(lastAct.id)?.sailNumber ?? ""}${lastAct.k === "early" ? ` ${desk.early[lastAct.id] ?? "–"}` : lastAct.k === "lap" ? ` ${t.race.lapShort}${desk.laps[lastAct.id]?.length ?? 0}` : ""}` : "";
  /** Swap a finish with the one before it (wrong order tapped). Times stay in place, the boats change slots. */
  const moveUp = (i: number) => upd((d) => {
    if (i < 1) return d;
    const fin = d.fin.map((f) => ({ ...f }));
    const a = fin[i - 1].id; fin[i - 1].id = fin[i].id; fin[i].id = a;
    return { ...d, fin, sent: d.sent.filter((x) => x !== fin[i].id && x !== fin[i - 1].id) };
  });
  const toggleEarly = (id: string) => upd((d) => {
    const prev = d.early[id];
    const early = { ...d.early }; if (prev) delete early[id]; else early[id] = earlyCode;
    return { ...d, early, earlyDirty: true, log: [...d.log, { k: "early", id, prev }] };
  });
  const undoFinish = (id: string) => {
    const wasSent = desk.sent.includes(id);
    upd((d) => ({ ...d, fin: d.fin.filter((f) => f.id !== id), sent: d.sent.filter((x) => x !== id), log: d.log.filter((x) => !(x.k === "fin" && x.id === id)) }));
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
  // a plain render function (not a component), so a tap doesn't remount the button; no :active colour that can stick on phones
  const boat = (e: E, onTap: () => void, hot?: boolean | "done", sub?: React.ReactNode) => (
    <button key={e.id} type="button" onClick={onTap} aria-pressed={!!hot} data-done={hot === "done" || undefined}
      className={`border-2 border-ink px-1 py-3 text-center font-bold transition-transform active:scale-95 ${hot === "done" ? "bg-ink text-paper" : hot ? "bg-accent text-ink" : "bg-white text-ink"}`}>
      <span className="block text-lg leading-tight">{e.sailNumber}</span>
      <span className="block truncate text-xs font-normal">{sub ?? e.skipper ?? e.boatName}</span>
    </button>
  );
  const undoBar = (
    <button type="button" onClick={undoLast} disabled={!lastAct} className="btn-ghost w-full py-3 text-sm disabled:opacity-30">
      ↶ {t.race.undo}{lastAct ? `: ${lastLabel}` : ""}
    </button>
  );
  const modes = [["early", `${t.race.modeEarly}${Object.keys(desk.early).length ? ` (${Object.keys(desk.early).length})` : ""}`], ["laps", t.race.modeLaps], ["finish", `${t.race.modeFinish}${desk.fin.length ? ` (${desk.fin.length})` : ""}`]] as const;
  let place = 0;

  return (
    <div className="space-y-4">
      {earlyOpen && allowed.length > 1 && (
        <div className={`grid ${allowed.length === 2 ? "grid-cols-2" : "grid-cols-3"} border-2 border-ink text-xs font-semibold uppercase sm:text-sm`}>
          {modes.filter(([m]) => allowed.includes(m)).map(([m, label]) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setModePick(m)} className={`px-1 py-3 ${mode === m ? "bg-ink text-paper" : "bg-white"}`}>{label}</button>
          ))}
        </div>
      )}

      {mode === "early" && !earlyOpen && <p className="text-sm text-ink/70">{t.race.earlyFrom}</p>}
      {mode === "early" && earlyOpen && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink/70">{t.race.earlyHint}</span>
            {EARLY.map((c) => <button key={c} type="button" onClick={() => setEarlyCode(c)} className={`border-2 border-ink px-3 py-1 text-xs font-bold ${earlyCode === c ? "bg-ink text-paper" : "bg-white"}`}>{c}</button>)}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {entries.map((e) => boat(e, () => toggleEarly(e.id), !!desk.early[e.id], desk.early[e.id]))}
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
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {order.filter((e) => !finished.has(e.id) && !coded.has(e.id)).map((e) => (
              boat(e, () => tapLap(e.id), lapDone(e.id) ? "done" : false, <>{desk.laps[e.id]?.length ? <b>{t.race.lapShort}{desk.laps[e.id].length}</b> : (e.skipper ?? e.boatName)}{desk.early[e.id] ? <b className={lapDone(e.id) ? "" : "text-accent"}> {desk.early[e.id]}</b> : null}</>)
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
                boat(e, () => tapFinish(e.id), false, <>{desk.laps[e.id]?.length ? `${t.race.lapShort}${desk.laps[e.id].length} · ` : ""}{desk.early[e.id] ? <b className="text-accent">{desk.early[e.id]}</b> : (e.skipper ?? e.boatName)}</>)
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
      {earlyOpen && (mode !== "finish" || started) && undoBar}
      {msg && <p className="text-sm font-semibold">{msg}</p>}

      {desk.fin.length > 0 && (
        <ol className="divide-y divide-ink/10 border border-ink/20 bg-white text-sm">
          {desk.fin.map((f, i) => {
            const e = byId.get(f.id); const code = desk.early[f.id];
            if (!code) place++;
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="w-8 font-bold">{code ? "–" : place}</span>
                <span className="w-24 font-semibold">{e?.sailNumber}</span>
                <span className="flex-1 text-ink/70">{e?.skipper}</span>
                <span className="font-mono text-xs text-ink/60">{[code, fmt(f.at)].filter(Boolean).join(" · ")}</span>
                {!desk.sent.includes(f.id) && <span className="text-[10px] font-semibold uppercase text-accent">{t.race.notSent}</span>}
                {i > 0 && <button type="button" className="btn-ghost px-2 py-1 text-xs" title={t.race.moveUp} onClick={() => moveUp(i)}>↑</button>}
                <button className="btn-danger" disabled={pending} onClick={() => undoFinish(f.id)}>{t.common.remove}</button>
              </li>
            );
          })}
        </ol>
      )}

      {role !== "start" && entries.some((e) => !finished.has(e.id)) && (
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
