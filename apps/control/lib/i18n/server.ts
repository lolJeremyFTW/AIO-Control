// Server-side locale resolution. We persist the chosen locale in a
// `aio_locale` cookie. Server Components call getLocale()/getDict() at
// the top of every page that uses translations.

import "server-only";

import { cookies } from "next/headers";

import {
  DEFAULT_LOCALE,
  LOCALES,
  translate,
  type Locale,
  type T,
} from "./dict";

export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  const v = c.get("aio_locale")?.value as Locale | undefined;
  return v && LOCALES.includes(v) ? v : DEFAULT_LOCALE;
}

export async function getDict(): Promise<{ locale: Locale; t: T }> {
  const locale = await getLocale();
  const t: T = (key, vars) => translate(locale, key, vars);
  return { locale, t };
}
