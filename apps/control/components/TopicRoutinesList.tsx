// Server component — renders the schedules pinned to this topic
// (and descendants when includeDescendants=true). Mounted from the
// per-topic page below the dashboard. Read-only for Sprint C; the
// existing /business/[bizId]/schedules page remains the place for
// CRUD until we extract a fully scope-aware SchedulesPanel.

import Link from "next/link";

import { getDict } from "../lib/i18n/server";
import { listDescendantNavNodeIds } from "../lib/queries/nav-nodes";
import { createSupabaseServerClient } from "../lib/supabase/server";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  navNodeId: string;
  includeDescendants?: boolean;
};

export async function TopicRoutinesList({
  workspaceSlug,
  workspaceId,
  businessId,
  navNodeId,
  includeDescendants = true,
}: Props) {
  const { t } = await getDict();
  const supabase = await createSupabaseServerClient();

  const scopeIds = includeDescendants
    ? await listDescendantNavNodeIds(navNodeId)
    : [navNodeId];

  const { data: rows } = await supabase
    .from("schedules_safe")
    .select(
      "id, agent_id, kind, cron_expr, enabled, last_fired_at, title, description",
    )
    .eq("workspace_id", workspaceId)
    .in("nav_node_id", scopeIds)
    .order("created_at", { ascending: false });

  type ScheduleRow = {
    id: string;
    agent_id: string;
    kind: "cron" | "webhook" | "manual";
    cron_expr: string | null;
    enabled: boolean;
    last_fired_at: string | null;
    title: string | null;
    description: string | null;
  };
  const schedules = (rows ?? []) as ScheduleRow[];

  return (
    <section
      style={{
        marginBottom: 22,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 4,
        }}
      >
        <h3
          style={{
            fontFamily: "var(--hand)",
            fontSize: 18,
            fontWeight: 700,
            margin: 0,
          }}
        >
          {t("topic.routines")}
        </h3>
        <Link
          href={`/${workspaceSlug}/business/${businessId}/schedules`}
          style={{
            fontSize: 11.5,
            color: "var(--tt-green)",
            fontWeight: 700,
          }}
        >
          {t("topic.routines.manage")} →
        </Link>
      </div>

      {schedules.length === 0 ? (
        <div
          style={{
            padding: "20px 16px",
            border: "1.5px dashed var(--app-border)",
            borderRadius: 12,
            textAlign: "center",
            fontSize: 12.5,
            color: "var(--app-fg-3)",
          }}
        >
          {t("topic.routines.empty")}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            border: "1px solid var(--app-border)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {schedules.map((s) => (
            <div
              key={s.id}
              style={{
                display: "grid",
                gridTemplateColumns: "70px 1fr auto auto",
                gap: 10,
                alignItems: "center",
                padding: "10px 12px",
                borderBottom: "1px solid var(--app-border-2)",
                background: "var(--app-card-2)",
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--app-fg-3)",
                }}
              >
                {s.kind}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.title ?? s.description ?? s.cron_expr ?? "—"}
                </div>
                <div style={{ fontSize: 11, color: "var(--app-fg-3)" }}>
                  {s.cron_expr ?? "—"}
                </div>
              </div>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: s.enabled ? "var(--tt-green)" : "var(--rose)",
                }}
              >
                {s.enabled ? t("topic.routines.on") : t("topic.routines.off")}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--app-fg-3)",
                  whiteSpace: "nowrap",
                }}
              >
                {s.last_fired_at
                  ? new Date(s.last_fired_at).toLocaleDateString("nl-NL", {
                      day: "numeric",
                      month: "short",
                    })
                  : t("topic.routines.neverFired")}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
