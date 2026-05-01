// CRUD for the integrations table. Phase 7-ish: we ship list + create +
// delete. The OAuth handshake to actually populate credentials_encrypted
// is per-provider work (YouTube, Etsy, Stripe each have their own flow);
// for now the user labels an integration and pastes a token in via
// per-business agent_secrets later.

"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "../../lib/supabase/server";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type IntegrationProvider =
  | "youtube_data"
  | "etsy"
  | "drive"
  | "stripe"
  | "shopify"
  | "openai"
  | "anthropic"
  | "openrouter"
  | "minimax"
  | "custom_mcp";

export async function createIntegration(input: {
  workspace_slug: string;
  workspace_id: string;
  business_id?: string;
  provider: IntegrationProvider;
  name: string;
}): Promise<ActionResult<{ id: string }>> {
  if (!input.name.trim()) return { ok: false, error: "Naam is verplicht." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("integrations")
    .insert({
      workspace_id: input.workspace_id,
      business_id: input.business_id ?? null,
      provider: input.provider,
      name: input.name.trim(),
      status: "disconnected",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert failed" };
  revalidatePath(`/${input.workspace_slug}/business/${input.business_id ?? ""}/integrations`);
  return { ok: true, data: { id: data.id } };
}

export async function deleteIntegration(input: {
  workspace_slug: string;
  business_id?: string;
  id: string;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("integrations").delete().eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}/business/${input.business_id ?? ""}/integrations`);
  return { ok: true, data: null };
}
