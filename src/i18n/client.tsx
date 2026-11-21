"use client";
import { createContext, useContext } from "react";
import type { Dict } from "./de";

const Ctx = createContext<{ t: Dict; intl: string } | null>(null);
export function I18nProvider({ t, intl, children }: { t: Dict; intl: string; children: React.ReactNode }) {
  return <Ctx.Provider value={{ t, intl }}>{children}</Ctx.Provider>;
}
export function useT() {
  const v = useContext(Ctx);
  if (!v) throw new Error("I18nProvider missing");
  return v;
}
