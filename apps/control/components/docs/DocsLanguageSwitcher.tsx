// Client component — derives current slug from the URL so the
// switcher preserves the page across locales (/docs/nl/agents →
// /docs/en/agents).

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  LOCALES,
  LOCALE_LABEL,
  type Locale,
} from "../../lib/i18n/dict";

type Props = {
  current: Locale;
  basePath: string;
};

export function DocsLanguageSwitcher({ current, basePath }: Props) {
  const pathname = usePathname() ?? "";
  const stripped = basePath && pathname.startsWith(basePath)
    ? pathname.slice(basePath.length)
    : pathname;
  const m = stripped.match(/^\/docs\/handbook\/[^/]+\/(.+?)\/?$/);
  const slug = m ? (m[1] ?? null) : null;

  return (
    <div className="docs-lang-switcher" role="group" aria-label="Language">
      {LOCALES.map((loc) => {
        const href = slug
          ? `${basePath}/docs/handbook/${loc}/${slug}`
          : `${basePath}/docs/handbook/${loc}`;
        const active = loc === current;
        return (
          <Link
            key={loc}
            href={href}
            className={
              "docs-lang-pill" + (active ? " is-active" : "")
            }
            aria-pressed={active ? "true" : "false"}
          >
            {LOCALE_LABEL[loc]}
          </Link>
        );
      })}
    </div>
  );
}
