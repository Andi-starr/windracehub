"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { Flag } from "./Flag";
import { beep, computeStart, flagFor, sendWithRetry, signalsFor, unlockAudio, useNow, useRaceState, useServerClock, type RaceState } from "./clock";
import { setPrepFlag, signal, startSequence } from "@/app/manage/races";

const SEQS = ["5,4,1,0", "3,2,1,0", "10,5,4,1,0", "6,5,4,1,0"] as const;
const PREP = ["P", "I", "Z", "U", "BLACK"];
const PREP_RULE: Record<string, string> = { P: "", I: "RRS 30.1", Z: "RRS 30.2", U: "RRS 30.3", BLACK: "RRS 30.4" };

function fmtCountdown(ms: number) {
  const neg = ms < 0;
  const a = Math.abs(ms);
  const m = Math.floor(a / 60e3), s = Math.floor((a % 60e3) / 1000), d = Math.floor((a % 1000) / 100);
  return `${neg ? "−" : "+"}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`;
}

export function RaceClock({ initial, className, official = false, compact = false }: { initial: RaceState; className: string; official?: boolean; compact?: boolean }) {
  const { t, intl } = useT();
  const sync = useServerClock();
  const now = useNow(sync?.offset ?? 0);
  const { race, refetch, setLocal, release } = useRaceState(initial, official ? 3000 : 2000);
  const [waiting, setWaiting] = useState(false);
  const [sound, setSound] = useState(false);
  const [at, setAt] = useState("");
  const [seq, setSeq] = useState(initial.sequence);
  const [prep, setPrep] = useState(initial.prepFlag);
  const [busy, setBusy] = useState(false);
  const fired = useRef<Set<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);

  const startAt = race.startAt;
  const sigs = startAt ? signalsFor(race.sequence, startAt) : [];
  const live = race.status === "SEQUENCE" || race.status === "RUNNING";

  // sounds: one per signal (long at preparatory down) + countdown beeps in the last 5 s before each signal
  useEffect(() => {
    if (!sound || !live) return;
    for (const s of sigs) {
      const dt = s.at - now;
      const key = `${race.updatedAt}-${s.at}`;
      if (dt <= 0 && dt > -1000 && !fired.current.has(key)) { fired.current.add(key); beep(s.long ? 1200 : 400, 660); }
      for (let k = 1; k <= 5; k++) {
        const kk = `${key}-${k}`;
        if (dt <= k * 1000 && dt > k * 1000 - 300 && !fired.current.has(kk)) { fired.current.add(kk); beep(80, 1200); }
      }
    }
  }, [now, sound, live, sigs, race.updatedAt]);

  const past = sigs.filter((s) => s.at <= now);
  const next = sigs.find((s) => s.at > now);
  const has = (k: string) => past.some((s) => s.kind === k);
  const flags: { code: string; label: string }[] = [];
  if (live) {
    if (has("attention") && !has("start")) flags.push({ code: "ORANGE", label: "Orange" });
    if (has("warning") && !has("start")) flags.push({ code: "CLASS", label: className });
    if (has("prep") && !has("prepDown")) flags.push({ code: race.prepFlag, label: race.prepFlag });
  } else if (race.note === "AP") flags.push({ code: "AP", label: "AP" });
  else if (race.note === "X1") flags.push({ code: "X1", label: "1st substitute" });
  else if (race.status === "ABANDONED") flags.push({ code: "N", label: "N" });

  // local first: the clock changes at once on this device, the server is told in the background (retrying while offline)
  const act = (fn: () => Promise<unknown>, patch?: Partial<RaceState>) => {
    if (patch) setLocal(patch);
    setBusy(true);
    sendWithRetry(fn, setWaiting).then(() => { release(); refetch(); }).catch(() => {}).finally(() => setBusy(false));
  };
  const begin = (mode: string) => {
    unlockAudio();
    const s = computeStart(mode === "+1" ? "" : mode, seq, now, mode === "+1" ? 1 : 0);
    act(() => startSequence(race.id, mode, seq, prep, s), { status: "SEQUENCE", startAt: s, sequence: seq, prepFlag: prep, note: null });
  };
  const sig = (k: "AP" | "X1" | "N" | "FINISH" | "RESET") => act(() => signal(race.id, k),
    k === "AP" || k === "X1" ? { status: "PLANNED", startAt: null, note: k } : k === "N" ? { status: "ABANDONED", note: "N" } : k === "FINISH" ? { status: "FINISHED" } : { status: "PLANNED", startAt: null, note: null });
  const clock = new Intl.DateTimeFormat(intl, { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now);
  const kindLabel = (k: string) => (k === "attention" ? t.race.orange : t.race.signals[k as "warning"]);
  const flagName = (code: string) => (code === "CLASS" ? className : code === "ORANGE" ? t.race.orange : code === "BLACK" ? t.race.black : code);
  const hhmm = (ms: number) => new Intl.DateTimeFormat(intl, { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" }).format(ms);
  const minLabel = (m: number) => (m === 0 ? t.race.signals.start : `−${m} min`);
  const prepSig = sigs.find((s) => s.kind === "prep");
  const prepChangeable = official && race.status === "SEQUENCE" && !!prepSig && now < prepSig.at - 3000;
  const changePrep = (f: string) => { setPrep(f); act(() => setPrepFlag(race.id, f), { prepFlag: f }); };
  const devOff = sync ? -sync.offset / 1000 : 0;

  return (
    <div ref={root} className="space-y-4 border-2 border-ink bg-accent p-4 text-ink sm:p-5">
      {/* spectators get a minimal view: countdown and the flags that are up; the committee sees the full plan */}
      {official && <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="rounded-full bg-white/45 px-3 py-1 font-semibold">{t.race.status[race.status as "PLANNED"]}</span>
        <span className="font-mono text-lg tabular-nums" suppressHydrationWarning>{clock}</span>
        <span title={t.race.syncHow} className={`rounded-full px-3 py-1 text-xs ${sync ? "bg-ink text-paper" : "bg-white/60 text-ink"}`}>
          {sync ? `${t.race.clockSync} ±${sync.precision} ms` : "…"}
          {sync && Math.abs(devOff) >= 0.05 && <span className="ml-1 opacity-80">· {(devOff > 0 ? t.race.deviceAhead : t.race.deviceBehind).replace("{s}", Math.abs(devOff).toFixed(1))}</span>}
        </span>
        {waiting && <span className="w-full rounded-full bg-white px-3 py-1 text-center text-xs font-semibold">{t.race.offlineQueued}</span>}
      </div>}

      <div className="text-center">
        {startAt && live
          ? <div className={`font-mono ${compact ? "text-6xl" : "text-6xl min-[400px]:text-7xl sm:text-9xl"} font-bold tabular-nums`} suppressHydrationWarning>{fmtCountdown(now - startAt)}</div>
          : <div className="py-6 text-3xl font-bold">{race.status === "FINISHED" ? "🏁 " : ""}{t.race.status[race.status as "PLANNED"]}</div>}
        {startAt && live && <div className="mt-1 text-sm text-ink/75">{now < startAt ? t.race.startIn : t.race.sinceStart} · {t.race.startAt} {new Intl.DateTimeFormat(intl, { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(startAt)}</div>}
      </div>

      <div className="flex min-h-[60px] flex-wrap items-center justify-center gap-4">
        {flags.map((f) => <div key={f.code} className="flex flex-col items-center gap-1"><Flag code={f.code} label={f.label} size={84} /><span className="text-xs text-ink/75">{f.label}</span></div>)}
      </div>

      {official && next && live && (
        <div className="rounded-xl bg-white/60 p-3 text-center">
          <div className="text-xs uppercase tracking-wide text-ink/75">{t.race.nextSignal}</div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
            {(() => { const f = flagFor(next.kind, race.prepFlag); return <span className="flex items-center gap-2"><Flag code={f.code} label={flagName(f.code)} size={44} /><span className="font-bold">{flagName(f.code)} {f.up ? "↑" : "↓"}</span></span>; })()}
            {next.kind !== "attention" && <span className="text-lg font-semibold">{kindLabel(next.kind)}</span>}
            <span className="text-sm text-ink/75">{minLabel(next.min)} · {hhmm(next.at)}</span>
            <span className="font-mono text-lg tabular-nums" suppressHydrationWarning>{fmtCountdown(now - next.at).slice(1, 6)}</span>
          </div>
        </div>
      )}

      {official && startAt && (
        <ol className={`grid grid-cols-2 gap-2 text-xs ${sigs.length > 4 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
          {sigs.map((s) => {
            const f = flagFor(s.kind, race.prepFlag);
            const done = s.at <= now && live;
            return (
              <li key={s.at} className={`flex flex-col gap-1 rounded-lg px-2.5 py-2 ${done ? "bg-white/20 opacity-50" : next?.at === s.at && live ? "bg-white ring-2 ring-ink" : "bg-white/45"}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-bold">{minLabel(s.min)}</span>
                  <span className="font-mono text-sm">{hhmm(s.at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Flag code={f.code} label={flagName(f.code)} size={30} />
                  <span className="font-semibold">{flagName(f.code)} {f.up ? "↑" : "↓"}</span>
                </div>
                <span className={done ? "line-through" : ""}>{kindLabel(s.kind)}</span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap justify-center gap-2 text-sm">
        <button className="rounded-lg bg-white/45 px-3 py-2 hover:bg-white/70" onClick={() => { unlockAudio(); if (!sound) beep(60, 1200); setSound(!sound); }}>{sound ? `🔊 ${t.race.sound}` : `🔇 ${t.race.soundOff}`}</button>
        <button className="rounded-lg bg-white/45 px-3 py-2 hover:bg-white/70" onClick={() => root.current?.requestFullscreen?.()}>⛶ {t.race.fullscreen}</button>
      </div>

      {official && (
        <div className="space-y-3 border-t border-ink/25 pt-4">
          {!live && race.status !== "FINISHED" && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-ink/75">{t.race.sequence}</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {SEQS.map((q) => (
                    <button key={q} type="button" aria-pressed={seq === q} onClick={() => setSeq(q)}
                      className={`rounded-lg px-3 py-2 text-left text-sm ${seq === q ? "bg-ink font-semibold text-paper" : "bg-white/45 hover:bg-white/70"}`}>
                      {t.race.sequences[q]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-ink/75">{t.race.prepFlag}</div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {PREP.map((f) => (
                    <button key={f} type="button" aria-pressed={prep === f} onClick={() => setPrep(f)}
                      className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-sm ${prep === f ? "bg-ink font-semibold text-paper" : "bg-white/45 hover:bg-white/70"}`}>
                      <Flag code={f} label={flagName(f)} size={40} />
                      <span>{flagName(f)}</span>
                      {PREP_RULE[f] && <span className="text-[10px] opacity-70">{PREP_RULE[f]}</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-end justify-center gap-2">
                <div>
                  <label className="mb-1 block text-xs text-ink/75" htmlFor="startat">{t.race.startAt}</label>
                  <input id="startat" type="time" value={at} onChange={(e) => setAt(e.target.value)} className="rounded-lg border-2 border-ink bg-white px-3 py-2 text-ink" />
                </div>
                <button disabled={busy} className="rounded-lg bg-ink px-5 py-3 font-semibold uppercase text-paper hover:bg-ink/85" onClick={() => begin(at)}>
                  ▶ {at ? t.race.startSequence : t.race.startNow}
                </button>
                {!at && (
                  <button disabled={busy} className="rounded-lg border-2 border-ink bg-white px-5 py-3 font-semibold uppercase text-ink hover:bg-white/80" onClick={() => begin("+1")}>
                    ▶ {t.race.startPlus1}
                  </button>
                )}
              </div>
            </div>
          )}
          {prepChangeable && (
            <div className="text-center">
              <div className="mb-2 text-xs text-ink/75">{t.race.prepFlag} · {t.race.prepChangeHint}</div>
              <div className="flex flex-wrap justify-center gap-2">
                {PREP.map((f) => (
                  <button key={f} type="button" disabled={busy} aria-pressed={race.prepFlag === f} onClick={() => changePrep(f)}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${race.prepFlag === f ? "bg-ink font-semibold text-paper" : "bg-white/45 hover:bg-white/70"}`}>
                    <Flag code={f} label={flagName(f)} size={28} />{flagName(f)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {live && (
            <div className="flex flex-wrap justify-center gap-2">
              {now < (startAt ?? 0) && <button disabled={busy} className="rounded-lg bg-white/45 px-3 py-2 font-semibold hover:bg-white/70" onClick={() => sig("AP")}>{t.race.postpone}</button>}
              {now >= (startAt ?? 0) && now < (startAt ?? 0) + 4 * 60e3 && <button disabled={busy} className="rounded-lg bg-white px-3 py-2 font-semibold text-ink ring-2 ring-ink hover:bg-white/80" onClick={() => sig("X1")}>{t.race.generalRecall}</button>}
              <button disabled={busy} className="rounded-lg bg-white/45 px-3 py-2 font-semibold hover:bg-white/70" onClick={() => sig("N")}>{t.race.abandon}</button>
              {now >= (startAt ?? 0) && <button disabled={busy} className="rounded-lg bg-ink px-3 py-2 font-semibold text-paper hover:bg-ink/85" onClick={() => sig("FINISH")}>🏁 {t.race.finishRace}</button>}
            </div>
          )}
          {(race.status === "FINISHED" || race.status === "ABANDONED") && (
            <div className="flex justify-center"><button disabled={busy} className="rounded-lg bg-white/45 px-3 py-2 text-xs hover:bg-white/70" onClick={() => { if (confirm(`${t.race.reset}?`)) sig("RESET"); }}>{t.race.reset}</button></div>
          )}
        </div>
      )}
    </div>
  );
}
