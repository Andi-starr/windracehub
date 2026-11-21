"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { newToken, requireRole } from "@/lib/auth";
import { getT } from "@/i18n";
import { fill, sendMail } from "@/lib/mail";

export async function setUserRole(userId: string, fd: FormData) {
  const me = await requireRole("ADMIN");
  const role = String(fd.get("role")) as UserRole;
  if (!["ADMIN", "HOST", "PARTICIPANT"].includes(role) || userId === me.id) return;
  await db.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin");
}

async function baseUrl() {
  const h = await headers();
  return process.env.APP_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

async function pwLink(userId: string) {
  const token = newToken();
  await db.passwordToken.create({ data: { token, userId, expiresAt: new Date(Date.now() + 14 * 864e5) } });
  return `${await baseUrl()}/set-password/${token}`;
}

export type HostState = { error?: string; link?: string; note?: string } | undefined;

export async function createHost(_: HostState, fd: FormData): Promise<HostState> {
  await requireRole("ADMIN");
  const { t } = await getT();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: t.auth.badEmail };
  if (!name) return { error: t.auth.noName };
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role === "PARTICIPANT") await db.user.update({ where: { id: existing.id }, data: { role: "HOST" } });
    revalidatePath("/admin");
    return { note: t.accounts.exists };
  }
  const u = await db.user.create({ data: { email, name, role: "HOST" } });
  const link = await pwLink(u.id);
  const sent = await sendMail(email, t.accounts.mailHostSubject, fill(t.accounts.mailHostBody, { name, url: link }));
  revalidatePath("/admin");
  return { link, note: sent ? t.accounts.emailed : undefined };
}

export async function resetLink(userId: string): Promise<string> {
  await requireRole("ADMIN");
  return pwLink(userId);
}

export async function deleteUser(userId: string) {
  const me = await requireRole("ADMIN");
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u || u.id === me.id || u.role === "ADMIN") return;
  await db.user.delete({ where: { id: userId } });
  revalidatePath("/admin");
}

const FIRST = ["Anna", "Luca", "Mia", "Noah", "Lea", "Jonas", "Sara", "Elias", "Nina", "David", "Laura", "Tim", "Julia", "Marc", "Lena", "Simon", "Chiara", "Nico", "Alina", "Fabian", "Céline", "Matteo", "Jana", "Robin", "Sophie", "Yannick", "Eva", "Pascal"];
const LAST = ["Müller", "Meier", "Schmid", "Keller", "Weber", "Huber", "Steiner", "Fischer", "Brunner", "Baumann", "Frei", "Zimmermann", "Moser", "Widmer", "Graf", "Wyss", "Roth", "Kuhn", "Bühler", "Marti", "Favre", "Rossi", "Bernasconi", "Dubois"];
const CLUBS = ["SCOZ", "ZYC", "SVT", "SCK", "YCB", "SNG", "CNM", "SCR", "SCU", "RCO"];
const BOATS = ["Blue Note", "Windspiel", "Libelle", "Möwe", "Sturmvogel", "Flinke Flunder", "Seeschwalbe", "Albatros", "Wellenreiter", "Lady Luck", "Föhn", "Bise", "Joran", "Nordwind", "Tramontana", "Zephyr", "Eisvogel", "Schwan", "Kormoran", "Delfin", "Orca", "Hecht", "Felchen", "Barracuda", "Mistral", "Vento", "Libeccio"];

/** Admin-only: a clearly marked practice regatta (today, two classes, 20-30 boats each) to try every feature. */
export async function createTestEvent() {
  const me = await requireRole("ADMIN");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(new Date());
  const start = new Date(`${today}T00:00:00Z`);
  const end = new Date(start.getTime() + 86400000);
  const club = await db.club.findFirst({ orderBy: { name: "asc" } });
  let n = 1;
  while (await db.event.findUnique({ where: { slug: `test-regatta-${today}-${n}` } })) n++;
  const rnd = (a: readonly string[], i: number, k: number) => a[(i * k + 3) % a.length];
  const e = await db.event.create({
    data: {
      title: `TEST · Probe-Regatta ${n}`, slug: `test-regatta-${today}-${n}`, startDate: start, endDate: end, status: "PUBLISHED",
      venue: "Testrevier", contactEmail: me.email, clubId: club?.id ?? null, discards: "4:1",
      description: "Testregatta zum Ausprobieren. Alle Meldungen sind erfunden. Kann gelöscht werden.",
      roles: { create: { userId: me.id, role: "HOST" } },
      classes: { create: [{ name: "ILCA 7", position: 0 }, { name: "420", position: 1 }] },
    },
    include: { classes: true },
  });
  const [ilca, c420] = e.classes.sort((a, b) => a.position - b.position);
  const rows = [
    ...Array.from({ length: 26 }, (_, i) => ({ classId: ilca.id, sailNumber: `SUI ${201 + i * 7}`, skipper: `${rnd(FIRST, i, 7)} ${rnd(LAST, i, 5)}`, crew: null, boatName: null, club: rnd(CLUBS, i, 3) })),
    ...Array.from({ length: 22 }, (_, i) => ({ classId: c420.id, sailNumber: `SUI ${5501 + i * 3}`, skipper: `${rnd(FIRST, i + 9, 5)} ${rnd(LAST, i + 4, 7)}`, crew: `${rnd(FIRST, i + 2, 11)} ${rnd(LAST, i + 8, 3)}`, boatName: rnd(BOATS, i, 1), club: rnd(CLUBS, i + 5, 7) })),
  ];
  await db.entry.createMany({ data: rows.map((r) => ({ ...r, eventId: e.id })) });
  revalidatePath("/manage");
  redirect(`/manage/${e.id}`);
}
