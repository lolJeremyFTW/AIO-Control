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
import { resolveCliBin } from "./cli-bin";

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

  const binary = resolveCliBin("openclaw", "OPENCLAW_BIN");
  const extra = (process.env.OPENCLAW_DEFAULT_ARGS ?? "")
    .split(/\s+/)
    .filter(Boolean);
  // Stable session id per chat thread → OpenClaw remembers earlier
  // turns in the same conversation. Falls back to per-run id when no
  // thread is attached (e.g. cron / webhook runs).
  const sessionId = opts.sessionId
    ? `aio-thread-${opts.sessionId.slice(0, 12)}`
    : `aio-run-${(opts.runId ?? randomUUID()).slice(0, 8)}`;
  // When the workspace has registered a persistent agent
  // (`openclaw agents add aio-<slug>`), invoke that named agent so
  // OpenClaw routes through its registry + per-agent session storage
  // under ~/.openclaw/agents/<id>/sessions. Otherwise fall back to
  // the ad-hoc `--local` mode.
  const agentName = opts.tenant?.openclawAgentName?.trim() || null;
  // Pass the AIO Control model picker through to OpenClaw via --model
  // when set. Without this OpenClaw falls back to its own default
  // mapping which on most installs routes "gpt-5.5" to provider
  // "openai" (and fails with "No API key found for provider 'openai'"
  // when the user only configured the "codex" / "openai-codex" key).
  // Format expected by OpenClaw: "<provider>/<model>" or bare
  // "<model>" — we trust whatever the user typed in the AIO dropdown.
  const modelArg = (opts.config.model ?? "").trim();
  const modelArgs = modelArg ? ["--model", modelArg] : [];
  // OpenClaw 2026.4+ moved the agent name from a positional arg to a
  // --agent flag — passing it positional now errors with
  // "too many arguments for 'agent'. Expected 0 arguments but got 1."
  // The flag-based form below works on both old and new versions.
  const args = agentName
    ? [
        "agent",
        "--agent",
        agentName,
        "--json",
        ...modelArgs,
        ...extra,
        "--session-id",
        sessionId,
        "-m",
        prompt,
      ]
    : [
        "agent",
        "--local",
        "--json",
        ...modelArgs,
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
    const raw =
      (stderr.split("\n").slice(-5).join("\n").trim() ||
        stdout.slice(-500)) ||
      `OpenClaw exited with ${exitCode}`;
    yield {
      type: "error",
      code: `openclaw_exit_${exitCode}`,
      message: friendlyOpenclawError(raw, modelArg),
    };
    return;
  }

  const parsed = extractReply(stdout);
  // OpenClaw 2026.4+ exits 0 even when the model failed (rate limit,
  // missing key, refused) — the failure shows up as
  // meta.completion.stopReason==="error" and the actual error message
  // is in payloads[0].text. Surface that as a proper error event so
  // the run drawer paints it red instead of pretending it's the
  // assistant's reply.
  if (parsed.isError) {
    yield {
      type: "error",
      code: "openclaw_completion_error",
      message: friendlyOpenclawError(parsed.text, modelArg),
    };
    return;
  }
  if (parsed.text) {
    yield { type: "token", message_id: messageId, delta: parsed.text };
  }

  yield {
    type: "message_end",
    message_id: messageId,
    usage: {
      input_tokens: parsed.inputTokens ?? 0,
      output_tokens: parsed.outputTokens ?? 0,
      cost_cents: 0,
    },
  };
}

type ExtractedReply = {
  text: string;
  isError: boolean;
  inputTokens?: number;
  outputTokens?: number;
};

// Try the most common JSON envelopes OpenClaw might emit. Falls back
// to the raw stdout when nothing parses.
function extractReply(stdout: string): ExtractedReply {
  const trimmed = stdout.trim();
  if (!trimmed) return { text: "", isError: false };
  // Single JSON envelope (most common with --json).
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    return readEnvelope(obj, trimmed);
  } catch {
    /* try line-by-line */
  }
  // Last JSON line (some commands prefix log lines).
  for (const line of trimmed.split("\n").reverse()) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const obj = JSON.parse(t) as Record<string, unknown>;
      const v = readEnvelope(obj, "");
      if (v.text) return v;
    } catch {
      /* skip */
    }
  }
  return { text: trimmed, isError: false };
}

