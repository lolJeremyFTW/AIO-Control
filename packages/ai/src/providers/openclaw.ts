// OpenClaw provider — spawns the local `openclaw` CLI in agent mode.
// Treats OpenClaw as a black-box: write prompt → read response.
//
// Default invocation:
//   openclaw agent --local --json -m "<prompt>" --session-id aio-<runId>
//
// The output is JSON-per-line (or a single JSON envelope). We try the
// most common shapes:
//   { content: "..."  }
//   { reply:   "..."  }
//   { message: "..."  }
//   { text:    "..."  }
//
// Override via env:
//   OPENCLAW_BIN              absolute path to the binary (default "openclaw")
//   OPENCLAW_DEFAULT_ARGS     extra args appended before -m
//   OPENCLAW_TIMEOUT_MS       hard kill after this many ms (default 120_000)

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import type { AGUIEvent } from "../ag-ui";
import type { StreamChatOptions } from "../router";

export async function* streamOpenclaw(
  opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  const messageId = randomUUID();
  // Use the LAST user message as the new turn — earlier turns are
  // remembered by OpenClaw via --session-id. When the session is
  // brand-new we also flatten the conversation into the prompt so the
  // first call has context too.
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const prompt = lastUser?.content ?? "";
  if (!prompt) {
    yield {
      type: "error",
      code: "empty_prompt",
      message: "Geen user-message gevonden voor OpenClaw.",
    };
    return;
  }

  yield { type: "message_start", message_id: messageId, role: "assistant" };

  const binary = process.env.OPENCLAW_BIN || "openclaw";
  const extra = (process.env.OPENCLAW_DEFAULT_ARGS ?? "")
    .split(/\s+/)
    .filter(Boolean);
  // Stable session id per chat thread → OpenClaw remembers earlier
  // turns in the same conversation. Falls back to per-run id when no
  // thread is attached (e.g. cron / webhook runs).
  const sessionId = opts.sessionId
    ? `aio-thread-${opts.sessionId.slice(0, 12)}`
    : `aio-run-${(opts.runId ?? randomUUID()).slice(0, 8)}`;
  const args = [
    "agent",
    "--local",
    "--json",
    ...extra,
    "--session-id",
    sessionId,
    "-m",
    prompt,
  ];

  const child = spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end();

  const earlyErr = await new Promise<Error | null>((resolve) => {
    child.once("error", (err) => resolve(err));
    setTimeout(() => resolve(null), 50);
  });
  if (earlyErr) {
    yield {
      type: "error",
      code: "openclaw_missing",
      message:
        `OpenClaw CLI niet gevonden (${earlyErr.message}). ` +
        `Zet OPENCLAW_BIN in env naar het absolute pad of voeg openclaw aan PATH toe.`,
    };
    return;
  }

  const timeoutMs = Number(process.env.OPENCLAW_TIMEOUT_MS ?? 120_000);
  const timeout = setTimeout(() => {
    child.kill("SIGKILL");
  }, timeoutMs);

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exitCode: number = await new Promise((resolve) => {
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve(typeof code === "number" ? code : 1);
    });
  });

  if (exitCode !== 0) {
    yield {
      type: "error",
      code: `openclaw_exit_${exitCode}`,
      message:
        (stderr.split("\n").slice(-5).join("\n").trim() ||
          stdout.slice(-500)) ||
        `OpenClaw exited with ${exitCode}`,
    };
    return;
  }

  const text = extractReply(stdout);
  if (text) yield { type: "token", message_id: messageId, delta: text };

  yield {
    type: "message_end",
    message_id: messageId,
    usage: { input_tokens: 0, output_tokens: 0, cost_cents: 0 },
  };
}

// Try the most common JSON envelopes OpenClaw might emit. Falls back
// to the raw stdout when nothing parses.
function extractReply(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) return "";
  // Single JSON envelope (most common with --json).
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    return pickText(obj) ?? trimmed;
  } catch {
    /* try line-by-line */
  }
  // Last JSON line (some commands prefix log lines).
  for (const line of trimmed.split("\n").reverse()) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const obj = JSON.parse(t) as Record<string, unknown>;
      const v = pickText(obj);
      if (v) return v;
    } catch {
      /* skip */
    }
  }
  return trimmed;
}

function pickText(obj: Record<string, unknown>): string | null {
  for (const key of ["content", "reply", "message", "text", "output"]) {
    const v = obj[key];
    if (typeof v === "string" && v) return v;
  }
  // Sometimes it's nested: { result: { content: "..." } }
  for (const key of ["result", "data", "response"]) {
    const v = obj[key];
    if (v && typeof v === "object") {
      const inner = pickText(v as Record<string, unknown>);
      if (inner) return inner;
    }
  }
  return null;
}
