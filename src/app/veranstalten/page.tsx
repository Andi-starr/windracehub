import Link from "next/link";
import { currentUser, canHost } from "@/lib/auth";
import { getT } from "@/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Regatta veranstalten" };

export default async function HostPage() {
  const [{ t }, user] = await Promise.all([getT(), currentUser()]);
  const h = t.hostPage;
  const contact = process.env.CONTACT_EMAIL;
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="h1">{h.title}</h1>
      <p className="text-[15px] leading-relaxed">{h.text}</p>
      {canHost(user) ? (
        <Link href="/manage" className="btn">{h.toManage} →</Link>
      ) : contact ? (
        <div className="space-y-2">
          <p className="text-sm text-ink/70">{h.askHint}</p>
          <a href={`mailto:${contact}?subject=${encodeURIComponent(h.title)}`} className="btn">{h.ask} →</a>
        </div>
      ) : (
        <p className="text-sm text-ink/70">{h.noContact}</p>
      )}
      {!user && <p className="text-[11px] font-medium uppercase tracking-wide">{h.have} <Link href="/login?next=/manage" className="underline">{t.nav.login}</Link></p>}
    </div>
  );
}
