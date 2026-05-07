import { createPublicKey, verify } from "crypto";

import { NextResponse } from "next/server";

import {
  resolveApiKey,
  resolveApiKeyEnvFallback,
} from "../../../../../lib/api-keys/resolve";
import {
  dispatchNotificationAction,
  dispatchNotificationCommand,
} from "../../../../../lib/notify/commands";
import {
  findDiscordInboundTarget,
  inboundUserAllowed,
} from "../../../../../lib/notify/inbound-targets";
import { getServiceRoleSupabase } from "../../../../../lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DiscordUser = {
  id?: string;
  username?: string;
  global_name?: string;
};

type DiscordOption = {
  name?: string;
  type?: number;
  value?: string | number | boolean;
  options?: DiscordOption[];
};

type DiscordInteraction = {
  type?: number;
  guild_id?: string;
  channel_id?: string;
  member?: { user?: DiscordUser; nick?: string };
  user?: DiscordUser;
  data?: {
    name?: string;
    custom_id?: string;
    options?: DiscordOption[];
  };
};

const DISCORD_PING = 1;
const DISCORD_APPLICATION_COMMAND = 2;
const DISCORD_MESSAGE_COMPONENT = 3;

export async function POST(req: Request) {
  const raw = await req.text();
  const payload = parsePayload(raw);
  if (!payload) return new NextResponse("bad payload", { status: 400 });

  const target = await findDiscordInboundTarget({
    guildId: payload.guild_id ?? null,
    channelId: payload.channel_id ?? null,
  });
  const publicKey = target
    ? await resolveApiKey("discord_public_key", {
        workspaceId: target.workspace_id,
      })
    : resolveApiKeyEnvFallback("discord_public_key");

  if (
    !verifyDiscordSignature({
      raw,
      timestamp: req.headers.get("x-signature-timestamp"),
      signature: req.headers.get("x-signature-ed25519"),
      publicKey,
    })
  ) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  if (payload.type === DISCORD_PING) {
    return NextResponse.json({ type: 1 });
  }

  if (!target) {
    return discordReply("Dit Discord-kanaal is nog niet gekoppeld aan AIO.");
  }

  const user = payload.member?.user ?? payload.user ?? {};
  const userId = user.id ?? null;
  const userName =
    payload.member?.nick ?? user.global_name ?? user.username ?? null;

  if (!inboundUserAllowed(target, [userId, userName, user.username])) {
    return discordReply("Je mag dit Discord-kanaal niet gebruiken voor AIO.");
  }

  if (payload.type === DISCORD_APPLICATION_COMMAND) {
    return handleCommand(
      payload,
      target.id,
      target.workspace_id,
      userId,
      userName,
    );
  }

  if (payload.type === DISCORD_MESSAGE_COMPONENT) {
    return handleAction(
      payload,
      target.id,
      target.workspace_id,
      userId,
      userName,
    );
  }

  return discordReply("Deze Discord-interactie wordt nog niet ondersteund.");
}

async function handleCommand(
  payload: DiscordInteraction,
  targetId: string,
  workspaceId: string,
  userId: string | null,
  userName: string | null,
) {
  const command = discordCommandText(payload);
  const supabase = getServiceRoleSupabase();
  const { data: inbound } = await supabase
    .from("notification_inbound")
    .insert({
      workspace_id: workspaceId,
      target_id: targetId,
      provider: "discord",
      external_channel_id: payload.channel_id ?? null,
      external_thread_id: payload.channel_id ?? null,
      external_user_id: userId,
      external_username: userName,
      command,
      text: command,
      raw: payload as unknown as object,
    })
    .select("id")
    .single();

  let replyText = "";
  await dispatchNotificationCommand(
    {
      workspace_id: workspaceId,
      provider: "discord",
      target_id: targetId,
      inbound_id: (inbound as { id?: string } | null)?.id ?? null,
      external_user_id: userId,
      external_username: userName,
      reply: async (body) => {
        replyText = body;
      },
    },
    command,
  );

  return discordReply(replyText || "Klaar.");
}

async function handleAction(
  payload: DiscordInteraction,
  targetId: string,
  workspaceId: string,
  userId: string | null,
  userName: string | null,
) {
  const action = payload.data?.custom_id;
  if (!action) return discordReply("Geen actie gevonden.");

  const supabase = getServiceRoleSupabase();
  const { data: inbound } = await supabase
    .from("notification_inbound")
    .insert({
      workspace_id: workspaceId,
      target_id: targetId,
      provider: "discord",
      external_channel_id: payload.channel_id ?? null,
      external_thread_id: payload.channel_id ?? null,
      external_user_id: userId,
      external_username: userName,
      command: action,
      text: action,
      raw: payload as unknown as object,
    })
    .select("id")
    .single();

  let replyText = "";
  await dispatchNotificationAction(
    {
      workspace_id: workspaceId,
      provider: "discord",
      target_id: targetId,
      inbound_id: (inbound as { id?: string } | null)?.id ?? null,
      external_user_id: userId,
      external_username: userName,
      reply: async (body) => {
        replyText = body;
      },
    },
    action,
  );

  return discordReply(replyText || "Klaar.");
}

function discordCommandText(payload: DiscordInteraction): string {
  const data = payload.data;
  const name = data?.name?.trim() || "aio";
  const options = data?.options ?? [];
  const first = options[0];

  if (name === "aio") {
    if (first?.type === 1 && first.name) {
      return `${first.name} ${optionValues(first.options ?? [])}`.trim();
    }
    const textOption = options.find((option) =>
      ["command", "text", "query"].includes(option.name ?? ""),
    );
    if (textOption?.value != null) return String(textOption.value);
    return optionValues(options) || "help";
  }

  return `${name} ${optionValues(options)}`.trim();
}

function optionValues(options: DiscordOption[]): string {
  return options
    .filter((option) => option.value != null)
    .map((option) => String(option.value))
    .join(" ")
    .trim();
}

function parsePayload(raw: string): DiscordInteraction | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as DiscordInteraction;
  } catch {
    return null;
  }
}

function verifyDiscordSignature(input: {
  raw: string;
  timestamp: string | null;
  signature: string | null;
  publicKey: string | null;
}): boolean {
  if (!input.timestamp || !input.signature || !input.publicKey) return false;

  try {
    const publicKeyBytes = Buffer.from(input.publicKey, "hex");
    const signature = Buffer.from(input.signature, "hex");
    if (publicKeyBytes.length !== 32 || signature.length !== 64) return false;

    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const key = createPublicKey({
      key: Buffer.concat([spkiPrefix, publicKeyBytes]),
      format: "der",
      type: "spki",
    });

    return verify(
      null,
      Buffer.from(`${input.timestamp}${input.raw}`, "utf8"),
      key,
      signature,
    );
  } catch {
    return false;
  }
}

function discordReply(content: string) {
  return NextResponse.json({
    type: 4,
    data: {
      content: truncate(content, 1900),
      flags: 64,
    },
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}
