import "server-only";

import { createSupabaseServerClient } from "./supabase/server";

export type ProviderConnectionLogStatus = "success" | "error" | "info";

export type ProviderConnectionLog = {
  id: string;
  workspace_id: string;
  actor_id: string | null;
  provider: string;
  event_type: string;
  status: ProviderConnectionLogStatus;
  latency_ms: number | null;
  message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type RecordInput = {
  workspaceId: string;
  actorId?: string | null;
  provider: string;
  eventType: string;
  status: ProviderConnectionLogStatus;
  latencyMs?: number | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
};

export async function listProviderConnectionLogs(
  workspaceId: string,
  providers: string[] | string,
  limit = 20,
): Promise<ProviderConnectionLog[]> {
  const supabase = await createSupabaseServerClient();
  const providerList = Array.isArray(providers) ? providers : [providers];
  const { data, error } = await supabase
    .from("provider_connection_logs")
    .select(
      "id, workspace_id, actor_id, provider, event_type, status, latency_ms, message, metadata, created_at",
    )
    .eq("workspace_id", workspaceId)
    .in("provider", providerList)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listProviderConnectionLogs failed", error);
    return [];
  }

  return (data ?? []).map(normalizeLogRow);
}

export async function recordProviderConnectionLog(
  input: RecordInput,
): Promise<ProviderConnectionLog | null> {
  const supabase = await createSupabaseServerClient();
  let actorId = input.actorId ?? null;

  if (!actorId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    actorId = user?.id ?? null;
  }

  const { data, error } = await supabase
    .from("provider_connection_logs")
    .insert({
      workspace_id: input.workspaceId,
      actor_id: actorId,
      provider: input.provider,
      event_type: input.eventType,
      status: input.status,
      latency_ms:
        typeof input.latencyMs === "number" ? Math.round(input.latencyMs) : null,
      message: input.message ?? null,
      metadata: safeMetadata(input.metadata ?? {}),
    })
    .select(
      "id, workspace_id, actor_id, provider, event_type, status, latency_ms, message, metadata, created_at",
    )
    .single();

  if (error) {
    console.error("recordProviderConnectionLog failed", error);
    return null;
  }

  return normalizeLogRow(data);
}

function normalizeLogRow(row: Record<string, unknown>): ProviderConnectionLog {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    actor_id: typeof row.actor_id === "string" ? row.actor_id : null,
    provider: String(row.provider),
    event_type: String(row.event_type),
    status: isLogStatus(row.status) ? row.status : "info",
    latency_ms:
      typeof row.latency_ms === "number" ? Math.round(row.latency_ms) : null,
    message: typeof row.message === "string" ? row.message : null,
    metadata: isRecord(row.metadata) ? row.metadata : {},
    created_at: String(row.created_at),
  };
}

function isLogStatus(value: unknown): value is ProviderConnectionLogStatus {
  return value === "success" || value === "error" || value === "info";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeMetadata(
  metadata: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const blocked = /key|token|secret|password|authorization|credential/i;
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (blocked.test(key)) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      safe[key] = value;
    }
  }
  return safe;
}
