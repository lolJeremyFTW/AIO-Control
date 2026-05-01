// Business detail dashboard — same layout as the workspace dashboard but
// scoped to one business. Phase 2 ships the read view; agents+queue mutation
// drawers land in fase 2.5.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import {
  listBusinesses,
  listOpenQueueItems,
} from "../../../../lib/queries/businesses";
import { QueueGrid } from "../../../../components/QueueGrid";

type Props = {
  params: Promise<{ workspace_slug: string; bizId: string }>;
};

export default async function BusinessPage({ params }: Props) {
  const { workspace_slug, bizId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const [businesses, queue] = await Promise.all([
    listBusinesses(workspace.id),
    listOpenQueueItems(workspace.id, bizId, 20),
  ]);
  const biz = businesses.find((b) => b.id === bizId);
  if (!biz) notFound();

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{biz.name} — wachtrij</h1>
        <span className="sub">{biz.sub ?? "Auto + Review (HITL)"}</span>
      </div>
      {queue.length === 0 ? (
        <div className="empty-state">
          <h2>Nog geen items</h2>
          <p>
            Voeg agents toe aan {biz.name} of trigger een run om hier items
            te zien verschijnen.
          </p>
        </div>
      ) : (
        <QueueGrid items={queue} />
      )}
    </div>
  );
}
