// Talk-to-AI header module
//
// Layout: [mic | agent ▾]
//
// Mic button states:
//   idle/error  — green pulse (ready to record)
//   requesting  — green pulse (waiting for mic permission)
//   recording   — orange + real-time waveform
//   processing  — blue spinner (server round-trip: STT → LLM → TTS)
//   playing     — blue spinner (TTS audio playing)

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ChevronDownIcon,
  ChevronRightIcon,
  MicIcon,
  SettingsIcon,
} from "@aio/ui/icon";
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

function Waveform({ volume }: { volume: number }) {
  const level = Math.min(volume / 80, 1);
  const heights = [30, 65, 100, 70, 40];
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
  const [playing, setPlaying] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const currentUrlRef = useRef<string | null>(null);

  // Refs so the stable onComplete callback always sees the latest values.
  const agentIdRef = useRef(agentId);
  agentIdRef.current = agentId;
  const workspaceSlugRef = useRef(workspaceSlug);
  workspaceSlugRef.current = workspaceSlug;

  // Called by useRecorder whenever a recording completes. State is
  // "processing" when this fires; the hook auto-resets to "idle" after
  // this promise resolves (or rejects).
  const handleComplete = useCallback(async (blob: Blob) => {
    setUiError(null);

    const form = new FormData();
    form.append("audio", blob, "recording.webm");
    form.append("agent_id", agentIdRef.current);
    form.append("workspace_slug", workspaceSlugRef.current);

    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

    let res: Response;
    try {
      res = await fetch(`${base}/api/talk`, {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
    } catch {
      setUiError("Kon server niet bereiken.");
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Onbekende fout" }));
      setUiError((err as { error?: string }).error ?? "Server fout.");
      return;
    }

    const audioBlob = await res.blob();
    if (audioBlob.size === 0) {
      setUiError("Server stuurde lege audio.");
      return;
    }

    // Revoke any previous URL before creating a new one.
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
    }
    const url = URL.createObjectURL(audioBlob);
    currentUrlRef.current = url;

    const audio = audioRef.current;
    if (!audio) return;

    audio.src = url;
    setPlaying(true);
    try {
      await audio.play();
    } catch {
      // Autoplay blocked by browser.
      setPlaying(false);
      URL.revokeObjectURL(url);
      currentUrlRef.current = null;
    }
    // The hook transitions back to idle automatically after this returns.
  }, []); // stable — reads agentId/workspaceSlug via refs

  const { state, isRecording, error: recorderError, volume, start, stop, reset } =
    useRecorder({ onComplete: handleComplete, silenceMs: 2000 });

  const isProcessing = state === "processing";
  const isRequesting = state === "requesting";
  const isError = state === "error";
  const isBusy = isProcessing || playing;

  // Click-outside dismiss for the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  // Clear UI error when a new recording starts.
  useEffect(() => {
    if (isRecording || isRequesting) setUiError(null);
  }, [isRecording, isRequesting]);

  // Revoke blob URL on unmount.
  useEffect(() => {
    return () => {
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
    };
  }, []);

  const agent = agents.find((a) => a.id === agentId) ?? agents[0];
  const onlineCount = agents.filter((a) => a.status === "online").length;

  const goToSettings = () => {
    setOpen(false);
    router.push(`/${workspaceSlug}/settings/talk`);
  };

  const handleMicClick = useCallback(async () => {
    if (isBusy) return;
    if (isRecording) {
      stop();
    } else {
      if (isError) reset();
      await start();
    }
  }, [isBusy, isRecording, isError, start, stop, reset]);

  if (!agent) {
    return (
      <button
        type="button"
        onClick={goToSettings}
        className="talk-module"
        style={{ opacity: 0.7 }}
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

  const displayError = uiError ?? recorderError;

  const micClass = [
    "talk-mic",
    isRecording ? "is-listening" : "",
    isBusy ? "is-busy" : "",
    displayError ? "is-error" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const micTitle = isRecording
    ? "Klik om te stoppen"
    : isBusy
      ? "Verwerken…"
      : displayError
        ? displayError
        : `Praat met ${agent.name}`;

  return (
    <div className="talk-module" ref={containerRef}>
      <audio
        ref={audioRef}
        onEnded={() => {
          setPlaying(false);
          if (currentUrlRef.current) {
            URL.revokeObjectURL(currentUrlRef.current);
            currentUrlRef.current = null;
          }
        }}
        style={{ display: "none" }}
      />

      <button
        type="button"
        className={micClass}
        onClick={handleMicClick}
        title={micTitle}
        disabled={isBusy}
      >
        <span className="talk-mic-pulse">
          {displayError ? (
            <span style={{ fontSize: 10 }}>✕</span>
          ) : (
            <MicIcon size={14} />
          )}
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
        <span className={"talk-agent-dot " + agent.variant}>
          {agent.letter}
        </span>
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
                onClick={() => {
                  setAgentId(a.id);
                  setOpen(false);
                }}
              >
                <span className={"talk-agent-row-dot " + a.variant}>
                  {a.letter}
                </span>
                <span className="talk-agent-row-body">
                  <span className="talk-agent-row-name">
                    {a.name}
                    <span className={"talk-agent-row-status " + a.status} />
                  </span>
                  <span className="talk-agent-row-sub">
                    {a.biz} · {a.desc}
                  </span>
                </span>
                <span className="talk-agent-row-voice">{a.voice}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="talk-dropdown-settings"
            onClick={goToSettings}
          >
            <SettingsIcon size={14} />
            <span>Talk settings</span>
            <ChevronRightIcon size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
