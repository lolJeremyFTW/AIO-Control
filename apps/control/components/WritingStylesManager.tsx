// Workspace-scoped writing styles CRUD UI. A writing style is a reusable
// tone/voice guide (Claude-style) that can be assigned to agents.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archiveWritingStyle,
  createWritingStyle,
  setAgentWritingStyle,
  updateWritingStyle,
} from "../app/actions/writing-styles";
import type { WritingStyleRow } from "../lib/queries/writing-styles";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  initialStyles: WritingStyleRow[];
  initialAgents?: AgentWritingStyleAssignment[];
};

type AgentWritingStyleAssignment = {
  id: string;
  name: string;
  kind: string;
  provider: string;
  business_id: string | null;
  writing_style_id?: string | null;
};

type DraftStyle = {
  id?: string;
  name: string;
  description: string;
  instructions: string;
  sample_text: string;
};

const EMPTY_DRAFT: DraftStyle = {
  name: "",
  description: "",
  instructions: "",
  sample_text: "",
};

export function WritingStylesManager({
  workspaceSlug,
  workspaceId,
  initialStyles,
  initialAgents = [],
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftStyle>>({});

  const openNew = () => {
    setDrafts((current) => ({ ...current, new: { ...EMPTY_DRAFT } }));
  };

  const editExisting = (style: WritingStyleRow) => {
    setDrafts((current) => ({
      ...current,
      [style.id]: {
        id: style.id,
        name: style.name,
        description: style.description ?? "",
        instructions: style.instructions,
        sample_text: style.sample_text ?? "",
      },
    }));
  };

  const closeDraft = (key: string) => {
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const updateDraft = (key: string, patch: Partial<DraftStyle>) => {
    setDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] ?? EMPTY_DRAFT), ...patch },
    }));
  };

  const submitNew = () => {
    const draft = drafts.new;
    if (!draft) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await createWritingStyle({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        name: draft.name,
        description: draft.description,
        instructions: draft.instructions,
        sample_text: draft.sample_text,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      closeDraft("new");
      router.refresh();
    });
  };

  const submitEdit = (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await updateWritingStyle({
        workspace_slug: workspaceSlug,
        id,
        patch: {
          name: draft.name,
          description: draft.description,
          instructions: draft.instructions,
          sample_text: draft.sample_text,
        },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      closeDraft(id);
      router.refresh();
    });
  };

  const remove = (id: string) => {
    if (
      !confirm(
        "Writing style archiveren? Agents die deze stijl gebruiken vallen terug op hun normale prompt.",
      )
    ) {
      return;
    }
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await archiveWritingStyle({
        workspace_slug: workspaceSlug,
        id,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div>
          <h2 style={titleStyle}>{initialStyles.length} writing styles</h2>
          <p style={subStyle}>
            Maak een herbruikbare toon/stem zoals in Claude en koppel die aan
            agents.
          </p>
        </div>
        <button
          type="button"
          disabled={pending || drafts.new !== undefined}
          onClick={openNew}
          style={btnPrimary(pending || drafts.new !== undefined)}
        >
          + Nieuwe style
        </button>
      </div>

      {error && (
        <p role="alert" style={errStyle}>
          {error}
        </p>
      )}
      {info && <p style={infoStyle}>{info}</p>}

      {drafts.new && (
        <WritingStyleEditor
          draft={drafts.new}
          onChange={(patch) => updateDraft("new", patch)}
          onCancel={() => closeDraft("new")}
          onSubmit={submitNew}
          submitLabel="Aanmaken"
          pending={pending}
        />
      )}

      {initialStyles.length === 0 && !drafts.new ? (
        <div style={emptyStyle}>
          Nog geen writing styles. Maak er een aan voor bijvoorbeeld Jeremy
          casual, TrompTech sales, juridisch strak of korte Telegram updates.
        </div>
      ) : (
        <ul style={listStyle}>
          {initialStyles.map((style) => {
            const draft = drafts[style.id];
            return (
              <li key={style.id} style={rowStyle}>
                {draft ? (
                  <WritingStyleEditor
                    draft={draft}
                    onChange={(patch) => updateDraft(style.id, patch)}
                    onCancel={() => closeDraft(style.id)}
                    onSubmit={() => submitEdit(style.id)}
                    submitLabel="Opslaan"
                    pending={pending}
                  />
                ) : (
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={monoTitleStyle}>{style.name}</div>
                      {style.description && (
                        <p style={{ ...subStyle, marginTop: 3 }}>
                          {style.description}
                        </p>
                      )}
                      <details style={{ marginTop: 8 }}>
                        <summary style={summaryStyle}>
                          instructies ({style.instructions.length} chars)
                        </summary>
                        <pre style={preStyle}>{style.instructions}</pre>
                      </details>
                      {style.sample_text && (
                        <details style={{ marginTop: 6 }}>
                          <summary style={summaryStyle}>
                            voorbeeldtekst ({style.sample_text.length} chars)
                          </summary>
                          <pre style={preStyle}>{style.sample_text}</pre>
                        </details>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => editExisting(style)}
                        style={btnSecondary(pending)}
                      >
                        Bewerken
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => remove(style.id)}
                        style={{
                          ...btnSecondary(pending),
                          borderColor: "var(--rose)",
                          color: "var(--rose)",
                        }}
                      >
                        Verwijderen
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {initialAgents.length > 0 && (
        <AgentWritingStyleAssignments
          workspaceSlug={workspaceSlug}
          styles={initialStyles}
          agents={initialAgents}
          onError={setError}
          onInfo={setInfo}
        />
      )}
    </section>
  );
}

function WritingStyleEditor({
  draft,
  onChange,
  onCancel,
  onSubmit,
  submitLabel,
  pending,
}: {
  draft: DraftStyle;
  onChange: (patch: Partial<DraftStyle>) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  pending: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={labelStyle}>
        <span style={labelTextStyle}>Naam</span>
        <input
          type="text"
          value={draft.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder="Jeremy casual"
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={labelTextStyle}>Wanneer gebruiken?</span>
        <input
          type="text"
          value={draft.description}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="Voor updates aan Jeremy: direct, informeel, geen corporate taal."
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={labelTextStyle}>Style instructions</span>
        <textarea
          value={draft.instructions}
          onChange={(event) => onChange({ instructions: event.target.value })}
          placeholder={`Schrijf kort en menselijk.
Gebruik Nederlands tenzij de gebruiker Engels schrijft.
Begin met het antwoord, niet met context.
Geen marketingtaal, geen lange disclaimers.
Gebruik bullets alleen als ze echt helpen.`}
          rows={8}
          style={{ ...inputStyle, resize: "vertical", minHeight: 130 }}
        />
      </label>
      <label style={labelStyle}>
        <span style={labelTextStyle}>Voorbeeldtekst (optioneel)</span>
        <textarea
          value={draft.sample_text}
          onChange={(event) => onChange({ sample_text: event.target.value })}
          placeholder="Plak hier 1-3 voorbeelden van de gewenste stem."
          rows={5}
          style={{ ...inputStyle, resize: "vertical", minHeight: 92 }}
        />
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          style={btnSecondary(pending)}
        >
          Annuleer
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          style={btnPrimary(pending)}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function AgentWritingStyleAssignments({
  workspaceSlug,
  styles,
  agents,
  onError,
  onInfo,
}: {
  workspaceSlug: string;
  styles: WritingStyleRow[];
  agents: AgentWritingStyleAssignment[];
  onError: (message: string | null) => void;
  onInfo: (message: string | null) => void;
}) {
  const [assignments, setAssignments] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      agents.map((agent) => [agent.id, agent.writing_style_id ?? ""]),
    ),
  );
  const [pendingAgent, setPendingAgent] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const setStyle = (agent: AgentWritingStyleAssignment, styleId: string) => {
    const previous = assignments[agent.id] ?? "";
    setAssignments((current) => ({ ...current, [agent.id]: styleId }));
    setPendingAgent(agent.id);
    onError(null);
    onInfo(null);
    startTransition(async () => {
      const res = await setAgentWritingStyle({
        workspace_slug: workspaceSlug,
        business_id: agent.business_id,
        agent_id: agent.id,
        writing_style_id: styleId || null,
      });
      setPendingAgent(null);
      if (!res.ok) {
        setAssignments((current) => ({ ...current, [agent.id]: previous }));
        onError(res.error);
        return;
      }
      onInfo(`Writing style voor "${agent.name}" opgeslagen.`);
    });
  };

  return (
    <section style={panelStyle}>
      <div>
        <h2 style={panelTitleStyle}>Writing style per agent</h2>
        <p style={subStyle}>
          Kies welke stijl automatisch in de prompt van elke agent-run komt.
        </p>
      </div>
      {styles.length === 0 ? (
        <p style={subStyle}>Maak eerst een writing style.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {agents.map((agent) => {
            const busy = pendingAgent === agent.id;
            return (
              <label key={agent.id} style={assignmentRowStyle}>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 13 }}>{agent.name}</strong>
                  <span
                    style={{
                      color: "var(--app-fg-3)",
                      fontSize: 11,
                      marginLeft: 6,
                    }}
                  >
                    {agent.provider} / {agent.kind}
                  </span>
                </span>
                <select
                  value={assignments[agent.id] ?? ""}
                  disabled={busy}
                  onChange={(event) => setStyle(agent, event.target.value)}
                  style={{ ...inputStyle, width: 260, flexShrink: 0 }}
                >
                  <option value="">Geen style</option>
                  {styles.map((style) => (
                    <option key={style.id} value={style.id}>
                      {style.name}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--hand)",
  fontSize: 22,
  fontWeight: 700,
  margin: 0,
};

const panelTitleStyle: React.CSSProperties = {
  fontFamily: "var(--hand)",
  fontSize: 20,
  fontWeight: 700,
  margin: 0,
};

const subStyle: React.CSSProperties = {
  margin: "3px 0 0",
  color: "var(--app-fg-3)",
  fontSize: 12.5,
  lineHeight: 1.5,
};

const listStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const rowStyle: React.CSSProperties = {
  border: "1.5px solid var(--app-border)",
  borderRadius: 12,
  padding: 14,
  background: "var(--app-card)",
};

const panelStyle: React.CSSProperties = {
  border: "1.5px solid var(--app-border-2)",
  borderRadius: 12,
  background: "var(--app-card-2)",
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const assignmentRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  border: "1px solid var(--app-border)",
  borderRadius: 10,
  background: "var(--app-card)",
  padding: 11,
};

const emptyStyle: React.CSSProperties = {
  border: "1.5px dashed var(--app-border)",
  borderRadius: 12,
  padding: "18px",
  color: "var(--app-fg-3)",
  fontSize: 13,
};

const monoTitleStyle: React.CSSProperties = {
  fontFamily: "var(--mono, ui-monospace, SFMono-Regular)",
  fontSize: 13,
  fontWeight: 700,
};

const summaryStyle: React.CSSProperties = {
  cursor: "pointer",
  fontSize: 11.5,
  color: "var(--app-fg-2)",
};

const preStyle: React.CSSProperties = {
  marginTop: 6,
  padding: 10,
  background: "var(--app-card-2)",
  borderRadius: 8,
  fontSize: 11.5,
  color: "var(--app-fg-2)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  display: "block",
};

const labelTextStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  color: "var(--app-fg-2)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "9px 11px",
  borderRadius: 9,
  fontFamily: "var(--type)",
  fontSize: 13,
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
  opacity: pending ? 0.8 : 1,
});

const btnSecondary = (pending: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  border: "1.5px solid var(--app-border)",
  background: "var(--app-card-2)",
  color: "var(--app-fg)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.7 : 1,
});

const errStyle: React.CSSProperties = {
  color: "var(--rose)",
  background: "rgba(230,82,107,0.08)",
  border: "1px solid rgba(230,82,107,0.4)",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 12.5,
};

const infoStyle: React.CSSProperties = {
  color: "var(--tt-green)",
  background: "rgba(57,178,85,0.08)",
  border: "1px solid rgba(57,178,85,0.45)",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 12.5,
};
