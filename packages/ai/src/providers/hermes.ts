// Hermes-agent provider — same subprocess pattern as OpenClaw. The
// hermes CLI is a Python entrypoint. Most users have it at
// `/root/.hermes/hermes-agent/hermes` or `~/.hermes/hermes-agent/hermes`.
// Set HERMES_BIN in env to the absolute path.
//
// Default invocation:
//   hermes chat --json --message "<prompt>"
//
// Override via env:
//   HERMES_BIN              absolute path (default "hermes")
//   HERMES_DEFAULT_ARGS     extra args appended before --message
//   HERMES_TIMEOUT_MS       hard kill after this many ms (default 120_000)

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import type { AGUIEvent } from "../ag-ui";
import type { StreamChatOptions } from "../router";

export async function* streamHermes(
  opts: StreamChatOptions,
): AsyncIterable<AGUIEvent> {
  const messageId = randomUUID();
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const prompt = lastUser?.content ?? "";
  if (!prompt) {
    yield {
      type: "error",
      code: "empty_prompt",
      message: "Geen user-message gevonden voor Hermes.",
    };
    return;
  }

  yield { type: "message_start", message_id: messageId, role: "assistant" };

  // Persistent profile name — when the workspace has run the
  // onboarding flow (`hermes profile create aio-<slug>` + `<name>
  // setup`), Hermes installs a wrapper script `<name>` in PATH that
  // scopes HERMES_HOME to ~/.hermes/profiles/<name>/, so each call
  // hits its own state.db / SOUL.md / memories. Falling through to
  // bare `hermes chat` when no name is set keeps existing workspaces
  // running on the shared default profile.
  const profileName = opts.tenant?.hermesAgentName?.trim() || null;
  const binary = profileName ?? process.env.HERMES_BIN ?? "hermes";

  const extra = (process.env.HERMES_DEFAULT_ARGS ?? "")
    .split(/\s+/)
    .filter(Boolean);
  // Stable session id per chat thread so Hermes can keep context
  // across turns. Hermes uses --session for this in newer versions;
  // older versions ignore it. Override via HERMES_DEFAULT_ARGS.
  const sessionId = opts.sessionId
    ? `aio-thread-${opts.sessionId.slice(0, 12)}`
    : `aio-run-${(opts.runId ?? "single").slice(0, 8)}`;
  // The Hermes CLI currently exposes `chat` for one-shot prompts. If
  // the user is on a different version they can override the args via
  // HERMES_DEFAULT_ARGS.
  const args =
    extra.length > 0
      ? extra
      : ["chat", "--json", "--session", sessionId, "--message", prompt];
  if (extra.length > 0 && !extra.includes("--message")) {
    args.push("--message", prompt);
  }

  const child = spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end();

  const earlyErr = await new Promise<Error | null>((resolve) => {
    child.once("error", (err) => resolve(err));
    setTimeout(() => resolve(null), 50);
  });
  if (earlyErr) {
    yield {
      type: "error",
      code: "hermes_missing",
      message: profileName
        ? `Hermes profile "${profileName}" niet gevonden (${earlyErr.message}). ` +
          `Heb je 'hermes profile create ${profileName} && ${profileName} setup' ` +
          `op deze host uitgevoerd? Verifieer in Settings → Providers.`
        : `Hermes CLI niet gevonden (${earlyErr.message}). ` +
          `Zet HERMES_BIN in env naar het absolute pad ` +
          `(bv. /root/.hermes/hermes-agent/hermes — let op user permissies).`,
    };
    return;
  }

  const timeoutMs = Number(process.env.HERMES_TIMEOUT_MS ?? 120_000);
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
      code: `hermes_exit_${exitCode}`,
      message:
        stderr.split("\n").slice(-5).join("\n").trim() ||
        stdout.slice(-500) ||
        `Hermes exited with ${exitCode}`,
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

function extractReply(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) return "";
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    return pickText(obj) ?? trimmed;
  } catch {
    /* fall through */
  }
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
  for (const key of ["content", "reply", "message", "text", "output", "answer"]) {
    const v = obj[key];
    if (typeof v === "string" && v) return v;
  }
  for (const key of ["result", "data", "response"]) {
    const v = obj[key];
    if (v && typeof v === "object") {
      const inner = pickText(v as Record<string, unknown>);
      if (inner) return inner;
    }
  }
  return null;
}
