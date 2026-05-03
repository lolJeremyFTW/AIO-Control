// /[workspace_slug]/settings/talk — Talk-to-AI workspace defaults.
// Routed to from the header mic-dropdown's "Talk settings" link.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { resolveApiKey } from "../../../../lib/api-keys/resolve";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
import {
  TalkSettings,
  type TalkLogEntry,
  type TalkSettingsRow,
} from "../../../../components/TalkSettings";

type Props = { params: Promise<{ workspace_slug: string }> };

const DEFAULT_ROW: Omit<TalkSettingsRow, "workspace_id"> = {
  provider: "elevenlabs",
  model: "eleven_multilingual_v2",
  llm: "claude-sonnet-4-5",
  stt: "whisper-1",
  voice: "rachel",
  stability: 0.55,
  similarity: 0.75,
  push_to_talk: false,
  auto_stop: true,
  hotword: false,
};

export default async function TalkSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();

  // Load (or seed) the workspace's talk_settings row + masked previews
  // for the provider keys we know about. Pull the cached Ollama models
  // in the same trip so the LLM picker can group them as a separate
  // option-set without an extra round-trip.
  const [{ data: row }, { data: wsRow }] = await Promise.all([
    supabase
      .from("talk_settings")
      .select(
        "workspace_id, provider, model, llm, stt, voice, stability, similarity, push_to_talk, auto_stop, hotword",
      )
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    supabase
      .from("workspaces")
      .select("ollama_models_cached")
      .eq("id", workspace.id)
      .maybeSingle(),
  ]);

  const initial: TalkSettingsRow = row
    ? (row as TalkSettingsRow)
    : { workspace_id: workspace.id, ...DEFAULT_ROW };

  const ollamaModels =
    (wsRow?.ollama_models_cached as
      | { name: string; parameter_size?: string }[]
      | null) ?? [];

  // Masked previews. resolveApiKey returns the plaintext (we're
  // server-side); we mask everything except the last 4 chars so the
  // page never ships secrets to the client. Lookup is cheap (one
  // RPC per provider) and the page is rarely loaded.
  const providers = ["elevenlabs", "openai_tts", "azure_speech", "openai"];
  const previews: Record<string, string> = {};
  await Promise.all(
    providers.map(async (p) => {
      const v = await resolveApiKey(p, { workspaceId: workspace.id });
      previews[p] = v
        ? `••••••••••••••••${v.slice(-4)}`
        : "Niet ingesteld";
    }),
  );

  // Log: empty for now — wired to the actual interactions table when
  // push-to-talk is hooked into the chat-route. The component renders
  // a friendly empty-state when log.length === 0.
  const log: TalkLogEntry[] = [];

  const { t } = await getDict();

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{t("page.talk")}</h1>
        <span className="sub">{t("page.talk.sub")}</span>
      </div>
      <TalkSettings
        initial={initial}
        workspaceSlug={workspace.slug}
        keyPreviews={previews}
        ollamaModels={ollamaModels}
        log={log}
      />
    </div>
  );
}
