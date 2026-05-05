// POST /api/talk — Voice pipeline endpoint.
//
// Flow: audio blob → Whisper STT → LLM → ElevenLabs TTS → MP3 stream
//
// Request:  FormData { audio: Blob, agent_id: string, workspace_slug: string }
// Response: audio/mpeg (MP3 stream) or JSON error

import { NextResponse } from "next/server";

import { streamChat } from "@aio/ai/router";
import type { AgentConfig, ProviderId } from "@aio/ai/router";
import type { ChatMessage } from "@aio/ai/ag-ui";
import { AIO_TOOLS, defaultToolsForKind } from "@aio/ai/aio-tools";
import { executeAioTool } from "../../../lib/agents/tool-execution";
import { resolveApiKey } from "../../../lib/api-keys/resolve";
import { resolveOllamaEndpoint } from "../../../lib/ollama/endpoint";
import { getAgentById } from "../../../lib/queries/agents";
import { buildAgentSystemPrompt, prependPreamble } from "../../../lib/agents/business-context";
import { createSupabaseServerClient } from "../../../lib/supabase/server";
import { getServiceRoleSupabase } from "../../../lib/supabase/service";

export const dynamic = "force-dynamic";

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB — Whisper's limit

export async function POST(req: Request) {
  const startedAt = Date.now();
  let transcription = "";
  let llmResponseText = "";
  let sttProvider = "whisper-1";
  let ttsProvider = "elevenlabs";
  let voiceId = "EXAVITQm4R8VDqDW9Pei"; // Rachel (default ElevenLabs voice)

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  // ── 2. Parse FormData ────────────────────────────────────────────────────
  let audioBlob: Blob | null = null;
  let agentId = "";
  let workspaceSlug = "";

  try {
    const formData = await req.formData();
    audioBlob = formData.get("audio") as Blob | null;
    agentId = (formData.get("agent_id") as string) ?? "";
    workspaceSlug = (formData.get("workspace_slug") as string) ?? "";
  } catch {
    return NextResponse.json({ error: "Ongeldig request body." }, { status: 400 });
  }

  if (!audioBlob || !agentId || !workspaceSlug) {
    return NextResponse.json(
      { error: "audio, agent_id en workspace_slug zijn verplicht." },
      { status: 400 },
    );
  }

  if (audioBlob.size > MAX_AUDIO_SIZE) {
    return NextResponse.json(
      { error: `Audio te groot (${(audioBlob.size / 1024 / 1024).toFixed(1)} MB, max 25 MB).` },
      { status: 400 },
    );
  }

  // ── 3. Load agent ────────────────────────────────────────────────────────
  const agent = await getAgentById(agentId);
  if (!agent) {
    return NextResponse.json({ error: "Agent niet gevonden." }, { status: 404 });
  }

  // Use agent.workspace_id directly — no workspace DB lookup needed since
  // getAgentById already verified the agent belongs to an accessible workspace.
  const workspace_id = agent.workspace_id;

  // ── 4. Load talk_settings ─────────────────────────────────────────────────
  const { data: talkSettings } = await getServiceRoleSupabase()
    .from("talk_settings")
    .select(
      "provider, model, llm, stt, voice, stability, similarity",
    )
    .eq("workspace_id", workspace_id)
    .maybeSingle();

  ttsProvider = talkSettings?.provider ?? "elevenlabs";
  // Normalise to "elevenlabs" regardless of whether the UI saved "elevenlabs-stt".
  const rawStt = talkSettings?.stt ?? "elevenlabs-stt";
  sttProvider = rawStt === "elevenlabs-stt" ? "elevenlabs" : rawStt;
  voiceId = resolveVoiceId(talkSettings?.voice ?? "rachel");

  console.info(
    `[talk] request — ws=${workspaceSlug} agent=${agentId} ` +
      `size=${audioBlob.size}B stt=${sttProvider} tts=${ttsProvider}`,
  );

  // ── 5. STT ───────────────────────────────────────────────────────────────
  // Supported providers:
  //   "elevenlabs" — ElevenLabs Scribe v1 (no OpenAI key needed)
  //   "whisper-1"  — OpenAI Whisper (needs OPENAI_API_KEY or db key)
  // Falls back to ElevenLabs when Whisper is selected but no OpenAI key.

  const [openAiKey, elevenlabsKeyForStt] = await Promise.all([
    resolveApiKey("openai", { workspaceId: workspace_id, businessId: agent.business_id }),
    resolveApiKey("elevenlabs", { workspaceId: workspace_id, businessId: agent.business_id }),
  ]);

  // Decide effective STT provider based on available keys.
  const effectiveStt =
    sttProvider === "whisper-1" && openAiKey
      ? "whisper-1"
      : elevenlabsKeyForStt
        ? "elevenlabs"
        : sttProvider === "whisper-1" && !openAiKey
          ? null // will error below
          : null;

  if (!effectiveStt) {
    const missing = sttProvider === "whisper-1" ? "OpenAI" : "ElevenLabs";
    console.error(`[talk] STT: geen ${missing} key geconfigureerd`);
    return NextResponse.json(
      { error: `Geen ${missing} API key geconfigureerd voor spraakherkenning. Voeg deze toe via Instellingen → API Keys.` },
      { status: 500 },
    );
  }

  console.info(`[talk] STT start — provider=${effectiveStt}`);
  const sttStart = Date.now();

  try {
    if (effectiveStt === "elevenlabs") {
      // ElevenLabs Scribe v1 — field name is "file" per their REST API spec.
      const sttForm = new FormData();
      sttForm.append("file", audioBlob, "recording.webm");
      sttForm.append("model_id", "scribe_v1");

      const sttRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": elevenlabsKeyForStt! },
        body: sttForm,
      });

      if (!sttRes.ok) {
        const err = await sttRes.text();
        console.error("[talk] ElevenLabs STT error:", sttRes.status, err);
        return NextResponse.json(
          { error: `Spraakherkenning fout (ElevenLabs ${sttRes.status}).` },
          { status: 502 },
        );
      }

      const sttData = (await sttRes.json()) as { text?: string };
      transcription = sttData.text?.trim() ?? "";
    } else {
      // OpenAI Whisper-1
      const sttForm = new FormData();
      sttForm.append("file", audioBlob, "recording.webm");
      sttForm.append("model", "whisper-1");
      sttForm.append("response_format", "json");

      const sttRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}` },
        body: sttForm,
      });

      if (!sttRes.ok) {
        const err = await sttRes.json().catch(() => ({}));
        console.error("[talk] Whisper error:", sttRes.status, err);
        return NextResponse.json(
          { error: `Spraakherkenning fout (Whisper ${sttRes.status}).` },
          { status: 502 },
        );
      }

      const sttData = (await sttRes.json()) as { text?: string };
      transcription = sttData.text?.trim() ?? "";
    }

    console.info(`[talk] STT done — ms=${Date.now() - sttStart} text="${transcription.slice(0, 80)}"`);

    if (!transcription) {
      return NextResponse.json(
        { error: "Kon spraak niet verstaan. Praat harder of duidelijker." },
        { status: 422 },
      );
    }
  } catch (err) {
    console.error("[talk] STT fetch failed:", err);
    return NextResponse.json(
      { error: "Kon spraakherkenning niet bereiken." },
      { status: 502 },
    );
  }

  // ── 6. LLM — full dispatch pipeline with tools (same as chat route) ────
  const agentConfig = (agent.config ?? {}) as AgentConfig;
  // "__header_agent__" is a sentinel meaning "use the selected agent's own model".
  const llmConfig = (talkSettings?.llm && talkSettings.llm !== "__header_agent__")
    ? talkSettings.llm
    : null;
  const [resolvedProvider, resolvedModel] = llmConfig
    ? resolveLlmProviderModel(llmConfig, agent.provider)
    : [agent.provider, agent.model ?? ""];

  const llmKeyName =
    resolvedProvider === "ollama"
      ? "ollama"
      : resolvedProvider === "claude" || resolvedProvider === "claude_cli"
        ? "anthropic"
        : resolvedProvider === "minimax"
          ? "minimax"
          : "openrouter";
  const apiKey = await resolveApiKey(llmKeyName, {
    workspaceId: workspace_id,
    businessId: agent.business_id,
  });

  const ollamaEndpoint = await resolveOllamaEndpoint(workspace_id);

  // Workspace runtime agent names for Hermes / OpenClaw providers.
  const { data: runtimeRow } = await getServiceRoleSupabase()
    .from("workspaces")
    .select("hermes_agent_name, openclaw_agent_name")
    .eq("id", workspace_id)
    .maybeSingle();
  const hermesAgentName = (runtimeRow?.hermes_agent_name as string | null) ?? null;
  const openclawAgentName = (runtimeRow?.openclaw_agent_name as string | null) ?? null;

  // Resolve allowed tools for this agent (same logic as chat route).
  const allowedToolNames =
    (agent as { allowed_tools?: string[] | null }).allowed_tools ??
    defaultToolsForKind(agent.kind);
  const tools = allowedToolNames
    .map((n) => AIO_TOOLS[n])
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));

  // Build system prompt — same preamble as chat for full business context.
  const preamble = await buildAgentSystemPrompt({
    id: agent.id,
    workspace_id,
    business_id: agent.business_id,
    name: agent.name,
    kind: agent.kind,
    provider: agent.provider,
    model: agent.model,
  });
  const talkNote =
    "Je wordt aangesproken via spraakinvoer. Geef korte, gesproken antwoorden — maximaal 2-3 zinnen. Geen markdown formatting.";
  const systemPrompt =
    prependPreamble(preamble, agentConfig.systemPrompt) +
    `\n\n---\n\n${talkNote}`;

  const config: AgentConfig = { ...agentConfig, model: resolvedModel, systemPrompt };

  // Create a run row so voice interactions appear in the activity log.
  const { data: run } = await supabase
    .from("runs")
    .insert({
      workspace_id,
      agent_id: agent.id,
      business_id: agent.business_id,
      nav_node_id: (agent as { nav_node_id?: string | null }).nav_node_id ?? null,
      triggered_by: "talk",
      status: "running",
      started_at: new Date(startedAt).toISOString(),
      input: { transcription },
    })
    .select("id")
    .single();

  console.info(`[talk] LLM start — provider=${resolvedProvider} model=${resolvedModel}`);
  const llmStart = Date.now();

  const messages: ChatMessage[] = [{ role: "user", content: transcription }];
  const HOPS_MAX = 5;
  let deferred = false;
  let deferSpeakText: string | null = null;

  try {
    for (let hop = 0; hop < HOPS_MAX && !deferred; hop++) {
      const toolUses: Array<{ id: string; name: string; args: unknown }> = [];

      for await (const event of streamChat({
        provider: resolvedProvider as ProviderId,
        config,
        messages,
        runId: run?.id,
        apiKey,
        tenant: {
          workspaceId: workspace_id,
          businessId: agent.business_id,
          ollamaEndpoint: ollamaEndpoint ?? undefined,
          hermesAgentName,
          openclawAgentName,
        },
        tools,
      })) {
        if (event.type === "token") llmResponseText += event.delta;
        if (event.type === "tool_call_start") {
          toolUses.push({ id: event.tool_call_id, name: event.name, args: event.args });
        }
        if (event.type === "message_end") break;
      }

      if (toolUses.length === 0) break;

      const toolResults: Array<{ id: string; content: string }> = [];
      for (const tu of toolUses) {
        const res = await executeAioTool(tu.name, tu.args, {
          workspaceId: workspace_id,
          defaultBusinessId: agent.business_id,
        });

        if (res.kind === "defer") {
          const ev = res.event;
          if (ev.type === "ask_followup") {
            deferSpeakText = ev.question;
          } else if (ev.type === "confirm_required") {
            deferSpeakText = `${ev.summary} Ga naar de app om te bevestigen.`;
          } else if (ev.type === "open_ui_at") {
            toolResults.push({ id: tu.id, content: JSON.stringify({ navigated: true }) });
            continue;
          } else if (ev.type === "todo_set") {
            toolResults.push({ id: tu.id, content: JSON.stringify({ ok: true }) });
            continue;
          }
          deferred = true;
          break;
        }

        toolResults.push({
          id: tu.id,
          content:
            res.kind === "ok"
              ? JSON.stringify(res.data)
              : JSON.stringify({ error: res.error }),
        });
      }

      if (deferred) break;
      if (toolResults.length === 0) break;

      messages.push({
        role: "assistant",
        content: JSON.stringify(
          toolUses.map((t) => ({
            type: "tool_use",
            id: t.id,
            name: t.name,
            input: t.args,
          })),
        ),
      });
      messages.push({
        role: "user",
        content: JSON.stringify(
          toolResults.map((r) => ({
            type: "tool_result",
            tool_use_id: r.id,
            content: r.content,
          })),
        ),
      });
    }
  } catch (err) {
    console.error("[talk] LLM error:", err);
    if (run) {
      void supabase
        .from("runs")
        .update({
          status: "failed",
          ended_at: new Date().toISOString(),
          error_text: err instanceof Error ? err.message : "LLM error",
        })
        .eq("id", run.id);
    }
    return NextResponse.json(
      { error: `LLM fout (${resolvedProvider}/${resolvedModel}): kon antwoord niet genereren.` },
      { status: 502 },
    );
  }

  // If deferred (ask_followup / confirm_required), speak the question via TTS.
  if (deferred && deferSpeakText) {
    llmResponseText = deferSpeakText;
  }

  console.info(`[talk] LLM done — ms=${Date.now() - llmStart} chars=${llmResponseText.length}`);

  // Update run row (best-effort, non-blocking).
  if (run) {
    void supabase
      .from("runs")
      .update({
        status: deferred ? "waiting" : "done",
        ended_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        output: { text: llmResponseText },
      })
      .eq("id", run.id);
  }

  if (!llmResponseText.trim()) {
    console.warn("[talk] LLM returned empty response");
    return NextResponse.json(
      { error: "Agent gaf een leeg antwoord. Probeer het opnieuw." },
      { status: 422 },
    );
  }

  // ── 7. TTS — ElevenLabs ──────────────────────────────────────────────────
  console.info(`[talk] TTS start — provider=${ttsProvider} voice=${voiceId}`);
  const ttsStart = Date.now();

  const elevenlabsKey = elevenlabsKeyForStt ?? await resolveApiKey("elevenlabs", {
    workspaceId: workspace_id,
    businessId: agent.business_id,
  });

  if (!elevenlabsKey) {
    console.error("[talk] TTS: geen ElevenLabs key geconfigureerd");
    return NextResponse.json(
      { error: "Geen ElevenLabs API key geconfigureerd voor spraaksynthese. Voeg deze toe via Instellingen → API Keys." },
      { status: 500 },
    );
  }

  const stability = talkSettings?.stability ?? 0.55;
  const similarity = talkSettings?.similarity ?? 0.75;

  // ── 8. Stream ElevenLabs audio back ──────────────────────────────────────
  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128&optimize_streaming_latency=4`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": elevenlabsKey,
        },
        body: JSON.stringify({
          text: llmResponseText,
          model_id: talkSettings?.model ?? "eleven_multilingual_v2",
          voice_settings: {
            stability,
            similarity_boost: similarity,
            style: 0,
            use_speaker_boost: true,
            speed: 1.0,
          },
        }),
      },
    );

    if (!ttsRes.ok) {
      const err = await ttsRes.text();
      console.error("[talk] ElevenLabs TTS error:", ttsRes.status, err.slice(0, 200));
      return NextResponse.json(
        { error: `Spraaksynthese fout (ElevenLabs ${ttsRes.status}).` },
        { status: 502 },
      );
    }
    console.info(`[talk] TTS done — ms=${Date.now() - ttsStart}`);

    // Pipe the audio stream back to the browser
    if (!ttsRes.body) {
      return NextResponse.json(
        { error: "TTS service gaf lege response." },
        { status: 502 },
      );
    }

    // ── 9. Log the session (fire-and-forget, non-blocking) ─────────────────
    const durationMs = Date.now() - startedAt;
    getServiceRoleSupabase()
      .from("talk_session_logs")
      .insert({
        workspace_id: workspace_id,
        agent_id: agent.id,
        transcription: transcription.slice(0, 4000),
        llm_prompt: transcription.slice(0, 2000),
        llm_response: llmResponseText.slice(0, 4000),
        tts_voice_id: voiceId,
        duration_ms: durationMs,
        error_text: null,
        stt_provider: sttProvider,
        llm_model: llmConfig,
        tts_provider: ttsProvider,
      })
      .then(({ error: logErr }) => {
        if (logErr) console.error("[talk] log insert failed:", logErr);
      });

    return new Response(ttsRes.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
        "X-Duration-Ms": String(durationMs),
      },
    });
  } catch (err) {
    console.error("[talk] ElevenLabs fetch failed:", err);
    // Log the failed session
    void getServiceRoleSupabase()
      .from("talk_session_logs")
      .insert({
        workspace_id: workspace_id,
        agent_id: agent.id,
        transcription: transcription.slice(0, 4000) || null,
        llm_prompt: null,
        llm_response: llmResponseText.slice(0, 4000) || null,
        tts_voice_id: voiceId,
        duration_ms: Date.now() - startedAt,
        error_text: err instanceof Error ? err.message : "TTS fetch failed",
        stt_provider: sttProvider,
        llm_model: llmConfig,
        tts_provider: ttsProvider,
      });
    return NextResponse.json(
      { error: "Kon TTS service niet bereiken." },
      { status: 502 },
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveVoiceId(label: string): string {
  // Map TalkSettings voice labels → ElevenLabs voice IDs (verified May 2026).
  const VOICE_MAP: Record<string, string> = {
    rachel: "EXAVITQu4vr4xnSDxMaL", // Sarah (ElevenLabs renamed Rachel → Sarah)
    sarah: "EXAVITQu4vr4xnSDxMaL",  // Sarah
    adam: "pNInz6obpgDQGcFmaJgB",   // Adam
    bella: "hpp4J3VqNfWAUOO0d1Us",  // Bella
    daniel: "onwK4e9ZLuTAKqWW03F9", // Daniel
    antoni: "cjVigY5qzO86Huf0OWal", // Eric (smooth, closest to Antoni)
  };
  const mapped = VOICE_MAP[label.toLowerCase()];
  if (mapped) return mapped;
  // If not a known label, treat it as a raw ElevenLabs voice ID.
  if (label.length > 10) return label;
  return "EXAVITQu4vr4xnSDxMaL"; // sarah fallback
}

function resolveLlmProviderModel(
  llm: string,
  fallbackProvider: string,
): [provider: string, model: string] {
  // llm format examples: "gpt-4o", "claude-sonnet-4-5", "ollama:llama3"
  if (llm.startsWith("ollama:")) {
    const model = llm.slice(7);
    return ["ollama", model];
  }
  if (llm.includes("claude")) {
    return ["claude", llm];
  }
  if (llm.includes("gpt") || llm.includes("openai")) {
    return ["openrouter", llm];
  }
  if (llm.includes("gemini")) {
    return ["openrouter", llm];
  }
  // Default: use openrouter as reverse proxy
  return [fallbackProvider, llm];
}
