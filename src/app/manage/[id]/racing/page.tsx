import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireEventRole } from "@/lib/auth";
import { getT } from "@/i18n";
import { RaceClock } from "@/components/race/RaceClock";
import { FinishRecorder } from "@/components/race/FinishRecorder";
import { addRace, doneRacing } from "@/app/manage/races";

export const dynamic = "force-dynamic";
export const metadata = { title: "Let's go racing" };

const zurichDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(d);
const ACTIVE = ["PLANNED", "SEQUENCE", "RUNNING"];

/** Race-day mode: a focused full-screen workspace that covers the normal site until "Done racing". */
export default async function RacingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ race?: string }> }) {
  const { id } = await params;
  const { race: pick } = await searchParams;
  const { role } = await requireEventRole(id, "HELPER");
  const { t } = await getT();
  const e = await db.event.findUnique({
    where: { id },
    include: {
      classes: { orderBy: { position: "asc" } },
      races: { include: { eventClass: true, finishes: true }, orderBy: [{ classId: "asc" }, { number: "asc" }] },
    },
  });
  if (!e) notFound();

  const today = zurichDay(new Date());
  const todays = e.races
    .filter((r) => ACTIVE.includes(r.status) || zurichDay(r.updatedAt) === today || (r.startAt && zurichDay(r.startAt) === today))
    .sort((a, b) => (a.startAt?.getTime() ?? a.updatedAt.getTime()) - (b.startAt?.getTime() ?? b.updatedAt.getTime()));
  const race =
    e.races.find((r) => r.id === pick) ??
    todays.find((r) => r.status === "SEQUENCE" || r.status === "RUNNING") ??
    todays.find((r) => r.status === "PLANNED") ??
    todays[todays.length - 1];
  const entries = race ? await db.entry.findMany({ where: { eventId: id, classId: race.classId }, orderBy: { sailNumber: "asc" } }) : [];
  const over = !race || race.status === "FINISHED" || race.status === "ABANDONED";

  // one "next race" button per class (or one for the whole fleet when the event has no classes)
  const groups = e.classes.length ? e.classes.map((c) => ({ id: c.id, name: c.name })) : [{ id: "", name: t.common.all }];
  const nextNo = (classId: string) => Math.max(0, ...e.races.filter((r) => (r.classId ?? "") === classId).map((r) => r.number)) + 1;
  const raceLabel = (r: { eventClass: { name: string } | null; number: number }) => `${r.eventClass?.name ?? t.common.all} · ${r.number}`;
  const raced = groups.filter((g) => todays.some((r) => (r.classId ?? "") === g.id && r.status === "FINISHED"));

  const NextButtons = ({ big }: { big?: boolean }) => (
    <div className={`grid gap-2 ${big ? "sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
      {groups.map((g) => (
        <form key={g.id} action={addRace.bind(null, id)}>
          <input type="hidden" name="classId" value={g.id} />
          <input type="hidden" name="to" value="racing" />
          <button className={`w-full ${big ? "btn py-4 text-base" : "btn-ghost"}`}>+ {g.name} · {t.race.title} {nextNo(g.id)}</button>
        </form>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-paper pb-24 text-ink">
      <div className="sticky top-0 z-10 flex items-stretch border-b-2 border-ink bg-paper">
        <div className="min-w-0 flex-1 px-4 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{t.racing.goRacing}</p>
          <p className="truncate font-semibold uppercase">{e.title}</p>
        </div>
        <a href="#done" className="flex items-center bg-ink px-4 text-sm font-semibold uppercase tracking-wide text-paper hover:bg-accent">{t.racing.done} ✓</a>
      </div>

      <div className="mx-auto max-w-4xl space-y-4 p-4">
        {todays.length > 0 && (
          <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label={t.racing.today}>
            {todays.map((r) => (
              <Link key={r.id} href={`/manage/${id}/racing?race=${r.id}`}
                className={`shrink-0 border px-3 py-2 text-xs font-semibold uppercase ${r.id === race?.id ? "border-ink bg-ink text-paper" : "border-ink/25 bg-white"}`}>
                {raceLabel(r)} <span className="font-normal opacity-70">· {t.race.status[r.status]}</span>
              </Link>
            ))}
          </nav>
        )}

        {!race && (
          <section className="card space-y-3">
            <p className="text-sm">{t.racing.noRaces}</p>
            <NextButtons big />
          </section>
        )}

        {race && (
          <>
            <h1 className="text-2xl font-semibold uppercase tracking-tight">{race.eventClass?.name ?? e.title} · {t.race.title} {race.number}</h1>
            <RaceClock key={race.id} className={race.eventClass?.name ?? e.title} official
              initial={{ id: race.id, status: race.status, startAt: race.startAt?.getTime() ?? null, sequence: race.sequence, prepFlag: race.prepFlag, note: race.note, updatedAt: race.updatedAt.getTime() }} />
            {race.startAt && (
              <section className="card">
                <h2 className="h2">{t.race.finishes}</h2>
                {entries.length === 0
                  ? <p className="text-sm text-ink/60">{t.racing.noEntries}</p>
                  : <FinishRecorder key={race.id} raceId={race.id} startAt={race.startAt.getTime()} entries={entries}
                      finishes={race.finishes.map((f) => ({ entryId: f.entryId, finishedAt: f.finishedAt?.toISOString() ?? null, position: f.position, code: f.code }))} />}
              </section>
            )}
            <section className={over ? "card space-y-3 border-2 border-accent" : "space-y-2"}>
              <p className={over ? "text-sm font-semibold" : "text-[11px] font-semibold uppercase tracking-wide text-ink/60"}>{over ? t.racing.raceOver : t.racing.next}</p>
              <NextButtons big={over} />
            </section>
          </>
        )}

        <section id="done" className="card scroll-mt-20 space-y-3">
          <h2 className="h2">{t.racing.doneTitle}</h2>
          <form action={doneRacing.bind(null, id)} className="space-y-3">
            {role !== "HELPER" && raced.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="label">{t.racing.donePublish}</legend>
                {raced.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="publish" value={g.id} defaultChecked className="h-5 w-5 accent-[var(--color-accent)]" />
                    {g.name} · {t.racing.racesToday.replace("{n}", String(todays.filter((r) => (r.classId ?? "") === g.id && r.status === "FINISHED").length))}
                  </label>
                ))}
              </fieldset>
            )}
            <p className="text-xs text-ink/60">{t.racing.doneHint}</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn py-3">{t.racing.done} ✓</button>
              <Link href={`/manage/${id}`} className="btn-ghost py-3">{t.racing.back}</Link>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
