import { notFound, redirect } from "next/navigation";

import { getCurrentUser, getUserWorkspaces } from "../../../lib/auth/workspace";

export const dynamic = "force-dynamic";

export default async function MarketplaceAdminRedirectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspaces = await getUserWorkspaces();
  if (workspaces.length === 0) notFound();

  const defaultWorkspaceId = process.env.AIO_WORKSPACE_ID;
  const workspace = workspaces.find((item) => item.id === defaultWorkspaceId);
  const workspaceSlug = workspace?.slug ?? workspaces[0]!.slug;

  redirect(`/${workspaceSlug}/admin/marketplace`);
}
