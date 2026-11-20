import { db } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const e = await db.event.findUnique({ where: { slug: (await params).slug }, include: { club: true } });
  if (!e || e.status === "DRAFT") return new Response("Not found", { status: 404 });
  const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const end = new Date(e.endDate.getTime() + 864e5);
  const esc = (s: string) => s.replace(/[\\,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  const base = process.env.APP_URL ?? "https://windracehub.com";
  const body = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//windracehub//DE",
    "BEGIN:VEVENT",
    `UID:${e.id}@windracehub.com`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${day(e.startDate)}`,
    `DTEND;VALUE=DATE:${day(end)}`,
    `SUMMARY:${esc(e.title)}`,
    e.venue ? `LOCATION:${esc(e.venue)}` : "",
    `URL:${base}/e/${e.slug}`,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${e.slug}.ics"` },
  });
}
