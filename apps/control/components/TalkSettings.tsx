// Talk-to-AI settings page. Direct port of the Claude Design mockup
// (talk-module.jsx → TalkSettings, see chat3.md).
//
// Sections:
//   1. Praat met AI — provider (TTS), API key, model, LLM, STT
//   2. Stem — voice grid + stability/similarity sliders
//   3. Mic gedrag — push-to-talk, auto-stop, hotword toggles
//   4. Log — last interactions with timestamp / who / dur / latency
//
// All persisted via the workspace `talk_settings` row (migration 038)
// + the api_keys table for the provider key (synthetic providers
// "elevenlabs", "openai_tts", "azure_speech"). Per-agent overrides
// will land later on the agent edit dialog — this page is the
// workspace default.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveTalkSettings, type TalkSettingsInput } from "../app/actions/talk";

export type TalkSettingsRow = {
  workspace_id: string;
  provider: string;
  model: string;
  llm: string;
  stt: string;
  voice: string;
  stability: number;
  similarity: number;
  push_to_talk: boolean;
  auto_stop: boolean;
  hotword: boolean;
};

export type TalkLogEntry = {
  t: string;
  who: "You" | "Agent";
  msg: string;
  dur: string;
  ms: string;
};

type Props = {
  initial: TalkSettingsRow;
  /** Workspace slug — used by the save action to resolve the row. */
  workspaceSlug: string;
  /** Masked + last-4 preview of the provider keys, looked up
   *  server-side per row. Shape: { elevenlabs: "sk_•••• 9c2a", … }. */
  keyPreviews: Record<string, string>;
  log: TalkLogEntry[];
};

const VOICES = [
  { id: "rachel", name: "Rachel", lang: "EN", style: "warm, professional" },
  { id: "adam", name: "Adam", lang: "NL", style: "clear, neutral" },
  { id: "bella", name: "Bella", lang: "EN", style: "expressive, sales" },
  { id: "daniel", name: "Daniel", lang: "NL", style: "broadcaster" },
  { id: "sarah", name: "Sarah", lang: "EN", style: "crisp, calm" },
  { id: "antoni", name: "Antoni", lang: "EN/NL", style: "low, narrative" },
] as const;

const PROVIDERS: {
  id: string;
  label: string;
  sub: string;
  /** which api_keys provider name backs this card */
  keyProvider: string;
}[] = [
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    sub: "Voice clones · 32 talen",
    keyProvider: "elevenlabs",
  },
  {
    id: "openai",
    label: "OpenAI TTS",
    sub: "tts-1-hd · snel & goedkoop",
    keyProvider: "openai_tts",
  },
  {
    id: "azure",
    label: "Azure Speech",
    sub: "Neural · enterprise",
    keyProvider: "azure_speech",
  },
  {
    id: "native",
    label: "LLM native",
    sub: "Realtime API · 1 hop",
    keyProvider: "openai",
  },
];

