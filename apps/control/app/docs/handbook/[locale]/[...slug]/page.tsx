// Catch-all content page. Resolves a slug to its markdown file +
// renders. 404s if the slug is unknown OR the markdown file is
// missing for this locale.

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LOCALES, type Locale } from "../../../../../lib/i18n/dict";
import { DOCS_UI, resolvePage } from "../../../../../lib/docs/toc";
import { loadDoc } from "../../../../../lib/docs/loader";
import { DocsMarkdown } from "../../../../../components/docs/DocsMarkdown";
import { DocsPagination } from "../../../../../components/docs/DocsPagination";

type Props = {
  params: Promise<{ locale: string; slug: string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!LOCALES.includes(locale as Locale)) return {};
  const slugStr = slug.join("/");
  const { page } = resolvePage(slugStr);
  if (!page) return {};
  const title = page.titles[locale as Locale];
  const desc = page.desc?.[locale as Locale];
  return {
    title: `${title} · AIO Control Docs`,
    description: desc,
  };
}

export default async function DocsContentPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!LOCALES.includes(locale as Locale)) notFound();
  const loc = locale as Locale;
  const ui = DOCS_UI[loc];
  const slugStr = slug.join("/");

  const { page, prev, next } = resolvePage(slugStr);
  if (!page) notFound();

  const doc = await loadDoc(loc, slugStr);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  if (!doc) {
    return (
      <article className="docs-article">
        <div className="docs-article-inner">
          <h1 className="docs-h docs-h-1">{ui.notFound}</h1>
          <p className="docs-p">{ui.notFoundBody}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="docs-article">
      <div className="docs-article-inner">
        <header className="docs-article-header">
          <span className="docs-article-eyebrow">
            {page.titles[loc]}
          </span>
          {doc.frontmatter.title ? (
            <h1 className="docs-h docs-h-1">{doc.frontmatter.title}</h1>
          ) : (
            <h1 className="docs-h docs-h-1">{page.titles[loc]}</h1>
          )}
          {doc.frontmatter.description ? (
            <p className="docs-lede">{doc.frontmatter.description}</p>
          ) : null}
        </header>
        <DocsMarkdown text={doc.body} />
        <DocsPagination
          locale={loc}
          prev={prev}
          next={next}
          basePath={basePath}
        />
      </div>
    </article>
  );
}
