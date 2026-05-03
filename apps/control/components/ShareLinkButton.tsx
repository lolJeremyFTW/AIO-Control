// Tiny copy-to-clipboard button used by the public /share/[slug]
// page. Lives in its own client file so the surrounding page can
// stay a Server Component (which is what we want — it gets cached
// and renders fast for cold readers landing from a shared link).

"use client";

import { useState } from "react";

type Props = { slug: string };

export function ShareLinkButton({ slug }: Props) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        const url = `${window.location.origin}/share/${slug}`;
        navigator.clipboard
          ?.writeText(url)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          })
          .catch(() => null);
      }}
      style={{
        padding: "12px 18px",
        background: "transparent",
        border: "1.5px solid var(--app-border)",
        color: "var(--app-fg)",
        borderRadius: 12,
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {copied ? "✓ Gekopieerd" : "🔗 Kopieer link"}
    </button>
  );
}
