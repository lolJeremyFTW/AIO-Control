// Admin importer for the marketplace catalog. Lists registered
// catalog sources (MCP / agents / skills) and lets the workspace
// owner pull items from each one with a single click. Also shows the
// currently-imported items grouped by source_provider so it's clear
// what came from where.

import { redirect } from "next/navigation";

import { getCurrentUser } from "../../../lib/auth/workspace";
import { MarketplaceAdmin } from "../../../components/MarketplaceAdmin";
import { SOURCES } from "../../../lib/marketplace/importers";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MarketplaceAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createSupabaseServerClient();
  // Membership check — only owners/admins of any workspace can
  // access this page.
  const { data: roles } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .limit(1);
  if (!roles || roles.length === 0) {
    redirect("/login");
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
        items={(items ??
          []) as Parameters<typeof MarketplaceAdmin>[0]["items"]}
      />
    </div>
  );
}
