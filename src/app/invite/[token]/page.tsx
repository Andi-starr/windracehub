import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";
import { register, login } from "@/app/login/actions";
import { getT } from "@/i18n";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t } = await getT();
  const inv = await db.invite.findUnique({ where: { token }, include: { event: true } });
  if (!inv || inv.acceptedAt) return <div className="card mx-auto max-w-md">{t.auth.inviteInvalid}</div>;

  const user = await currentUser();
  // an invite only works for the address it was sent to, so a forwarded link can't grant access
  if (user && user.email.toLowerCase() !== inv.email.toLowerCase()) {
    return <div className="card mx-auto max-w-md space-y-3 text-sm"><p>{t.auth.inviteOtherEmail.replace("{email}", inv.email)}</p><form action="/logout" method="post"><button className="btn-ghost">{t.nav.logout}</button></form></div>;
  }
  if (user) {
    await db.$transaction([
      db.eventRole.upsert({
        where: { userId_eventId: { userId: user.id, eventId: inv.eventId } },
        create: { userId: user.id, eventId: inv.eventId, role: inv.role },
        update: inv.role === "HOST" ? { role: "HOST" } : {},
      }),
      db.invite.update({ where: { token }, data: { acceptedAt: new Date() } }),
      ...(inv.role === "HOST" && user.role === "PARTICIPANT" ? [db.user.update({ where: { id: user.id }, data: { role: "HOST" } })] : []),
    ]);
    redirect(`/manage/${inv.eventId}`);
  }

  const known = await db.user.findUnique({ where: { email: inv.email } });
  const roleName = inv.role === "HOST" ? t.roles.HOST : t.roles.OFFICIAL;
  return (
    <div className="mx-auto max-w-sm card">
      <h1 className="h2">{t.auth.inviteTitle}: {inv.event.title}</h1>
      <p className="mb-4 text-sm text-slate-600">{t.auth.invitedAs} <strong>{roleName}</strong>. {known?.passwordHash ? t.auth.pleaseLogin : t.auth.setPw}</p>
      {known?.passwordHash
        ? <AuthForm action={login} submit={t.auth.loginAccept} next={`/invite/${token}`} email={inv.email} />
        : <AuthForm action={register} submit={t.auth.createAccept} withName next={`/invite/${token}`} email={inv.email} />}
    </div>
  );
}
