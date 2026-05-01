// Integrations list + add form for a single business. The OAuth handshake
// per provider is provider-specific (YouTube Data API needs Google OAuth,
// Stripe needs the dashboard, etc.) — phase 7+ adds those flows. This UI
// labels integrations + tracks status so agents can reference them.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createIntegration,
  deleteIntegration,
  type IntegrationProvider,
} from "../app/actions/integrations";
import type { IntegrationRow } from "../lib/queries/integrations";

const PROVIDERS: { id: IntegrationProvider; label: string }[] = [
  { id: "youtube_data", label: "YouTube Data API" },
  { id: "etsy", label: "Etsy" },
  { id: "drive", label: "Google Drive" },
  { id: "stripe", label: "Stripe" },
  { id: "shopify", label: "Shopify" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "minimax", label: "MiniMax" },
  { id: "custom_mcp", label: "Custom MCP server" },
];

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  integrations: IntegrationRow[];
};

export function IntegrationsList({ workspaceSlug, workspaceId, businessId, integrations }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<IntegrationProvider>("youtube_data");
  const [error, setError] = useState<string | null>(null);

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const res = await createIntegration({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        business_id: businessId,
        provider,
        name,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName("");
      router.refresh();
    });

  const remove = (id: string) =>
    startTransition(async () => {
      await deleteIntegration({
        workspace_slug: workspaceSlug,
        business_id: businessId,
        id,
      });
      router.refresh();
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section
        style={{
          border: "1.5px solid var(--app-border)",
          borderRadius: 14,
          padding: 16,
          background: "var(--app-card)",
        }}
      >
        <h2 style={{ fontFamily: "var(--hand)", fontSize: 22, fontWeight: 700, margin: "0 0 12px" }}>
          Nieuwe integratie
        </h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as IntegrationProvider)}
            style={inputStyle}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="bv. Hoofdkanaal"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          />
          <button
            onClick={submit}
            disabled={pending || !name.trim()}
            style={{
              padding: "9px 14px",
              border: "1.5px solid var(--tt-green)",
              background: "var(--tt-green)",
              color: "#fff",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 12.5,
              cursor: pending ? "wait" : "pointer",
              opacity: pending || !name.trim() ? 0.7 : 1,
            }}
          >
            {pending ? "Bezig…" : "Toevoegen"}
          </button>
        </div>
        {error && (
          <p
            role="alert"
            style={{
              color: "var(--rose)",
              background: "rgba(230,82,107,0.08)",
              border: "1px solid rgba(230,82,107,0.4)",
              borderRadius: 8,
              padding: "6px 10px",
              marginTop: 8,
              fontSize: 12,
            }}
          >
            {error}
          </p>
        )}
        <p style={{ fontSize: 11.5, color: "var(--app-fg-3)", marginTop: 10 }}>
          OAuth-handshakes per provider komen in fase 8. Voor nu maak je een
          label aan; de echte connectie wire je via agent_secrets / env.
        </p>
      </section>

      <section>
        <h2 style={{ fontFamily: "var(--hand)", fontSize: 22, fontWeight: 700, margin: "0 0 10px" }}>
          Verbonden services
        </h2>
        {integrations.length === 0 ? (
          <p
            style={{
              color: "var(--app-fg-3)",
              fontSize: 13,
              padding: 16,
              border: "1.5px dashed var(--app-border)",
              borderRadius: 12,
            }}
          >
            Nog geen integraties.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {integrations.map((i) => (
              <div
                key={i.id}
                style={{
                  border: "1.5px solid var(--app-border)",
                  borderRadius: 14,
                  padding: 14,
                  background: "var(--app-card)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color:
                        i.status === "connected"
                          ? "var(--tt-green)"
                          : i.status === "expired" || i.status === "error"
                            ? "var(--rose)"
                            : "var(--app-fg-3)",
                    }}
                  >
                    {i.status}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--app-fg-3)" }}>
                    {i.business_id ? "business" : "workspace"}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>
                  {i.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--app-fg-3)", marginTop: 2 }}>
                  {i.provider}
                </div>
                <button
                  onClick={() => remove(i.id)}
                  disabled={pending}
                  style={{
                    marginTop: 10,
                    padding: "5px 10px",
                    border: "1.5px solid var(--rose)",
                    background: "transparent",
                    color: "var(--rose)",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: pending ? "wait" : "pointer",
                  }}
                >
                  Verwijderen
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "9px 11px",
  borderRadius: 9,
  fontFamily: "var(--type)",
  fontSize: 13,
};
