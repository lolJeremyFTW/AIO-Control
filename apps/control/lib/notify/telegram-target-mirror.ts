import "server-only";

import type { createSupabaseServerClient } from "../supabase/server";
import type { getServiceRoleSupabase } from "../supabase/service";

type SupabaseWriteClient =
  | Awaited<ReturnType<typeof createSupabaseServerClient>>
  | ReturnType<typeof getServiceRoleSupabase>;

export type TelegramTargetMirrorInput = {
  id: string;
  workspace_id: string;
  scope: "workspace" | "business" | "navnode";
  scope_id: string;
  name: string;
  chat_id: string;
  topic_id?: number | null;
  allowlist?: string[];
  denylist?: string[];
  send_run_done?: boolean;
  send_run_fail?: boolean;
  send_queue_review?: boolean;
  enabled?: boolean;
  created_by?: string | null;
};

export async function upsertGenericTelegramTarget(
  supabase: SupabaseWriteClient,
  target: TelegramTargetMirrorInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("notification_targets").upsert(
    {
      id: target.id,
      workspace_id: target.workspace_id,
      provider: "telegram",
      scope: target.scope,
      scope_id:
        target.scope === "workspace" ? target.workspace_id : target.scope_id,
      name: target.name,
      config: {
        chat_id: target.chat_id,
        topic_id: target.topic_id ?? null,
        legacy_target_id: target.id,
      },
      allowlist: target.allowlist ?? [],
      denylist: target.denylist ?? [],
      send_run_done: target.send_run_done ?? true,
      send_run_fail: target.send_run_fail ?? true,
      send_queue_review: target.send_queue_review ?? true,
      enabled: target.enabled ?? true,
      created_by: target.created_by ?? null,
    },
    { onConflict: "id" },
  );
  if (error) return { ok: false, error: error.message };

  const eventMask = [
    (target.send_run_done ?? true) ? "run_done" : null,
    (target.send_run_fail ?? true) ? "run_fail" : null,
    (target.send_queue_review ?? true) ? "queue_review" : null,
  ].filter((event): event is string => event != null);

  const { error: bindingError } = await supabase
    .from("notification_bindings")
    .upsert(
      {
        workspace_id: target.workspace_id,
        owner_type: target.scope,
        owner_id:
          target.scope === "workspace" ? target.workspace_id : target.scope_id,
        target_id: target.id,
        event_mask: eventMask,
      },
      { onConflict: "workspace_id,owner_type,owner_id,target_id" },
    );
  if (bindingError) return { ok: false, error: bindingError.message };

  return { ok: true };
}
