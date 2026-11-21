"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { getT } from "@/i18n";

export async function setPassword(token: string, _: { error?: string } | undefined, fd: FormData) {
  const { t } = await getT();
  const tok = await db.passwordToken.findUnique({ where: { token } });
  if (!tok || tok.expiresAt < new Date()) return { error: t.accounts.tokenInvalid };
  const pw = String(fd.get("password") ?? "");
  if (pw.length < 8) return { error: t.auth.shortPw };
  await db.user.update({ where: { id: tok.userId }, data: { passwordHash: await hashPassword(pw) } });
  await db.passwordToken.deleteMany({ where: { userId: tok.userId } });
  await createSession(tok.userId);
  redirect("/manage");
}
