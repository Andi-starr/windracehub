// Daily (vercel.json): participant accounts unused for 365 days are deleted,
// after email notices 7 days and 1 day before. Nothing is deleted unless both notices were sent.
import { db } from "@/lib/db";
import { dictFor, INTL, type Locale } from "@/i18n";
import { fill, mailEnabled, sendMail } from "@/lib/mail";

export const dynamic = "force-dynamic";
const DAY = 864e5;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  if (!mailEnabled()) return Response.json({ skipped: "mail not configured" });

  const now = Date.now();
  const base = process.env.APP_URL ?? "https://windracehub.com";
  const users = await db.user.findMany({ where: { role: "PARTICIPANT", lastActiveAt: { lt: new Date(now - 358 * DAY) } } });
  const out = { warned7: 0, warned1: 0, deleted: 0 };

  for (const u of users) {
    // never earlier than 7 days after the first notice, so the dates in the emails always hold
    const deleteAt = Math.max(u.lastActiveAt.getTime() + 365 * DAY, (u.warned7At?.getTime() ?? now) + 7 * DAY);
    const l = (["de", "en", "fr"].includes(u.locale) ? u.locale : "de") as Locale;
    const t = dictFor(l).accounts;
    const date = new Intl.DateTimeFormat(INTL[l], { dateStyle: "long", timeZone: "Europe/Zurich" }).format(deleteAt);
    const notice = () => sendMail(u.email, t.mailWarnSubject, fill(t.mailWarnBody, { name: u.name, date, url: `${base}/login` }));

    if (!u.warned7At) {
      if (await notice()) { await db.user.update({ where: { id: u.id }, data: { warned7At: new Date() } }); out.warned7++; }
    } else if (!u.warned1At && now >= deleteAt - 1 * DAY - 6 * 3600e3) {
      if (await notice()) { await db.user.update({ where: { id: u.id }, data: { warned1At: new Date() } }); out.warned1++; }
    } else if (u.warned1At && now >= deleteAt && now - u.warned1At.getTime() >= 20 * 3600e3) {
      await db.user.delete({ where: { id: u.id } });
      out.deleted++;
    }
  }
  return Response.json(out);
}
