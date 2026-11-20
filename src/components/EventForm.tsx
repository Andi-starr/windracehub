"use client";
import { useActionState } from "react";
import type { ActionState } from "@/app/manage/actions";

export type EventDefaults = {
  title?: string; club?: string; venue?: string; startDate?: string; endDate?: string; classes?: string;
  entryUrl?: string; entryInfo?: string; contactEmail?: string; description?: string; copyFrom?: string;
};

export function EventForm({ action, defaults = {}, clubs, submit }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  defaults?: EventDefaults; clubs: string[]; submit: string;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className="space-y-4">
      {defaults.copyFrom && <input type="hidden" name="copyFrom" value={defaults.copyFrom} />}
      <div>
        <label className="label" htmlFor="title">Name der Regatta *</label>
        <input id="title" name="title" required className="input" defaultValue={defaults.title} placeholder="z.B. Herbstregatta Thalwil" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="startDate">Von *</label>
          <input id="startDate" name="startDate" type="date" required className="input" defaultValue={defaults.startDate} />
        </div>
        <div>
          <label className="label" htmlFor="endDate">Bis <span className="font-normal text-slate-500">(leer = eintägig)</span></label>
          <input id="endDate" name="endDate" type="date" className="input" defaultValue={defaults.endDate} />
        </div>
        <div>
          <label className="label" htmlFor="club">Veranstalter (Club)</label>
          <input id="club" name="club" list="clubs" className="input" defaultValue={defaults.club} placeholder="Club wählen oder eintippen" />
          <datalist id="clubs">{clubs.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <label className="label" htmlFor="venue">Ort / Revier</label>
          <input id="venue" name="venue" className="input" defaultValue={defaults.venue} placeholder="z.B. Thalwil, Zürichsee" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="classes">Klassen <span className="font-normal text-slate-500">(mit Komma trennen)</span></label>
        <input id="classes" name="classes" className="input" defaultValue={defaults.classes} placeholder="Laser ILCA 7, Laser ILCA 6, Yardstick" />
      </div>
      <details className="rounded-lg border border-slate-200 p-3" open={!!(defaults.entryUrl || defaults.description || defaults.contactEmail)}>
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Weitere Angaben (optional)</summary>
        <div className="mt-3 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="entryUrl">Link zur Anmeldung</label>
              <input id="entryUrl" name="entryUrl" type="url" className="input" defaultValue={defaults.entryUrl} placeholder="https://…" />
            </div>
            <div>
              <label className="label" htmlFor="contactEmail">Kontakt E-Mail</label>
              <input id="contactEmail" name="contactEmail" type="email" className="input" defaultValue={defaults.contactEmail} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="entryInfo">Anmeldung / Meldegeld</label>
            <textarea id="entryInfo" name="entryInfo" rows={2} className="input" defaultValue={defaults.entryInfo} />
          </div>
          <div>
            <label className="label" htmlFor="description">Beschreibung</label>
            <textarea id="description" name="description" rows={4} className="input" defaultValue={defaults.description} />
          </div>
        </div>
      </details>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">{state.ok}</p>}
      <button className="btn" disabled={pending}>{pending ? "Speichere…" : submit}</button>
    </form>
  );
}
