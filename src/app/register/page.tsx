import { AuthForm } from "@/components/AuthForm";
import { register } from "../login/actions";

export const metadata = { title: "Registrieren" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-sm card">
      <h1 className="h2">Konto erstellen</h1>
      <p className="mb-4 text-sm text-slate-600">Für Clubs, die eine Regatta ausschreiben, und für Wettfahrtleitungen.</p>
      <AuthForm action={register} submit="Konto erstellen" withName next={next} />
    </div>
  );
}