function readEnvelope(
  obj: Record<string, unknown>,
  fallback: string,
): ExtractedReply {
  // Detect OpenClaw 2026.4+ shape: { payloads: [{text}], meta: {…} }
  // This is the only shape that carries an explicit error signal —
  // legacy {content,reply,…} shapes are always treated as success.
  const payloads = obj["payloads"];
  const meta = obj["meta"] as Record<string, unknown> | undefined;
  const completion = meta?.["completion"] as
    | Record<string, unknown>
    | undefined;
  const stopReason = (completion?.["stopReason"] as string | undefined) ?? "";
  const finishReason =
    (completion?.["finishReason"] as string | undefined) ?? "";
  const isError =
    stopReason === "error" ||
    finishReason === "error" ||
    meta?.["aborted"] === true;
  let text = "";
  if (Array.isArray(payloads)) {
    for (const p of payloads) {
      if (p && typeof p === "object") {
        const t = (p as Record<string, unknown>)["text"];
        if (typeof t === "string" && t) {
          text += text ? "\n" + t : t;
        }
      }
    }
  }
  if (!text) {
    text = pickText(obj) ?? fallback;
  }
  // Token usage is reported under meta.agentMeta.lastCallUsage on
  // 2026.4+. We surface input/output for the run footer so the
  // dashboard's token-spend graph doesn't sit at zero for OpenClaw
  // runs (cost stays 0 because we don't know provider pricing).
  const agentMeta = meta?.["agentMeta"] as Record<string, unknown> | undefined;
  const usage = agentMeta?.["lastCallUsage"] as
    | Record<string, unknown>
    | undefined;
  const inputTokens =
    typeof usage?.["input"] === "number" ? (usage["input"] as number) : undefined;
  const outputTokens =
    typeof usage?.["output"] === "number"
      ? (usage["output"] as number)
      : undefined;
  return { text, isError, inputTokens, outputTokens };
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

// Translate OpenClaw's verbose multi-line stderr / payload errors
// into a single actionable sentence the operator can act on. We
// match the most common failure patterns (auth profile mismatch,
// missing AWS credentials, ChatGPT Plus rate limit) and rewrite
// them; everything else falls through unchanged so we don't hide
// information.
function friendlyOpenclawError(raw: string, modelArg: string): string {
  const text = raw ?? "";
  // Pattern 1: user picked codex/<x> but auth profile is openai-codex.
  // OpenClaw's own error spells out the fix; we surface it crisply.
  if (
    /No API key found for provider "openai"/i.test(text) &&
    /authenticated with OpenAI Codex OAuth/i.test(text)
  ) {
    const suggested =
      modelArg && modelArg.startsWith("codex/")
        ? modelArg.replace(/^codex\//, "openai-codex/")
        : "openai-codex/gpt-5.5";
    return (
      `OpenClaw vond geen API-key voor provider "openai". Je bent ingelogd ` +
      `via ChatGPT (OAuth) — verander de **model**-field van deze agent naar ` +
      `\`${suggested}\` (of een ander \`openai-codex/gpt-5.x\` model) en probeer opnieuw. ` +
      `Het AIO model-veld komt 1-op-1 binnen bij OpenClaw via --model.`
    );
  }
  // Pattern 2: ChatGPT Plus quota exhausted.
  const rateMatch = text.match(/Try again in ~?(\d+) min/i);
  if (rateMatch) {
    return (
      `Je ChatGPT Plus rate-limit is uitgeput. OpenClaw zegt: probeer over ` +
      `~${rateMatch[1]} min opnieuw, of kies tijdelijk een ander model dat ` +
      `niet via ChatGPT OAuth gaat (bv. een amazon-bedrock/anthropic.* of ` +
      `openrouter/<x> model).`
    );
  }
  // Pattern 3: bedrock without AWS credentials.
  if (/Could not load credentials from any providers/i.test(text)) {
    return (
      `OpenClaw kon geen AWS-credentials laden voor amazon-bedrock. Configureer ` +
      `AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_REGION in OpenClaw's ` +
      `auth-profile, of kies een ander model.`
    );
  }
  // Pattern 4: Failed to extract accountId — codex/ provider with
  // a token that can't be parsed. Same fix as pattern 1.
  if (/Failed to extract accountId from token/i.test(text)) {
    return (
      `OpenClaw kon de auth-token niet parsen voor provider "codex". Je auth ` +
      `is onder \`openai-codex\` geregistreerd — verander de model-field van ` +
      `deze agent naar \`openai-codex/gpt-5.5\` (of een ander \`openai-codex/\`-` +
      `model) en probeer opnieuw.`
    );
  }
  // Default: cap to ~600 chars so the chat bubble stays readable.
  return text.length > 600 ? text.slice(0, 600) + "…" : text;
}
