import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { fmtRange, fmtDate } from "@/lib/format";
import { KNOWN_CLASSES } from "@/lib/classes";
import { getT } from "@/i18n";

export const dynamic = "force-dynamic";

type SP = Promise<{ q?: string; club?: string; klasse?: string; zeit?: string; jahr?: string; monat?: string }>;

export default async function Regatten({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { t, intl } = await getT();
  const year = /^\d{4}$/.test(sp.jahr ?? "") ? Number(sp.jahr) : null;
  const month = /^(1[0-2]|[1-9])$/.test(sp.monat ?? "") ? Number(sp.monat) : null;
  // an explicit year/month shows that whole period; otherwise upcoming (default) / past / all
  const zeit = year || month ? "alle" : sp.zeit === "vergangen" || sp.zeit === "alle" ? sp.zeit : "kommend";
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const y = year ?? today.getUTCFullYear();
  const range = month
    ? { startDate: { lt: new Date(Date.UTC(y, month, 1)) }, endDate: { gte: new Date(Date.UTC(y, month - 1, 1)) } }
    : year ? { startDate: { lt: new Date(Date.UTC(y + 1, 0, 1)) }, endDate: { gte: new Date(Date.UTC(y, 0, 1)) } }
    : zeit === "kommend" ? { endDate: { gte: today } } : zeit === "vergangen" ? { endDate: { lt: today } } : {};

  const where: Prisma.EventWhereInput = {
    status: { in: ["PUBLISHED", "CANCELLED"] },
    ...range,
    ...(sp.club ? { clubId: sp.club } : {}),
    ...(sp.klasse
      ? { OR: [
          { classes: { some: { name: { equals: sp.klasse, mode: "insensitive" } } } },
          { title: { contains: sp.klasse, mode: "insensitive" } }, // imported events often name the class only in the title
        ] }
      : {}),
    ...(sp.q
      ? { AND: [{ OR: [
          { title: { contains: sp.q, mode: "insensitive" } },
          { venue: { contains: sp.q, mode: "insensitive" } },
          { club: { name: { contains: sp.q, mode: "insensitive" } } },
        ] }] }
      : {}),
  };

  const since = new Date(Date.now() - 48 * 3600e3);
  const [events, total, clubs, classNames, years] = await Promise.all([
    db.event.findMany({
      where,
      orderBy: { startDate: zeit === "vergangen" ? "desc" : "asc" },
      take: 300,
      include: {
        club: true,
        classes: { orderBy: { position: "asc" } },
        _count: { select: { documents: { where: { publishedAt: { gte: since } } }, results: { where: { publishedAt: { gte: since } } } } },
      },
    }),
    db.event.count({ where }),
    db.club.findMany({ orderBy: { name: "asc" }, where: { events: { some: { status: { in: ["PUBLISHED", "CANCELLED"] } } } } }),
    db.eventClass.findMany({ distinct: ["name"], select: { name: true }, where: { event: { status: "PUBLISHED" } } }),
    db.$queryRaw<{ y: number }[]>`SELECT DISTINCT EXTRACT(YEAR FROM "startDate")::int AS y FROM "Event" WHERE status <> 'DRAFT' ORDER BY y DESC`,
  ]);
  const allClasses = [...new Set([...KNOWN_CLASSES, ...classNames.map((c) => c.name)])].sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
  const monthName = (m: number) => fmtDate(new Date(Date.UTC(2026, m - 1, 1)), { month: "long" }, intl);
  const filtered = !!(sp.q || sp.club || sp.klasse || year || month || sp.zeit);

  const groups = new Map<string, typeof events>();
  for (const e of events) {
    const k = fmtDate(e.startDate, { month: "long", year: "numeric" }, intl);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight text-sea-900">{t.home.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{t.home.subtitle}</p>
      </section>

      <form className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6" method="get">
        <div className="col-span-2 sm:col-span-3 lg:col-span-2">
          <label className="label" htmlFor="q">{t.common.search}</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder={t.home.searchPh} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="jahr">{t.home.year}</label>
          <select id="jahr" name="jahr" defaultValue={year ?? ""} className="input">
            <option value="">{t.home.allYears}</option>
            {years.map((x) => <option key={x.y} value={x.y}>{x.y}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="monat">{t.home.month}</label>
          <select id="monat" name="monat" defaultValue={month ?? ""} className="input">
            <option value="">{t.home.allMonths}</option>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="klasse">{t.common.class}</label>
          <select id="klasse" name="klasse" defaultValue={sp.klasse ?? ""} className="input">
            <option value="">{t.home.allClasses}</option>
            {allClasses.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="zeit">{t.home.period}</label>
          <select id="zeit" name="zeit" defaultValue={zeit} className="input">
            <option value="kommend">{t.home.upcoming}</option>
            <option value="vergangen">{t.home.past}</option>
            <option value="alle">{t.home.allPeriods}</option>
          </select>
        </div>
        <div className="col-span-2 sm:col-span-2 lg:col-span-3">
          <label className="label" htmlFor="club">{t.common.club}</label>
          <select id="club" name="club" defaultValue={sp.club ?? ""} className="input">
            <option value="">{t.home.allClubs}</option>
            {clubs.map((c) => <option key={c.id} value={c.id}>{c.shortName ? `${c.shortName}, ${c.name}` : c.name}</option>)}
          </select>
        </div>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-1 lg:col-span-3">
          <button className="btn">{t.common.filter}</button>
          {filtered && <Link href="/regatten" className="btn-ghost">{t.home.reset}</Link>}
          <span className="ml-auto self-center text-sm text-slate-500">{total} {t.home.count}</span>
        </div>
      </form>

      {events.length === 0 && <p className="card text-slate-600">{t.home.noneFound}</p>}
      {zeit === "kommend" && !filtered && events.length < 5 && (
        <p className="text-sm text-slate-600">{t.home.seasonOver} <Link className="text-sea-600 underline" href="/?zeit=vergangen">{t.home.showPast}</Link></p>
      )}

      {[...groups].map(([monthLabel, list]) => (
        <section key={monthLabel}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{monthLabel}</h2>
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {list.map((e) => {
              const fresh = e._count.documents + e._count.results > 0;
              return (
                <li key={e.id}>
                  <Link href={`/e/${e.slug}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-sea-50 sm:flex-row sm:items-center sm:gap-4">
                    <div className="w-40 shrink-0 text-sm font-medium text-sea-700">{fmtRange(e.startDate, e.endDate, intl)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-semibold ${e.status === "CANCELLED" ? "text-slate-400 line-through" : ""}`}>{e.title}</span>
                        {e.status === "CANCELLED" && <span className="badge bg-red-100 text-red-700">{t.home.cancelled}</span>}
                        {fresh && <span className="badge bg-amber-100 text-amber-800">{t.common.new}</span>}
                        {e.entriesOpen && e.status === "PUBLISHED" && <span className="badge bg-emerald-100 text-emerald-800">{t.home.entriesOpen}</span>}
                      </div>
                      <div className="truncate text-sm text-slate-500">{[e.venue, e.club?.name].filter(Boolean).join(" · ")}</div>
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
