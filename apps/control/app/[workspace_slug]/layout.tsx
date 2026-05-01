// Protected workspace shell — rail + header + chat-panel placeholder.
// Phase 1: the rail uses real workspace + profile data, businesses array is
// still empty (phase 2 fills it).

import { notFound, redirect } from "next/navigation";

import { ChatIcon } from "@aio/ui/icon";

import {
  getCurrentUser,
  getProfile,
  getUserWorkspaces,
  getWorkspaceBySlug,
} from "../../lib/auth/workspace";
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

  const [profile, workspaces] = await Promise.all([
    getProfile(user.id),
    getUserWorkspaces(),
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
    >
      {children}
      <div className="chatbox" title="Chat met AI">
        <ChatIcon />
      </div>
    </WorkspaceShell>
  );
}
