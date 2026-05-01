// Lists agents inside a business with a "New agent" button. Server actions
// archive in place; revalidatePath refreshes the list automatically.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PlusIcon } from "@aio/ui/icon";

import type { AgentRow } from "../lib/queries/agents";
import { archiveAgent } from "../app/actions/agents";
import { NewAgentDialog } from "./NewAgentDialog";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  agents: AgentRow[];
};

export function AgentsList({
  workspaceSlug,
  workspaceId,
  businessId,
  agents,
}: Props) {
  const [open, setOpen] = useState(false);

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
              businessId={businessId}
            />
          ))}
        </div>
      )}

      {open && (
        <NewAgentDialog
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          businessId={businessId}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function AgentCard({
  agent,
  workspaceSlug,
  businessId,
}: {
  agent: AgentRow;
  workspaceSlug: string;
  businessId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
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
      <div style={{ display: "flex", justifyContent: "space-between" }}>
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
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await archiveAgent({
              workspace_slug: workspaceSlug,
              business_id: businessId,
              id: agent.id,
            });
            router.refresh();
          })
        }
        style={{
          marginTop: 8,
          alignSelf: "start",
          fontSize: 11,
          fontWeight: 700,
          padding: "5px 10px",
          border: "1.5px solid var(--app-border)",
          background: "transparent",
          color: "var(--app-fg-3)",
          borderRadius: 8,
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Bezig…" : "Archiveren"}
      </button>
    </div>
  );
}
