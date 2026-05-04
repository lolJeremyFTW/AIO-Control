// Modal drawer that renders a past run as a chat conversation:
// user prompt → assistant turn(s) → tool calls + results → errors.
// Falls back to input/output text when message_history is absent
// (legacy runs from before phase-with-history).

"use client";

import { useEffect, useState } from "react";

import type { RunStep } from "../lib/runs/message-history";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import { MarkdownText } from "./MarkdownText";

type RunDetail = {
  id: string;
  workspace_id: string;
  agent_id: string;
  business_id: string | null;
  schedule_id: string | null;
  triggered_by: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  cost_cents: number;
  input: unknown;
  output: { text?: string } | null;
  error_text: string | null;
  message_history: RunStep[] | null;
  created_at: string;
  agents: { id: string; name: string; provider: string; model: string | null } | null;
};

type Props = {
  runId: string;
  onClose: () => void;
};

export function RunDetailDrawer({ runId, onClose }: Props) {
  // Internal "which run am I showing now" state. Starts at the prop and
  // pivots to a new run id when the user posts a follow-up message —
  // the new run carries the prior message_history forward, so the
  // drawer keeps showing the full thread without juggling external state.
  const [currentRunId, setCurrentRunId] = useState(runId);
  // Reset to the prop's run when the parent opens a different one.
  useEffect(() => {
    setCurrentRunId(runId);
  }, [runId]);

  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redispatching, setRedispatching] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [followupText, setFollowupText] = useState("");
  const [followupSending, setFollowupSending] = useState(false);

  // Re-fetch counter — bumped on realtime events so a still-running run
  // streams its updates into this drawer live (status: running → done,
  // message_history grows with each tool call).
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    setLoading(tick === 0);
    setError(null);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    fetch(`${base}/api/runs/${currentRunId}`, { signal: ctl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<{ run: RunDetail }>;
      })
      .then((data) => setRun(data.run))
      .catch((err) => {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
    return () => ctl.abort();
  }, [currentRunId, tick]);

  // Subscribe to changes on this specific run row — fires as the
  // dispatcher promotes queued → running → done and writes message_history.
  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseBrowserClient>;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      return;
    }
    const ch = supabase
      .channel(`run-detail:${currentRunId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on(
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "aio_control",
          table: "runs",
          filter: `id=eq.${currentRunId}`,
        },
        () => setTick((t) => t + 1),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [currentRunId]);

  // ESC closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Re-dispatch the run via the existing /api/runs/[id]/dispatch endpoint.
  // The endpoint resets the row to "queued" and runs dispatchRun, so the
  // realtime subscription above streams the new run's progress straight
  // into this drawer — no full reopen needed.
  const redispatch = async () => {
    setRedispatching(true);
    setError(null);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    try {
      const res = await fetch(`${base}/api/runs/${currentRunId}/dispatch`, {
        method: "POST",
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || `Dispatch faalde (${res.status})`);
      }
      setTick((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "dispatch error");
    } finally {
      setRedispatching(false);
    }
  };

  // Mark this run as cancelled. The dispatcher may still be mid-call
  // — the API just flips status to "failed" with a clear error_text
  // so the drawer stops the spinner; full interruption needs an
  // AbortController in streamChat, follow-up work.
  const stopRun = async () => {
    setStopping(true);
    setError(null);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    try {
      const res = await fetch(`${base}/api/runs/${currentRunId}/stop`, {
        method: "POST",
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || `Stop faalde (${res.status})`);
      }
      setTick((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "stop error");
    } finally {
      setStopping(false);
    }
  };

  // Post a follow-up message: server creates a new run with the prior
  // message_history merged + the new user turn appended. We pivot the
  // drawer to the new run id so the realtime subscription above streams
  // the assistant response into the same view.
  const sendFollowup = async () => {
    const text = followupText.trim();
    if (!text || followupSending) return;
    setFollowupSending(true);
    setError(null);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    try {
      const res = await fetch(`${base}/api/runs/${currentRunId}/followup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      if (!res.ok) {
        const errText = await res.text();
        setError(errText || `Verzenden faalde (${res.status})`);
        return;
      }
      const data = (await res.json()) as { run_id: string };
      setFollowupText("");
      setCurrentRunId(data.run_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "followup error");
    } finally {
      setFollowupSending(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "flex-end",
        backdropFilter: "blur(2px)",
      }}
    >
      {/* Pulse animation for the typing-bubble dots — scoped so it
          doesn't leak into other stylesheets. */}
      <style>{`
        @keyframes tt-pulse {
          0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
          30% { opacity: 0.95; transform: translateY(-2px); }
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 92vw)",
          height: "100%",
          background: "var(--app-card)",
          borderLeft: "1.5px solid var(--app-border)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-12px 0 32px rgba(0,0,0,0.25)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 18px",
            borderBottom: "1px solid var(--app-border)",
            background: "var(--app-card-2)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--hand)",
              fontSize: 20,
              fontWeight: 700,
              flex: 1,
            }}
          >
            {run?.agents?.name ?? "Run detail"}
          </span>
          {run && <StatusPill status={run.status} />}
          {run &&
            (run.status === "queued" || run.status === "running") && (
              <button
                type="button"
                onClick={() => void stopRun()}
                disabled={stopping}
                aria-label="Stop deze run"
                style={{
                  padding: "6px 10px",
                  border: "1.5px solid var(--rose)",
                  background: stopping
                    ? "rgba(230,82,107,0.18)"
                    : "rgba(230,82,107,0.08)",
                  color: "var(--rose)",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: stopping ? "wait" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {stopping ? "Stoppen…" : "■ Stop"}
              </button>
            )}
          {run && (run.status === "failed" || run.status === "done") && (
            <button
              type="button"
              onClick={() => void redispatch()}
              disabled={redispatching}
              aria-label="Opnieuw uitvoeren"
              style={{
                padding: "6px 10px",
                border: "1.5px solid var(--tt-green)",
                background: redispatching
                  ? "rgba(57,178,85,0.15)"
                  : "rgba(57,178,85,0.08)",
                color: "var(--tt-green)",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 12,
                cursor: redispatching ? "wait" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {redispatching ? "Bezig…" : "↻ Opnieuw"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Sluiten"
            style={{
              padding: "6px 10px",
              border: "1.5px solid var(--app-border)",
              background: "transparent",
              color: "var(--app-fg)",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </header>

        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "16px 18px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {loading && (
            <p style={{ color: "var(--app-fg-3)", fontSize: 13 }}>Laden…</p>
          )}
          {error && (
            <p
              style={{
                color: "var(--rose)",
                background: "rgba(230,82,107,0.08)",
                border: "1px solid rgba(230,82,107,0.4)",
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 12.5,
              }}
            >
              {error}
            </p>
          )}
          {run && <RunBody run={run} />}
        </div>

        {/* Follow-up composer — always visible, disabled while a run is
            mid-flight. Posting creates a new run carrying this run's
            history forward; the drawer pivots to it so the assistant's
            reply streams into the same view. */}
        {run && (
          <div
            style={{
              borderTop: "1px solid var(--app-border)",
              padding: "10px 14px",
              background: "var(--app-card)",
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
            }}
          >
            <textarea
              value={followupText}
              onChange={(e) => setFollowupText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void sendFollowup();
                }
              }}
              placeholder="Stel een vervolgvraag of geef nieuwe instructies… (Ctrl+Enter om te versturen)"
              rows={2}
              disabled={
                followupSending ||
                run.status === "queued" ||
                run.status === "running"
              }
              style={{
                flex: 1,
                background: "var(--app-card-2)",
                border: "1.5px solid var(--app-border)",
                color: "var(--app-fg)",
                padding: "8px 11px",
                borderRadius: 9,
                fontFamily: "var(--type)",
                fontSize: 13,
                resize: "vertical",
                minHeight: 40,
              }}
            />
            <button
              type="button"
              onClick={() => void sendFollowup()}
              disabled={
                followupSending ||
                !followupText.trim() ||
                run.status === "queued" ||
                run.status === "running"
              }
              style={{
                padding: "9px 14px",
                border: "1.5px solid var(--tt-green)",
                background: "var(--tt-green)",
                color: "#fff",
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 12.5,
                cursor: followupSending ? "wait" : "pointer",
                opacity:
                  followupSending ||
                  !followupText.trim() ||
                  run.status === "queued" ||
                  run.status === "running"
                    ? 0.6
                    : 1,
                whiteSpace: "nowrap",
              }}
            >
              {followupSending ? "Bezig…" : "Verstuur"}
            </button>
          </div>
        )}

        {run && <RunFooter run={run} />}
      </div>
    </div>
  );
}

function RunBody({ run }: { run: RunDetail }) {
  const steps = stepsFor(run);
  const isLive = run.status === "queued" || run.status === "running";

  if (steps.length === 0 && !isLive) {
    return (
      <p style={{ color: "var(--app-fg-3)", fontSize: 13 }}>
        Geen inhoud opgeslagen voor deze run.
      </p>
    );
  }
  // Build a one-liner summary of what the agent is currently doing
  // based on the most recent history step. Tool calls win because
  // they're the most informative ("calling minimax__web_search…");
  // otherwise we report partial assistant text length.
  const last = steps[steps.length - 1];
  let thinking: string | null = null;
  if (isLive) {
    if (last?.kind === "tool_call") {
      thinking = `Roept tool ${last.name} aan…`;
    } else if (last?.kind === "assistant") {
      const len = last.text.length;
      thinking = len > 0 ? `Schrijft antwoord (${len} tekens)…` : null;
    }
  }
  return (
    <>
      {steps.map((step, i) => (
        <StepBubble key={i} step={step} />
      ))}
      {isLive && <PendingBubble status={run.status} thinking={thinking} />}
    </>
  );
}

function PendingBubble({
  status,
  thinking,
}: {
  status: string;
  thinking?: string | null;
}) {
  const fallback = status === "queued" ? "In wachtrij…" : "Agent is bezig…";
  return (
    <div
      style={{
        alignSelf: "flex-start",
        maxWidth: "86%",
        background: "var(--app-card-2)",
        border: "1.5px dashed var(--app-border)",
        color: "var(--app-fg-3)",
        padding: "10px 13px",
        borderRadius: 14,
        borderTopLeftRadius: 4,
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span aria-hidden style={{ display: "inline-flex", gap: 3 }}>
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </span>
      <span style={{ fontSize: 11.5, fontStyle: "italic" }}>
        {thinking ?? fallback}
      </span>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "var(--tt-green)",
        opacity: 0.55,
        animation: `tt-pulse 1.1s ${delay}ms infinite ease-in-out`,
      }}
    />
  );
}

function stepsFor(run: RunDetail): RunStep[] {
  if (run.message_history && run.message_history.length > 0) {
    return run.message_history;
  }
  // Fallback for legacy runs (no message_history captured).
  const fallback: RunStep[] = [];
  const input = run.input as
    | { prompt?: string; messages?: { role: string; content: string }[] }
    | null;
  if (input?.messages) {
    for (const m of input.messages) {
      fallback.push({
        kind: m.role === "assistant" ? "assistant" : "user",
        text: m.content,
      });
    }
  } else if (input?.prompt) {
    fallback.push({ kind: "user", text: input.prompt });
  }
  if (run.output?.text) {
    fallback.push({ kind: "assistant", text: run.output.text });
  }
  if (run.error_text) {
    fallback.push({ kind: "error", message: run.error_text });
  }
  return fallback;
}

function StepBubble({ step }: { step: RunStep }) {
  if (step.kind === "user") {
    return (
      <Bubble side="right" tone="user" at={step.at}>
        {step.text}
      </Bubble>
    );
  }
  if (step.kind === "assistant") {
    return (
      <Bubble side="left" tone="assistant" at={step.at}>
        {step.text ? (
          <MarkdownText text={step.text} />
        ) : (
          <em style={{ color: "var(--app-fg-3)" }}>(leeg)</em>
        )}
      </Bubble>
    );
  }
  if (step.kind === "tool_call") {
    return <ToolCallCard step={step} />;
  }
  return (
    <div
      style={{
        alignSelf: "stretch",
        background: "rgba(230,82,107,0.10)",
        border: "1px solid rgba(230,82,107,0.45)",
        color: "var(--rose)",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 12.5,
        whiteSpace: "pre-wrap",
        fontFamily: "var(--mono, ui-monospace, SFMono-Regular)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 4,
        }}
      >
        <strong>Error</strong>
        {step.at && (
          <span style={{ fontSize: 10, color: "var(--rose)", opacity: 0.7 }}>
            {fmtTime(step.at)}
          </span>
        )}
      </div>
      {step.message}
    </div>
  );
}

function fmtTime(at?: string): string {
  if (!at) return "";
  try {
    return new Date(at).toLocaleTimeString("nl-NL", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

function Bubble({
  side,
  tone,
  children,
  at,
}: {
  side: "left" | "right";
  tone: "user" | "assistant";
  children: React.ReactNode;
  at?: string;
}) {
  const isUser = tone === "user";
  return (
    <div
      style={{
        alignSelf: side === "right" ? "flex-end" : "flex-start",
        maxWidth: "86%",
        background: isUser ? "rgba(57,178,85,0.12)" : "var(--app-card-2)",
        border: `1.5px solid ${isUser ? "rgba(57,178,85,0.4)" : "var(--app-border)"}`,
        color: "var(--app-fg)",
        padding: "10px 13px",
        borderRadius: 14,
        borderTopRightRadius: side === "right" ? 4 : 14,
        borderTopLeftRadius: side === "left" ? 4 : 14,
        fontSize: 13,
        lineHeight: 1.5,
        // user-typed prompts keep newlines; assistant text is already
        // structured by MarkdownText so we let normal flow take over.
        whiteSpace: isUser ? "pre-wrap" : "normal",
        wordBreak: "break-word",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 6,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: isUser ? "var(--tt-green)" : "var(--app-fg-3)",
          }}
        >
          {isUser ? "Input" : "Assistant"}
        </span>
        {at && (
          <span
            style={{
              fontSize: 10,
              color: "var(--app-fg-3)",
              fontFamily: "ui-monospace, Menlo, monospace",
              opacity: 0.7,
            }}
          >
            {fmtTime(at)}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function ToolCallCard({
  step,
}: {
  step: RunStep & { kind: "tool_call" };
}) {
  const [open, setOpen] = useState(false);
  const argsPreview = previewJson(step.args);
  const resultPreview =
    step.result !== undefined ? previewJson(step.result) : null;
  return (
    <div
      style={{
        alignSelf: "stretch",
        background: "var(--app-card-2)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--amber)",
          }}
        >
          Tool · {step.name}
        </span>
        {step.at && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 10,
              color: "var(--app-fg-3)",
              fontFamily: "ui-monospace, Menlo, monospace",
              opacity: 0.7,
            }}
          >
            {fmtTime(step.at)}
          </span>
        )}
        <span style={{ color: "var(--app-fg-3)", fontSize: 11, marginLeft: step.at ? 8 : "auto" }}>
          {open ? "▾" : "▸"}
        </span>
      </div>
      <pre
        style={{
          marginTop: 6,
          marginBottom: 0,
          fontSize: 11,
          color: "var(--app-fg-2)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: open ? "none" : 60,
          overflow: open ? "visible" : "hidden",
          fontFamily: "var(--mono, ui-monospace, SFMono-Regular)",
        }}
      >
        args: {argsPreview}
        {resultPreview != null && `\n\nresult: ${resultPreview}`}
      </pre>
    </div>
  );
}

function previewJson(value: unknown): string {
  try {
    const s = JSON.stringify(value, null, 2);
    return s ?? String(value);
  } catch {
    return String(value);
  }
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "done"
      ? "var(--tt-green)"
      : status === "failed"
        ? "var(--rose)"
        : status === "running"
          ? "var(--tt-green)"
          : "var(--amber)";
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: tone,
        border: `1.5px solid ${tone}`,
        padding: "3px 8px",
        borderRadius: 999,
      }}
    >
      {status}
    </span>
  );
}

function RunFooter({ run }: { run: RunDetail }) {
  return (
    <footer
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: 10,
        padding: "12px 18px",
        borderTop: "1px solid var(--app-border)",
        background: "var(--app-card-2)",
        fontSize: 11.5,
      }}
    >
      <Stat label="Trigger" value={run.triggered_by} />
      <Stat
        label="Duur"
        value={
          run.duration_ms != null
            ? `${(run.duration_ms / 1000).toFixed(2)}s`
            : "—"
        }
      />
      <Stat label="Kosten" value={`€${(run.cost_cents / 100).toFixed(4)}`} />
      <Stat
        label="Provider"
        value={
          run.agents?.provider
            ? `${run.agents.provider}${run.agents.model ? ` · ${run.agents.model}` : ""}`
            : "—"
        }
      />
      <Stat
        label="Tijdstip"
        value={new Date(run.created_at).toLocaleString("nl-NL")}
      />
    </footer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--app-fg-3)",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "var(--app-fg-2)",
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}
