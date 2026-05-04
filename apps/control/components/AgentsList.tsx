// Lists agents inside a business. Each card supports right-click for
// context actions (Run now, Edit, Duplicate, Archive). API-key status
// pill warns the user when their provider has no resolved key.

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { ContextMenu, type ContextMenuItem } from "@aio/ui/context-menu";
import { ChatIcon, EditPenIcon, PlusIcon } from "@aio/ui/icon";

import {
  archiveAgent,
  duplicateAgent,
} from "../app/actions/agents";
import { runAgentNow } from "../app/actions/schedules";
import type { AgentRow } from "../lib/queries/agents";
import { AgentRunsPanel } from "./AgentRunsPanel";
import { EditAgentDialog } from "./EditAgentDialog";
import { NewAgentDialog } from "./NewAgentDialog";

type Target = { id: string; name: string };

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  /** When null, this list manages WORKSPACE-GLOBAL agents (business_id
   *  IS NULL). The new-agent dialog sets business_id=null in that case
   *  and the rail/menu paths swap to the workspace-level URLs. */
  businessId: string | null;
  agents: AgentRow[];
  /** Per-provider key resolution status — when an agent's provider isn't
   *  in this set we show "key missing" so the user knows why chat won't
   *  work. Resolved server-side; passed in from the page. */
  providerKeyStatus?: Record<string, boolean>;
  telegramTargets?: Target[];
  customIntegrations?: Target[];
  /** Workspace defaults that pre-fill NewAgentDialog. */
  workspaceDefaults?: {
    provider?: string | null;
    model?: string | null;
    systemPrompt?: string | null;
  };
  /** Flattened nav_nodes tree — populates the topic-pin select in
   *  the edit dialog. Empty = no topics defined yet (or workspace-
   *  global agents page) so the picker stays hidden. */
  navOptions?: { id: string; name: string; depth: number }[];
};

export function AgentsList({
  workspaceSlug,
  workspaceId,
  businessId,
  agents,
  providerKeyStatus = {},
  telegramTargets = [],
  customIntegrations = [],
  workspaceDefaults,
  navOptions = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AgentRow | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    agent: AgentRow;
  } | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const buildMenu = (agent: AgentRow): ContextMenuItem[] => [
    {
      label: "▶ Run now",
      onClick: () =>
        startTransition(async () => {
          const res = await runAgentNow({
            workspace_slug: workspaceSlug,
            workspace_id: workspaceId,
            agent_id: agent.id,
            business_id: businessId,
          });
          if (res.ok) router.refresh();
          else alert(res.error);
        }),
    },
    {
      label: "Open chat",
      icon: <ChatIcon size={14} />,
      onClick: () => {
        const evt = new CustomEvent("aio:open-chat", {
          detail: { agentId: agent.id },
        });
        window.dispatchEvent(evt);
      },
    },
    { kind: "separator" },
    {
      label: "Bewerken…",
      icon: <EditPenIcon size={14} />,
      onClick: () => setEditing(agent),
    },
    {
      label: "Dupliceer",
      onClick: () =>
        startTransition(async () => {
          const res = await duplicateAgent({
            workspace_slug: workspaceSlug,
            workspace_id: workspaceId,
            business_id: businessId,
            source_id: agent.id,
          });
          if (res.ok) router.refresh();
          else alert(res.error);
        }),
    },
    {
      label: "Schedules…",
      onClick: () =>
        router.push(
          `/${workspaceSlug}/business/${businessId}/schedules`,
        ),
    },
    { kind: "separator" },
    {
      label: "Archiveer",
      danger: true,
      onClick: () =>
        startTransition(async () => {
          if (!confirm(`Agent "${agent.name}" archiveren?`)) return;
          await archiveAgent({
            workspace_slug: workspaceSlug,
            business_id: businessId,
            id: agent.id,
          });
          router.refresh();
        }),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <h2
          style={{
            fontFamily: "var(--hand)",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.2px",
            margin: 0,
          }}
        >
          Agents
        </h2>
        <button
          onClick={() => setOpen(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--tt-green)",
            border: "1.5px solid var(--tt-green)",
            color: "#fff",
            padding: "7px 12px",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 12.5,
            cursor: "pointer",
          }}
        >
          <PlusIcon size={14} /> Nieuwe agent
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="empty-state">
          <h2>Nog geen agents</h2>
          <p>
            Een agent koppelt een provider (Claude / MiniMax / Ollama / je
            eigen Hermes-agent) aan deze business. Maak er één aan om te
            kunnen chatten en straks runs te schedulen.
          </p>
          <button className="cta" onClick={() => setOpen(true)}>
            <PlusIcon /> Nieuwe agent
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
          {agents.map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              workspaceSlug={workspaceSlug}
              keyOk={providerKeyStatus[a.provider] ?? false}
              onContextMenu={(e) =>
                setMenu({ x: e.clientX, y: e.clientY, agent: a })
              }
              onClick={() => setEditing(a)}
            />
          ))}
        </div>
      )}

      {open && (
        <NewAgentDialog
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          businessId={businessId}
          telegramTargets={telegramTargets}
          customIntegrations={customIntegrations}
          defaults={workspaceDefaults}
          navOptions={navOptions}
          onClose={() => setOpen(false)}
        />
      )}

      {editing && (
        <EditAgentDialog
          workspaceSlug={workspaceSlug}
          businessId={businessId}
          agent={editing}
          telegramTargets={telegramTargets}
          customIntegrations={customIntegrations}
          siblingAgents={agents.map((a) => ({ id: a.id, name: a.name }))}
          navOptions={navOptions}
          onClose={() => setEditing(null)}
        />
      )}

      <ContextMenu
        position={menu ? { x: menu.x, y: menu.y } : null}
        items={menu ? buildMenu(menu.agent) : []}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}

