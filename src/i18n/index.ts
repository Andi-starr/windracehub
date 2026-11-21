import "server-only";
import { cookies, headers } from "next/headers";
import de, { type Dict } from "./de";
import en from "./en";
import fr from "./fr";

export const LOCALES = ["de", "en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
const DICTS: Record<Locale, Dict> = { de, en, fr };
export const INTL: Record<Locale, string> = { de: "de-CH", en: "en-GB", fr: "fr-CH" };

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get("lang")?.value as Locale | undefined;
  if (c && LOCALES.includes(c)) return c;
  const al = (await headers()).get("accept-language")?.toLowerCase() ?? "";
  for (const part of al.split(",")) {
    const l = part.trim().slice(0, 2) as Locale;
    if (LOCALES.includes(l)) return l;
  }
  return "de";
}

export async function getT() {
  const locale = await getLocale();
  return { t: DICTS[locale], locale, intl: INTL[locale] };
}

export function dictFor(l: Locale) { return DICTS[l]; }
