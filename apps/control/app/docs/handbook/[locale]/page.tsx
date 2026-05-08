// Locale landing page — section grid + page cards. No markdown content
// here; hand-rendered from the TOC.

import Link from "next/link";
import { notFound } from "next/navigation";

import { LOCALES, type Locale } from "../../../../lib/i18n/dict";
import { DOCS_TOC, DOCS_UI } from "../../../../lib/docs/toc";

type Props = { params: Promise<{ locale: string }> };

export default async function DocsLandingPage({ params }: Props) {
  const { locale } = await params;
  if (!LOCALES.includes(locale as Locale)) notFound();
  const loc = locale as Locale;
  const ui = DOCS_UI[loc];
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  return (
    <article className="docs-article">
      <div className="docs-article-inner">
        <header className="docs-landing-hero">
          <h1 className="docs-h docs-h-1">{ui.brand}</h1>
          <p className="docs-lede">{ui.tagline}</p>
        </header>
        <div className="docs-landing-grid">
          {DOCS_TOC.map((section) => (
            <section key={section.id} className="docs-landing-section">
              <h2 className="docs-h docs-h-2">{section.titles[loc]}</h2>
              <ul className="docs-landing-list">
                {section.pages.map((page) => (
                  <li key={page.slug}>
                    <Link
                      href={`${basePath}/docs/handbook/${loc}/${page.slug}`}
                      className="docs-landing-card"
                    >
                      <span className="docs-landing-card-title">
                        {page.titles[loc]}
                      </span>
                      {page.desc?.[loc] ? (
                        <span className="docs-landing-card-desc">
                          {page.desc[loc]}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
