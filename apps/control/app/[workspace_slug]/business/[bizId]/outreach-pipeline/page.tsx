import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../../lib/auth/workspace";
import {
  findBusiness,
  listBusinesses,
} from "../../../../../lib/queries/businesses";
import { listAgentsForWorkspace } from "../../../../../lib/queries/agents";
import { getServiceRoleSupabase } from "../../../../../lib/supabase/service";
import { OutreachPipelineModule } from "../../../../../components/OutreachPipelineModule";

type Props = {
  params: Promise<{ workspace_slug: string; bizId: string }>;
};

export const dynamic = "force-dynamic";

export default async function OutreachPipelinePage({ params }: Props) {
  const { workspace_slug, bizId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const [businesses, agents] = await Promise.all([
    listBusinesses(workspace.id),
    listAgentsForWorkspace(workspace.id),
  ]);
  const biz = findBusiness(businesses, bizId);
  if (!biz) notFound();
  const scopedAgents = agents.filter(
    (agent) => agent.business_id === biz.id || agent.business_id === null,
  );

  const supabase = getServiceRoleSupabase();
  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const [
    { data: config },
    { data: recentRuns },
    { data: recentEvents },
    { count: total },
    { count: eligible },
    { count: moduleOutreached },
    { count: sent },
    { count: pendingWhatsapp },
    { count: failedQa24h },
  ] = await Promise.all([
    supabase
      .from("outreach_pipeline_configs")
      .select(
        "id, enabled, interval_seconds, batch_size, last_started_at, last_finished_at, last_error, total_cycles, total_outreached_count, total_duplicate_skipped, pipeline_steps, pipeline_blueprint",
      )
      .eq("workspace_id", workspace.id)
      .eq("business_id", biz.id)
      .is("nav_node_id", null)
      .maybeSingle(),
    supabase
      .from("outreach_pipeline_runs")
      .select(
        "id, status, claimed_count, outreached_count, duplicate_skipped_count, error_count, started_at, ended_at",
      )
      .eq("workspace_id", workspace.id)
      .eq("business_id", biz.id)
      .is("nav_node_id", null)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("outreach_pipeline_events")
      .select(
        "id, run_id, stage, agent_name, event_type, message, delta_outreached, created_at",
      )
      .eq("workspace_id", workspace.id)
      .eq("business_id", biz.id)
      .is("nav_node_id", null)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("outreach_leads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("business_id", biz.id),
    supabase
      .from("outreach_leads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("business_id", biz.id)
      .in("status", ["new", "pitched", "approved", "freebie_ready"])
      .is("outreach_pipeline_outreached_at", null)
      .is("sent_at", null)
      .not("lead_name", "is", null),
    supabase
      .from("outreach_leads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("business_id", biz.id)
      .eq("sent_via", "aio_pipeline_local_outbox_pending"),
    supabase
      .from("outreach_leads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("business_id", biz.id)
      .eq("status", "sent"),
    supabase
      .from("outreach_leads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("business_id", biz.id)
      .eq("status", "pending_whatsapp"),
    supabase
      .from("outreach_pipeline_events")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("business_id", biz.id)
      .eq("event_type", "error")
      .is("nav_node_id", null)
      .gte("created_at", since24h),
  ]);

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>Outreach Pipeline - {biz.name}</h1>
        <span className="sub">
          Silent loop naast cron jobs. Duplicate-safe via local Supabase.
        </span>
      </div>

      <OutreachPipelineModule
        workspaceSlug={workspace.slug}
        businessSlug={biz.slug}
        workspaceId={workspace.id}
        businessId={biz.id}
        navNodeId={null}
        scopeName={biz.name}
        scopeKind="business"
        config={(config as Parameters<typeof OutreachPipelineModule>[0]["config"]) ?? null}
        stats={{
          total: total ?? 0,
          eligible: eligible ?? 0,
          moduleOutreached: moduleOutreached ?? 0,
          sent: sent ?? 0,
          pendingWhatsapp: pendingWhatsapp ?? 0,
          failedQa24h: failedQa24h ?? 0,
        }}
        recentRuns={(recentRuns ?? []) as Parameters<
          typeof OutreachPipelineModule
        >[0]["recentRuns"]}
        recentEvents={(recentEvents ?? []) as Parameters<
          typeof OutreachPipelineModule
        >[0]["recentEvents"]}
        agents={scopedAgents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          provider: agent.provider,
          model: agent.model,
          kind: agent.kind,
        }))}
      />
    </div>
  );
}
