import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fmtRange, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type SP = Promise<{ q?: string; club?: string; klasse?: string; zeit?: string }>;

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const zeit = sp.zeit === "vergangen" ? "vergangen" : "kommend";
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

  const where: Prisma.EventWhereInput = {
    status: { in: ["PUBLISHED", "CANCELLED"] },
    ...(zeit === "kommend" ? { endDate: { gte: today } } : { endDate: { lt: today } }),
    ...(sp.club ? { clubId: sp.club } : {}),
    ...(sp.klasse ? { classes: { some: { name: { equals: sp.klasse, mode: "insensitive" } } } } : {}),
    ...(sp.q
      ? { OR: [
          { title: { contains: sp.q, mode: "insensitive" } },
          { venue: { contains: sp.q, mode: "insensitive" } },
          { club: { name: { contains: sp.q, mode: "insensitive" } } },
        ] }
      : {}),
  };

  const since = new Date(Date.now() - 48 * 3600e3);
  const [events, clubs, classNames] = await Promise.all([
    db.event.findMany({
      where,
      orderBy: { startDate: zeit === "kommend" ? "asc" : "desc" },
      take: 200,
      include: {
        club: true,
        classes: { orderBy: { position: "asc" } },
        _count: {
          select: {
            documents: { where: { publishedAt: { gte: since } } },
            results: { where: { publishedAt: { gte: since } } },
          },
        },
      },
    }),
    db.club.findMany({ orderBy: { name: "asc" }, where: { events: { some: { status: "PUBLISHED" } } } }),
    db.eventClass.findMany({ distinct: ["name"], select: { name: true }, orderBy: { name: "asc" }, where: { event: { status: "PUBLISHED" } } }),
  ]);

  const groups = new Map<string, typeof events>();
  for (const e of events) {
    const k = fmtDate(e.startDate, { month: "long", year: "numeric" });
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight text-sea-900">Regatten in der Region Zürich</h1>
        <p className="mt-1 text-sm text-slate-600">Ausschreibungen, Segelanweisungen, Mitteilungen und Resultate an einem Ort.</p>
      </section>

      <form className="card flex flex-wrap items-end gap-3 p-4" method="get">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="q">Suche</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="Regatta, Ort oder Club" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="club">Club</label>
          <select id="club" name="club" defaultValue={sp.club ?? ""} className="input">
            <option value="">Alle Clubs</option>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.shortName || c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="klasse">Klasse</label>
          <select id="klasse" name="klasse" defaultValue={sp.klasse ?? ""} className="input">
            <option value="">Alle Klassen</option>
            {classNames.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="zeit">Zeitraum</label>
          <select id="zeit" name="zeit" defaultValue={zeit} className="input">
            <option value="kommend">Kommende</option>
            <option value="vergangen">Vergangene</option>
          </select>
        </div>
        <button className="btn">Filtern</button>
      </form>

      {events.length === 0 && <p className="card text-slate-600">Keine Regatten gefunden.</p>}
      {zeit === "kommend" && events.length < 5 && (
        <p className="text-sm text-slate-600">Die Saison ist fast vorbei. <Link className="text-sea-600 underline" href="/?zeit=vergangen">Vergangene Regatten mit Resultaten anzeigen</Link></p>
      )}

      {[...groups].map(([month, list]) => (
        <section key={month}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{month}</h2>
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {list.map((e) => {
              const fresh = e._count.documents + e._count.results > 0;
              return (
                <li key={e.id}>
                  <Link href={`/e/${e.slug}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-sea-50 sm:flex-row sm:items-center sm:gap-4">
                    <div className="w-40 shrink-0 text-sm font-medium text-sea-700">{fmtRange(e.startDate, e.endDate)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-semibold ${e.status === "CANCELLED" ? "text-slate-400 line-through" : ""}`}>{e.title}</span>
                        {e.status === "CANCELLED" && <span className="badge bg-red-100 text-red-700">Abgesagt</span>}
                        {fresh && <span className="badge bg-amber-100 text-amber-800">Neu</span>}
                      </div>
                      <div className="truncate text-sm text-slate-500">
                        {[e.club?.shortName || e.club?.name, e.venue].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {e.classes.slice(0, 4).map((c) => <span key={c.id} className="badge bg-slate-100 text-slate-700">{c.name}</span>)}
                      {e.classes.length > 4 && <span className="badge bg-slate-100 text-slate-500">+{e.classes.length - 4}</span>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
