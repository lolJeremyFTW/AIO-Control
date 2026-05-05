"use client";

import { useState, useTransition } from "react";

import { saveMcpToolKey, testMcpToolKey } from "../app/actions/mcp-tools";

type ToolConfig = {
  id: string;
  label: string;
  desc: string;
  docsUrl: string;
  keyLabel: string;
  keyPlaceholder: string;
};

const MCP_TOOLS: ToolConfig[] = [
  {
    id: "brave",
    label: "Brave Search",
    desc: "Hoge-kwaliteit web + nieuws zoekopdrachten via de Brave Search API. Gratis tier: 2.000 queries/maand.",
    docsUrl: "https://api.search.brave.com/app/keys",
    keyLabel: "Brave Search API Key",
    keyPlaceholder: "BSA…",
  },
  {
    id: "firecrawl",
    label: "Firecrawl",
    desc: "Scrape & crawl elke website naar clean markdown. Ondersteunt JS-rendering, volledige site-crawl en deep research mode.",
    docsUrl: "https://www.firecrawl.dev/app/api-keys",
    keyLabel: "Firecrawl API Key",
    keyPlaceholder: "fc-…",
  },
];

type Props = {
  workspaceId: string;
  workspaceSlug: string;
  keysSet: string[];
};

export function McpToolsSetupPanel({ workspaceId, workspaceSlug, keysSet }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {MCP_TOOLS.map((tool) => (
        <McpToolCard
          key={tool.id}
          tool={tool}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          initialConfigured={keysSet.includes(tool.id)}
        />
      ))}
    </div>
  );
}

function McpToolCard({
  tool,
  workspaceId,
  workspaceSlug,
  initialConfigured,
}: {
  tool: ToolConfig;
  workspaceId: string;
  workspaceSlug: string;
  initialConfigured: boolean;
}) {
  const [configured, setConfigured] = useState(initialConfigured);
  const [editing, setEditing] = useState(!initialConfigured);
  const [value, setValue] = useState("");
  const [testState, setTestState] = useState<
    "idle" | "testing" | "ok" | "error"
  >("idle");
  const [testDetail, setTestDetail] = useState("");
  const [pending, startTransition] = useTransition();

  const handleSaveAndTest = () => {
    if (!value.trim()) return;
    setTestState("testing");
    setTestDetail("");
    startTransition(async () => {
      // Test first
      const testRes = await testMcpToolKey({ tool: tool.id, value });
      if (!testRes.ok) {
        setTestState("error");
        setTestDetail(testRes.error);
        return;
      }
      // Save if test passed
      const saveRes = await saveMcpToolKey({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        tool: tool.id,
        value,
      });
      if (!saveRes.ok) {
        setTestState("error");
        setTestDetail(saveRes.error);
        return;
      }
      setTestState("ok");
      setTestDetail(
        testRes.data.detail ??
          `Verbonden in ${testRes.data.latencyMs}ms`,
      );
      setConfigured(true);
      setEditing(false);
      setValue("");
    });
  };

  return (
    <div
      style={{
        border: "1.5px solid var(--app-border)",
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{tool.label}</span>
            {configured && !editing && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  background: "rgba(57,178,85,0.15)",
                  color: "var(--tt-green)",
                  border: "1px solid var(--tt-green)",
                  borderRadius: 4,
                  padding: "1px 6px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                ✓ Actief
              </span>
            )}
          </div>
          <span style={{ fontSize: 12, color: "var(--app-fg-3)", lineHeight: 1.5 }}>
            {tool.desc}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, marginLeft: 12 }}>
          <a
            href={tool.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11.5, color: "var(--tt-green)", fontWeight: 600 }}
          >
            API key ophalen →
          </a>
          {configured && !editing && (
            <button
              type="button"
              onClick={() => { setEditing(true); setTestState("idle"); setTestDetail(""); }}
              style={{
                fontSize: 11.5,
                color: "var(--app-fg-2)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Wijzigen
            </button>
          )}
        </div>
      </div>

      {/* Input + buttons when editing */}
      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="password"
              value={value}
              onChange={(e) => { setValue(e.target.value); setTestState("idle"); setTestDetail(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveAndTest(); }}
              placeholder={tool.keyPlaceholder}
              autoComplete="off"
              style={{
                flex: 1,
                padding: "7px 10px",
                fontSize: 12.5,
                border: "1.5px solid var(--app-border)",
                borderRadius: 8,
                background: "var(--app-bg)",
                color: "var(--app-fg)",
                fontFamily: "monospace",
              }}
            />
            <button
              type="button"
              onClick={handleSaveAndTest}
              disabled={pending || !value.trim()}
              style={{
                padding: "7px 14px",
                fontSize: 12,
                fontWeight: 700,
                background: "var(--tt-green)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: pending ? "wait" : "pointer",
                opacity: pending || !value.trim() ? 0.6 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {testState === "testing" ? "Testen…" : "Opslaan & testen"}
            </button>
            {configured && (
              <button
                type="button"
                onClick={() => { setEditing(false); setTestState("idle"); setTestDetail(""); setValue(""); }}
                style={{
                  padding: "7px 10px",
                  fontSize: 12,
                  background: "transparent",
                  color: "var(--app-fg-3)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Annuleer
              </button>
            )}
          </div>

          {/* Test result feedback */}
          {testState === "ok" && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--tt-green)" }}>
              ✓ {testDetail}
            </p>
          )}
          {testState === "error" && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--rose)" }}>
              ✗ {testDetail}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
