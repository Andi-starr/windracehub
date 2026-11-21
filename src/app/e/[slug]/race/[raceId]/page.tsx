import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getT } from "@/i18n";
import { RaceClock } from "@/components/race/RaceClock";

export const dynamic = "force-dynamic";
export const metadata = { title: "Start" };

export default async function PublicRace({ params }: { params: Promise<{ slug: string; raceId: string }> }) {
  const { slug, raceId } = await params;
  const { t } = await getT();
  const race = await db.race.findFirst({ where: { id: raceId, event: { slug } }, include: { eventClass: true, event: true } });
  if (!race || race.event.status === "DRAFT") notFound();
  const className = race.eventClass?.name ?? race.event.title;
  const initial = { id: race.id, status: race.status, startAt: race.startAt?.getTime() ?? null, sequence: race.sequence, prepFlag: race.prepFlag, note: race.note, updatedAt: race.updatedAt.getTime() };
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/e/${slug}#wettfahrten`} className="text-sm text-sea-600 underline">← {race.event.title}</Link>
      <h1 className="h1">{className} · {t.race.title} {race.number}</h1>
      <RaceClock initial={initial} className={className} />
    </div>
  );
}
