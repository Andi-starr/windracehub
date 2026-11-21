"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addDocument } from "@/app/manage/actions";
import { DOC_TYPE_KEYS } from "@/lib/format";
import { useT } from "@/i18n/client";
import { uploadFile } from "./upload";

type Item = { file: File; type: string; title: string; state: "ready" | "busy" | "done" | "error"; msg?: string };

function guessType(name: string) {
  const n = name.toLowerCase();
  if (/\bnor\b|ausschreibung|notice.of.race/.test(n)) return "NOR";
  if (/\bsi\b|segelanweisung|sailing.instruction/.test(n)) return "SI";
  if (/programm|schedule|zeitplan|horaire/.test(n)) return "SCHEDULE";
  if (/amend|änderung|aenderung/.test(n)) return "AMENDMENT";
  if (/protest|hearing|entscheid|decision|verhandlung/.test(n)) return "PROTEST";
  return "NOTICE";
}
const prettyTitle = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();

export function DocUploader({ eventId, defaultType }: { eventId: string; defaultType?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { t } = useT();

  const add = (files: FileList | null) => {
    if (!files) return;
    setItems((cur) => [
      ...cur.filter((i) => i.state !== "done"),
      ...Array.from(files).map((file) => ({ file, type: defaultType ?? guessType(file.name), title: prettyTitle(file.name), state: "ready" as const })),
    ]);
  };
  const patch = (idx: number, p: Partial<Item>) => setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, ...p } : it)));

  const publish = async () => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.state === "done") continue;
      patch(i, { state: "busy", msg: undefined });
      try {
        const key = await uploadFile(eventId, it.file);
        await addDocument(eventId, { key, fileName: it.file.name, size: it.file.size, type: it.type, title: it.title });
        patch(i, { state: "done" });
      } catch (e) {
        patch(i, { state: "error", msg: e instanceof Error ? e.message : t.common.error });
      }
    }
    router.refresh();
  };

  const pending = items.filter((i) => i.state !== "done").length;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        className={`flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${over ? "border-sea-500 bg-sea-50" : "border-slate-300 bg-slate-50 hover:border-sea-500"}`}
      >
        <span className="text-3xl" aria-hidden>📄</span>
        <span className="mt-2 font-semibold text-sea-700">{t.upload.drop}</span>
        <span className="text-xs text-slate-500">{t.upload.dropHint}</span>
      </button>
      <input ref={input} type="file" multiple accept=".pdf,application/pdf,image/*" className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
              <input className="input flex-1" value={it.title} disabled={it.state === "done"} onChange={(e) => patch(i, { title: e.target.value })} aria-label={t.upload.resTitle} />
              <select className="input sm:w-56" value={it.type} disabled={it.state === "done"} onChange={(e) => patch(i, { type: e.target.value })} aria-label={t.upload.resStatus}>
                {DOC_TYPE_KEYS.map((k) => <option key={k} value={k}>{t.docTypes[k]}</option>)}
              </select>
              <span className="w-28 text-xs">
                {it.state === "busy" && <span className="text-slate-500">{t.upload.uploading}</span>}
                {it.state === "done" && <span className="font-semibold text-emerald-700">{t.upload.done}</span>}
                {it.state === "error" && <span className="text-red-700">{it.msg}</span>}
                {it.state === "ready" && <button type="button" className="btn-danger" onClick={() => setItems((c) => c.filter((_, j) => j !== i))}>{t.common.remove}</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {pending > 0 && (
        <button className="btn" onClick={publish} disabled={items.some((i) => i.state === "busy")}>
          {pending === 1 ? t.upload.publishOne : `${pending} · ${t.upload.publishN}`}
        </button>
      )}
    </div>
  );
}
