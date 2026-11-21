// TEMPORARY test helper: lets the real admin view the site as Host or Participant.
// Remove before launch: delete this file, src/components/DevRoleBar.tsx, src/app/dev-role/,
// and the two marked lines in src/lib/auth.ts and src/app/layout.tsx. Or set ROLE_SWITCHER=off in Vercel.
import type { UserRole } from "@prisma/client";

export const DEV_ROLE_COOKIE = "wrh_viewas";
export const DEV_ROLES: UserRole[] = ["ADMIN", "HOST", "PARTICIPANT"];
export const devRoleEnabled = () => process.env.ROLE_SWITCHER !== "off";

/** Only a real ADMIN can be viewed as another role. */
export function applyDevRole<U extends { role: UserRole }>(u: U, cookie: string | undefined): U & { realRole: UserRole } {
  const as = cookie as UserRole | undefined;
  if (devRoleEnabled() && u.role === "ADMIN" && as && DEV_ROLES.includes(as)) return { ...u, role: as, realRole: u.role };
  return { ...u, realRole: u.role };
}
