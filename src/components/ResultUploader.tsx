"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addResult } from "@/app/manage/actions";
import { parseResults, type Table } from "@/lib/results";
import { ResultTable } from "./ResultTable";
import { uploadFile } from "./upload";
import { useT } from "@/i18n/client";

export function ResultUploader({ eventId, classes }: { eventId: string; classes: { id: string; name: string }[] }) {
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [provisional, setProvisional] = useState(true);
  const [table, setTable] = useState<Table | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ err?: string; ok?: string }>({});
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { t } = useT();

  const fromText = (txt: string) => {
    setText(txt);
    setTable(txt.trim() ? parseResults(txt) : null);
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setMsg({});
    if (/\.pdf$/i.test(f.name)) { setPdf(f); return; }
    if (/\.xlsx?$/i.test(f.name)) { setMsg({ err: t.upload.xlsxHint }); return; }
    const parsed = parseResults(await f.text());
    if (!parsed) { setMsg({ err: t.upload.noTable }); return; }
    setText(""); setTable(parsed);
  };

  const publish = async () => {
    if (!table && !pdf) { setMsg({ err: t.upload.needInput }); return; }
    setBusy(true); setMsg({});
    try {
      const key = pdf ? await uploadFile(eventId, pdf) : undefined;
      await addResult(eventId, {
        classId: classId || null, title, provisional,
        headers: table?.headers ?? [], rows: table?.rows ?? [], key, fileName: pdf?.name,
      });
      setTable(null); setPdf(null); setText(""); setTitle("");
      setMsg({ ok: t.upload.resDone });
      router.refresh();
    } catch (e) {
      setMsg({ err: e instanceof Error ? e.message : t.common.error });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="r-class">{t.common.class}</label>
          <select id="r-class" className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="">{t.common.total}</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="r-title">{t.upload.resTitle} <span className="font-normal text-slate-500">({t.common.optional})</span></label>
          <input id="r-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.upload.resTitlePh} />
        </div>
        <div>
          <span className="label">{t.upload.resStatus}</span>
          <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm">
            <button type="button" onClick={() => setProvisional(true)} className={`flex-1 px-3 py-2 ${provisional ? "bg-amber-100 font-semibold text-amber-900" : "bg-white"}`}>{t.event.provisional}</button>
            <button type="button" onClick={() => setProvisional(false)} className={`flex-1 px-3 py-2 ${!provisional ? "bg-emerald-100 font-semibold text-emerald-900" : "bg-white"}`}>{t.event.final}</button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:border-sea-500">
          <span className="font-semibold text-sea-700">{t.upload.chooseFile}</span>
          <span className="text-xs text-slate-500">{t.upload.fileHint}</span>
          <input type="file" accept=".htm,.html,.csv,.txt,.pdf,.xls,.xlsx" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <textarea
          className="input min-h-28 font-mono text-xs"
          placeholder={t.upload.pastePh}
          value={text}
          onChange={(e) => fromText(e.target.value)}
        />
      </div>

      {pdf && <p className="text-sm">{t.upload.pdf}: <strong>{pdf.name}</strong> <button className="btn-danger" onClick={() => setPdf(null)}>{t.common.remove}</button></p>}
      {table && (
        <div>
          <p className="mb-1 text-xs text-slate-500">{t.upload.preview}: {table.rows.length} {t.common.rows}</p>
          <div className="max-h-72 overflow-auto"><ResultTable headers={table.headers} rows={table.rows} /></div>
        </div>
      )}
      {msg.err && <p className="text-sm text-red-700">{msg.err}</p>}
      {msg.ok && <p className="text-sm font-semibold text-emerald-700">✓ {msg.ok}</p>}
      {(table || pdf) && <button className="btn" onClick={publish} disabled={busy}>{busy ? t.upload.publishing : t.manage.publishResults}</button>}
    </div>
  );
}
