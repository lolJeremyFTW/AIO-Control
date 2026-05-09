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
import { listSkillsForWorkspace } from "../../../../../lib/queries/skills";
import { getServiceRoleSupabase } from "../../../../../lib/supabase/service";
import { OutreachPipelineModule } from "../../../../../components/OutreachPipelineModule";

type Props = {
  params: Promise<{ workspace_slug: string; bizId: string }>;
};

export const dynamic = "force-dynamic";

export default async function BusinessPipelinesPage({ params }: Props) {
  const { workspace_slug, bizId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const [businesses, agents, skills] = await Promise.all([
    listBusinesses(workspace.id),
    listAgentsForWorkspace(workspace.id),
    listSkillsForWorkspace(workspace.id),
  ]);
  const biz = findBusiness(businesses, bizId);
  if (!biz) notFound();
  const scopedAgents = agents.filter(
    (agent) => agent.business_id === biz.id || agent.business_id === null,
  );

  const supabase = getServiceRoleSupabase();

  const [
    { data: config },
    { data: recentRuns },
    { data: recentEvents },
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
  ]);

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>Pipelines - {biz.name}</h1>
        <span className="sub">
          Custom pipelines per business. Outreach-specifieke metrics zie je op
          de Outreach-tab.
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
          mcp_servers: Array.isArray(agent.config?.mcpServers)
            ? agent.config.mcpServers.filter(
                (item): item is string => typeof item === "string",
              )
            : [],
          skill_ids: agent.allowed_skills ?? [],
        }))}
        skills={skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
        }))}
      />
    </div>
  );
}
