import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import { canHost, currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getT } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { LangSwitch } from "@/components/LangSwitch";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: { default: "windracehub", template: "%s · windracehub" }, description: t.meta.description };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, { t, locale, intl }] = await Promise.all([currentUser(), getT()]);
  const showManage = !!user && (canHost(user) || (await db.eventRole.count({ where: { userId: user.id } })) > 0);
  return (
    <html lang={locale}>
      <body className={`${inter.variable} min-h-screen`}>
        <I18nProvider t={t} intl={intl}>
          <header className="border-b border-sea-900 bg-sea-900 text-white">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
              <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
                <span aria-hidden>⛵</span> windracehub
              </Link>
              <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <Link href="/" className="hover:underline">{t.nav.regattas}</Link>
                {user ? (
                  <>
                    <Link href="/me" className="hover:underline">{t.nav.myEntries}</Link>
                    {showManage && <Link href="/manage" className="hover:underline">{t.nav.myEvents}</Link>}
                    {user.role === "ADMIN" && <Link href="/admin" className="hover:underline">{t.nav.admin}</Link>}
                    <form action="/logout" method="post">
                      <button className="text-sea-200 hover:underline" title={`${user.name} · ${t.roles[user.role]}`}>{t.nav.logout}</button>
                    </form>
                  </>
                ) : (
                  <Link href="/login" className="rounded-md bg-white/10 px-3 py-1.5 hover:bg-white/20">{t.nav.login}</Link>
                )}
                <Suspense><LangSwitch current={locale} /></Suspense>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
          <footer className="mx-auto max-w-5xl px-4 py-8 text-xs text-slate-500">{t.footer}</footer>
        </I18nProvider>
      </body>
    </html>
  );
}
