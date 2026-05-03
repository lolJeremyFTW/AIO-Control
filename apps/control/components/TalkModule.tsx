// Talk-to-AI header module — direct port of the Claude Design mockup
// (talk-module.jsx in the design bundle, see chat3.md for the
// design-intent transcript).
//
// Layout:
//   [mic | agent ▾]
//
// • Mic button (left, semicircle) — click to start/stop recording.
//   Pulses green at rest, swaps to orange + waveform while listening.
// • Agent pill (right, semicircle) — shows the currently-selected
//   agent. Click → dropdown with all workspace agents (status dots,
//   one-line context, voice pill) plus a pinned "Talk settings"
//   link at the bottom that routes to /[ws]/settings/talk.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ChevronDownIcon, ChevronRightIcon, MicIcon, SettingsIcon } from "@aio/ui/icon";

export type TalkAgent = {
  id: string;
  name: string;
  /** Business name or "Workspace" — shown as one-line context. */
  biz: string;
  letter: string;
  /** Color preset key (matches .talk-agent-dot.<variant> CSS). */
  variant: "brand" | "rose" | "amber" | "violet" | "indigo" | "orange";
  status: "online" | "idle" | "paused";
  /** Display label for the assigned voice (e.g. "Rachel · EN"). */
  voice: string;
  /** Short description shown under the row name. */
  desc: string;
};

type Props = {
  agents: TalkAgent[];
  /** Slug used to route to the talk-settings page. */
  workspaceSlug: string;
  /** Initial agent id; falls back to the first agent. */
  defaultAgentId?: string;
};

export function TalkModule({ agents, workspaceSlug, defaultAgentId }: Props) {
  const router = useRouter();
  const [agentId, setAgentId] = useState<string>(
    defaultAgentId ?? agents[0]?.id ?? "",
  );
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside dismiss. Same defer trick as the rest of the shell:
  // attach on the next tick so the click that OPENED the menu doesn't
  // count as outside.
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

  // No agents: render a tiny disabled chip — clicking still routes to
  // settings so the user can configure the talk module on a fresh
  // workspace.
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

  return (
    <div className="talk-module" ref={ref}>
      {/* Mic — start/stop listening */}
      <button
        type="button"
        className={"talk-mic " + (listening ? "is-listening" : "")}
        onClick={() => setListening((l) => !l)}
        title={listening ? "Stop praten" : `Praat met ${agent.name}`}
      >
        <span className="talk-mic-pulse">
          <MicIcon size={14} />
        </span>
        {listening && (
          <span className="talk-wave" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
      </button>

      {/* Agent — click to switch */}
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

      {/* Dropdown */}
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

          {/* Settings strip — pinned bottom */}
          <button
            type="button"
            className="talk-dropdown-settings"
            onClick={goToSettings}
          >
            <SettingsIcon size={14} />
            <span>Talk settings — provider, stem, log</span>
            <ChevronRightIcon size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
