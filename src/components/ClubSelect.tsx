"use client";
import { useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";

/** Searchable dropdown of registered clubs. Only the admin may keep a name that isn't in the list (registers it). */
export function ClubSelect({ clubs, defaultValue, allowNew }: { clubs: string[]; defaultValue?: string; allowNew: boolean }) {
  const { t } = useT();
  const [q, setQ] = useState(defaultValue ?? "");
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const hits = useMemo(() => { const n = norm(q.trim()); return (n ? clubs.filter((c) => norm(c).includes(n)) : clubs).slice(0, 50); }, [q, clubs]);
  const exact = clubs.some((c) => norm(c) === norm(q.trim()));
  const choose = (c: string) => { setValue(c); setQ(c); setOpen(false); };
  const invalid = !!q.trim() && !exact && !allowNew;

  return (
    <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setOpen(false); if (!exact && !allowNew) setQ(value); else setValue(q.trim()); } }}>
      <input type="hidden" name="club" value={allowNew ? q.trim() : value} />
      <input id="club" role="combobox" aria-expanded={open} aria-autocomplete="list" autoComplete="off" value={q} placeholder={t.form.clubSearch}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, hits.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter" && open && hits[hi]) { e.preventDefault(); choose(hits[hi]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className={`input pr-8 ${invalid ? "border-red-600" : ""}`} />
      <span aria-hidden className="pointer-events-none absolute right-3 top-2.5 text-xs">▾</span>
      {open && (hits.length > 0 || (allowNew && q.trim() && !exact)) && (
        <ul ref={list} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto border-2 border-ink bg-paper text-sm">
          {hits.map((c, i) => (
            <li key={c} role="option" aria-selected={c === value}>
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(c)}
                className={`block w-full px-3 py-2 text-left ${i === hi ? "bg-ink text-white" : "hover:bg-ink/10"}`}>{c}</button>
            </li>
          ))}
          {allowNew && q.trim() && !exact && (
            <li><button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(q.trim())} className="block w-full border-t border-ink/20 px-3 py-2 text-left text-accent hover:bg-ink/10">+ {t.form.clubNew}: {q.trim()}</button></li>
          )}
        </ul>
      )}
      {invalid && !open && <p className="mt-1 text-xs text-red-700">{t.form.errClub}</p>}
    </div>
  );
}
