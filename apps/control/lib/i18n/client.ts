// Client-side locale reader. Avoids prop-plumbing the active locale
// through every dialog: just call useLocale() and you get the current
// `aio_locale` cookie value (defaults to "nl"). The cookie is set by
// the setLocale() server action that the header switcher invokes; it
// re-renders the page after writing it, so the value the hook reads
// is always fresh.

"use client";

import { useEffect, useState } from "react";

import { DEFAULT_LOCALE, LOCALES, type Locale } from "./dict";

export function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const cookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith("aio_locale="));
    const v = cookie?.split("=")[1] as Locale | undefined;
    if (v && LOCALES.includes(v)) setLocale(v);
  }, []);

  return locale;
}
