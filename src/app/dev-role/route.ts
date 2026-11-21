// TEMPORARY role switcher endpoint (see src/lib/devRole.ts)
import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { DEV_ROLE_COOKIE, DEV_ROLES, devRoleEnabled } from "@/lib/devRole";
import type { UserRole } from "@prisma/client";

export async function POST(req: Request) {
  const u = await currentUser();
  const fd = await req.formData();
  const back = String(fd.get("back") ?? "/");
  if (!devRoleEnabled() || !u || u.realRole !== "ADMIN") return new Response("forbidden", { status: 403 });
  const role = String(fd.get("role")) as UserRole;
  const jar = await cookies();
  if (role === "ADMIN" || !DEV_ROLES.includes(role)) jar.delete(DEV_ROLE_COOKIE);
  else jar.set(DEV_ROLE_COOKIE, role, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  return Response.redirect(new URL(back.startsWith("/") && !back.startsWith("//") ? back : "/", req.url), 303);
}
