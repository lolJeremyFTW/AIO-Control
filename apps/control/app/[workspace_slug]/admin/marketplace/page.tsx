// Admin importer for the marketplace catalog. Lives under the workspace
// route so it keeps the dashboard shell, rail, header, and navigation.

import { redirect } from "next/navigation";

import { MarketplaceAdmin } from "../../../../components/MarketplaceAdmin";
import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { SOURCES } from "../../../../lib/marketplace/importers";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function MarketplaceAdminPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) redirect("/login");

  const supabase = await createSupabaseServerClient();
  const { data: roles } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", workspace.id)
    .in("role", ["owner", "admin"])
    .limit(1);
  if (!roles || roles.length === 0) {
    redirect(`/${workspace.slug}/marketplace`);
  }

  const { data: items } = await supabase
    .from("marketplace_agents")
    .select(
      "id, slug, name, tagline, marketplace_kind, source_url, source_provider, official, install_count, share_count, imported_at",
    )
    .order("imported_at", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true });

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>Marketplace admin</h1>
        <span className="sub">
          Import skills, MCP servers en agents van vertrouwde catalogi
        </span>
      </div>
      <MarketplaceAdmin
        sources={SOURCES.map((s) => ({
          id: s.id,
          label: s.label,
          description: s.description,
          url: s.url,
        }))}
        items={(items ?? []) as Parameters<typeof MarketplaceAdmin>[0]["items"]}
      />
    </div>
  );
}
