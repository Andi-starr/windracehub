import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { getT } from "@/i18n";
import { login } from "./actions";

export const metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-sm card">
      <h1 className="h2">{t.auth.loginTitle}</h1>
      <AuthForm action={login} submit={t.auth.login} next={next} />
      <p className="mt-4 text-sm text-slate-600">{t.auth.noAccount} <Link className="text-sea-600 underline" href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`}>{t.auth.register}</Link></p>
    </div>
  );
}
