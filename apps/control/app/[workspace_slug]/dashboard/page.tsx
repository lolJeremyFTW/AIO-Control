// Workspace landing page. Phase 2: render queue cards from real DB rows.
// When the workspace has zero businesses we show a sketchy empty-state CTA
// instead of an empty grid.

import { PlusIcon } from "@aio/ui/icon";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { CreateFirstBusinessHint } from "../../../components/CreateFirstBusinessHint";
import { QueueGrid } from "../../../components/QueueGrid";
import {
  listBusinesses,
  listOpenQueueItems,
} from "../../../lib/queries/businesses";
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

  const [businesses, queue] = await Promise.all([
    listBusinesses(workspace.id),
    listOpenQueueItems(workspace.id, undefined, 12),
  ]);

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{workspace.name} — wachtrij</h1>
        <span className="sub">Auto + Review (HITL)</span>
      </div>

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
        <QueueGrid items={queue} />
      )}
    </div>
  );
}
