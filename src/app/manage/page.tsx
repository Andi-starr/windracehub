import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtRange } from "@/lib/format";

export const metadata = { title: "Meine Events" };
export const dynamic = "force-dynamic";

const STATUS = { DRAFT: ["Entwurf", "bg-amber-100 text-amber-800"], PUBLISHED: ["Öffentlich", "bg-emerald-100 text-emerald-800"], CANCELLED: ["Abgesagt", "bg-red-100 text-red-700"] } as const;

export default async function ManagePage() {
  const user = await requireUser();
  const events = await db.event.findMany({
    where: user.isAdmin ? {} : { roles: { some: { userId: user.id } } },
    orderBy: { startDate: "desc" },
    include: { club: true, roles: { where: { userId: user.id } }, _count: { select: { documents: true, results: true } } },
  });
  const today = new Date(new Date().toISOString().slice(0, 10));
  const upcoming = events.filter((e) => e.endDate >= today).reverse();
  const past = events.filter((e) => e.endDate < today);

  const Row = ({ e }: { e: (typeof events)[number] }) => {
    const [label, cls] = STATUS[e.status];
    const role = e.roles[0]?.role ?? (user.isAdmin ? "HOST" : undefined);
    return (
      <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
        <Link href={`/manage/${e.id}`} className="min-w-0 flex-1 hover:underline">
          <span className="block font-semibold">{e.title}</span>
          <span className="block text-sm text-slate-500">{fmtRange(e.startDate, e.endDate)} · {e.club?.shortName || e.club?.name || "ohne Club"} · {e._count.documents} Dokumente · {e._count.results} Resultate</span>
        </Link>
        <span className={`badge ${cls}`}>{label}</span>
        {role === "OFFICIAL" && <span className="badge bg-slate-100 text-slate-600">Wettfahrtleitung</span>}
        <div className="flex gap-2">
          <Link href={`/manage/${e.id}`} className="btn">Öffnen</Link>
          {role === "HOST" && <Link href={`/manage/new?copy=${e.id}`} className="btn-ghost" title="Für nächstes Jahr kopieren">Kopieren</Link>}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-sea-900">Hallo {user.name.split(" ")[0]}</h1>
          <p className="text-sm text-slate-600">{user.isAdmin ? "Admin: du siehst alle Regatten." : "Deine Regatten."}</p>
        </div>
        <Link href="/manage/new" className="btn">+ Neue Regatta</Link>
      </div>
      {events.length === 0 && (
        <div className="card text-slate-600">Noch keine Regatten. Erstelle die erste mit <strong>+ Neue Regatta</strong>, oder lass dich von einem Organisator einladen.</div>
      )}
      {upcoming.length > 0 && (
        <section><h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Kommend</h2>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">{upcoming.map((e) => <Row key={e.id} e={e} />)}</ul></section>
      )}
      {past.length > 0 && (
        <section><h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Vergangen</h2>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">{past.map((e) => <Row key={e.id} e={e} />)}</ul></section>
      )}
    </div>
  );
}
