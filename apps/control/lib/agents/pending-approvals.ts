// Tiny in-memory store of pending write-tool calls awaiting user
// confirmation. The chat route stashes the call here when it emits a
// confirm_required event; the panel's "Approve" click triggers a new
// chat request that looks the entry up, executes the tool, and
// continues the conversation.
//
// In-memory is OK because:
//   - we only have one Node process per build (path + subdomain are
//     separate processes, each with their own Map);
//   - the worst case after a restart is "user must re-invoke the
//     tool", which is reasonable;
//   - the entry's TTL is 10 minutes — confirm flow happens in seconds.
//
// If we ever need cross-process durability (multi-replica deploys),
// promote this to a `pending_approvals` table.

import "server-only";

export type PendingApproval = {
  tool_call_id: string;
  name: string;
  /** Args the model originally produced (NOT what the panel sends
   *  back). We re-execute against THESE to prevent tampering. */
  args: unknown;
  /** Text the assistant streamed in the same turn. Replayed as the
   *  text portion of the assistant tool_use block when continuing
   *  the loop. */
  assistant_text: string;
  /** Full message history at the moment confirm_required was emitted.
   *  We rebuild the loop from this, append the tool_use + tool_result
   *  turns, and re-invoke streamChat. */
  messages: Array<{ role: string; content: string }>;
  workspace_id: string;
  business_id: string | null;
  agent_id: string;
  created_at: number;
};

const store = new Map<string, PendingApproval>();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Drop expired entries. Called opportunistically on every put/get. */
function gc() {
  const now = Date.now();
  for (const [id, entry] of store.entries()) {
    if (now - entry.created_at > TTL_MS) store.delete(id);
  }
}

export function putPendingApproval(entry: Omit<PendingApproval, "created_at">) {
  gc();
  store.set(entry.tool_call_id, { ...entry, created_at: Date.now() });
}

export function takePendingApproval(
  tool_call_id: string,
): PendingApproval | null {
  gc();
  const entry = store.get(tool_call_id);
  if (!entry) return null;
  store.delete(tool_call_id);
  return entry;
}
