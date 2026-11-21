import "server-only";
import { createHmac } from "crypto";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || "files";
const useSupabase = !!(SB_URL && SB_KEY);
// New Supabase secret keys (sb_secret_…) go in the apikey header only; legacy service_role JWTs also as Bearer.
const sbHeaders = (): Record<string, string> =>
  SB_KEY!.startsWith("sb_") ? { apikey: SB_KEY! } : { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}` };
const LOCAL_DIR = path.join(process.cwd(), "uploads");

export function makeKey(eventId: string, fileName: string) {
  const safe = fileName.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-80);
  return `${eventId}/${Date.now().toString(36)}-${safe}`;
}

function sign(key: string) {
  return createHmac("sha256", process.env.SESSION_SECRET || "dev").update(key).digest("hex");
}
export function checkSig(key: string, sig: string | null) {
  return !!sig && sig === sign(key);
}

/** URL the browser PUTs the raw file to. Bypasses the server body limit when Supabase is configured. */
export async function signedUploadUrl(key: string): Promise<string> {
  if (!useSupabase) return `/api/upload/${key}?sig=${sign(key)}`;
  const res = await fetch(`${SB_URL}/storage/v1/object/upload/sign/${BUCKET}/${key}`, {
    method: "POST",
    headers: sbHeaders(),
  });
  if (!res.ok) throw new Error(`Storage error ${res.status}: ${await res.text()}`);
  const { url } = (await res.json()) as { url: string };
  return `${SB_URL}/storage/v1${url}`;
}

export function publicUrl(key: string) {
  if (!useSupabase) return `/files/${key}`;
  return `${SB_URL}/storage/v1/object/public/${BUCKET}/${key}`;
}

export async function saveLocal(key: string, data: Buffer) {
  const p = path.join(LOCAL_DIR, key);
  if (!p.startsWith(LOCAL_DIR)) throw new Error("bad key");
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data);
}
export async function readLocal(key: string) {
  const p = path.join(LOCAL_DIR, key);
  if (!p.startsWith(LOCAL_DIR)) throw new Error("bad key");
  return readFile(p);
}

export async function deleteFile(key: string) {
  if (!useSupabase) return; // local dev: keep files
  await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${key}`, {
    method: "DELETE",
    headers: sbHeaders(),
  });
}
