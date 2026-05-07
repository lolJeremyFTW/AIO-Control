import "server-only";

import { stringValue } from "./providers/types";
import { getServiceRoleSupabase } from "../supabase/service";

export type InboundNotificationTarget = {
  id: string;
  workspace_id: string;
  provider: "slack" | "discord";
  config: Record<string, unknown>;
  allowlist: string[];
  denylist: string[];
  enabled: boolean;
};

export async function findSlackInboundTarget(input: {
  teamId: string | null;
  channelId: string | null;
}): Promise<InboundNotificationTarget | null> {
  if (!input.channelId) return null;

  const supabase = getServiceRoleSupabase();
  const { data } = await supabase
    .from("notification_targets")
    .select("id, workspace_id, provider, config, allowlist, denylist, enabled")
    .eq("provider", "slack")
    .eq("enabled", true)
    .order("created_at", { ascending: true });

  return (
    ((data ?? []) as InboundNotificationTarget[]).find((target) => {
      const channelId = stringValue(target.config.channel_id);
      const teamId = stringValue(target.config.team_id);
      return (
        channelId === input.channelId &&
        (!teamId || !input.teamId || teamId === input.teamId)
      );
    }) ?? null
  );
}

export async function findDiscordInboundTarget(input: {
  guildId: string | null;
  channelId: string | null;
}): Promise<InboundNotificationTarget | null> {
  if (!input.channelId) return null;

  const supabase = getServiceRoleSupabase();
  const { data } = await supabase
    .from("notification_targets")
    .select("id, workspace_id, provider, config, allowlist, denylist, enabled")
    .eq("provider", "discord")
    .eq("enabled", true)
    .order("created_at", { ascending: true });

  return (
    ((data ?? []) as InboundNotificationTarget[]).find((target) => {
      const channelId = stringValue(target.config.channel_id);
      const threadId = stringValue(target.config.thread_id);
      const guildId = stringValue(target.config.guild_id);
      const channelMatches =
        channelId === input.channelId || threadId === input.channelId;
      return (
        channelMatches &&
        (!guildId || !input.guildId || guildId === input.guildId)
      );
    }) ?? null
  );
}

export function inboundUserAllowed(
  target: Pick<InboundNotificationTarget, "allowlist" | "denylist">,
  identities: Array<string | null | undefined>,
): boolean {
  const normalized = identities.map(normalizeIdentity).filter(Boolean);
  if (normalized.length === 0) return (target.allowlist ?? []).length === 0;

  const deny = (target.denylist ?? []).map(normalizeIdentity).filter(Boolean);
  if (normalized.some((identity) => deny.includes(identity))) return false;

  const allow = (target.allowlist ?? []).map(normalizeIdentity).filter(Boolean);
  if (allow.length === 0) return true;
  return normalized.some((identity) => allow.includes(identity));
}

function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/^@/, "").trim();
}
