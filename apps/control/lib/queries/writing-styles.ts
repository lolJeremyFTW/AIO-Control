// Server-side reads for workspace-scoped writing styles. RLS enforces
// workspace membership.

import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

export type WritingStyleRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  instructions: string;
  sample_text: string | null;
  created_at: string;
  updated_at: string;
};

export async function listWritingStylesForWorkspace(
  workspaceId: string,
): Promise<WritingStyleRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("writing_styles")
    .select(
      "id, workspace_id, name, description, instructions, sample_text, created_at, updated_at",
    )
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) {
    console.error("listWritingStylesForWorkspace failed", error);
    return [];
  }
  return (data ?? []) as WritingStyleRow[];
}
