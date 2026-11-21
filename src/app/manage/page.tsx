import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { canHost, requireUser } from "@/lib/auth";
import { getT } from "@/i18n";
import { fmtRange } from "@/lib/format";

export const metadata = { title: "Meine Events" };
export const dynamic = "force-dynamic";

const STATUS = { DRAFT: "bg-amber-100 text-amber-800", PUBLISHED: "bg-emerald-100 text-emerald-800", CANCELLED: "bg-red-100 text-red-700" } as const;

export default async function ManagePage() {
  const user = await requireUser();
  const { t, intl } = await getT();
  if (!canHost(user) && (await db.eventRole.count({ where: { userId: user.id } })) === 0) redirect("/me");
  const events = await db.event.findMany({
    where: user.role === "ADMIN" ? {} : { roles: { some: { userId: user.id } } },
    orderBy: { startDate: "desc" },
    include: { club: true, roles: { where: { userId: user.id } }, _count: { select: { documents: true, results: true } } },
  });
  const today = new Date(new Date().toISOString().slice(0, 10));
  const upcoming = events.filter((e) => e.endDate >= today).reverse();
  const past = events.filter((e) => e.endDate < today);

  const Row = ({ e }: { e: (typeof events)[number] }) => {
    const label = t.status[e.status], cls = STATUS[e.status];
    const role = e.roles[0]?.role ?? (user.role === "ADMIN" ? "HOST" : undefined);
    return (
      <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
        <Link href={`/manage/${e.id}`} className="min-w-0 flex-1 hover:underline">
          <span className="block font-semibold">{e.title}</span>
          <span className="block text-sm text-slate-500">{fmtRange(e.startDate, e.endDate, intl)} · {e.club?.shortName || e.club?.name || t.manage.noClub} · {e._count.documents} {t.manage.documents} · {e._count.results} {t.event.results}</span>
        </Link>
        <span className={`badge ${cls}`}>{label}</span>
        {role === "OFFICIAL" && <span className="badge bg-slate-100 text-slate-600">{t.roles.OFFICIAL}</span>}
        <div className="flex gap-2">
          <Link href={`/manage/${e.id}`} className="btn">{t.common.open}</Link>
          {role === "HOST" && <Link href={`/manage/new?copy=${e.id}`} className="btn-ghost" title={t.manage.copyNextYear}>{t.common.copy}</Link>}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">{t.manage.hello} {user.name.split(" ")[0]}</h1>
          <p className="text-sm text-slate-600">{user.role === "ADMIN" ? t.manage.adminSees : t.manage.yours} <span className="badge bg-slate-100 text-slate-600">{t.roles[user.role]}</span></p>
        </div>
        {canHost(user) && <Link href="/manage/new" className="btn">{t.manage.newEvent}</Link>}
      </div>
      {events.length === 0 && (
        <div className="card text-slate-600">{t.manage.empty}</div>
      )}
      {upcoming.length > 0 && (
        <section><h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">{t.manage.upcoming}</h2>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">{upcoming.map((e) => <Row key={e.id} e={e} />)}</ul></section>
      )}
      {past.length > 0 && (
        <section><h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">{t.manage.past}</h2>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">{past.map((e) => <Row key={e.id} e={e} />)}</ul></section>
      )}
    </div>
  );
}
