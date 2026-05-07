// Handles Telegram inline-keyboard button clicks. The action verbs are
// shared with Slack/Discord component payloads through commands.ts.

import "server-only";

import { handleNotificationAction } from "./commands";
import { resolveApiKey } from "../api-keys/resolve";
import { getServiceRoleSupabase } from "../supabase/service";

type TelegramCallback = {
  id: string;
  from: { id: number; username?: string };
  message?: {
    message_id: number;
    chat: { id: number };
  };
  data?: string;
};

export async function dispatchTelegramCallback(
  cb: TelegramCallback,
): Promise<void> {
  if (!cb.data || !cb.message) return;

  const supabase = getServiceRoleSupabase();
  const chatId = String(cb.message.chat.id);
  const { data: targets } = await supabase
    .from("telegram_targets")
    .select("id, workspace_id, allowlist, denylist, enabled")
    .eq("chat_id", chatId);

  const target = (targets ?? []).find((row) => {
    if (!row.enabled) return false;
    return userAllowed(cb.from.username ?? null, row.allowlist, row.denylist);
  }) as
    | {
        id: string;
        workspace_id: string;
      }
    | undefined;

  if (!target) return;

  const token = await resolveApiKey("telegram", {
    workspaceId: target.workspace_id,
  });

  const { data: inbound } = await supabase
    .from("notification_inbound")
    .insert({
      workspace_id: target.workspace_id,
      target_id: null,
      provider: "telegram",
      external_channel_id: chatId,
      external_user_id: String(cb.from.id),
      external_username: cb.from.username ?? null,
      command: cb.data,
      text: cb.data,
      raw: cb as unknown as object,
    })
    .select("id")
    .single();

  let resultText = "Klaar.";
  let success = true;
  try {
    const outcome = await handleNotificationAction(
      {
        workspace_id: target.workspace_id,
        provider: "telegram",
        target_id: target.id,
        inbound_id: (inbound as { id?: string } | null)?.id ?? null,
        external_user_id: String(cb.from.id),
        external_username: cb.from.username ?? null,
        reply: async (text) => {
          resultText = text;
        },
      },
      cb.data,
    );
    resultText = outcome.text || resultText;
    success = outcome.ok;
    if (outcome.dispatched_to && outcome.dispatched_id && inbound) {
      await supabase
        .from("notification_inbound")
        .update({
          dispatched_to: outcome.dispatched_to,
          dispatched_id: outcome.dispatched_id,
        })
        .eq("id", (inbound as { id: string }).id);
    }
  } catch (err) {
    success = false;
    resultText = err instanceof Error ? err.message : "callback faalde";
  }

  await answer(cb.id, resultText, !success, token);

  if (success && token) {
    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: cb.message.chat.id,
        message_id: cb.message.message_id,
        reply_markup: { inline_keyboard: [] },
      }),
    }).catch(() => null);
  }
}

function userAllowed(
  username: string | null,
  allowlist: string[] | null,
  denylist: string[] | null,
): boolean {
  const value = normalizeUser(username);
  if (!value) return false;
  if ((denylist ?? []).some((user) => normalizeUser(user) === value)) {
    return false;
  }
  const allow = allowlist ?? [];
  if (allow.length === 0) return true;
  return allow.some((user) => normalizeUser(user) === value);
}

function normalizeUser(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/^@/, "").trim();
}

async function answer(
  callbackId: string,
  text: string,
  isError: boolean,
  token: string | null,
): Promise<void> {
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackId,
      text: text.slice(0, 200),
      show_alert: isError,
    }),
  }).catch(() => null);
}
