import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { publicUrl } from "@/lib/storage";
import { fmtDateTime, fmtRange, fmtSize, fmtTime, fmtDate } from "@/lib/format";
import { getT } from "@/i18n";
import type { Dict } from "@/i18n/de";
import { ResultTable } from "@/components/ResultTable";
import { EntryForm } from "@/components/EntryForm";
import { ConfirmButton } from "@/components/ActionForms";
import { withdrawEntry } from "../actions";

export const dynamic = "force-dynamic";
type P = Promise<{ slug: string }>;

async function load(slug: string) {
  return db.event.findUnique({
    where: { slug },
    include: {
      club: true,
      classes: { orderBy: { position: "asc" } },
      schedule: { orderBy: { at: "asc" } },
      documents: { orderBy: { publishedAt: "desc" } },
      results: { orderBy: { publishedAt: "desc" }, include: { eventClass: true } },
      entries: { include: { eventClass: true }, orderBy: [{ classId: "asc" }, { sailNumber: "asc" }] },
      races: { orderBy: [{ classId: "asc" }, { number: "asc" }], include: { eventClass: true } },
    },
  });
}

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const e = await db.event.findUnique({ where: { slug: (await params).slug } });
  return { title: e?.title ?? "Regatta" };
}

export default async function EventPage({ params }: { params: P }) {
  const { slug } = await params;
  const [e, user, { t, intl }] = await Promise.all([load(slug), currentUser(), getT()]);
  if (!e) notFound();
  const canEdit = !!user && (user.role === "ADMIN" || !!(await db.eventRole.findUnique({ where: { userId_eventId: { userId: user.id, eventId: e.id } } })));
  if (e.status === "DRAFT" && !canEdit) notFound();

  const fresh = (d: Date) => Date.now() - d.getTime() < 48 * 3600e3;
  const mainDocs = e.documents.filter((d) => d.type === "NOR" || d.type === "SI");
  const board = e.documents.filter((d) => d.type !== "NOR" && d.type !== "SI");
  const latest = new Map<string, (typeof e.results)[number]>();
  for (const r of e.results) {
    const k = r.classId ?? r.title;
    if (!latest.has(k)) latest.set(k, r);
  }
  const olderResults = e.results.filter((r) => !Array.from(latest.values()).includes(r));
  const myEntry = user ? e.entries.find((x) => x.userId === user.id) : undefined;
  const [boats, crew] = user && !myEntry
    ? await Promise.all([db.boat.findMany({ where: { userId: user.id } }), db.crewMember.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } })])
    : [[], []];
  const canEnter = e.entriesOpen && e.status === "PUBLISHED";
  const liveRaces = e.races.filter((r) => r.status === "SEQUENCE" || r.status === "RUNNING");

  return (
    <div className="space-y-6">
      {e.status === "DRAFT" && <div className="rounded-lg bg-amber-100 px-4 py-2 text-sm text-amber-900">{t.event.draftBanner}</div>}
      {e.status === "CANCELLED" && <div className="rounded-lg bg-red-100 px-4 py-2 text-sm font-semibold text-red-800">{t.event.cancelledBanner}</div>}

      <header className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-sea-600">{fmtRange(e.startDate, e.endDate, intl)}</p>
            <h1 className="text-2xl font-bold tracking-tight text-sea-900">{e.title}</h1>
            <p className="mt-1 text-slate-600">{[e.club?.name, e.venue].filter(Boolean).join(" · ")}</p>
            {e.classes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {e.classes.map((c) => <span key={c.id} className="badge bg-sea-100 text-sea-700">{c.name}</span>)}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && <Link href={`/manage/${e.id}`} className="btn">{t.common.edit}</Link>}
            {canEnter && !myEntry && <a href="#melden" className="btn">{t.event.enter}</a>}
            {e.entryUrl && <a href={e.entryUrl} className="btn-ghost" target="_blank" rel="noreferrer">{t.event.externalEntry} ↗</a>}
            <a href={`/e/${e.slug}/ics`} className="btn-ghost">{t.event.calendar}</a>
          </div>
        </div>
        <nav className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-sm font-medium text-sea-700">
          <a href="#dokumente">{t.event.docs}</a>
          <a href="#resultate">{t.event.results}</a>
          {e.races.length > 0 && <a href="#wettfahrten">{t.event.races}</a>}
          {(e.entries.length > 0 || canEnter) && <a href="#meldungen">{t.event.entries} ({e.entries.length})</a>}
          {e.schedule.length > 0 && <a href="#programm">{t.event.schedule}</a>}
          {(e.description || e.entryInfo) && <a href="#info">{t.event.info}</a>}
        </nav>
      </header>

      {liveRaces.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {liveRaces.map((r) => (
            <Link key={r.id} href={`/e/${e.slug}/race/${r.id}`} className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white shadow hover:bg-red-700">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" /> {t.event.liveStart}: {r.eventClass?.name ?? ""} {t.race.title} {r.number}
            </Link>
          ))}
        </div>
      )}

      <section id="dokumente" className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="h2">{t.event.norSi}</h2>
          {mainDocs.length === 0 ? <p className="text-sm text-slate-500">{t.event.notYet}</p> : (
            <ul className="space-y-2">{mainDocs.map((d) => <DocRow key={d.id} d={d} fresh={fresh(d.publishedAt)} t={t} intl={intl} />)}</ul>
          )}
        </div>
        <div className="card">
          <h2 className="h2">{t.event.board}</h2>
          {board.length === 0 ? <p className="text-sm text-slate-500">{t.event.noNotices}</p> : (
            <ul className="space-y-2">{board.map((d) => <DocRow key={d.id} d={d} fresh={fresh(d.publishedAt)} showType t={t} intl={intl} />)}</ul>
          )}
        </div>
      </section>

      {canEnter && (
        <section id="melden" className="card">
          <h2 className="h2">{t.entry.title}</h2>
          {!user ? (
            <p className="text-sm">{t.entry.loginFirst} <Link className="text-sea-600 underline" href={`/login?next=/e/${e.slug}%23melden`}>{t.nav.login}</Link> · <Link className="text-sea-600 underline" href={`/register?next=/e/${e.slug}%23melden`}>{t.auth.register}</Link></p>
          ) : myEntry ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 p-3 text-sm">
              <span className="font-semibold text-emerald-900">✓ {t.entry.done}</span>
              <span>{[myEntry.eventClass?.name, myEntry.sailNumber, myEntry.boatName, myEntry.skipper, myEntry.crew].filter(Boolean).join(" · ")}</span>
              <ConfirmButton action={withdrawEntry.bind(null, myEntry.id)} label={t.entry.withdraw} question={t.entry.withdrawQ} />
            </div>
          ) : (
            <EntryForm eventId={e.id} classes={e.classes.map((c) => ({ id: c.id, name: c.name }))} boats={boats} crew={crew.map((c) => ({ id: c.id, name: c.name }))} defaultSkipper={user.name} />
          )}
        </section>
      )}

      <section id="resultate" className="card">
        <h2 className="h2">{t.event.results}</h2>
        {latest.size === 0 && <p className="text-sm text-slate-500">{t.event.noResults}</p>}
        <div className="space-y-6">
          {[...latest.values()].map((r) => (
            <div key={r.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{r.eventClass?.name ?? r.title}</h3>
                {r.eventClass && r.title !== r.eventClass.name && <span className="text-sm text-slate-500">{r.title}</span>}
                <span className={`badge ${r.provisional ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{r.provisional ? t.event.provisional : t.event.final}</span>
                <span className="text-xs text-slate-500">{t.event.asOf} {fmtDateTime(r.publishedAt, intl)}</span>
                {r.fileKey && <a className="text-sm text-sea-600 underline" href={publicUrl(r.fileKey)} target="_blank" rel="noreferrer">{r.fileName ?? t.common.file}</a>}
              </div>
              {r.headers.length > 0 && Array.isArray(r.rows) && <ResultTable headers={r.headers} rows={r.rows as string[][]} />}
            </div>
          ))}
        </div>
        {olderResults.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-slate-500">{t.event.older} ({olderResults.length})</summary>
            <ul className="mt-2 space-y-1">
              {olderResults.map((r) => (
                <li key={r.id} className="text-slate-600">
                  {r.eventClass?.name ?? r.title} · {fmtDateTime(r.publishedAt, intl)} {r.fileKey && <a className="text-sea-600 underline" href={publicUrl(r.fileKey)}>{r.fileName}</a>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {e.races.length > 0 && (
        <section id="wettfahrten" className="card">
          <h2 className="h2">{t.event.races}</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {e.races.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
                <Link href={`/e/${e.slug}/race/${r.id}`} className="font-medium text-sea-700 underline">{r.eventClass?.name ?? ""} {t.race.title} {r.number}</Link>
                <span className="badge bg-slate-100 text-slate-700">{t.race.status[r.status]}</span>
                {r.startAt && <span className="text-slate-500">{t.race.startAt} {fmtTime(r.startAt, intl)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(e.entries.length > 0 || canEnter) && (
        <section id="meldungen" className="card">
          <h2 className="h2">{t.event.entries} ({e.entries.length})</h2>
          {e.entries.length > 0 && (
            <ResultTable
              headers={[t.common.class, t.event.sailNo, t.event.boat, t.event.skipper, t.event.crew, t.common.club]}
              rows={e.entries.map((x) => [x.eventClass?.name ?? "", x.sailNumber ?? "", x.boatName ?? "", x.skipper ?? "", x.crew ?? "", x.club ?? ""])}
            />
          )}
        </section>
      )}

      {e.schedule.length > 0 && (
        <section id="programm" className="card">
          <h2 className="h2">{t.event.schedule}</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {e.schedule.map((s) => (
              <li key={s.id} className="flex gap-4 py-2">
                <span className="w-40 shrink-0 font-medium text-sea-700">{fmtDate(s.at, { weekday: "short", day: "numeric", month: "short" }, intl)} {fmtTime(s.at, intl)}</span>
                <span>{s.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(e.description || e.entryInfo || e.contactEmail || e.sourceUrl) && (
        <section id="info" className="card space-y-3 text-sm">
          <h2 className="h2">{t.event.info}</h2>
          {e.description && <p className="whitespace-pre-line">{e.description}</p>}
          {e.entryInfo && <p className="whitespace-pre-line"><strong>{t.event.entryLabel}:</strong> {e.entryInfo}</p>}
          {e.contactEmail && <p><strong>{t.event.contact}:</strong> <a className="text-sea-600 underline" href={`mailto:${e.contactEmail}`}>{e.contactEmail}</a></p>}
          {e.club?.website && <p><strong>{t.common.club}:</strong> <a className="text-sea-600 underline" href={e.club.website}>{e.club.website}</a></p>}
          {e.sourceUrl && <p className="text-xs text-slate-500">{t.event.originally} <a className="underline" href={e.sourceUrl}>manage2sail</a></p>}
        </section>
      )}
    </div>
  );
}

function DocRow({ d, fresh, showType, t, intl }: { d: { type: keyof Dict["docTypes"]; title: string; fileKey: string; size: number; publishedAt: Date }; fresh: boolean; showType?: boolean; t: Dict; intl: string }) {
  return (
    <li>
      <a href={publicUrl(d.fileKey)} target="_blank" rel="noreferrer" className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 hover:border-sea-500 hover:bg-sea-50">
        <span className="mt-0.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">PDF</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{d.title}</span>
          <span className="block text-xs text-slate-500">
            {showType && `${t.docTypes[d.type]} · `}{fmtDateTime(d.publishedAt, intl)} · {fmtSize(d.size)}
          </span>
        </span>
        {fresh && <span className="badge bg-amber-100 text-amber-800">{t.common.new}</span>}
      </a>
    </li>
  );
}
