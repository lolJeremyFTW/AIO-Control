// Business-scoped layout. Wraps EVERY page under
//   /[workspace_slug]/business/[bizId]/...
// including sub-tabs (agents/schedules/runs) AND the
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
import { listBusinesses, findBusiness } from "../../../../lib/queries/businesses";
import { listNavNodes } from "../../../../lib/queries/nav-nodes";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
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
  const biz = findBusiness(businesses, bizId);
  if (!biz) notFound();

  // Pull the two pieces of context BusinessTabs needs in parallel.
  // Both are RLS-gated so we don't have to re-check membership.
  // Use biz.id (UUID) for all queries — bizId param may now be a slug.
  const supabase = await createSupabaseServerClient();
  const [{ count: routinesCount }, { data: lastRunRow }, { data: customTabRows }, rootNavNodes, dict] =
    await Promise.all([
      supabase
        .from("schedules")
        .select("id", { count: "exact", head: true })
        .eq("business_id", biz.id)
        .in("kind", ["cron", "webhook"])
        .eq("enabled", true),
      supabase
        .from("runs")
        .select("status, ended_at, started_at, created_at")
        .eq("business_id", biz.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("custom_tabs")
        .select("id, label, url")
        .eq("business_id", biz.id)
        .order("sort_order", { ascending: true }),
      listNavNodes(biz.id, null),
      getDict(),
    ]);

  type RunRow = {
    status: string;
    ended_at: string | null;
    started_at: string | null;
    created_at: string;
  };
  const last = lastRunRow as RunRow | null;
  const lastRun = last
    ? {
        at: last.ended_at ?? last.started_at ?? last.created_at,
        status: last.status as
          | "queued"
          | "running"
          | "done"
          | "failed"
          | "review",
      }
    : null;

  const { t } = dict;

  const customTabEntries = (customTabRows ?? []).map((tab) => ({
    id: tab.id as string,
    href: `/tab/${tab.id}`,
    label: tab.label as string,
  }));

  const navNodeTabEntries = rootNavNodes.map((n) => ({
    slug: n.slug,
    label: n.name,
  }));

  return (
    <>
      <BusinessTabs
        workspaceSlug={workspace_slug}
        businessId={biz.slug}
        workspaceId={workspace.id}
        routinesCount={routinesCount ?? 0}
        lastRun={lastRun}
        navNodeTabs={navNodeTabEntries}
        topicTabs={customTabEntries}
        labels={{
          overview: t("biztabs.overview"),
          agents: t("biztabs.agents"),
          routines: t("biztabs.routines"),
          runs: t("biztabs.runs"),
          lastRun: t("biztabs.lastRun"),
          relNow: t("rel.now"),
          relMin: t("rel.m"),
          relHr: t("rel.h"),
          relDay: t("rel.d"),
        }}
      />
      {children}
    </>
  );
}
