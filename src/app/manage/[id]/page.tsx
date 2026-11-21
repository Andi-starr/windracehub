import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireEventRole } from "@/lib/auth";
import { publicUrl } from "@/lib/storage";
import { entriesAreOpen, DOC_TYPE_KEYS, fmtDateTime, fmtRange, fmtTime, fmtDate, toDayInput, toZurichInput } from "@/lib/format";
import { getT } from "@/i18n";
import { EventForm } from "@/components/EventForm";
import { DocUploader } from "@/components/DocUploader";
import { DocDrafter } from "@/components/DocDrafter";
import { ResultUploader } from "@/components/ResultUploader";
import { ConfirmButton, EntriesForm, InviteForm } from "@/components/ActionForms";
import * as A from "../actions";
import { addRace } from "../races";
import { HashOpener } from "@/components/HashOpener";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage" };

const n = (s: string, v: number) => s.replace("{n}", String(v));

function Tile({ id, title, status, warn, open, labels, children }: { id: string; title: string; status: React.ReactNode; warn?: boolean; open?: boolean; labels: [string, string]; children: React.ReactNode }) {
  return (
    <details id={id} open={open} className="group card scroll-mt-24 p-0 open:col-span-full">
      <summary className="flex min-h-28 cursor-pointer list-none flex-col justify-between gap-3 p-5 transition-colors hover:bg-white group-open:min-h-0 [&::-webkit-details-marker]:hidden">
        <span className="flex items-start justify-between gap-3">
          <span className="text-lg font-semibold uppercase leading-tight tracking-tight">{title}</span>
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-accent"><span className="group-open:hidden">{labels[0]}</span><span className="hidden group-open:inline">{labels[1]}</span></span>
        </span>
        <span className={`flex items-center gap-2 text-sm ${warn ? "text-accent" : "text-ink/60"}`}>
          <span className={`inline-block h-2 w-2 ${warn ? "bg-accent" : "bg-ink/70"}`} aria-hidden />{status}
        </span>
      </summary>
      <div className="space-y-4 border-t border-ink/15 p-5">{children}</div>
    </details>
  );
}


