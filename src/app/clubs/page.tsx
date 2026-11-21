import Link from "next/link";
import { db } from "@/lib/db";
import { getT } from "@/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clubs" };

export default async function ClubsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { t } = await getT();
  const { q } = await searchParams;
  const clubs = await db.club.findMany({
    where: { events: { some: { status: { in: ["PUBLISHED", "CANCELLED"] } } }, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
    orderBy: { name: "asc" },
    include: { _count: { select: { events: { where: { status: { in: ["PUBLISHED", "CANCELLED"] } } } } } },
  });
  return (
    <div className="space-y-4">
      <h1 className="h1">{t.home.clubsTitle}</h1>
      <p className="text-sm text-slate-600">{t.home.clubsIntro}</p>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder={t.common.club} className="input max-w-sm" /><button className="btn-ghost">{t.common.search}</button></form>
      <ul className="grid gap-x-8 sm:grid-cols-2">
        {clubs.map((c) => (
          <li key={c.id}>
            <Link href={`/regatten?club=${c.id}&zeit=alle`} className="flex items-center justify-between gap-3 border-b border-ink/15 py-3 hover:bg-ink/5">
              <span><span className="font-semibold">{c.name}</span>{c.shortName && <span className="text-slate-500"> · {c.shortName}</span>}</span>
              <span className="text-[11px] font-medium uppercase tracking-wide tabular-nums">{c._count.events} {t.home.events}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
