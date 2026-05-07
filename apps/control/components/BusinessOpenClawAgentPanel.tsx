"use client";

import { useState, useTransition } from "react";

import {
  createBusinessOpenClawAgent,
  setBusinessOpenClawAgentName,
  verifyBusinessOpenClawAgent,
} from "../app/actions/businesses";
import type { BusinessRow } from "../lib/queries/businesses";
import {
  defaultBusinessOpenClawAgentName,
  openclawBusinessAgentCommand,
} from "../lib/providers/runtime";

type Props = {
  workspaceSlug: string;
  business: BusinessRow;
};

export function BusinessOpenClawAgentPanel({
  workspaceSlug,
  business,
}: Props) {
  const fallbackName = defaultBusinessOpenClawAgentName(business.slug);
  const [name, setName] = useState(
    business.openclaw_agent_name ?? fallbackName,
  );
  const [savedName, setSavedName] = useState(
    business.openclaw_agent_name ?? null,
  );
  const [initializedAt, setInitializedAt] = useState(
    business.openclaw_agent_initialized_at,
  );
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const normalizedName = name.trim().toLowerCase();
  const dirty = (savedName ?? "") !== normalizedName;
  const command = openclawBusinessAgentCommand(normalizedName || fallbackName);

  const onSave = () =>
    startTransition(async () => {
      setError(null);
      setInfo(null);
      const res = await setBusinessOpenClawAgentName({
        workspace_slug: workspaceSlug,
        business_id: business.id,
        name: normalizedName,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedName(normalizedName);
      setInitializedAt(null);
      setInfo("Naam opgeslagen. Maak of verifieer de agent op de VPS.");
    });

  const onUseWorkspace = () =>
    startTransition(async () => {
      setError(null);
      setInfo(null);
      const res = await setBusinessOpenClawAgentName({
        workspace_slug: workspaceSlug,
        business_id: business.id,
        name: null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedName(null);
      setName(fallbackName);
      setInitializedAt(null);
      setInfo("Deze business gebruikt weer de workspace OpenClaw-agent.");
    });

  const onCreate = () =>
    startTransition(async () => {
      setError(null);
      setInfo(null);
      const res = await createBusinessOpenClawAgent({
        workspace_slug: workspaceSlug,
        business_id: business.id,
        name: normalizedName || fallbackName,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName(res.data.name);
      setSavedName(res.data.name);
      setInitializedAt(new Date().toISOString());
      setInfo(
        res.data.mirroredFrom
          ? `Aangemaakt en gespiegeld vanaf ${res.data.mirroredFrom}.`
          : "Aangemaakt. Geen bron-agent gevonden om auth/models van te spiegelen.",
      );
    });

  const onVerify = () =>
    startTransition(async () => {
      setError(null);
      setInfo(null);
      const res = await verifyBusinessOpenClawAgent({
        workspace_slug: workspaceSlug,
        business_id: business.id,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName(res.data.name);
      setSavedName(res.data.name);
      setInitializedAt(new Date().toISOString());
      setInfo(`Geverifieerd in ${res.data.latencyMs} ms.`);
    });

  return (
    <section
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 14,
        padding: "16px 18px",
        display: "grid",
        gap: 12,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--app-fg-3)",
            marginBottom: 4,
          }}
        >
          OpenClaw runtime
        </div>
        <p
          style={{
            margin: 0,
            color: "var(--app-fg-3)",
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          OpenClaw-agents binnen deze business gebruiken deze eigen runtime
          agent. Leeg laten valt terug op de workspace-agent.
        </p>
      </div>

      <label style={{ display: "grid", gap: 4 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--app-fg-2)",
          }}
        >
          Agent name
        </span>
        <input
          value={name}
          onChange={(e) =>
            setName(
              e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
            )
          }
          placeholder={fallbackName}
          style={inputStyle}
        />
      </label>

      <code
        style={{
          display: "block",
          padding: "8px 10px",
          background: "var(--app-card-2)",
          border: "1px solid var(--app-border-2)",
          borderRadius: 8,
          color: "var(--app-fg-2)",
          fontSize: 11.5,
          overflowX: "auto",
          whiteSpace: "nowrap",
        }}
      >
        {command}
      </code>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !dirty}
          style={buttonStyle("ghost", pending || !dirty)}
        >
          Opslaan
        </button>
        <button
          type="button"
          onClick={onCreate}
          disabled={pending}
          style={buttonStyle("primary", pending)}
        >
          Create on VPS
        </button>
        <button
          type="button"
          onClick={onVerify}
          disabled={pending || !savedName}
          style={buttonStyle("ghost", pending || !savedName)}
        >
          Verifieren
        </button>
        {savedName && (
          <button
            type="button"
            onClick={onUseWorkspace}
            disabled={pending}
            style={buttonStyle("ghost", pending)}
          >
            Gebruik workspace
          </button>
        )}
      </div>

      {initializedAt && (
        <p style={{ margin: 0, color: "var(--tt-green)", fontSize: 12 }}>
          Actief sinds {formatRelative(new Date(initializedAt))}
        </p>
      )}
      {info && !error && (
        <p style={{ margin: 0, color: "var(--tt-green)", fontSize: 12 }}>
          {info}
        </p>
      )}
      {error && (
        <p
          role="alert"
          style={{
            margin: 0,
            color: "var(--rose)",
            background: "rgba(230,82,107,0.08)",
            border: "1px solid rgba(230,82,107,0.35)",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 12,
          }}
        >
          {error}
        </p>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "9px 11px",
  borderRadius: 8,
  fontFamily: "ui-monospace, Menlo, monospace",
  fontSize: 13,
};

function buttonStyle(kind: "primary" | "ghost", disabled: boolean) {
  return {
    padding: "8px 12px",
    borderRadius: 9,
    border:
      kind === "primary"
        ? "1.5px solid var(--tt-green)"
        : "1.5px solid var(--app-border)",
    background: kind === "primary" ? "var(--tt-green)" : "var(--app-card-2)",
    color: kind === "primary" ? "#fff" : "var(--app-fg)",
    fontWeight: 700,
    fontSize: 12,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  } satisfies React.CSSProperties;
}

function formatRelative(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "net";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  return `${Math.floor(hours / 24)} dagen geleden`;
}
