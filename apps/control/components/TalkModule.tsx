// Talk-to-AI header module
//
// Layout: [mic | agent ▾]
//
// Mic button states:
//   - idle/error: green pulse
//   - listening: orange + real-time waveform bars driven by currentVolume
//   - processing: blue spinner
//   - playing: blue spinner
//
// Agent pill: agent switcher dropdown

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ChevronDownIcon, ChevronRightIcon, MicIcon, SettingsIcon } from "@aio/ui/icon";
import { useAudioCapture } from "../hooks/useAudioCapture";

export type TalkAgent = {
  id: string;
  name: string;
  biz: string;
  letter: string;
  variant: "brand" | "rose" | "amber" | "violet" | "indigo" | "orange";
  status: "online" | "idle" | "paused";
  voice: string;
  desc: string;
};

type Props = {
  agents: TalkAgent[];
  workspaceSlug: string;
  defaultAgentId?: string;
};

// Mini waveform: 5 bars, heights driven by currentVolume
function Waveform({ volume }: { volume: number }) {
  // volume is 0-255, normalize to 0-1
  const level = Math.min(volume / 80, 1);
  const bars = [0.3, 0.6, 1.0, 0.7, 0.4];
  return (
    <span className="talk-wave" aria-hidden="true">
      {bars.map((base, i) => {
        const height = Math.max(4, Math.round(base * level * 18));
        return (
          <i
            key={i}
            style={{
              height,
              animationDelay: `${i * 0.08}s`,
            }}
          />
        );
      })}
    </span>
  );
}

export function TalkModule({ agents, workspaceSlug, defaultAgentId }: Props) {
  const router = useRouter();
  const [agentId, setAgentId] = useState<string>(
    defaultAgentId ?? agents[0]?.id ?? "",
  );
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const {
    state,
    error: captureError,
    currentVolume,
    startCapture,
    stopCapture,
    cancelCapture,
    setAudioUrl,
    onPlaybackEnded,
  } = useAudioCapture({
    silenceThreshold: 10,
    silenceDurationMs: 1500,
    maxDurationMs: 30000,
  });

  const [uiError, setUiError] = useState<string | null>(null);

  const isListening = state === "listening";
  const isProcessing = state === "processing";
  const isPlaying = state === "playing";
  const isIdle = state === "idle" || state === "error";
  const isError = state === "error";
  const isBusy = isProcessing || isPlaying;

  // Click-outside dismiss
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  const agent = agents.find((a) => a.id === agentId) ?? agents[0];
  const onlineCount = agents.filter((a) => a.status === "online").length;

  const goToSettings = () => {
    setOpen(false);
    router.push(`/${workspaceSlug}/settings/talk`);
  };

  const handleMicClick = useCallback(async () => {
    setUiError(null);

    if (isListening) {
      // Second click: stop recording → send to server
      const blob = await stopCapture();
      if (!blob) return;

      const form = new FormData();
      form.append("audio", blob, "recording.webm");
      form.append("agent_id", agentId);
      form.append("workspace_slug", workspaceSlug);

      try {
        const res = await fetch("/api/talk", { method: "POST", body: form });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Onbekende fout" }));
          setUiError((err as { error?: string }).error ?? "Fout bij verwerken.");
          return;
        }

        const audioBlob = await res.blob();
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        if (audioRef.current) {
          audioRef.current.src = url;
          await audioRef.current.play();
        }
      } catch {
        setUiError("Kon server niet bereiken. Check je verbinding.");
      }
    } else if (isIdle) {
      // First click: start recording
      await startCapture();
    }
    // isBusy clicks are ignored (button is disabled)
  }, [isListening, isIdle, isBusy, stopCapture, startCapture, agentId, workspaceSlug, setAudioUrl]);

  // Reset error when state clears
  useEffect(() => {
    if (state === "listening" || state === "idle") setUiError(null);
  }, [state]);

  if (!agent) {
    return (
      <button
        type="button"
        onClick={goToSettings}
        className="talk-module"
        style={{ opacity: 0.7 }}
        title="Geen agents — open Talk settings"
      >
        <span className="talk-mic">
          <span className="talk-mic-pulse">
            <MicIcon size={14} />
          </span>
        </span>
        <span className="talk-agent">
          <span className="talk-agent-name">Geen agents</span>
        </span>
      </button>
    );
  }

  const micTitle = isListening
    ? "Stop met praten"
    : isBusy
      ? "Verwerken…"
      : isError
        ? `Fout: ${captureError ?? uiError}`
        : `Praat met ${agent.name}`;

  return (
    <div className="talk-module" ref={ref}>
      <audio ref={audioRef} onEnded={onPlaybackEnded} style={{ display: "none" }} />

      <button
        type="button"
        className={[
          "talk-mic",
          isListening ? "is-listening" : "",
          isBusy ? "is-busy" : "",
          isError ? "is-error" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={handleMicClick}
        title={micTitle}
        disabled={isBusy}
      >
        <span className="talk-mic-pulse">
          <MicIcon size={14} />
        </span>

        {/* Waveform — real volume bars while listening */}
        {isListening && <Waveform volume={currentVolume} />}

        {/* Spinner while processing or playing */}
        {isBusy && (
          <span className="talk-wave talk-wave-busy" aria-hidden="true">
            <i className="talk-spinner" />
          </span>
        )}
      </button>

      <button
        type="button"
        className={"talk-agent " + (open ? "is-open" : "")}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={"talk-agent-dot " + agent.variant}>{agent.letter}</span>
        <span className="talk-agent-name">{agent.name}</span>
        <span className="talk-agent-caret">
          <ChevronDownIcon size={12} />
        </span>
      </button>

      {open && (
        <div className="talk-dropdown" role="menu">
          <div className="talk-dropdown-head">
            <span className="talk-dropdown-title">Kies een agent</span>
            <span className="talk-dropdown-meta">
              {onlineCount} / {agents.length} online
            </span>
          </div>

          <div className="talk-dropdown-list">
            {agents.map((a) => (
              <button
                key={a.id}
                type="button"
                className={
                  "talk-agent-row " +
                  (a.id === agentId ? "is-active " : "") +
                  a.status
                }
                onClick={() => { setAgentId(a.id); setOpen(false); }}
              >
                <span className={"talk-agent-row-dot " + a.variant}>{a.letter}</span>
                <span className="talk-agent-row-body">
                  <span className="talk-agent-row-name">
                    {a.name}
                    <span className={"talk-agent-row-status " + a.status} />
                  </span>
                  <span className="talk-agent-row-sub">{a.biz} · {a.desc}</span>
                </span>
                <span className="talk-agent-row-voice">{a.voice}</span>
              </button>
            ))}
          </div>

          <button type="button" className="talk-dropdown-settings" onClick={goToSettings}>
            <SettingsIcon size={14} />
            <span>Talk settings — provider, stem, log</span>
            <ChevronRightIcon size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
