import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getT } from "@/i18n";
import { fmtDate } from "@/lib/format";
import { mailEnabled } from "@/lib/mail";
import { ConfirmButton } from "@/components/ActionForms";
import { CreateHostForm, ResetLinkButton } from "@/components/AdminForms";
import { createTestEvent, deleteUser, setUserRole } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireRole("ADMIN");
  const { t, intl } = await getT();
  const { q } = await searchParams;
  const users = await db.user.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: [{ createdAt: "desc" }], take: 500,
    include: { _count: { select: { entries: true, roles: true } } },
  });
  const groups = [
    { key: "HOST" as const, title: t.accounts.hosts },
    { key: "PARTICIPANT" as const, title: t.accounts.participants },
    { key: "ADMIN" as const, title: t.accounts.admins },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">{t.admin.title}</h1>
        <p className="text-sm text-slate-600">{t.admin.intro}</p>
      </div>
      {!mailEnabled() && <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">{t.accounts.mailOff}</p>}

      <section className="card">
        <h2 className="h2">{t.accounts.createHost}</h2>
        <p className="mb-3 text-sm text-slate-600">{t.accounts.createHostIntro}</p>
        <CreateHostForm />
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="h2 mb-1">{t.admin.testEvent}</h2>
          <p className="text-sm text-slate-600">{t.admin.testEventHint}</p>
        </div>
        <form action={createTestEvent}><button className="btn">{t.admin.testEventBtn}</button></form>
      </section>

      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder={`${t.common.name} / ${t.common.email}`} className="input max-w-sm" /><button className="btn-ghost">{t.common.search}</button></form>

      {groups.map((g) => {
        const list = users.filter((u) => u.role === g.key);
        return (
          <section key={g.key} className="card">
            <h2 className="h2">{g.title} ({list.length})</h2>
            {g.key === "PARTICIPANT" && <p className="mb-3 text-xs text-slate-500">{t.accounts.autoDelete}</p>}
            <ul className="divide-y divide-slate-100 text-sm">
              {list.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{u.name}</span> <span className="text-slate-500">{u.email}</span>
                    <span className="block text-xs text-slate-400">
                      {t.admin.since} {fmtDate(u.createdAt, undefined, intl)} · {t.accounts.lastActive} {fmtDate(u.lastActiveAt, undefined, intl)} · {u._count.entries} {t.event.entries} · {u._count.roles} {t.home.events}
                    </span>
                  </span>
                  {u.id !== me.id && (
                    <>
                      <form action={setUserRole.bind(null, u.id)} className="flex gap-1">
                        <select name="role" defaultValue={u.role} className="input py-1 text-xs" aria-label={t.admin.role}>
                          {(["PARTICIPANT", "HOST", "ADMIN"] as const).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
                        </select>
                        <button className="btn-ghost px-2 py-1 text-xs">{t.common.save}</button>
                      </form>
                      <ResetLinkButton userId={u.id} />
                      {u.role !== "ADMIN" && <ConfirmButton action={deleteUser.bind(null, u.id)} label={t.accounts.deleteUser} question={`${u.email}: ${t.accounts.deleteQ}`} />}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
