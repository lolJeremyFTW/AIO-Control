// /[ws]/settings/ai - consolidated model, provider, key and voice settings.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { resolveApiKey } from "../../../../lib/api-keys/resolve";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
import { listProviderConnectionLogs } from "../../../../lib/provider-connection-logs";
import { listBusinesses } from "../../../../lib/queries/businesses";
import type { NavNode } from "../../../../lib/queries/nav-nodes";
import { listApiKeys } from "../../../actions/api-keys";
import type { OllamaModel } from "../../../actions/ollama";
import { ApiKeysPanel } from "../../../../components/ApiKeysPanel";
import { McpToolsSetupPanel } from "../../../../components/McpToolsSetupPanel";
import { ProvidersOnboardingPanel } from "../../../../components/ProvidersOnboardingPanel";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";
import {
  TalkSettings,
  type TalkLogEntry,
  type TalkSettingsRow,
} from "../../../../components/TalkSettings";
import { WorkspaceDefaultsPanel } from "../../../../components/WorkspaceDefaultsPanel";

type Props = { params: Promise<{ workspace_slug: string }> };

const DEFAULT_TALK_ROW: Omit<TalkSettingsRow, "workspace_id"> = {
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

export default async function AiSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const [
    { data: ws },
    { data: navRows },
    { data: talkRow },
    { data: logRows },
    apiKeys,
    businesses,
    ollamaLogs,
    firecrawlLogs,
    { t },
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select(
        "default_provider, default_model, default_system_prompt, ollama_host, ollama_port, ollama_models_cached, ollama_last_scan_at, hermes_endpoint, hermes_last_test_at, hermes_agent_name, hermes_agent_initialized_at, openclaw_endpoint, openclaw_last_test_at, openclaw_agent_name, openclaw_agent_initialized_at",
      )
      .eq("id", workspace.id)
      .maybeSingle(),
    supabase
      .from("nav_nodes")
      .select(
        "id, workspace_id, business_id, parent_id, name, sub, letter, variant, icon, color_hex, logo_url, href, sort_order",
      )
      .eq("workspace_id", workspace.id)
      .is("archived_at", null),
    supabase
      .from("talk_settings")
      .select(
        "workspace_id, provider, model, llm, stt, voice, stability, similarity, push_to_talk, auto_stop, hotword",
      )
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    supabase
      .from("talk_session_logs")
      .select(
        "created_at, transcription, llm_response, duration_ms, error_text, stt_provider, llm_model, tts_provider",
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(12),
    listApiKeys(workspace.id),
    listBusinesses(workspace.id),
    listProviderConnectionLogs(workspace.id, "ollama", 12),
    listProviderConnectionLogs(workspace.id, "firecrawl", 12),
    getDict(),
  ]);

  const cloudKeysSet = apiKeys
    .filter(
      (k) =>
        k.kind === "provider" &&
        k.scope === "workspace" &&
        k.scope_id === workspace.id &&
        k.has_value,
    )
    .map((k) => k.provider);

  const mcpKeysSet = apiKeys
    .filter(
      (k) =>
        k.scope === "workspace" && k.scope_id === workspace.id && k.has_value,
    )
    .map((k) => k.provider);

  const ollamaModels = Array.isArray(ws?.ollama_models_cached)
    ? (ws?.ollama_models_cached as OllamaModel[])
    : [];
  const talkInitial: TalkSettingsRow = talkRow
    ? (talkRow as TalkSettingsRow)
    : { workspace_id: workspace.id, ...DEFAULT_TALK_ROW };
  const talkModelOptions =
    (ws?.ollama_models_cached as
      | { name: string; parameter_size?: string }[]
      | null) ?? [];

  const previews: Record<string, string> = {};
  await Promise.all(
    ["elevenlabs", "openai_tts", "azure_speech", "openai"].map(async (p) => {
      const v = await resolveApiKey(p, { workspaceId: workspace.id });
      previews[p] = v ? `****************${v.slice(-4)}` : "Niet ingesteld";
    }),
  );

  const log = formatTalkLog(logRows ?? []);

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.ai")}</h1>
        <span className="sub">{t("settings.section.ai.desc")}</span>
      </div>

      <SettingsSectionCard
        id="agent-defaults"
        title={t("settings.section.agentDefaults")}
      >
        <WorkspaceDefaultsPanel
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          initial={{
            provider: (ws?.default_provider as string | null) ?? null,
            model: (ws?.default_model as string | null) ?? null,
            system_prompt: (ws?.default_system_prompt as string | null) ?? null,
          }}
        />
      </SettingsSectionCard>

      <SettingsSectionCard
        id="providers"
        title={t("settings.section.providers")}
      >
        <ProvidersOnboardingPanel
          workspaceId={workspace.id}
          workspaceSlug={workspace.slug}
          cloudKeysSet={cloudKeysSet}
          ollamaLogs={ollamaLogs}
          initial={{
            ollama_host: (ws?.ollama_host as string | null) ?? null,
            ollama_port: (ws?.ollama_port as number | null) ?? null,
            ollama_models: ollamaModels,
            ollama_models_count: ollamaModels.length,
            ollama_last_scan_at:
              (ws?.ollama_last_scan_at as string | null) ?? null,
            hermes_endpoint: (ws?.hermes_endpoint as string | null) ?? null,
            hermes_last_test_at:
              (ws?.hermes_last_test_at as string | null) ?? null,
            hermes_agent_name: (ws?.hermes_agent_name as string | null) ?? null,
            hermes_agent_initialized_at:
              (ws?.hermes_agent_initialized_at as string | null) ?? null,
            openclaw_endpoint: (ws?.openclaw_endpoint as string | null) ?? null,
            openclaw_last_test_at:
              (ws?.openclaw_last_test_at as string | null) ?? null,
            openclaw_agent_name:
              (ws?.openclaw_agent_name as string | null) ?? null,
            openclaw_agent_initialized_at:
              (ws?.openclaw_agent_initialized_at as string | null) ?? null,
          }}
        />
      </SettingsSectionCard>

      <SettingsSectionCard id="api-keys" title={t("settings.section.apiKeys")}>
        <ApiKeysPanel
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          initialKeys={apiKeys}
          businesses={businesses}
          navNodes={(navRows ?? []) as NavNode[]}
        />
      </SettingsSectionCard>

      <SettingsSectionCard
        id="mcp-tools"
        title={t("settings.section.mcpTools")}
      >
        <McpToolsSetupPanel
          workspaceId={workspace.id}
          workspaceSlug={workspace.slug}
          keysSet={mcpKeysSet}
          firecrawlLogs={firecrawlLogs}
        />
      </SettingsSectionCard>

      <section id="talk" style={{ scrollMarginTop: 16 }}>
        <TalkSettings
          initial={talkInitial}
          workspaceSlug={workspace.slug}
          keyPreviews={previews}
          ollamaModels={talkModelOptions}
          log={log}
        />
      </section>
    </>
  );
}

function formatTalkLog(rows: unknown[]): TalkLogEntry[] {
  return (
    rows as Array<{
      created_at: string;
      transcription: string | null;
      llm_response: string | null;
      duration_ms: number | null;
      error_text: string | null;
      stt_provider: string | null;
      llm_model: string | null;
      tts_provider: string | null;
    }>
  ).flatMap((row) => {
    const time = new Date(row.created_at).toLocaleTimeString("nl-NL", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const dur = row.duration_ms
      ? `${(row.duration_ms / 1000).toFixed(1)}s`
      : "-";
    const ms =
      [row.stt_provider, row.llm_model, row.tts_provider]
        .filter(Boolean)
        .join(" / ") || "-";
    const entries: TalkLogEntry[] = [];
    if (row.transcription) {
      entries.push({ t: time, who: "You", msg: row.transcription, dur, ms });
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
}
