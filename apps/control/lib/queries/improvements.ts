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
  const selectRows = () =>
    supabase
      .from("improvements")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

  let { data, error } = await selectRows();
  if (isMissingImprovementsTableError(error)) {
    await ensureImprovementsTable(supabase);
    ({ data, error } = await selectRows());
  }

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
  const insertRow = () =>
    supabase
      .from("improvements")
      .insert({
        workspace_id: input.workspace_id,
        title: input.title.trim(),
        description: input.description.trim(),
        status: "proposed",
      })
      .select("id")
      .single();

  let { data, error } = await insertRow();
  if (isMissingImprovementsTableError(error)) {
    await ensureImprovementsTable(supabase);
    ({ data, error } = await insertRow());
  }

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

  const updateRow = () =>
    supabase
      .from("improvements")
      .update(patch)
      .eq("id", input.id)
      .eq("workspace_id", input.workspace_id);

  let { error } = await updateRow();
  if (isMissingImprovementsTableError(error)) {
    await ensureImprovementsTable(supabase);
    ({ error } = await updateRow());
  }

  if (error) throw new Error(error.message);
}

export async function deleteImprovement(input: {
  id: string;
  workspace_id: string;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const deleteRow = () =>
    supabase
      .from("improvements")
      .delete()
      .eq("id", input.id)
      .eq("workspace_id", input.workspace_id);

  let { error } = await deleteRow();
  if (isMissingImprovementsTableError(error)) {
    await ensureImprovementsTable(supabase);
    ({ error } = await deleteRow());
  }

  if (error) throw new Error(error.message);
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type MaybePostgrestError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
} | null;

async function ensureImprovementsTable(supabase: Supabase): Promise<void> {
  const { error } = await supabase.rpc("ensure_improvements_table");
  if (error) {
    throw new Error(
      `Kon self-improvement storage niet aanmaken: ${error.message}`,
    );
  }
}

function isMissingImprovementsTableError(error: MaybePostgrestError): boolean {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""} ${
    error.details ?? ""
  } ${error.hint ?? ""}`.toLowerCase();
  return (
    text.includes("improvements") &&
    (text.includes("schema cache") ||
      text.includes("could not find") ||
      text.includes("does not exist") ||
      text.includes("undefined_table") ||
      text.includes("42p01") ||
      text.includes("pgrst205"))
  );
}
