// Tiered API key manager — workspace defaults + per-business overrides
// + per-nav-node overrides. Lives inside the Settings page; reads
// existing keys from /api/api-keys (or via server-rendered prop) and
// edits via setApiKey / deleteApiKey server actions.
//
// Resolution order at call time (most specific wins):
//   navnode (and ancestors) → business → workspace → env-var fallback
//
// We never display the key itself — only "set" / "not set" + a label.

"use client";

import { useState, useTransition } from "react";

import {
  deleteApiKey,
  setApiKey,
  type ApiKeyMetadata,
  type ApiKeyScope,
} from "../app/actions/api-keys";
import type { BusinessRow } from "../lib/queries/businesses";
import type { NavNode } from "../lib/queries/nav-nodes";

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic / Claude" },
  { id: "minimax", label: "MiniMax (Coder Plan)" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "openai", label: "OpenAI" },
  { id: "telegram", label: "Telegram bot token" },
  { id: "custom_webhook", label: "Custom webhook secret" },
  // SMTP creds zijn een speciale set; meestal config je ze via de
  // Email Settings panel maar je kunt 'm hier handmatig overschrijven.
  { id: "smtp_host", label: "SMTP host (auto via Email panel)" },
  { id: "smtp_user", label: "SMTP user" },
  { id: "smtp_pass", label: "SMTP password" },
];

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  initialKeys: ApiKeyMetadata[];
  businesses: BusinessRow[];
  navNodes: NavNode[];
};

export function ApiKeysPanel({
  workspaceSlug,
  workspaceId,
  initialKeys,
  businesses,
  navNodes,
}: Props) {
  const [keys, setKeys] = useState<ApiKeyMetadata[]>(initialKeys);
  const [adding, setAdding] = useState(false);
  const [scope, setScope] = useState<ApiKeyScope>("workspace");
  const [scopeId, setScopeId] = useState(workspaceId);
  const [provider, setProvider] = useState("anthropic");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await setApiKey({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        scope,
        scope_id:
          scope === "workspace"
            ? workspaceId
            : scopeId,
        provider,
        value,
        label: label || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Optimistically add to the list. The next page-load will refresh
      // from the server-rendered metadata anyway.
      setKeys((prev) => [
        ...prev.filter(
          (k) =>
            !(
              k.workspace_id === workspaceId &&
              k.scope === scope &&
              k.scope_id === (scope === "workspace" ? workspaceId : scopeId) &&
              k.provider === provider
            ),
        ),
        {
          id: res.data.id,
          workspace_id: workspaceId,
          scope,
          scope_id: scope === "workspace" ? workspaceId : scopeId,
          provider,
          label: label || null,
          has_value: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
      setAdding(false);
      setValue("");
      setLabel("");
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      const res = await deleteApiKey({ workspace_slug: workspaceSlug, id });
      if (res.ok) setKeys((prev) => prev.filter((k) => k.id !== id));
    });

  const labelFor = (k: ApiKeyMetadata) => {
    if (k.scope === "workspace") return "Workspace default";
    if (k.scope === "business") {
      const b = businesses.find((bb) => bb.id === k.scope_id);
      return `Business · ${b?.name ?? "(verwijderd)"}`;
    }
    const n = navNodes.find((nn) => nn.id === k.scope_id);
    return `Topic · ${n?.name ?? "(verwijderd)"}`;
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
        Stel API keys in op workspace-niveau (default voor alle agents) of
        overschrijf per business of per topic. Resolution: topic → business →
        workspace → env-var fallback.
      </p>

      {keys.length === 0 ? (
        <p
          style={{
            fontSize: 12.5,
            color: "var(--app-fg-3)",
            padding: 16,
            border: "1px dashed var(--app-border)",
            borderRadius: 10,
            margin: 0,
          }}
        >
          Nog geen keys ingesteld. Klik &quot;+ Key toevoegen&quot; om te
          starten.
        </p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            border: "1px solid var(--app-border)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {keys.map((k) => (
            <div
              key={k.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 80px 80px",
                gap: 8,
                alignItems: "center",
                padding: "10px 12px",
                borderBottom: "1px solid var(--app-border-2)",
                background: "var(--app-card-2)",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {PROVIDERS.find((p) => p.id === k.provider)?.label ??
                    k.provider}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--app-fg-3)",
                    marginTop: 2,
                  }}
                >
                  {k.label ?? "—"}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--app-fg-2)" }}>
                {labelFor(k)}
              </div>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: k.has_value ? "var(--tt-green)" : "var(--rose)",
                }}
              >
                {k.has_value ? "set" : "leeg"}
              </span>
              <button
                onClick={() => remove(k.id)}
                disabled={pending}
                style={{
                  padding: "5px 8px",
                  border: "1px solid var(--app-border)",
                  background: "transparent",
                  color: "var(--rose)",
                  borderRadius: 6,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Verwijder
              </button>
            </div>
          ))}
        </div>
      )}

      {!adding && (
        <button
          onClick={() => setAdding(true)}
          style={{
            padding: "9px 14px",
            border: "1.5px dashed var(--app-border)",
            background: "transparent",
            color: "var(--app-fg-2)",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 12.5,
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          + Key toevoegen
        </button>
      )}

      {adding && (
        <div
          style={{
            border: "1.5px solid var(--app-border)",
            background: "var(--app-card-2)",
            borderRadius: 12,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Provider">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                style={inp}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Scope">
              <select
                value={scope}
                onChange={(e) => {
                  const s = e.target.value as ApiKeyScope;
                  setScope(s);
                  if (s === "workspace") setScopeId(workspaceId);
                  else if (s === "business")
                    setScopeId(businesses[0]?.id ?? "");
                  else setScopeId(navNodes[0]?.id ?? "");
                }}
                style={inp}
              >
                <option value="workspace">Workspace default</option>
                <option value="business" disabled={businesses.length === 0}>
                  Business override {businesses.length === 0 ? "(geen)" : ""}
                </option>
                <option value="navnode" disabled={navNodes.length === 0}>
                  Topic override {navNodes.length === 0 ? "(geen)" : ""}
                </option>
              </select>
            </Field>
          </div>

          {scope === "business" && (
            <Field label="Business">
              <select
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                style={inp}
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {scope === "navnode" && (
            <Field label="Topic">
              <select
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                style={inp}
              >
                {navNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Key (wordt encrypted opgeslagen)">
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="sk-… of vergelijkbaar"
              autoComplete="off"
              style={inp}
            />
          </Field>

          <Field label="Label (optioneel)">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Bijv. Anthropic prod"
              style={inp}
            />
          </Field>

          {error && (
            <p style={{ color: "var(--rose)", fontSize: 12, margin: 0 }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setAdding(false)}
              style={btnSecondary}
              disabled={pending}
            >
              Annuleer
            </button>
            <button
              onClick={submit}
              disabled={pending || !value.trim()}
              style={btnPrimary(pending)}
            >
              {pending ? "Opslaan…" : "Opslaan"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "8px 10px",
  borderRadius: 8,
  fontFamily: "var(--type)",
  fontSize: 13,
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 14px",
  border: "1.5px solid var(--app-border)",
  background: "transparent",
  color: "var(--app-fg)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
};

const btnPrimary = (pending: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  border: "1.5px solid var(--tt-green)",
  background: "var(--tt-green)",
  color: "#fff",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.7 : 1,
});

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
