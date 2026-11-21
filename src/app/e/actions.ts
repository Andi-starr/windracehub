"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getT } from "@/i18n";
import { entriesAreOpen } from "@/lib/format";

export type EntryState = { error?: string; ok?: boolean } | undefined;

export async function enterEvent(eventId: string, _: EntryState, fd: FormData): Promise<EntryState> {
  const user = await requireUser();
  const { t } = await getT();
  // a host of this regatta manages its entry list but can't enter it; hosts can still sail other regattas
  if (await db.eventRole.findFirst({ where: { userId: user.id, eventId, role: "HOST" } })) return { error: t.entry.hostNoEntry };
  const e = await db.event.findUnique({ where: { id: eventId }, include: { classes: true } });
  if (!e || !entriesAreOpen(e)) return { error: t.entry.closed };
  const get = (k: string) => String(fd.get(k) ?? "").trim();
  const classId = get("classId") || null;
  if (e.classes.length > 0 && !e.classes.some((c) => c.id === classId)) return { error: t.entry.errClass };
  const sailNumber = get("sailNumber"), skipper = get("skipper");
  if (!sailNumber) return { error: t.entry.errSail };
  if (!skipper) return { error: t.entry.errSkipper };
  if (await db.entry.findFirst({ where: { eventId, userId: user.id } })) return { ok: true };
  // crew = ticked saved crew members + typed names; typed names are saved to "My crew" for next time
  const saved = await db.crewMember.findMany({ where: { userId: user.id } });
  const picked = fd.getAll("crewPick").map(String).map((id) => saved.find((c) => c.id === id)?.name).filter((n): n is string => !!n);
  const typed = get("crew").split(",").map((s) => s.trim()).filter(Boolean);
  const crew = [...new Set([...picked, ...typed])];
  const fresh = typed.filter((n) => !saved.some((c) => c.name.toLowerCase() === n.toLowerCase()));
  if (fresh.length) await db.crewMember.createMany({ data: fresh.map((name) => ({ userId: user.id, name })) });
  const data = { sailNumber, boatName: get("boatName") || null, skipper, crew: crew.join(", ") || null, club: get("club") || null };
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

export async function addCrew(fd: FormData) {
  const user = await requireUser();
  const name = String(fd.get("name") ?? "").trim();
  const club = String(fd.get("club") ?? "").trim();
  if (name) await db.crewMember.create({ data: { userId: user.id, name, club: club || null } });
  revalidatePath("/me");
}

export async function deleteCrew(id: string) {
  const user = await requireUser();
  await db.crewMember.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/me");
}
