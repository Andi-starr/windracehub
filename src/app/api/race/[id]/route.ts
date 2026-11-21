import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await db.race.findUnique({
    where: { id: (await params).id },
    select: { id: true, status: true, startAt: true, sequence: true, prepFlag: true, note: true, updatedAt: true, event: { select: { status: true } }, _count: { select: { finishes: true } } },
  });
  if (!r || r.event.status === "DRAFT") return new Response("not found", { status: 404 });
  const { event: _e, ...race } = r;
  void _e;
  const early = new URL(req.url).searchParams.has("early")
    ? Object.fromEntries((await db.finish.findMany({ where: { raceId: r.id, code: { in: ["OCS", "UFD", "BFD"] } }, select: { entryId: true, code: true } })).map((f) => [f.entryId, f.code]))
    : undefined;
  return Response.json({ ...race, early, startAt: race.startAt?.getTime() ?? null, updatedAt: race.updatedAt.getTime(), now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
