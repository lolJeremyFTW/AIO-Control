// Protected workspace shell — rail + header + chat-panel placeholder.
// Pulls real businesses + workspaces + profile and hands them to the
// client-side WorkspaceShell, which manages the rail + header callbacks.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getProfile,
  getUserWorkspaces,
  getWorkspaceBySlug,
} from "../../lib/auth/workspace";
import { listAgentsForWorkspace } from "../../lib/queries/agents";
import { listBusinesses } from "../../lib/queries/businesses";
import { ChatPanel } from "../../components/ChatPanel";
import { RunsToaster } from "../../components/RunsToaster";
import { WorkspaceShell } from "../../components/WorkspaceShell";

type Props = {
  children: React.ReactNode;
  params: Promise<{ workspace_slug: string }>;
};

export default async function WorkspaceLayout({ children, params }: Props) {
  const { workspace_slug } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const [profile, workspaces, businesses, agents] = await Promise.all([
    getProfile(user.id),
    getUserWorkspaces(),
    listBusinesses(workspace.id),
    listAgentsForWorkspace(workspace.id),
  ]);

  if (!profile) redirect("/login");

  return (
    <WorkspaceShell
      profile={{
        letter: profile.avatar_letter ?? "U",
        variant: profile.avatar_variant ?? "orange",
        displayName: profile.display_name,
      }}
      workspace={{
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
      }}
      workspaces={workspaces}
      businesses={businesses}
    >
      {children}
      <ChatPanel agents={agents} />
      <RunsToaster workspaceId={workspace.id} />
    </WorkspaceShell>
  );
}
