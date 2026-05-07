// Queue mutation actions — approve / reject / pause an item. RLS gates
// writes to editor-or-higher; we set resolved_at + resolved_by so the
// audit trail captures who made the call and when.

"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "../../lib/supabase/server";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function resolveItem(
  id: string,
  decision: "approve" | "reject",
  workspaceSlug: string,
  businessId?: string,
): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: item, error: itemError } = await supabase
    .from("queue_items")
    .select(
      "id, workspace_id, business_id, nav_node_id, agent_id, state, confidence, title, meta, payload",
    )
    .eq("id", id)
    .maybeSingle();
  if (itemError) return { ok: false, error: itemError.message };
  if (!item) return { ok: false, error: "Queue item niet gevonden." };

  const { error } = await supabase
    .from("queue_items")
    .update({
      decision,
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  const payload =
    item.payload && typeof item.payload === "object"
      ? (item.payload as Record<string, unknown>)
      : {};
  const reason = typeof payload.reason === "string" ? payload.reason : item.meta;
  const proposedAction =
    typeof payload.proposed_action === "string"
      ? payload.proposed_action
      : null;
  const decisionBody = [
    `Operator decision: ${decision}.`,
    reason ? `Original reason: ${reason}` : null,
    proposedAction ? `Proposed action: ${proposedAction}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const { error: lessonError } = await supabase
    .from("agent_review_lessons")
    .insert({
      workspace_id: item.workspace_id,
      business_id: item.business_id,
      nav_node_id: item.nav_node_id,
      agent_id: item.agent_id,
      queue_item_id: item.id,
      lesson_type: decision === "approve" ? "approval" : "rejection",
      outcome: decision === "approve" ? "approved" : "rejected",
      confidence: Number(item.confidence ?? 0),
      title: `HITL ${decision}: ${item.title}`,
      body: decisionBody,
      payload: {
        ...payload,
        operator_decision: decision,
        decided_at: new Date().toISOString(),
      },
      created_by: user.id,
    });
  if (lessonError) {
    console.error("agent_review_lessons decision insert failed", lessonError);
  }

  // Refresh both the workspace dashboard and the per-business detail page.
  revalidatePath(`/${workspaceSlug}/dashboard`);
  if (businessId)
    revalidatePath(`/${workspaceSlug}/business/${businessId}`);
  return { ok: true, data: null };
}

export async function approveQueueItem(input: {
  id: string;
  workspace_slug: string;
  business_id?: string;
}): Promise<ActionResult<null>> {
  return resolveItem(input.id, "approve", input.workspace_slug, input.business_id);
}

export async function rejectQueueItem(input: {
  id: string;
  workspace_slug: string;
  business_id?: string;
}): Promise<ActionResult<null>> {
  return resolveItem(input.id, "reject", input.workspace_slug, input.business_id);
}
