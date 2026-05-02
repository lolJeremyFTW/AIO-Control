// CRUD for nav_nodes. RLS allows editor+ to write within their
// workspace; we set workspace_id explicitly so the policy + audit
// trigger pick it up.

"use server";

import { revalidatePath } from "next/cache";

import { ALL_VARIANTS } from "@aio/ui/rail/Node";

import { createSupabaseServerClient } from "../../lib/supabase/server";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function createNavNode(input: {
  workspace_slug: string;
  workspace_id: string;
  business_id: string;
  parent_id: string | null;
  name: string;
  variant?: string;
  icon?: string;
  href?: string;
}): Promise<ActionResult<{ id: string }>> {
  if (!input.name.trim())
    return { ok: false, error: "Naam mag niet leeg zijn." };
  const variant =
    input.variant && (ALL_VARIANTS as readonly string[]).includes(input.variant)
      ? input.variant
      : "slate";
  const letter = (input.icon ?? input.name).trim().slice(0, 1).toUpperCase();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("nav_nodes")
    .insert({
      workspace_id: input.workspace_id,
      business_id: input.business_id,
      parent_id: input.parent_id,
      name: input.name.trim(),
      letter,
      variant,
      icon: input.icon?.trim() || null,
      href: input.href?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !data)
    return { ok: false, error: error?.message ?? "Insert failed." };

  revalidatePath(
    `/${input.workspace_slug}/business/${input.business_id}`,
    "layout",
  );
  return { ok: true, data: { id: data.id } };
}

export async function updateNavNode(input: {
  workspace_slug: string;
  business_id: string;
  id: string;
  patch: {
    name?: string;
    variant?: string;
    icon?: string | null;
    href?: string | null;
  };
}): Promise<ActionResult<null>> {
  const patch: Record<string, unknown> = {};
  if (input.patch.name !== undefined) {
    const trimmed = input.patch.name.trim();
    if (!trimmed) return { ok: false, error: "Naam mag niet leeg zijn." };
    patch.name = trimmed;
    patch.letter = (input.patch.icon ?? trimmed).slice(0, 1).toUpperCase();
  }
  if (input.patch.variant !== undefined) {
    if ((ALL_VARIANTS as readonly string[]).includes(input.patch.variant)) {
      patch.variant = input.patch.variant;
    }
  }
  if (input.patch.icon !== undefined)
    patch.icon = input.patch.icon?.toString().trim() || null;
  if (input.patch.href !== undefined)
    patch.href = input.patch.href?.toString().trim() || null;

  if (Object.keys(patch).length === 0) return { ok: true, data: null };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("nav_nodes")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(
    `/${input.workspace_slug}/business/${input.business_id}`,
    "layout",
  );
  return { ok: true, data: null };
}

export async function archiveNavNode(input: {
  workspace_slug: string;
  business_id: string;
  id: string;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("nav_nodes")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(
    `/${input.workspace_slug}/business/${input.business_id}`,
    "layout",
  );
  return { ok: true, data: null };
}
