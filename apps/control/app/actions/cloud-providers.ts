// Thin wrapper around setApiKey for the /[ws]/settings/providers
// "Cloud providers" cards. Each card does a one-click set-and-save
// at workspace scope; this action handles the encryption + revalidate
// without forcing the page to know about scope/scope_id/master_key
// plumbing.

"use server";

import { revalidatePath } from "next/cache";

import { setApiKey } from "./api-keys";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Allow-list of provider names users can set via the cloud-providers
// grid. Mirrors CLOUD_PROVIDERS in ProvidersOnboardingPanel — we
// double-check server-side so a hand-crafted POST can't drop
// arbitrary scope rows under a workspace member's auth.
const ALLOWED = new Set<string>([
  "openrouter",
  "anthropic",
  "openai",
  "minimax",
  "google_gemini",
  "deepseek",
  "xai",
  "groq",
  "mistral",
  "elevenlabs",
]);

export async function saveCloudProviderKey(input: {
  workspace_slug: string;
  workspace_id: string;
  provider: string;
  value: string;
}): Promise<ActionResult<{ id: string }>> {
  if (!input.value.trim()) {
    return { ok: false, error: "Key mag niet leeg zijn." };
  }
  if (!ALLOWED.has(input.provider)) {
    return {
      ok: false,
      error: `Provider "${input.provider}" niet ondersteund in cloud-providers grid.`,
    };
  }
  const res = await setApiKey({
    workspace_slug: input.workspace_slug,
    workspace_id: input.workspace_id,
    scope: "workspace",
    scope_id: input.workspace_id,
    provider: input.provider,
    value: input.value,
    kind: "provider",
  });
  if (!res.ok) return res;
  // setApiKey already revalidates settings + api-keys; we also bump
  // the providers route so the green ✓ pill flips on this page after
  // navigation. Cheap and idempotent.
  revalidatePath(`/${input.workspace_slug}/settings/providers`);
  return res;
}
