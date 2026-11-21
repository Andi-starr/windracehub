"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireEventRole } from "@/lib/auth";
import { parseZurichLocal } from "@/lib/format";
import { PENALTY_CODES, scoreSeries, seriesTable } from "@/lib/scoring";
import { getT } from "@/i18n";

const SEQ_RE = /^\d+(,\d+)*,0$/;

async function raceFor(raceId: string) {
  const r = await db.race.findUniqueOrThrow({ where: { id: raceId }, include: { event: { select: { id: true, slug: true } } } });
  await requireEventRole(r.eventId);
  return r;
}
function touch(r: { eventId: string; id: string; event: { slug: string } }) {
  revalidatePath(`/manage/${r.eventId}/race/${r.id}`);
  revalidatePath(`/manage/${r.eventId}`);
  revalidatePath(`/e/${r.event.slug}`);
}

export async function addRace(eventId: string, fd: FormData) {
  await requireEventRole(eventId);
  const classId = String(fd.get("classId") ?? "") || null;
  if (classId && !(await db.eventClass.findFirst({ where: { id: classId, eventId } }))) return;
  const sequence = String(fd.get("sequence") ?? "5,4,1,0");
  const prepFlag = String(fd.get("prepFlag") ?? "P").slice(0, 8);
  const last = await db.race.findFirst({ where: { eventId, classId }, orderBy: { number: "desc" } });
  const r = await db.race.create({
    data: { eventId, classId, number: (last?.number ?? 0) + 1, sequence: SEQ_RE.test(sequence) ? sequence : "5,4,1,0", prepFlag },
  });
  revalidatePath(`/manage/${eventId}`);
  redirect(`/manage/${eventId}/race/${r.id}`);
}

/** at = "HH:MM" (Zurich, today) for the START; empty = first signal at the next full minute. */
export async function startSequence(raceId: string, at: string) {
  const r = await raceFor(raceId);
  const first = Math.max(...r.sequence.split(",").map(Number));
  let startAt: Date;
  if (/^\d{2}:\d{2}$/.test(at)) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date());
    startAt = parseZurichLocal(`${today}T${at}`);
    if (startAt.getTime() - first * 60e3 < Date.now()) startAt = new Date(Math.ceil(Date.now() / 60e3) * 60e3 + first * 60e3);
  } else {
    startAt = new Date(Math.ceil((Date.now() + 5e3) / 60e3) * 60e3 + first * 60e3);
  }
  await db.race.update({ where: { id: raceId }, data: { status: "SEQUENCE", startAt, note: null } });
  touch(r);
}

export async function signal(raceId: string, kind: "AP" | "X1" | "N" | "FINISH" | "RESET") {
  const r = await raceFor(raceId);
  const data =
    kind === "AP" ? { status: "PLANNED" as const, startAt: null, note: "AP" } :
    kind === "X1" ? { status: "PLANNED" as const, startAt: null, note: "X1" } :
    kind === "N" ? { status: "ABANDONED" as const, note: "N" } :
    kind === "FINISH" ? { status: "FINISHED" as const } :
    { status: "PLANNED" as const, startAt: null, note: null };
  await db.race.update({ where: { id: raceId }, data });
  if (kind === "RESET" || kind === "X1") await db.finish.deleteMany({ where: { raceId } });
  touch(r);
}

/** clientAt = synced client time in ms; accepted if within 15 s of server time. */
export async function recordFinish(raceId: string, entryId: string, clientAt: number) {
  const r = await raceFor(raceId);
  const now = Date.now();
  const at = Math.abs(clientAt - now) < 15e3 ? new Date(clientAt) : new Date(now);
  const count = await db.finish.count({ where: { raceId, code: null } });
  await db.finish.upsert({
    where: { raceId_entryId: { raceId, entryId } },
    create: { raceId, entryId, finishedAt: at, position: count + 1 },
    update: { finishedAt: at, code: null },
  });
  if (r.status === "SEQUENCE") await db.race.update({ where: { id: raceId }, data: { status: "RUNNING" } });
  touch(r);
}

export async function setCode(raceId: string, entryId: string, code: string) {
  const r = await raceFor(raceId);
  if (!code) await db.finish.deleteMany({ where: { raceId, entryId } });
  else if ((PENALTY_CODES as readonly string[]).includes(code))
    await db.finish.upsert({ where: { raceId_entryId: { raceId, entryId } }, create: { raceId, entryId, code }, update: { code, finishedAt: null, position: null } });
  await renumber(raceId);
  touch(r);
}

export async function removeFinish(raceId: string, entryId: string) {
  const r = await raceFor(raceId);
  await db.finish.deleteMany({ where: { raceId, entryId } });
  await renumber(raceId);
  touch(r);
}

async function renumber(raceId: string) {
  const fs = await db.finish.findMany({ where: { raceId, code: null }, orderBy: [{ finishedAt: "asc" }, { position: "asc" }] });
  await db.$transaction(fs.map((f, i) => db.finish.update({ where: { id: f.id }, data: { position: i + 1 } })));
}

export async function publishSeries(eventId: string, classId: string | null) {
  const { user } = await requireEventRole(eventId);
  const { t } = await getT();
  const ev = await db.event.findUniqueOrThrow({ where: { id: eventId } });
  const [entries, races, cls] = await Promise.all([
    db.entry.findMany({ where: { eventId, classId } }),
    db.race.findMany({ where: { eventId, classId }, include: { finishes: true } }),
    classId ? db.eventClass.findUnique({ where: { id: classId } }) : null,
  ]);
  const s = scoreSeries(races, entries, ev.discards);
  const table = seriesTable(s, { rank: t.race.rank, sailNo: t.event.sailNo, boat: t.event.boat, skipper: t.event.skipper, club: t.common.club, total: t.race.totalPts, net: t.race.net });
  await db.result.create({
    data: {
      eventId, classId, provisional: true, title: `${cls?.name ?? t.common.total} · ${s.races.length} ${t.race.races}`,
      headers: table.headers, rows: table.rows, uploadedBy: user.name,
    },
  });
  revalidatePath(`/e/${ev.slug}`);
  revalidatePath(`/manage/${eventId}`);
}
