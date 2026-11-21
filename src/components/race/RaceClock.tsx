"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { Flag } from "./Flag";
import { beep, flagFor, signalsFor, unlockAudio, useNow, useRaceState, useServerClock, type RaceState } from "./clock";
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

export function RaceClock({ initial, className, official = false }: { initial: RaceState; className: string; official?: boolean }) {
  const { t, intl } = useT();
  const sync = useServerClock();
  const now = useNow(sync?.offset ?? 0);
  const { race, refetch } = useRaceState(initial, official ? 1500 : 2000);
  const router = useRouter();
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

  const act = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); await refetch(); router.refresh(); } finally { setBusy(false); } };
  const clock = new Intl.DateTimeFormat(intl, { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now);
  const kindLabel = (k: string) => (k === "attention" ? t.race.orange : t.race.signals[k as "warning"]);
  const flagName = (code: string) => (code === "CLASS" ? className : code === "ORANGE" ? t.race.orange : code === "BLACK" ? t.race.black : code);
  const hhmm = (ms: number) => new Intl.DateTimeFormat(intl, { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" }).format(ms);
  const minLabel = (m: number) => (m === 0 ? t.race.signals.start : `−${m} min`);
  const prepSig = sigs.find((s) => s.kind === "prep");
  const prepChangeable = official && race.status === "SEQUENCE" && !!prepSig && now < prepSig.at - 3000;
  const changePrep = (f: string) => { setPrep(f); act(() => setPrepFlag(race.id, f)); };
  const devOff = sync ? -sync.offset / 1000 : 0;

  return (
    <div ref={root} className="space-y-4 rounded-2xl bg-sea-900 p-5 text-white shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="rounded-full bg-white/10 px-3 py-1">{t.race.status[race.status as "PLANNED"]}</span>
        <span className="font-mono text-lg tabular-nums" suppressHydrationWarning>{clock}</span>
        <span title={t.race.syncHow} className={`rounded-full px-3 py-1 text-xs ${sync ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"}`}>
          {sync ? `${t.race.clockSync} ±${sync.precision} ms` : "…"}
          {sync && Math.abs(devOff) >= 0.05 && <span className="ml-1 opacity-80">· {(devOff > 0 ? t.race.deviceAhead : t.race.deviceBehind).replace("{s}", Math.abs(devOff).toFixed(1))}</span>}
        </span>
      </div>

      <div className="text-center">
        {startAt && live
          ? <div className="font-mono text-7xl font-bold tabular-nums sm:text-8xl">{fmtCountdown(now - startAt)}</div>
          : <div className="py-6 text-3xl font-bold">{race.status === "FINISHED" ? "🏁 " : ""}{t.race.status[race.status as "PLANNED"]}</div>}
        {startAt && live && <div className="mt-1 text-sm text-sea-200">{now < startAt ? t.race.startIn : t.race.sinceStart} · {t.race.startAt} {new Intl.DateTimeFormat(intl, { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(startAt)}</div>}
      </div>

      <div className="flex min-h-[60px] flex-wrap items-center justify-center gap-4">
        {flags.map((f) => <div key={f.code} className="flex flex-col items-center gap-1"><Flag code={f.code} label={f.label} size={84} /><span className="text-xs text-sea-200">{f.label}</span></div>)}
      </div>

      {next && live && (
        <div className="rounded-xl bg-white/10 p-3 text-center">
          <div className="text-xs uppercase tracking-wide text-sea-200">{t.race.nextSignal}</div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
            {(() => { const f = flagFor(next.kind, race.prepFlag); return <span className="flex items-center gap-2"><Flag code={f.code} label={flagName(f.code)} size={44} /><span className="font-bold">{flagName(f.code)} {f.up ? "↑" : "↓"}</span></span>; })()}
            {next.kind !== "attention" && <span className="text-lg font-semibold">{kindLabel(next.kind)}</span>}
            <span className="text-sm text-sea-200">{minLabel(next.min)} · {hhmm(next.at)}</span>
            <span className="font-mono text-lg tabular-nums">{fmtCountdown(now - next.at).slice(1, 6)}</span>
          </div>
        </div>
      )}

      {startAt && (
        <ol className={`grid grid-cols-2 gap-2 text-xs ${sigs.length > 4 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
          {sigs.map((s) => {
            const f = flagFor(s.kind, race.prepFlag);
            const done = s.at <= now && live;
            return (
              <li key={s.at} className={`flex flex-col gap-1 rounded-lg px-2.5 py-2 ${done ? "bg-white/5 text-sea-200 opacity-60" : next?.at === s.at && live ? "bg-white/20 ring-1 ring-white/40" : "bg-white/10"}`}>
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
        <button className="rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20" onClick={() => { unlockAudio(); if (!sound) beep(60, 1200); setSound(!sound); }}>{sound ? `🔊 ${t.race.sound}` : `🔇 ${t.race.soundOff}`}</button>
        <button className="rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20" onClick={() => root.current?.requestFullscreen?.()}>⛶ {t.race.fullscreen}</button>
      </div>

      {official && (
        <div className="space-y-3 border-t border-white/10 pt-4">
          {!live && race.status !== "FINISHED" && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-sea-200">{t.race.sequence}</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {SEQS.map((q) => (
                    <button key={q} type="button" aria-pressed={seq === q} onClick={() => setSeq(q)}
                      className={`rounded-lg px-3 py-2 text-left text-sm ${seq === q ? "bg-white font-semibold text-sea-900" : "bg-white/10 hover:bg-white/20"}`}>
                      {t.race.sequences[q]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-sea-200">{t.race.prepFlag}</div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {PREP.map((f) => (
                    <button key={f} type="button" aria-pressed={prep === f} onClick={() => setPrep(f)}
                      className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-sm ${prep === f ? "bg-white font-semibold text-sea-900" : "bg-white/10 hover:bg-white/20"}`}>
                      <Flag code={f} label={flagName(f)} size={40} />
                      <span>{flagName(f)}</span>
                      {PREP_RULE[f] && <span className="text-[10px] opacity-70">{PREP_RULE[f]}</span>}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-end justify-center gap-2">
                <div>
                  <label className="mb-1 block text-xs text-sea-200" htmlFor="startat">{t.race.startAt}</label>
                  <input id="startat" type="time" value={at} onChange={(e) => setAt(e.target.value)} className="rounded-lg bg-white px-3 py-2 text-slate-900" />
                </div>
                <button disabled={busy} className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold hover:bg-emerald-600" onClick={() => { unlockAudio(); act(() => startSequence(race.id, at, seq, prep)); }}>
                  ▶ {at ? t.race.startSequence : t.race.startNow}
                </button>
              </div>
            </div>
          )}
          {prepChangeable && (
            <div className="text-center">
              <div className="mb-2 text-xs text-sea-200">{t.race.prepFlag} · {t.race.prepChangeHint}</div>
              <div className="flex flex-wrap justify-center gap-2">
                {PREP.map((f) => (
                  <button key={f} type="button" disabled={busy} aria-pressed={race.prepFlag === f} onClick={() => changePrep(f)}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${race.prepFlag === f ? "bg-white font-semibold text-sea-900" : "bg-white/10 hover:bg-white/20"}`}>
                    <Flag code={f} label={flagName(f)} size={28} />{flagName(f)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {live && (
            <div className="flex flex-wrap justify-center gap-2">
              {now < (startAt ?? 0) && <button disabled={busy} className="rounded-lg bg-white/15 px-3 py-2 hover:bg-white/25" onClick={() => act(() => signal(race.id, "AP"))}>{t.race.postpone}</button>}
              {now >= (startAt ?? 0) && now < (startAt ?? 0) + 4 * 60e3 && <button disabled={busy} className="rounded-lg bg-amber-500 px-3 py-2 font-semibold text-slate-900 hover:bg-amber-400" onClick={() => act(() => signal(race.id, "X1"))}>{t.race.generalRecall}</button>}
              <button disabled={busy} className="rounded-lg bg-white/15 px-3 py-2 hover:bg-white/25" onClick={() => act(() => signal(race.id, "N"))}>{t.race.abandon}</button>
              {now >= (startAt ?? 0) && <button disabled={busy} className="rounded-lg bg-white px-3 py-2 font-semibold text-sea-900 hover:bg-sea-100" onClick={() => act(() => signal(race.id, "FINISH"))}>🏁 {t.race.finishRace}</button>}
            </div>
          )}
          {(race.status === "FINISHED" || race.status === "ABANDONED") && (
            <div className="flex justify-center"><button disabled={busy} className="rounded-lg bg-white/15 px-3 py-2 text-xs hover:bg-white/25" onClick={() => { if (confirm(`${t.race.reset}?`)) act(() => signal(race.id, "RESET")); }}>{t.race.reset}</button></div>
          )}
        </div>
      )}
    </div>
  );
}
