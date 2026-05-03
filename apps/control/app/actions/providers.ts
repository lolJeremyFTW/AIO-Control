// Server actions for the /settings/providers onboarding cards.
//
// Each provider gets a "Save endpoint" + "Test connection" pair. The
// test pings a known-cheap endpoint on the provider and either returns
// success (with a friendly message + saves the timestamp) or surfaces
// the network/HTTP error.

"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "../../lib/supabase/server";

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireAdmin(
  workspaceId: string,
): Promise<Result<{ userId: string }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Niet ingelogd." };

  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();
  if (!member)
    return { ok: false, error: "Alleen workspace owners/admins." };
  return { ok: true, data: { userId: user.id } };
}

/** Save the Hermes endpoint (clears it when value is empty/null). */
export async function saveHermesEndpoint(input: {
  workspace_id: string;
  workspace_slug: string;
  endpoint: string | null;
}): Promise<Result<null>> {
  const auth = await requireAdmin(input.workspace_id);
  if (!auth.ok) return auth;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("workspaces")
    .update({ hermes_endpoint: input.endpoint?.trim() || null })
    .eq("id", input.workspace_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}/settings/providers`);
  return { ok: true, data: null };
}

/** Ping Hermes /healthz (or root) and verify it responds. On success
 *  we stamp `hermes_last_test_at` so the panel can show the success
 *  state across reloads. */
export async function testHermesEndpoint(input: {
  workspace_id: string;
  workspace_slug: string;
  endpoint?: string | null;
}): Promise<Result<{ url: string; latencyMs: number }>> {
  const auth = await requireAdmin(input.workspace_id);
  if (!auth.ok) return auth;

  const supabase = await createSupabaseServerClient();
  let endpoint = input.endpoint?.trim() ?? null;
  if (!endpoint) {
    const { data } = await supabase
      .from("workspaces")
      .select("hermes_endpoint")
      .eq("id", input.workspace_id)
      .maybeSingle();
    endpoint = (data?.hermes_endpoint as string | null) ?? null;
  }
  if (!endpoint)
    return { ok: false, error: "Geen endpoint ingesteld of meegegeven." };

  const url = endpoint.replace(/\/+$/, "");
  const probe = `${url}/healthz`;

  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(probe, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok)
      return {
        ok: false,
        error: `Hermes antwoordde met ${r.status} ${r.statusText} op ${probe}.`,
      };
  } catch (err) {
    return {
      ok: false,
      error: `Geen verbinding met ${probe}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  await supabase
    .from("workspaces")
    .update({ hermes_last_test_at: new Date().toISOString() })
    .eq("id", input.workspace_id);

  revalidatePath(`/${input.workspace_slug}/settings/providers`);
  return { ok: true, data: { url, latencyMs: Date.now() - t0 } };
}

/** Save the OpenClaw endpoint. */
export async function saveOpenClawEndpoint(input: {
  workspace_id: string;
  workspace_slug: string;
  endpoint: string | null;
}): Promise<Result<null>> {
  const auth = await requireAdmin(input.workspace_id);
  if (!auth.ok) return auth;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("workspaces")
    .update({ openclaw_endpoint: input.endpoint?.trim() || null })
    .eq("id", input.workspace_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}/settings/providers`);
  return { ok: true, data: null };
}

/** Ping OpenClaw /healthz. Same pattern as testHermesEndpoint. */
export async function testOpenClawEndpoint(input: {
  workspace_id: string;
  workspace_slug: string;
  endpoint?: string | null;
}): Promise<Result<{ url: string; latencyMs: number }>> {
  const auth = await requireAdmin(input.workspace_id);
  if (!auth.ok) return auth;

  const supabase = await createSupabaseServerClient();
  let endpoint = input.endpoint?.trim() ?? null;
  if (!endpoint) {
    const { data } = await supabase
      .from("workspaces")
      .select("openclaw_endpoint")
      .eq("id", input.workspace_id)
      .maybeSingle();
    endpoint = (data?.openclaw_endpoint as string | null) ?? null;
  }
  if (!endpoint)
    return { ok: false, error: "Geen endpoint ingesteld of meegegeven." };

  const url = endpoint.replace(/\/+$/, "");
  const probe = `${url}/healthz`;

  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(probe, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok)
      return {
        ok: false,
        error: `OpenClaw antwoordde met ${r.status} ${r.statusText} op ${probe}.`,
      };
  } catch (err) {
    return {
      ok: false,
      error: `Geen verbinding met ${probe}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  await supabase
    .from("workspaces")
    .update({ openclaw_last_test_at: new Date().toISOString() })
    .eq("id", input.workspace_id);

  revalidatePath(`/${input.workspace_slug}/settings/providers`);
  return { ok: true, data: { url, latencyMs: Date.now() - t0 } };
}
