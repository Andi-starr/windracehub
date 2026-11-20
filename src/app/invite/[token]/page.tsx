import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";
import { register, login } from "@/app/login/actions";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await db.invite.findUnique({ where: { token }, include: { event: true } });
  if (!inv || inv.acceptedAt) return <div className="card mx-auto max-w-md">Diese Einladung ist ungültig oder wurde bereits verwendet.</div>;

  const user = await currentUser();
  if (user) {
    await db.$transaction([
      db.eventRole.upsert({
        where: { userId_eventId: { userId: user.id, eventId: inv.eventId } },
        create: { userId: user.id, eventId: inv.eventId, role: inv.role },
        update: inv.role === "HOST" ? { role: "HOST" } : {},
      }),
      db.invite.update({ where: { token }, data: { acceptedAt: new Date() } }),
    ]);
    redirect(`/manage/${inv.eventId}`);
  }

  const known = await db.user.findUnique({ where: { email: inv.email } });
  const roleName = inv.role === "HOST" ? "Organisator" : "Wettfahrtleitung";
  return (
    <div className="mx-auto max-w-sm card">
      <h1 className="h2">Einladung: {inv.event.title}</h1>
      <p className="mb-4 text-sm text-slate-600">Du wurdest als <strong>{roleName}</strong> eingeladen. {known?.passwordHash ? "Bitte einloggen." : "Lege ein Passwort fest, dann geht's los."}</p>
      {known?.passwordHash
        ? <AuthForm action={login} submit="Einloggen & annehmen" next={`/invite/${token}`} email={inv.email} />
        : <AuthForm action={register} submit="Konto erstellen & annehmen" withName next={`/invite/${token}`} email={inv.email} />}
    </div>
  );
}
