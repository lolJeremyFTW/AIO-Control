import { createHmac, timingSafeEqual } from "crypto";

import { NextResponse } from "next/server";

import { resolveApiKey } from "../../../../../lib/api-keys/resolve";
import { dispatchNotificationCommand } from "../../../../../lib/notify/commands";
import {
  findSlackInboundTarget,
  inboundUserAllowed,
} from "../../../../../lib/notify/inbound-targets";
import { getServiceRoleSupabase } from "../../../../../lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text();
  const form = new URLSearchParams(raw);
  const teamId = value(form, "team_id");
  const channelId = value(form, "channel_id");
  const userId = value(form, "user_id");
  const userName = value(form, "user_name");
  const command = value(form, "command") ?? "/aio";
  const text = value(form, "text") ?? "";

  const target = await findSlackInboundTarget({ teamId, channelId });
  if (!target) return unauthorized();

  const signingSecret = await resolveApiKey("slack_signing_secret", {
    workspaceId: target.workspace_id,
  });
  if (
    !verifySlackSignature({
      raw,
      timestamp: req.headers.get("x-slack-request-timestamp"),
      signature: req.headers.get("x-slack-signature"),
      signingSecret,
    })
  ) {
    return unauthorized();
  }

  if (!inboundUserAllowed(target, [userId, userName])) {
    return slackReply("Je mag dit Slack-kanaal niet gebruiken voor AIO.");
  }

  const rawFields = Object.fromEntries(form.entries());
  const supabase = getServiceRoleSupabase();
  const { data: inbound } = await supabase
    .from("notification_inbound")
    .insert({
      workspace_id: target.workspace_id,
      target_id: target.id,
      provider: "slack",
      external_channel_id: channelId,
      external_thread_id: value(form, "thread_ts"),
      external_user_id: userId,
      external_username: userName,
      command: `${command} ${text}`.trim(),
      text,
      raw: rawFields,
    })
    .select("id")
    .single();

  let replyText = "";
  await dispatchNotificationCommand(
    {
      workspace_id: target.workspace_id,
      provider: "slack",
      target_id: target.id,
      inbound_id: (inbound as { id?: string } | null)?.id ?? null,
      external_user_id: userId,
      external_username: userName,
      reply: async (body) => {
        replyText = body;
      },
    },
    `${command} ${text}`.trim(),
  );

  return slackReply(replyText || "Klaar.");
}

function verifySlackSignature(input: {
  raw: string;
  timestamp: string | null;
  signature: string | null;
  signingSecret: string | null;
}): boolean {
  if (!input.timestamp || !input.signature || !input.signingSecret) {
    return false;
  }

  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 5 * 60) return false;

  const base = `v0:${input.timestamp}:${input.raw}`;
  const expected = `v0=${createHmac("sha256", input.signingSecret)
    .update(base)
    .digest("hex")}`;

  const given = Buffer.from(input.signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (given.length !== expectedBuffer.length) return false;
  return timingSafeEqual(given, expectedBuffer);
}

function slackReply(text: string) {
  return NextResponse.json({
    response_type: "ephemeral",
    text: truncate(text, 2900),
  });
}

function unauthorized() {
  return new NextResponse("invalid signature", { status: 401 });
}

function value(form: URLSearchParams, key: string): string | null {
  const raw = form.get(key);
  return raw && raw.trim() ? raw.trim() : null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}
