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
      "id, workspace_id, business_id, parent_id, name, sub, letter, variant, icon, color_hex, logo_url, href, sort_order",
    )
    .eq("workspace_id", workspace.id)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  const navNodes = (navRows ?? []) as NavNode[];

  // Per-business notification counts → power the small numeric
  // badges on each business chip in the rail. Same data the bell
  // groups by; we just bucket it server-side here so the rail
  // doesn't need its own subscription.
  const [{ data: openQueue }, { data: failedRuns }] = await Promise.all([
    supabase
      .from("queue_items")
      .select("business_id")
      .eq("workspace_id", workspace.id)
      .in("state", ["review", "fail"])
      .is("resolved_at", null),
    supabase
      .from("runs")
      .select("business_id")
      .eq("workspace_id", workspace.id)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const notifCounts: Record<string, number> = {};
  for (const r of (openQueue ?? []) as { business_id: string | null }[]) {
    if (r.business_id)
      notifCounts[r.business_id] = (notifCounts[r.business_id] ?? 0) + 1;
  }
  for (const r of (failedRuns ?? []) as { business_id: string | null }[]) {
    if (r.business_id)
      notifCounts[r.business_id] = (notifCounts[r.business_id] ?? 0) + 1;
  }
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
        avatarUrl:
          (profile as { avatar_url?: string | null }).avatar_url ?? null,
      }}
      workspace={{
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
      }}
      workspaces={workspaces}
      businesses={businesses}
      navNodes={navNodes}
      agents={agents.map((a) => ({
        id: a.id,
        name: a.name,
        business_id: a.business_id,
        provider: a.provider,
        model: a.model ?? null,
      }))}
      notifCounts={notifCounts}
      weather={weather}
      locale={locale}
      chatPanelAgents={agents}
      firstBusinessId={businesses[0]?.id}
    >
      {children}
    </WorkspaceShell>
  );
}
