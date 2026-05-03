// Server actions for the workspace-level Talk settings.
//
// The header mic-button + the /[ws]/settings/talk page both read from
// `aio_control.talk_settings`. Editor+ can mutate via this action;
// RLS enforces workspace membership.

"use server";

import { revalidatePath } from "next/cache";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../lib/auth/workspace";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export type TalkSettingsInput = {
  provider?: "elevenlabs" | "openai" | "azure" | "native";
  model?: string;
  llm?: string;
  stt?: string;
  voice?: string;
  stability?: number;
  similarity?: number;
  push_to_talk?: boolean;
  auto_stop?: boolean;
  hotword?: boolean;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Upsert the workspace's talk_settings row. The page resolves the
 * active workspace from its URL params and passes the slug in.
 */
export async function saveTalkSettings(
  input: TalkSettingsInput & { workspace_slug: string },
): Promise<Result<null>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Niet ingelogd." };

  const workspace = await getWorkspaceBySlug(input.workspace_slug);
  if (!workspace) return { ok: false, error: "Workspace niet gevonden." };

  const supabase = await createSupabaseServerClient();

  // Clamp the sliders so a malicious form post can't write garbage.
  const clamp01 = (v: number | undefined) =>
    v === undefined ? undefined : Math.max(0, Math.min(1, v));

  const patch: Record<string, unknown> = {
    workspace_id: workspace.id,
  };
  if (input.provider !== undefined) patch.provider = input.provider;
  if (input.model !== undefined) patch.model = input.model;
  if (input.llm !== undefined) patch.llm = input.llm;
  if (input.stt !== undefined) patch.stt = input.stt;
  if (input.voice !== undefined) patch.voice = input.voice;
  const stab = clamp01(input.stability);
  if (stab !== undefined) patch.stability = stab;
  const sim = clamp01(input.similarity);
  if (sim !== undefined) patch.similarity = sim;
  if (input.push_to_talk !== undefined) patch.push_to_talk = input.push_to_talk;
  if (input.auto_stop !== undefined) patch.auto_stop = input.auto_stop;
  if (input.hotword !== undefined) patch.hotword = input.hotword;

  const { error } = await supabase
    .from("talk_settings")
    .upsert(patch, { onConflict: "workspace_id" });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/${input.workspace_slug}/settings/talk`);
  return { ok: true, data: null };
}
