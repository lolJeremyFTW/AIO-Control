// /docs/handbook (no locale) — bounce to the user's preferred locale, or NL.

import { redirect } from "next/navigation";

import { getLocale } from "../../../lib/i18n/server";

export default async function DocsHandbookRedirect() {
  const locale = await getLocale();
  redirect(`/docs/handbook/${locale}`);
}
