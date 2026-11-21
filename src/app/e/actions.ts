"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getT } from "@/i18n";

export type EntryState = { error?: string; ok?: boolean } | undefined;

export async function enterEvent(eventId: string, _: EntryState, fd: FormData): Promise<EntryState> {
  const user = await requireUser();
  const { t } = await getT();
  const e = await db.event.findUnique({ where: { id: eventId }, include: { classes: true } });
  if (!e || !e.entriesOpen || e.status !== "PUBLISHED") return { error: t.entry.closed };
  const get = (k: string) => String(fd.get(k) ?? "").trim();
  const classId = get("classId") || null;
  if (e.classes.length > 0 && !e.classes.some((c) => c.id === classId)) return { error: t.entry.errClass };
  const sailNumber = get("sailNumber"), skipper = get("skipper");
  if (!sailNumber) return { error: t.entry.errSail };
  if (!skipper) return { error: t.entry.errSkipper };
  if (await db.entry.findFirst({ where: { eventId, userId: user.id } })) return { ok: true };
  const data = { sailNumber, boatName: get("boatName") || null, skipper, crew: get("crew") || null, club: get("club") || null };
  await db.entry.create({ data: { eventId, classId, userId: user.id, ...data } });
  if (fd.get("saveBoat")) {
    const cls = e.classes.find((c) => c.id === classId)?.name ?? "";
    const existing = await db.boat.findFirst({ where: { userId: user.id, sailNumber } });
    const boat = { className: cls, sailNumber, boatName: data.boatName, crew: data.crew };
    if (existing) await db.boat.update({ where: { id: existing.id }, data: boat });
    else await db.boat.create({ data: { userId: user.id, ...boat } });
  }
  revalidatePath(`/e/${e.slug}`);
  return { ok: true };
}

export async function withdrawEntry(entryId: string) {
  const user = await requireUser();
  const entry = await db.entry.findUnique({ where: { id: entryId }, include: { event: true } });
  if (!entry || entry.userId !== user.id) return;
  await db.entry.delete({ where: { id: entryId } });
  revalidatePath(`/e/${entry.event.slug}`);
  revalidatePath("/me");
}

export async function deleteBoat(boatId: string) {
  const user = await requireUser();
  await db.boat.deleteMany({ where: { id: boatId, userId: user.id } });
  revalidatePath("/me");
}
