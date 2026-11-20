import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "./db";
import type { Role } from "@prisma/client";

const COOKIE = "wrh_session";
const DAYS = 30;

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + DAYS * 864e5);
  await db.session.create({ data: { id, userId, expiresAt } });
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await db.session.deleteMany({ where: { id } });
  jar.delete(COOKIE);
}

export async function currentUser() {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  const s = await db.session.findUnique({ where: { id }, include: { user: true } });
  if (!s || s.expiresAt < new Date()) return null;
  return s.user;
}

export async function requireUser() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

/** Returns the user's role for the event, or throws/redirects if none. Admins count as HOST. */
export async function requireEventRole(eventId: string, need: Role | "ANY" = "ANY") {
  const user = await requireUser();
  if (user.isAdmin) return { user, role: "HOST" as Role };
  const r = await db.eventRole.findUnique({ where: { userId_eventId: { userId: user.id, eventId } } });
  if (!r) redirect("/manage");
  if (need === "HOST" && r.role !== "HOST") redirect(`/manage/${eventId}`);
  return { user, role: r.role };
}

export function newToken() {
  return randomBytes(24).toString("base64url");
}
