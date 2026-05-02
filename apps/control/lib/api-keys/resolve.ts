// Server-side resolver for tiered API keys.
//
// Resolution order (most specific wins):
//   navnode (and ancestors) → business → workspace → env-var fallback
//
// Calls aio_control.resolve_api_key(...) RPC with the master encryption
// key (AGENT_SECRET_KEY). When the DB has no entry we fall back to the
// process env so existing single-tenant deploys keep working.

import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

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
    const supabase = await createSupabaseServerClient();
    // RPC call to the SECURITY DEFINER resolver which validates
    // workspace membership before walking the scope hierarchy.
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
