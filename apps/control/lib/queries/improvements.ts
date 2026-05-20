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

export type SimilarImprovement = {
  id: string;
  title: string;
  status: string;
  similarity: number;
};

/**
 * Tokenize text into lowercase words, stripping punctuation.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Compute Overlap Coefficient between two token sets.
 * Score = |A ∩ B| / min(|A|, |B|)
 * Returns 0..1.
 */
function overlapCoefficient(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const minLen = Math.min(setA.size, setB.size);
  return minLen > 0 ? intersection / minLen : 0;
}

/**
 * Check for similar existing improvements in proposed/approved status.
 * Returns improvements with similarity score >= threshold (default 0.5).
 */
export async function findSimilarImprovements(
  workspaceId: string,
  title: string,
  description: string,
  threshold = 0.5,
): Promise<SimilarImprovement[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("improvements")
    .select("id, title, status, description")
    .eq("workspace_id", workspaceId)
    .in("status", ["proposed", "approved"]);

  if (error || !data) return [];

  const titleTokens = tokenize(title);
  const descTokens = tokenize(description);

  const similar: SimilarImprovement[] = [];
  for (const row of data as { id: string; title: string; status: string; description?: string }[]) {
    const rowTitleTokens = tokenize(row.title);
    const rowDescTokens = tokenize(row.description ?? "");
    const titleSim = overlapCoefficient(titleTokens, rowTitleTokens);
    const descSim = overlapCoefficient(descTokens, rowDescTokens);
    const overallSim = titleSim * 0.6 + descSim * 0.4;
    if (overallSim >= threshold) {
      similar.push({
        id: row.id,
        title: row.title,
        status: row.status,
        similarity: Math.round(overallSim * 100) / 100,
      });
    }
  }

  similar.sort((a, b) => b.similarity - a.similarity);
  return similar;
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
