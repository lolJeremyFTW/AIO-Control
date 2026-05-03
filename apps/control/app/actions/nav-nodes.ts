// CRUD for nav_nodes. RLS allows editor+ to write within their
// workspace; we set workspace_id explicitly so the policy + audit
// trigger pick it up.

"use server";

import { revalidatePath } from "next/cache";

import { ALL_VARIANTS } from "@aio/ui/rail/Node";

import { telegramCreateForumTopic } from "../../lib/notify/telegram";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { getServiceRoleSupabase } from "../../lib/supabase/service";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export async function createNavNode(input: {
  workspace_slug: string;
  workspace_id: string;
  business_id: string;
  parent_id: string | null;
  name: string;
  variant?: string;
  icon?: string;
  href?: string;
  color_hex?: string | null;
  logo_url?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  if (!input.name.trim())
    return { ok: false, error: "Naam mag niet leeg zijn." };
  const variant =
    input.variant && (ALL_VARIANTS as readonly string[]).includes(input.variant)
      ? input.variant
      : "slate";
  const letter = (input.icon ?? input.name).trim().slice(0, 1).toUpperCase();
  const colorHex =
    input.color_hex && HEX_RE.test(input.color_hex)
      ? input.color_hex.toLowerCase()
      : null;

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
      color_hex: colorHex,
      logo_url: input.logo_url?.trim() || null,
      href: input.href?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !data)
    return { ok: false, error: error?.message ?? "Insert failed." };

  // Best-effort: when workspace topology is "topic_per_business_and_node"
  // and the business has a parent forum-group target, mint a topic
  // for this nav-node too.
  void autoCreateNavNodeTelegramTopic({
    workspace_id: input.workspace_id,
    business_id: input.business_id,
    nav_node_id: data.id,
    name: input.name.trim(),
    icon: input.icon ?? null,
  }).catch((err) => console.error("autoCreateNavNodeTopic failed", err));

  revalidatePath(
    `/${input.workspace_slug}/business/${input.business_id}`,
    "layout",
  );
  return { ok: true, data: { id: data.id } };
}

