// Workspace-scoped skills CRUD UI. Render the existing list as
// cards, an inline create/edit form per row, and a "+ Nieuwe skill"
// button up top. Pattern matches the existing CustomIntegrationsPanel
// layout so the workspace settings feel consistent.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archiveSkill,
  createSkill,
  importPopularOnlineSkill,
  importSkillFromGitHubUrl,
  previewPopularOnlineSkills,
  setAgentSkills,
  updateSkill,
  type OnlineSkillPreview,
} from "../app/actions/skills";
import type { SkillRow } from "../lib/queries/skills";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  initialSkills: SkillRow[];
  initialAgents?: AgentSkillAssignment[];
};

type DraftSkill = {
  id?: string;
  name: string;
  description: string;
  body: string;
};

type AgentSkillAssignment = {
  id: string;
  name: string;
  kind: string;
  provider: string;
  business_id: string | null;
  allowed_skills?: string[] | null;
};

type GeneratedSkill = {
  name: string;
  description: string;
  body: string;
  explanation?: string;
};

const EMPTY_DRAFT: DraftSkill = { name: "", description: "", body: "" };

export function SkillsManager({
  workspaceSlug,
  workspaceId,
  initialSkills,
  initialAgents = [],
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Drafts state — keyed by skill id when editing, by "new" when
  // composing a fresh one. Lets multiple cards open at once and keeps
  // the layout calm.
  const [drafts, setDrafts] = useState<Record<string, DraftSkill>>({});
  const [aiRequest, setAiRequest] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [onlineSkills, setOnlineSkills] = useState<OnlineSkillPreview[] | null>(
    null,
  );
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);

  const openNew = () => {
    setDrafts((d) => ({ ...d, new: { ...EMPTY_DRAFT } }));
  };
  const closeDraft = (key: string) => {
    setDrafts((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  };
  const editExisting = (skill: SkillRow) => {
    setDrafts((d) => ({
      ...d,
      [skill.id]: {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        body: skill.body,
      },
    }));
  };
  const updateDraft = (key: string, patch: Partial<DraftSkill>) => {
    setDrafts((d) => ({
      ...d,
      [key]: { ...(d[key] ?? EMPTY_DRAFT), ...patch },
    }));
  };

  const openGeneratedDraft = (skill: GeneratedSkill) => {
    setDrafts((d) => ({
      ...d,
      new: {
        name: skill.name,
        description: skill.description,
        body: skill.body,
      },
    }));
    if (skill.explanation) setInfo(skill.explanation);
  };

  const generateSkill = async () => {
    if (!aiRequest.trim()) return;
    setAiGenerating(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/skills/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          request: aiRequest,
          workspace_id: workspaceId,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        needsApiKey?: boolean;
        skill?: GeneratedSkill;
      };
      if (!res.ok || !json.ok || !json.skill) {
        setError(
          json.needsApiKey
            ? "Geen Claude of MiniMax API key gevonden voor de AI-generator."
            : json.error ?? "Skill genereren mislukt.",
        );
        return;
      }
      openGeneratedDraft(json.skill);
    } catch {
      setError("Netwerkfout bij skill genereren.");
    } finally {
      setAiGenerating(false);
    }
  };

  const loadOnlineSkills = async () => {
    setOnlineLoading(true);
    setError(null);
    setInfo(null);
    const res = await previewPopularOnlineSkills();
    setOnlineLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOnlineSkills(res.data);
  };

  const importOnline = (templateId: string) => {
    setImportingId(templateId);
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await importPopularOnlineSkill({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        template_id: templateId,
      });
      setImportingId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInfo(`Skill "${res.data.name}" geimporteerd.`);
      router.refresh();
    });
  };

  const importCustomUrl = () => {
    if (!customUrl.trim()) return;
    setImportingId("custom");
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await importSkillFromGitHubUrl({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        url: customUrl,
      });
      setImportingId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCustomUrl("");
      setInfo(`Skill "${res.data.name}" geimporteerd.`);
      router.refresh();
    });
  };

  const submitNew = () => {
    const draft = drafts.new;
    if (!draft) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await createSkill({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        name: draft.name,
        description: draft.description,
        body: draft.body,
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
      const res = await updateSkill({
        workspace_slug: workspaceSlug,
        id,
        patch: {
          name: draft.name,
          description: draft.description,
          body: draft.body,
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
    if (!confirm("Skill archiveren? Agents die 'm gebruiken verliezen 'm.")) {
      return;
    }
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await archiveSkill({ workspace_slug: workspaceSlug, id });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <AiSkillMaker
        value={aiRequest}
        onChange={setAiRequest}
        onGenerate={generateSkill}
        pending={aiGenerating}
      />

      <OnlineSkillImporter
        skills={onlineSkills}
        loading={onlineLoading}
        importingId={importingId}
        customUrl={customUrl}
        onCustomUrlChange={setCustomUrl}
        onLoad={loadOnlineSkills}
        onImport={importOnline}
        onImportCustom={importCustomUrl}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <h2
          style={{
            fontFamily: "var(--hand)",
            fontSize: 22,
            fontWeight: 700,
            margin: 0,
          }}
        >
          {initialSkills.length} skills
        </h2>
        <button
          type="button"
          disabled={pending || drafts.new !== undefined}
          onClick={openNew}
          style={btnPrimary(pending || drafts.new !== undefined)}
        >
          + Nieuwe skill
        </button>
      </div>

      {error && (
        <p role="alert" style={errStyle}>
          {error}
        </p>
      )}
      {info && <p style={infoStyle}>{info}</p>}

      {drafts.new && (
        <SkillEditor
          draft={drafts.new}
          onChange={(patch) => updateDraft("new", patch)}
          onCancel={() => closeDraft("new")}
          onSubmit={submitNew}
          submitLabel="Aanmaken"
          pending={pending}
        />
      )}

      {initialSkills.length === 0 && !drafts.new ? (
        <div
          style={{
            border: "1.5px dashed var(--app-border)",
            borderRadius: 12,
            padding: "22px 18px",
            textAlign: "center",
            color: "var(--app-fg-3)",
            fontSize: 13,
          }}
        >
          Nog geen skills. Maak er één aan om procedurele kennis te delen
          tussen agents.
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {initialSkills.map((s) => {
            const draft = drafts[s.id];
            return (
              <li
                key={s.id}
                style={{
                  border: "1.5px solid var(--app-border)",
                  borderRadius: 14,
                  padding: 14,
                  background: "var(--app-card)",
                }}
              >
                {draft ? (
                  <SkillEditor
                    draft={draft}
                    onChange={(patch) => updateDraft(s.id, patch)}
                    onCancel={() => closeDraft(s.id)}
                    onSubmit={() => submitEdit(s.id)}
                    submitLabel="Opslaan"
                    pending={pending}
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "var(--mono, ui-monospace, SFMono-Regular)",
                          fontSize: 13,
                          fontWeight: 700,
                        }}
                      >
                        {s.name}
                      </div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: "var(--app-fg-3)",
                          marginTop: 3,
                          lineHeight: 1.5,
                        }}
                      >
                        {s.description}
                      </div>
                      <details
                        style={{ marginTop: 8 }}
                        // Default-collapsed so the list scans cleanly;
                        // body content can be 100s of words.
                      >
                        <summary
                          style={{
                            cursor: "pointer",
                            fontSize: 11.5,
                            color: "var(--app-fg-2)",
                          }}
                        >
                          body ({s.body.length} chars)
                        </summary>
                        <pre
                          style={{
                            marginTop: 6,
                            padding: 10,
                            background: "var(--app-card-2)",
                            borderRadius: 8,
                            fontSize: 11.5,
                            color: "var(--app-fg-2)",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {s.body}
                        </pre>
                      </details>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => editExisting(s)}
                        style={btnSecondary(pending)}
                      >
                        Bewerken
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => remove(s.id)}
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
        <AgentSkillAssignments
          workspaceSlug={workspaceSlug}
          skills={initialSkills}
          agents={initialAgents}
          onError={setError}
          onInfo={setInfo}
        />
      )}
    </section>
  );
}

function AiSkillMaker({
  value,
  onChange,
  onGenerate,
  pending,
}: {
  value: string;
  onChange: (value: string) => void;
  onGenerate: () => void;
  pending: boolean;
}) {
  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h2 style={panelTitleStyle}>AI skill maken</h2>
          <p style={panelSubStyle}>
            Beschrijf de werkwijze; AI maakt een compacte skill-draft die je
            nog kunt aanpassen voor opslaan.
          </p>
        </div>
        <button
          type="button"
          disabled={pending || !value.trim()}
          onClick={onGenerate}
          style={btnPrimary(pending || !value.trim())}
        >
          {pending ? "Genereren..." : "Genereer skill"}
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="Bijv. maak een skill voor outreach research: check website, LinkedIn, recente signalen en schrijf daarna 3 concrete haakjes."
        style={{ ...inputStyle, resize: "vertical", minHeight: 78 }}
      />
    </section>
  );
}

function OnlineSkillImporter({
  skills,
  loading,
  importingId,
  customUrl,
  onCustomUrlChange,
  onLoad,
  onImport,
  onImportCustom,
}: {
  skills: OnlineSkillPreview[] | null;
  loading: boolean;
  importingId: string | null;
  customUrl: string;
  onCustomUrlChange: (value: string) => void;
  onLoad: () => void;
  onImport: (id: string) => void;
  onImportCustom: () => void;
}) {
  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h2 style={panelTitleStyle}>Populaire online skills importeren</h2>
          <p style={panelSubStyle}>
            Haal bekende GitHub skill-catalogi op of importeer direct een
            SKILL.md/markdown URL.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={onLoad}
          style={btnSecondary(loading)}
        >
          {loading ? "Laden..." : skills ? "Ververs catalogus" : "Laad catalogus"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: 8,
          alignItems: "center",
        }}
      >
        <input
          type="url"
          value={customUrl}
          onChange={(e) => onCustomUrlChange(e.target.value)}
          placeholder="https://github.com/org/repo/blob/main/path/SKILL.md"
          style={inputStyle}
        />
        <button
          type="button"
          disabled={!customUrl.trim() || importingId === "custom"}
          onClick={onImportCustom}
          style={btnPrimary(!customUrl.trim() || importingId === "custom")}
        >
          {importingId === "custom" ? "Import..." : "Import URL"}
        </button>
      </div>

      {skills && skills.length > 0 && (
        <div
          style={{
            border: "1px solid var(--app-border)",
            borderRadius: 10,
            overflow: "hidden",
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {skills.map((skill) => (
            <div
              key={skill.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: 10,
                padding: "9px 11px",
                borderBottom: "1px solid var(--app-border-2)",
                background: "var(--app-card)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {skill.name}
                </div>
                <div
                  style={{
                    color: "var(--app-fg-3)",
                    fontSize: 11.5,
                    lineHeight: 1.45,
                    marginTop: 2,
                  }}
                >
                  {skill.description}
                </div>
                <a
                  href={skill.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--tt-green)",
                    fontSize: 10.5,
                    textDecoration: "none",
                  }}
                >
                  {skill.source_provider} / {skill.body_chars} chars
                </a>
              </div>
              <button
                type="button"
                disabled={Boolean(importingId)}
                onClick={() => onImport(skill.id)}
                style={btnSecondary(Boolean(importingId))}
              >
                {importingId === skill.id ? "Import..." : "Importeer"}
              </button>
            </div>
          ))}
        </div>
      )}

      {skills && skills.length === 0 && (
        <p style={panelSubStyle}>Geen online skills gevonden.</p>
      )}
    </section>
  );
}

function AgentSkillAssignments({
  workspaceSlug,
  skills,
  agents,
  onError,
  onInfo,
}: {
  workspaceSlug: string;
  skills: SkillRow[];
  agents: AgentSkillAssignment[];
  onError: (message: string | null) => void;
  onInfo: (message: string | null) => void;
}) {
  const [assignments, setAssignments] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      agents.map((agent) => [agent.id, agent.allowed_skills ?? []]),
    ),
  );
  const [pendingAgent, setPendingAgent] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggle = (agent: AgentSkillAssignment, skillId: string) => {
    const current = assignments[agent.id] ?? [];
    const next = current.includes(skillId)
      ? current.filter((id) => id !== skillId)
      : [...current, skillId];
    setAssignments((prev) => ({ ...prev, [agent.id]: next }));
    setPendingAgent(agent.id);
    onError(null);
    onInfo(null);
    startTransition(async () => {
      const res = await setAgentSkills({
        workspace_slug: workspaceSlug,
        business_id: agent.business_id,
        agent_id: agent.id,
        skill_ids: next,
      });
      setPendingAgent(null);
      if (!res.ok) {
        setAssignments((prev) => ({ ...prev, [agent.id]: current }));
        onError(res.error);
        return;
      }
      onInfo(`Skills voor "${agent.name}" opgeslagen.`);
    });
  };

  return (
    <section style={panelStyle}>
      <div>
        <h2 style={panelTitleStyle}>Skills per agent</h2>
        <p style={panelSubStyle}>
          Alleen aangevinkte skills worden in de prompt van die agent geladen.
        </p>
      </div>
      {skills.length === 0 ? (
        <p style={panelSubStyle}>Maak of importeer eerst een skill.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {agents.map((agent) => {
            const selected = assignments[agent.id] ?? [];
            const busy = pendingAgent === agent.id;
            return (
              <div
                key={agent.id}
                style={{
                  border: "1px solid var(--app-border)",
                  borderRadius: 10,
                  background: "var(--app-card)",
                  padding: 11,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    marginBottom: 8,
                  }}
                >
                  <div>
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
                  </div>
                  <span style={{ color: "var(--app-fg-3)", fontSize: 11 }}>
                    {busy ? "opslaan..." : `${selected.length} actief`}
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: 6,
                  }}
                >
                  {skills.map((skill) => (
                    <label
                      key={skill.id}
                      title={skill.description}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 7,
                        fontSize: 12,
                        color: "var(--app-fg-2)",
                        cursor: busy ? "wait" : "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(skill.id)}
                        disabled={busy}
                        onChange={() => toggle(agent, skill.id)}
                        style={{ accentColor: "var(--tt-green)", marginTop: 2 }}
                      />
                      <span>{skill.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SkillEditor({
  draft,
  onChange,
  onCancel,
  onSubmit,
  submitLabel,
  pending,
}: {
  draft: DraftSkill;
  onChange: (patch: Partial<DraftSkill>) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  pending: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <label style={labelStyle}>
        <span style={{ display: "block", marginBottom: 4 }}>
          Naam (kort, identifier-achtig)
        </span>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="bv. lead-research, instagram-reply"
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={{ display: "block", marginBottom: 4 }}>
          Wanneer gebruik je deze skill? (één zin)
        </span>
        <input
          type="text"
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="bv. Voor het samenstellen van een outreach-mail naar een nieuwe lead."
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        <span style={{ display: "block", marginBottom: 4 }}>
          Body — markdown instructies (max ~500 woorden aanbevolen)
        </span>
        <textarea
          value={draft.body}
          onChange={(e) => onChange({ body: e.target.value })}
          placeholder={`# Stappen
1. Lees de naam en het bedrijf uit de input.
2. Schrijf 3 onderwerp-regels onder de 50 tekens.
3. ...`}
          rows={10}
          style={{ ...inputStyle, fontFamily: "var(--mono, ui-monospace)", resize: "vertical" }}
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

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  display: "block",
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

const panelHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const panelTitleStyle: React.CSSProperties = {
  fontFamily: "var(--hand)",
  fontSize: 20,
  fontWeight: 700,
  margin: 0,
};

const panelSubStyle: React.CSSProperties = {
  margin: "3px 0 0",
  color: "var(--app-fg-3)",
  fontSize: 12.5,
  lineHeight: 1.5,
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
