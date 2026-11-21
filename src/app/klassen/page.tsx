import Link from "next/link";
import { db } from "@/lib/db";
import { KNOWN_CLASSES } from "@/lib/classes";
import { getT } from "@/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Klassen" };

export default async function ClassesPage() {
  const { t } = await getT();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const year = today.getUTCFullYear();
  const listed = await db.eventClass.findMany({ distinct: ["name"], select: { name: true }, where: { event: { status: "PUBLISHED" } } });
  const names = [...new Set([...KNOWN_CLASSES, ...listed.map((c) => c.name.trim()).filter(Boolean)])];
  // same matching as the search: class listed on the event, or named in its title (imported events)
  const match = (n: string) => ({ OR: [{ classes: { some: { name: { equals: n, mode: "insensitive" as const } } } }, { title: { contains: n, mode: "insensitive" as const } }] });
  const counts = await Promise.all(names.map(async (n) => {
    const [upcoming, inYear] = await Promise.all([
      db.event.count({ where: { status: "PUBLISHED", endDate: { gte: today }, ...match(n) } }),
      db.event.count({ where: { status: "PUBLISHED", startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }, ...match(n) } }),
    ]);
    return { n, upcoming, inYear };
  }));
  const rows = counts.filter((c) => c.inYear + c.upcoming > 0).sort((a, b) => b.upcoming - a.upcoming || b.inYear - a.inYear || a.n.localeCompare(b.n));
  const c = t.classesPage;

  return (
    <div className="space-y-6">
      <h1 className="h1">{c.title}</h1>
      <p className="max-w-2xl text-[15px] leading-relaxed">{c.intro}</p>
      {rows.length === 0 && <p className="text-sm">{c.none}</p>}
      <ul className="grid gap-x-8 text-[11px] font-medium uppercase tracking-wide sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <li key={r.n}>
            <Link href={`/regatten?klasse=${encodeURIComponent(r.n)}&zeit=alle`} className="group flex items-end gap-2 border-b border-ink/15 py-3">
              <span className="text-base font-medium normal-case tracking-normal group-hover:underline">{r.n}</span>
              <span aria-hidden className="mb-1.5 min-w-4 flex-1" />
              <span className="shrink-0 text-right tabular-nums">
                <span className="block">{r.upcoming} {c.upcoming}</span>
                <span className="block text-ink/55">{r.inYear} {c.inYear.replace("{y}", String(year))}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