export function TalkSettings({
  initial,
  workspaceSlug,
  keyPreviews,
  log,
}: Props) {
  const router = useRouter();
  const [provider, setProvider] = useState(initial.provider);
  const [model, setModel] = useState(initial.model);
  const [llm, setLlm] = useState(initial.llm);
  const [stt, setStt] = useState(initial.stt);
  const [voice, setVoice] = useState(initial.voice);
  const [stability, setStability] = useState(initial.stability);
  const [similarity, setSimilarity] = useState(initial.similarity);
  const [pushToTalk, setPushToTalk] = useState(initial.push_to_talk);
  const [autoStop, setAutoStop] = useState(initial.auto_stop);
  const [hotword, setHotword] = useState(initial.hotword);

  // The API-key field is read-only here and only renders the masked
  // preview. Editing routes the user to /settings/keys (the existing
  // workspace api-keys panel) — keeps the secret-handling in one
  // place and avoids re-implementing rotation/encryption flows.
  const providerSpec = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0]!;
  const keyPreview = keyPreviews[providerSpec.keyProvider] ?? "Niet ingesteld";

  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const patch: TalkSettingsInput & { workspace_slug: string } = {
        workspace_slug: workspaceSlug,
        provider: provider as TalkSettingsInput["provider"],
        model,
        llm,
        stt,
        voice,
        stability,
        similarity,
        push_to_talk: pushToTalk,
        auto_stop: autoStop,
        hotword,
      };
      const res = await saveTalkSettings(patch);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── Provider + key + model + LLM + STT ─────────────── */}
      <div className="card">
        <h3>Praat met AI</h3>
        <p className="desc">
          Default provider, stem en model voor de microfoon-knop in de header.
          Per-agent overrides kun je instellen op de agent-pagina.
        </p>

        <div className="field">
          <div className="lbl">
            Provider (TTS)
            <small>
              Wie de stem genereert. ElevenLabs voor kwaliteit, LLM-native voor
              snelheid.
            </small>
          </div>
          <div>
            <div className="talk-pick">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={
                    "talk-pick-card " + (provider === p.id ? "is-active" : "")
                  }
                  onClick={() => setProvider(p.id)}
                >
                  <span className="talk-pick-name">{p.label}</span>
                  <span className="talk-pick-sub">{p.sub}</span>
                </button>
              ))}
            </div>
          </div>
          <div />
        </div>

        <div className="field">
          <div className="lbl">
            API key
            <small>
              Versleuteld opgeslagen via de workspace api-keys.{" "}
              <a href="../keys" style={{ color: "var(--tt-green)", fontWeight: 700 }}>
                Beheer →
              </a>
            </small>
          </div>
          <div className="talk-key">
            <input
              type="text"
              value={keyPreview}
              readOnly
              style={{ opacity: 0.85 }}
            />
            <span style={{ fontSize: 11, color: "var(--app-fg-3)", padding: "0 6px" }}>
              {keyPreview === "Niet ingesteld" ? "Niet ingesteld" : "Verborgen"}
            </span>
          </div>
          <div />
        </div>

        <div className="field">
          <div className="lbl">
            Model
            <small>Welke variant van de provider.</small>
          </div>
          <div>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="eleven_multilingual_v2">
                eleven_multilingual_v2 (NL + EN)
              </option>
              <option value="eleven_turbo_v2_5">
                eleven_turbo_v2_5 (lage latency)
              </option>
              <option value="tts-1-hd">openai · tts-1-hd</option>
              <option value="gpt-4o-realtime">gpt-4o-realtime</option>
            </select>
          </div>
          <div />
        </div>

        <div className="field">
          <div className="lbl">
            LLM
            <small>Brein achter de antwoorden.</small>
          </div>
          <div>
            <select value={llm} onChange={(e) => setLlm(e.target.value)}>
              <option value="gpt-4o">OpenAI · gpt-4o</option>
              <option value="claude-sonnet-4-5">
                Anthropic · claude-sonnet-4-5
              </option>
              <option value="gemini-2.5-pro">Google · gemini-2.5-pro</option>
              <option value="local-llama">Local · llama-3.3 70b</option>
            </select>
          </div>
          <div />
        </div>

        <div className="field">
          <div className="lbl">
            Speech-to-text
            <small>Wat je zegt → tekst voor de LLM.</small>
          </div>
          <div>
            <select value={stt} onChange={(e) => setStt(e.target.value)}>
              <option value="whisper-1">OpenAI Whisper · v1</option>
              <option value="deepgram-nova-3">Deepgram Nova-3</option>
              <option value="elevenlabs-stt">ElevenLabs STT</option>
            </select>
          </div>
          <div />
        </div>
      </div>

      {/* ── Voice grid + sliders ───────────────────────────── */}
      <div className="card">
        <h3>Stem</h3>
        <p className="desc">
          Default stem voor de mic-knop. Kan per agent worden overschreven.
        </p>

        <div className="voice-grid">
          {VOICES.map((v) => (
            <button
              key={v.id}
              type="button"
              className={"voice-card " + (voice === v.id ? "is-active" : "")}
              onClick={() => setVoice(v.id)}
            >
              <span className="voice-card-head">
                <span className="voice-avatar">{v.name[0]}</span>
                <span>
                  <span className="voice-name">{v.name}</span>
                  <span className="voice-sub">
                    {v.lang} · {v.style}
                  </span>
                </span>
              </span>
              <span className="voice-wave">
                {[6, 12, 18, 24, 18, 12, 8, 14, 10, 16, 8, 4].map((h, i) => (
                  <i key={i} style={{ height: h }} />
                ))}
              </span>
              <span className="voice-actions">
                <span className="voice-play">▶ Preview</span>
                {voice === v.id && (
                  <span className="voice-active-pill">In gebruik</span>
                )}
              </span>
            </button>
          ))}
        </div>

        <div className="field">
          <div className="lbl">
            Stability
            <small>Lager = expressiever, hoger = consistenter.</small>
          </div>
          <div className="talk-slider">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={stability}
              onChange={(e) => setStability(parseFloat(e.target.value))}
            />
            <span className="talk-slider-val">
              {Math.round(stability * 100)}%
            </span>
          </div>
          <div />
        </div>
        <div className="field">
          <div className="lbl">
            Similarity boost
            <small>Hoe dicht bij de originele stem.</small>
          </div>
          <div className="talk-slider">
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={similarity}
              onChange={(e) => setSimilarity(parseFloat(e.target.value))}
            />
            <span className="talk-slider-val">
              {Math.round(similarity * 100)}%
            </span>
          </div>
          <div />
        </div>
      </div>

      {/* ── Mic gedrag ─────────────────────────────────────── */}
      <div className="card">
        <h3>Mic gedrag</h3>
        <p className="desc">
          Hoe de microfoon zich gedraagt als je &apos;m activeert.
        </p>
        <div className="field">
          <div className="lbl">
            Push-to-talk
            <small>Houd de spatiebalk ingedrukt om te praten.</small>
          </div>
          <div className="val">{pushToTalk ? "On" : "Off"}</div>
          <ToggleSwitch on={pushToTalk} onChange={setPushToTalk} />
        </div>
        <div className="field">
          <div className="lbl">
            Auto-stop bij stilte
            <small>Stop automatisch na 1.5s stilte.</small>
          </div>
          <div className="val">{autoStop ? "On" : "Off"}</div>
          <ToggleSwitch on={autoStop} onChange={setAutoStop} />
        </div>
        <div className="field">
          <div className="lbl">
            Hotword
            <small>&quot;Hé Tromp&quot; om altijd te luisteren.</small>
          </div>
          <div className="val">{hotword ? "On" : "Off"}</div>
          <ToggleSwitch on={hotword} onChange={setHotword} />
        </div>
      </div>

      {/* ── Log ────────────────────────────────────────────── */}
      <div className="card">
        <h3>
          Log{" "}
          <span className="talk-log-count">
            · {log.length} interacties · vandaag
          </span>
        </h3>
        <p className="desc">
          Alles wat je hebt gezegd en wat de agent heeft geantwoord. Gebruikt
          voor debugging en auto-tuning.
        </p>
        {log.length === 0 ? (
          <p
            style={{
              fontSize: 12.5,
              color: "var(--app-fg-3)",
              fontStyle: "italic",
              padding: "16px 0",
            }}
          >
            Nog geen interacties gelogd. Klik de mic-knop in de header om je
            eerste turn te starten.
          </p>
        ) : (
          <div className="talk-log">
            {log.map((l, i) => (
              <div
                key={i}
                className={"talk-log-row " + l.who.toLowerCase()}
              >
                <span className="talk-log-time">{l.t}</span>
                <span className={"talk-log-who " + l.who.toLowerCase()}>
                  {l.who}
                </span>
                <span className="talk-log-msg">{l.msg}</span>
                <span className="talk-log-meta">
                  {l.dur} · {l.ms}
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" className="btn">
            Export JSON
          </button>
          <button type="button" className="btn">
            Export CSV
          </button>
          <button type="button" className="btn danger">
            Wis log
          </button>
        </div>
      </div>

      {/* ── Save bar ───────────────────────────────────────── */}
      <div
        style={{
          position: "sticky",
          bottom: 12,
          alignSelf: "flex-end",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        {error && (
          <span style={{ color: "var(--rose)", fontSize: 12.5 }}>
            {error}
          </span>
        )}
        {savedAt && !error && (
          <span
            style={{
              color: "var(--tt-green)",
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            ✓ Opgeslagen om {savedAt}
          </span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={pending}
          style={{
            padding: "10px 18px",
            border: "1.5px solid var(--tt-green)",
            background: "var(--tt-green)",
            color: "#fff",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 13,
            cursor: pending ? "wait" : "pointer",
            boxShadow: "0 8px 24px -8px rgba(57,178,85,0.4)",
          }}
        >
          {pending ? "Opslaan…" : "Opslaan"}
        </button>
      </div>
    </div>
  );
}

/** Compact toggle switch matching the rest of the settings UI. */
function ToggleSwitch({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        width: 42,
        height: 24,
        borderRadius: 999,
        border: "1.5px solid",
        borderColor: on ? "var(--tt-green)" : "var(--app-border)",
        background: on ? "var(--tt-green)" : "var(--app-card-2)",
        position: "relative",
        cursor: "pointer",
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: on ? "#fff" : "var(--app-fg-3)",
          transition: "left 0.15s ease",
        }}
      />
    </button>
  );
}
