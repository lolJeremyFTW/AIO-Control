// Server actions for provider-neutral notification_targets.
//
// Phase 1 wires Slack + Discord configuration and test pings only.
// Run-completion fanout still uses the legacy Telegram/custom paths
// until these targets have proven stable.

"use server";

import { revalidatePath } from "next/cache";

import { testDiscordTarget } from "../../lib/notify/providers/discord";
import { testSlackTarget } from "../../lib/notify/providers/slack";
import {
  stringValue,
  type NotificationProvider,
  type NotificationTarget,
} from "../../lib/notify/providers/types";
import { createSupabaseServerClient } from "../../lib/supabase/server";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
type Scope = "workspace" | "business" | "navnode";
export type ChannelProvider = Extract<
  NotificationProvider,
  "slack" | "discord"
>;

export type NotificationTargetRow = {
  id: string;
  provider: ChannelProvider;
  scope: Scope;
  scope_id: string;
  name: string;
  config: Record<string, unknown>;
  allowlist: string[];
  denylist: string[];
  send_run_done: boolean;
  send_run_fail: boolean;
  send_queue_review: boolean;
  enabled: boolean;
};

export type NotificationTargetInput = {
  workspace_slug: string;
  workspace_id: string;
  provider: ChannelProvider;
  scope: Scope;
  scope_id: string;
  name: string;
  config: Record<string, unknown>;
  allowlist?: string[];
  denylist?: string[];
  send_run_done?: boolean;
  send_run_fail?: boolean;
  send_queue_review?: boolean;
  enabled?: boolean;
};

export async function createNotificationTarget(
  input: NotificationTargetInput,
): Promise<Result<{ id: string }>> {
  if (!input.name.trim()) return { ok: false, error: "Naam is verplicht." };

  const normalized = normalizeConfig(input.provider, input.config);
  if (!normalized.ok) return normalized;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("notification_targets")
    .insert({
      workspace_id: input.workspace_id,
      provider: input.provider,
      scope: input.scope,
      scope_id:
        input.scope === "workspace" ? input.workspace_id : input.scope_id,
      name: input.name.trim(),
      config: normalized.data,
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
  revalidatePath(`/${input.workspace_slug}/settings/channels`);
  return { ok: true, data: { id: data.id } };
}

export async function deleteNotificationTarget(input: {
  workspace_slug: string;
  id: string;
}): Promise<Result<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("notification_targets")
    .delete()
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}/settings`);
  revalidatePath(`/${input.workspace_slug}/settings/channels`);
  return { ok: true, data: null };
}

export async function testNotificationTarget(input: {
  workspace_id: string;
  target_id: string;
}): Promise<Result<{ label?: string; status?: number }>> {
  const supabase = await createSupabaseServerClient();
  const { data: row, error } = await supabase
    .from("notification_targets")
    .select("id, workspace_id, provider, config, enabled")
    .eq("id", input.target_id)
    .eq("workspace_id", input.workspace_id)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "Kanaal niet gevonden." };

  const target = row as NotificationTarget;
  const res =
    target.provider === "slack"
      ? await testSlackTarget({ workspace_id: input.workspace_id, target })
      : target.provider === "discord"
        ? await testDiscordTarget({ workspace_id: input.workspace_id, target })
        : { ok: false as const, error: "Provider wordt hier nog niet getest." };

  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: { label: res.label, status: res.status } };
}

function normalizeConfig(
  provider: ChannelProvider,
  config: Record<string, unknown>,
): Result<Record<string, unknown>> {
  if (provider === "slack") return normalizeSlackConfig(config);
  return normalizeDiscordConfig(config);
}

function normalizeSlackConfig(
  config: Record<string, unknown>,
): Result<Record<string, unknown>> {
  const mode = stringValue(config.mode) ?? "bot_token";
  if (mode !== "bot_token" && mode !== "incoming_webhook") {
    return {
      ok: false,
      error: "Slack mode moet bot_token of incoming_webhook zijn.",
    };
  }
  if (mode === "incoming_webhook") {
    const secret = stringValue(config.webhook_url_secret_provider);
    if (!secret) {
      return { ok: false, error: "Slack webhook secretnaam is verplicht." };
    }
    return {
      ok: true,
      data: {
        mode,
        webhook_url_secret_provider: secret,
        thread_ts: stringValue(config.thread_ts),
      },
    };
  }

  const channelId = stringValue(config.channel_id);
  if (!channelId) return { ok: false, error: "Slack channel_id is verplicht." };
  return {
    ok: true,
    data: {
      mode,
      channel_id: channelId,
      team_id: stringValue(config.team_id),
      thread_ts: stringValue(config.thread_ts),
    },
  };
}

function normalizeDiscordConfig(
  config: Record<string, unknown>,
): Result<Record<string, unknown>> {
  const mode = stringValue(config.mode) ?? "bot_token";
  if (mode !== "bot_token" && mode !== "webhook") {
    return { ok: false, error: "Discord mode moet bot_token of webhook zijn." };
  }
  if (mode === "webhook") {
    const secret = stringValue(config.webhook_url_secret_provider);
    if (!secret) {
      return { ok: false, error: "Discord webhook secretnaam is verplicht." };
    }
    return {
      ok: true,
      data: {
        mode,
        webhook_url_secret_provider: secret,
        thread_id: stringValue(config.thread_id),
      },
    };
  }

  const channelId = stringValue(config.channel_id);
  if (!channelId)
    return { ok: false, error: "Discord channel_id is verplicht." };
  return {
    ok: true,
    data: {
      mode,
      channel_id: channelId,
      guild_id: stringValue(config.guild_id),
      thread_id: stringValue(config.thread_id),
    },
  };
}
