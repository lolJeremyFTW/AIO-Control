import "server-only";

import { resolveApiKey } from "../../api-keys/resolve";
import {
  stringValue,
  truncateMessage,
  type NotificationTarget,
  type SendResult,
} from "./types";

export async function sendDiscordText(opts: {
  workspace_id: string;
  target: NotificationTarget;
  text: string;
}): Promise<SendResult> {
  if (!opts.target.enabled) return { ok: false, error: "target_disabled" };

  const mode = stringValue(opts.target.config.mode) ?? "bot_token";
  if (mode === "webhook") return sendDiscordWebhookText(opts);
  return sendDiscordBotText(opts);
}

export async function testDiscordTarget(opts: {
  workspace_id: string;
  target: NotificationTarget;
}): Promise<SendResult> {
  return sendDiscordText({
    workspace_id: opts.workspace_id,
    target: opts.target,
    text: "AIO Control test: Discord kanaal is bereikbaar.",
  });
}

async function sendDiscordBotText(opts: {
  workspace_id: string;
  target: NotificationTarget;
  text: string;
}): Promise<SendResult> {
  const channelId = stringValue(opts.target.config.channel_id);
  if (!channelId) return { ok: false, error: "Discord channel_id ontbreekt." };

  const token = await resolveApiKey("discord_bot_token", {
    workspaceId: opts.workspace_id,
  });
  if (!token) {
    return {
      ok: false,
      error:
        "Geen Discord bot token gevonden. Voeg discord_bot_token toe via Settings -> API Keys.",
    };
  }

  try {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bot ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content: truncateMessage(opts.text, 1900),
        }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { ok: false, status: res.status, error: text };
    }
    return { ok: true, status: res.status, label: channelId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "network error",
    };
  }
}

async function sendDiscordWebhookText(opts: {
  workspace_id: string;
  target: NotificationTarget;
  text: string;
}): Promise<SendResult> {
  const secretProvider = stringValue(
    opts.target.config.webhook_url_secret_provider,
  );
  if (!secretProvider) {
    return {
      ok: false,
      error: "Discord webhook secretnaam ontbreekt.",
    };
  }

  const webhookUrl = await resolveApiKey(secretProvider, {
    workspaceId: opts.workspace_id,
  });
  if (!webhookUrl) {
    return {
      ok: false,
      error: `Geen secret gevonden voor ${secretProvider}.`,
    };
  }

  try {
    new URL(webhookUrl);
  } catch {
    return { ok: false, error: "Discord webhook URL is ongeldig." };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: truncateMessage(opts.text, 1900) }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return { ok: false, status: res.status, error: text };
    }
    return { ok: true, status: res.status, label: secretProvider };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "network error",
    };
  }
}
