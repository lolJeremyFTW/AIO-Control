import "server-only";

import { resolveApiKey } from "../../api-keys/resolve";
import {
  stringValue,
  truncateMessage,
  type NotificationTarget,
  type SendResult,
} from "./types";

type SlackApiResponse = {
  ok?: boolean;
  error?: string;
  channel?: string;
  ts?: string;
};

export async function sendSlackText(opts: {
  workspace_id: string;
  target: NotificationTarget;
  text: string;
}): Promise<SendResult> {
  if (!opts.target.enabled) return { ok: false, error: "target_disabled" };

  const mode = stringValue(opts.target.config.mode) ?? "bot_token";
  if (mode === "incoming_webhook") {
    return sendSlackWebhookText(opts);
  }
  return sendSlackBotText(opts);
}

export async function testSlackTarget(opts: {
  workspace_id: string;
  target: NotificationTarget;
}): Promise<SendResult> {
  return sendSlackText({
    workspace_id: opts.workspace_id,
    target: opts.target,
    text: "AIO Control test: Slack kanaal is bereikbaar.",
  });
}

async function sendSlackBotText(opts: {
  workspace_id: string;
  target: NotificationTarget;
  text: string;
}): Promise<SendResult> {
  const channel = stringValue(opts.target.config.channel_id);
  const threadTs = stringValue(opts.target.config.thread_ts);
  if (!channel) return { ok: false, error: "Slack channel_id ontbreekt." };

  const token = await resolveApiKey("slack_bot_token", {
    workspaceId: opts.workspace_id,
  });
  if (!token) {
    return {
      ok: false,
      error:
        "Geen Slack bot token gevonden. Voeg slack_bot_token toe via Settings -> API Keys.",
    };
  }

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel,
        text: truncateMessage(opts.text, 3900),
        ...(threadTs ? { thread_ts: threadTs } : {}),
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
    const data = (await res
      .json()
      .catch(() => null)) as SlackApiResponse | null;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: data?.error ?? res.statusText,
      };
    }
    if (!data?.ok) {
      return {
        ok: false,
        status: res.status,
        error: data?.error ?? "slack_api_error",
      };
    }
    return { ok: true, status: res.status, label: data.channel ?? channel };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "network error",
    };
  }
}

async function sendSlackWebhookText(opts: {
  workspace_id: string;
  target: NotificationTarget;
  text: string;
}): Promise<SendResult> {
  const secretProvider = stringValue(
    opts.target.config.webhook_url_secret_provider,
  );
  const threadTs = stringValue(opts.target.config.thread_ts);
  if (!secretProvider) {
    return {
      ok: false,
      error: "Slack webhook secretnaam ontbreekt.",
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
    return { ok: false, error: "Slack webhook URL is ongeldig." };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: truncateMessage(opts.text, 3900),
        ...(threadTs ? { thread_ts: threadTs } : {}),
      }),
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
