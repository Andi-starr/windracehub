// Local-dev upload target. In production the browser uploads straight to Supabase Storage.
import { checkSig, saveLocal } from "@/lib/storage";

export async function PUT(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  if (!checkSig(key, new URL(req.url).searchParams.get("sig"))) return new Response("forbidden", { status: 403 });
  const fd = await req.formData();
  const file = fd.get("") ?? [...fd.values()].find((v) => v instanceof Blob);
  if (!(file instanceof Blob)) return new Response("no file", { status: 400 });
  await saveLocal(key, Buffer.from(await file.arrayBuffer()));
  return Response.json({ Key: key });
}
