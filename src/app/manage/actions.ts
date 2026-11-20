"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { DocType, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { newToken, requireEventRole, requireUser } from "@/lib/auth";
import { deleteFile, makeKey, signedUploadUrl } from "@/lib/storage";
import { parseDay, parseZurichLocal, slugify } from "@/lib/format";
import { parseDelimited } from "@/lib/results";

async function touch(eventId: string) {
  const e = await db.event.findUnique({ where: { id: eventId }, select: { slug: true } });
  revalidatePath(`/manage/${eventId}`);
  if (e) revalidatePath(`/e/${e.slug}`);
  revalidatePath("/");
}

async function uniqueSlug(title: string, start: Date, ignoreId?: string) {
  const y = String(start.getUTCFullYear());
  const base = title.includes(y) ? slugify(title) : `${slugify(title)}-${y}`;
  let slug = base;
  for (let i = 2; ; i++) {
    const hit = await db.event.findUnique({ where: { slug } });
    if (!hit || hit.id === ignoreId) return slug;
    slug = `${base}-${i}`;
  }
}

async function clubIdFor(name: string) {
  const n = name.trim();
  if (!n) return null;
  const c = await db.club.upsert({ where: { name: n }, create: { name: n }, update: {} });
  return c.id;
}

const EventInput = z.object({
  title: z.string().trim().min(3, "Titel fehlt"),
  club: z.string().trim().default(""),
  venue: z.string().trim().default(""),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Startdatum fehlt"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
  classes: z.string().default(""),
  entryUrl: z.string().trim().default(""),
  entryInfo: z.string().trim().default(""),
  contactEmail: z.string().trim().default(""),
  description: z.string().trim().default(""),
});

function readEvent(fd: FormData) {
  const r = EventInput.safeParse(Object.fromEntries(fd));
  if (!r.success) return { error: r.error.issues[0].message } as const;
  const v = r.data;
  const start = parseDay(v.startDate);
  const end = v.endDate ? parseDay(v.endDate) : start;
  if (end < start) return { error: "Enddatum liegt vor dem Startdatum." } as const;
  const classes = v.classes.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  return { v, start, end, classes } as const;
}

export type ActionState = { error?: string; ok?: string } | undefined;

export async function createEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const p = readEvent(fd);
  if ("error" in p) return { error: p.error };
  const { v, start, end, classes } = p;
  const copyFrom = String(fd.get("copyFrom") ?? "");
  const src = copyFrom ? await db.event.findUnique({ where: { id: copyFrom }, include: { schedule: true } }) : null;
  const shift = src ? start.getTime() - src.startDate.getTime() : 0;

  const e = await db.event.create({
    data: {
      title: v.title,
      slug: await uniqueSlug(v.title, start),
      clubId: await clubIdFor(v.club),
      venue: v.venue || null,
      startDate: start,
      endDate: end,
      entryUrl: v.entryUrl || null,
      entryInfo: v.entryInfo || null,
      contactEmail: v.contactEmail || null,
      description: v.description || null,
      classes: { create: classes.map((name, position) => ({ name, position })) },
      schedule: src ? { create: src.schedule.map((s) => ({ title: s.title, at: new Date(s.at.getTime() + shift) })) } : undefined,
      roles: { create: { userId: user.id, role: "HOST" } },
    },
  });
  redirect(`/manage/${e.id}?neu=1`);
}

export async function updateEvent(eventId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireEventRole(eventId, "HOST");
  const p = readEvent(fd);
  if ("error" in p) return { error: p.error };
  const { v, start, end, classes } = p;
  const existing = await db.eventClass.findMany({ where: { eventId } });
  await db.$transaction([
    db.event.update({
      where: { id: eventId },
      data: {
        title: v.title, clubId: await clubIdFor(v.club), venue: v.venue || null,
        startDate: start, endDate: end, entryUrl: v.entryUrl || null, entryInfo: v.entryInfo || null,
        contactEmail: v.contactEmail || null, description: v.description || null,
      },
    }),
    // keep class ids (results/entries point at them); add new, drop removed, reorder
    db.eventClass.deleteMany({ where: { eventId, name: { notIn: classes } } }),
    ...classes.map((name, position) => {
      const hit = existing.find((c) => c.name === name);
      return hit
        ? db.eventClass.update({ where: { id: hit.id }, data: { position } })
        : db.eventClass.create({ data: { eventId, name, position } });
    }),
  ]);
  await touch(eventId);
  return { ok: "Gespeichert." };
}

export async function setStatus(eventId: string, status: "DRAFT" | "PUBLISHED" | "CANCELLED") {
  await requireEventRole(eventId, "HOST");
  await db.event.update({ where: { id: eventId }, data: { status } });
  await touch(eventId);
}

export async function deleteEvent(eventId: string) {
  await requireEventRole(eventId, "HOST");
  const docs = await db.document.findMany({ where: { eventId } });
  const res = await db.result.findMany({ where: { eventId, fileKey: { not: null } } });
  await db.event.delete({ where: { id: eventId } });
  await Promise.all([...docs.map((d) => deleteFile(d.fileKey)), ...res.map((r) => deleteFile(r.fileKey!))]);
  revalidatePath("/");
  redirect("/manage");
}

/* ---------- uploads ---------- */

export async function prepareUpload(eventId: string, fileName: string) {
  await requireEventRole(eventId);
  const key = makeKey(eventId, fileName);
  return { key, url: await signedUploadUrl(key) };
}

