// Empty-state card on a topic page that lets the user kick off a
// "build me a dashboard" agent run. Click the button → modal with a
// pre-filled prompt + agent picker + optional image attachment →
// submit triggers runAgentNow with the prompt; the run drawer takes
// over for streaming progress + result.
//
// After the run completes the user can persist the output as the
// module's saved dashboard via the "Sla op als dashboard" button
// (calls saveModuleDashboard server action → module_dashboards table).

"use client";

import { useState } from "react";

import { runAgentNow } from "../app/actions/schedules";
import { saveModuleDashboard } from "../app/actions/dashboards";
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
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!lastRunId) return;
    setSaving(true);
    setSaveError(null);
    const res = await saveModuleDashboard({
      workspace_slug: workspaceSlug,
      workspace_id: workspaceId,
      business_id: businessId,
      nav_node_id: navNodeId,
      run_id: lastRunId,
    });
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.error);
    } else {
      setSaved(true);
    }
  };

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
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
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

          {lastRunId && !saved && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                style={{
                  padding: "7px 14px",
                  border: "1.5px solid var(--app-border)",
                  background: "var(--app-card)",
                  color: "var(--app-fg)",
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: saving ? "wait" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Opslaan…" : "Sla op als dashboard"}
              </button>
              {saveError && (
                <span style={{ fontSize: 11, color: "var(--rose)" }}>
                  {saveError}
                </span>
              )}
            </div>
          )}

          {saved && (
            <span style={{ fontSize: 11, color: "var(--tt-green)", fontWeight: 600 }}>
              ✓ Dashboard opgeslagen
            </span>
          )}
        </div>
      </div>

      {open && (
        <ComposerModal
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          businessId={businessId}
          navNodeName={navNodeName}
          agents={agents}
          onClose={() => setOpen(false)}
          onLaunched={(runId) => {
            setOpen(false);
            setOpenRunId(runId);
            setLastRunId(runId);
            setSaved(false);
            setSaveError(null);
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
  agents,
  onClose,
  onLaunched,
}: {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  navNodeName: string;
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
