// Public catalog of preset agents. RLS allows reads from anyone signed
// in (and anon, but the page is auth-gated so that doesn't matter).

import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

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
};

export async function listMarketplace(): Promise<MarketplaceAgent[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("marketplace_agents")
    .select(
      "id, slug, name, tagline, description, provider, model, kind, config, category, official, install_count",
    )
    .order("official", { ascending: false })
    .order("install_count", { ascending: false });
  if (error) {
    console.error("listMarketplace failed", error);
    return [];
  }
  return (data ?? []) as MarketplaceAgent[];
}
