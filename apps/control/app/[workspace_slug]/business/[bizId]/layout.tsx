// Business-scoped layout. Wraps EVERY page under
//   /[workspace_slug]/business/[bizId]/...
// including sub-tabs (agents/schedules/integrations/runs) AND the
// nav-node drill catch-all (/n/...).
//
// We resolve the business + workspace once here so the BusinessTabs
// strip knows the routines count + last-run status without each
// sub-page having to re-query.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { listBusinesses } from "../../../../lib/queries/businesses";

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

  return <>{children}</>;
}
