// Modal drawer that renders a past run as a chat conversation:
// user prompt → assistant turn(s) → tool calls + results → errors.
// Falls back to input/output text when message_history is absent
// (legacy runs from before phase-with-history).

"use client";

import { useEffect, useState } from "react";

import type { RunStep } from "../lib/runs/message-history";

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
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    fetch(`${base}/api/runs/${runId}`, { signal: ctl.signal })
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
  }, [runId]);

  // ESC closes the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

        {run && <RunFooter run={run} />}
      </div>
    </div>
  );
}

function RunBody({ run }: { run: RunDetail }) {
  const steps = stepsFor(run);
  if (steps.length === 0) {
    return (
      <p style={{ color: "var(--app-fg-3)", fontSize: 13 }}>
        Geen inhoud opgeslagen voor deze run.
      </p>
    );
  }
  return (
    <>
      {steps.map((step, i) => (
        <StepBubble key={i} step={step} />
      ))}
    </>
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
      <Bubble side="right" tone="user">
        {step.text}
      </Bubble>
    );
  }
  if (step.kind === "assistant") {
    return (
      <Bubble side="left" tone="assistant">
        {step.text || <em style={{ color: "var(--app-fg-3)" }}>(leeg)</em>}
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
      <strong style={{ display: "block", marginBottom: 4 }}>Error</strong>
      {step.message}
    </div>
  );
}

function Bubble({
  side,
  tone,
  children,
}: {
  side: "left" | "right";
  tone: "user" | "assistant";
  children: React.ReactNode;
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
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: isUser ? "var(--tt-green)" : "var(--app-fg-3)",
          marginBottom: 4,
        }}
      >
        {isUser ? "Input" : "Assistant"}
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
        <span style={{ color: "var(--app-fg-3)", fontSize: 11, marginLeft: "auto" }}>
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
