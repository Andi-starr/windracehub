import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { publicUrl } from "@/lib/storage";
import { DOC_TYPES, fmtDateTime, fmtRange, fmtSize, fmtTime, fmtDate } from "@/lib/format";
import { ResultTable } from "@/components/ResultTable";

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
    },
  });
}

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const e = await db.event.findUnique({ where: { slug: (await params).slug } });
  return { title: e?.title ?? "Regatta" };
}

export default async function EventPage({ params }: { params: P }) {
  const { slug } = await params;
  const [e, user] = await Promise.all([load(slug), currentUser()]);
  if (!e) notFound();
  const canEdit = user && (user.isAdmin || (await db.eventRole.findUnique({ where: { userId_eventId: { userId: user.id, eventId: e.id } } })));
  if (e.status === "DRAFT" && !canEdit) notFound();

  const fresh = (d: Date) => Date.now() - d.getTime() < 48 * 3600e3;
  const mainDocs = e.documents.filter((d) => d.type === "NOR" || d.type === "SI");
  const board = e.documents.filter((d) => d.type !== "NOR" && d.type !== "SI");
  // newest result per class (older versions stay reachable below)
  const latest = new Map<string, (typeof e.results)[number]>();
  for (const r of e.results) {
    const k = r.classId ?? r.title;
    if (!latest.has(k)) latest.set(k, r);
  }
  const olderResults = e.results.filter((r) => !Array.from(latest.values()).includes(r));

  return (
    <div className="space-y-6">
      {e.status === "DRAFT" && <div className="rounded-lg bg-amber-100 px-4 py-2 text-sm text-amber-900">Entwurf: nur für Organisatoren sichtbar.</div>}
      {e.status === "CANCELLED" && <div className="rounded-lg bg-red-100 px-4 py-2 text-sm font-semibold text-red-800">Diese Regatta ist abgesagt.</div>}

      <header className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-sea-600">{fmtRange(e.startDate, e.endDate)}</p>
            <h1 className="text-2xl font-bold tracking-tight text-sea-900">{e.title}</h1>
            <p className="mt-1 text-slate-600">{[e.club?.name, e.venue].filter(Boolean).join(" · ")}</p>
            {e.classes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {e.classes.map((c) => <span key={c.id} className="badge bg-sea-100 text-sea-700">{c.name}</span>)}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && <Link href={`/manage/${e.id}`} className="btn">Bearbeiten</Link>}
            {e.entryUrl && <a href={e.entryUrl} className="btn" target="_blank" rel="noreferrer">Anmelden</a>}
            <a href={`/e/${e.slug}/ics`} className="btn-ghost">In Kalender</a>
          </div>
        </div>
        <nav className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-sm font-medium text-sea-700">
          <a href="#dokumente">Dokumente</a>
          <a href="#resultate">Resultate</a>
          {e.entries.length > 0 && <a href="#meldungen">Meldeliste ({e.entries.length})</a>}
          {e.schedule.length > 0 && <a href="#programm">Programm</a>}
          {(e.description || e.entryInfo) && <a href="#info">Info</a>}
        </nav>
      </header>

      <section id="dokumente" className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="h2">Ausschreibung &amp; Segelanweisungen</h2>
          {mainDocs.length === 0 ? <p className="text-sm text-slate-500">Noch nicht veröffentlicht.</p> : (
            <ul className="space-y-2">{mainDocs.map((d) => <DocRow key={d.id} d={d} fresh={fresh(d.publishedAt)} />)}</ul>
          )}
        </div>
        <div className="card">
          <h2 className="h2">Offizielle Mitteilungen</h2>
          {board.length === 0 ? <p className="text-sm text-slate-500">Keine Mitteilungen.</p> : (
            <ul className="space-y-2">{board.map((d) => <DocRow key={d.id} d={d} fresh={fresh(d.publishedAt)} showType />)}</ul>
          )}
        </div>
      </section>

      <section id="resultate" className="card">
        <h2 className="h2">Resultate</h2>
        {latest.size === 0 && <p className="text-sm text-slate-500">Noch keine Resultate.</p>}
        <div className="space-y-6">
          {[...latest.values()].map((r) => (
            <div key={r.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{r.eventClass?.name ?? r.title}</h3>
                {r.eventClass && r.title !== r.eventClass.name && <span className="text-sm text-slate-500">{r.title}</span>}
                <span className={`badge ${r.provisional ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{r.provisional ? "Provisorisch" : "Final"}</span>
                <span className="text-xs text-slate-500">Stand {fmtDateTime(r.publishedAt)}</span>
                {r.fileKey && <a className="text-sm text-sea-600 underline" href={publicUrl(r.fileKey)} target="_blank" rel="noreferrer">{r.fileName ?? "Datei"}</a>}
              </div>
              {r.headers.length > 0 && Array.isArray(r.rows) && <ResultTable headers={r.headers} rows={r.rows as string[][]} />}
            </div>
          ))}
        </div>
        {olderResults.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-slate-500">Frühere Stände ({olderResults.length})</summary>
            <ul className="mt-2 space-y-1">
              {olderResults.map((r) => (
                <li key={r.id} className="text-slate-600">
                  {r.eventClass?.name ?? r.title} · {fmtDateTime(r.publishedAt)} {r.fileKey && <a className="text-sea-600 underline" href={publicUrl(r.fileKey)}>{r.fileName}</a>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {e.entries.length > 0 && (
        <section id="meldungen" className="card">
          <h2 className="h2">Meldeliste ({e.entries.length})</h2>
          <ResultTable
            headers={["Klasse", "Segelnr.", "Boot", "Steuermann/-frau", "Club"]}
            rows={e.entries.map((x) => [x.eventClass?.name ?? "", x.sailNumber ?? "", x.boatName ?? "", x.skipper ?? "", x.club ?? ""])}
          />
        </section>
      )}

      {e.schedule.length > 0 && (
        <section id="programm" className="card">
          <h2 className="h2">Programm</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {e.schedule.map((s) => (
              <li key={s.id} className="flex gap-4 py-2">
                <span className="w-36 shrink-0 font-medium text-sea-700">{fmtDate(s.at, { weekday: "short", day: "numeric", month: "short" })} {fmtTime(s.at)}</span>
                <span>{s.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(e.description || e.entryInfo || e.contactEmail || e.sourceUrl) && (
        <section id="info" className="card space-y-3 text-sm">
          <h2 className="h2">Info</h2>
          {e.description && <p className="whitespace-pre-line">{e.description}</p>}
          {e.entryInfo && <p className="whitespace-pre-line"><strong>Anmeldung:</strong> {e.entryInfo}</p>}
          {e.contactEmail && <p><strong>Kontakt:</strong> <a className="text-sea-600 underline" href={`mailto:${e.contactEmail}`}>{e.contactEmail}</a></p>}
          {e.club?.website && <p><strong>Club:</strong> <a className="text-sea-600 underline" href={e.club.website}>{e.club.website}</a></p>}
          {e.sourceUrl && <p className="text-xs text-slate-500">Ursprünglich auf <a className="underline" href={e.sourceUrl}>manage2sail</a></p>}
        </section>
      )}
    </div>
  );
}

function DocRow({ d, fresh, showType }: { d: { type: keyof typeof DOC_TYPES; title: string; fileKey: string; size: number; publishedAt: Date }; fresh: boolean; showType?: boolean }) {
  return (
    <li>
      <a href={publicUrl(d.fileKey)} target="_blank" rel="noreferrer" className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 hover:border-sea-500 hover:bg-sea-50">
        <span className="mt-0.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">PDF</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{d.title}</span>
          <span className="block text-xs text-slate-500">
            {showType && `${DOC_TYPES[d.type]} · `}{fmtDateTime(d.publishedAt)} · {fmtSize(d.size)}
          </span>
        </span>
        {fresh && <span className="badge bg-amber-100 text-amber-800">Neu</span>}
      </a>
    </li>
  );
}
