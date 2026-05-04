// Server-side reads for the workspace-scoped skills table. RLS
// enforces workspace membership.

import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

export type SkillRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export async function listSkillsForWorkspace(
  workspaceId: string,
): Promise<SkillRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("skills")
    .select("id, workspace_id, name, description, body, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) {
    console.error("listSkillsForWorkspace failed", error);
    return [];
  }
  return (data ?? []) as SkillRow[];
}
