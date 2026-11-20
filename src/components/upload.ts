"use client";
import { prepareUpload } from "@/app/manage/actions";

/** Uploads straight to storage (Supabase signed URL or the local dev route). Returns the storage key. */
export async function uploadFile(eventId: string, file: File) {
  const { key, url } = await prepareUpload(eventId, file.name);
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);
  const res = await fetch(url, { method: "PUT", body, headers: { "x-upsert": "false" } });
  if (!res.ok) throw new Error(`Upload fehlgeschlagen (${res.status})`);
  return key;
}
