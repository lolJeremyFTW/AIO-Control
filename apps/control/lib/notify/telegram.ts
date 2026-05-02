// Telegram sender. Uses the bot token stored in api_keys
// (provider='telegram') resolved through the tiered hierarchy. The
// chat_id + topic_id come from a telegram_targets row.
//
// Two events ride this path:
//   - run.done   — agent run completed; we send "✅ <agent>: <summary>"
//   - run.failed — failed run; we send "❌ <agent>: <error_text>"
//   - queue.review — HITL item needs attention
//
// Allowlist / denylist enforcement is for INBOUND commands (future);
// outbound notifications go to whoever is in the chat. We keep them on
// the row so the future inbound flow has them ready.

import "server-only";

import { resolveApiKey } from "../api-keys/resolve";

export type TelegramTarget = {
  id: string;
  workspace_id: string;
  chat_id: string;
  topic_id: number | null;
  enabled: boolean;
};

export async function sendTelegram(opts: {
  workspace_id: string;
  business_id?: string | null;
  nav_node_id?: string | null;
  target: TelegramTarget;
  text: string;
  /** Markdown / HTML rendering. We default to "MarkdownV2" so links
   *  and *bold* render — but the caller MUST escape any reserved
   *  characters or pre-format the text. */
  parse_mode?: "MarkdownV2" | "HTML" | "Markdown";
  /** Optional inline buttons. Each row is an array of buttons. */
  buttons?: { text: string; url: string }[][];
}): Promise<{ ok: boolean; error?: string }> {
  if (!opts.target.enabled) return { ok: false, error: "target_disabled" };

  const token = await resolveApiKey("telegram", {
    workspaceId: opts.workspace_id,
    businessId: opts.business_id,
    navNodeId: opts.nav_node_id,
  });
  if (!token) {
    return {
      ok: false,
      error:
        "geen Telegram bot token gevonden — voeg er één toe via Settings → API Keys (provider=telegram)",
    };
  }

  const body: Record<string, unknown> = {
    chat_id: opts.target.chat_id,
    text: opts.text,
    parse_mode: opts.parse_mode ?? "Markdown",
    disable_web_page_preview: true,
  };
  if (opts.target.topic_id != null) {
    body.message_thread_id = opts.target.topic_id;
  }
  if (opts.buttons && opts.buttons.length > 0) {
    body.reply_markup = { inline_keyboard: opts.buttons };
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { ok: false, error: `${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "network error",
    };
  }
}

/** getMe — used by the "Test bot" button in settings. Returns the bot
 *  username so the user knows their token is valid. */
export async function telegramGetMe(opts: {
  workspace_id: string;
}): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  const token = await resolveApiKey("telegram", {
    workspaceId: opts.workspace_id,
  });
  if (!token) return { ok: false, error: "geen telegram token gevonden" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = (await res.json()) as {
      ok?: boolean;
      result?: { username?: string };
      description?: string;
    };
    if (!data.ok || !data.result?.username) {
      return { ok: false, error: data.description ?? "getMe faalde" };
    }
    return { ok: true, username: data.result.username };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "network error",
    };
  }
}
