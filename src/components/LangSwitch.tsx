"use client";
import { usePathname, useSearchParams } from "next/navigation";

export function LangSwitch({ current }: { current: string }) {
  const path = usePathname();
  const sp = useSearchParams().toString();
  const back = encodeURIComponent(path + (sp ? `?${sp}` : ""));
  return (
    <span className="flex gap-2">
      {["de", "en", "fr"].map((l) => (
        <a key={l} href={`/lang?l=${l}&back=${back}`} className={l === current ? "underline underline-offset-4" : "opacity-50 hover:opacity-100"}>{l}</a>
      ))}
    </span>
  );
}