export default async function ManageEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ neu?: string; edit?: string; alle?: string; racing?: string; pub?: string }> }) {
  const { id } = await params;
  const { neu, edit, alle, racing, pub } = await searchParams;
  const { role, user } = await requireEventRole(id, "HELPER");
  const { t, intl } = await getT();
  const e = await db.event.findUnique({
    where: { id },
    include: {
      club: true,
      classes: { orderBy: { position: "asc" } },
      schedule: { orderBy: { at: "asc" } },
      documents: { orderBy: { publishedAt: "desc" } },
      results: { orderBy: { publishedAt: "desc" }, include: { eventClass: true } },
      entries: { include: { eventClass: true }, orderBy: [{ classId: "asc" }, { sailNumber: "asc" }] },
      roles: { include: { user: true } },
      invites: { where: { acceptedAt: null }, orderBy: { createdAt: "desc" } },
      races: { include: { eventClass: true, _count: { select: { finishes: true } } }, orderBy: [{ classId: "asc" }, { number: "asc" }] },
    },
  });
  if (!e) notFound();
  const host = role === "HOST";
  const clubs = (await db.club.findMany({ orderBy: { name: "asc" }, select: { name: true } })).map((c) => c.name);
  const h = await headers();
  const base = process.env.APP_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const pasted = e.entries.filter((x) => !x.userId);
  const otherDocs = e.documents.filter((d) => d.type !== "SCHEDULE");
  const progDocs = e.documents.filter((d) => d.type === "SCHEDULE");
  const labels: [string, string] = [t.manage.tileOpen, t.manage.tileClose];
  const official = role === "OFFICIAL" || host;
  // races, start clock and results stay out of the way until about two weeks before the start
  const soon = e.startDate.getTime() - Date.now() < 14 * 86400000;
  const showRaces = role === "HELPER" || e.races.length > 0 || e.results.length > 0 || soon || !!alle;
  const missing = [!e.venue && t.form.venue, e.classes.length === 0 && t.form.classes, !e.contactEmail && t.form.contactEmail].filter(Boolean).map((x) => String(x).replace(" *", ""));
  const entriesOpenNow = entriesAreOpen(e);
  const entriesText = pasted.map((x) => [x.eventClass?.name ?? "", x.sailNumber ?? "", x.boatName ?? "", x.skipper ?? "", x.club ?? "", x.handicap ?? ""].join("\t")).join("\n");

  return (
    <div className="space-y-6">
      <HashOpener />
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{fmtRange(e.startDate, e.endDate, intl)} · {e.club?.name ?? t.manage.noClub}</p>
          <h1 className="h1">{e.title}</h1>
          <p className="mt-1 text-sm">
            {e.status === "DRAFT" && <span className="badge bg-amber-100 text-amber-800">{t.status.draftHidden}</span>}
            {e.status === "PUBLISHED" && <span className="badge bg-emerald-100 text-emerald-800">{t.status.PUBLISHED}</span>}
            {e.status === "CANCELLED" && <span className="badge bg-red-100 text-red-700">{t.status.CANCELLED}</span>}
            {role === "OFFICIAL" && <span className="badge ml-2 bg-slate-100 text-slate-600">{t.manage.youAreOfficial}</span>}
            {role === "HELPER" && <span className="badge ml-2 bg-slate-100 text-slate-600">{t.roles.HELPER}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/e/${e.slug}`} className="btn-ghost" target="_blank">{t.manage.publicPage}</Link>
          {host && e.status !== "PUBLISHED" && (
            <form action={A.setStatus.bind(null, e.id, "PUBLISHED")}><button className="btn">{t.manage.publish}</button></form>
          )}
          {host && e.status === "PUBLISHED" && (
            <form action={A.setStatus.bind(null, e.id, "DRAFT")}><button className="btn-ghost">{t.manage.hide}</button></form>
          )}
        </div>
      </div>

      {neu && e.status === "DRAFT" && <div className="border border-ink/15 bg-white px-4 py-3 text-sm">{t.manage.created}</div>}
      {role === "HELPER" && <p className="text-sm text-ink/70">{t.manage.helperIntro}</p>}
      {racing === "done" && <div className="border border-ink/15 bg-white px-4 py-3 text-sm">{t.racing.doneMsg}{Number(pub) > 0 ? ` ${t.racing.donePub.replace("{n}", String(pub))}` : ""}</div>}
      {showRaces && (
        <Link href={`/manage/${e.id}/racing`} className="group flex items-center justify-between gap-4 border-2 border-ink bg-accent px-5 py-4 text-ink hover:bg-ink hover:text-paper">
          <span>
            <span className="block text-2xl font-semibold uppercase tracking-tight">{t.racing.goRacing}</span>
            <span className="block text-sm opacity-80">{t.racing.goRacingHint}</span>
          </span>
          <span className="text-3xl" aria-hidden>→</span>
        </Link>
      )}

      <div className="grid grid-flow-row-dense gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {host && (
          <Tile id="details" title={t.manage.details} labels={labels} warn={missing.length > 0} status={missing.length ? t.manage.tileMissing.replace("{f}", missing.join(", ")) : t.manage.tileComplete}>
            <EventForm
              action={A.updateEvent.bind(null, e.id)}
              clubs={clubs}
              allowNewClub={user.role === "ADMIN"}
              submit={t.manage.saveChanges}
              defaults={{
                title: e.title, club: e.club?.name ?? "", venue: e.venue ?? "", startDate: toDayInput(e.startDate), endDate: toDayInput(e.endDate),
                classes: e.classes.map((c) => c.name).join(", "), entryUrl: e.entryUrl ?? "", entryInfo: e.entryInfo ?? "",
                contactEmail: e.contactEmail ?? "", description: e.description ?? "",
              }}
            />
          </Tile>
        )}

        {official && (
          <Tile id="docs" title={t.event.docs} labels={labels} warn={otherDocs.length === 0} status={otherDocs.length ? n(t.manage.tileDocs, otherDocs.length) : t.manage.tileNone}>
            <DocUploader eventId={e.id} />
            <DocDrafter eventId={e.id} eventTitle={e.title} enabled={!!process.env.ANTHROPIC_API_KEY} />
        {otherDocs.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-600">{t.manage.published} ({otherDocs.length})</h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {otherDocs.map((d) => (
                <li key={d.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center">
                  <form action={A.updateDocument.bind(null, e.id, d.id)} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                    <input name="title" defaultValue={d.title} className="input flex-1" aria-label={t.upload.resTitle} />
                    <select name="type" defaultValue={d.type} className="input sm:w-52" aria-label={t.upload.resStatus}>
                      {DOC_TYPE_KEYS.map((k) => <option key={k} value={k}>{t.docTypes[k]}</option>)}
                    </select>
                    <button className="btn-ghost px-3 py-1.5 text-xs">{t.common.save}</button>
                  </form>
                  <span className="text-xs text-slate-500 sm:w-36">{fmtDateTime(d.publishedAt, intl)}{d.uploadedBy ? ` · ${d.uploadedBy}` : ""}</span>
                  <a href={publicUrl(d.fileKey)} target="_blank" rel="noreferrer" className="text-xs text-sea-600 underline">{t.common.view}</a>
                  <ConfirmButton action={A.deleteDocument.bind(null, e.id, d.id)} label={t.common.delete} question={`"${d.title}" – ${t.common.delete}?`} />
                </li>
              ))}
            </ul>
          </div>
        )}
          </Tile>
        )}

        {official && (
          <Tile id="program" title={t.manage.tileProgram} labels={labels} warn={progDocs.length === 0 && e.schedule.length === 0} status={progDocs.length ? n(t.manage.tileDocs, progDocs.length) : e.schedule.length ? `${e.schedule.length} ✓` : t.manage.tileNone}>
            <p className="text-sm text-ink/60">{t.manage.tileProgramHint}</p>
            <DocUploader eventId={e.id} defaultType="SCHEDULE" />
            <DocDrafter eventId={e.id} eventTitle={e.title} enabled={!!process.env.ANTHROPIC_API_KEY} defaultType="SCHEDULE" />
        {progDocs.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-600">{t.manage.published} ({progDocs.length})</h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {progDocs.map((d) => (
                <li key={d.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center">
                  <form action={A.updateDocument.bind(null, e.id, d.id)} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                    <input name="title" defaultValue={d.title} className="input flex-1" aria-label={t.upload.resTitle} />
                    <select name="type" defaultValue={d.type} className="input sm:w-52" aria-label={t.upload.resStatus}>
                      {DOC_TYPE_KEYS.map((k) => <option key={k} value={k}>{t.docTypes[k]}</option>)}
                    </select>
                    <button className="btn-ghost px-3 py-1.5 text-xs">{t.common.save}</button>
                  </form>
                  <span className="text-xs text-slate-500 sm:w-36">{fmtDateTime(d.publishedAt, intl)}{d.uploadedBy ? ` · ${d.uploadedBy}` : ""}</span>
                  <a href={publicUrl(d.fileKey)} target="_blank" rel="noreferrer" className="text-xs text-sea-600 underline">{t.common.view}</a>
                  <ConfirmButton action={A.deleteDocument.bind(null, e.id, d.id)} label={t.common.delete} question={`"${d.title}" – ${t.common.delete}?`} />
                </li>
              ))}
            </ul>
          </div>
        )}
            {host && e.schedule.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-ink/60">{t.manage.scheduleLegacy}</p>
              <ul className="divide-y divide-slate-100 text-sm">
                {e.schedule.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2">
                    <span className="w-40 font-medium">{fmtDate(s.at, { weekday: "short", day: "numeric", month: "short" }, intl)} {fmtTime(s.at, intl)}</span>
                    <span className="flex-1">{s.title}</span>
                    <form action={A.deleteScheduleItem.bind(null, e.id, s.id)}><button className="btn-danger">{t.common.remove}</button></form>
                  </li>
                ))}
              </ul>
              </div>
            )}
          </Tile>
        )}

        {official && (
          <Tile id="entries" open={!!edit} title={`${t.manage.entriesTitle} (${e.entries.length})`} labels={labels} warn={!entriesOpenNow && e.status !== "DRAFT"}
            status={<>{entriesOpenNow ? t.manage.tileEntriesOpen : e.status === "DRAFT" && e.entriesOpen ? t.manage.tileEntriesDraft : t.manage.tileEntriesShut}{e.entriesCloseAt ? ` · ${t.manage.tileUntil.replace("{d}", fmtDateTime(e.entriesCloseAt, intl))}` : ""}</>}>
        {host && (
          <form action={A.setEntryOptions.bind(null, e.id)} className="flex flex-wrap items-end gap-4 rounded-lg bg-slate-50 p-3 text-sm">
            <label className="flex items-center gap-2 font-medium"><input type="checkbox" name="entriesOpen" defaultChecked={e.entriesOpen} /> {t.manage.entriesOpen}</label>
            <div>
              <label className="label" htmlFor="closeAt">{t.entry.closesAt} ({t.common.optional})</label>
              <input id="closeAt" name="closeAt" type="datetime-local" defaultValue={e.entriesCloseAt ? toZurichInput(e.entriesCloseAt) : ""} className="input w-56" />
            </div>
            <div>
              <label className="label" htmlFor="discards">{t.manage.discards}</label>
              <input id="discards" name="discards" defaultValue={e.discards ?? ""} placeholder="4:1,8:2" className="input w-32" title={t.manage.discardsHint} />
            </div>
            <button className="btn-ghost">{t.common.save}</button>
            <p className="w-full text-xs text-slate-500">{t.manage.entriesOpenHint} {t.manage.discardsHint}.</p>
          </form>
        )}
        {e.entries.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600">
                <tr>{[t.common.class, t.event.sailNo, t.event.boat, t.event.skipper, t.event.crew, t.common.club, t.manage.handicap, ""].map((x, i) => <th key={i} className="px-3 py-2">{x}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {e.entries.map((x) => x.id === edit ? (
                  <tr key={x.id} className="bg-white">
                    <td colSpan={8} className="p-2">
                      <form action={A.updateEntry.bind(null, e.id, x.id)} className="grid grid-cols-2 gap-2 sm:grid-cols-8">
                        <select name="classId" defaultValue={x.classId ?? ""} className="input" aria-label={t.common.class}><option value="">–</option>{e.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                        <input name="sailNumber" defaultValue={x.sailNumber ?? ""} placeholder={t.event.sailNo} className="input" />
                        <input name="boatName" defaultValue={x.boatName ?? ""} placeholder={t.event.boat} className="input" />
                        <input name="skipper" defaultValue={x.skipper ?? ""} placeholder={t.event.skipper} className="input" />
                        <input name="crew" defaultValue={x.crew ?? ""} placeholder={t.event.crew} className="input" />
                        <input name="club" defaultValue={x.club ?? ""} placeholder={t.common.club} className="input" />
                        <input name="handicap" defaultValue={x.handicap ?? ""} placeholder={t.manage.handicap} className="input" inputMode="decimal" />
                        <div className="flex gap-2"><button className="btn">{t.common.save}</button><Link href={`/manage/${e.id}#entries`} className="btn-ghost">{t.common.cancel}</Link></div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={x.id}>
                    <td className="px-3 py-1.5">{x.eventClass?.name}</td><td className="px-3 py-1.5 font-semibold">{x.sailNumber}</td><td className="px-3 py-1.5">{x.boatName}</td>
                    <td className="px-3 py-1.5">{x.skipper} {x.userId && <span className="badge bg-sea-100 text-sea-700">{t.manage.onlineEntries}</span>}</td>
                    <td className="px-3 py-1.5">{x.crew}</td><td className="px-3 py-1.5">{x.club}</td><td className="px-3 py-1.5">{x.handicap ?? ""}</td>
                    <td className="whitespace-nowrap px-3 py-1.5"><Link href={`/manage/${e.id}?edit=${x.id}#entries`} className="btn-danger text-ink">{t.common.edit}</Link><ConfirmButton action={A.deleteEntry.bind(null, e.id, x.id)} label={t.common.remove} question={`${x.sailNumber} – ${t.common.remove}?`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form action={A.addEntry.bind(null, e.id)} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-8">
          <div className="col-span-2 text-[11px] font-medium uppercase tracking-wide sm:col-span-8">{t.manage.addEntry}</div>
          <select name="classId" className="input" aria-label={t.common.class}>{e.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="">–</option></select>
          <input name="sailNumber" placeholder={t.event.sailNo} className="input" />
          <input name="boatName" placeholder={t.event.boat} className="input" />
          <input name="skipper" placeholder={t.event.skipper} className="input" />
          <input name="crew" placeholder={t.event.crew} className="input" />
          <input name="club" placeholder={t.common.club} className="input" />
          <input name="handicap" placeholder={t.manage.handicap} className="input" inputMode="decimal" />
          <button className="btn">{t.common.add}</button>
        </form>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-sea-700">Excel → {t.manage.entriesSave}</summary>
          <div className="mt-2"><EntriesForm action={A.replaceEntries.bind(null, e.id)} initial={entriesText} /></div>
        </details>
          </Tile>
        )}

        {host && (
          <Tile id="team" title={t.manage.team} labels={labels} status={<>{n(t.manage.tileTeam, e.roles.length)}{e.invites.length ? ` · ${n(t.manage.tileInvited, e.invites.length)}` : ""}</>}>
            <p className="mb-3 text-sm text-slate-600">{t.manage.teamIntro}</p>
            <ul className="mb-3 divide-y divide-slate-100 text-sm">
              {e.roles.map((r) => (
                <li key={r.userId} className="flex items-center gap-3 py-2">
                  <span className="flex-1">{r.user.name} <span className="text-slate-500">{r.user.email}</span></span>
                  <span className="badge bg-slate-100 text-slate-700">{r.role === "HOST" ? t.roles.HOST : r.role === "HELPER" ? t.roles.HELPER : t.roles.OFFICIAL}</span>
                  <form action={A.removeMember.bind(null, e.id, r.userId)}><button className="btn-danger">{t.common.remove}</button></form>
                </li>
              ))}
              {e.invites.map((i) => (
                <li key={i.token} className="flex flex-wrap items-center gap-3 py-2 text-slate-500">
                  <span className="flex-1">{i.email} ({t.manage.invited})</span>
                  <input readOnly className="input w-64 font-mono text-[10px]" value={`${base}/invite/${i.token}`} aria-label={t.manage.inviteLink} />
                  <form action={A.revokeInvite.bind(null, e.id, i.token)}><button className="btn-danger">{t.manage.revoke}</button></form>
                </li>
              ))}
            </ul>
            <InviteForm action={A.inviteMember.bind(null, e.id)} base={base} />
          </Tile>
        )}

        {showRaces && (
          <Tile id="races" open={role === "HELPER"} title={t.manage.racesTitle} labels={labels} status={e.races.length ? n(t.manage.tileRaces, e.races.length) : t.manage.tileNone}>
        {e.races.length === 0 && <p className="mb-3 text-sm text-slate-500">{t.race.none}</p>}
        {e.races.length > 0 && (
          <ul className="mb-4 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
            {e.races.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
                <Link href={`/manage/${e.id}/race/${r.id}`} className="font-semibold text-sea-700 underline">{r.eventClass?.name ?? t.common.all} · {t.race.title} {r.number}</Link>
                <span className="badge bg-slate-100 text-slate-700">{t.race.status[r.status]}</span>
                {r.startAt && <span className="text-slate-500">{t.race.startAt} {fmtTime(r.startAt, intl)}</span>}
                <span className="text-slate-500">{r._count.finishes} {t.race.finishes}</span>
                <Link href={`/manage/${e.id}/race/${r.id}`} className="btn ml-auto px-3 py-1.5 text-xs">{t.race.startClock} →</Link>
              </li>
            ))}
          </ul>
        )}
        <form action={addRace.bind(null, e.id)} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="race-class">{t.common.class}</label>
            <select id="race-class" name="classId" className="input">
              {e.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="">{t.common.all}</option>
            </select>
          </div>
          <button className="btn">{t.race.add}</button>
        </form>
          </Tile>
        )}

        {showRaces && official && (
          <Tile id="results" title={t.event.results} labels={labels} status={e.results.length ? n(t.manage.tileResults, e.results.length) : t.manage.tileNone}>
        <ResultUploader eventId={e.id} classes={e.classes.map((c) => ({ id: c.id, name: c.name }))} />
        {e.results.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-600">{t.manage.published} ({e.results.length}). {t.manage.newestPerClass}</h3>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {e.results.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="flex-1 font-medium">{r.eventClass?.name ?? t.common.total}{r.title !== r.eventClass?.name ? ` · ${r.title}` : ""}</span>
                  <span className="text-xs text-slate-500">{Array.isArray(r.rows) ? `${(r.rows as unknown[]).length} ${t.common.rows}` : ""}{r.fileName ? ` · ${r.fileName}` : ""} · {fmtDateTime(r.publishedAt, intl)}</span>
                  <form action={A.toggleResultFinal.bind(null, e.id, r.id)}>
                    <button className={`badge ${r.provisional ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`} title={t.manage.toggleStatus}>{r.provisional ? t.event.provisional : t.event.final} ⇄</button>
                  </form>
                  <ConfirmButton action={A.deleteResult.bind(null, e.id, r.id)} label={t.common.delete} question={t.manage.confirmDeleteResult} />
                </li>
              ))}
            </ul>
          </div>
        )}
          </Tile>
        )}

        {!showRaces && (
          <div className="flex min-h-28 flex-col justify-between gap-3 border border-dashed border-ink/25 p-5 text-sm text-ink/60">
            <span>{t.manage.tileLater}</span>
            <Link href={`/manage/${e.id}?alle=1#races`} className="text-[11px] font-semibold uppercase tracking-wide text-accent">{t.manage.tileShowNow} →</Link>
          </div>
        )}

        {host && (
          <Tile id="danger" title={t.manage.tileDanger} labels={labels} status={t.status[e.status]}>
            <div className="flex flex-wrap gap-2">
              {e.status !== "CANCELLED"
                ? <ConfirmButton className="btn-ghost" action={A.setStatus.bind(null, e.id, "CANCELLED")} label={t.manage.cancelEvent} question={t.manage.cancelQ} />
                : <form action={A.setStatus.bind(null, e.id, "PUBLISHED")}><button className="btn-ghost">{t.manage.uncancel}</button></form>}
              <ConfirmButton className="btn-ghost text-red-700" action={A.deleteEvent.bind(null, e.id)} label={t.manage.deleteForever} question={t.manage.deleteQ} />
            </div>
          </Tile>
        )}
      </div>
    </div>
  );
}
