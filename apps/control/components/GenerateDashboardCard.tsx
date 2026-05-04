// Empty-state card on a topic page that lets the user kick off a
// "build me a dashboard" agent run. Click the button → modal with a
// pre-filled prompt + agent picker + optional image attachment →
// submit triggers runAgentNow with the prompt; the run drawer takes
// over for streaming progress + result.
//
// v1 is intentionally minimal: a single agent run that returns
// markdown. The agent's output goes into runs.message_history and is
// rendered by the RunDetailDrawer's MarkdownText. Phase 2 will:
//  - persist a structured "dashboard config" row keyed by nav_node_id
//  - render that as a widget grid instead of plain markdown
//  - support follow-up refinements

"use client";

import { useState } from "react";

import { runAgentNow } from "../app/actions/schedules";
import type { AgentRow } from "../lib/queries/agents";
import { RunDetailDrawer } from "./RunDetailDrawer";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  /** The topic this dashboard is for. Goes into the prompt + the run
   *  is pinned to it via runAgentNow → input.nav_node_id. */
  navNodeId: string;
  navNodeName: string;
  /** Agents the user can choose from. Empty list disables the
   *  composer with a hint. */
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
            Laat een agent een eerste versie van dit dashboard maken op
            basis van de huidige data. Je kan een eigen prompt schrijven
            of de standaard houden — extra screenshots als referentie zijn
            optioneel. De output verschijnt in een run-drawer die je daarna
            verder kan finetunen.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={agents.length === 0}
          style={{
            padding: "9px 16px",
            border: "1.5px solid var(--tt-green)",
            background: "var(--tt-green)",
            color: "#fff",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 13,
            cursor: agents.length === 0 ? "not-allowed" : "pointer",
            opacity: agents.length === 0 ? 0.55 : 1,
          }}
          title={
            agents.length === 0
              ? "Eerst een agent in deze business aanmaken"
              : undefined
          }
        >
          ✨ Genereer dashboard
        </button>
      </div>

      {open && (
        <ComposerModal
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          businessId={businessId}
          navNodeName={navNodeName}
          navNodeId={navNodeId}
          agents={agents}
          onClose={() => setOpen(false)}
          onLaunched={(runId) => {
            setOpen(false);
            setOpenRunId(runId);
          }}
        />
      )}

      {openRunId && (
        <RunDetailDrawer
          runId={openRunId}
          onClose={() => setOpenRunId(null)}
        />
      )}
    </>
  );
}

function ComposerModal({
  workspaceSlug,
  workspaceId,
  businessId,
  navNodeName,
  navNodeId,
  agents,
  onClose,
  onLaunched,
}: {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  navNodeName: string;
  navNodeId: string;
  agents: AgentRow[];
  onClose: () => void;
  onLaunched: (runId: string) => void;
}) {
  const defaultPrompt = `Bouw een dashboard voor het topic "${navNodeName}" in deze business. Lever:
1. Een korte samenvatting (2-3 zinnen) van waar dit topic over gaat.
2. 3-5 KPI's die belangrijk zijn voor dit topic, met huidige status indien beschikbaar.
3. De top 3 acties die ik nu zou moeten nemen, gerangschikt op urgentie.
4. Een tabel met de meest recente runs (als die er zijn) inclusief status, kosten en duur.

Gebruik markdown headings, bullets en eventueel tabellen. Wees beknopt en zakelijk — geen filler.`;

  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [imageNote, setImageNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setPending(true);
    // Image upload is not wired through to the run input yet — for now
    // we let the user paste a description of what they want, which gets
    // appended to the prompt. Full image support arrives once we have
    // a uploaded-asset table the dispatcher can attach to the messages.
    const fullPrompt = imageNote.trim()
      ? `${prompt}\n\n## Visuele referentie (door de gebruiker beschreven)\n${imageNote.trim()}`
      : prompt;
    const res = await runAgentNow({
      workspace_slug: workspaceSlug,
      workspace_id: workspaceId,
      agent_id: agentId,
      business_id: businessId,
      prompt: fullPrompt,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onLaunched(res.data.run_id);
    void navNodeId; // reserved for v2 when we persist per-topic dashboards
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
          Dashboard voor "{navNodeName}"
        </h2>
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 12.5,
            margin: "0 0 16px",
          }}
        >
          De agent kan tijdens de run nog vragen stellen of vervolgstappen
          voorstellen — die zie je live in de drawer die zo opent.
        </p>

        <Field label="Welke agent voert het uit?">
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            style={inputStyle}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.provider}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Prompt (mag je aanpassen)">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={9}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--type)" }}
          />
        </Field>

        <Field label="Visuele referentie (optioneel)">
          <textarea
            value={imageNote}
            onChange={(e) => setImageNote(e.target.value)}
            rows={3}
            placeholder="Bijv. 'lijkt op de standaard Notion dashboard layout, met card-grid bovenin en een tabel eronder'."
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
            Voor nu een tekst-omschrijving. Image-upload komt zodra de
            dispatcher attachments kan accepteren.
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
            {pending ? "Bezig…" : "✨ Genereer"}
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
