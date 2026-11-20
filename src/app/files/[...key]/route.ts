import { readLocal } from "@/lib/storage";

const TYPES: Record<string, string> = { pdf: "application/pdf", csv: "text/csv", htm: "text/html", html: "text/html", txt: "text/plain", png: "image/png", jpg: "image/jpeg" };

export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  try {
    const data = await readLocal(key);
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    const inline = ext === "pdf" || ext === "png" || ext === "jpg";
    return new Response(new Uint8Array(data), { headers: { "Content-Type": inline ? TYPES[ext] : "application/octet-stream", "Content-Disposition": inline ? "inline" : "attachment", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
