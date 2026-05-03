// Server actions for telegram_targets — CRUD + a "send test message"
// button that fires through the normal sender path so users see the
// exact same code path their reports take.

"use server";

import { revalidatePath } from "next/cache";

import { sendTelegram, telegramGetMe } from "../../lib/notify/telegram";
import { createSupabaseServerClient } from "../../lib/supabase/server";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type TelegramTargetInput = {
  workspace_slug: string;
  workspace_id: string;
  scope: "workspace" | "business" | "navnode";
  scope_id: string;
  name: string;
  chat_id: string;
  topic_id?: number | null;
  allowlist?: string[];
  denylist?: string[];
  send_run_done?: boolean;
  send_run_fail?: boolean;
  send_queue_review?: boolean;
  enabled?: boolean;
};

export async function createTelegramTarget(
  input: TelegramTargetInput,
): Promise<Result<{ id: string }>> {
  if (!input.name.trim()) return { ok: false, error: "Naam is verplicht." };
  if (!input.chat_id.trim())
    return { ok: false, error: "chat_id is verplicht." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("telegram_targets")
    .insert({
      workspace_id: input.workspace_id,
      scope: input.scope,
      scope_id: input.scope_id,
      name: input.name.trim(),
      chat_id: input.chat_id.trim(),
      topic_id: input.topic_id ?? null,
      allowlist: input.allowlist ?? [],
      denylist: input.denylist ?? [],
      send_run_done: input.send_run_done ?? true,
      send_run_fail: input.send_run_fail ?? true,
      send_queue_review: input.send_queue_review ?? true,
      enabled: input.enabled ?? true,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }
  revalidatePath(`/${input.workspace_slug}/settings`);
  return { ok: true, data: { id: data.id } };
}

export async function setTelegramAutoCreateTopics(input: {
  workspace_slug: string;
  workspace_id: string;
  target_id: string;
  enabled: boolean;
}): Promise<Result<null>> {
  const supabase = await createSupabaseServerClient();
  // Defensive: only ONE workspace-scope target may have the flag on.
  // If we're turning ON, clear it from any siblings first so the
  // resolver always finds at most one parent group.
  if (input.enabled) {
    await supabase
      .from("telegram_targets")
      .update({ auto_create_topics_for_businesses: false })
      .eq("workspace_id", input.workspace_id)
      .eq("scope", "workspace");
  }
  const { error } = await supabase
    .from("telegram_targets")
    .update({ auto_create_topics_for_businesses: input.enabled })
    .eq("id", input.target_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}/settings`);
  return { ok: true, data: null };
}

export async function deleteTelegramTarget(input: {
  workspace_slug: string;
  id: string;
}): Promise<Result<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("telegram_targets")
    .delete()
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}/settings`);
  return { ok: true, data: null };
}

export async function testTelegramTarget(input: {
  workspace_id: string;
  target_id: string;
}): Promise<Result<{ username?: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: t, error } = await supabase
    .from("telegram_targets")
    .select("id, workspace_id, chat_id, topic_id, enabled")
    .eq("id", input.target_id)
    .maybeSingle();
  if (error || !t) return { ok: false, error: "Target niet gevonden." };

  const me = await telegramGetMe({ workspace_id: input.workspace_id });
  if (!me.ok) return { ok: false, error: me.error };

  const send = await sendTelegram({
    workspace_id: input.workspace_id,
    target: t,
    text: `✅ AIO Control test\nBot @${me.username} kan dit kanaal bereiken.`,
  });
  if (!send.ok) return { ok: false, error: send.error ?? "send faalde" };

  return { ok: true, data: { username: me.username } };
}
