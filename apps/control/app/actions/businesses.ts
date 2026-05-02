// Server actions for business CRUD. RLS enforces workspace membership +
// editor-or-higher role; we still set workspace_id explicitly so the policy
// check can run and so the audit trigger picks it up.

"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "../../lib/supabase/server";

export type BusinessInput = {
  workspace_slug: string;
  workspace_id: string;
  name: string;
  sub?: string;
  letter?: string;
  variant?: string;
  /** Optional emoji (or any 1-3 chars) to render inside the rail node. */
  icon?: string;
};

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function createBusiness(
  input: BusinessInput,
): Promise<ActionResult<{ id: string }>> {
  if (!input.name.trim()) {
    return { ok: false, error: "Naam mag niet leeg zijn." };
  }
  const letter = (input.letter ?? input.name).trim().slice(0, 1).toUpperCase();
  const variant = input.variant ?? "brand";

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("businesses")
    .insert({
      workspace_id: input.workspace_id,
      name: input.name.trim(),
      sub: input.sub?.trim() || null,
      letter,
      variant,
      icon: input.icon?.trim() || null,
      status: "paused",
    })
    .select("id")
    .single();

  if (error) {
    console.error("createBusiness failed", error);
    return { ok: false, error: error.message };
  }
  revalidatePath(`/${input.workspace_slug}/dashboard`);
  return { ok: true, data: { id: data.id } };
}

export async function archiveBusiness({
  workspace_slug,
  id,
}: {
  workspace_slug: string;
  id: string;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("businesses")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${workspace_slug}/dashboard`);
  return { ok: true, data: null };
}

export async function toggleBusinessStatus({
  workspace_slug,
  id,
  to,
}: {
  workspace_slug: string;
  id: string;
  to: "running" | "paused";
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("businesses")
    .update({ status: to })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${workspace_slug}/dashboard`);
  return { ok: true, data: null };
}
