import Link from "next/link";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { getT } from "@/i18n";

export const dynamic = "force-dynamic";

const DAY = 864e5;
const ORANGE = "#f05a1a";

function Photo({ name, alt, className, big = false }: { name: string; alt: string; className?: string; big?: boolean }) {
  const sizes = big ? [1200, 2400] : [1200];
  return (
    <picture>
      <source type="image/webp" srcSet={sizes.map((w) => `/img/${name}-${w}.webp ${w}w`).join(", ")} sizes="100vw" />
      <img src={`/img/${name}-1200.jpg`} srcSet={sizes.map((w) => `/img/${name}-${w}.jpg ${w}w`).join(", ")} sizes="100vw" alt={alt}
        className={`h-full w-full object-cover ${className ?? ""}`} loading={big ? "eager" : "lazy"} fetchPriority={big ? "high" : "auto"} />
    </picture>
  );
}

export default async function Start() {
  const { t, intl } = await getT();
  const s = t.start;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const pub = { status: "PUBLISHED" as const };
  const year = today.getUTCFullYear();
  const [next, week, month, season, clubs] = await Promise.all([
    db.event.findMany({ where: { ...pub, endDate: { gte: today } }, orderBy: [{ startDate: "asc" }, { title: "asc" }], take: 8, include: { club: true } }),
    db.event.count({ where: { ...pub, endDate: { gte: today }, startDate: { lt: new Date(today.getTime() + 7 * DAY) } } }),
    db.event.count({ where: { ...pub, endDate: { gte: today }, startDate: { lt: new Date(today.getTime() + 30 * DAY) } } }),
    db.event.count({ where: { ...pub, startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } }),
    db.club.count({ where: { events: { some: pub } } }),
  ]);

  const when = (a: Date, b: Date) => {
    const d = Math.round((a.getTime() - today.getTime()) / DAY);
    if (d <= 0 && b >= today) return d === 0 ? s.today : s.running;
    if (d === 1) return s.tomorrow;
    return s.inDays.replace("{n}", String(d));
  };
  const first = next[0];
  const day = (d: Date) => fmtDate(d, { day: "2-digit" }, intl);
  const mon = (d: Date) => fmtDate(d, { month: "short" }, intl).replace(".", "");
  const wd = (d: Date) => fmtDate(d, { weekday: "short" }, intl).replace(".", "");

  return (
    // full-bleed editorial page inside the site's centred <main>
    <div className="relative -mt-6 mb-[-1.5rem] ml-[calc(50%-50vw)] w-screen overflow-hidden bg-[#eceeef] text-[#111]">
      {/* thin vertical grid lines */}
      <div aria-hidden className="pointer-events-none absolute inset-0 mx-auto grid max-w-5xl grid-cols-4 px-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="border-l border-black/10 last:border-r" />)}
      </div>

      {/* hero */}
      <section className="relative mx-auto max-w-5xl px-4 pt-8 sm:pt-12">
        <div className="flex items-end justify-between gap-4 border-b border-black/80 pb-3 text-xs font-semibold uppercase tracking-[0.18em]">
          <span>{s.kicker}</span><span>{s.season} {year}</span>
        </div>
        <h1 className="mt-6 max-w-4xl text-5xl font-black leading-[0.92] tracking-tight sm:text-7xl lg:text-8xl">{s.title}</h1>
        <div className="relative mt-8 aspect-[16/10] overflow-hidden sm:aspect-[21/9]">
          <Photo name="hero-m15" alt="M15 start line, Lake Zurich" big />
          <div className="absolute right-4 top-4 flex h-28 w-28 flex-col items-center justify-center rounded-full text-center text-white shadow-lg sm:right-8 sm:top-8 sm:h-36 sm:w-36" style={{ background: ORANGE }}>
            <span className="text-4xl font-black leading-none sm:text-5xl">{season}</span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider">{s.regattas} {year}</span>
          </div>
          <div className="absolute bottom-0 left-0 flex flex-wrap gap-2 p-4 sm:p-6">
            <Link href="/regatten" className="rounded-full px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white shadow hover:brightness-110" style={{ background: ORANGE }}>{s.all} →</Link>
          </div>
        </div>
      </section>

      {/* next events + status panel */}
      <section className="relative mx-auto grid max-w-5xl gap-8 px-4 py-12 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <div className="mb-4 flex items-end justify-between border-b border-black/80 pb-2">
            <h2 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{s.next}</h2>
            <Link href="/regatten" className="text-xs font-semibold uppercase tracking-wider hover:underline">{s.all} →</Link>
          </div>
          {next.length === 0 && <p className="py-6 text-sm">{s.none}</p>}
          <ol>
            {next.map((e) => (
              <li key={e.id} className="border-b border-black/15">
                <Link href={`/e/${e.slug}`} className="group grid grid-cols-[4.5rem_1fr] items-center gap-4 py-4 sm:grid-cols-[6rem_1fr_auto]">
                  <div className="leading-none">
                    <div className="text-4xl font-black tabular-nums sm:text-5xl">{day(e.startDate)}</div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-wider">{mon(e.startDate)} · {wd(e.startDate)}{e.endDate > e.startDate ? `–${day(e.endDate)}.` : ""}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-lg font-bold group-hover:underline sm:text-xl">{e.title}</div>
                    <div className="truncate text-sm text-black/60">📍 {e.venue || e.club?.name || "–"}{e.venue && e.club ? ` · ${e.club.shortName || e.club.name}` : ""}</div>
                  </div>
                  <span className="col-start-2 justify-self-start rounded-full border border-black/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide sm:col-start-auto">{when(e.startDate, e.endDate)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>

        <aside className="space-y-6">
          <div className="bg-[#111] p-5 font-mono text-sm text-white">
            <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/60">
              <span className="h-2 w-2 rounded-full" style={{ background: ORANGE }} /> {s.statusTitle}
            </div>
            <dl className="divide-y divide-white/15">
              {first && (
                <div className="py-2">
                  <dt className="text-[11px] uppercase tracking-wider text-white/50">{s.nextRace}</dt>
                  <dd className="mt-0.5 font-sans font-semibold leading-snug">{first.title}</dd>
                  <dd className="text-white/70">{fmtDate(first.startDate, { day: "numeric", month: "short" }, intl)} · {when(first.startDate, first.endDate)}</dd>
                </div>
              )}
              {[[s.thisWeek, week], [s.thisMonth, month], [`${s.season} ${year}`, season], [s.clubs, clubs]].map(([k, v]) => (
                <div key={String(k)} className="flex items-baseline justify-between py-2">
                  <dt className="text-[11px] uppercase tracking-wider text-white/50">{k}</dt>
                  <dd className="text-lg font-bold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <form action="/regatten" method="get" className="space-y-2">
            <label htmlFor="start-q" className="text-xs font-semibold uppercase tracking-wider">{s.search}</label>
            <div className="flex">
              <input id="start-q" name="q" placeholder={s.searchPh} className="min-w-0 flex-1 border border-black/70 bg-white px-3 py-2 text-sm focus:outline-none" />
              <button className="px-4 text-sm font-bold text-white" style={{ background: ORANGE }} aria-label={s.search}>→</button>
            </div>
          </form>
        </aside>
      </section>

      {/* photo strip */}
      <section className="relative mx-auto max-w-5xl px-4 pb-14">
        <div className="mb-4 border-b border-black/80 pb-2 text-xs font-semibold uppercase tracking-[0.18em]">{s.photos}</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="col-span-2 aspect-[16/10] overflow-hidden"><Photo name="fleet-zurich" alt="Fleet on Lake Zurich" /></div>
          <div className="aspect-square overflow-hidden sm:aspect-auto"><Photo name="opti-close" alt="Optimist close up" /></div>
          <div className="aspect-square overflow-hidden sm:aspect-auto"><Photo name="opti-mountains" alt="Optimist fleet in the mountains" /></div>
        </div>
      </section>
    </div>
  );
}
