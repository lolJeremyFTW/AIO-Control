// Agent list for a single business — phase 5 surfaces the agents the user
// can chat with through ChatPanel and (in fase 6) attach schedules to.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../../lib/auth/workspace";
import { resolveApiKey } from "../../../../../lib/api-keys/resolve";
import { getDict } from "../../../../../lib/i18n/server";
import { listAgentsForWorkspace } from "../../../../../lib/queries/agents";
import { listBusinesses } from "../../../../../lib/queries/businesses";
import { listFlatNavNodes } from "../../../../../lib/queries/nav-nodes";
import { AgentsList } from "../../../../../components/AgentsList";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

type Props = {
  params: Promise<{ workspace_slug: string; bizId: string }>;
};

export default async function BusinessAgentsPage({ params }: Props) {
  const { workspace_slug, bizId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const [
    businesses,
    allAgents,
    navOptions,
    { data: telegramRows },
    { data: customRows },
    { data: wsDefaults },
  ] = await Promise.all([
    listBusinesses(workspace.id),
    listAgentsForWorkspace(workspace.id),
    listFlatNavNodes(bizId),
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
  const biz = businesses.find((b) => b.id === bizId);
  if (!biz) notFound();
  const agents = allAgents.filter((a) => a.business_id === bizId);

  // Resolve key status per provider used by this business's agents so
  // each card can render a "key set / missing" pill. We dedupe so we
  // only check each provider once per page render.
  const uniqueProviders = Array.from(new Set(agents.map((a) => a.provider)));
  const providerKeyStatus: Record<string, boolean> = {};
  await Promise.all(
    uniqueProviders.map(async (p) => {
      const k = await resolveApiKey(p, {
        workspaceId: workspace.id,
        businessId: biz.id,
      });
      providerKeyStatus[p] = !!k;
    }),
  );

  const { t } = await getDict();

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{t("page.business.agents.h1", { business: biz.name })}</h1>
        <span className="sub">{t("page.business.agents.sub")}</span>
      </div>
      <AgentsList
        workspaceSlug={workspace.slug}
        workspaceId={workspace.id}
        businessId={biz.id}
        agents={agents}
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
        navOptions={navOptions}
      />
    </div>
  );
}
