// Server actions for business CRUD. RLS enforces workspace membership +
// editor-or-higher role; we still set workspace_id explicitly so the policy
// check can run and so the audit trigger picks it up.

"use server";

import { revalidatePath } from "next/cache";

import {
  telegramCloseForumTopic,
  telegramCreateForumTopic,
  telegramEditForumTopic,
} from "../../lib/notify/telegram";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { getServiceRoleSupabase } from "../../lib/supabase/service";

export type BusinessInput = {
  workspace_slug: string;
  workspace_id: string;
  name: string;
  sub?: string;
  letter?: string;
  variant?: string;
  /** Optional emoji (or any 1-3 chars) to render inside the rail node. */
  icon?: string;
  /** Optional CSS hex (e.g. "#7e3af2") — overrides variant palette. */
  color_hex?: string | null;
  /** Optional uploaded logo URL — overrides letter/icon. */
  logo_url?: string | null;
};

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function createBusiness(
  input: BusinessInput,
): Promise<ActionResult<{ id: string }>> {
  if (!input.name.trim()) {
    return { ok: false, error: "Naam mag niet leeg zijn." };
  }
  const letter = (input.letter ?? input.name).trim().slice(0, 1).toUpperCase();
  const variant = input.variant ?? "brand";

  const colorHex =
    input.color_hex && HEX_RE.test(input.color_hex)
      ? input.color_hex.toLowerCase()
      : null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("businesses")
    .insert({
      workspace_id: input.workspace_id,
      name: input.name.trim(),
      sub: input.sub?.trim() || null,
      letter,
      variant,
      icon: input.icon?.trim() || null,
      color_hex: colorHex,
      logo_url: input.logo_url?.trim() || null,
      status: "paused",
    })
    .select("id")
    .single();

  if (error) {
    console.error("createBusiness failed", error);
    return { ok: false, error: error.message };
  }

  // Best-effort: if a workspace-scope telegram_target has the
  // auto_create_topics_for_businesses flag set, create a forum topic
  // in that group and bind it to this business. Failure is logged
  // but never blocks business creation.
  void autoCreateTelegramTopicForBusiness({
    workspace_id: input.workspace_id,
    business_id: data.id,
    business_name: input.name.trim(),
    icon: input.icon ?? null,
  }).catch((err) => console.error("autoCreateTelegramTopic failed", err));

  revalidatePath(`/${input.workspace_slug}/dashboard`);
  return { ok: true, data: { id: data.id } };
}

export async function updateBusiness(input: {
  workspace_slug: string;
  id: string;
  patch: {
    name?: string;
    sub?: string | null;
    variant?: string;
    icon?: string | null;
    color_hex?: string | null;
    logo_url?: string | null;
    daily_spend_limit_cents?: number | null;
    monthly_spend_limit_cents?: number | null;
    status?: "running" | "paused";
  };
}): Promise<ActionResult<null>> {
  const patch: Record<string, unknown> = {};
  if (input.patch.name !== undefined) {
    const trimmed = input.patch.name.trim();
    if (!trimmed) return { ok: false, error: "Naam mag niet leeg zijn." };
    patch.name = trimmed;
    patch.letter = trimmed.slice(0, 1).toUpperCase();
  }
  if (input.patch.sub !== undefined)
    patch.sub = input.patch.sub?.toString().trim() || null;
  if (input.patch.variant !== undefined) patch.variant = input.patch.variant;
  if (input.patch.icon !== undefined)
    patch.icon = input.patch.icon?.toString().trim() || null;
  if (input.patch.color_hex !== undefined) {
    const v = input.patch.color_hex;
    if (v === null || v === "") patch.color_hex = null;
    else if (HEX_RE.test(v)) patch.color_hex = v.toLowerCase();
    else return { ok: false, error: "Ongeldige hex (gebruik #rgb of #rrggbb)." };
  }
  if (input.patch.logo_url !== undefined)
    patch.logo_url = input.patch.logo_url?.toString().trim() || null;
  if (input.patch.daily_spend_limit_cents !== undefined)
    patch.daily_spend_limit_cents = input.patch.daily_spend_limit_cents;
  if (input.patch.monthly_spend_limit_cents !== undefined)
    patch.monthly_spend_limit_cents = input.patch.monthly_spend_limit_cents;
  if (input.patch.status !== undefined) patch.status = input.patch.status;

  if (Object.keys(patch).length === 0) return { ok: true, data: null };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("businesses")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  // If the rename happened AND there's a bound Telegram topic, push
  // the new name to Telegram so the topic title stays in sync.
  if (input.patch.name !== undefined) {
    void renameTelegramTopicForBusiness({
      business_id: input.id,
      new_name: (patch.name as string) ?? input.patch.name,
    }).catch((err) => console.error("renameTelegramTopic failed", err));
  }

  revalidatePath(`/${input.workspace_slug}/dashboard`);
  revalidatePath(`/${input.workspace_slug}/business/${input.id}`, "layout");
  return { ok: true, data: null };
}

