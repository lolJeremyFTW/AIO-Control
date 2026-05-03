// Workspace-wide agent overview. Shows ALL agents in the workspace
// grouped by business, with workspace-global agents (business_id IS
// NULL) in their own "Workspace" section at the top. The page is the
// single place to scan every agent regardless of which business owns
// it — the user explicitly asked for this overview.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { resolveApiKey } from "../../../lib/api-keys/resolve";
import { listAgentsForWorkspace } from "../../../lib/queries/agents";
import { listBusinesses } from "../../../lib/queries/businesses";
import {
  listRecentRunsForWorkspace,
  listSchedulesForWorkspace,
} from "../../../lib/queries/schedules";
import { AgentsDashboard } from "../../../components/AgentsDashboard";
import { AgentsList } from "../../../components/AgentsList";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getDict } from "../../../lib/i18n/server";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function WorkspaceAgentsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const [
    allAgents,
    businesses,
    schedules,
    runs,
    { data: telegramRows },
    { data: customRows },
    { data: wsDefaults },
    { t },
  ] = await Promise.all([
    listAgentsForWorkspace(workspace.id, "all"),
    listBusinesses(workspace.id),
    listSchedulesForWorkspace(workspace.id),
    listRecentRunsForWorkspace(workspace.id, 200),
    supabase
      .from("telegram_targets")
      .select("id, name")
      .eq("workspace_id", workspace.id)
      .eq("enabled", true),
    supabase
      .from("custom_integrations")
      .select("id, name")
      .eq("workspace_id", workspace.id)
      .eq("enabled", true),
    supabase
      .from("workspaces")
      .select("default_provider, default_model, default_system_prompt")
      .eq("id", workspace.id)
      .maybeSingle(),
    getDict(),
  ]);

  // Resolve key status across every provider used in the workspace.
  const uniqueProviders = Array.from(
    new Set(allAgents.map((a) => a.provider)),
  );
  const providerKeyStatus: Record<string, boolean> = {};
  await Promise.all(
    uniqueProviders.map(async (p) => {
      const k = await resolveApiKey(p, { workspaceId: workspace.id });
      providerKeyStatus[p] = !!k;
    }),
  );

  // Group agents per business. Workspace-global (business_id IS NULL)
  // gets its own group, then one group per business in created order.
  const globalAgents = allAgents.filter((a) => !a.business_id);
  const groups = businesses
    .map((b) => ({
      id: b.id,
      title: b.name,
      sub: b.sub ?? null,
      agents: allAgents.filter((a) => a.business_id === b.id),
    }))
    .filter((g) => g.agents.length > 0);

  const telegramTargets = (telegramRows ?? []) as {
    id: string;
    name: string;
  }[];
  const customIntegrations = (customRows ?? []) as {
    id: string;
    name: string;
  }[];
  const wsDefaultsTyped = {
    provider: (wsDefaults?.default_provider as string | null) ?? null,
    model: (wsDefaults?.default_model as string | null) ?? null,
    systemPrompt:
      (wsDefaults?.default_system_prompt as string | null) ?? null,
  };

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{t("page.workspaceAgents")}</h1>
        <span className="sub">{t("page.workspaceAgents.sub")}</span>
      </div>

      {/* ── Dashboard: KPIs + calendar + revenue ──────────────── */}
      <div style={{ marginBottom: 24 }}>
        <AgentsDashboard
          workspaceSlug={workspace.slug}
          agents={allAgents.map((a) => ({
            id: a.id,
            name: a.name,
            business_id: a.business_id,
          }))}
          businesses={businesses.map((b) => ({
            id: b.id,
            name: b.name,
            letter: b.letter,
            variant: b.variant ?? "brand",
            color_hex: b.color_hex ?? null,
          }))}
          schedules={schedules.map((s) => ({
            id: s.id,
            agent_id: s.agent_id,
            business_id: s.business_id,
            kind: s.kind,
            cron_expr: s.cron_expr,
            enabled: s.enabled,
            title: s.title,
          }))}
          runs={runs.map((r) => ({
            id: r.id,
            agent_id: r.agent_id,
            business_id: r.business_id,
            schedule_id: r.schedule_id,
            status: r.status,
            started_at: r.started_at,
            ended_at: r.ended_at,
            cost_cents: r.cost_cents,
            created_at: r.created_at,
          }))}
        />
      </div>

      {/* ── Workspace-global ───────────────────────────────────── */}
      <section style={{ marginBottom: 24 }}>
        <GroupHeading
          title={t("page.workspaceAgents.workspaceGroup")}
          sub={t("page.workspaceAgents.workspaceGroupSub")}
          count={globalAgents.length}
          countLabel={
            globalAgents.length === 1
              ? t("page.workspaceAgents.countSingular")
              : t("page.workspaceAgents.countPlural")
          }
        />
        <AgentsList
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          businessId={null}
          agents={globalAgents}
          providerKeyStatus={providerKeyStatus}
          telegramTargets={telegramTargets}
          customIntegrations={customIntegrations}
          workspaceDefaults={wsDefaultsTyped}
        />
      </section>

      {/* ── Per business ───────────────────────────────────────── */}
      {groups.map((g) => (
        <section key={g.id} style={{ marginBottom: 24 }}>
          <GroupHeading
            title={g.title}
            sub={g.sub ?? t("page.workspaceAgents.businessGroupSub")}
            count={g.agents.length}
            countLabel={
              g.agents.length === 1
                ? t("page.workspaceAgents.countSingular")
                : t("page.workspaceAgents.countPlural")
            }
            href={`/${workspace.slug}/business/${g.id}/agents`}
          />
          <AgentsList
            workspaceSlug={workspace.slug}
            workspaceId={workspace.id}
            businessId={g.id}
            agents={g.agents}
            providerKeyStatus={providerKeyStatus}
            telegramTargets={telegramTargets}
            customIntegrations={customIntegrations}
            workspaceDefaults={wsDefaultsTyped}
          />
        </section>
      ))}

      {globalAgents.length === 0 && groups.length === 0 && (
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 13,
            fontStyle: "italic",
            padding: "24px 0",
          }}
        >
          {t("page.workspaceAgents.empty")}
        </p>
      )}
    </div>
  );
}

function GroupHeading({
  title,
  sub,
  count,
  countLabel,
  href,
}: {
  title: string;
  sub: string;
  count: number;
  /** Translatable suffix shown after the count (e.g. "agent" / "agents"). */
  countLabel?: string;
  /** When set, the title is a link — used to deep-link to the
   *  per-business agents page. */
  href?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        margin: "0 0 12px",
        paddingBottom: 8,
        borderBottom: "1px solid var(--app-border-2)",
      }}
    >
      {href ? (
        <a
          href={href}
          style={{
            fontFamily: "var(--hand)",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.2px",
            color: "var(--app-fg)",
            textDecoration: "none",
          }}
        >
          {title}
        </a>
      ) : (
        <span
          style={{
            fontFamily: "var(--hand)",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.2px",
          }}
        >
          {title}
        </span>
      )}
      <span style={{ fontSize: 12, color: "var(--app-fg-3)" }}>{sub}</span>
      <span
        style={{
          marginLeft: "auto",
          fontSize: 11,
          color: "var(--app-fg-3)",
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        {count} {countLabel ?? (count === 1 ? "agent" : "agents")}
      </span>
    </div>
  );
}
