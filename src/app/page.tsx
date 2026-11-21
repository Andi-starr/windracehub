import Link from "next/link";
import { Suspense } from "react";
import { Space_Grotesk } from "next/font/google";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { getT } from "@/i18n";
import { HomeLang } from "./HomeLang";

export const dynamic = "force-dynamic";

const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "700"] });
const DAY = 864e5;
const OR = "bg-[#ff5f1f]";

function Photo({ name, alt, big = false }: { name: string; alt: string; big?: boolean }) {
  const ws = big ? [1200, 2400] : [1200];
  return (
    <picture>
      <source type="image/webp" srcSet={ws.map((w) => `/img/${name}-${w}.webp ${w}w`).join(", ")} sizes={big ? "(min-width: 1024px) 60vw, 100vw" : "50vw"} />
      <img src={`/img/${name}-1200.jpg`} alt={alt} className="h-full w-full object-cover" loading={big ? "eager" : "lazy"} fetchPriority={big ? "high" : "auto"} />
    </picture>
  );
}

export default async function Start() {
  const [{ t, intl, locale }, user] = await Promise.all([getT(), currentUser()]);
  const s = t.start;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const year = today.getUTCFullYear();
  const pub = { status: "PUBLISHED" as const };
  const [next, season, clubs] = await Promise.all([
    db.event.findMany({ where: { ...pub, endDate: { gte: today } }, orderBy: [{ startDate: "asc" }, { title: "asc" }], take: 9, include: { club: true } }),
    db.event.count({ where: { ...pub, startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } }),
    db.club.count({ where: { events: { some: pub } } }),
  ]);
  const dd = (d: Date) => fmtDate(d, { day: "2-digit", month: "2-digit" }, intl);
  const when = (a: Date, b: Date) => (a.getTime() === b.getTime() ? dd(a) : `${dd(a)}–${dd(b)}`);
  const soon = (a: Date) => {
    const d = Math.round((a.getTime() - today.getTime()) / DAY);
    return d <= 0 ? s.running : d === 1 ? s.tomorrow : s.inDays.replace("{n}", String(d));
  };
  const navCell = "flex items-center border-l-2 border-[#151515] px-3 sm:px-5 text-[11px] sm:text-xs font-medium uppercase tracking-wide hover:bg-black/5";

  return (
    <div className={`${grotesk.className} relative -mt-6 mb-[-1.5rem] ml-[calc(50%-50vw)] w-screen bg-[#e3e5e8] text-[#151515]`}>
      {/* thin vertical grid lines over the whole page */}
      <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-6 px-4 sm:px-8 lg:grid-cols-12">
        {Array.from({ length: 12 }, (_, i) => <div key={i} className={`border-l border-[#151515]/10 ${i >= 6 ? "hidden lg:block" : ""}`} />)}
      </div>

      <div className="relative">
        {/* nav: boxed items, one solid orange cell */}
        <header className="flex min-h-12 flex-wrap items-stretch border-y-2 border-[#151515]">
          <Link href="/" className="flex items-center px-4 py-3 text-base font-bold tracking-tight sm:px-8">WINDRACEHUB</Link>
          <nav className="ml-auto flex flex-wrap items-stretch">
            <Link href="/regatten" className={navCell}>{t.nav.regattas}</Link>
            <Link href="/clubs" className={navCell}>{t.nav.clubs}</Link>
            <Link href={user ? "/me" : "/login"} className={navCell}>{user ? s.mine : s.login}</Link>
            <div className={navCell}><Suspense><HomeLang current={locale} /></Suspense></div>
            <Link href="/regatten" className={`flex items-center gap-2 px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-[#151515] sm:px-6 sm:text-xs ${OR} hover:brightness-105`}>{s.search} <span aria-hidden>→</span></Link>
          </nav>
        </header>

        <div className="px-4 sm:px-8">
          {/* meta row */}
          <div className="grid grid-cols-2 py-6 text-[11px] font-medium uppercase tracking-wide sm:grid-cols-3">
            <span>{s.meta1}</span>
            <span className="hidden text-center sm:block">{s.meta2}</span>
            <span className="text-right">{s.est}</span>
          </div>

          {/* badge · flow · intro */}
          <div className="grid items-start gap-8 pb-12 md:grid-cols-3">
            <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-[#151515] text-center text-white sm:h-32 sm:w-32">
              <span className="text-4xl font-medium leading-none tracking-tight">{season}</span>
              <span className="mt-1 text-[11px] leading-tight">{s.regattas}<br />{s.season} {year}</span>
            </div>
            <div className="text-[11px] font-medium uppercase tracking-wide">
              <div>{s.flow}</div>
              <div className="mt-1 text-[#151515]/55">{s.flowSub}</div>
            </div>
            <div>
              <p className="text-[15px] leading-relaxed">{s.intro}</p>
              <Link href="/regatten" className={`mt-6 inline-flex items-center gap-2 px-5 py-3 text-xs font-medium uppercase tracking-wide ${OR} hover:brightness-105`}>{s.all} <span aria-hidden>→</span></Link>
            </div>
          </div>

          {/* hero photo with orange bar · next regattas status panel */}
          <div className="grid gap-8 pb-14 lg:grid-cols-12">
            <div className="flex gap-6 lg:col-span-7">
              <div className={`hidden w-7 shrink-0 items-end justify-center pb-4 sm:flex ${OR}`}>
                <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wide [writing-mode:vertical-rl] rotate-180">{s.caption}</span>
              </div>
              <div className="aspect-[4/3] w-full overflow-hidden bg-[#151515] lg:aspect-auto lg:min-h-[30rem]">
                <Photo name="hero-m15" alt="M15, Zürichsee" big />
              </div>
            </div>

            <section className="lg:col-span-5">
              <h2 className="mb-3 text-xl font-medium uppercase tracking-tight">{s.next}</h2>
              {next.length === 0 && <p className="text-sm">{s.none}</p>}
              <ul className="text-[11px] font-medium uppercase tracking-wide">
                {next.map((e) => (
                  <li key={e.id}>
                    <Link href={`/e/${e.slug}`} className="group flex items-end gap-2 py-2">
                      <span className="min-w-0 shrink">
                        <span className="block truncate group-hover:underline">{e.title}</span>
                        <span className="block truncate text-[#151515]/55">{e.venue || e.club?.name || "–"}</span>
                      </span>
                      <span aria-hidden className="mb-1 min-w-6 flex-1 border-b border-[#151515]/40" />
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="block">{when(e.startDate, e.endDate)}</span>
                        <span className="block text-[#151515]/55">{soon(e.startDate)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between border-t-2 border-[#151515] pt-3 text-[11px] font-medium uppercase tracking-wide">
                <span>{s.clubs}: {clubs}</span>
                <Link href="/regatten" className="hover:underline">{s.all} →</Link>
              </div>
            </section>
          </div>

          {/* photo row */}
          <div className="grid grid-cols-2 gap-6 pb-12 lg:grid-cols-4">
            <div className="aspect-[4/3] overflow-hidden"><Photo name="fleet-zurich" alt="Zürichsee" /></div>
            <div className="aspect-[4/3] overflow-hidden"><Photo name="opti-mountains" alt="Optimist" /></div>
            <div className="aspect-[4/3] overflow-hidden"><Photo name="opti-close" alt="Optimist" /></div>
            <div className="aspect-[4/3] overflow-hidden"><Photo name="rainbow" alt="Zürichsee" /></div>
          </div>
        </div>

        <footer className="flex flex-wrap justify-between gap-2 border-t-2 border-[#151515] px-4 py-4 text-[11px] font-medium uppercase tracking-wide sm:px-8">
          <span>windracehub</span><span>{t.footer}</span>
        </footer>
      </div>
    </div>
  );
}
