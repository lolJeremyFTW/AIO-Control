// Inline-editable panel for the business description, mission/rules,
// and active targets. Shown on the business overview page so users can
// update context that gets injected into every agent system prompt.

"use client";

import { useState, useTransition } from "react";

import { updateBusiness } from "../app/actions/businesses";
import type { BusinessRow, BusinessTarget } from "../lib/queries/businesses";
import { TargetsEditor, type Target } from "./TargetsEditor";

type Props = {
  business: BusinessRow;
  workspaceSlug: string;
};

export function BusinessIntentPanel({ business, workspaceSlug }: Props) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(business.description ?? "");
  const [mission, setMission] = useState(business.mission ?? "");
  const [targets, setTargets] = useState<Target[]>(
    (business.targets ?? []) as Target[],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasContent =
    business.description || business.mission || (business.targets ?? []).length > 0;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await updateBusiness({
        workspace_slug: workspaceSlug,
        id: business.id,
        patch: {
          description: description.trim() || null,
          mission: mission.trim() || null,
          targets: targets as BusinessTarget[],
        },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
    });
  }

  function handleCancel() {
    setDescription(business.description ?? "");
    setMission(business.mission ?? "");
    setTargets((business.targets ?? []) as Target[]);
    setError(null);
    setEditing(false);
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "var(--app-fg-3)",
    marginBottom: 4,
  };

  const taStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1.5px solid var(--app-border)",
    background: "var(--app-bg)",
    color: "var(--app-fg)",
    fontSize: 12.5,
    lineHeight: 1.55,
    resize: "vertical",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 14,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--app-fg-3)",
          }}
        >
          Agent context
        </span>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: "var(--tt-green)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Bewerken →
          </button>
        )}
      </div>

      {editing ? (
        <>
          <div>
            <div style={labelStyle}>Beschrijving</div>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Bijv. TrompTechDesigns — freelance webdesign voor MKB in Breda. Doel: 10 nieuwe klanten per kwartaal."
              style={taStyle}
            />
          </div>

          <div>
            <div style={labelStyle}>Mission / Agent rules</div>
            <textarea
              rows={4}
              value={mission}
              onChange={(e) => setMission(e.target.value)}
              placeholder={"Bijv.\n• Schrijf in NL u-vorm, geen jargon\n• Geen click-bait\n• Bij twijfel: HITL review"}
              style={taStyle}
            />
          </div>

          <div>
            <div style={labelStyle}>Targets / KPIs</div>
            <TargetsEditor value={targets} onChange={setTargets} />
          </div>

          {error && (
            <p style={{ fontSize: 12, color: "var(--rose)", margin: 0 }}>{error}</p>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={pending}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: "var(--tt-green)",
                color: "#fff",
                border: "none",
                fontWeight: 700,
                fontSize: 12.5,
                cursor: pending ? "wait" : "pointer",
                opacity: pending ? 0.6 : 1,
              }}
            >
              {pending ? "Opslaan…" : "Opslaan"}
            </button>
            <button
              onClick={handleCancel}
              disabled={pending}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: "var(--app-card-2)",
                color: "var(--app-fg-2)",
                border: "1px solid var(--app-border)",
                fontWeight: 600,
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              Annuleren
            </button>
          </div>
        </>
      ) : hasContent ? (
        <>
          {business.description && (
            <div>
              <div style={labelStyle}>Beschrijving</div>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "var(--app-fg-2)", whiteSpace: "pre-wrap" }}>
                {business.description}
              </p>
            </div>
          )}
          {business.mission && (
            <div>
              <div style={labelStyle}>Mission / Agent rules</div>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "var(--app-fg-2)", whiteSpace: "pre-wrap" }}>
                {business.mission}
              </p>
            </div>
          )}
          {(business.targets ?? []).length > 0 && (
            <div>
              <div style={labelStyle}>Targets</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                {(business.targets ?? []).map((t) => (
                  <li
                    key={t.id}
                    style={{
                      fontSize: 12,
                      color: t.status === "done" ? "var(--app-fg-3)" : "var(--app-fg-2)",
                      textDecoration: t.status === "done" ? "line-through" : "none",
                      display: "flex",
                      gap: 6,
                      alignItems: "baseline",
                    }}
                  >
                    <span style={{ color: t.status === "done" ? "var(--tt-green)" : "var(--app-fg-3)" }}>
                      {t.status === "done" ? "✓" : "·"}
                    </span>
                    <span>
                      <strong>{t.name}</strong>
                      {t.target ? ` → ${t.target}` : ""}
                      {t.deadline ? ` (${t.deadline})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--app-fg-3)", fontStyle: "italic" }}>
          Nog geen context ingesteld — voeg een beschrijving, mission en targets toe zodat agents weten waarvoor ze werken.
        </p>
      )}
    </div>
  );
}
