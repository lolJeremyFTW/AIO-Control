// Server-side resolver for tiered API keys.
//
// Resolution order (most specific wins):
//   navnode (and ancestors) → business → workspace → env-var fallback
//
// Calls aio_control.resolve_api_key(...) RPC with the master encryption
// key (AGENT_SECRET_KEY). When the DB has no entry we fall back to the
// process env so existing single-tenant deploys keep working.

import "server-only";

import { getServiceRoleSupabase } from "../supabase/service";

export type ResolveContext = {
  workspaceId: string;
  businessId?: string | null;
  navNodeId?: string | null;
};

const ENV_FALLBACK: Record<string, string | undefined> = {
  anthropic: "ANTHROPIC_API_KEY",
  claude: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  minimax: "MINIMAX_API_KEY",
  minimax_mcp: "MINIMAX_API_KEY",
  openai: "OPENAI_API_KEY",
  codex: "OPENAI_API_KEY",
  ollama: "OLLAMA_API_KEY",
};

export async function resolveApiKey(
  provider: string,
  ctx: ResolveContext,
): Promise<string | null> {
  const masterKey = process.env.AGENT_SECRET_KEY;
  if (!masterKey) {
    console.error(
      "AGENT_SECRET_KEY not configured — falling back to env-var keys",
    );
    return envFallback(provider);
  }

  try {
    // Always use the service-role client. resolveApiKey is called from
    // both cookie-bound contexts (chat / server actions) AND background
    // dispatchers (cron / webhook / chain) where there's no user
    // session — the latter can't go through RLS. The RPC itself is
    // SECURITY DEFINER and gates access via the workspace_id +
    // master_key params; the caller already holds the workspace_id
    // by being able to address the agent. Switching to service-role
    // unconditionally just removes the request-context dependency.
    const supabase = getServiceRoleSupabase();

    // Check the business's isolated flag. Isolated businesses do
    // NOT inherit workspace defaults — only their own keys count.
    let isolated = false;
    if (ctx.businessId) {
      const { data: biz } = await supabase
        .from("businesses")
        .select("isolated")
        .eq("id", ctx.businessId)
        .maybeSingle();
      isolated = !!biz?.isolated;
    }

    if (isolated) {
      // Walk only the per-business + per-navnode scopes; skip the
      // workspace fallback. We do this by calling the RPC with a
      // dummy workspace_id when there's nothing more specific —
      // OR we manually decrypt the business-scope row.
      const { data: row } = await supabase
        .from("api_keys")
        .select("encrypted_value")
        .eq("workspace_id", ctx.workspaceId)
        .eq("scope", "business")
        .eq("scope_id", ctx.businessId!)
        .eq("provider", provider)
        .maybeSingle();
      if (!row) return null;
      // Decrypt via the existing RPC pointed at JUST this row.
      const { data: decrypted } = await supabase.rpc("resolve_api_key", {
        _workspace_id: ctx.workspaceId,
        _business_id: ctx.businessId,
        _nav_node_id: ctx.navNodeId ?? null,
        _provider: provider,
        _master_key: masterKey,
      });
      // The RPC walks navnode → business → workspace, so we filter
      // out the workspace-level value by also asking ourselves the
      // workspace value separately and discarding when they match.
      if (typeof decrypted !== "string" || !decrypted) return null;
      const { data: wsRow } = await supabase.rpc("resolve_api_key", {
        _workspace_id: ctx.workspaceId,
        _business_id: null,
        _nav_node_id: null,
        _provider: provider,
        _master_key: masterKey,
      });
      // If the resolver returned the workspace default it means
      // there's no business/navnode override — refuse it.
      if (typeof wsRow === "string" && wsRow === decrypted) return null;
      return decrypted;
    }

    // Standard path — walk the full hierarchy with env fallback.
    const { data, error } = await supabase.rpc("resolve_api_key", {
      _workspace_id: ctx.workspaceId,
      _business_id: ctx.businessId ?? null,
      _nav_node_id: ctx.navNodeId ?? null,
      _provider: provider,
      _master_key: masterKey,
    });
    if (error) {
      console.error("resolve_api_key RPC failed", error);
      return envFallback(provider);
    }
    if (typeof data === "string" && data.length > 0) return data;
  } catch (err) {
    console.error("resolveApiKey threw", err);
  }
  return envFallback(provider);
}

function envFallback(provider: string): string | null {
  const envVar = ENV_FALLBACK[provider.toLowerCase()];
  if (!envVar) return null;
  const v = process.env[envVar];
  return v && v.length > 0 ? v : null;
}
