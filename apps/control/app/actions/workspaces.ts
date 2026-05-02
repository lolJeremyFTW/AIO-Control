// Workspace lifecycle actions — only the owner can delete or trigger an
// export. Both flows go through the user-bound Supabase client so RLS
// enforces the owner check; we double-check `owner_id` server-side as
// belt-and-braces.

"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "../../lib/supabase/server";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function ensureOwner(workspaceId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: ws } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws || ws.owner_id !== user.id) return null;
  return user.id;
}

export async function deleteWorkspace(input: {
  workspace_id: string;
  confirm_slug: string;
  expected_slug: string;
}): Promise<ActionResult<null>> {
  if (input.confirm_slug !== input.expected_slug) {
    return {
      ok: false,
      error: `Bevestiging klopt niet — typ exact "${input.expected_slug}".`,
    };
  }
  const ownerId = await ensureOwner(input.workspace_id);
  if (!ownerId)
    return { ok: false, error: "Alleen de owner kan deze workspace verwijderen." };

  // Owner can't delete a workspace if it's their LAST one — they'd lose
  // access entirely. Force them to create a second one first.
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("workspaces")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);
  if ((count ?? 0) <= 1) {
    return {
      ok: false,
      error:
        "Dit is je laatste workspace. Maak eerst een tweede aan voordat je deze verwijdert.",
    };
  }

  // Cascade rules in the schema take care of the dependent rows
  // (businesses, agents, runs, etc.) — we just drop the workspace.
  const { error } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", input.workspace_id);
  if (error) return { ok: false, error: error.message };

  // Land the user on the redirect target (root → first remaining workspace).
  redirect("/");
}

/**
 * Builds an exhaustive JSON dump of everything the workspace owns. Returns
 * a base64 data URL the client can save as a file. Owner-only.
 */
export async function exportWorkspaceData(input: {
  workspace_id: string;
}): Promise<ActionResult<{ filename: string; json: string }>> {
  const ownerId = await ensureOwner(input.workspace_id);
  if (!ownerId)
    return { ok: false, error: "Alleen de owner kan een export maken." };

  const supabase = await createSupabaseServerClient();
  const wsId = input.workspace_id;

  // We pull each table the workspace owns. RLS still applies — the owner
  // has read on every workspace-scoped table, so each query returns the
  // rows belonging to this workspace and only this workspace.
  const [
    workspace,
    members,
    businesses,
    agents,
    queue,
    integrations,
    schedules,
    runs,
    revenue,
    audits,
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("*")
      .eq("id", wsId)
      .maybeSingle()
      .then((r) => r.data),
    supabase
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", wsId)
      .then((r) => r.data ?? []),
    supabase
      .from("businesses")
      .select("*")
      .eq("workspace_id", wsId)
      .then((r) => r.data ?? []),
    supabase
      .from("agents")
      .select("*")
      .eq("workspace_id", wsId)
      .then((r) => r.data ?? []),
    supabase
      .from("queue_items")
      .select("*")
      .eq("workspace_id", wsId)
      .then((r) => r.data ?? []),
    supabase
      .from("integrations")
      .select("*")
      .eq("workspace_id", wsId)
      .then((r) => r.data ?? []),
    supabase
      .from("schedules_safe")
      .select("*")
      .eq("workspace_id", wsId)
      .then((r) => r.data ?? []),
    supabase
      .from("runs")
      .select("*")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false })
      .limit(5000)
      .then((r) => r.data ?? []),
    supabase
      .from("revenue_events")
      .select("*")
      .eq("workspace_id", wsId)
      .then((r) => r.data ?? []),
    supabase
      .from("audit_logs")
      .select("*")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false })
      .limit(5000)
      .then((r) => r.data ?? []),
  ]);

  const dump = {
    exported_at: new Date().toISOString(),
    workspace,
    members,
    businesses,
    agents,
    queue_items: queue,
    integrations,
    schedules,
    runs,
    revenue_events: revenue,
    audit_logs: audits,
  };
  const slug =
    (workspace as { slug?: string } | null)?.slug ?? "workspace";
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    ok: true,
    data: {
      filename: `aio-${slug}-${ts}.json`,
      json: JSON.stringify(dump, null, 2),
    },
  };
}
