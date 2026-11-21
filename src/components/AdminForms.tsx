"use client";
import { useActionState, useState } from "react";
import { createHost, resetLink } from "@/app/admin/actions";
import { useT } from "@/i18n/client";

export function CreateHostForm() {
  const { t } = useT();
  const [state, run, pending] = useActionState(createHost, undefined);
  return (
    <div className="space-y-2">
      <form action={run} className="flex flex-col gap-2 sm:flex-row">
        <input name="name" required placeholder={t.common.name} className="input sm:w-56" />
        <input name="email" type="email" required placeholder={t.common.email} className="input flex-1" />
        <button className="btn" disabled={pending}>{t.accounts.createHost}</button>
      </form>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.link && <LinkBox text={t.accounts.created} link={state.link} />}
      {state?.note && <p className="text-sm text-emerald-700">{state.note}</p>}
    </div>
  );
}

export function ResetLinkButton({ userId }: { userId: string }) {
  const { t } = useT();
  const [link, setLink] = useState("");
  return link ? <LinkBox text="" link={link} /> : (
    <button className="btn-ghost px-2 py-1 text-xs" onClick={async () => setLink(await resetLink(userId))}>{t.accounts.resetLink}</button>
  );
}

function LinkBox({ text, link }: { text: string; link: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="w-full rounded-lg bg-emerald-50 p-2 text-sm">
      {text && <p className="mb-1 font-medium text-emerald-900">{text}</p>}
      <div className="flex gap-2">
        <input readOnly value={link} className="input font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button type="button" className="btn-ghost" onClick={() => { navigator.clipboard.writeText(link); setCopied(true); }}>{copied ? t.common.copied : t.common.copy}</button>
      </div>
    </div>
  );
}
