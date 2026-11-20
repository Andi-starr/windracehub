import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { EventForm, type EventDefaults } from "@/components/EventForm";
import { toDayInput } from "@/lib/format";
import { createEvent } from "../actions";

export const metadata = { title: "Neue Regatta" };

function plusYear(d: Date) {
  // same weekday, ~1 year later (52 weeks)
  return new Date(d.getTime() + 364 * 864e5);
}

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ copy?: string }> }) {
  const user = await requireUser();
  const { copy } = await searchParams;
  const clubs = (await db.club.findMany({ orderBy: { name: "asc" } })).map((c) => c.name);
  let defaults: EventDefaults = {};
  if (copy) {
    const src = await db.event.findUnique({ where: { id: copy }, include: { club: true, classes: { orderBy: { position: "asc" } }, roles: true } });
    if (src && (user.isAdmin || src.roles.some((r) => r.userId === user.id && r.role === "HOST"))) {
      defaults = {
        title: src.title.replace(/\b(19|20)\d{2}\b/, String(src.startDate.getUTCFullYear() + 1)),
        club: src.club?.name, venue: src.venue ?? "",
        startDate: toDayInput(plusYear(src.startDate)), endDate: toDayInput(plusYear(src.endDate)),
        classes: src.classes.map((c) => c.name).join(", "),
        entryUrl: src.entryUrl ?? "", entryInfo: src.entryInfo ?? "", contactEmail: src.contactEmail ?? "", description: src.description ?? "",
        copyFrom: src.id,
      };
    }
  }
  return (
    <div className="mx-auto max-w-2xl card">
      <h1 className="h2">{defaults.copyFrom ? "Regatta kopieren" : "Neue Regatta"}</h1>
      <p className="mb-4 text-sm text-slate-600">
        {defaults.copyFrom
          ? "Angaben und Programm werden übernommen, Daten um ein Jahr verschoben (gleicher Wochentag). Dokumente und Resultate nicht."
          : "Nur Name und Datum sind Pflicht. Die Regatta bleibt ein Entwurf, bis du sie veröffentlichst."}
      </p>
      <EventForm action={createEvent} clubs={clubs} defaults={defaults} submit="Regatta erstellen" />
    </div>
  );
}
