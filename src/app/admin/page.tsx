import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getT } from "@/i18n";
import { fmtDate } from "@/lib/format";
import { setUserRole } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireRole("ADMIN");
  const { t, intl } = await getT();
  const { q } = await searchParams;
  const users = await db.user.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: [{ role: "asc" }, { createdAt: "desc" }], take: 200,
    include: { _count: { select: { entries: true, roles: true } } },
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-sea-900">{t.admin.title}</h1>
      <p className="text-sm text-slate-600">{t.admin.intro}</p>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder={`${t.common.name} / ${t.common.email}`} className="input max-w-sm" /><button className="btn-ghost">{t.common.search}</button></form>
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white text-sm shadow-sm">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1"><span className="font-semibold">{u.name}</span> <span className="text-slate-500">{u.email}</span>
              <span className="block text-xs text-slate-400">{t.admin.since} {fmtDate(u.createdAt, undefined, intl)} · {u._count.entries} {t.nav.myEntries} · {u._count.roles} {t.nav.myEvents}</span></span>
            {u.id === me.id ? <span className="badge bg-sea-100 text-sea-700">{t.roles[u.role]}</span> : (
              <form action={setUserRole.bind(null, u.id)} className="flex gap-2">
                <select name="role" defaultValue={u.role} className="input py-1" aria-label={t.admin.role}>
                  {(["PARTICIPANT", "HOST", "ADMIN"] as const).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
                </select>
                <button className="btn-ghost px-3 py-1">{t.common.save}</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
