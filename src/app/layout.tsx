import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { currentUser } from "@/lib/auth";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "windracehub", template: "%s · windracehub" },
  description: "Regatten in der Region Zürich: Ausschreibungen, Segelanweisungen, Mitteilungen und Resultate an einem Ort.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="de">
      <body className={`${inter.variable} min-h-screen`}>
        <header className="border-b border-sea-900 bg-sea-900 text-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <span aria-hidden>⛵</span> windracehub
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="hover:underline">Regatten</Link>
              {user ? (
                <>
                  <Link href="/manage" className="hover:underline">Meine Events</Link>
                  <form action="/logout" method="post">
                    <button className="text-sea-200 hover:underline">Abmelden</button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="rounded-md bg-white/10 px-3 py-1.5 hover:bg-white/20">Login</Link>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-8 text-xs text-slate-500">
          windracehub · Pilot Region Zürich
        </footer>
      </body>
    </html>
  );
}
