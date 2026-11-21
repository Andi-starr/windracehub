"use client";
import { useActionState } from "react";
import type { FormState } from "@/app/login/actions";
import { useT } from "@/i18n/client";

export function AuthForm({
  action, submit, withName, next, email,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  submit: string; withName?: boolean; next?: string; email?: string;
}) {
  const { t } = useT();
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      {withName && (
        <div><label className="label" htmlFor="name">{t.common.name}</label><input id="name" name="name" className="input" required autoComplete="name" /></div>
      )}
      <div>
        <label className="label" htmlFor="email">{t.common.email}</label>
        <input id="email" name="email" type="email" className="input" required autoComplete="email" defaultValue={email} readOnly={!!email} />
      </div>
      <div>
        <label className="label" htmlFor="password">{t.auth.password}</label>
        <input id="password" name="password" type="password" className="input" required minLength={withName ? 8 : undefined} autoComplete={withName ? "new-password" : "current-password"} />
      </div>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "…" : submit}</button>
    </form>
  );
}
