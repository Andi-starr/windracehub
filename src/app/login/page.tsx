import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { login } from "./actions";

export const metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-sm card">
      <h1 className="h2">Login für Organisatoren</h1>
      <AuthForm action={login} submit="Einloggen" next={next} />
      <p className="mt-4 text-sm text-slate-600">Noch kein Konto? <Link className="text-sea-600 underline" href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Registrieren</Link></p>
    </div>
  );
}
