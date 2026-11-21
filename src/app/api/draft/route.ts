import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const TYPES = {
  NOR: "Notice of Race (Ausschreibung / Avis de course)",
  SI: "Sailing Instructions (Segelanweisungen / Instructions de course)",
  SCHEDULE: "Schedule of the event (Programm / Programme): registration, briefing, warning signals per day, last possible warning signal, prize giving. Use a clear day-by-day table-like layout with times",
  AMENDMENT: "Amendment to the Sailing Instructions or Notice of Race",
  NOTICE: "Notice to competitors (Mitteilung an die Teilnehmer / Avis aux concurrents)",
} as const;
const LANGS = { de: "German (Swiss conventions, use ss instead of ß)", en: "English", fr: "French (Swiss conventions)" } as const;

const SYSTEM = `You draft official regatta documents for Swiss sailing events (Swiss Sailing, World Sailing Racing Rules of Sailing 2025-2028).
Write the complete document in the requested language, structured like the World Sailing NoR/SI guides: numbered sections and sub-rules (1, 1.1, 1.2 ...), short and precise.
Use only the event facts you are given. Where a fact is needed but missing (times, fees, courses, contact, jury), write a clear placeholder in square brackets like [Meldegebühr CHF ...] so the host sees what to fill in. Never invent names, phone numbers, fees or prices.
Output plain text only: no Markdown symbols (#, *, **, tables). Start with the document title on the first line, then the event name, dates and organising club. Uppercase section headings are fine.`;

function fmt(d: Date) { return d.toISOString().slice(0, 10); }

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const body = await req.json().catch(() => null) as { eventId?: string; type?: string; lang?: string; notes?: string } | null;
  const eventId = String(body?.eventId ?? "");
  if (user.role !== "ADMIN" && !(await db.eventRole.findUnique({ where: { userId_eventId: { userId: user.id, eventId } } })))
    return new Response("forbidden", { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return new Response("no-key", { status: 503 });

  const type = (body?.type && body.type in TYPES ? body.type : "NOR") as keyof typeof TYPES;
  const lang = (body?.lang && body.lang in LANGS ? body.lang : "de") as keyof typeof LANGS;
  const notes = String(body?.notes ?? "").slice(0, 4000);

  const e = await db.event.findUnique({
    where: { id: eventId },
    include: { club: true, classes: { orderBy: { position: "asc" } }, schedule: { orderBy: { at: "asc" } }, documents: { select: { title: true, type: true } } },
  });
  if (!e) return new Response("not found", { status: 404 });

  const facts = [
    `Event: ${e.title}`,
    `Organising club: ${e.club?.name ?? "[Club]"}`,
    `Venue: ${e.venue ?? "[Ort]"}`,
    `Dates: ${fmt(e.startDate)} to ${fmt(e.endDate)}`,
    `Classes: ${e.classes.map((c) => c.name).join(", ") || "[Klassen]"}`,
    e.schedule.length ? `Schedule (Europe/Zurich):\n${e.schedule.map((s) => `- ${new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "short" }).format(s.at)} ${s.title}`).join("\n")}` : "Schedule: [Programm]",
    e.discards ? `Discards: ${e.discards} (races:discards)` : "",
    e.entryInfo ? `Entry info: ${e.entryInfo}` : "",
    e.contactEmail ? `Contact: ${e.contactEmail}` : "",
    e.description ? `Description: ${e.description}` : "",
    `Online entry and official notice board: windracehub.com (event page). Scoring and start timer also run there.`,
    e.documents.length ? `Already published documents: ${e.documents.map((d) => `${d.type}: ${d.title}`).join("; ")}` : "",
  ].filter(Boolean).join("\n");

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: `Draft this document: ${TYPES[type]}\nLanguage: ${LANGS[lang]}\n\nEvent facts:\n${facts}\n\nInstructions from the host (follow them):\n${notes || "(none)"}`,
    }],
  });

  const enc = new TextEncoder();
  const out = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") ctrl.enqueue(enc.encode(ev.delta.text));
        }
        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") ctrl.enqueue(enc.encode("\n\n[⚠ refusal]"));
        else if (msg.stop_reason === "max_tokens") ctrl.enqueue(enc.encode("\n\n[⚠ truncated]"));
      } catch (err) {
        const m = err instanceof Anthropic.APIError ? `API ${err.status}` : "error";
        ctrl.enqueue(enc.encode(`\n\n[⚠ ${m}]`));
      } finally {
        ctrl.close();
      }
    },
    cancel() { stream.abort(); },
  });
  return new Response(out, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
