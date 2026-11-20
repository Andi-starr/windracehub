"use client";
import { useActionState, useState } from "react";
import type { ActionState } from "@/app/manage/actions";

export function ConfirmButton({ action, label, question, className = "btn-danger" }: { action: () => Promise<void>; label: string; question: string; className?: string }) {
  return (
    <form action={action} onSubmit={(e) => { if (!confirm(question)) e.preventDefault(); }}>
      <button className={className}>{label}</button>
    </form>
  );
}

export function EntriesForm({ action, initial }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; initial: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className="space-y-2">
      <textarea name="entries" defaultValue={initial} rows={6} className="input font-mono text-xs" placeholder={"Klasse\tSegelnr\tBoot\tSteuermann\tClub\nILCA 7\tSUI 123\tBlue\tAnna Muster\tSVT"} />
      <p className="text-xs text-slate-500">Spalten: Klasse, Segelnr., Boot, Steuermann/-frau, Club. Direkt aus Excel kopieren. Ersetzt die ganze Liste.</p>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <button className="btn" disabled={pending}>Meldeliste speichern</button>
    </form>
  );
}

export function InviteForm({ action, base }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; base: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  const [copied, setCopied] = useState(false);
  const link = state?.ok ? `${base}/invite/${state.ok}` : "";
  return (
    <div className="space-y-2">
      <form action={run} className="flex flex-col gap-2 sm:flex-row">
        <input name="email" type="email" required placeholder="E-Mail" className="input flex-1" />
        <select name="role" className="input sm:w-48" defaultValue="OFFICIAL">
          <option value="OFFICIAL">Wettfahrtleitung (Upload)</option>
          <option value="HOST">Organisator (alles)</option>
        </select>
        <button className="btn" disabled={pending}>Einladen</button>
      </form>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {link && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm">
          <p className="mb-1 font-medium text-emerald-900">Einladungslink erstellt. Schick ihn per E-Mail oder WhatsApp:</p>
          <div className="flex gap-2">
            <input readOnly value={link} className="input font-mono text-xs" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn-ghost" onClick={() => { navigator.clipboard.writeText(link); setCopied(true); }}>{copied ? "Kopiert" : "Kopieren"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
