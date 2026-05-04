// Talk-to-AI header module
//
// Layout: [mic | agent ▾]
//
// Mic button states:
//   - idle/error: green pulse
//   - recording: orange + real-time waveform bars driven by volume
//   - processing: blue spinner (sending to server)
//   - playing: blue spinner (TTS playback)
//
// Agent pill: agent switcher dropdown

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ChevronDownIcon, ChevronRightIcon, MicIcon, SettingsIcon } from "@aio/ui/icon";
import { useRecorder } from "../hooks/useRecorder";

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

// Waveform bars driven by volume level (0-255)
function Waveform({ volume }: { volume: number }) {
  const level = Math.min(volume / 80, 1);
  const heights = [30, 65, 100, 70, 40]; // base percentages
  return (
    <span className="talk-wave" aria-hidden="true">
      {heights.map((base, i) => (
        <i
          key={i}
          style={{
            height: Math.max(4, Math.round(base * level * 0.18)),
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </span>
  );
}

export function TalkModule({ agents, workspaceSlug, defaultAgentId }: Props) {
  const router = useRouter();
  const [agentId, setAgentId] = useState<string>(
    defaultAgentId ?? agents[0]?.id ?? "",
  );
  const [open, setOpen] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const {
    state,
    isRecording,
    error: recorderError,
    volume,
    start,
    stop,
    discard,
    setTtsUrl,
    onAudioEnded,
  } = useRecorder();

  const isProcessing = state === "processing";
  const isPlaying = state === "playing";
  const isError = state === "error";
  const isBusy = isProcessing || isPlaying;

  // Click-outside dismiss
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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
    console.info("[TalkModule] mic click, isRecording:", isRecording, "state:", state);
    setUiError(null);

    if (isRecording) {
      // Second click: stop and send to server
      console.info("[TalkModule] calling stop()");
      const blob = await stop();
      console.info("[TalkModule] stop returned, blob:", blob ? "yes" : "null");
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
        setTtsUrl(url);
        if (audioRef.current) {
          audioRef.current.src = url;
          await audioRef.current.play();
        }
      } catch {
        setUiError("Kon server niet bereiken.");
      }
    } else if (state === "idle" || state === "error") {
      // First click: start recording
      console.info("[TalkModule] calling start()");
      await start();
    }
    // isBusy clicks are ignored (button is disabled)
  }, [isRecording, state, agentId, workspaceSlug, start, stop, setTtsUrl]);

  // Clear error when user starts a new action
  useEffect(() => {
    if (state === "idle" || state === "recording") setUiError(null);
  }, [state]);

  if (!agent) {
    return (
      <button type="button" onClick={goToSettings} className="talk-module" style={{ opacity: 0.7 }}>
        <span className="talk-mic">
          <span className="talk-mic-pulse"><MicIcon size={14} /></span>
        </span>
        <span className="talk-agent">
          <span className="talk-agent-name">Geen agents</span>
        </span>
      </button>
    );
  }

  const micClass = [
    "talk-mic",
    isRecording ? "is-listening" : "",
    isBusy ? "is-busy" : "",
    isError ? "is-error" : "",
  ].filter(Boolean).join(" ");

  const micTitle = isRecording
    ? "Stop met praten"
    : isBusy
      ? "Verwerken…"
      : isError
        ? `Fout: ${recorderError ?? uiError}`
        : `Praat met ${agent.name}`;

  return (
    <div className="talk-module" ref={containerRef}>
      <audio ref={audioRef} onEnded={onAudioEnded} style={{ display: "none" }} />

      <button
        type="button"
        className={micClass}
        onClick={handleMicClick}
        title={micTitle}
        disabled={isBusy}
      >
        <span className="talk-mic-pulse">
          <MicIcon size={14} />
        </span>

        {isRecording && <Waveform volume={volume} />}
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
            <span>Talk settings</span>
            <ChevronRightIcon size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
