import { AuthForm } from "@/components/AuthForm";
import { getT } from "@/i18n";
import { register } from "../login/actions";

export const metadata = { title: "Register" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-sm card">
      <h1 className="h2">{t.auth.registerTitle}</h1>
      <p className="mb-4 text-sm text-slate-600">{t.auth.registerIntro}</p>
      <AuthForm action={register} submit={t.auth.createAccount} withName next={next} />
    </div>
  );
}
