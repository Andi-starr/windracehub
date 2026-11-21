"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";

// Site-style date range picker: tap start, tap end (same day twice = one-day regatta). Typing still works:
// "15.5.2027", "15.5.2027 - 16.5.2027" or "15.-16.5.2027". Submits hidden startDate/endDate (YYYY-MM-DD).
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) : null);
const same = (a: Date | null, b: Date | null) => !!a && !!b && iso(a) === iso(b);

function parseTyped(txt: string): [Date, Date] | null {
  const s = txt.replace(/\s+/g, "").replace(/[–—]/g, "-");
  const full = (d: string, m: string, y: string) => { const yy = y.length === 2 ? 2000 + +y : +y; const dt = new Date(yy, +m - 1, +d); return dt.getMonth() === +m - 1 ? dt : null; };
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:-(\d{1,2})\.(\d{1,2})\.(\d{2,4}))?$/);
  if (m) { const a = full(m[1], m[2], m[3]); const b = m[4] ? full(m[4], m[5], m[6]) : a; return a && b ? (b < a ? [b, a] : [a, b]) : null; }
  m = s.match(/^(\d{1,2})\.?-(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/); // 15.-16.5.2027
  if (m) { const a = full(m[1], m[3], m[4]); const b = full(m[2], m[3], m[4]); return a && b ? (b < a ? [b, a] : [a, b]) : null; }
  return null;
}

export function DateRangePicker({ defaultStart, defaultEnd, required }: { defaultStart?: string; defaultEnd?: string; required?: boolean }) {
  const { t, intl } = useT();
  const [start, setStart] = useState<Date | null>(fromIso(defaultStart));
  const [end, setEnd] = useState<Date | null>(fromIso(defaultEnd) ?? fromIso(defaultStart));
  const [picking, setPicking] = useState(false); // true = start chosen, waiting for end
  const [hover, setHover] = useState<Date | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => { const d = start ?? new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const fmt = useMemo(() => new Intl.DateTimeFormat(intl, { day: "numeric", month: "numeric", year: "numeric" }), [intl]);
  const label = start ? (end && !same(start, end) ? `${fmt.format(start)} – ${fmt.format(end)}` : fmt.format(start)) : "";
  useEffect(() => { setText(label); }, [label]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); setPicking(false); } };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const pick = (d: Date) => {
    if (!picking || !start) { setStart(d); setEnd(d); setPicking(true); return; }
    if (d < start) { setEnd(start); setStart(d); } else setEnd(d);
    setPicking(false); setOpen(false);
  };
  const commitText = () => {
    if (!text.trim()) { setStart(null); setEnd(null); setBad(false); return; }
    const r = parseTyped(text);
    if (!r) { setBad(true); return; }
    setBad(false); setStart(r[0]); setEnd(r[1]); setPicking(false); setOpen(false); setView(new Date(r[0].getFullYear(), r[0].getMonth(), 1));
  };

  const wd = useMemo(() => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(intl, { weekday: "short" }).format(new Date(2024, 0, 1 + i)).replace(".", "").slice(0, 2)), [intl]);
  const month = (offset: number) => {
    const first = new Date(view.getFullYear(), view.getMonth() + offset, 1);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const lo = start, hi = picking && hover && start ? (hover > start ? hover : start) : end;
    const lo2 = picking && hover && start && hover < start ? hover : lo;
    return (
      <div key={offset} className="w-64">
        <div className="mb-2 text-center text-xs font-medium uppercase tracking-wide">{new Intl.DateTimeFormat(intl, { month: "long", year: "numeric" }).format(first)}</div>
        <div className="grid grid-cols-7 text-center text-[10px] uppercase text-ink/50">{wd.map((w, i) => <div key={i} className="py-1">{w}</div>)}</div>
        <div className="grid grid-cols-7 text-center text-sm">
          {Array.from({ length: lead }, (_, i) => <div key={`x${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const d = new Date(first.getFullYear(), first.getMonth(), i + 1);
            const edge = same(d, lo2) || same(d, hi);
            const inside = !!lo2 && !!hi && d > lo2 && d < hi;
            const today = same(d, new Date());
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <button key={i} type="button" onClick={() => pick(d)} onMouseEnter={() => setHover(d)}
                className={`h-9 tabular-nums ${edge ? "bg-ink font-bold text-white" : inside ? "bg-accent/30" : "hover:bg-ink/10"} ${!edge && weekend ? "text-accent" : ""} ${today && !edge ? "underline underline-offset-4" : ""}`}>
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div ref={box} className="relative">
      <input type="hidden" name="startDate" value={start ? iso(start) : ""} />
      <input type="hidden" name="endDate" value={end ? iso(end) : ""} />
      <div className={`flex border bg-white ${bad ? "border-red-600" : "border-ink/40 focus-within:border-ink"}`}>
        <input id="dates" value={text} required={required} placeholder={t.form.datesPh} autoComplete="off"
          onChange={(e) => { setText(e.target.value); setBad(false); }} onBlur={commitText}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitText(); } if (e.key === "Escape" || e.key === "Tab") setOpen(false); }}
          onFocus={() => setOpen(true)} className="min-w-0 flex-1 px-3 py-2 text-sm focus:outline-none" />
        <button type="button" onClick={() => setOpen(!open)} aria-label={t.form.dates} className="border-l border-ink/20 px-3 hover:bg-ink/5">▦</button>
      </div>
      {bad && <p className="mt-1 text-xs text-red-700">{t.form.datesBad}</p>}
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 border-2 border-ink bg-paper p-4" onMouseLeave={() => setHover(null)}>
          <div className="mb-3 flex items-center justify-between">
            <button type="button" className="px-2 py-1 hover:bg-ink/10" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} aria-label="‹">←</button>
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink/60">{picking ? t.form.pickEnd : t.form.pickStart}</span>
            <button type="button" className="px-2 py-1 hover:bg-ink/10" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} aria-label="›">→</button>
          </div>
          <div className="flex gap-6">{month(0)}<div className="hidden sm:block">{month(1)}</div></div>
        </div>
      )}
    </div>
  );
}
