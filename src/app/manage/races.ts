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
  await requireEventRole(r.eventId, "HELPER");
  return r;
}
function touch(r: { eventId: string; id: string; event: { slug: string } }) {
  revalidatePath(`/manage/${r.eventId}/race/${r.id}`);
  revalidatePath(`/manage/${r.eventId}`);
  revalidatePath(`/e/${r.event.slug}`);
}

export async function addRace(eventId: string, fd: FormData) {
  // helpers may add the next race on race day; publishing results still needs host or race committee
  await requireEventRole(eventId, "HELPER");
  const classId = String(fd.get("classId") ?? "") || null;
  if (classId && !(await db.eventClass.findFirst({ where: { id: classId, eventId } }))) return;
  const last = await db.race.findFirst({ where: { eventId, classId }, orderBy: { number: "desc" } });
  const r = await db.race.create({
    data: { eventId, classId, number: (last?.number ?? 0) + 1 },
  });
  revalidatePath(`/manage/${eventId}`);
  redirect(fd.get("to") === "racing" ? `/manage/${eventId}/racing?race=${r.id}` : `/manage/${eventId}/race/${r.id}`);
}

const PREP_FLAGS = ["P", "I", "Z", "U", "BLACK"];

/** Chosen when the clock is opened: sequence + preparatory flag.
 *  at = "HH:MM" (Zurich, today) for the START; empty = first signal at the next full minute. */
export async function startSequence(raceId: string, at: string, sequence?: string, prepFlag?: string) {
  const r = await raceFor(raceId);
  const seq = sequence && SEQ_RE.test(sequence) ? sequence : r.sequence;
  const prep = prepFlag && PREP_FLAGS.includes(prepFlag) ? prepFlag : r.prepFlag;
  const first = Math.max(...seq.split(",").map(Number));
  let startAt: Date;
  if (/^\d{2}:\d{2}$/.test(at)) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date());
    startAt = parseZurichLocal(`${today}T${at}`);
    if (startAt.getTime() - first * 60e3 < Date.now()) startAt = new Date(Math.ceil(Date.now() / 60e3) * 60e3 + first * 60e3);
  } else {
    // "+1" = one extra minute before the first signal so the committee can get ready
    const extra = at === "+1" ? 60e3 : 0;
    startAt = new Date(Math.ceil((Date.now() + 5e3) / 60e3) * 60e3 + extra + first * 60e3);
  }
  await db.race.update({ where: { id: raceId }, data: { status: "SEQUENCE", startAt, note: null, sequence: seq, prepFlag: prep } });
  touch(r);
}

/** Prep flag may still change during the sequence, until the preparatory signal is made. */
export async function setPrepFlag(raceId: string, prepFlag: string) {
  const r = await raceFor(raceId);
  if (!PREP_FLAGS.includes(prepFlag)) return;
  if (r.startAt) {
    const mins = r.sequence.split(",").map(Number).sort((a, b) => b - a);
    const prepAt = r.startAt.getTime() - mins[mins.length - 3] * 60e3;
    if (Date.now() >= prepAt) return;
  }
  await db.race.update({ where: { id: raceId }, data: { prepFlag } });
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
  // no finishes before the start signal, or in a race that isn't sailing
  if (!r.startAt || now < r.startAt.getTime() - 1e3 || r.status === "PLANNED" || r.status === "ABANDONED") return;
  const at = Math.abs(clientAt - now) < 15e3 ? new Date(clientAt) : new Date(now);
  const count = await db.finish.count({ where: { raceId, code: null } });
  const prev = await db.finish.findUnique({ where: { raceId_entryId: { raceId, entryId } } });
  // an early starter who didn't come back keeps OCS/UFD/BFD even when it finishes; the time is kept for the record
  const keep = prev?.code && EARLY_CODES.includes(prev.code) ? prev.code : null;
  await db.finish.upsert({
    where: { raceId_entryId: { raceId, entryId } },
    create: { raceId, entryId, finishedAt: at, position: count + 1 },
    update: { finishedAt: at, code: keep, position: keep ? null : undefined },
  });
  await renumber(raceId);
  if (r.status === "SEQUENCE") await db.race.update({ where: { id: raceId }, data: { status: "RUNNING" } });
  touch(r);
}

const EARLY_CODES = ["OCS", "UFD", "BFD"];

/** Mark (or clear) an early starter, from one minute before the start. code "" = clear. */
export async function markEarly(raceId: string, entryId: string, code: string) {
  const r = await raceFor(raceId);
  if (!r.startAt || Date.now() < r.startAt.getTime() - 61e3) return;
  if (code && !EARLY_CODES.includes(code)) return;
  const prev = await db.finish.findUnique({ where: { raceId_entryId: { raceId, entryId } } });
  if (code) await db.finish.upsert({ where: { raceId_entryId: { raceId, entryId } }, create: { raceId, entryId, code }, update: { code, position: null } });
  else if (prev?.finishedAt) await db.finish.update({ where: { id: prev.id }, data: { code: null } });
  else if (prev) await db.finish.delete({ where: { id: prev.id } });
  await renumber(raceId);
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
  await writeSeries(eventId, classId, user.name);
}

/** "Done racing": optionally publish provisional series results per class, then back to the normal editor. */
export async function doneRacing(eventId: string, fd: FormData) {
  const { user, role } = await requireEventRole(eventId, "HELPER");
  const pick = role === "HELPER" ? [] : fd.getAll("publish").map(String);
  for (const c of pick) await writeSeries(eventId, c || null, user.name);
  redirect(`/manage/${eventId}?racing=done&pub=${pick.length}${pick.length ? "#results" : ""}`);
}

async function writeSeries(eventId: string, classId: string | null, by: string) {
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
      headers: table.headers, rows: table.rows, uploadedBy: by,
    },
  });
  revalidatePath(`/e/${ev.slug}`);
  revalidatePath(`/manage/${eventId}`);
}
