import "server-only";

import type { createSupabaseServerClient } from "../supabase/server";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type NotificationBindingOwnerType =
  | "workspace"
  | "business"
  | "navnode"
  | "agent"
  | "schedule";

const DEFAULT_EVENT_MASK = ["run_done", "run_fail"] as const;

export async function getValidNotificationTargetIds(
  supabase: SupabaseServerClient,
  workspaceId: string,
  targetIds: string[] | null | undefined,
): Promise<Result<string[]>> {
  const ids = [...new Set((targetIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { ok: true, data: [] };

  const { data, error } = await supabase
    .from("notification_targets")
    .select("id")
    .eq("workspace_id", workspaceId)
    .in("provider", ["slack", "discord"])
    .eq("enabled", true)
    .in("id", ids);
  if (error) return { ok: false, error: error.message };

  const valid = new Set(
    ((data ?? []) as Array<{ id: string }>).map((r) => r.id),
  );
  const missing = ids.filter((id) => !valid.has(id));
  if (missing.length > 0) {
    return {
      ok: false,
      error: "Een of meer Slack/Discord kanalen zijn niet meer beschikbaar.",
    };
  }

  return { ok: true, data: ids };
}

export async function replaceNotificationBindings(
  supabase: SupabaseServerClient,
  input: {
    workspaceId: string;
    ownerType: NotificationBindingOwnerType;
    ownerId: string;
    targetIds: string[] | null | undefined;
    eventMask?: string[];
  },
): Promise<Result<null>> {
  const validIds = await getValidNotificationTargetIds(
    supabase,
    input.workspaceId,
    input.targetIds,
  );
  if (!validIds.ok) return validIds;

  const { error: deleteError } = await supabase
    .from("notification_bindings")
    .delete()
    .eq("workspace_id", input.workspaceId)
    .eq("owner_type", input.ownerType)
    .eq("owner_id", input.ownerId);
  if (deleteError) return { ok: false, error: deleteError.message };

  if (validIds.data.length === 0) return { ok: true, data: null };

  const eventMask = input.eventMask ?? [...DEFAULT_EVENT_MASK];
  const { error: insertError } = await supabase
    .from("notification_bindings")
    .insert(
      validIds.data.map((targetId) => ({
        workspace_id: input.workspaceId,
        owner_type: input.ownerType,
        owner_id: input.ownerId,
        target_id: targetId,
        event_mask: eventMask,
      })),
    );
  if (insertError) return { ok: false, error: insertError.message };

  return { ok: true, data: null };
}
