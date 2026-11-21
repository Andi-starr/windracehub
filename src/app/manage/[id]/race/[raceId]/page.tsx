import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireEventRole } from "@/lib/auth";
import { getT } from "@/i18n";
import { RaceClock } from "@/components/race/RaceClock";
import { FinishRecorder } from "@/components/race/FinishRecorder";
import { ResultTable } from "@/components/ResultTable";
import { scoreSeries, seriesTable } from "@/lib/scoring";
import { publishSeries } from "@/app/manage/races";

export const dynamic = "force-dynamic";
export const metadata = { title: "Race" };

export default async function RacePage({ params }: { params: Promise<{ id: string; raceId: string }> }) {
  const { id, raceId } = await params;
  await requireEventRole(id, "HELPER");
  const { t } = await getT();
  const race = await db.race.findFirst({ where: { id: raceId, eventId: id }, include: { eventClass: true, event: true, finishes: true } });
  if (!race) notFound();
  const [entries, allRaces] = await Promise.all([
    db.entry.findMany({ where: { eventId: id, classId: race.classId }, orderBy: { sailNumber: "asc" } }),
    db.race.findMany({ where: { eventId: id, classId: race.classId }, include: { finishes: true } }),
  ]);
  const series = seriesTable(scoreSeries(allRaces, entries, race.event.discards), { rank: t.race.rank, sailNo: t.event.sailNo, boat: t.event.boat, skipper: t.event.skipper, club: t.common.club, total: t.race.totalPts, net: t.race.net });
  const className = race.eventClass?.name ?? race.event.title;
  const initial = { id: race.id, status: race.status, startAt: race.startAt?.getTime() ?? null, sequence: race.sequence, prepFlag: race.prepFlag, note: race.note, updatedAt: race.updatedAt.getTime() };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/manage/${id}#races`} className="text-sm text-sea-600 underline">← {race.event.title}</Link>
          <h1 className="h1">{className} · {t.race.title} {race.number}</h1>
          {race.startAt && <p className="text-sm text-slate-500">{t.race.sequences[race.sequence as "5,4,1,0"] ?? race.sequence} · {t.race.prepFlag} {race.prepFlag}</p>}
        </div>
        <Link href={`/e/${race.event.slug}/race/${race.id}`} target="_blank" className="btn-ghost">{t.race.watchLive} ↗</Link>
      </div>

      <RaceClock initial={initial} className={className} official />

      {race.startAt && (
        <section className="card">
          <h2 className="h2">{t.race.finishes}</h2>
          <FinishRecorder raceId={race.id} startAt={race.startAt.getTime()} entries={entries}
            finishes={race.finishes.map((f) => ({ entryId: f.entryId, finishedAt: f.finishedAt?.toISOString() ?? null, position: f.position, code: f.code }))} />
        </section>
      )}

      {series.rows.length > 0 && series.headers.length > 7 && (
        <section className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="h2 mb-0">{t.event.results} · {className}</h2>
            <form action={publishSeries.bind(null, id, race.classId)}><button className="btn">{t.race.calcPublish}</button></form>
          </div>
          <ResultTable headers={series.headers} rows={series.rows} />
        </section>
      )}
    </div>
  );
}
