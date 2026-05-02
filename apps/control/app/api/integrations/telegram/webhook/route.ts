// Telegram inbound webhook. The user sets this URL in Telegram via:
//
//   curl -F "url=https://aio.tromptech.life/api/integrations/telegram/webhook?secret=<X>"
//        https://api.telegram.org/bot<TOKEN>/setWebhook
//
// We authenticate by matching ?secret= against TELEGRAM_WEBHOOK_SECRET
// in env (single global gate — Telegram doesn't support per-bot
// secrets in the URL itself reliably).
//
// Inbound flow:
//   1. Find any telegram_target whose chat_id matches the incoming
//      message's chat.id (across all workspaces — service role).
//   2. Check the sender's username against the target's allowlist /
//      denylist. If denied: 200 OK + silent drop.
//   3. Otherwise: log the message into a new `telegram_inbound`
//      table for downstream processing.
//
// Phase 1 (this commit) just logs + acks. Phase 2 will dispatch
// commands like /run <agent>, /approve <queue_id> via these messages.

import { NextResponse } from "next/server";

import { dispatchTelegramCallback } from "../../../../../lib/notify/telegram-callbacks";
import { dispatchTelegramCommand } from "../../../../../lib/notify/telegram-commands";
import { getServiceRoleSupabase } from "../../../../../lib/supabase/service";

export const dynamic = "force-dynamic";

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
};
type TelegramChat = {
  id: number;
  type: string;
  title?: string;
};
type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  message_thread_id?: number;
  date: number;
};
type TelegramCallback = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
  chat_instance?: string;
};
type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  callback_query?: TelegramCallback;
};

export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? "";
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  // Always 200 to Telegram so it doesn't retry; just silently drop on
  // mismatch.
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: true });
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) return NextResponse.json({ ok: true });

  // Inline-keyboard button click. Same allow/deny rules as messages,
  // but the action is a structured callback_data string we routed
  // ourselves (e.g. "run_again:<agent_id>"). Don't await — Telegram
  // expects a quick 200 + answerCallbackQuery to acknowledge.
  if (update.callback_query) {
    void dispatchTelegramCallback(update.callback_query).catch((err) => {
      console.error("dispatchTelegramCallback failed", err);
    });
    return NextResponse.json({ ok: true });
  }

  const msg = update.message ?? update.edited_message ?? update.channel_post;
  if (!msg) return NextResponse.json({ ok: true });

  const supabase = getServiceRoleSupabase();
  // Find target(s) for this chat_id. Multiple workspaces may share a
  // chat_id (unlikely but possible) — we log per match.
  const chatId = String(msg.chat.id);
  const { data: targets } = await supabase
    .from("telegram_targets")
    .select("id, workspace_id, allowlist, denylist, enabled")
    .eq("chat_id", chatId);

  if (!targets || targets.length === 0) {
    return NextResponse.json({ ok: true, ignored: "unknown_chat" });
  }

  const username = msg.from?.username ?? null;
  const lcUser = username?.toLowerCase() ?? null;

  for (const t of targets as {
    id: string;
    workspace_id: string;
    allowlist: string[];
    denylist: string[];
    enabled: boolean;
  }[]) {
    if (!t.enabled) continue;

    // Allowlist (if set) must include the user; denylist always blocks.
    const allowed =
      lcUser != null &&
      (!t.allowlist || t.allowlist.length === 0
        ? true
        : t.allowlist
            .map((u) => u.toLowerCase().replace(/^@/, ""))
            .includes(lcUser));
    const denied =
      lcUser != null &&
      (t.denylist ?? [])
        .map((u) => u.toLowerCase().replace(/^@/, ""))
        .includes(lcUser);

    if (denied || !allowed) continue;

    // Log it. The table is created by migration 017 below.
    const { data: inbound } = await supabase
      .from("telegram_inbound")
      .insert({
        workspace_id: t.workspace_id,
        target_id: t.id,
        chat_id: chatId,
        message_thread_id: msg.message_thread_id ?? null,
        from_user_id: msg.from?.id ?? null,
        from_username: username,
        text: msg.text ?? null,
        raw: msg as unknown as object,
      })
      .select("id")
      .single();

    // Dispatch slash-commands. Don't await — Telegram retries on
    // timeout, so we want to ack fast and let dispatch run async.
    if (inbound && msg.text?.trim().startsWith("/")) {
      void dispatchTelegramCommand({
        workspace_id: t.workspace_id,
        target_id: t.id,
        chat_id: chatId,
        message_thread_id: msg.message_thread_id ?? null,
        inbound_id: (inbound as { id: string }).id,
        text: msg.text,
        from_username: username,
      }).catch((err) => {
        console.error("dispatchTelegramCommand failed", err);
      });
    }
  }

  return NextResponse.json({ ok: true });
}
