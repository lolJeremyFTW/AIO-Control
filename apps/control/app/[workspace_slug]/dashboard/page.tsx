// Workspace landing page. Phase 2: render queue cards from real DB rows.
// When the workspace has zero businesses we show a sketchy empty-state CTA
// instead of an empty grid.

import { PlusIcon } from "@aio/ui/icon";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
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
  const [businesses, queue, kpis, agents, { count: keyCount }] =
    await Promise.all([
      listBusinesses(workspace.id),
      listOpenQueueItems(workspace.id, undefined, 12),
      listKpisForWorkspace(workspace.id),
      listAgentsForWorkspace(workspace.id),
      supabase
        .from("api_keys_metadata")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id),
    ]);

  const summaries = summarizeKpis(
    kpis,
    businesses.map((b) => b.id),
  );

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{workspace.name} — overzicht</h1>
        <span className="sub">Marge per business · auto + HITL</span>
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
          <h2>Lege wachtrij ✓</h2>
          <p>
            Geen items te reviewen. Zodra een agent iets oppakt verschijnt
            het hier — auto-publish bij hoge confidence, anders HITL.
          </p>
          <button className="cta">
            <PlusIcon /> Nieuwe agent
          </button>
        </div>
      ) : (
        <QueueGrid items={queue} workspaceSlug={workspace.slug} />
      )}
    </div>
  );
}
