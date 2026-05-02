// Workspace-level spend limits + auto-pause toggle. Lives in the
// Settings page. Per-business overrides are configured on the
// individual business edit dialog (added separately via right-click →
// Instellingen).

"use client";

import { useState, useTransition } from "react";

import { updateWorkspaceSpendLimits } from "../app/actions/workspace-settings";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  initial: {
    daily_cents: number | null;
    monthly_cents: number | null;
    auto_pause: boolean;
  };
};

export function SpendLimitsPanel({
  workspaceSlug,
  workspaceId,
  initial,
}: Props) {
  const [daily, setDaily] = useState(toEur(initial.daily_cents));
  const [monthly, setMonthly] = useState(toEur(initial.monthly_cents));
  const [autoPause, setAutoPause] = useState(initial.auto_pause);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await updateWorkspaceSpendLimits({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        daily_cents: fromEur(daily),
        monthly_cents: fromEur(monthly),
        auto_pause: autoPause,
      });
      if (!res.ok) setError(res.error);
      else setInfo("Limits opgeslagen.");
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p
        style={{
          fontSize: 12.5,
          color: "var(--app-fg-3)",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        Stel een dagelijkse en/of maandelijkse spend cap in. Wanneer een
        business deze overschrijdt blokkeert de dispatcher nieuwe runs en
        — als auto-pause aan staat — schakelt de business automatisch
        naar paused. Per-business overrides zet je in de business
        instellingen (right-click → Instellingen op de business).
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Dagelijkse cap (EUR, leeg = geen limiet)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={daily}
            onChange={(e) => setDaily(e.target.value)}
            placeholder="Bijv. 5.00"
            style={inp}
          />
        </Field>
        <Field label="Maandelijkse cap (EUR, leeg = geen limiet)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            placeholder="Bijv. 100.00"
            style={inp}
          />
        </Field>
      </div>

      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={autoPause}
          onChange={(e) => setAutoPause(e.target.checked)}
          style={{ accentColor: "var(--tt-green)" }}
        />
        Auto-pause businesses die de cap overschrijden
      </label>

      {error && (
        <p style={{ color: "var(--rose)", fontSize: 12, margin: 0 }}>{error}</p>
      )}
      {info && (
        <p style={{ color: "var(--tt-green)", fontSize: 12, margin: 0 }}>
          {info}
        </p>
      )}

      <div>
        <button
          onClick={submit}
          disabled={pending}
          style={{
            padding: "8px 14px",
            border: "1.5px solid var(--tt-green)",
            background: "var(--tt-green)",
            color: "#fff",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 12.5,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? "Opslaan…" : "Opslaan"}
        </button>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "8px 10px",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "var(--type)",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", fontSize: 11, fontWeight: 600 }}>
      <span
        style={{
          display: "block",
          marginBottom: 4,
          color: "var(--app-fg-2)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function toEur(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function fromEur(text: string): number | null {
  if (!text.trim()) return null;
  const n = Number(text);
  if (Number.isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}
