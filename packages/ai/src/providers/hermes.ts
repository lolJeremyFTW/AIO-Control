// Hermes-agent provider — same subprocess pattern as OpenClaw. The
// hermes CLI is a Python entrypoint. Most users have it at
// `/root/.hermes/hermes-agent/hermes` or `~/.hermes/hermes-agent/hermes`.
// Set HERMES_BIN in env to the absolute path.
//
// Default invocation (Hermes 0.10+):
//   hermes chat -Q -q "<prompt>"
//
//   -Q  programmatic / quiet output (no banner, no spinner)
//   -q  single query, non-interactive mode (returns then exits)
//
// Older Hermes versions used `--json --message <prompt>`. Override via
// HERMES_DEFAULT_ARGS (space-separated) when you're stuck on the old CLI.
//
// Override via env:
//   HERMES_BIN              absolute path (default "hermes")
//   HERMES_DEFAULT_ARGS     full arg list (REPLACES the default arg
//                           list — when set, only these args are used,
//                           with the prompt appended after if no -q)
//   HERMES_TIMEOUT_MS       hard kill after this many ms (default 120_000)

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import type { AGUIEvent } from "../ag-ui";
import type { StreamChatOptions } from "../router";
import { resolveCliBin } from "./cli-bin";

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
  const binary = profileName ?? resolveCliBin("hermes", "HERMES_BIN");

  const extra = (process.env.HERMES_DEFAULT_ARGS ?? "")
    .split(/\s+/)
    .filter(Boolean);
  // Hermes 0.10's `chat` subcommand:
  //   -Q                quiet/programmatic output
  //   -q "<prompt>"     single query, non-interactive
  //   --resume <id>     resume an existing session by id (we don't
  //                     pre-create sessions, so we skip this — Hermes
  //                     keeps SOUL.md / state.db at the profile level
  //                     so single-shot calls still get long-term
  //                     context across turns).
  // Optional model passthrough — when the AIO Control model picker
  // has a value, forward it via -m so the Hermes provider router
  // resolves the same model the user picked. Empty value skips the
  // flag (Hermes uses its config.yaml default).
  const modelArg = (opts.config.model ?? "").trim();
  const modelFlags = modelArg ? ["-m", modelArg] : [];
  // When HERMES_DEFAULT_ARGS is set we trust the operator and use it
  // verbatim — append the prompt with -q if they didn't include one.
  let args: string[];
  if (extra.length > 0) {
    args = ["chat", ...extra];
    if (!extra.includes("-q") && !extra.includes("--query")) {
      args.push("-q", prompt);
    }
  } else {
    args = ["chat", "-Q", ...modelFlags, "-q", prompt];
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
