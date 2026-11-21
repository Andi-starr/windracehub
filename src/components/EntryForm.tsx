"use client";
import { useActionState, useState } from "react";
import { enterEvent } from "@/app/e/actions";
import { useT } from "@/i18n/client";

type Boat = { id: string; className: string; sailNumber: string; boatName: string | null; crew: string | null };

export function EntryForm({ eventId, classes, boats, crew, defaultSkipper }: { eventId: string; classes: { id: string; name: string }[]; boats: Boat[]; crew: { id: string; name: string }[]; defaultSkipper: string }) {
  const { t } = useT();
  const [state, run, pending] = useActionState(enterEvent.bind(null, eventId), undefined);
  const first = boats.find((b) => classes.some((c) => c.name === b.className)) ?? boats[0];
  const [boat, setBoat] = useState<Boat | undefined>(first);
  const [key, setKey] = useState(0);
  const classFor = (b?: Boat) => classes.find((c) => c.name === b?.className)?.id ?? classes[0]?.id ?? "";
  return (
    <form action={run} className="space-y-3" key={key}>
      <p className="text-sm text-slate-600">{t.entry.intro}</p>
      {boats.length > 0 && (
        <div>
          <label className="label" htmlFor="boatPick">{t.entry.myBoat}</label>
          <select id="boatPick" className="input" defaultValue={boat?.id ?? ""} onChange={(e) => { setBoat(boats.find((b) => b.id === e.target.value)); setKey((k) => k + 1); }}>
            {boats.map((b) => <option key={b.id} value={b.id}>{[b.className, b.sailNumber, b.boatName].filter(Boolean).join(" · ")}</option>)}
            <option value="">{t.entry.newBoat}</option>
          </select>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {classes.length > 0 && (
          <div>
            <label className="label" htmlFor="classId">{t.common.class} *</label>
            <select id="classId" name="classId" className="input" defaultValue={classFor(boat)} required>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div><label className="label" htmlFor="sailNumber">{t.entry.sailNo}</label><input id="sailNumber" name="sailNumber" required className="input" defaultValue={boat?.sailNumber} placeholder="SUI 1234" /></div>
        <div><label className="label" htmlFor="boatName">{t.entry.boatName}</label><input id="boatName" name="boatName" className="input" defaultValue={boat?.boatName ?? ""} /></div>
        <div><label className="label" htmlFor="skipper">{t.entry.skipper}</label><input id="skipper" name="skipper" required className="input" defaultValue={defaultSkipper} /></div>
        <div className="sm:col-span-2">
          {crew.length > 0 && (
            <fieldset className="mb-2">
              <legend className="label">{t.crew.pick}</legend>
              <div className="flex flex-wrap gap-2">
                {crew.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm has-[:checked]:border-sea-500 has-[:checked]:bg-sea-50">
                    <input type="checkbox" name="crewPick" value={c.id} defaultChecked={!!boat?.crew?.split(",").map((s) => s.trim()).includes(c.name)} /> {c.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className="label" htmlFor="crew">{crew.length > 0 ? t.crew.others : t.entry.crew}</label>
          <input id="crew" name="crew" className="input" defaultValue={crew.length > 0 ? "" : boat?.crew ?? ""} placeholder={t.entry.crewPh} />
        </div>
        <div><label className="label" htmlFor="eclub">{t.entry.club}</label><input id="eclub" name="club" className="input" /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="saveBoat" defaultChecked={!boat} /> {t.entry.saveBoat}</label>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-sm font-semibold text-emerald-700">✓ {t.entry.done}</p>}
      <button className="btn" disabled={pending}>{pending ? "…" : t.entry.submit}</button>
    </form>
  );
}
