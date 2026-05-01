// Integrations server-side queries. RLS enforces workspace membership.

import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

export type IntegrationRow = {
  id: string;
  workspace_id: string;
  business_id: string | null;
  provider: string;
  name: string;
  status: "connected" | "disconnected" | "expired" | "error";
  last_refresh_at: string | null;
  created_at: string;
};

export async function listIntegrationsForBusiness(
  workspaceId: string,
  businessId: string,
): Promise<IntegrationRow[]> {
  const supabase = await createSupabaseServerClient();
  // We list both business-scoped and workspace-wide integrations; the UI
  // distinguishes via business_id === null.
  const { data, error } = await supabase
    .from("integrations")
    .select(
      "id, workspace_id, business_id, provider, name, status, last_refresh_at, created_at",
    )
    .eq("workspace_id", workspaceId)
    .or(`business_id.eq.${businessId},business_id.is.null`)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listIntegrationsForBusiness failed", error);
    return [];
  }
  return (data ?? []) as IntegrationRow[];
}
