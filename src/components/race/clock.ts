"use client";
import { useEffect, useRef, useState } from "react";

/** NTP-style offset to the server clock: take the sample with the smallest round trip. */
export function useServerClock() {
  // offset = server time − device time (ms); precision = half the best round trip, the measured worst-case error
  const [sync, setSync] = useState<{ offset: number; precision: number } | null>(null);
  useEffect(() => {
    let stop = false;
    const run = async () => {
      let best: { offset: number; rtt: number } | null = null;
      for (let i = 0; i < 6 && !stop; i++) {
        try {
          const t0 = performance.now();
          const wall0 = Date.now();
          const res = await fetch("/api/time", { cache: "no-store" });
          const { now } = await res.json();
          const rtt = performance.now() - t0;
          const offset = now - (wall0 + rtt / 2);
          if (!best || rtt < best.rtt) best = { offset, rtt };
        } catch { /* offline: keep last */ }
      }
      if (best && !stop) setSync({ offset: best.offset, precision: Math.round(best.rtt / 2) });
    };
    run();
    const id = setInterval(run, 60_000);
    return () => { stop = true; clearInterval(id); };
  }, []);
  return sync;
}

/** Re-renders ~20 times a second and returns server-synced now in ms. */
export function useNow(offset: number) {
  const [now, setNow] = useState(() => Date.now() + offset);
  const off = useRef(offset);
  useEffect(() => { off.current = offset; }, [offset]);
  useEffect(() => {
    let raf = 0, last = 0;
    const loop = (ts: number) => {
      if (ts - last > 50) { last = ts; setNow(Date.now() + off.current); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return now;
}

export type RaceState = { id: string; status: string; startAt: number | null; sequence: string; prepFlag: string; note: string | null; updatedAt: number };

export function useRaceState(initial: RaceState, pollMs = 2000) {
  const [race, setRace] = useState(initial);
  const id = initial.id;
  const refetch = useRef(async () => {
    try {
      const r = await fetch(`/api/race/${id}`, { cache: "no-store" });
      if (r.ok) setRace(await r.json());
    } catch { /* ignore */ }
  });
  useEffect(() => {
    const iv = setInterval(() => refetch.current(), pollMs);
    return () => clearInterval(iv);
  }, [pollMs]);
  useEffect(() => setRace(initial), [initial]);
  return { race, refetch: () => refetch.current() };
}

export type Signal = { at: number; min: number; kind: "attention" | "warning" | "prep" | "prepDown" | "start"; long?: boolean };

/** Which flag moves at a signal: attention = orange up, warning = class up, prep = prep flag up, prepDown = prep flag down, start = class down. */
export function flagFor(kind: Signal["kind"], prepFlag: string): { code: string; up: boolean } {
  switch (kind) {
    case "attention": return { code: "ORANGE", up: true };
    case "warning": return { code: "CLASS", up: true };
    case "prep": return { code: prepFlag, up: true };
    case "prepDown": return { code: prepFlag, up: false };
    default: return { code: "CLASS", up: false };
  }
}

/** Last four signals are warning, preparatory, preparatory down, start; earlier ones are attention signals. */
export function signalsFor(sequence: string, startAt: number): Signal[] {
  const mins = sequence.split(",").map(Number).sort((a, b) => b - a);
  const kinds: Signal["kind"][] = ["warning", "prep", "prepDown", "start"];
  return mins.map((m, i) => {
    const k = kinds[i - (mins.length - 4)] ?? "attention";
    return { at: startAt - m * 60e3, min: m, kind: k, long: k === "prepDown" };
  });
}

let ctx: AudioContext | null = null;
/** Soft bell-like tone: sine + quiet octave, quick attack, smooth exponential fade (no harsh square wave). */
function tone(freq: number, ms: number, vol = 0.22, delay = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay, end = t0 + ms / 1000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  g.connect(ctx.destination);
  for (const [f, v] of [[freq, 1], [freq * 2, 0.18]] as const) {
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = "sine"; o.frequency.value = f; og.gain.value = v;
    o.connect(og).connect(g); o.start(t0); o.stop(end + 0.05);
  }
}
/** kind: "tick" = countdown pip, "signal" = two-note chime, "long" = long chime (preparatory down) */
export function beep(ms = 300, freq = 880) {
  try {
    ctx ??= new AudioContext();
    if (ms <= 100) tone(freq >= 1000 ? 988 : freq, 140, 0.12);           // gentle pip (B5)
    else if (ms >= 1000) { tone(659, 1400, 0.22); tone(988, 1400, 0.14, 0.08); } // long chime E5+B5
    else { tone(784, 700, 0.22); tone(1175, 900, 0.18, 0.16); }          // signal chime G5 → D6
  } catch { /* no audio */ }
}
export function unlockAudio() { try { ctx ??= new AudioContext(); void ctx.resume(); } catch { /* */ } }
