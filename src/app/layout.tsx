import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import { canHost, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getT } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { LangSwitch } from "@/components/LangSwitch";
import { PageWidth } from "@/components/PageWidth";

// self-hosted, no Google fetch at build time
const grotesk = localFont({
  variable: "--font-grotesk",
  display: "swap",
  src: [
    { path: "../../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2", weight: "500" },
    { path: "../../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2", weight: "700" },
  ],
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: { default: "windracehub", template: "%s · windracehub" }, description: t.meta.description };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, { t, locale, intl }] = await Promise.all([currentUser(), getT()]);
  const showManage = !!user && (canHost(user) || (await db.eventRole.count({ where: { userId: user.id } })) > 0);
  return (
    <html lang={locale}>
      <body className={`${grotesk.variable} min-h-screen`}>
        <I18nProvider t={t} intl={intl}>
          {/* thin vertical grid lines over the whole page */}
          <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 grid grid-cols-6 px-4 sm:px-8 lg:grid-cols-12">
            {Array.from({ length: 12 }, (_, i) => <div key={i} className={`border-l border-ink/10 ${i >= 6 ? "hidden lg:block" : ""}`} />)}
          </div>
          <header className="flex flex-wrap items-stretch border-y-2 border-ink">
            <Link href="/" className="order-1 flex flex-1 items-center px-4 py-3 text-base font-bold tracking-tight sm:flex-none sm:px-8">WINDRACEHUB</Link>
              <Link href={user ? "/me" : "/login"} className="order-2 flex items-center gap-2 bg-accent sm:order-3 px-5 py-3 text-xs font-bold uppercase tracking-wide text-ink hover:brightness-105 sm:px-8 sm:text-sm">
                {user ? t.nav.myEntries : t.nav.login} <span aria-hidden>→</span>
              </Link>

            <nav className="order-3 flex w-full flex-wrap items-stretch border-t-2 border-ink sm:order-2 sm:ml-auto sm:w-auto sm:border-t-0">
              <Link href="/regatten" className="navcell first:border-l-0 sm:first:border-l-2">{t.nav.regattas}</Link>
              <Link href="/clubs" className="navcell">{t.nav.clubs}</Link>
              <Link href="/klassen" className="navcell">{t.nav.classes}</Link>
              {user && showManage && <Link href="/manage" className="navcell">{t.nav.myEvents}</Link>}
              {user?.role === "ADMIN" && <Link href="/admin" className="navcell">{t.nav.admin}</Link>}
              {user && (
                <form action="/logout" method="post" className="flex">
                  <button className="navcell" title={`${user.name} · ${t.roles[user.role]}`}>{t.nav.logout}</button>
                </form>
              )}
              <div className="navcell"><Suspense><LangSwitch current={locale} /></Suspense></div>
            </nav>
          </header>
          <main className="px-4 sm:px-8"><PageWidth>{children}</PageWidth></main>
          <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t-2 border-ink px-4 py-4 text-[11px] font-medium uppercase tracking-wide sm:px-8">
            <span>{t.footer}</span>
            <Link href="/veranstalten" className="opacity-70 hover:underline hover:opacity-100">{t.nav.host} →</Link>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