export async function duplicateBusiness(input: {
  workspace_slug: string;
  workspace_id: string;
  source_id: string;
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: src, error: srcErr } = await supabase
    .from("businesses")
    .select(
      "name, sub, letter, variant, icon, color_hex, logo_url, status, primary_action",
    )
    .eq("id", input.source_id)
    .maybeSingle();
  if (srcErr || !src) {
    return { ok: false, error: srcErr?.message ?? "Origineel niet gevonden." };
  }
  const { data, error } = await supabase
    .from("businesses")
    .insert({
      workspace_id: input.workspace_id,
      name: `${src.name} (kopie)`,
      sub: src.sub,
      letter: src.letter,
      variant: src.variant,
      icon: src.icon,
      color_hex: src.color_hex,
      logo_url: src.logo_url,
      status: "paused",
      primary_action: src.primary_action,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert faalde." };
  }
  revalidatePath(`/${input.workspace_slug}/dashboard`);
  return { ok: true, data: { id: data.id } };
}

export async function swapBusinessOrder(input: {
  workspace_slug: string;
  source_id: string;
  target_id: string;
}): Promise<ActionResult<null>> {
  if (input.source_id === input.target_id) return { ok: true, data: null };
  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase
    .from("businesses")
    .select("id, sort_order")
    .in("id", [input.source_id, input.target_id]);
  if (!rows || rows.length !== 2) {
    return { ok: false, error: "Businesses niet gevonden." };
  }
  const a = rows.find((r) => r.id === input.source_id);
  const b = rows.find((r) => r.id === input.target_id);
  if (!a || !b) return { ok: false, error: "Niet gevonden." };
  await supabase
    .from("businesses")
    .update({ sort_order: b.sort_order })
    .eq("id", a.id);
  await supabase
    .from("businesses")
    .update({ sort_order: a.sort_order })
    .eq("id", b.id);
  revalidatePath(`/${input.workspace_slug}/dashboard`);
  revalidatePath(`/${input.workspace_slug}`, "layout");
  return { ok: true, data: null };
}

export async function archiveBusiness({
  workspace_slug,
  id,
}: {
  workspace_slug: string;
  id: string;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("businesses")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Close the bound Telegram topic so it visually grays out in the
  // group + new messages aren't accepted on it. Best-effort.
  void closeTelegramTopicForBusiness({ business_id: id }).catch((err) =>
    console.error("closeTelegramTopic failed", err),
  );

  revalidatePath(`/${workspace_slug}/dashboard`);
  return { ok: true, data: null };
}

// ─── Telegram auto-topic helpers ────────────────────────────────────
//
// These run on the service-role client so RLS doesn't block the
// targets-table insert + the businesses.telegram_topic_target_id
// update. Permission check happens in the calling action via the
// regular cookie-bound client.

async function autoCreateTelegramTopicForBusiness(opts: {
  workspace_id: string;
  business_id: string;
  business_name: string;
  icon: string | null;
}): Promise<void> {
  const admin = getServiceRoleSupabase();
  // Find the parent group: workspace-scope target with the
  // auto-create flag. There's at most one.
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

  const topicName = opts.icon
    ? `${opts.icon} ${opts.business_name}`
    : opts.business_name;
  const created = await telegramCreateForumTopic({
    workspace_id: opts.workspace_id,
    chat_id: parent.chat_id,
    name: topicName,
  });
  if (!created.ok) {
    console.warn("auto-topic create failed:", created.error);
    return;
  }

  // Mint a per-business telegram_targets row pointing at the new
  // topic — so the run-event dispatcher routes reports to it.
  const { data: newTarget } = await admin
    .from("telegram_targets")
    .insert({
      workspace_id: opts.workspace_id,
      scope: "business",
      scope_id: opts.business_id,
      name: `Auto: ${opts.business_name}`,
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

  // Bind the target to the business so we can rename/close later.
  await admin
    .from("businesses")
    .update({ telegram_topic_target_id: newTarget.id })
    .eq("id", opts.business_id);
}

async function renameTelegramTopicForBusiness(opts: {
  business_id: string;
  new_name: string;
}): Promise<void> {
  const admin = getServiceRoleSupabase();
  const { data: biz } = await admin
    .from("businesses")
    .select("workspace_id, icon, telegram_topic_target_id")
    .eq("id", opts.business_id)
    .maybeSingle();
  if (!biz?.telegram_topic_target_id) return;

  const { data: target } = await admin
    .from("telegram_targets")
    .select("chat_id, topic_id")
    .eq("id", biz.telegram_topic_target_id)
    .maybeSingle();
  if (!target?.chat_id || target.topic_id == null) return;

  const topicName = biz.icon
    ? `${biz.icon} ${opts.new_name}`
    : opts.new_name;
  await telegramEditForumTopic({
    workspace_id: biz.workspace_id,
    chat_id: target.chat_id,
    message_thread_id: target.topic_id,
    name: topicName,
  });
  // Keep the target's display name in sync too.
  await admin
    .from("telegram_targets")
    .update({ name: `Auto: ${opts.new_name}` })
    .eq("id", biz.telegram_topic_target_id);
}

async function closeTelegramTopicForBusiness(opts: {
  business_id: string;
}): Promise<void> {
  const admin = getServiceRoleSupabase();
  const { data: biz } = await admin
    .from("businesses")
    .select("workspace_id, telegram_topic_target_id")
    .eq("id", opts.business_id)
    .maybeSingle();
  if (!biz?.telegram_topic_target_id) return;

  const { data: target } = await admin
    .from("telegram_targets")
    .select("chat_id, topic_id")
    .eq("id", biz.telegram_topic_target_id)
    .maybeSingle();
  if (!target?.chat_id || target.topic_id == null) return;

  await telegramCloseForumTopic({
    workspace_id: biz.workspace_id,
    chat_id: target.chat_id,
    message_thread_id: target.topic_id,
  });
  // Disable the target row so the dispatcher stops routing to it.
  await admin
    .from("telegram_targets")
    .update({ enabled: false })
    .eq("id", biz.telegram_topic_target_id);
}

export async function toggleBusinessStatus({
  workspace_slug,
  id,
  to,
}: {
  workspace_slug: string;
  id: string;
  to: "running" | "paused";
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("businesses")
    .update({ status: to })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${workspace_slug}/dashboard`);
  return { ok: true, data: null };
}
