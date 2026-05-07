"use client";

import type React from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addImprovement,
  approveImprovement,
  markBuilt,
  rejectImprovement,
  removeImprovement,
} from "../app/actions/improvements";
import type { ImprovementRow } from "../lib/queries/improvements";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  initialImprovements: ImprovementRow[];
};

type DraftImprovement = {
  title: string;
  description: string;
};

const EMPTY_DRAFT: DraftImprovement = { title: "", description: "" };

export function ImprovementsDashboard({
  workspaceSlug,
  workspaceId,
  initialImprovements,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState<DraftImprovement>(EMPTY_DRAFT);

  const byStatus = (status: ImprovementRow["status"]) =>
    initialImprovements.filter((item) => item.status === status);

  const doAdd = () => {
    if (!draft.title.trim() || !draft.description.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addImprovement({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        title: draft.title,
        description: draft.description,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDraft(EMPTY_DRAFT);
      setShowAddForm(false);
      router.refresh();
    });
  };

  const doApprove = (id: string) => {
    setError(null);
    startTransition(async () => {
      const res = await approveImprovement({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        id,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const doReject = (id: string) => {
    if (!confirm("Afwijzen?")) return;
    setError(null);
    startTransition(async () => {
      const res = await rejectImprovement({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        id,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const doMarkBuilt = (id: string) => {
    const notes = prompt("Wat is er gebouwd? Laat leeg voor geen notitie.");
    setError(null);
    startTransition(async () => {
      const res = await markBuilt({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        id,
        built_by: "self-improving-agent",
        built_notes: notes?.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const doRemove = (id: string) => {
    if (!confirm("Verwijderen? Dit kan niet ongedaan worden.")) return;
    setError(null);
    startTransition(async () => {
      const res = await removeImprovement({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        id,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const statuses: Array<{
    key: ImprovementRow["status"];
    label: string;
    color: string;
  }> = [
    { key: "proposed", label: "Voorgesteld", color: "var(--tt-amber)" },
    { key: "approved", label: "Goedgekeurd", color: "var(--tt-green)" },
    { key: "built", label: "Gebouwd", color: "#22c55e" },
    { key: "rejected", label: "Afgewezen", color: "var(--app-fg-3)" },
  ];

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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {statuses.map((status) => (
            <span
              key={status.key}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 11.5,
                fontWeight: 700,
                background: "var(--app-card-2)",
                border: "1.5px solid var(--app-border)",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: status.color,
                  display: "inline-block",
                }}
              />
              {status.label}: {byStatus(status.key).length}
            </span>
          ))}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => setShowAddForm((value) => !value)}
          style={btnPrimary(pending)}
        >
          {showAddForm ? "Annuleer" : "+ Voorstel indienen"}
        </button>
      </div>

      {error && (
        <p role="alert" style={errStyle}>
          {error}
        </p>
      )}

      {showAddForm && (
        <div
          style={{
            border: "1.5px solid var(--app-border)",
            borderRadius: 14,
            padding: 16,
            background: "var(--app-card)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <label style={labelStyle}>
            <span style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>
              Titel
            </span>
            <input
              type="text"
              value={draft.title}
              onChange={(event) =>
                setDraft((value) => ({ ...value, title: event.target.value }))
              }
              placeholder="Korte, concrete beschrijving van de verbetering"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span style={{ display: "block", marginBottom: 4, fontWeight: 700 }}>
              Beschrijving
            </span>
            <textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  description: event.target.value,
                }))
              }
              placeholder="Wat het is, waarom het waardevol is, en hoe het werkt."
              rows={5}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setDraft(EMPTY_DRAFT);
              }}
              disabled={pending}
              style={btnSecondary(pending)}
            >
              Annuleer
            </button>
            <button
              type="button"
              onClick={doAdd}
              disabled={
                pending || !draft.title.trim() || !draft.description.trim()
              }
              style={btnPrimary(pending)}
            >
              Indienen
            </button>
          </div>
        </div>
      )}

      <ImprovementSection
        title="Voorgesteld"
        items={byStatus("proposed")}
        renderItem={(item) => (
          <div style={actionRowStyle}>
            <button
              type="button"
              onClick={() => doApprove(item.id)}
              disabled={pending}
              style={btnAccent(pending)}
            >
              Goedkeuren
            </button>
            <button
              type="button"
              onClick={() => doReject(item.id)}
              disabled={pending}
              style={btnSecondary(pending)}
            >
              Afwijzen
            </button>
          </div>
        )}
      />

      <ImprovementSection
        title="Goedgekeurd, wacht op bouwen"
        items={byStatus("approved")}
        renderItem={(item) => (
          <div style={actionRowStyle}>
            <button
              type="button"
              onClick={() => doMarkBuilt(item.id)}
              disabled={pending}
              style={btnBuilt(pending)}
            >
              Markeer als gebouwd
            </button>
            <button
              type="button"
              onClick={() => doReject(item.id)}
              disabled={pending}
              style={btnSecondary(pending)}
            >
              Afwijzen
            </button>
          </div>
        )}
      />

      <ImprovementSection
        title="Gebouwd"
        items={byStatus("built")}
        renderItem={(item) => (
          <div style={actionRowStyle}>
            <button
              type="button"
              onClick={() => doRemove(item.id)}
              disabled={pending}
              style={{
                ...btnSecondary(pending),
                color: "var(--rose)",
                borderColor: "var(--rose)",
              }}
            >
              Verwijderen
            </button>
          </div>
        )}
        built
      />

      {byStatus("rejected").length > 0 && (
        <ImprovementSection
          title="Afgewezen"
          items={byStatus("rejected")}
          renderItem={(item) => (
            <button
              type="button"
              onClick={() => doRemove(item.id)}
              disabled={pending}
              style={{
                ...btnSecondary(pending),
                color: "var(--rose)",
                borderColor: "var(--rose)",
              }}
            >
              Verwijderen
            </button>
          )}
        />
      )}
    </section>
  );
}

function ImprovementSection({
  title,
  items,
  renderItem,
  built = false,
}: {
  title: string;
  items: ImprovementRow[];
  renderItem: (item: ImprovementRow) => React.ReactNode;
  built?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <h2
        style={{
          fontFamily: "var(--hand)",
          fontSize: 20,
          fontWeight: 700,
          margin: "0 0 10px",
        }}
      >
        {title}
      </h2>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {items.map((item) => (
          <li
            key={item.id}
            style={{
              border: "1.5px solid var(--app-border)",
              borderRadius: 14,
              padding: "12px 14px",
              background: "var(--app-card)",
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>
                {item.title}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--app-fg-3)",
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {item.description}
              </div>
              {built && item.built_at && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--app-fg-3)" }}>
                  <span style={{ color: "#22c55e", fontWeight: 700 }}>
                    Gebouwd
                  </span>
                  {item.built_by ? ` door ${item.built_by}` : ""}
                  {item.built_notes ? ` - ${item.built_notes}` : ""}
                  {" op "}
                  {new Date(item.built_at).toLocaleDateString("nl-NL")}
                </div>
              )}
              <div style={{ marginTop: 5, fontSize: 11, color: "var(--app-fg-3)" }}>
                Ingediend {new Date(item.created_at).toLocaleDateString("nl-NL")}
              </div>
            </div>
            {renderItem(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}

const actionRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  flexShrink: 0,
};

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
  boxSizing: "border-box",
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

const btnAccent = (pending: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  border: "1.5px solid var(--tt-green)",
  background: "transparent",
  color: "var(--tt-green)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.7 : 1,
});

const btnBuilt = (pending: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  border: "1.5px solid #22c55e",
  background: "#22c55e",
  color: "#fff",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.8 : 1,
});

const errStyle: React.CSSProperties = {
  color: "var(--rose)",
  background: "rgba(230,82,107,0.08)",
  border: "1px solid rgba(230,82,107,0.4)",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 12.5,
};
