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

  const { error } = await supabase
    .from("queue_items")
    .update({
      decision,
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

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
