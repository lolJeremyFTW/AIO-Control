// Business-scoped layout. Wraps EVERY page under
//   /[workspace_slug]/business/[bizId]/...
// including sub-tabs (agents/schedules/integrations/runs) AND the
// nav-node drill catch-all (/n/...).
//
// We resolve the business + workspace once here and render the
// shared tabs strip so sub-routes don't have to re-fetch identity
// on every navigation. Children render below the tabs.
//
// Note: the workspace shell + rail live one layout up
// (in /[workspace_slug]/layout.tsx) — this layout only owns the
// business-page chrome.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { listBusinesses } from "../../../../lib/queries/businesses";
import { BusinessTabs } from "../../../../components/BusinessTabs";

type Props = {
  children: React.ReactNode;
  params: Promise<{ workspace_slug: string; bizId: string }>;
};

export default async function BusinessLayout({ children, params }: Props) {
  const { workspace_slug, bizId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const businesses = await listBusinesses(workspace.id);
  const biz = businesses.find((b) => b.id === bizId);
  if (!biz) notFound();

  return (
    <>
      <BusinessTabs workspaceSlug={workspace_slug} businessId={bizId} />
      {children}
    </>
  );
}
