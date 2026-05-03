// Resolve the per-workspace Ollama endpoint that providers should hit
// when streaming a chat or running a scheduled run. Lookup order:
//
//   1. workspaces.ollama_host + ollama_port (saved via OllamaPanel in
//      /[ws]/settings)
//   2. process.env.OLLAMA_BASE_URL (server-wide fallback)
//   3. http://localhost:11434 (last-resort default)
//
// We hit the service-role client because the chat / dispatch code
// already runs server-side with elevated privileges and we don't want
// to gate Ollama-resolution behind a session.

import "server-only";

import { getServiceRoleSupabase } from "../supabase/service";

export async function resolveOllamaEndpoint(
  workspaceId: string,
): Promise<string | null> {
  const supabase = getServiceRoleSupabase();
  const { data } = await supabase
    .from("workspaces")
    .select("ollama_host, ollama_port")
    .eq("id", workspaceId)
    .maybeSingle();
  const host = (data?.ollama_host as string | null) ?? null;
  const port = (data?.ollama_port as number | null) ?? null;
  if (host) return `http://${host}:${port ?? 11434}`;
  return process.env.OLLAMA_BASE_URL ?? null;
}
