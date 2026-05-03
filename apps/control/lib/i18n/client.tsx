// Client-side locale reader. Pulls the active locale from a React
// context that the workspace layout populates with the value it just
// read server-side from the aio_locale cookie. That way the locale is
// always fresh on every render — even after the language switcher
// triggers router.refresh() — without the hook having to poll the
// cookie or do a hydration-mismatch-prone direct document.cookie read.
//
// Usage:
//   const locale = useLocale();   // returns "nl" | "en" | "de"
//
// Components that don't sit under the LocaleProvider fall back to
// DEFAULT_LOCALE — e.g. the unauthenticated /login page, where there
// is no workspace layout to inject the value.

"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import { DEFAULT_LOCALE, type Locale } from "./dict";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
