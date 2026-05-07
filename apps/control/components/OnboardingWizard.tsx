// 3-step first-run wizard. Renders inline on the dashboard when:
//   1. The workspace has 0 businesses, OR
//   2. The workspace has businesses but no provider key set anywhere, OR
//   3. Step 1 + 2 are met but no agent exists.
//
// Each step is dismissable independently — the wizard collapses once
// the user completes the underlying state (no need for a "done" flag
// in the DB; we just inspect the data).

"use client";

import Link from "next/link";
import { useState } from "react";

import { useLocale } from "../lib/i18n/client";
import { translate, type T } from "../lib/i18n/dict";
import type { BusinessRow } from "../lib/queries/businesses";
import { NewBusinessDialog } from "./NewBusinessDialog";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businesses: BusinessRow[];
  hasAnyApiKey: boolean;
  agentCount: number;
};

export function OnboardingWizard({
  workspaceSlug,
  workspaceId,
  businesses,
  hasAnyApiKey,
  agentCount,
}: Props) {
  const locale = useLocale();
  const t: T = (key, vars) => translate(locale, key, vars);
  const [showBusinessDialog, setShowBusinessDialog] = useState(false);

  const hasBusinesses = businesses.length > 0;
  const hasAgent = agentCount > 0;
  const allDone = hasBusinesses && hasAnyApiKey && hasAgent;

  // Don't render anything once the user is past all three gates.
  if (allDone) return null;

  const stepDone = (i: 1 | 2 | 3): boolean =>
    i === 1 ? hasBusinesses : i === 2 ? hasAnyApiKey : hasAgent;

  return (
    <div
      style={{
        background:
          "linear-gradient(135deg, rgba(57,178,85,0.08), rgba(255,255,255,0.02))",
        border: "1.5px solid var(--tt-green)",
        borderRadius: 14,
        padding: 18,
        marginBottom: 18,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: "var(--hand)",
              fontSize: 24,
              fontWeight: 700,
              margin: "0 0 4px",
              letterSpacing: "-0.3px",
            }}
          >
            {t("onboarding.title")}
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--app-fg-2)",
              margin: 0,
            }}
          >
            {t("onboarding.body")}
          </p>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
          marginTop: 14,
        }}
      >
        <Step
          n={1}
          title={t("onboarding.business.title")}
          done={stepDone(1)}
          desc={t("onboarding.business.desc")}
          t={t}
        >
          {!stepDone(1) && (
            <button
              onClick={() => setShowBusinessDialog(true)}
              style={btn}
            >
              {t("onboarding.business.cta")}
            </button>
          )}
        </Step>

        <Step
          n={2}
          title={t("onboarding.keys.title")}
          done={stepDone(2)}
          desc={t("onboarding.keys.desc")}
          t={t}
        >
          {!stepDone(2) && (
            <Link
              href={`/${workspaceSlug}/settings#api-keys`}
              style={btn}
            >
              {t("onboarding.keys.cta")}
            </Link>
          )}
        </Step>

        <Step
          n={3}
          title={t("onboarding.agent.title")}
          done={stepDone(3)}
          desc={t("onboarding.agent.desc")}
          t={t}
        >
          {!stepDone(3) && businesses.length > 0 && (
            <Link
              href={`/${workspaceSlug}/business/${businesses[0]!.slug}/agents`}
              style={btn}
            >
              {t("onboarding.agent.cta", { business: businesses[0]!.name })}
            </Link>
          )}
          {!stepDone(3) && businesses.length === 0 && (
            <span style={{ fontSize: 11.5, color: "var(--app-fg-3)" }}>
              {t("onboarding.agent.wait")}
            </span>
          )}
        </Step>
      </div>

      {showBusinessDialog && (
        <NewBusinessDialog
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          onClose={() => setShowBusinessDialog(false)}
        />
      )}
    </div>
  );
}

function Step({
  n,
  title,
  desc,
  done,
  t,
  children,
}: {
  n: number;
  title: string;
  desc: string;
  done: boolean;
  t: T;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--app-card)",
        border: `1.5px solid ${done ? "var(--tt-green)" : "var(--app-border)"}`,
        borderRadius: 12,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minHeight: 130,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          fontWeight: 700,
          color: done ? "var(--tt-green)" : "var(--app-fg-3)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        {done ? t("onboarding.done") : t("onboarding.step", { n })}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: "var(--app-fg-3)", lineHeight: 1.45 }}>
        {desc}
      </div>
      {children && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

const btn: React.CSSProperties = {
  display: "inline-block",
  padding: "6px 12px",
  border: "1.5px solid var(--tt-green)",
  background: "var(--tt-green)",
  color: "#fff",
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 11.5,
  cursor: "pointer",
  textDecoration: "none",
};
