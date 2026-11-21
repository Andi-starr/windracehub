"use client";
import { usePathname, useSearchParams } from "next/navigation";

export function LangSwitch({ current }: { current: string }) {
  const path = usePathname();
  const sp = useSearchParams().toString();
  const back = encodeURIComponent(path + (sp ? `?${sp}` : ""));
  return (
    <div className="flex overflow-hidden rounded-md border border-white/20 text-xs">
      {["de", "en", "fr"].map((l) => (
        <a key={l} href={`/lang?l=${l}&back=${back}`} className={`px-2 py-1 uppercase ${l === current ? "bg-white/20 font-bold" : "hover:bg-white/10"}`}>{l}</a>
      ))}
    </div>
  );
}
