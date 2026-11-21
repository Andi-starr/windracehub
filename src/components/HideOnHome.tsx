"use client";
import { usePathname } from "next/navigation";

/** The start page brings its own editorial nav/footer, so the site chrome is hidden there. */
export function HideOnHome({ children }: { children: React.ReactNode }) {
  return usePathname() === "/" ? null : <>{children}</>;
}
