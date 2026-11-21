// Pilot data: Swiss regattas listed on manage2sail.com for 2026 (title, dates, place, club, status, link).
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

const events = JSON.parse(readFileSync(new URL("./data/switzerland-2026.json", import.meta.url), "utf8"));
// one query for what's already there, so a re-run with nothing new takes ~1 s instead of ~900 round trips
const urlOf = (e) => `https://www.manage2sail.com/de-CH/event/${e.ref}`;
const have = new Set((await db.event.findMany({ where: { sourceUrl: { not: null } }, select: { sourceUrl: true } })).map((r) => r.sourceUrl));
const todo = events.filter((e) => !have.has(urlOf(e)));
let created = 0;
for (const e of todo) {
  const club = await db.club.upsert({ where: { name: e.club }, create: { name: e.club, shortName: SHORT[e.club] ?? null }, update: {} });
  const sourceUrl = urlOf(e);
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
