import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireEventRole } from "@/lib/auth";
import { publicUrl } from "@/lib/storage";
import { DOC_TYPES, fmtDateTime, fmtRange, fmtTime, fmtDate, toDayInput, toZurichInput } from "@/lib/format";
import { EventForm } from "@/components/EventForm";
import { DocUploader } from "@/components/DocUploader";
import { ResultUploader } from "@/components/ResultUploader";
import { ConfirmButton, EntriesForm, InviteForm } from "@/components/ActionForms";
import * as A from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Regatta verwalten" };

export default async function ManageEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ neu?: string }> }) {
  const { id } = await params;
  const { neu } = await searchParams;
  const { role } = await requireEventRole(id);
  const e = await db.event.findUnique({
    where: { id },
    include: {
      club: true,
      classes: { orderBy: { position: "asc" } },
      schedule: { orderBy: { at: "asc" } },
      documents: { orderBy: { publishedAt: "desc" } },
      results: { orderBy: { publishedAt: "desc" }, include: { eventClass: true } },
      entries: { include: { eventClass: true } },
      roles: { include: { user: true } },
      invites: { where: { acceptedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!e) notFound();
  const host = role === "HOST";
  const clubs = (await db.club.findMany({ orderBy: { name: "asc" } })).map((c) => c.name);
  const h = await headers();
  const base = process.env.APP_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const entriesText = e.entries.map((x) => [x.eventClass?.name ?? "", x.sailNumber ?? "", x.boatName ?? "", x.skipper ?? "", x.club ?? ""].join("\t")).join("\n");

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{fmtRange(e.startDate, e.endDate)} · {e.club?.name ?? "ohne Club"}</p>
          <h1 className="text-xl font-bold text-sea-900">{e.title}</h1>
          <p className="mt-1 text-sm">
            {e.status === "DRAFT" && <span className="badge bg-amber-100 text-amber-800">Entwurf, nicht öffentlich</span>}
            {e.status === "PUBLISHED" && <span className="badge bg-emerald-100 text-emerald-800">Öffentlich</span>}
            {e.status === "CANCELLED" && <span className="badge bg-red-100 text-red-700">Abgesagt</span>}
            {!host && <span className="badge ml-2 bg-slate-100 text-slate-600">Du bist Wettfahrtleitung</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/e/${e.slug}`} className="btn-ghost" target="_blank">Öffentliche Seite ↗</Link>
          {host && e.status !== "PUBLISHED" && (
            <form action={A.setStatus.bind(null, e.id, "PUBLISHED")}><button className="btn">Veröffentlichen</button></form>
          )}
          {host && e.status === "PUBLISHED" && (
            <form action={A.setStatus.bind(null, e.id, "DRAFT")}><button className="btn-ghost">Verbergen</button></form>
          )}
        </div>
      </div>

      {neu && e.status === "DRAFT" && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Regatta erstellt. Lade jetzt die Ausschreibung hoch und klicke oben auf <strong>Veröffentlichen</strong>.</div>}

      <section className="card">
        <h2 className="h2">Dokument veröffentlichen</h2>
        <DocUploader eventId={e.id} />
        {e.documents.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-600">Veröffentlicht ({e.documents.length})</h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {e.documents.map((d) => (
                <li key={d.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center">
                  <form action={A.updateDocument.bind(null, e.id, d.id)} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                    <input name="title" defaultValue={d.title} className="input flex-1" aria-label="Titel" />
                    <select name="type" defaultValue={d.type} className="input sm:w-52" aria-label="Art">
                      {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button className="btn-ghost px-3 py-1.5 text-xs">Speichern</button>
                  </form>
                  <span className="text-xs text-slate-500 sm:w-36">{fmtDateTime(d.publishedAt)}{d.uploadedBy ? ` · ${d.uploadedBy}` : ""}</span>
                  <a href={publicUrl(d.fileKey)} target="_blank" rel="noreferrer" className="text-xs text-sea-600 underline">Ansehen</a>
                  <ConfirmButton action={A.deleteDocument.bind(null, e.id, d.id)} label="Löschen" question={`"${d.title}" löschen?`} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="h2">Resultate veröffentlichen</h2>
        <ResultUploader eventId={e.id} classes={e.classes.map((c) => ({ id: c.id, name: c.name }))} />
        {e.results.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-600">Veröffentlicht ({e.results.length}). Pro Klasse wird der neueste Stand angezeigt.</h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {e.results.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="flex-1 font-medium">{r.eventClass?.name ?? "Gesamt"}{r.title !== r.eventClass?.name ? ` · ${r.title}` : ""}</span>
                  <span className="text-xs text-slate-500">{Array.isArray(r.rows) ? `${(r.rows as unknown[]).length} Zeilen` : ""}{r.fileName ? ` · ${r.fileName}` : ""} · {fmtDateTime(r.publishedAt)}</span>
                  <form action={A.toggleResultFinal.bind(null, e.id, r.id)}>
                    <button className={`badge ${r.provisional ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`} title="Status wechseln">{r.provisional ? "Provisorisch" : "Final"} ⇄</button>
                  </form>
                  <ConfirmButton action={A.deleteResult.bind(null, e.id, r.id)} label="Löschen" question="Diese Resultate löschen?" />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="h2">Meldeliste</h2>
        <EntriesForm action={A.replaceEntries.bind(null, e.id)} initial={entriesText} />
      </section>

      {host && (
        <>
          <section className="card">
            <h2 className="h2">Angaben zur Regatta</h2>
            <EventForm
              action={A.updateEvent.bind(null, e.id)}
              clubs={clubs}
              submit="Änderungen speichern"
              defaults={{
                title: e.title, club: e.club?.name ?? "", venue: e.venue ?? "", startDate: toDayInput(e.startDate), endDate: toDayInput(e.endDate),
                classes: e.classes.map((c) => c.name).join(", "), entryUrl: e.entryUrl ?? "", entryInfo: e.entryInfo ?? "",
                contactEmail: e.contactEmail ?? "", description: e.description ?? "",
              }}
            />
          </section>

          <section className="card">
            <h2 className="h2">Programm</h2>
            {e.schedule.length > 0 && (
              <ul className="mb-3 divide-y divide-slate-100 text-sm">
                {e.schedule.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2">
                    <span className="w-36 font-medium text-sea-700">{fmtDate(s.at, { weekday: "short", day: "numeric", month: "short" })} {fmtTime(s.at)}</span>
                    <span className="flex-1">{s.title}</span>
                    <form action={A.deleteScheduleItem.bind(null, e.id, s.id)}><button className="btn-danger">Entfernen</button></form>
                  </li>
                ))}
              </ul>
            )}
            <form action={A.addScheduleItem.bind(null, e.id)} className="flex flex-col gap-2 sm:flex-row">
              <input name="at" type="datetime-local" required className="input sm:w-56" defaultValue={toZurichInput(new Date(e.startDate.getTime() + 9 * 3600e3)).slice(0, 11) + "10:00"} />
              <input name="title" required placeholder="z.B. Erster Start" className="input flex-1" />
              <button className="btn">Hinzufügen</button>
            </form>
          </section>

          <section className="card">
            <h2 className="h2">Team</h2>
            <p className="mb-3 text-sm text-slate-600">Die <strong>Wettfahrtleitung</strong> kann Dokumente, Resultate und die Meldeliste hochladen. <strong>Organisatoren</strong> können zusätzlich alles bearbeiten.</p>
            <ul className="mb-3 divide-y divide-slate-100 text-sm">
              {e.roles.map((r) => (
                <li key={r.userId} className="flex items-center gap-3 py-2">
                  <span className="flex-1">{r.user.name} <span className="text-slate-500">{r.user.email}</span></span>
                  <span className="badge bg-slate-100 text-slate-700">{r.role === "HOST" ? "Organisator" : "Wettfahrtleitung"}</span>
                  <form action={A.removeMember.bind(null, e.id, r.userId)}><button className="btn-danger">Entfernen</button></form>
                </li>
              ))}
              {e.invites.map((i) => (
                <li key={i.token} className="flex items-center gap-3 py-2 text-slate-500">
                  <span className="flex-1">{i.email} (eingeladen)</span>
                  <input readOnly className="input w-64 font-mono text-[10px]" value={`${base}/invite/${i.token}`} aria-label="Einladungslink" />
                  <form action={A.revokeInvite.bind(null, e.id, i.token)}><button className="btn-danger">Zurückziehen</button></form>
                </li>
              ))}
            </ul>
            <InviteForm action={A.inviteMember.bind(null, e.id)} base={base} />
          </section>

          <section className="card border-red-200">
            <h2 className="h2 text-red-800">Absagen oder löschen</h2>
            <div className="flex flex-wrap gap-2">
              {e.status !== "CANCELLED"
                ? <ConfirmButton className="btn-ghost" action={A.setStatus.bind(null, e.id, "CANCELLED")} label="Regatta absagen" question="Regatta als abgesagt markieren? Sie bleibt sichtbar." />
                : <form action={A.setStatus.bind(null, e.id, "PUBLISHED")}><button className="btn-ghost">Absage zurücknehmen</button></form>}
              <ConfirmButton className="btn-ghost text-red-700" action={A.deleteEvent.bind(null, e.id)} label="Endgültig löschen" question="Regatta mit allen Dokumenten und Resultaten endgültig löschen?" />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
