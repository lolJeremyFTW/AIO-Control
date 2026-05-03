// Handles inline_keyboard button clicks. callback_data is a short
// "verb:arg" string we generate when the run-event dispatcher builds
// a report. We resolve the verb here, run the action, then reply
// via answerCallbackQuery (toast at the top of Telegram) + edit the
// original message to remove the buttons (so users can't double-tap).
//
// Verbs supported:
//   run_again:<agent_id>       → queue another run for the agent
//   approve:<queue_id>         → resolve queue item with approve
//   reject:<queue_id>          → resolve queue item with reject

import "server-only";

import { resolveApiKey } from "../api-keys/resolve";
import { dispatchRun } from "../dispatch/runs";
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

  // Find which workspace this chat is associated with — we route via
  // telegram_targets just like the inbound text-message flow.
  const supabase = getServiceRoleSupabase();
  const chatId = String(cb.message.chat.id);
  const { data: targets } = await supabase
    .from("telegram_targets")
    .select("id, workspace_id, allowlist, denylist, enabled")
    .eq("chat_id", chatId);

  const target = (targets ?? []).find((t) => {
    if (!t.enabled) return false;
    const lc = cb.from.username?.toLowerCase().replace(/^@/, "") ?? "";
    if (
      t.denylist?.some(
        (u: string) => u.toLowerCase().replace(/^@/, "") === lc,
      )
    )
      return false;
    if (
      t.allowlist?.length > 0 &&
      !t.allowlist.some(
        (u: string) => u.toLowerCase().replace(/^@/, "") === lc,
      )
    )
      return false;
    return true;
  }) as
    | {
        id: string;
        workspace_id: string;
      }
    | undefined;

  if (!target) {
    // Without target we don't know which workspace's bot token to
    // use for answerCallbackQuery — silently drop. The user just
    // sees a spinner that times out, which is acceptable for a
    // not-allowed click.
    return;
  }

  // Resolve the workspace's Telegram bot token now so we can both
  // answerCallbackQuery and edit the keyboard with the same value.
  const token = await resolveApiKey("telegram", {
    workspaceId: target.workspace_id,
  });

  const [verb, arg] = cb.data.split(":");
  let resultText = "Klaar.";
  let success = true;

  try {
    if (verb === "run_again" && arg) {
      const r = await runAgain(target.workspace_id, arg);
      resultText = r.ok ? `▶ Run gestart (${r.runId.slice(0, 8)})` : r.error;
      success = r.ok;
    } else if (verb === "approve" && arg) {
      const r = await decideQueue(target.workspace_id, arg, "approve");
      resultText = r.ok ? "✓ Approved" : r.error;
      success = r.ok;
    } else if (verb === "reject" && arg) {
      const r = await decideQueue(target.workspace_id, arg, "reject");
      resultText = r.ok ? "✗ Rejected" : r.error;
      success = r.ok;
    } else {
      resultText = `Onbekende actie: ${verb}`;
      success = false;
    }
  } catch (err) {
    success = false;
    resultText = err instanceof Error ? err.message : "callback faalde";
  }

  await answer(cb.id, resultText, !success, token);

  // Strip the inline keyboard so the same button can't be tapped twice.
  if (success && cb.message && token) {
    await fetch(
      `https://api.telegram.org/bot${token}/editMessageReplyMarkup`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: cb.message.chat.id,
          message_id: cb.message.message_id,
          reply_markup: { inline_keyboard: [] },
        }),
      },
    ).catch(() => null);
  }
}

async function runAgain(
  workspaceId: string,
  agentId: string,
): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
  const supabase = getServiceRoleSupabase();
  const { data: agent } = await supabase
    .from("agents")
    .select("id, business_id, nav_node_id, archived_at")
    .eq("id", agentId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!agent || agent.archived_at) {
    return { ok: false, error: "Agent niet gevonden of gearchiveerd." };
  }
  const { data: run, error } = await supabase
    .from("runs")
    .insert({
      workspace_id: workspaceId,
      agent_id: agent.id,
      business_id: agent.business_id,
      nav_node_id: agent.nav_node_id ?? null,
      triggered_by: "telegram",
      status: "queued",
      input: { source: "telegram_callback" },
    })
    .select("id")
    .single();
  if (error || !run) return { ok: false, error: error?.message ?? "insert" };
  void dispatchRun(run.id).catch(() => null);
  return { ok: true, runId: run.id };
}

async function decideQueue(
  workspaceId: string,
  queueIdOrPrefix: string,
  decision: "approve" | "reject",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getServiceRoleSupabase();
  const filter =
    queueIdOrPrefix.length === 36
      ? supabase
          .from("queue_items")
          .select("id")
          .eq("id", queueIdOrPrefix)
      : supabase
          .from("queue_items")
          .select("id")
          .eq("workspace_id", workspaceId)
          .ilike("id", `${queueIdOrPrefix}%`);
  const { data } = await filter.limit(2);
  if (!data || data.length === 0) {
    return { ok: false, error: "Item niet gevonden." };
  }
  if (data.length > 1) return { ok: false, error: "Ambigue id." };
  const { error } = await supabase
    .from("queue_items")
    .update({
      state: "auto",
      decision,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", data[0]!.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// answerCallbackQuery — gives the user a tiny toast in Telegram
// confirming the action. show_alert=true makes it a full popup
// instead, used for errors.
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
