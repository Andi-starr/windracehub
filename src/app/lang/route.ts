import { LOCALES } from "@/i18n";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const l = url.searchParams.get("l") ?? "de";
  const back = url.searchParams.get("back") ?? "/";
  const dest = back.startsWith("/") && !back.startsWith("//") ? back : "/";
  const res = new Response(null, { status: 303, headers: { Location: dest } });
  if ((LOCALES as readonly string[]).includes(l)) res.headers.append("Set-Cookie", `lang=${l}; Path=/; Max-Age=31536000; SameSite=Lax`);
  return res;
}
