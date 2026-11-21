"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { Flag } from "./Flag";
import { beep, signalsFor, unlockAudio, useNow, useRaceState, useServerClock, type RaceState } from "./clock";
import { signal, startSequence } from "@/app/manage/races";

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
  const kindLabel = (k: string) => (k === "attention" ? "Orange" : t.race.signals[k as "warning"]);

  return (
    <div ref={root} className="space-y-4 rounded-2xl bg-sea-900 p-5 text-white shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="rounded-full bg-white/10 px-3 py-1">{t.race.status[race.status as "PLANNED"]}</span>
        <span className="font-mono text-lg tabular-nums">{clock}</span>
        <span className={`rounded-full px-3 py-1 text-xs ${sync ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"}`}>
          {sync ? `${t.race.clockSync} ±${sync.precision} ms` : "…"}
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
          <div className="text-lg font-semibold">{kindLabel(next.kind)} · <span className="font-mono tabular-nums">{fmtCountdown(now - next.at).slice(1, 6)}</span></div>
        </div>
      )}

      {startAt && (
        <ol className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {sigs.map((s) => (
            <li key={s.at} className={`rounded-lg px-2 py-1.5 ${s.at <= now && live ? "bg-white/5 text-sea-200 line-through" : "bg-white/10"}`}>
              <span className="font-mono">{new Intl.DateTimeFormat(intl, { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" }).format(s.at)}</span> {kindLabel(s.kind)}
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap justify-center gap-2 text-sm">
        <button className="rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20" onClick={() => { unlockAudio(); if (!sound) beep(60, 1200); setSound(!sound); }}>{sound ? `🔊 ${t.race.sound}` : `🔇 ${t.race.soundOff}`}</button>
        <button className="rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20" onClick={() => root.current?.requestFullscreen?.()}>⛶ {t.race.fullscreen}</button>
      </div>

      {official && (
        <div className="space-y-3 border-t border-white/10 pt-4">
          {!live && race.status !== "FINISHED" && (
            <div className="flex flex-wrap items-end justify-center gap-2">
              <div>
                <label className="mb-1 block text-xs text-sea-200" htmlFor="startat">{t.race.startAt}</label>
                <input id="startat" type="time" value={at} onChange={(e) => setAt(e.target.value)} className="rounded-lg bg-white px-3 py-2 text-slate-900" />
              </div>
              <button disabled={busy} className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold hover:bg-emerald-600" onClick={() => { unlockAudio(); act(() => startSequence(race.id, at)); }}>
                ▶ {at ? t.race.startSequence : t.race.startNow}
              </button>
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
