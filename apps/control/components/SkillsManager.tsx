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
  updateSkill,
} from "../app/actions/skills";
import type { SkillRow } from "../lib/queries/skills";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  initialSkills: SkillRow[];
};

type DraftSkill = {
  id?: string;
  name: string;
  description: string;
  body: string;
};

const EMPTY_DRAFT: DraftSkill = { name: "", description: "", body: "" };

export function SkillsManager({
  workspaceSlug,
  workspaceId,
  initialSkills,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Drafts state — keyed by skill id when editing, by "new" when
  // composing a fresh one. Lets multiple cards open at once and keeps
  // the layout calm.
  const [drafts, setDrafts] = useState<Record<string, DraftSkill>>({});

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

  const submitNew = () => {
    const draft = drafts.new;
    if (!draft) return;
    setError(null);
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
