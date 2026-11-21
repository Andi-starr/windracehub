"use client";
import { useActionState } from "react";
import { setPassword } from "@/app/set-password/[token]/actions";
import { useT } from "@/i18n/client";

export function SetPasswordForm({ token }: { token: string }) {
  const { t } = useT();
  const [state, run, pending] = useActionState(setPassword.bind(null, token), undefined);
  return (
    <form action={run} className="space-y-4">
      <div><label className="label" htmlFor="password">{t.auth.password}</label><input id="password" name="password" type="password" minLength={8} required className="input" autoComplete="new-password" /></div>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{t.accounts.setPwSave}</button>
    </form>
  );
}
