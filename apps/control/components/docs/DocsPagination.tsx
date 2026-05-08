// Bottom-of-page prev/next links. Either side can be null when at the
// edge of the TOC.

import Link from "next/link";

import { DOCS_UI, type DocLocale, type DocPage } from "../../lib/docs/toc";

type Props = {
  locale: DocLocale;
  prev: DocPage | null;
  next: DocPage | null;
  basePath: string;
};

export function DocsPagination({ locale, prev, next, basePath }: Props) {
  const ui = DOCS_UI[locale];
  return (
    <div className="docs-pagination">
      {prev ? (
        <Link
          href={`${basePath}/docs/handbook/${locale}/${prev.slug}`}
          className="docs-pagination-link is-prev"
        >
          <span className="docs-pagination-label">{ui.prev}</span>
          <span className="docs-pagination-title">{prev.titles[locale]}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={`${basePath}/docs/handbook/${locale}/${next.slug}`}
          className="docs-pagination-link is-next"
        >
          <span className="docs-pagination-label">{ui.next}</span>
          <span className="docs-pagination-title">{next.titles[locale]}</span>
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
