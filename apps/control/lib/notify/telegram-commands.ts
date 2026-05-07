// Telegram command adapter around the provider-neutral command dispatcher.
// Telegram still has its legacy telegram_inbound table, so this wrapper
// marks both the legacy row and the shared notification_inbound row when
// a command starts a run or resolves a queue item.

import "server-only";

import { dispatchNotificationCommand } from "./commands";
import { sendTelegram } from "./telegram";
import { getServiceRoleSupabase } from "../supabase/service";

type InboundCtx = {
  workspace_id: string;
  target_id: string;
  chat_id: string;
  message_thread_id: number | null;
  inbound_id: string;
  notification_inbound_id?: string | null;
  text: string;
  from_user_id?: string | null;
  from_username: string | null;
};

export async function dispatchTelegramCommand(ctx: InboundCtx): Promise<void> {
  const text = ctx.text.trim();
  if (!text.startsWith("/")) return;

  await dispatchNotificationCommand(
    {
      workspace_id: ctx.workspace_id,
      provider: "telegram",
      target_id: ctx.target_id,
      inbound_id: ctx.notification_inbound_id ?? null,
      external_user_id: ctx.from_user_id ?? null,
      external_username: ctx.from_username,
      reply: (body) => replyTo(ctx, body),
      markDispatched: async (kind, id) => {
        const supabase = getServiceRoleSupabase();
        await Promise.all([
          supabase
            .from("telegram_inbound")
            .update({ dispatched_to: kind, dispatched_id: id })
            .eq("id", ctx.inbound_id),
          ctx.notification_inbound_id
            ? supabase
                .from("notification_inbound")
                .update({ dispatched_to: kind, dispatched_id: id })
                .eq("id", ctx.notification_inbound_id)
            : Promise.resolve(),
        ]);
      },
    },
    text,
  );
}

async function replyTo(ctx: InboundCtx, text: string): Promise<void> {
  const supabase = getServiceRoleSupabase();
  const { data: target } = await supabase
    .from("telegram_targets")
    .select("id, workspace_id, chat_id, topic_id, enabled")
    .eq("id", ctx.target_id)
    .maybeSingle();
  if (!target || !text) return;

  await sendTelegram({
    workspace_id: ctx.workspace_id,
    target,
    text,
    parse_mode: "Markdown",
  });
}
