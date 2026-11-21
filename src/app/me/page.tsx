import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getT } from "@/i18n";
import { fmtRange } from "@/lib/format";
import { ConfirmButton } from "@/components/ActionForms";
import { deleteBoat, withdrawEntry } from "../e/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "My entries" };

export default async function MePage() {
  const user = await requireUser();
  const { t, intl } = await getT();
  const [entries, boats] = await Promise.all([
    db.entry.findMany({ where: { userId: user.id }, include: { event: true, eventClass: true }, orderBy: { event: { startDate: "desc" } } }),
    db.boat.findMany({ where: { userId: user.id } }),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-sea-900">{t.entry.myTitle}</h1>
        <p className="text-sm text-slate-600">{user.name} · {user.email} · <span className="badge bg-slate-100 text-slate-700">{t.roles[user.role]}</span></p>
      </div>
      <section className="card">
        {entries.length === 0 ? <p className="text-sm text-slate-600">{t.entry.myEmpty} <Link href="/" className="text-sea-600 underline">{t.nav.regattas}</Link></p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {entries.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 py-2">
                <Link href={`/e/${x.event.slug}`} className="flex-1 font-semibold text-sea-700 underline">{x.event.title}</Link>
                <span className="text-slate-500">{fmtRange(x.event.startDate, x.event.endDate, intl)}</span>
                <span>{[x.eventClass?.name, x.sailNumber, x.boatName].filter(Boolean).join(" · ")}</span>
                {x.event.endDate >= new Date(new Date().toISOString().slice(0, 10)) && (
                  <ConfirmButton action={withdrawEntry.bind(null, x.id)} label={t.entry.withdraw} question={t.entry.withdrawQ} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2 className="h2">{t.entry.boats}</h2>
        {boats.length === 0 ? <p className="text-sm text-slate-500">{t.entry.noBoats}</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {boats.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2">
                <span className="flex-1">{[b.className, b.sailNumber, b.boatName].filter(Boolean).join(" · ")}{b.crew ? ` · ${t.event.crew}: ${b.crew}` : ""}</span>
                <form action={deleteBoat.bind(null, b.id)}><button className="btn-danger">{t.common.remove}</button></form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
