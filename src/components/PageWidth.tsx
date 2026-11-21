"use client";
import { usePathname } from "next/navigation";

/** Content pages get a centred column; the start page runs full width on the grid. */
export function PageWidth({ children }: { children: React.ReactNode }) {
  return usePathname() === "/" ? <>{children}</> : <div className="mx-auto max-w-6xl py-8">{children}</div>;
}
