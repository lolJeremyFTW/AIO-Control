// Server actions for tiered API keys. The encryption master key
// (AGENT_SECRET_KEY) lives only on the server — it never crosses the
// wire. The DB stores ciphertext + RLS hides it from non-service-role.
//
// All three actions call SECURITY DEFINER Postgres functions so the
// encryption / decryption happens inside the DB process and never as
// plaintext in our app logs.

"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "../../lib/supabase/server";

export type ApiKeyScope = "workspace" | "business" | "navnode";

export type ApiKeyMetadata = {
  id: string;
  workspace_id: string;
  scope: ApiKeyScope;
  scope_id: string;
  provider: string;
  label: string | null;
  has_value: boolean;
  created_at: string;
  updated_at: string;
};

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function listApiKeys(
  workspaceId: string,
): Promise<ApiKeyMetadata[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("api_keys_metadata")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listApiKeys failed", error);
    return [];
  }
  return (data ?? []) as ApiKeyMetadata[];
}

export async function setApiKey(input: {
  workspace_slug: string;
  workspace_id: string;
  scope: ApiKeyScope;
  scope_id: string;
  provider: string;
  value: string;
  label?: string;
}): Promise<ActionResult<{ id: string }>> {
  if (!input.value.trim()) {
    return { ok: false, error: "Key mag niet leeg zijn." };
  }
  const masterKey = process.env.AGENT_SECRET_KEY;
  if (!masterKey) {
    return {
      ok: false,
      error: "AGENT_SECRET_KEY niet geconfigureerd op server.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_api_key", {
    _workspace_id: input.workspace_id,
    _scope: input.scope,
    _scope_id: input.scope_id,
    _provider: input.provider,
    _value: input.value.trim(),
    _label: input.label ?? null,
    _master_key: masterKey,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/${input.workspace_slug}/settings`);
  return { ok: true, data: { id: data as string } };
}

export async function deleteApiKey(input: {
  workspace_slug: string;
  id: string;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_api_key", { _id: input.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}/settings`);
  return { ok: true, data: null };
}
