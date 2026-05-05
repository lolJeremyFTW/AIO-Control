"use server";

import { revalidatePath } from "next/cache";

import type { RunStep } from "../../lib/runs/message-history";
import { getServiceRoleSupabase } from "../../lib/supabase/service";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function saveModuleDashboard(input: {
  workspace_slug: string;
  workspace_id: string;
  business_id: string;
  nav_node_id: string;
  run_id: string;
}): Promise<ActionResult<null>> {
  const admin = getServiceRoleSupabase();

  // Fetch the run — verify it belongs to the right workspace before saving.
  const { data: run, error: runErr } = await admin
    .from("runs")
    .select("message_history, output, workspace_id, status")
    .eq("id", input.run_id)
    .maybeSingle();

  if (runErr || !run)
    return { ok: false, error: runErr?.message ?? "Run niet gevonden." };
  if (run.workspace_id !== input.workspace_id)
    return { ok: false, error: "Niet geautoriseerd." };

  // Extract assistant text from message_history steps.
  const history = (run.message_history as RunStep[] | null) ?? [];
  const assistantText = history
    .filter((s): s is Extract<RunStep, { kind: "assistant" }> => s.kind === "assistant")
    .map((s) => s.text)
    .filter(Boolean)
    .join("\n\n")
    .trim();

  // Fall back to run.output.text when message_history is missing (legacy runs).
  const content =
    assistantText ||
    ((run.output as { text?: string } | null)?.text ?? "").trim();

  if (!content)
    return { ok: false, error: "Run heeft nog geen resultaat om op te slaan." };

  const { error } = await admin.from("module_dashboards").upsert(
    {
      nav_node_id: input.nav_node_id,
      workspace_id: input.workspace_id,
      content,
      run_id: input.run_id,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "nav_node_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(
    `/${input.workspace_slug}/business/${input.business_id}`,
    "layout",
  );
  return { ok: true, data: null };
}

export async function deleteModuleDashboard(input: {
  workspace_slug: string;
  workspace_id: string;
  business_id: string;
  nav_node_id: string;
}): Promise<ActionResult<null>> {
  const admin = getServiceRoleSupabase();

  // Verify ownership before deleting.
  const { data: existing } = await admin
    .from("module_dashboards")
    .select("workspace_id")
    .eq("nav_node_id", input.nav_node_id)
    .maybeSingle();

  if (!existing) return { ok: true, data: null };
  if (existing.workspace_id !== input.workspace_id)
    return { ok: false, error: "Niet geautoriseerd." };

  const { error } = await admin
    .from("module_dashboards")
    .delete()
    .eq("nav_node_id", input.nav_node_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(
    `/${input.workspace_slug}/business/${input.business_id}`,
    "layout",
  );
  return { ok: true, data: null };
}
