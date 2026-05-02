// Owner-only danger-zone actions: download a JSON dump of everything in
// the workspace, or permanently delete the workspace. Delete needs a
// typed confirmation matching the workspace slug (Stripe-style).

"use client";

import { useState, useTransition } from "react";

import {
  deleteWorkspace,
  exportWorkspaceData,
} from "../app/actions/workspaces";

type Props = {
  workspaceId: string;
  workspaceSlug: string;
  isOwner: boolean;
};

export function DangerZone({ workspaceId, workspaceSlug, isOwner }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [exportInfo, setExportInfo] = useState<string | null>(null);

  if (!isOwner) {
    return (
      <p style={{ fontSize: 12.5, color: "var(--app-fg-3)" }}>
        Alleen de owner van deze workspace kan exporteren of verwijderen.
      </p>
    );
  }

  const doExport = () =>
    startTransition(async () => {
      setError(null);
      setExportInfo("Bezig met exporteren…");
      const res = await exportWorkspaceData({ workspace_id: workspaceId });
      if (!res.ok) {
        setError(res.error);
        setExportInfo(null);
        return;
      }
      // Drop the file via a synthetic anchor — keeps the download
      // entirely client-side, no temp endpoint needed.
      const blob = new Blob([res.data.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const sizeKb = (res.data.json.length / 1024).toFixed(1);
      setExportInfo(`Klaar — ${res.data.filename} (${sizeKb} KB)`);
    });

  const doDelete = () =>
    startTransition(async () => {
      setError(null);
      const res = await deleteWorkspace({
        workspace_id: workspaceId,
        confirm_slug: confirm,
        expected_slug: workspaceSlug,
      });
      if (!res.ok) setError(res.error);
      // On success the action redirects, this branch never runs.
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700 }}>
          Data exporteren
        </h4>
        <p style={{ fontSize: 12, color: "var(--app-fg-3)", margin: "0 0 8px" }}>
          Download een JSON-dump van alles in deze workspace — businesses,
          agents, queue, runs, revenue, audit logs, members.
        </p>
        <button
          onClick={doExport}
          disabled={pending}
          style={btnSecondary(pending)}
        >
          {pending ? "Bezig…" : "Download JSON dump"}
        </button>
        {exportInfo && (
          <p style={{ fontSize: 12, color: "var(--tt-green)", marginTop: 8 }}>
            {exportInfo}
          </p>
        )}
      </div>

      <div>
        <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: "var(--rose)" }}>
          Workspace verwijderen
        </h4>
        <p style={{ fontSize: 12, color: "var(--app-fg-3)", margin: "0 0 8px" }}>
          Definitief. Cascade-delete van alle businesses, agents, runs,
          schedules, integrations en members. Typ <code style={code}>{workspaceSlug}</code> om te bevestigen.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={workspaceSlug}
            style={{
              flex: 1,
              background: "var(--app-card-2)",
              border: "1.5px solid var(--app-border)",
              color: "var(--app-fg)",
              padding: "8px 10px",
              borderRadius: 9,
              fontSize: 13,
              fontFamily: "ui-monospace, Menlo, monospace",
            }}
          />
          <button
            onClick={doDelete}
            disabled={pending || confirm !== workspaceSlug}
            style={btnDanger(pending || confirm !== workspaceSlug)}
          >
            {pending ? "Bezig…" : "Verwijder"}
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          style={{
            color: "var(--rose)",
            background: "rgba(230,82,107,0.08)",
            border: "1px solid rgba(230,82,107,0.4)",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 12.5,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

const code: React.CSSProperties = {
  background: "var(--app-card-2)",
  padding: "1px 5px",
  borderRadius: 4,
  fontSize: 11,
};

const btnSecondary = (pending: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  border: "1.5px solid var(--app-border)",
  background: "var(--app-card-2)",
  color: "var(--app-fg)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.7 : 1,
});

const btnDanger = (disabled: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  border: "1.5px solid var(--rose)",
  background: "var(--rose)",
  color: "#fff",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
});
