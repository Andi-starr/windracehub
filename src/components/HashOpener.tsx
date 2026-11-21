"use client";
import { useEffect } from "react";

// opens the editor tile named in the URL hash (#entries etc.), so links and redirects land on an open tile
export function HashOpener() {
  useEffect(() => {
    const open = () => {
      const el = location.hash && document.getElementById(location.hash.slice(1));
      if (el instanceof HTMLDetailsElement) { el.open = true; el.scrollIntoView({ block: "start" }); }
    };
    // only one tile open at a time (also for browsers without <details name> support)
    const onToggle = (ev: Event) => {
      const d = ev.target;
      if (!(d instanceof HTMLDetailsElement) || !d.open || d.name !== "tiles") return;
      document.querySelectorAll<HTMLDetailsElement>('details[name="tiles"][open]').forEach((o) => { if (o !== d) o.open = false; });
    };
    document.addEventListener("toggle", onToggle, true);
    open();
    window.addEventListener("hashchange", open);
    return () => { window.removeEventListener("hashchange", open); document.removeEventListener("toggle", onToggle, true); };
  }, []);
  return null;
}
