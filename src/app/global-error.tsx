"use client";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
    try {
      if (!sessionStorage.getItem("wrh-reloaded")) { sessionStorage.setItem("wrh-reloaded", "1"); window.location.reload(); }
    } catch { /* storage blocked */ }
  }, [error]);
  return (
    <html lang="de">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "4rem 1rem", background: "#f8fafc", color: "#0f172a" }}>
        <p style={{ fontWeight: 600 }}>Etwas ist schiefgelaufen · Something went wrong</p>
        <p style={{ fontSize: 13, color: "#475569" }}>{error.digest ? `Code ${error.digest}` : error.message}</p>
        <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, background: "#0e6a8f", color: "#fff", border: 0 }}>↻ Neu laden / Reload</button>
      </body>
    </html>
  );
}
