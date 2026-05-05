// POST /api/talk — Voice pipeline endpoint.
//
// Flow: audio blob → Whisper STT → LLM → ElevenLabs TTS → MP3 stream
//
// Request:  FormData { audio: Blob, agent_id: string, workspace_slug: string }
// Response: audio/mpeg (MP3 stream) or JSON error

import { NextResponse } from "next/server";

import { streamChat } from "@aio/ai/router";
import type { AgentConfig } from "@aio/ai/router";
import type { ChatMessage } from "@aio/ai/ag-ui";
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

  // ── 3. Load agent + workspace ────────────────────────────────────────────
  const agent = await getAgentById(agentId);
  if (!agent) {
    return NextResponse.json({ error: "Agent niet gevonden." }, { status: 404 });
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, slug, ollama_endpoint")
    .eq("slug", workspaceSlug)
    .maybeSingle();

  if (!workspace || workspace.id !== agent.workspace_id) {
    return NextResponse.json({ error: "Workspace mismatch." }, { status: 403 });
  }

  // ── 4. Load talk_settings ─────────────────────────────────────────────────
  const { data: talkSettings } = await supabase
    .from("talk_settings")
    .select(
      "provider, model, llm, stt, voice, stability, similarity",
    )
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  ttsProvider = talkSettings?.provider ?? "elevenlabs";
  sttProvider = talkSettings?.stt ?? "whisper-1";
  voiceId = resolveVoiceId(talkSettings?.voice ?? "rachel");

  // ── 5. STT — Whisper-1 ───────────────────────────────────────────────────
  const openAiKey = await resolveApiKey("openai", {
    workspaceId: workspace.id,
    businessId: agent.business_id,
  });

  if (!openAiKey) {
    return NextResponse.json(
      { error: "Geen OpenAI API key geconfigureerd voor STT." },
      { status: 500 },
    );
  }

  try {
    const sttForm = new FormData();
    sttForm.append("file", audioBlob, "recording.webm");
    sttForm.append("model", "whisper-1");
    sttForm.append("response_format", "json");

    const sttRes = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}` },
        body: sttForm,
      },
    );

    if (!sttRes.ok) {
      const err = await sttRes.json().catch(() => ({}));
      console.error("[talk] Whisper error:", err);
      return NextResponse.json(
        { error: `STT fout: ${(err as { error?: { message?: string } }).error?.message ?? "onbekend"}` },
        { status: 502 },
      );
    }

    const sttData = (await sttRes.json()) as { text?: string };
    transcription = sttData.text?.trim() ?? "";
    if (!transcription) {
      return NextResponse.json(
        { error: "Kon spraak niet verstaan. Praat harder of duidelijker." },
        { status: 422 },
      );
    }
  } catch (err) {
    console.error("[talk] Whisper fetch failed:", err);
    return NextResponse.json(
      { error: "Kon STT service niet bereiken." },
      { status: 502 },
    );
  }

  // ── 6. LLM — use agent's own provider/model/system-prompt ───────────────
  // talk_settings.llm is an optional override; when absent we use the
  // agent's own provider + model so the voice conversation feels like
  // talking directly to that agent.
  const agentConfig = (agent.config ?? {}) as AgentConfig;
  const llmConfig = talkSettings?.llm ?? null;
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
    workspaceId: workspace.id,
    businessId: agent.business_id,
  });

  const ollamaEndpoint = await resolveOllamaEndpoint(workspace.id);

  // Build the same context-rich system prompt as chat/dispatch so the
  // agent knows about its business, integrations, sibling agents, etc.
  const preamble = await buildAgentSystemPrompt({
    id: agent.id,
    workspace_id: workspace.id,
    business_id: agent.business_id,
    name: agent.name,
    kind: agent.kind,
    provider: agent.provider,
    model: agent.model,
  });
  // Append a talk-specific note so the agent keeps answers short.
  const talkNote = "Je wordt aangesproken via spraakinvoer. Geef korte, gesproken antwoorden — maximaal 2-3 zinnen.";
  const systemPrompt = prependPreamble(preamble, agentConfig.systemPrompt)
    + `\n\n---\n\n${talkNote}`;

  const messages: ChatMessage[] = [
    { role: "user", content: transcription },
  ];

  try {
    const fullText: string[] = [];
    for await (const event of streamChat({
      provider: resolvedProvider as "openrouter" | "ollama" | "claude" | "claude_cli" | "minimax",
      config: {
        model: resolvedModel,
        systemPrompt,
      },
      messages,
      apiKey,
      tenant: {
        workspaceId: workspace.id,
        businessId: agent.business_id,
        ollamaEndpoint: ollamaEndpoint ?? undefined,
      },
    })) {
      if (event.type === "token") {
        fullText.push(event.delta);
      }
      if (event.type === "message_end") break;
    }
    llmResponseText = fullText.join("");
  } catch (err) {
    console.error("[talk] LLM error:", err);
    return NextResponse.json(
      { error: "Kon LLM service niet bereiken." },
      { status: 502 },
    );
  }

  // ── 7. TTS — ElevenLabs ──────────────────────────────────────────────────
  if (ttsProvider !== "elevenlabs") {
    // Only ElevenLabs is implemented for now — fallback to ElevenLabs anyway
    console.warn(`[talk] Provider ${ttsProvider} not implemented, using elevenlabs`);
  }

  const elevenlabsKey = await resolveApiKey("elevenlabs", {
    workspaceId: workspace.id,
    businessId: agent.business_id,
  });

  if (!elevenlabsKey) {
    return NextResponse.json(
      { error: "Geen ElevenLabs API key geconfigureerd." },
      { status: 500 },
    );
  }

  const stability = talkSettings?.stability ?? 0.55;
  const similarity = talkSettings?.similarity ?? 0.75;

  const encoder = new TextEncoder();
  const durationMs = Date.now() - startedAt;

  console.info(
    `[talk] OK — ws=${workspaceSlug} agent=${agentId} ` +
      `stt=${sttProvider} transcription="${transcription}" ` +
      `llm=${llmConfig} response_len=${llmResponseText.length} ` +
      `tts=${ttsProvider} voice=${voiceId} duration_ms=${durationMs}`,
  );

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
      console.error("[talk] ElevenLabs error:", err);
      return NextResponse.json(
        { error: `TTS fout: kon audio niet genereren.` },
        { status: 502 },
      );
    }

    // Pipe the audio stream back to the browser
    if (!ttsRes.body) {
      return NextResponse.json(
        { error: "TTS service gaf lege response." },
        { status: 502 },
      );
    }

    // ── 9. Log the session (fire-and-forget, non-blocking) ─────────────────
    const logRow = {
      workspace_id: workspace.id,
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
    };
    getServiceRoleSupabase()
      .from("talk_session_logs")
      .insert(logRow)
      .then(({ error: logErr }) => {
        if (logErr) console.error("[talk] log insert failed:", logErr);
      });

    return new Response(ttsRes.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
        "X-Transcript": encoder.encode(transcription).toString(),
        "X-Response-Text": encoder.encode(llmResponseText.slice(0, 200)).toString(),
        "X-Duration-Ms": String(durationMs),
      },
    });
  } catch (err) {
    console.error("[talk] ElevenLabs fetch failed:", err);
    // Log the failed session
    void getServiceRoleSupabase()
      .from("talk_session_logs")
      .insert({
        workspace_id: workspace.id,
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
  // Map the voice labels from TalkSettings VOICES array to ElevenLabs voice IDs.
  // These are the built-in ElevenLabs voice IDs for the Rachel/Adam/Bella/etc. voices.
  const VOICE_MAP: Record<string, string> = {
    rachel: "EXAVITQm4R8VDqDW9Pei",
    adam: "pFZP5JQG7iQjIQuC4Bku",
    bella: "xrHel9SFnCep49fNMvW0",
    daniel: "iC98bXHCLPXjlN4hNVNx",
    sarah: "EXwk3nR0cGBLbfpEzxe6",
    antoni: "nPMa2Z5C8Z7xhJFPvFxz",
  };
  const voice = VOICE_MAP[label.toLowerCase()];
  if (voice) return voice;
  return "EXAVITQm4R8VDqDW9Pei"; // rachel fallback
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
