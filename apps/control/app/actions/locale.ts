// Single-purpose server action: persist the user's chosen UI locale in a
// long-lived cookie. We don't put it in the DB because (a) anonymous
// users (login screen) need to switch too, and (b) it's UA-state, not
// user-state — different browsers can have different preferences.

"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { LOCALES, type Locale } from "../../lib/i18n/dict";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setLocale(locale: string): Promise<{ ok: boolean }> {
  if (!LOCALES.includes(locale as Locale)) return { ok: false };
  const c = await cookies();
  c.set("aio_locale", locale, {
    maxAge: ONE_YEAR,
    path: "/",
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
