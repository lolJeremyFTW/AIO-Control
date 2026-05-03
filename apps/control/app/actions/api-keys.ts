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
import {
  CUSTOM_KEY_NAME_RE,
  type ApiKeyKind,
  type ApiKeyMetadata,
  type ApiKeyScope,
} from "../../lib/api-keys/consts";

// Note: types and constants live in lib/api-keys/consts.ts. Next's
// "use server" boundary forbids non-async-function exports, including
// `export type` re-exports — so call-sites must import types directly
// from "../lib/api-keys/consts".

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
  /** 'provider' for canonical keys, 'custom' for user-defined secrets.
   *  Custom keys must use UPPERCASE A-Z0-9_ for the provider name so
   *  they read like env-var conventions (AIRTABLE_API_KEY etc.). */
  kind?: ApiKeyKind;
}): Promise<ActionResult<{ id: string }>> {
  if (!input.value.trim()) {
    return { ok: false, error: "Key mag niet leeg zijn." };
  }
  const kind: ApiKeyKind = input.kind ?? "provider";
  if (kind === "custom" && !CUSTOM_KEY_NAME_RE.test(input.provider)) {
    return {
      ok: false,
      error:
        "Custom secret-naam mag alleen UPPERCASE letters, cijfers en underscore bevatten en moet met een letter beginnen (bv. AIRTABLE_API_KEY).",
    };
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

  // The set_api_key RPC predates the kind column; stamp it post-hoc on
  // the row we just upserted. RLS allows editor+ writes.
  const id = data as string;
  if (kind === "custom") {
    const { error: kindErr } = await supabase
      .from("api_keys")
      .update({ kind })
      .eq("id", id);
    if (kindErr) {
      // Non-fatal — the key is saved, just lacks the discriminator.
      // The panel will show it under "Provider keys" until next save.
      console.error("set kind=custom failed", kindErr);
    }
  }

  revalidatePath(`/${input.workspace_slug}/settings`);
  revalidatePath(`/${input.workspace_slug}/settings/api-keys`);
  return { ok: true, data: { id } };
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
