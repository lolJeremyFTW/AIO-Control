// Workspace-global agents — agents with business_id IS NULL.
// These live "above" individual businesses: typically the AIO
// Assistant + any utility agents (research, multi-business
// orchestrators, OpenClaw / Hermes operator agents).
//
// Lives at /[workspace_slug]/agents. Per-business agents stay at
// /[workspace_slug]/business/[bizId]/agents.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { resolveApiKey } from "../../../lib/api-keys/resolve";
import { listAgentsForWorkspace } from "../../../lib/queries/agents";
import { AgentsList } from "../../../components/AgentsList";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function WorkspaceAgentsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const [
    globalAgents,
    { data: telegramRows },
    { data: customRows },
    { data: wsDefaults },
  ] = await Promise.all([
    listAgentsForWorkspace(workspace.id, "global"),
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
  ]);

  // Resolve key status per provider used by the global agents so each
  // card can show "key set / missing". Same dedupe trick as the
  // per-business page.
  const uniqueProviders = Array.from(
    new Set(globalAgents.map((a) => a.provider)),
  );
  const providerKeyStatus: Record<string, boolean> = {};
  await Promise.all(
    uniqueProviders.map(async (p) => {
      const k = await resolveApiKey(p, { workspaceId: workspace.id });
      providerKeyStatus[p] = !!k;
    }),
  );

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>Workspace agents</h1>
        <span className="sub">
          Niet aan een specifieke business gekoppeld. Beschikbaar vanuit
          chat en als hop in agent-chains over de hele workspace.
        </span>
      </div>
      <AgentsList
        workspaceSlug={workspace.slug}
        workspaceId={workspace.id}
        businessId={null}
        agents={globalAgents}
        providerKeyStatus={providerKeyStatus}
        telegramTargets={(telegramRows ?? []) as { id: string; name: string }[]}
        customIntegrations={
          (customRows ?? []) as { id: string; name: string }[]
        }
        workspaceDefaults={{
          provider: (wsDefaults?.default_provider as string | null) ?? null,
          model: (wsDefaults?.default_model as string | null) ?? null,
          systemPrompt:
            (wsDefaults?.default_system_prompt as string | null) ?? null,
        }}
      />
    </div>
  );
}
