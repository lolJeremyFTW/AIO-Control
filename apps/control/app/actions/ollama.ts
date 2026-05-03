// Server actions for the Ollama endpoint settings panel. The panel
// lets the user pick a host + port, click "Scan" to enumerate the
// models that endpoint exposes, and saves the result so every agent
// in the workspace can target it.
//
// Tenancy: writes go through the user-scoped client so RLS gates by
// workspace membership (owners + admins). Scans run server-side so
// the user's browser doesn't have to be on the same network as the
// Ollama box — all that matters is the AIO Control server can reach
// it (i.e. the VPS over Tailscale, or `localhost` if you run the
// server on the same machine as Ollama).

"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "../../lib/supabase/server";

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type OllamaModel = {
  name: string;
  size: number;
  modified_at: string;
  /** Family + parameter-count when Ollama returns it. Keeps the picker
   *  readable without us having to parse the model name string. */
  family?: string;
  parameter_size?: string;
};

async function requireWorkspaceMember(
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
  if (!member) return { ok: false, error: "Alleen workspace owners/admins." };
  return { ok: true, data: { userId: user.id } };
}

/**
 * Persist the host + port for the workspace. Empty/null host clears
 * the override so agents fall back to the OLLAMA_BASE_URL env-var.
 */
export async function saveOllamaEndpoint(input: {
  workspace_id: string;
  workspace_slug: string;
  host: string | null;
  port: number | null;
}): Promise<Result<null>> {
  const auth = await requireWorkspaceMember(input.workspace_id);
  if (!auth.ok) return auth;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("workspaces")
    .update({
      ollama_host: input.host?.trim() || null,
      ollama_port: input.port ?? null,
    })
    .eq("id", input.workspace_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/${input.workspace_slug}/settings`);
  revalidatePath(`/${input.workspace_slug}/settings/talk`);
  return { ok: true, data: null };
}

/**
 * Fetch the model list from the configured (or supplied) endpoint and
 * cache it on the workspace so the picker doesn't have to round-trip
 * every time. We accept an optional override host/port so the user
 * can hit "Scan" before saving — preview the result, THEN save.
 */
export async function scanOllamaModels(input: {
  workspace_id: string;
  workspace_slug: string;
  /** Optional override; when omitted we read from the workspace row. */
  host?: string | null;
  port?: number | null;
}): Promise<Result<{ models: OllamaModel[]; endpoint: string }>> {
  const auth = await requireWorkspaceMember(input.workspace_id);
  if (!auth.ok) return auth;

  const supabase = await createSupabaseServerClient();

  let host = input.host ?? null;
  let port = input.port ?? null;
  if (!host) {
    const { data } = await supabase
      .from("workspaces")
      .select("ollama_host, ollama_port")
      .eq("id", input.workspace_id)
      .maybeSingle();
    host = (data?.ollama_host as string | null) ?? null;
    port = (data?.ollama_port as number | null) ?? null;
  }
  // Last-resort fallback so a brand-new workspace can scan localhost
  // without saving first.
  if (!host) host = process.env.OLLAMA_BASE_URL ? null : "localhost";
  const endpoint = host
    ? `http://${host}:${port ?? 11434}`
    : (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434");

  let models: OllamaModel[] = [];
  try {
    // Tight timeout — local LAN should answer in < 200ms. We don't
    // want the panel to hang for a minute when the host is wrong.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`${endpoint}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) {
      return {
        ok: false,
        error: `Ollama antwoordde met ${r.status} ${r.statusText}.`,
      };
    }
    const json = (await r.json()) as {
      models?: Array<{
        name: string;
        size: number;
        modified_at: string;
        details?: { family?: string; parameter_size?: string };
      }>;
    };
    models = (json.models ?? []).map((m) => ({
      name: m.name,
      size: m.size,
      modified_at: m.modified_at,
      family: m.details?.family,
      parameter_size: m.details?.parameter_size,
    }));
  } catch (err) {
    return {
      ok: false,
      error: `Geen verbinding met ${endpoint}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  // Cache the result + the timestamp so the picker can render straight
  // from the workspace row without scanning every page-load.
  await supabase
    .from("workspaces")
    .update({
      ollama_models_cached: models,
      ollama_last_scan_at: new Date().toISOString(),
    })
    .eq("id", input.workspace_id);

  revalidatePath(`/${input.workspace_slug}/settings`);
  revalidatePath(`/${input.workspace_slug}/settings/talk`);
  return { ok: true, data: { models, endpoint } };
}
