// Workspace-wide HITL queue. Same QueueGrid the dashboard uses, but
// shows resolved items too via a status filter and pages over the
// full archive instead of the top-12 dashboard slice.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { getDict } from "../../../lib/i18n/server";
import { listBusinesses } from "../../../lib/queries/businesses";
import { QueuePage } from "../../../components/QueuePage";

type Props = {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<{
    state?: string;
    business?: string;
    show?: "open" | "all";
  }>;
};

export default async function WorkspaceQueuePage({ params, searchParams }: Props) {
  const { workspace_slug } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const businesses = await listBusinesses(workspace.id);
  const { t } = await getDict();

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{t("page.queue")}</h1>
        <span className="sub">{t("page.queue.sub")}</span>
      </div>
      <QueuePage
        workspaceSlug={workspace_slug}
        workspaceId={workspace.id}
        businesses={businesses}
        stateFilter={sp.state ?? null}
        businessFilter={sp.business ?? null}
        showResolved={sp.show === "all"}
      />
    </div>
  );
}
