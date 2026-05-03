// Sidebar nav for the /[ws]/settings/* sub-routes. Highlights the
// current page based on the URL. The list of sections lives in
// `lib/settings/sections.ts` so the layout, the redirect and the
// sidebar all reference the same canonical entries.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { translate, type Locale } from "../lib/i18n/dict";
import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "../lib/settings/sections";

type Props = {
  workspaceSlug: string;
  locale: Locale;
};

export function SettingsSidebar({ workspaceSlug, locale }: Props) {
  const pathname = usePathname() ?? "";
  const t = (k: string) => translate(locale, k);

  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {SETTINGS_SECTIONS.map((s) => {
        const href = `/${workspaceSlug}/settings/${s.id}`;
        const active =
          pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={s.id}
            href={href}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              color: active ? "var(--app-fg)" : "var(--app-fg-2)",
              background: active ? "var(--app-card-2)" : "transparent",
              borderLeft: active
                ? "2.5px solid var(--tt-green)"
                : "2.5px solid transparent",
              fontSize: 13,
              fontWeight: active ? 700 : 600,
              textDecoration: "none",
              transition: "background 0.12s ease, color 0.12s ease",
            }}
          >
            {t(s.labelKey)}
            {s.badge === "danger" && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 10,
                  color: "var(--rose)",
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                ⚠
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export type { SettingsSectionId };
