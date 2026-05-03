// Public catalog. RLS allows reads from anyone signed in. The catalog is
// hand-seeded by service_role inserts (see migrations 010 + 013) — no
// external feed for now.

import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

export type MarketplaceKind = "agent" | "skill" | "plugin" | "mcp_server";

export type MarketplaceAgent = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string | null;
  provider: string;
  model: string | null;
  kind: string;
  config: Record<string, unknown>;
  category: string | null;
  official: boolean;
  install_count: number;
  marketplace_kind: MarketplaceKind;
  source_url: string | null;
  source_provider: string | null;
};

export async function listMarketplace(): Promise<MarketplaceAgent[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("marketplace_agents")
    .select(
      "id, slug, name, tagline, description, provider, model, kind, config, category, official, install_count, marketplace_kind, source_url, source_provider",
    )
    .order("official", { ascending: false })
    .order("install_count", { ascending: false });
  if (error) {
    console.error("listMarketplace failed", error);
    return [];
  }
  return (data ?? []) as MarketplaceAgent[];
}
