// Shared card chrome used by every /settings/* sub-page. Same look as
// the panels on the old single-page settings view: white card, big
// hand-drawn h3, optional desc, then the section's actual content.
//
// Sub-pages use it like this:
//
//   <SettingsSectionCard title="Telegram" desc="Stuur run-rapporten…">
//     <TelegramPanel … />
//   </SettingsSectionCard>

import type { ReactNode } from "react";

type Props = {
  title: string;
  desc?: string;
  /** When set, anchors the card so /[ws]/settings/<section>#<id>
   *  deep-links jump scroll to it. */
  id?: string;
  children: ReactNode;
};

export function SettingsSectionCard({ id, title, desc, children }: Props) {
  return (
    <section
      id={id}
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 16,
        padding: "22px 24px",
        scrollMarginTop: 16,
      }}
    >
      <h3
        style={{
          fontFamily: "var(--hand)",
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: "-0.2px",
          margin: "0 0 4px",
        }}
      >
        {title}
      </h3>
      {desc && (
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 13,
            margin: "0 0 16px",
          }}
        >
          {desc}
        </p>
      )}
      {children}
    </section>
  );
}
