"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { getT } from "@/i18n";

export type FormState = { error?: string } | undefined;

function safeNext(n: FormDataEntryValue | null) {
  const s = typeof n === "string" ? n : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/manage";
}

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const pw = String(fd.get("password") ?? "");
  const { t } = await getT();
  const u = await db.user.findUnique({ where: { email } });
  if (!u?.passwordHash || !(await verifyPassword(pw, u.passwordHash))) return { error: t.auth.wrong };
  await createSession(u.id);
  redirect(safeNext(fd.get("next")));
}

export async function register(_: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim();
  const pw = String(fd.get("password") ?? "");
  const { t } = await getT();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: t.auth.badEmail };
  if (!name) return { error: t.auth.noName };
  if (pw.length < 8) return { error: t.auth.shortPw };
  const existing = await db.user.findUnique({ where: { email } });
  if (existing?.passwordHash) return { error: t.auth.exists };
  const passwordHash = await hashPassword(pw);
  const u = existing
    ? await db.user.update({ where: { id: existing.id }, data: { name, passwordHash } })
    : await db.user.create({ data: { email, name, passwordHash, role: (await db.user.count()) === 0 ? "ADMIN" : "PARTICIPANT" } });
  await createSession(u.id);
  redirect(safeNext(fd.get("next")));
}
