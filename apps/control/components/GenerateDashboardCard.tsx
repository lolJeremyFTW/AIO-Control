// Empty-state card on a topic page that lets the user kick off a
// custom dashboard agent run. The run is MCP-first: the selected agent
// must be able to call aio__publish_dashboard, which writes the HTML to
// agent_dashboards and pins it as a custom tab.

"use client";

import { useState } from "react";

import { runAgentNow } from "../app/actions/schedules";
import type { AgentRow } from "../lib/queries/agents";
import { RunDetailDrawer } from "./RunDetailDrawer";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  navNodeId: string;
  navNodeName: string;
  agents: AgentRow[];
};

export function GenerateDashboardCard({
  workspaceSlug,
  workspaceId,
  businessId,
  navNodeId,
  navNodeName,
  agents,
}: Props) {
  const [open, setOpen] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const dashboardAgents = agents.filter(isDashboardCapableAgent);
  const disabled = dashboardAgents.length === 0;
  const disabledTitle =
    agents.length === 0
      ? "Eerst een agent in deze business aanmaken"
      : "Kies Claude/MiniMax/Codex met AIO MCP of OpenClaw/Hermes met lokale MCPs";

  return (
    <>
      <div
        style={{
          marginBottom: 18,
          padding: 18,
          border: "1.5px dashed var(--app-border)",
          borderRadius: 14,
          background:
            "linear-gradient(135deg, rgba(57,178,85,0.04), rgba(57,178,85,0.10))",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--hand)",
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            Genereer dashboard
          </div>
          <p
            style={{
              fontSize: 12.5,
              color: "var(--app-fg-2)",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Laat een agent een eerste versie maken op basis van huidige data. De
            agent publiceert via AIO MCP direct een custom dashboard-tab. Je kan
            de prompt aanpassen en een tekstuele visuele referentie toevoegen;
            de run-drawer blijft open voor live voortgang en finetuning.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={disabled}
            style={{
              padding: "9px 16px",
              border: "1.5px solid var(--tt-green)",
              background: "var(--tt-green)",
              color: "#fff",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 13,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.55 : 1,
            }}
            title={disabled ? disabledTitle : undefined}
          >
            Genereer dashboard
          </button>

          {disabled && (
            <span
              style={{
                maxWidth: 280,
                fontSize: 11,
                color: "var(--app-fg-3)",
                lineHeight: 1.4,
                textAlign: "right",
              }}
            >
              Gebruik Claude/MiniMax/Codex met &quot;AIO Control&quot; op Read +
              Write, of OpenClaw/Hermes met lokaal geconfigureerde MCPs.
            </span>
          )}
        </div>
      </div>

      {open && (
        <ComposerModal
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          businessId={businessId}
          navNodeId={navNodeId}
          navNodeName={navNodeName}
          agents={dashboardAgents}
          onClose={() => setOpen(false)}
          onLaunched={(runId) => {
            setOpen(false);
            setOpenRunId(runId);
          }}
        />
      )}

      {openRunId && (
        <RunDetailDrawer runId={openRunId} onClose={() => setOpenRunId(null)} />
      )}
    </>
  );
}

function ComposerModal({
  workspaceSlug,
  workspaceId,
  businessId,
  navNodeId,
  navNodeName,
  agents,
  onClose,
  onLaunched,
}: {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  navNodeId: string;
  navNodeName: string;
  agents: AgentRow[];
  onClose: () => void;
  onLaunched: (runId: string) => void;
}) {
  const defaultPrompt = `Maak een compact custom dashboard voor topic "${navNodeName}".
Focus op actuele runs, status, kosten, belangrijkste signalen en de topacties voor nu.
Gebruik een rustige AIO Control operator-layout met KPI-tegels bovenaan en een compacte tabel of actielijst eronder.`;

  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [imageNote, setImageNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setPending(true);
    const fullPrompt = buildDashboardPublishPrompt({
      prompt,
      imageNote,
      businessId,
      navNodeId,
      navNodeName,
    });
    const res = await runAgentNow({
      workspace_slug: workspaceSlug,
      workspace_id: workspaceId,
      agent_id: agentId,
      business_id: businessId,
      nav_node_id: navNodeId,
      prompt: fullPrompt,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onLaunched(res.data.run_id);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(620px, 92vw)",
          maxHeight: "92vh",
          overflow: "auto",
          background: "var(--app-card)",
          border: "1.5px solid var(--app-border)",
          borderRadius: 16,
          boxShadow: "0 24px 60px -12px rgba(0,0,0,0.55)",
          padding: "22px 24px",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--hand)",
            fontSize: 24,
            fontWeight: 700,
            margin: "0 0 4px",
          }}
        >
          Dashboard voor &quot;{navNodeName}&quot;
        </h2>
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 12.5,
            margin: "0 0 16px",
          }}
        >
          De agent gebruikt AIO MCP, publiceert de dashboard-tab en toont de
          voortgang live in de drawer die zo opent.
        </p>

        <Field label="Welke agent voert het uit?">
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            style={inputStyle}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} - {a.provider}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Dashboardwens (mag je aanpassen)">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={7}
            style={{
              ...inputStyle,
              resize: "vertical",
              fontFamily: "var(--type)",
            }}
          />
        </Field>

        <Field label="Tekstuele visuele referentie (optioneel)">
          <textarea
            value={imageNote}
            onChange={(e) => setImageNote(e.target.value)}
            rows={3}
            placeholder="Bijv. 'zoals een Notion dashboard: card-grid bovenin, tabel eronder, veel witruimte'."
            style={{
              ...inputStyle,
              resize: "vertical",
              fontFamily: "var(--type)",
            }}
          />
          <p
            style={{
              fontSize: 10.5,
              color: "var(--app-fg-3)",
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            Voor nu alleen tekst. Echte image-upload komt zodra dispatcher
            attachments kan accepteren.
          </p>
        </Field>

        {error && (
          <p
            role="alert"
            style={{
              color: "var(--rose)",
              background: "rgba(230,82,107,0.08)",
              border: "1px solid rgba(230,82,107,0.4)",
              borderRadius: 10,
              padding: "8px 10px",
              fontSize: 12.5,
            }}
          >
            {error}
          </p>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 14,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={btnSecondary}
          >
            Annuleer
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={pending || !agentId || !prompt.trim()}
            style={{
              ...btnPrimary,
              opacity: pending || !agentId || !prompt.trim() ? 0.6 : 1,
              cursor: pending ? "wait" : "pointer",
            }}
          >
            {pending ? "Bezig..." : "Genereer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 12,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--app-fg-2)",
      }}
    >
      <span style={{ display: "block", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

type AgentMcpConfig = {
  mcpServers?: unknown;
  mcpPermissions?: { aio?: "off" | "ro" | "rw" } | null;
};

function isDashboardCapableAgent(agent: AgentRow): boolean {
  if (agent.key_source === "subscription") return false;
  if (agent.provider === "openclaw" || agent.provider === "hermes") {
    return true;
  }
  if (
    agent.provider !== "claude" &&
    agent.provider !== "minimax" &&
    agent.provider !== "openai_codex"
  ) {
    return false;
  }
  const config = (agent.config ?? {}) as AgentMcpConfig;
  const servers = Array.isArray(config.mcpServers)
    ? config.mcpServers.filter((s): s is string => typeof s === "string")
    : [];
  const aioMode = config.mcpPermissions?.aio ?? "rw";
  return servers.includes("aio") && aioMode === "rw";
}

function buildDashboardPublishPrompt(input: {
  prompt: string;
  imageNote?: string;
  businessId: string;
  navNodeId: string;
  navNodeName: string;
}): string {
  const operatorPrompt = input.prompt.trim();
  const visualReference = input.imageNote?.trim();
  return [
    "Je maakt een custom AIO Control topic-dashboard via MCP.",
    "",
    "Vaste context:",
    `- business_id: ${input.businessId}`,
    `- nav_node_id: ${input.navNodeId}`,
    `- topic: ${input.navNodeName}`,
    "- Het resultaat hoort als custom tab onder de actieve topic-route te verschijnen: /n/.../tab/<leesbare-slug>.",
    "",
    "Uitvoering:",
    "1. Gebruik AIO MCP tools om huidige data te lezen. Start minimaal met `aio__list_runs` zonder args; die gebruikt de huidige business/topic scope. Gebruik `aio__list_custom_tabs` wanneer je bestaande dashboard-tabs wil checken.",
    '2. Bouw uitsluitend een compact HTML-fragment: `<main class="aio-dashboard">...</main>` met optioneel scoped `<style>`. Gebruik geen `<!doctype>`, `<html>`, `<head>`, `<body>`, header, nav, breadcrumbs, sidebar, app shell of marketingpagina.',
    `3. Publiceer of update het dashboard door \`aio__publish_dashboard\` aan te roepen met exact deze scope en label: business_id=\`${input.businessId}\`, nav_node_id=\`${input.navNodeId}\`, label=\`${input.navNodeName} dashboard\`, plus jouw \`html_content\`.`,
    "4. Controleer dat de tool-result een topic-tab URL teruggeeft onder `/n/.../tab/<slug>` en niet alleen de publieke `/d/<slug>` URL.",
    "5. Eindig met maximaal 4 bullets: welke dashboard-tab is gepubliceerd, welke data je gebruikte, de URL(s) uit de tool-result, en 1-2 logische vervolgstappen.",
    "",
    "Belangrijke grenzen:",
    "- Maak geen los markdown-dashboard als eindresultaat; de publicatie via `aio__publish_dashboard` is het resultaat.",
    "- Dupliceer nooit de bestaande AIO navigatie, header, topic banner of paginashell in je HTML.",
    "- Gebruik geen gevoelige secrets, tokens, privegegevens of ruwe persoonsgegevens. De publieke `/d/<slug>` URL is voorlopig zichtbaar voor iedereen met de link.",
    "- Als specifieke data ontbreekt, zeg kort wat ontbreekt en gebruik geen verzonnen cijfers.",
    "",
    "Operatorwens:",
    operatorPrompt ||
      "Maak de beste eerste versie op basis van de huidige topicdata.",
    visualReference
      ? `\nVisuele referentie in woorden:\n${visualReference}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "9px 11px",
  borderRadius: 9,
  fontSize: 13.5,
};

const btnPrimary: React.CSSProperties = {
  padding: "9px 16px",
  border: "1.5px solid var(--tt-green)",
  background: "var(--tt-green)",
  color: "#fff",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  padding: "9px 16px",
  border: "1.5px solid var(--app-border)",
  background: "transparent",
  color: "var(--app-fg)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
};
