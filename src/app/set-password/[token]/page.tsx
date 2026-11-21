import { db } from "@/lib/db";
import { getT } from "@/i18n";
import { SetPasswordForm } from "@/components/SetPasswordForm";

export default async function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t } = await getT();
  const tok = await db.passwordToken.findUnique({ where: { token }, include: { user: true } });
  if (!tok || tok.expiresAt < new Date()) return <div className="card mx-auto max-w-md">{t.accounts.tokenInvalid}</div>;
  return (
    <div className="mx-auto max-w-sm card">
      <h1 className="h2">{t.accounts.setPwTitle}</h1>
      <p className="mb-4 text-sm text-slate-600">{tok.user.name} · {tok.user.email}</p>
      <SetPasswordForm token={token} />
    </div>
  );
}
