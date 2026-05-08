// Client component — derives the active slug from the URL via
// usePathname so the layout doesn't need to thread it through.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DOCS_TOC, type DocLocale } from "../../lib/docs/toc";

type Props = {
  locale: DocLocale;
  basePath: string;
};

export function DocsSidebar({ locale, basePath }: Props) {
  const pathname = usePathname() ?? "";
  // Strip basePath if present, then match /docs/<locale>/<rest>.
  const stripped = basePath && pathname.startsWith(basePath)
    ? pathname.slice(basePath.length)
    : pathname;
  const m = stripped.match(/^\/docs\/handbook\/[^/]+\/(.+?)\/?$/);
  const activeSlug = m ? (m[1] ?? null) : null;

  return (
    <nav className="docs-sidebar" aria-label="Documentation navigation">
      {DOCS_TOC.map((section) => (
        <div key={section.id} className="docs-sidebar-section">
          <div className="docs-sidebar-section-title">
            {section.titles[locale]}
          </div>
          <ul className="docs-sidebar-list">
            {section.pages.map((page) => {
              const active = page.slug === activeSlug;
              const href = `${basePath}/docs/handbook/${locale}/${page.slug}`;
              return (
                <li key={page.slug}>
                  <Link
                    href={href}
                    className={
                      "docs-sidebar-link" + (active ? " is-active" : "")
                    }
                    aria-current={active ? "page" : undefined}
                  >
                    {page.titles[locale]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
