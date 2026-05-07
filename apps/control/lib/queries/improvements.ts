import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

export type ImprovementRow = {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  status: "proposed" | "approved" | "rejected" | "built";
  created_at: string;
  approved_at: string | null;
  built_at: string | null;
  built_by: string | null;
  built_notes: string | null;
  sort_order: number;
};

export async function listImprovements(
  workspaceId: string,
): Promise<ImprovementRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("improvements")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listImprovements failed", error);
    return [];
  }

  return (data ?? []) as ImprovementRow[];
}

export async function createImprovement(input: {
  workspace_id: string;
  title: string;
  description: string;
}): Promise<{ id: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("improvements")
    .insert({
      workspace_id: input.workspace_id,
      title: input.title.trim(),
      description: input.description.trim(),
      status: "proposed",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { id: data!.id };
}

export async function updateImprovementStatus(input: {
  id: string;
  workspace_id: string;
  status: ImprovementRow["status"];
  built_by?: string;
  built_notes?: string;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const patch: Record<string, unknown> = { status: input.status };

  if (input.status === "approved") patch.approved_at = new Date().toISOString();
  if (input.status === "built") {
    patch.built_at = new Date().toISOString();
    if (input.built_by) patch.built_by = input.built_by;
    if (input.built_notes) patch.built_notes = input.built_notes;
  }

  const { error } = await supabase
    .from("improvements")
    .update(patch)
    .eq("id", input.id)
    .eq("workspace_id", input.workspace_id);

  if (error) throw new Error(error.message);
}

export async function deleteImprovement(input: {
  id: string;
  workspace_id: string;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("improvements")
    .delete()
    .eq("id", input.id)
    .eq("workspace_id", input.workspace_id);

  if (error) throw new Error(error.message);
}
