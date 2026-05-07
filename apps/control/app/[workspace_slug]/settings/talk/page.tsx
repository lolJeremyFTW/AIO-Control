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

  const { data: logRows } = await supabase
    .from("talk_session_logs")
    .select(
      "created_at, transcription, llm_response, duration_ms, error_text, stt_provider, llm_model, tts_provider",
    )
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .limit(12);

  const log: TalkLogEntry[] = ((logRows ?? []) as Array<{
    created_at: string;
    transcription: string | null;
    llm_response: string | null;
    duration_ms: number | null;
    error_text: string | null;
    stt_provider: string | null;
    llm_model: string | null;
    tts_provider: string | null;
  }>).flatMap((row) => {
    const time = new Date(row.created_at).toLocaleTimeString("nl-NL", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const dur = row.duration_ms ? `${(row.duration_ms / 1000).toFixed(1)}s` : "-";
    const providerMeta = [row.stt_provider, row.llm_model, row.tts_provider]
      .filter(Boolean)
      .join(" / ");
    const ms = providerMeta || "-";
    const entries: TalkLogEntry[] = [];
    if (row.transcription) {
      entries.push({
        t: time,
        who: "You",
        msg: row.transcription,
        dur,
        ms,
      });
    }
    entries.push({
      t: time,
      who: "Agent",
      msg: row.error_text
        ? `Fout: ${row.error_text}`
        : row.llm_response || "Geen agent-antwoord gelogd.",
      dur,
      ms,
    });
    return entries;
  });

  const { t } = await getDict();

  return (
    <>
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
    </>
  );
}
