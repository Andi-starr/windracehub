// Pilot data: Zurich-region regattas listed on manage2sail.com for 2026 (title, dates, place, club, status, link).
// Run: npm run seed   (safe to re-run; existing events are matched by their manage2sail link)
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const db = new PrismaClient();
const SHORT = {
  "Zürcher Segel Club": "ZSC", "Zürcher Yacht Club": "ZYC", "Segel-Club Enge": "SCE", "Segler-Vereinigung Thalwil": "SVT",
  "Seglervereinigung Kilchberg": "SVK", "Yacht Club Horgen": "YCH", "Segel- und Yachtclub Herrliberg": "SYH",
  "Segelclub Stäfa": "SCS", "Yacht Club Rapperswil": "YCR", "Segelclub Pfäffikon SZ": "SCPf",
  "Segelclub Oberer Zürichsee": "SCOZ", "Yacht Club Au": "YCAu", "Segelclub vom Greifensee (SCvG)": "SCvG",
  "Segelclub Schloss Greifensee": "SCSG", "Segelclub Fällanden": "SCF", "Segelclub am Pfäffikersee": "SCaP",
};
const slugify = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

const events = JSON.parse(readFileSync(new URL("./data/zurich-2026.json", import.meta.url), "utf8"));
let created = 0;
for (const e of events) {
  const club = await db.club.upsert({ where: { name: e.club }, create: { name: e.club, shortName: SHORT[e.club] ?? null }, update: {} });
  const sourceUrl = `https://www.manage2sail.com/de-CH/event/${e.ref}`;
  if (await db.event.findFirst({ where: { sourceUrl } })) continue;
  const y = e.start.slice(0, 4);
  let slug = e.title.includes(y) ? slugify(e.title) : `${slugify(e.title)}-${y}`;
  for (let i = 2; await db.event.findUnique({ where: { slug } }); i++) slug = `${slugify(e.title)}-${y}-${i}`;
  await db.event.create({
    data: {
      title: e.title, slug, clubId: club.id, venue: e.venue || null,
      startDate: new Date(`${e.start}T00:00:00Z`), endDate: new Date(`${e.end}T00:00:00Z`),
      status: e.status === "Cancelled" ? "CANCELLED" : "PUBLISHED", sourceUrl,
    },
  });
  created++;
}
console.log(`${created} events imported, ${events.length - created} already there.`);
await db.$disconnect();
