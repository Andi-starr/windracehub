"use client";
import { useEffect } from "react";

// After a new deploy, a page that was open before can't talk to the server anymore
// (old chunks / server action ids). One automatic reload fixes that.
const STALE = /ChunkLoadError|Loading chunk|Failed to find Server Action|unexpected response|Failed to fetch dynamically imported module/i;

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    try {
      const k = "wrh-reloaded";
      if (STALE.test(`${error.name} ${error.message}`) && !sessionStorage.getItem(k)) {
        sessionStorage.setItem(k, "1");
        window.location.reload();
        return;
      }
      sessionStorage.removeItem(k);
    } catch { /* storage blocked */ }
  }, [error]);
  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <p className="text-lg font-semibold">Etwas ist schiefgelaufen · Something went wrong · Une erreur s’est produite</p>
      <p className="text-sm text-slate-600">{error.digest ? `Code ${error.digest}` : error.message}</p>
      <div className="flex justify-center gap-2">
        <button className="btn" onClick={() => window.location.reload()}>↻ Neu laden / Reload</button>
        <button className="btn-ghost" onClick={() => reset()}>Erneut versuchen / Retry</button>
      </div>
    </div>
  );
}
