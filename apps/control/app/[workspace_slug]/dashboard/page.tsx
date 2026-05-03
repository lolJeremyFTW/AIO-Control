// Workspace landing page. Phase 2: render queue cards from real DB rows.
// When the workspace has zero businesses we show a sketchy empty-state CTA
// instead of an empty grid.

import { PlusIcon } from "@aio/ui/icon";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { getDict } from "../../../lib/i18n/server";
import { CreateFirstBusinessHint } from "../../../components/CreateFirstBusinessHint";
import { BusinessKpiGrid } from "../../../components/BusinessKpiGrid";
import { OnboardingWizard } from "../../../components/OnboardingWizard";
import { QueueGrid } from "../../../components/QueueGrid";
import { listAgentsForWorkspace } from "../../../lib/queries/agents";
import {
  listBusinesses,
  listKpisForWorkspace,
  listOpenQueueItems,
  summarizeKpis,
} from "../../../lib/queries/businesses";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ workspace_slug: string }>;
};

export default async function WorkspaceDashboardPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const [businesses, queue, kpis, agents, { count: keyCount }, { t }] =
    await Promise.all([
      listBusinesses(workspace.id),
      listOpenQueueItems(workspace.id, undefined, 12),
      listKpisForWorkspace(workspace.id),
      listAgentsForWorkspace(workspace.id),
      supabase
        .from("api_keys_metadata")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id),
      getDict(),
    ]);

  const summaries = summarizeKpis(
    kpis,
    businesses.map((b) => b.id),
  );

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{t("dashboard.title", { workspace: workspace.name })}</h1>
        <span className="sub">{t("dashboard.sub")}</span>
      </div>

      <OnboardingWizard
        workspaceSlug={workspace.slug}
        workspaceId={workspace.id}
        businesses={businesses}
        hasAnyApiKey={(keyCount ?? 0) > 0}
        agentCount={agents.length}
      />

      {businesses.length > 0 && (
        <BusinessKpiGrid
          workspaceSlug={workspace.slug}
          businesses={businesses}
          summaries={summaries}
        />
      )}

      {businesses.length === 0 ? (
        <CreateFirstBusinessHint
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
        />
      ) : queue.length === 0 ? (
        <div className="empty-state">
          <h2>{t("dashboard.queueEmpty.title")}</h2>
          <p>{t("dashboard.queueEmpty.body")}</p>
          <button className="cta">
            <PlusIcon /> {t("dashboard.queueEmpty.cta")}
          </button>
        </div>
      ) : (
        <QueueGrid items={queue} workspaceSlug={workspace.slug} />
      )}
    </div>
  );
}
