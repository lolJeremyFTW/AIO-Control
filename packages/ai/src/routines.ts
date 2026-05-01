// Thin client for the Anthropic Routines API (cron + bearer-token webhooks
// + GitHub triggers, GA April 2026). We expose just what our scheduler
// needs — create, delete, fire — and keep the bearer token round-trip on
// the server side so it never reaches the browser.
//
// Bearer tokens are returned ONCE on creation. Persist them encrypted
// (pgcrypto.pgp_sym_encrypt) immediately; if you lose them the only
// recovery is to delete + recreate the routine.

const ROUTINE_BETA = "experimental-cc-routine-2026-04-01";
const ROUTINES_URL = "https://api.anthropic.com/v1/routines";

export type CreateRoutineInput = {
  prompt: string;
  trigger:
    | { type: "cron"; expression: string }
    | { type: "api" }
    | { type: "github"; events: string[] };
  allowedTools?: string[];
  mcpServers?: Array<{ name: string; url: string; headers?: Record<string, string> }>;
  postTo?: string; // callback URL — POST'd when the routine completes
};

export type CreateRoutineOutput = {
  id: string;
  bearer_token?: string; // shown only on create
};

export async function createRoutine(
  input: CreateRoutineInput,
): Promise<CreateRoutineOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const body = {
    prompt: input.prompt,
    trigger: input.trigger,
    allowed_tools: input.allowedTools,
    mcp_servers: input.mcpServers,
    post_to: input.postTo,
  };

  const res = await fetch(ROUTINES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-beta": ROUTINE_BETA,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Routines API error ${res.status}: ${text}`);
  }
  return (await res.json()) as CreateRoutineOutput;
}

export async function deleteRoutine(routineId: string): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const res = await fetch(`${ROUTINES_URL}/${routineId}`, {
    method: "DELETE",
    headers: {
      "x-api-key": apiKey,
      "anthropic-beta": ROUTINE_BETA,
    },
  });
  // 404 is fine — the routine is already gone.
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => "");
    throw new Error(`Routines DELETE ${res.status}: ${text}`);
  }
}

export async function fireRoutine(
  routineId: string,
  bearerToken: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${ROUTINES_URL}/${routineId}/fire`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearerToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Routines fire ${res.status}: ${text}`);
  }
}
