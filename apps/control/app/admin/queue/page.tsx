import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getUserWorkspaces,
} from "../../../lib/auth/workspace";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    state?: string;
    business?: string;
    show?: "open" | "all";
  }>;
};

export default async function AdminQueueRedirectPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspaces = await getUserWorkspaces();
  if (workspaces.length === 0) notFound();

  const defaultWorkspaceId = process.env.AIO_WORKSPACE_ID;
  const workspace = workspaces.find((item) => item.id === defaultWorkspaceId);
  const workspaceSlug = workspace?.slug ?? workspaces[0]!.slug;

  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.state) params.set("state", sp.state);
  if (sp.business) params.set("business", sp.business);
  if (sp.show) params.set("show", sp.show);

  const query = params.toString();
  redirect(`/${workspaceSlug}/queue${query ? `?${query}` : ""}`);
}
