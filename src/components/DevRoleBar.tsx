"use client";
// TEMPORARY role switcher bar (see src/lib/devRole.ts). Deliberately loud colours so it isn't forgotten.
import { usePathname, useSearchParams } from "next/navigation";

const LABEL = { ADMIN: "Admin", HOST: "Host", PARTICIPANT: "Participant" } as const;

export function DevRoleBar({ role }: { role: keyof typeof LABEL }) {
  const path = usePathname();
  const sp = useSearchParams().toString();
  const back = path + (sp ? `?${sp}` : "");
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-2 border-t-4 border-fuchsia-900 px-3 py-2 text-xs font-bold uppercase tracking-wide text-white"
      style={{ background: "repeating-linear-gradient(45deg,#a21caf,#a21caf 14px,#86198f 14px,#86198f 28px)" }}>
      <span>⚠ Test: view as</span>
      {(Object.keys(LABEL) as (keyof typeof LABEL)[]).map((r) => (
        <form key={r} action="/dev-role" method="post">
          <input type="hidden" name="role" value={r} />
          <input type="hidden" name="back" value={back} />
          <button aria-pressed={role === r} className={`border-2 border-white px-3 py-1 ${role === r ? "bg-white text-fuchsia-800" : "hover:bg-white/20"}`}>{LABEL[r]}</button>
        </form>
      ))}
      <span className="opacity-80">remove before launch</span>
    </div>
  );
}
