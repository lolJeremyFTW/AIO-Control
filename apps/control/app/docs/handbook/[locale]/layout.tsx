// Locale-scoped layout — the docs shell with header + sidebar +
// content. Sidebar + language-switcher are client components and
// derive the active slug from usePathname themselves so the layout
// stays an RSC.

import Link from "next/link";
import { notFound } from "next/navigation";

import { LOCALES, type Locale } from "../../../../lib/i18n/dict";
import { DOCS_UI } from "../../../../lib/docs/toc";
import { DocsLanguageSwitcher } from "../../../../components/docs/DocsLanguageSwitcher";
import { DocsSidebar } from "../../../../components/docs/DocsSidebar";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function DocsLocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!LOCALES.includes(locale as Locale)) notFound();
  const loc = locale as Locale;
  const ui = DOCS_UI[loc];
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  return (
    <div className="docs-shell">
      <header className="docs-header">
        <div className="docs-header-inner">
          <Link href={`${basePath}/docs/handbook/${loc}`} className="docs-brand">
            <span className="docs-brand-mark">AIO</span>
            <span className="docs-brand-name">{ui.brand}</span>
          </Link>
          <div className="docs-header-actions">
            <DocsLanguageSwitcher current={loc} basePath={basePath} />
            <a className="docs-app-link" href={`${basePath}/`}>
              {ui.toApp} →
            </a>
          </div>
        </div>
      </header>
      <div className="docs-body">
        <aside className="docs-sidebar-wrap">
          <DocsSidebar locale={loc} basePath={basePath} />
        </aside>
        <main className="docs-main">{children}</main>
      </div>
      <footer className="docs-footer">
        <span>© TrompTech · aio.tromptech.life</span>
        <span>{ui.tagline}</span>
      </footer>
    </div>
  );
}
