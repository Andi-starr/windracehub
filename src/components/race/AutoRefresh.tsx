"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Finish device: picks up races the start device created, without a manual reload. */
export function AutoRefresh({ ms = 15000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const i = setInterval(() => { if (document.visibilityState === "visible" && navigator.onLine) router.refresh(); }, ms);
    return () => clearInterval(i);
  }, [ms, router]);
  return null;
}