async function autoCreateNavNodeTelegramTopic(opts: {
  workspace_id: string;
  business_id: string;
  nav_node_id: string;
  name: string;
  icon: string | null;
}): Promise<void> {
  const admin = getServiceRoleSupabase();
  const { data: ws } = await admin
    .from("workspaces")
    .select("telegram_topology")
    .eq("id", opts.workspace_id)
    .maybeSingle();
  if (ws?.telegram_topology !== "topic_per_business_and_node") return;

  // Find the parent group (workspace-scope target with auto-create on).
  const { data: parent } = await admin
    .from("telegram_targets")
    .select("id, chat_id")
    .eq("workspace_id", opts.workspace_id)
    .eq("scope", "workspace")
    .eq("auto_create_topics_for_businesses", true)
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();
  if (!parent?.chat_id) return;

  // Look up the business name so the topic is "<biz> · <node>".
  const { data: biz } = await admin
    .from("businesses")
    .select("name")
    .eq("id", opts.business_id)
    .maybeSingle();
  const topicName = `${opts.icon ? opts.icon + " " : ""}${biz?.name ?? ""} · ${opts.name}`.trim();

  const created = await telegramCreateForumTopic({
    workspace_id: opts.workspace_id,
    chat_id: parent.chat_id,
    name: topicName,
  });
  if (!created.ok) {
    console.warn("nav-node auto-topic failed:", created.error);
    return;
  }

  const { data: newTarget } = await admin
    .from("telegram_targets")
    .insert({
      workspace_id: opts.workspace_id,
      scope: "navnode",
      scope_id: opts.nav_node_id,
      name: `Auto: ${biz?.name ?? ""} / ${opts.name}`,
      chat_id: parent.chat_id,
      topic_id: created.message_thread_id,
      enabled: true,
      send_run_done: true,
      send_run_fail: true,
      send_queue_review: true,
    })
    .select("id")
    .single();
  if (!newTarget) return;

  await admin
    .from("nav_nodes")
    .update({ telegram_topic_target_id: newTarget.id })
    .eq("id", opts.nav_node_id);
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
    color_hex?: string | null;
    logo_url?: string | null;
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
  if (input.patch.color_hex !== undefined) {
    const v = input.patch.color_hex;
    if (v === null || v === "") patch.color_hex = null;
    else if (HEX_RE.test(v)) patch.color_hex = v.toLowerCase();
    else return { ok: false, error: "Ongeldige hex (gebruik #rgb of #rrggbb)." };
  }
  if (input.patch.logo_url !== undefined)
    patch.logo_url = input.patch.logo_url?.toString().trim() || null;

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

export async function duplicateNavNode(input: {
  workspace_slug: string;
  workspace_id: string;
  business_id: string;
  source_id: string;
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: src, error: srcErr } = await supabase
    .from("nav_nodes")
    .select("name, parent_id, variant, icon, color_hex, logo_url, href, sort_order")
    .eq("id", input.source_id)
    .maybeSingle();
  if (srcErr || !src) {
    return { ok: false, error: srcErr?.message ?? "Origineel niet gevonden." };
  }
  const { data, error } = await supabase
    .from("nav_nodes")
    .insert({
      workspace_id: input.workspace_id,
      business_id: input.business_id,
      parent_id: src.parent_id,
      name: `${src.name} (kopie)`,
      letter: src.name.slice(0, 1).toUpperCase(),
      variant: src.variant,
      icon: src.icon,
      color_hex: src.color_hex,
      logo_url: src.logo_url,
      href: src.href,
      sort_order: (src.sort_order ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert faalde." };
  }
  revalidatePath(
    `/${input.workspace_slug}/business/${input.business_id}`,
    "layout",
  );
  return { ok: true, data: { id: data.id } };
}

export async function moveNavNode(input: {
  workspace_slug: string;
  business_id: string;
  id: string;
  new_parent_id: string | null;
}): Promise<ActionResult<null>> {
  // Guard: can't move a node under itself or any of its descendants.
  if (input.new_parent_id === input.id) {
    return { ok: false, error: "Kan niet onder zichzelf hangen." };
  }
  const supabase = await createSupabaseServerClient();
  // Walk up from new_parent_id to make sure we don't hit input.id
  let cursor: string | null = input.new_parent_id;
  for (let i = 0; cursor && i < 32; i++) {
    if (cursor === input.id) {
      return {
        ok: false,
        error: "Cyclus — je kunt een topic niet onder een eigen subtopic hangen.",
      };
    }
    const { data: parent } = await supabase
      .from("nav_nodes")
      .select("parent_id")
      .eq("id", cursor)
      .maybeSingle();
    cursor = (parent?.parent_id as string | null) ?? null;
  }
  const { error } = await supabase
    .from("nav_nodes")
    .update({ parent_id: input.new_parent_id })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(
    `/${input.workspace_slug}/business/${input.business_id}`,
    "layout",
  );
  return { ok: true, data: null };
}

export async function swapNavNodeOrder(input: {
  workspace_slug: string;
  business_id: string;
  source_id: string;
  target_id: string;
}): Promise<ActionResult<null>> {
  if (input.source_id === input.target_id) return { ok: true, data: null };
  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("nav_nodes")
    .select("id, sort_order")
    .in("id", [input.source_id, input.target_id]);
  if (error || !rows || rows.length !== 2) {
    return { ok: false, error: error?.message ?? "Topics niet gevonden." };
  }
  const a = rows.find((r) => r.id === input.source_id);
  const b = rows.find((r) => r.id === input.target_id);
  if (!a || !b) return { ok: false, error: "Topics niet gevonden." };

  await supabase
    .from("nav_nodes")
    .update({ sort_order: b.sort_order })
    .eq("id", a.id);
  await supabase
    .from("nav_nodes")
    .update({ sort_order: a.sort_order })
    .eq("id", b.id);

  revalidatePath(
    `/${input.workspace_slug}/business/${input.business_id}`,
    "layout",
  );
  return { ok: true, data: null };
}

export async function reorderNavNode(input: {
  workspace_slug: string;
  business_id: string;
  id: string;
  direction: "up" | "down";
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  // Look up the node + its current sort_order.
  const { data: node } = await supabase
    .from("nav_nodes")
    .select("id, parent_id, sort_order")
    .eq("id", input.id)
    .maybeSingle();
  if (!node) return { ok: false, error: "Topic niet gevonden." };

  // Find the immediate sibling above/below.
  const op = input.direction === "up" ? "lt" : "gt";
  const order = input.direction === "up" ? "desc" : "asc";
  const sib = await supabase
    .from("nav_nodes")
    .select("id, sort_order")
    .eq("business_id", input.business_id)
    .filter(
      "parent_id",
      node.parent_id == null ? "is" : "eq",
      node.parent_id ?? null,
    )
    .filter("sort_order", op, node.sort_order)
    .order("sort_order", { ascending: order === "asc" })
    .limit(1)
    .maybeSingle();

  if (!sib.data) return { ok: true, data: null }; // already at edge

  // Swap sort_orders.
  await supabase
    .from("nav_nodes")
    .update({ sort_order: sib.data.sort_order })
    .eq("id", input.id);
  await supabase
    .from("nav_nodes")
    .update({ sort_order: node.sort_order })
    .eq("id", sib.data.id);

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
