// Install a marketplace agent into a target business. We copy the
// preset's name + provider + model + config wholesale; the user is
// expected to tweak via the Agents tab afterwards.

"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "../../lib/supabase/server";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function installMarketplaceAgent(input: {
  workspace_slug: string;
  workspace_id: string;
  business_id: string;
  marketplace_slug: string;
}): Promise<ActionResult<{ agent_id: string }>> {
  const supabase = await createSupabaseServerClient();

  const { data: preset, error: presetErr } = await supabase
    .from("marketplace_agents")
    .select("name, provider, model, kind, config")
    .eq("slug", input.marketplace_slug)
    .maybeSingle();
  if (presetErr || !preset) {
    return {
      ok: false,
      error: presetErr?.message ?? "Marketplace agent niet gevonden.",
    };
  }

  type Preset = {
    name: string;
    provider: string;
    model: string | null;
    kind: string;
    config: Record<string, unknown>;
  };
  const p = preset as unknown as Preset;

  // RLS gates inserts to editor+ on the target workspace; we don't need
  // to re-check ownership here. workspace_id MUST be set so the check
  // (and the audit trigger) can run.
  const { data: created, error: insertErr } = await supabase
    .from("agents")
    .insert({
      workspace_id: input.workspace_id,
      business_id: input.business_id,
      name: p.name,
      provider: p.provider,
      model: p.model,
      kind: p.kind,
      config: p.config ?? {},
    })
    .select("id")
    .single();
  if (insertErr || !created) {
    return { ok: false, error: insertErr?.message ?? "Insert failed." };
  }

  // Best-effort install counter — non-fatal if it errors.
  await supabase.rpc("increment_marketplace_install", {
    agent_slug: input.marketplace_slug,
  });

  revalidatePath(`/${input.workspace_slug}/business/${input.business_id}/agents`);
  revalidatePath(`/${input.workspace_slug}/marketplace`);
  return { ok: true, data: { agent_id: created.id } };
}
