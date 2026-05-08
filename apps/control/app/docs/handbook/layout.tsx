// /docs root layout. Public — no auth required. Holds the docs-only
// CSS so it doesn't leak into the workspace shell.

import "./docs.css";

export default function DocsRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="docs-root">{children}</div>;
}
