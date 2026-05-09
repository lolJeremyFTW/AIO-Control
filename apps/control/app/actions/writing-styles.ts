// Server actions for Claude-like workspace writing styles. Styles are
// reusable tone/voice guides that agents can select and the prompt
// builder injects into every run.

"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "../../lib/supabase/server";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type WritingStyleInput = {
  workspace_slug: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  instructions: string;
  sample_text?: string | null;
};

function cleanOptional(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean ? clean : null;
}

function validateWritingStyle(input: {
  name?: string;
  instructions?: string;
  sample_text?: string | null;
}): ActionResult<null> {
  if (input.name !== undefined && !input.name.trim()) {
    return { ok: false, error: "Naam mag niet leeg zijn." };
  }
  if (input.name && input.name.trim().length > 80) {
    return { ok: false, error: "Naam is te lang; max 80 tekens." };
  }
  if (input.instructions !== undefined && !input.instructions.trim()) {
    return {
      ok: false,
      error: "Schrijfstijl-instructies mogen niet leeg zijn.",
    };
  }
  if (input.instructions && input.instructions.trim().length > 12_000) {
    return {
      ok: false,
      error: "Schrijfstijl-instructies zijn te lang; max 12.000 tekens.",
    };
  }
  if (input.sample_text && input.sample_text.trim().length > 12_000) {
    return {
      ok: false,
      error: "Voorbeeldtekst is te lang; max 12.000 tekens.",
    };
  }
  return { ok: true, data: null };
}

export async function createWritingStyle(
  input: WritingStyleInput,
): Promise<ActionResult<{ id: string }>> {
  const valid = validateWritingStyle(input);
  if (!valid.ok) return valid;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Niet ingelogd." };

  const { data, error } = await supabase
    .from("writing_styles")
    .insert({
      workspace_id: input.workspace_id,
      name: input.name.trim(),
      description: cleanOptional(input.description),
      instructions: input.instructions.trim(),
      sample_text: cleanOptional(input.sample_text),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }
  revalidateWritingStylePaths(input.workspace_slug);
  return { ok: true, data: { id: data.id } };
}

export async function updateWritingStyle(input: {
  workspace_slug: string;
  id: string;
  patch: {
    name?: string;
    description?: string | null;
    instructions?: string;
    sample_text?: string | null;
  };
}): Promise<ActionResult<null>> {
  const valid = validateWritingStyle(input.patch);
  if (!valid.ok) return valid;

  const patch: Record<string, unknown> = {};
  if (input.patch.name !== undefined) patch.name = input.patch.name.trim();
  if (input.patch.description !== undefined) {
    patch.description = cleanOptional(input.patch.description);
  }
  if (input.patch.instructions !== undefined) {
    patch.instructions = input.patch.instructions.trim();
  }
  if (input.patch.sample_text !== undefined) {
    patch.sample_text = cleanOptional(input.patch.sample_text);
  }
  if (Object.keys(patch).length === 0) return { ok: true, data: null };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("writing_styles")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidateWritingStylePaths(input.workspace_slug);
  return { ok: true, data: null };
}

export async function archiveWritingStyle(input: {
  workspace_slug: string;
  id: string;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("writing_styles")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  // Clear agents pointing at the archived style so future runs do not
  // carry stale style instructions.
  await supabase
    .from("agents")
    .update({ writing_style_id: null })
    .eq("writing_style_id", input.id);

  revalidateWritingStylePaths(input.workspace_slug);
  return { ok: true, data: null };
}

export async function setAgentWritingStyle(input: {
  workspace_slug: string;
  business_id: string | null;
  agent_id: string;
  writing_style_id: string | null;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("agents")
    .update({ writing_style_id: input.writing_style_id || null })
    .eq("id", input.agent_id);
  if (error) return { ok: false, error: error.message };

  if (input.business_id) {
    revalidatePath(`/${input.workspace_slug}/business/${input.business_id}`);
  } else {
    revalidatePath(`/${input.workspace_slug}/agents`);
  }
  revalidateWritingStylePaths(input.workspace_slug);
  return { ok: true, data: null };
}

function revalidateWritingStylePaths(workspaceSlug: string) {
  revalidatePath(`/${workspaceSlug}/settings/ai`);
  revalidatePath(`/${workspaceSlug}/agents`);
}
