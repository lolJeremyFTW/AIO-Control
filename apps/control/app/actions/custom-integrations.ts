// Server actions for custom_integrations — generic outbound HTTP
// integrations. Same scope hierarchy as api_keys + telegram_targets.

"use server";

import { revalidatePath } from "next/cache";

import { sendCustom } from "../../lib/notify/custom-integration";
import { createSupabaseServerClient } from "../../lib/supabase/server";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type CustomIntegrationInput = {
  workspace_slug: string;
  workspace_id: string;
  scope: "workspace" | "business" | "navnode";
  scope_id: string;
  name: string;
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body_template?: string | null;
  on_run_done?: boolean;
  on_run_fail?: boolean;
  on_queue_review?: boolean;
  enabled?: boolean;
};

export async function createCustomIntegration(
  input: CustomIntegrationInput,
): Promise<Result<{ id: string }>> {
  if (!input.name.trim()) return { ok: false, error: "Naam is verplicht." };
  if (!input.url.trim()) return { ok: false, error: "URL is verplicht." };
  // Light URL validation — reject obvious garbage but tolerate
  // localhost, hosted webhooks, etc.
  try {
    new URL(input.url);
  } catch {
    return { ok: false, error: "Ongeldige URL." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("custom_integrations")
    .insert({
      workspace_id: input.workspace_id,
      scope: input.scope,
      scope_id: input.scope_id,
      name: input.name.trim(),
      url: input.url.trim(),
      method: input.method ?? "POST",
      headers: input.headers ?? {},
      body_template: input.body_template ?? null,
      on_run_done: input.on_run_done ?? true,
      on_run_fail: input.on_run_fail ?? true,
      on_queue_review: input.on_queue_review ?? false,
      enabled: input.enabled ?? true,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }
  revalidatePath(`/${input.workspace_slug}/settings`);
  return { ok: true, data: { id: data.id } };
}

export async function deleteCustomIntegration(input: {
  workspace_slug: string;
  id: string;
}): Promise<Result<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("custom_integrations")
    .delete()
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}/settings`);
  return { ok: true, data: null };
}

export async function testCustomIntegration(input: {
  id: string;
}): Promise<Result<{ status?: number }>> {
  const supabase = await createSupabaseServerClient();
  const { data: integration, error } = await supabase
    .from("custom_integrations")
    .select("id, workspace_id, url, method, headers, body_template, enabled")
    .eq("id", input.id)
    .maybeSingle();
  if (error || !integration) {
    return { ok: false, error: "Integration niet gevonden." };
  }
  const res = await sendCustom({
    integration: integration as Parameters<typeof sendCustom>[0]["integration"],
    vars: {
      run: {
        id: "test-run-id",
        status: "test",
        agent: "AIO Control",
        output: "Dit is een testbericht vanuit AIO Control.",
        cost_cents: 0,
      },
    },
  });
  if (!res.ok) return { ok: false, error: res.error ?? "send faalde" };
  return { ok: true, data: { status: res.status } };
}