const DOC_TYPES = ["NOR", "SI", "AMENDMENT", "NOTICE", "PROTEST", "OTHER"] as const;

export async function addDocument(eventId: string, d: { key: string; fileName: string; size: number; type: string; title: string }) {
  const { user } = await requireEventRole(eventId);
  if (!d.key.startsWith(`${eventId}/`)) throw new Error("bad key");
  const type = (DOC_TYPES as readonly string[]).includes(d.type) ? (d.type as DocType) : "OTHER";
  await db.document.create({
    data: { eventId, type, title: d.title.trim() || d.fileName, fileKey: d.key, fileName: d.fileName, size: d.size, uploadedBy: user.name },
  });
  await touch(eventId);
}

export async function updateDocument(eventId: string, id: string, fd: FormData) {
  await requireEventRole(eventId);
  const type = String(fd.get("type"));
  await db.document.update({
    where: { id, eventId },
    data: {
      title: String(fd.get("title") ?? "").trim() || undefined,
      type: (DOC_TYPES as readonly string[]).includes(type) ? (type as DocType) : undefined,
    },
  });
  await touch(eventId);
}

export async function deleteDocument(eventId: string, id: string) {
  await requireEventRole(eventId);
  const d = await db.document.delete({ where: { id, eventId } });
  await deleteFile(d.fileKey);
  await touch(eventId);
}

export async function addResult(eventId: string, r: {
  classId: string | null; title: string; provisional: boolean;
  headers: string[]; rows: string[][]; key?: string; fileName?: string;
}) {
  const { user } = await requireEventRole(eventId);
  if (r.key && !r.key.startsWith(`${eventId}/`)) throw new Error("bad key");
  if (r.classId && !(await db.eventClass.findFirst({ where: { id: r.classId, eventId } }))) throw new Error("bad class");
  const cls = r.classId ? await db.eventClass.findUnique({ where: { id: r.classId } }) : null;
  await db.result.create({
    data: {
      eventId, classId: r.classId, provisional: r.provisional,
      title: r.title.trim() || cls?.name || "Gesamt",
      headers: r.headers.slice(0, 60), rows: r.rows.slice(0, 2000).map((x) => x.slice(0, 60)),
      fileKey: r.key ?? null, fileName: r.fileName ?? null, uploadedBy: user.name,
    },
  });
  await touch(eventId);
}

export async function toggleResultFinal(eventId: string, id: string) {
  await requireEventRole(eventId);
  const r = await db.result.findFirstOrThrow({ where: { id, eventId } });
  await db.result.update({ where: { id }, data: { provisional: !r.provisional } });
  await touch(eventId);
}

export async function deleteResult(eventId: string, id: string) {
  await requireEventRole(eventId);
  const r = await db.result.delete({ where: { id, eventId } });
  if (r.fileKey) await deleteFile(r.fileKey);
  await touch(eventId);
}

/* ---------- schedule, entries, team (host) ---------- */

export async function addScheduleItem(eventId: string, fd: FormData) {
  await requireEventRole(eventId, "HOST");
  const at = String(fd.get("at") ?? "");
  const title = String(fd.get("title") ?? "").trim();
  if (!at || !title) return;
  await db.scheduleItem.create({ data: { eventId, at: parseZurichLocal(at), title } });
  await touch(eventId);
}

export async function deleteScheduleItem(eventId: string, id: string) {
  await requireEventRole(eventId, "HOST");
  await db.scheduleItem.delete({ where: { id, eventId } });
  await touch(eventId);
}

/** Paste from Excel: Klasse | Segelnr | Boot | Steuermann | Club. Replaces the whole list. */
export async function replaceEntries(eventId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireEventRole(eventId);
  const text = String(fd.get("entries") ?? "");
  const classes = await db.eventClass.findMany({ where: { eventId } });
  const t = text.trim() ? parseDelimited(text) : { headers: [], rows: [] };
  if (!t) return { error: "Konnte die Liste nicht lesen." };
  let rows = [t.headers, ...t.rows].filter((r) => r.some(Boolean));
  if (/klasse|class/i.test(rows[0]?.[0] ?? "")) rows = rows.slice(1);
  const byName = (n: string) => classes.find((c) => c.name.toLowerCase() === n.toLowerCase())?.id ?? null;
  await db.$transaction([
    db.entry.deleteMany({ where: { eventId } }),
    db.entry.createMany({
      data: rows.map((r) => ({
        eventId, classId: byName(r[0] ?? ""), sailNumber: r[1] || null, boatName: r[2] || null, skipper: r[3] || null, club: r[4] || null,
      })),
    }),
  ]);
  await touch(eventId);
  return { ok: `${rows.length} Meldungen gespeichert.` };
}

export async function inviteMember(eventId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  await requireEventRole(eventId, "HOST");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const role = (fd.get("role") === "HOST" ? "HOST" : "OFFICIAL") as Role;
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Bitte gültige E-Mail angeben." };
  const token = newToken();
  await db.invite.create({ data: { token, eventId, email, role } });
  await touch(eventId);
  return { ok: token };
}

export async function removeMember(eventId: string, userId: string) {
  const { user } = await requireEventRole(eventId, "HOST");
  if (userId === user.id) return;
  await db.eventRole.deleteMany({ where: { eventId, userId } });
  await touch(eventId);
}

export async function revokeInvite(eventId: string, token: string) {
  await requireEventRole(eventId, "HOST");
  await db.invite.deleteMany({ where: { eventId, token } });
  await touch(eventId);
}
