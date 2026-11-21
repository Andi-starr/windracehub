"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addDocument } from "@/app/manage/actions";
import { useT } from "@/i18n/client";
import { uploadFile } from "./upload";
import { textToPdf } from "./textPdf";

const TYPES = ["NOR", "SI", "SCHEDULE", "AMENDMENT", "NOTICE"] as const;
type Draft = { type: string; lang: string; notes: string; title: string; text: string };

export function DocDrafter({ eventId, eventTitle, enabled, defaultType = "NOR" }: { eventId: string; eventTitle: string; enabled: boolean; defaultType?: string }) {
  const { t, intl } = useT();
  const locale = intl.slice(0, 2);
  const router = useRouter();
  const store = `wrh-draft-${eventId}${defaultType === "NOR" ? "" : `-${defaultType}`}`;
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Draft>({ type: defaultType, lang: locale, notes: "", title: "", text: "" });
  const [state, setState] = useState<"idle" | "writing" | "publishing" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const abort = useRef<AbortController | null>(null);

  // keep an unsent draft in this browser so a reload doesn't lose the host's edits
  useEffect(() => {
    try { const s = localStorage.getItem(store); if (s) { setD(JSON.parse(s)); setOpen(true); } } catch {}
  }, [store]);
  useEffect(() => {
    try { if (d.text || d.notes) localStorage.setItem(store, JSON.stringify(d)); } catch {}
  }, [d, store]);

  const set = (p: Partial<Draft>) => setD((c) => ({ ...c, ...p }));
  const defaultTitle = (type: string) => `${t.docTypes[type as "NOR"]} – ${eventTitle}`;

  const generate = async () => {
    setState("writing"); setMsg("");
    const ctrl = new AbortController(); abort.current = ctrl;
    set({ text: "", title: d.title || defaultTitle(d.type) });
    try {
      const res = await fetch("/api/draft", {
        method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, type: d.type, lang: d.lang, notes: d.notes }),
      });
      if (!res.ok || !res.body) throw new Error(res.status === 503 ? t.draft.noKey : `${t.common.error} (${res.status})`);
      const reader = res.body.getReader(); const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        setD((c) => ({ ...c, text: c.text + chunk }));
      }
      setState("idle");
    } catch (e) {
      if (ctrl.signal.aborted) { setState("idle"); return; }
      setState("error"); setMsg(e instanceof Error ? e.message : t.common.error);
    }
  };

  const makePdf = () => textToPdf(d.text, `${eventTitle} · windracehub.com`);

  const preview = async () => {
    const bytes = await makePdf();
    window.open(URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" })), "_blank");
  };

  const publish = async () => {
    setState("publishing"); setMsg("");
    try {
      const bytes = await makePdf();
      const name = `${(d.title || defaultTitle(d.type)).replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 80)}.pdf`;
      const file = new File([bytes as BlobPart], name, { type: "application/pdf" });
      const key = await uploadFile(eventId, file);
      await addDocument(eventId, { key, fileName: name, size: file.size, type: d.type, title: d.title || defaultTitle(d.type) });
      try { localStorage.removeItem(store); } catch {}
      setD({ type: d.type, lang: d.lang, notes: "", title: "", text: "" });
      setState("done");
      router.refresh();
    } catch (e) {
      setState("error"); setMsg(e instanceof Error ? e.message : t.common.error);
    }
  };

  const discard = () => { try { localStorage.removeItem(store); } catch {} setD({ type: d.type, lang: d.lang, notes: "", title: "", text: "" }); setState("idle"); };
  const busy = state === "writing" || state === "publishing";

  if (!open) {
    return (
      <button type="button" className="btn-ghost w-full sm:w-auto" onClick={() => setOpen(true)}>✨ {t.draft.open}</button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-sea-200 bg-sea-50/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-sea-900">✨ {t.draft.title}</h3>
          <p className="text-sm text-slate-600">{t.draft.intro}</p>
        </div>
        <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={() => { abort.current?.abort(); setOpen(false); }} aria-label={t.common.cancel}>✕</button>
      </div>
      {!enabled && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.draft.noKey}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="dr-type">{t.draft.type}</label>
          <select id="dr-type" className="input" value={d.type} disabled={busy} onChange={(e) => set({ type: e.target.value, title: "" })}>
            {TYPES.map((k) => <option key={k} value={k}>{t.docTypes[k]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dr-lang">{t.draft.lang}</label>
          <select id="dr-lang" className="input" value={d.lang} disabled={busy} onChange={(e) => set({ lang: e.target.value })}>
            <option value="de">Deutsch</option><option value="en">English</option><option value="fr">Français</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="dr-notes">{t.draft.notes}</label>
        <textarea id="dr-notes" className="input min-h-20" value={d.notes} disabled={busy} placeholder={t.draft.notesPh} onChange={(e) => set({ notes: e.target.value })} />
      </div>
      <div className="flex flex-wrap gap-2">
        {state === "writing"
          ? <button type="button" className="btn-ghost" onClick={() => abort.current?.abort()}>■ {t.draft.stop}</button>
          : <button type="button" className="btn" disabled={!enabled || busy} onClick={generate}>{d.text ? t.draft.regenerate : t.draft.generate}</button>}
        {state === "writing" && <span className="self-center text-sm text-slate-600">{t.draft.writing}</span>}
      </div>

      {(d.text || state === "writing") && (
        <div className="space-y-2">
          <div>
            <label className="label" htmlFor="dr-title">{t.upload.resTitle}</label>
            <input id="dr-title" className="input" value={d.title} disabled={busy} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="dr-text">{t.draft.text}</label>
            <textarea id="dr-text" className="input min-h-[28rem] font-mono text-sm leading-relaxed" value={d.text} readOnly={state === "writing"} onChange={(e) => set({ text: e.target.value })} />
          </div>
          <p className="text-xs text-slate-600">{t.draft.check}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" disabled={busy || !d.text.trim()} onClick={publish}>{state === "publishing" ? t.upload.uploading : t.draft.publish}</button>
            <button type="button" className="btn-ghost" disabled={busy || !d.text.trim()} onClick={preview}>{t.draft.preview}</button>
            <button type="button" className="btn-danger" disabled={busy} onClick={discard}>{t.draft.discard}</button>
          </div>
        </div>
      )}
      {state === "done" && <div className="text-sm font-semibold text-emerald-700">{t.upload.done}</div>}
      {state === "error" && <div className="text-sm text-red-700">{msg}</div>}
    </div>
  );
}
