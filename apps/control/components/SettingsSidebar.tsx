// Sidebar nav for the /[ws]/settings/* sub-routes. Highlights the
// current page based on the URL. The list of sections lives in
// `lib/settings/sections.ts` so the layout, the redirect and the
// sidebar all reference the same canonical entries.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { translate, type Locale } from "../lib/i18n/dict";
import {
  SETTINGS_GROUP_LABELS,
  SETTINGS_GROUP_ORDER,
  SETTINGS_SECTIONS,
  type SettingsGroup,
  type SettingsSectionId,
} from "../lib/settings/sections";

type Props = {
  workspaceSlug: string;
  locale: Locale;
};

export function SettingsSidebar({ workspaceSlug, locale }: Props) {
  const pathname = usePathname() ?? "";
  const t = (k: string) => translate(locale, k);

  // Build a stable group → sections map so we can render a group header
  // before each block. Sections within a group keep their declaration
  // order; group order is fixed in SETTINGS_GROUP_ORDER.
  const byGroup = new Map<SettingsGroup, typeof SETTINGS_SECTIONS>();
  for (const s of SETTINGS_SECTIONS) {
    const arr = byGroup.get(s.group) ?? [];
    arr.push(s);
    byGroup.set(s.group, arr);
  }

  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {SETTINGS_GROUP_ORDER.map((group) => {
        const sections = byGroup.get(group);
        if (!sections || sections.length === 0) return null;
        return (
          <div
            key={group}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              marginTop: group === SETTINGS_GROUP_ORDER[0] ? 0 : 14,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color:
                  group === "danger" ? "var(--rose)" : "var(--app-fg-3)",
                padding: "4px 12px 4px",
              }}
            >
              {SETTINGS_GROUP_LABELS[group]}
            </div>
            {sections.map((s) => {
              const href = `/${workspaceSlug}/settings/${s.id}`;
              const active =
                pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={s.id}
                  href={href}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 10,
                    color: active ? "var(--app-fg)" : "var(--app-fg-2)",
                    background: active
                      ? "var(--app-card-2)"
                      : "transparent",
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
          </div>
        );
      })}
    </nav>
  );
}

export type { SettingsSectionId };
