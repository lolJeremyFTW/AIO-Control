// Marketplace browser with 4 tabs (Agents / Skills / Plugins / MCP
// Servers). Each card has an Install button that copies the preset into
// the chosen business or workspace. The catalog is hand-seeded by
// service_role — see migrations 010 + 013.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { BusinessRow } from "../lib/queries/businesses";
import type {
  MarketplaceAgent,
  MarketplaceKind,
} from "../lib/queries/marketplace";
import { installMarketplaceAgent } from "../app/actions/marketplace";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businesses: BusinessRow[];
  agents: MarketplaceAgent[];
};

const TABS: { kind: MarketplaceKind; label: string; sub: string }[] = [
  { kind: "agent", label: "Agents", sub: "Volledige agent presets — provider + model + system prompt" },
  { kind: "skill", label: "Skills", sub: "Herbruikbare system-prompt modules die op elke agent passen" },
  { kind: "plugin", label: "Plugins", sub: "Worker-integraties die agent output ergens publiceren" },
  { kind: "mcp_server", label: "MCP Servers", sub: "Model Context Protocol servers die je agents tools geven" },
];

export function MarketplaceGrid({
  workspaceSlug,
  workspaceId,
  businesses,
  agents,
}: Props) {
  const [activeKind, setActiveKind] = useState<MarketplaceKind>("agent");
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  const filtered = agents.filter((a) => a.marketplace_kind === activeKind);

  // Group by category within the tab.
  const byCategory = new Map<string, MarketplaceAgent[]>();
  for (const a of filtered) {
    const k = a.category ?? "overig";
    if (!byCategory.has(k)) byCategory.set(k, []);
    byCategory.get(k)!.push(a);
  }

  const categories = [...byCategory.keys()].sort();
  const subForActive = TABS.find((t) => t.kind === activeKind)?.sub ?? "";

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 6,
          borderBottom: "1px solid var(--app-border-2)",
          flexWrap: "wrap",
        }}
      >
        {TABS.map((t) => {
          const active = t.kind === activeKind;
          const count = agents.filter(
            (a) => a.marketplace_kind === t.kind,
          ).length;
          return (
            <button
              key={t.kind}
              onClick={() => {
                setActiveKind(t.kind);
                setActiveSlug(null);
              }}
              style={{
                padding: "8px 14px",
                background: "transparent",
                border: "none",
                borderBottom: active
                  ? "2px solid var(--tt-green)"
                  : "2px solid transparent",
                color: active ? "var(--app-fg)" : "var(--app-fg-3)",
                fontWeight: 700,
                fontSize: 12.5,
                cursor: "pointer",
                transform: "translateY(1px)",
              }}
            >
              {t.label}
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 10.5,
                  color: "var(--app-fg-3)",
                  fontWeight: 600,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <p
        style={{
          fontSize: 12,
          color: "var(--app-fg-3)",
          margin: "0 0 14px",
        }}
      >
        {subForActive}
      </p>
      <KindBody
        items={filtered}
        byCategory={byCategory}
        categories={categories}
        activeSlug={activeSlug}
        setActiveSlug={setActiveSlug}
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        businesses={businesses}
      />
    </>
  );
}

function KindBody({
  items,
  byCategory,
  categories,
  activeSlug,
  setActiveSlug,
  workspaceSlug,
  workspaceId,
  businesses,
}: {
  items: MarketplaceAgent[];
  byCategory: Map<string, MarketplaceAgent[]>;
  categories: string[];
  activeSlug: string | null;
  setActiveSlug: (s: string | null) => void;
  workspaceSlug: string;
  workspaceId: string;
  businesses: BusinessRow[];
}) {
  if (items.length === 0) {
    return (
      <p
        style={{
          color: "var(--app-fg-3)",
          fontSize: 13,
          padding: 16,
          border: "1.5px dashed var(--app-border)",
          borderRadius: 12,
        }}
      >
        Marketplace is leeg — service-role moet eerst entries seeden.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {categories.map((cat) => (
        <section key={cat}>
          <h2
            style={{
              fontFamily: "var(--hand)",
              fontSize: 22,
              fontWeight: 700,
              margin: "0 0 10px",
              textTransform: "capitalize",
            }}
          >
            {cat}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 12,
            }}
          >
            {byCategory.get(cat)!.map((a) => (
              <Card
                key={a.id}
                agent={a}
                workspaceSlug={workspaceSlug}
                workspaceId={workspaceId}
                businesses={businesses}
                isActive={activeSlug === a.slug}
                onSetActive={() =>
                  setActiveSlug(activeSlug === a.slug ? null : a.slug)
                }
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Card({
  agent,
  workspaceSlug,
  workspaceId,
  businesses,
  isActive,
  onSetActive,
}: {
  agent: MarketplaceAgent;
  workspaceSlug: string;
  workspaceId: string;
  businesses: BusinessRow[];
  isActive: boolean;
  onSetActive: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const install = (businessId: string) =>
    startTransition(async () => {
      setError(null);
      const res = await installMarketplaceAgent({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        business_id: businessId,
        marketplace_slug: agent.slug,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(
        `/${workspaceSlug}/business/${businessId}/agents`,
      );
    });

  return (
    <div
      style={{
        border: "1.5px solid var(--app-border)",
        borderRadius: 14,
        padding: 14,
        background: "var(--app-card)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14 }}>{agent.name}</div>
        {agent.official && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              padding: "2px 6px",
              borderRadius: 999,
              border: "1px solid var(--tt-green)",
              color: "var(--tt-green)",
              background: "rgba(57,178,85,0.10)",
            }}
          >
            OFFICIEEL
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--app-fg-2)" }}>
        {agent.tagline}
      </div>
      {agent.description && (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--app-fg-3)",
            lineHeight: 1.45,
            marginTop: 2,
          }}
        >
          {agent.description}
        </div>
      )}
      <div
        style={{
          fontSize: 11,
          color: "var(--app-fg-3)",
          marginTop: 4,
          display: "flex",
          gap: 12,
        }}
      >
        <span>{agent.provider}{agent.model ? ` · ${agent.model}` : ""}</span>
        <span>·</span>
        <span>{agent.kind}</span>
        <span>·</span>
        <span>{agent.install_count} installs</span>
      </div>

      {!isActive ? (
        <button
          onClick={onSetActive}
          style={{
            marginTop: 8,
            alignSelf: "start",
            padding: "6px 12px",
            border: "1.5px solid var(--tt-green)",
            background: "var(--tt-green)",
            color: "#fff",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {agent.marketplace_kind === "agent"
            ? "+ Installeren"
            : "Bekijk config"}
        </button>
      ) : (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            background: "var(--app-card-2)",
            borderRadius: 10,
            border: "1.5px dashed var(--app-border)",
          }}
        >
          {agent.marketplace_kind === "agent" ? (
            businesses.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--app-fg-3)", margin: 0 }}>
                Maak eerst een business aan om hier te kunnen installeren.
              </p>
            ) : (
              <>
                <p
                  style={{
                    fontSize: 11.5,
                    color: "var(--app-fg-2)",
                    margin: "0 0 8px",
                  }}
                >
                  Kies de business waar deze agent in moet komen:
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {businesses.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => install(b.id)}
                      disabled={pending}
                      style={{
                        padding: "5px 10px",
                        border: "1.5px solid var(--app-border)",
                        background: "var(--app-card)",
                        color: "var(--app-fg)",
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 11.5,
                        cursor: pending ? "wait" : "pointer",
                      }}
                    >
                      → {b.name}
                    </button>
                  ))}
                </div>
              </>
            )
          ) : (
            <>
              <p
                style={{
                  fontSize: 11.5,
                  color: "var(--app-fg-2)",
                  margin: "0 0 6px",
                }}
              >
                {agent.marketplace_kind === "skill"
                  ? "Kopieer dit JSON-blok in de agent's `config.systemPrompt` of als `config.skills` array entry. Skills stapelen op elkaar."
                  : agent.marketplace_kind === "plugin"
                    ? "Plugin config — voeg toe aan de agent's `config.plugins` array. De plugin runt na elke agent run."
                    : "MCP server — voeg de `mcp` block toe aan agent.config.mcpServers (lijst van servers die de agent als host kan starten)."}
              </p>
              <pre
                style={{
                  background: "var(--app-card)",
                  border: "1px solid var(--app-border)",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 11,
                  fontFamily: "ui-monospace, Menlo, monospace",
                  overflow: "auto",
                  maxHeight: 200,
                  margin: 0,
                  whiteSpace: "pre-wrap",
                }}
              >
                {JSON.stringify(agent.config, null, 2)}
              </pre>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(
                    JSON.stringify(agent.config, null, 2),
                  )
                }
                style={{
                  marginTop: 8,
                  padding: "5px 10px",
                  border: "1.5px solid var(--app-border)",
                  background: "var(--app-card)",
                  color: "var(--app-fg)",
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Kopieer JSON
              </button>
            </>
          )}
          {error && (
            <p
              role="alert"
              style={{ color: "var(--rose)", fontSize: 12, marginTop: 8 }}
            >
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
