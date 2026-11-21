"use server";
import { revalidatePath } from "next/cache";
import type { UserRole } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function setUserRole(userId: string, fd: FormData) {
  const me = await requireRole("ADMIN");
  const role = String(fd.get("role")) as UserRole;
  if (!["ADMIN", "HOST", "PARTICIPANT"].includes(role) || userId === me.id) return;
  await db.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin");
}
