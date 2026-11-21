"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
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
