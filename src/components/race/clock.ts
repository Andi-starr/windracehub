"use client";
import { useEffect, useRef, useState } from "react";

/** NTP-style offset to the server clock: take the sample with the smallest round trip. */
export function useServerClock() {
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

export type Signal = { at: number; kind: "attention" | "warning" | "prep" | "prepDown" | "start"; long?: boolean };

/** Last four signals are warning, preparatory, preparatory down, start; earlier ones are attention signals. */
export function signalsFor(sequence: string, startAt: number): Signal[] {
  const mins = sequence.split(",").map(Number).sort((a, b) => b - a);
  const kinds: Signal["kind"][] = ["warning", "prep", "prepDown", "start"];
  return mins.map((m, i) => {
    const k = kinds[i - (mins.length - 4)] ?? "attention";
    return { at: startAt - m * 60e3, kind: k, long: k === "prepDown" };
  });
}

let ctx: AudioContext | null = null;
export function beep(ms = 300, freq = 880) {
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; o.type = "square";
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.setValueAtTime(0, ctx.currentTime + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + ms / 1000 + 0.05);
  } catch { /* no audio */ }
}
export function unlockAudio() { try { ctx ??= new AudioContext(); void ctx.resume(); } catch { /* */ } }
