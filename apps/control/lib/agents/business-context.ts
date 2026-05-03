// Backwards-compat shim. The real builder is now system-prompt.ts —
// it covers ALL paths (chat, cron, webhook, manual) AND adds platform
// context, tools, sibling agents, and budget snapshot in addition to
// the original business + targets + workspace-rules block.
//
// New callers should import buildAgentSystemPrompt directly. This file
// stays as a re-export so existing imports keep compiling while we
// migrate.

import "server-only";

import { getServiceRoleSupabase } from "../supabase/service";
import { buildAgentSystemPrompt } from "./system-prompt";

/** @deprecated use {@link buildAgentSystemPrompt} which also covers
 *  platform / tools / siblings / budget context. This shim only
 *  fetches the agent and delegates. */
export async function buildBusinessContextPrefix(
  agentOrBusinessId: string | null,
): Promise<string | null> {
  if (!agentOrBusinessId) return null;
  // The old signature took a business_id. The new builder needs the
  // full agent row. We can't ergonomically infer the agent from a
  // business id, so this shim only works when called from the chat
  // route which has the agent loaded — see /api/chat/[agent_id]/route.ts
  // for the new code path that doesn't go through this shim.
  const admin = getServiceRoleSupabase();
  const { data: agent } = await admin
    .from("agents")
    .select("id, workspace_id, business_id, name, kind, provider, model")
    .eq("business_id", agentOrBusinessId)
    .limit(1)
    .maybeSingle();
  if (!agent) return null;
  return buildAgentSystemPrompt(
    agent as Parameters<typeof buildAgentSystemPrompt>[0],
  );
}

export { buildAgentSystemPrompt };

/** Helper: prepend the preamble to an agent's user-supplied
 *  systemPrompt, with a clean separator. Returns the combined string
 *  ready to hand off to the provider. */
export function prependPreamble(
  preamble: string,
  userPrompt: string | null | undefined,
): string {
  const u = (userPrompt ?? "").trim();
  if (!u) return preamble;
  return `${preamble}\n\n---\n\n${u}`;
}
