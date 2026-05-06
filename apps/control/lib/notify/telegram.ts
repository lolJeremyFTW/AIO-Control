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
  /** Optional inline buttons. Each row is an array of buttons. A
   *  button is either a URL deep-link or a callback (server-side
   *  action via the inbound webhook). */
  buttons?: {
    text: string;
    url?: string;
    callback_data?: string;
  }[][];
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
    ...(opts.parse_mode ? { parse_mode: opts.parse_mode } : {}),
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

// ─── Forum topic management ─────────────────────────────────────────
// Used by the auto-topic flow: when a business is created we mint a
// new forum topic in the workspace's "parent" group; when the
// business is renamed we update the topic title; when it's archived
// we close the topic. Each helper returns OK/error so the caller can
// log without blocking the underlying business operation.

export async function telegramCreateForumTopic(opts: {
  workspace_id: string;
  chat_id: string;
  name: string;
  /** Optional emoji icon — Telegram accepts a unicode codepoint in
   *  the icon_color OR a custom_emoji_id. We pass plain icon_color
   *  picked from the safe presets (see Telegram docs). */
  icon_color?: number;
}): Promise<
  | { ok: true; message_thread_id: number }
  | { ok: false; error: string }
> {
  const token = await resolveApiKey("telegram", {
    workspaceId: opts.workspace_id,
  });
  if (!token) return { ok: false, error: "geen telegram bot token" };
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/createForumTopic`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: opts.chat_id,
          name: opts.name.slice(0, 128), // Telegram limit
          icon_color: opts.icon_color ?? 7322096, // default sky-blue
        }),
      },
    );
    const data = (await res.json()) as {
      ok?: boolean;
      result?: { message_thread_id?: number };
      description?: string;
    };
    if (!data.ok || !data.result?.message_thread_id) {
      return {
        ok: false,
        error:
          data.description ??
          "createForumTopic faalde — is de bot admin met can_manage_topics?",
      };
    }
    return { ok: true, message_thread_id: data.result.message_thread_id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "network error",
    };
  }
}

export async function telegramEditForumTopic(opts: {
  workspace_id: string;
  chat_id: string;
  message_thread_id: number;
  name: string;
}): Promise<{ ok: boolean; error?: string }> {
  const token = await resolveApiKey("telegram", {
    workspaceId: opts.workspace_id,
  });
  if (!token) return { ok: false, error: "geen telegram bot token" };
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/editForumTopic`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: opts.chat_id,
          message_thread_id: opts.message_thread_id,
          name: opts.name.slice(0, 128),
        }),
      },
    );
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!data.ok)
      return { ok: false, error: data.description ?? "editForumTopic faalde" };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "network error",
    };
  }
}

export async function telegramCloseForumTopic(opts: {
  workspace_id: string;
  chat_id: string;
  message_thread_id: number;
}): Promise<{ ok: boolean; error?: string }> {
  const token = await resolveApiKey("telegram", {
    workspaceId: opts.workspace_id,
  });
  if (!token) return { ok: false, error: "geen telegram bot token" };
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/closeForumTopic`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: opts.chat_id,
          message_thread_id: opts.message_thread_id,
        }),
      },
    );
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (!data.ok)
      return { ok: false, error: data.description ?? "closeForumTopic faalde" };
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
