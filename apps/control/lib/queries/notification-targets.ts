import "server-only";

import { createSupabaseServerClient } from "../supabase/server";
import type { NotificationBindingOwnerType } from "../notify/bindings";

export type NotificationTargetChoice = {
  id: string;
  name: string;
  provider: "slack" | "discord";
};

export type NotificationBindingOwner = {
  owner_type: NotificationBindingOwnerType;
  owner_id: string;
};

export async function listSlackDiscordNotificationTargets(
  workspaceId: string,
): Promise<NotificationTargetChoice[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("notification_targets")
    .select("id, name, provider")
    .eq("workspace_id", workspaceId)
    .in("provider", ["slack", "discord"])
    .eq("enabled", true)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listSlackDiscordNotificationTargets failed", error);
    return [];
  }
  return (data ?? []) as NotificationTargetChoice[];
}

export async function listNotificationBindingsForOwners(
  workspaceId: string,
  owners: NotificationBindingOwner[],
): Promise<Record<string, string[]>> {
  const uniqueOwners = dedupeOwners(owners);
  if (uniqueOwners.length === 0) return {};

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("notification_bindings")
    .select("owner_type, owner_id, target_id")
    .eq("workspace_id", workspaceId)
    .in("owner_type", [
      ...new Set(uniqueOwners.map((owner) => owner.owner_type)),
    ])
    .in("owner_id", [...new Set(uniqueOwners.map((owner) => owner.owner_id))]);
  if (error) {
    console.error("listNotificationBindingsForOwners failed", error);
    return {};
  }

  const ownerSet = new Set(
    uniqueOwners.map((owner) => bindingKey(owner.owner_type, owner.owner_id)),
  );
  const byOwner: Record<string, string[]> = {};
  for (const row of (data ?? []) as Array<{
    owner_type: NotificationBindingOwnerType;
    owner_id: string;
    target_id: string;
  }>) {
    const key = bindingKey(row.owner_type, row.owner_id);
    if (!ownerSet.has(key)) continue;
    const targetIds = byOwner[row.owner_id] ?? [];
    targetIds.push(row.target_id);
    byOwner[row.owner_id] = targetIds;
  }
  return byOwner;
}

function dedupeOwners(
  owners: NotificationBindingOwner[],
): NotificationBindingOwner[] {
  const byKey = new Map<string, NotificationBindingOwner>();
  for (const owner of owners) {
    if (!owner.owner_id) continue;
    byKey.set(bindingKey(owner.owner_type, owner.owner_id), owner);
  }
  return [...byKey.values()];
}

function bindingKey(ownerType: NotificationBindingOwnerType, ownerId: string) {
  return `${ownerType}:${ownerId}`;
}
