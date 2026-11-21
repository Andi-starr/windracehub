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
      <h1 className="text-2xl font-bold text-sea-900">{t.home.clubsTitle}</h1>
      <p className="text-sm text-slate-600">{t.home.clubsIntro}</p>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder={t.common.club} className="input max-w-sm" /><button className="btn-ghost">{t.common.search}</button></form>
      <ul className="grid gap-2 sm:grid-cols-2">
        {clubs.map((c) => (
          <li key={c.id}>
            <Link href={`/regatten?club=${c.id}&zeit=alle`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-sea-500">
              <span><span className="font-semibold">{c.name}</span>{c.shortName && <span className="text-slate-500"> · {c.shortName}</span>}</span>
              <span className="badge bg-sea-100 text-sea-700">{c._count.events} {t.home.events}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
