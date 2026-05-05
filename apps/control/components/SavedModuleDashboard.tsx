"use client";

import { useState } from "react";

import { deleteModuleDashboard } from "../app/actions/dashboards";
import type { ModuleDashboard } from "../lib/queries/dashboards";
import { MarkdownText } from "./MarkdownText";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  dashboard: ModuleDashboard;
};

export function SavedModuleDashboard({
  workspaceSlug,
  workspaceId,
  businessId,
  dashboard,
}: Props) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Weet je zeker dat je dit dashboard wil verwijderen?")) return;
    setDeleting(true);
    await deleteModuleDashboard({
      workspace_slug: workspaceSlug,
      workspace_id: workspaceId,
      business_id: businessId,
      nav_node_id: dashboard.nav_node_id,
    });
    setDeleting(false);
  };

  const dateLabel = new Date(dashboard.generated_at).toLocaleString("nl", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      style={{
        marginBottom: 18,
        border: "1.5px solid var(--app-border)",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          background: "var(--app-card-2)",
          borderBottom: "1px solid var(--app-border)",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          AI Dashboard
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "var(--app-fg-3)" }}>
            Gegenereerd {dateLabel}
          </span>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            style={{
              fontSize: 11,
              color: "var(--rose)",
              background: "none",
              border: "none",
              cursor: deleting ? "wait" : "pointer",
              padding: "2px 6px",
              opacity: deleting ? 0.5 : 1,
            }}
          >
            {deleting ? "…" : "Verwijder"}
          </button>
        </div>
      </div>
      <div style={{ padding: "16px 20px" }}>
        <MarkdownText text={dashboard.content} />
      </div>
    </div>
  );
}
