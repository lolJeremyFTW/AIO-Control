import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../../../lib/auth/workspace";
import {
  listBusinesses,
  findBusiness,
} from "../../../../../../lib/queries/businesses";
import { normalizeDashboardUrl } from "../../../../../../lib/dashboards/urls";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

type Props = {
  params: Promise<{ workspace_slug: string; bizId: string; tabId: string }>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function iframeSandboxFor(url: string): string | undefined {
  try {
    const parsed = new URL(url, "https://aio.local");
    if (!parsed.pathname.startsWith("/d/")) return undefined;
  } catch {
    if (!url.startsWith("/d/")) return undefined;
  }
  return "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox";
}

export default async function CustomTabPage({ params }: Props) {
  const { workspace_slug, bizId, tabId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const businesses = await listBusinesses(workspace.id);
  const biz = findBusiness(businesses, bizId);
  if (!biz) notFound();

  const supabase = await createSupabaseServerClient();
  let tabQuery = supabase
    .from("custom_tabs")
    .select("id, slug, label, url")
    .eq("business_id", biz.id)
    .is("nav_node_id", null);
  tabQuery = UUID_RE.test(tabId)
    ? tabQuery.eq("id", tabId)
    : tabQuery.eq("slug", tabId);
  const { data } = await tabQuery.maybeSingle();

  if (!data) notFound();
  const canonicalSegment = (data.slug as string | null) || (data.id as string);
  if (tabId !== canonicalSegment) {
    redirect(`/${workspace.slug}/business/${biz.slug}/tab/${canonicalSegment}`);
  }
  const tabUrl = normalizeDashboardUrl(data.url as string);

  return (
    <iframe
      src={tabUrl}
      title={data.label}
      style={{
        width: "100%",
        height: "calc(100vh - 130px)",
        border: "none",
        borderRadius: 10,
      }}
      allow="fullscreen"
      sandbox={iframeSandboxFor(tabUrl)}
    />
  );
}