function AgentCard({
  agent,
  workspaceSlug,
  keyOk,
  onContextMenu,
  onClick,
}: {
  agent: AgentRow;
  workspaceSlug: string;
  keyOk: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  onClick: () => void;
}) {
  // Pick the platform-correct hint glyph. SSR can't see navigator, so
  // we render the neutral form first and swap on mount via a state set
  // in a useEffect — avoids hydration mismatch.
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
    }
  }, []);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        // stopPropagation prevents the global AppContextMenu from
        // ALSO opening on top of our per-card menu.
        e.stopPropagation();
        onContextMenu(e);
      }}
      style={{
        border: "1.5px solid var(--app-border)",
        borderRadius: 14,
        padding: 14,
        background: "var(--app-card)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        cursor: "pointer",
        transition: "background 0.12s, border-color 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--app-card-2)";
        e.currentTarget.style.borderColor = "var(--app-border-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--app-card)";
        e.currentTarget.style.borderColor = "var(--app-border)";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{agent.name}</div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--app-fg-3)",
          }}
        >
          {agent.kind}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--app-fg-3)" }}>
        {agent.provider}
        {agent.model ? ` · ${agent.model}` : ""}
      </div>
      <div
        style={{
          marginTop: 6,
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        {(() => {
          // CLI-based providers (hermes, openclaw, claude_cli, ollama)
          // authenticate at the CLI level, not via an AIO Control
          // workspace key — so the "KEY MISSING" badge would be a
          // false alarm. Show a neutral "CLI" pill instead.
          const keyless =
            agent.provider === "hermes" ||
            agent.provider === "openclaw" ||
            agent.provider === "claude_cli" ||
            agent.provider === "ollama";
          if (keyless) {
            return (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  padding: "3px 7px",
                  borderRadius: 999,
                  border: "1px solid var(--app-border-2)",
                  color: "var(--app-fg-3)",
                  background: "var(--app-card-2)",
                }}
                title="CLI provider — auth via de lokale CLI installatie, geen API key nodig"
              >
                CLI
              </span>
            );
          }
          return (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "3px 7px",
                borderRadius: 999,
                border: `1px solid ${keyOk ? "var(--tt-green)" : "var(--rose)"}`,
                color: keyOk ? "var(--tt-green)" : "var(--rose)",
                background: keyOk
                  ? "rgba(57,178,85,0.10)"
                  : "rgba(230,82,107,0.10)",
              }}
            >
              {keyOk ? "key set" : "key missing"}
            </span>
          );
        })()}
        <span
          style={{ fontSize: 10.5, color: "var(--app-fg-3)" }}
          title="Klik om te bewerken · rechts-klik voor menu"
        >
          {isMac ? "⌘ " : ""}klik = bewerk · rechts-klik = menu
        </span>
      </div>
      <AgentRunsPanel agentId={agent.id} workspaceSlug={workspaceSlug} />
    </div>
  );
}
