// Marketplace browser. Each card has an "Install" button that opens a
// per-card business picker — clicking through copies the preset into the
// chosen business. The page that mounts this passes the workspace +
// business list.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { BusinessRow } from "../lib/queries/businesses";
import type { MarketplaceAgent } from "../lib/queries/marketplace";
import { installMarketplaceAgent } from "../app/actions/marketplace";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businesses: BusinessRow[];
  agents: MarketplaceAgent[];
};

export function MarketplaceGrid({
  workspaceSlug,
  workspaceId,
  businesses,
  agents,
}: Props) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  // Group by category so the catalog is browsable. Uncategorized lands
  // in "Overig" at the bottom.
  const byCategory = new Map<string, MarketplaceAgent[]>();
  for (const a of agents) {
    const k = a.category ?? "overig";
    if (!byCategory.has(k)) byCategory.set(k, []);
    byCategory.get(k)!.push(a);
  }

  const categories = [...byCategory.keys()].sort();

  if (agents.length === 0) {
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
                  setActiveSlug((cur) => (cur === a.slug ? null : a.slug))
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
          + Installeren
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
          {businesses.length === 0 ? (
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
