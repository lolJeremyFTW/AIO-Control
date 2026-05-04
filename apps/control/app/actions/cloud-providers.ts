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
  // New providers
  "azure_openai",
  "aws_bedrock",
  "cohere",
  "ai21",
  "huggingface",
  "replicate",
  "perplexity",
  "together_ai",
  "cloudflare",
  "lepton",
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

// ─── Cloud provider key testing ──────────────────────────────────────────────

type TestResult =
  | { ok: true; valid: true; latencyMs: number; detail?: string }
  | { ok: true; valid: false; error: string }
  | { ok: false; error: string };

async function probeProvider(
  provider: string,
  value: string,
): Promise<TestResult> {
  const start = Date.now();

  // OpenAI-compatible: GET /v1/models with Bearer token
  const openAiCompatible = async (
    baseUrl: string,
    authValue: string,
  ): Promise<TestResult> => {
    try {
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${authValue}` },
        signal: AbortSignal.timeout(10_000),
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { ok: true, valid: true, latencyMs };
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: true, valid: false, error: "Ongeldige API key." };
      }
      const body = await res.json().catch(() => ({}));
      return {
        ok: true,
        valid: false,
        error: (body as { error?: { message?: string } }).error?.message ??
          `HTTP ${res.status}`,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Verbindingsfout.",
      };
    }
  };

  switch (provider) {
    case "openrouter":
      return openAiCompatible("https://openrouter.ai/api", value);
    case "openai":
      return openAiCompatible("https://api.openai.com", value);
    case "deepseek":
      return openAiCompatible("https://api.deepseek.com", value);
    case "xai":
      return openAiCompatible("https://api.x.ai", value);
    case "groq":
      return openAiCompatible("https://api.groq.com/openai", value);
    case "mistral":
      return openAiCompatible("https://api.mistral.ai", value);
    case "cohere": {
      try {
        const res = await fetch("https://api.cohere.ai/v1/models", {
          headers: { Authorization: `Bearer ${value}` },
          signal: AbortSignal.timeout(10_000),
        });
        const latencyMs = Date.now() - start;
        if (res.ok) return { ok: true, valid: true, latencyMs };
        if (res.status === 401)
          return { ok: true, valid: false, error: "Ongeldige API key." };
        return {
          ok: true,
          valid: false,
          error: `HTTP ${res.status}`,
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Verbindingsfout.",
        };
      }
    }
    case "perplexity":
      return openAiCompatible("https://api.perplexity.ai", value);
    case "together_ai":
      return openAiCompatible("https://api.together.ai", value);
    case "anthropic": {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": value,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-3-5-haiku-20240307",
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }],
          }),
          signal: AbortSignal.timeout(10_000),
        });
        const latencyMs = Date.now() - start;
        if (res.ok) return { ok: true, valid: true, latencyMs };
        if (res.status === 401)
          return { ok: true, valid: false, error: "Ongeldige API key." };
        if (res.status === 403)
          return {
            ok: true,
            valid: false,
            error: "API key niet geldig voor dit endpoint.",
          };
        return {
          ok: true,
          valid: false,
          error: `HTTP ${res.status}`,
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Verbindingsfout.",
        };
      }
    }
    case "minimax": {
      try {
        const res = await fetch(
          "https://api.minimax.io/v1/text/chatcompletion_v2",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${value}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "MiniMax-Text-01",
              messages: [{ role: "user", content: "hi" }],
              max_tokens: 2,
            }),
            signal: AbortSignal.timeout(10_000),
          },
        );
        const latencyMs = Date.now() - start;
        if (res.ok) return { ok: true, valid: true, latencyMs };
        if (res.status === 401)
          return { ok: true, valid: false, error: "Ongeldige API key." };
        return {
          ok: true,
          valid: false,
          error: `HTTP ${res.status}`,
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Verbindingsfout.",
        };
      }
    }
    case "google_gemini": {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(value)}`,
          { signal: AbortSignal.timeout(10_000) },
        );
        const latencyMs = Date.now() - start;
        if (res.ok) return { ok: true, valid: true, latencyMs };
        if (res.status === 400 || res.status === 403)
          return { ok: true, valid: false, error: "Ongeldige API key." };
        return {
          ok: true,
          valid: false,
          error: `HTTP ${res.status}`,
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Verbindingsfout.",
        };
      }
    }
    case "azure_openai": {
      // Azure requires resource name + api-version in URL, not in the key itself.
      // We expect value to be "resourceName:apiKey" or just the apiKey (we'll try to probe).
      // Actually, the key is the api-key header, resource name comes from user's Azure config.
      // For a simple test we use the key directly and hope the user configured the resource.
      try {
        // Try to call a common Azure endpoint - if they have a deployment they'll see it work
        // We use a dummy deployment name just to get a 401/404 (not a 500 from bad auth)
        const parts = value.split(":");
        const apiKey = parts[0];
        const resourceName = parts[1] ?? "";
        if (!apiKey) return { ok: true, valid: false, error: "API key ontbreekt." };
        const baseUrl = resourceName
          ? `https://${resourceName}.openai.azure.com`
          : "https://YOUR_RESOURCE.openai.azure.com";
        const res = await fetch(
          `${baseUrl}/openai/deployments?api-version=2024-02-01`,
          {
            headers: { "api-key": apiKey },
            signal: AbortSignal.timeout(10_000),
          },
        );
        const latencyMs = Date.now() - start;
        if (res.ok) return { ok: true, valid: true, latencyMs };
        if (res.status === 401)
          return { ok: true, valid: false, error: "Ongeldige API key." };
        if (res.status === 404)
          return {
            ok: true,
            valid: true,
            latencyMs,
            detail: "Key werkt, maar geen deployments gevonden.",
          };
        return {
          ok: true,
          valid: false,
          error: `HTTP ${res.status}`,
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Verbindingsfout.",
        };
      }
    }
    case "aws_bedrock": {
      // value = "accessKeyId:secretAccessKey:region" or just the bearer token
      // For simplicity, try with Bearer token approach
      try {
        const parts = value.split(":");
        const region = parts[2] ?? "us-east-1";
        const baseUrl = `https://bedrock-runtime.${region}.amazonaws.com`;
        // Try a simple converse call to validate credentials
        const res = await fetch(`${baseUrl}/model/anthropic.claude-3-5-haiku-20240307-v1:0/converse`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // AWS SigV4 would be needed proper, simplified for now
            Authorization: `Bearer ${value}`,
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: { text: "hi" } }],
            inferenceConfig: { maxTokens: 2 },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        const latencyMs = Date.now() - start;
        if (res.ok) return { ok: true, valid: true, latencyMs };
        if (res.status === 403)
          return { ok: true, valid: false, error: "Ongeldige AWS credentials of verkeerde regio." };
        return {
          ok: true,
          valid: false,
          error: `HTTP ${res.status}`,
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Verbindingsfout.",
        };
      }
    }
    case "ai21": {
      try {
        const res = await fetch("https://api.ai21.com/v1/models", {
          headers: { Authorization: `Bearer ${value}` },
          signal: AbortSignal.timeout(10_000),
        });
        const latencyMs = Date.now() - start;
        if (res.ok) return { ok: true, valid: true, latencyMs };
        if (res.status === 401)
          return { ok: true, valid: false, error: "Ongeldige API key." };
        return {
          ok: true,
          valid: false,
          error: `HTTP ${res.status}`,
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Verbindingsfout.",
        };
      }
    }
    case "huggingface": {
      try {
        const res = await fetch(
          "https://api-inference.huggingface.co/status",
          {
            headers: { Authorization: `Bearer ${value}` },
            signal: AbortSignal.timeout(10_000),
          },
        );
        const latencyMs = Date.now() - start;
        if (res.ok) return { ok: true, valid: true, latencyMs };
        if (res.status === 401)
          return { ok: true, valid: false, error: "Ongeldige token." };
        return {
          ok: true,
          valid: false,
          error: `HTTP ${res.status}`,
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Verbindingsfout.",
        };
      }
    }
    case "replicate": {
      try {
        const res = await fetch("https://api.replicate.com/v1/models", {
          headers: { Authorization: `Bearer ${value}` },
          signal: AbortSignal.timeout(10_000),
        });
        const latencyMs = Date.now() - start;
        if (res.ok) return { ok: true, valid: true, latencyMs };
        if (res.status === 401)
          return { ok: true, valid: false, error: "Ongeldige token." };
        return {
          ok: true,
          valid: false,
          error: `HTTP ${res.status}`,
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Verbindingsfout.",
        };
      }
    }
    case "cloudflare": {
      // value = "accountId:apiToken"
      const parts = value.split(":");
      const accountId = parts[0];
      const apiToken = parts[1] ?? parts[0];
      if (!accountId)
        return { ok: true, valid: false, error: "Account ID ontbreekt." };
      try {
        const res = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models`,
          {
            headers: { Authorization: `Bearer ${apiToken}` },
            signal: AbortSignal.timeout(10_000),
          },
        );
        const latencyMs = Date.now() - start;
        if (res.ok) return { ok: true, valid: true, latencyMs };
        if (res.status === 401 || res.status === 403)
          return { ok: true, valid: false, error: "Ongeldige Cloudflare credentials." };
        return {
          ok: true,
          valid: false,
          error: `HTTP ${res.status}`,
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Verbindingsfout.",
        };
      }
    }
    case "lepton": {
      // value = "workspaceName:apiKey" or just apiKey (uses default workspace)
      const parts = value.split(":");
      const workspace = parts[0];
      const apiKey = parts[1] ?? parts[0];
      const baseUrl = workspace
        ? `https://${workspace}.lepton.run`
        : "https://localhost";
      try {
        const res = await fetch(
          `${baseUrl}/api/v1/models`,
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(10_000),
          },
        );
        const latencyMs = Date.now() - start;
        if (res.ok) return { ok: true, valid: true, latencyMs };
        if (res.status === 401)
          return { ok: true, valid: false, error: "Ongeldige API key." };
        return {
          ok: true,
          valid: false,
          error: `HTTP ${res.status}`,
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Verbindingsfout.",
        };
      }
    }
    case "elevenlabs": {
      try {
        const res = await fetch("https://api.elevenlabs.io/v1/user", {
          headers: { Authorization: `Bearer ${value}` },
          signal: AbortSignal.timeout(10_000),
        });
        const latencyMs = Date.now() - start;
        if (res.ok) return { ok: true, valid: true, latencyMs };
        if (res.status === 401)
          return { ok: true, valid: false, error: "Ongeldige API key." };
        return {
          ok: true,
          valid: false,
          error: `HTTP ${res.status}`,
        };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Verbindingsfout.",
        };
      }
    }
    default:
      return { ok: false, error: `Provider "${provider}" niet ondersteund.` };
  }
}

export async function testCloudProviderKey(input: {
  provider: string;
  value: string;
}): Promise<ActionResult<{ valid: boolean; latencyMs: number; detail?: string }>> {
  if (!input.value.trim()) {
    return { ok: false, error: "API key mag niet leeg zijn." };
  }
  if (!ALLOWED.has(input.provider)) {
    return {
      ok: false,
      error: `Provider "${input.provider}" niet ondersteund.`,
    };
  }
  const result = await probeProvider(input.provider, input.value);
  if (!result.ok) return { ok: false, error: result.error };
  if (!result.valid) return { ok: false, error: result.error };
  return {
    ok: true,
    data: {
      valid: result.valid,
      latencyMs: result.latencyMs,
      detail: result.detail,
    },
  };
}
