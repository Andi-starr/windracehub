"use client";
import { useEffect } from "react";

// opens the editor tile named in the URL hash (#entries etc.), so links and redirects land on an open tile
export function HashOpener() {
  useEffect(() => {
    const open = () => {
      const el = location.hash && document.getElementById(location.hash.slice(1));
      if (el instanceof HTMLDetailsElement) { el.open = true; el.scrollIntoView({ block: "start" }); }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
