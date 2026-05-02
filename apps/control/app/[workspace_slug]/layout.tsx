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
import { createSupabaseServerClient } from "../../lib/supabase/server";
import type { NavNode } from "../../lib/queries/nav-nodes";
import { getDict } from "../../lib/i18n/server";
import { translate, type Locale } from "../../lib/i18n/dict";
import { getWeather } from "../../lib/weather/open-meteo";
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

  const [profile, workspaces, businesses, agents, weather, dict] =
    await Promise.all([
      getProfile(user.id),
      getUserWorkspaces(),
      listBusinesses(workspace.id),
      listAgentsForWorkspace(workspace.id),
      getWeather(workspace.id),
      getDict(),
    ]);
  // Fetch every nav_node in the workspace in one go so the rail can
  // build the multi-layer tree client-side without N+1 round-trips.
  // (Cheap: <100 rows for any sane workspace.)
  const supabase = await createSupabaseServerClient();
  const { data: navRows } = await supabase
    .from("nav_nodes")
    .select(
      "id, workspace_id, business_id, parent_id, name, sub, letter, variant, icon, href, sort_order",
    )
    .eq("workspace_id", workspace.id)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  const navNodes = (navRows ?? []) as NavNode[];
  // We pass the locale string (serializable) to the client. The client
  // imports the same dict module and calls translate() locally. Functions
  // can't cross the RSC boundary unless they're Server Actions.
  const locale: Locale = dict.locale;
  // `translate` is referenced here only to silence the unused-import
  // warning when this layout doesn't render any t() calls itself.
  void translate;

  if (!profile) redirect("/login");

  return (
    <WorkspaceShell
      profile={{
        letter: profile.avatar_letter ?? "U",
        variant: profile.avatar_variant ?? "orange",
        displayName: profile.display_name,
        email: profile.email ?? user.email ?? undefined,
      }}
      workspace={{
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
      }}
      workspaces={workspaces}
      businesses={businesses}
      navNodes={navNodes}
      weather={weather}
      locale={locale}
    >
      {children}
      <ChatPanel
        agents={agents}
        workspaceSlug={workspace.slug}
        firstBusinessId={businesses[0]?.id}
      />
      <RunsToaster workspaceId={workspace.id} />
    </WorkspaceShell>
  );
}
