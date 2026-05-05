"use server";

import { revalidatePath } from "next/cache";

import { setApiKey } from "./api-keys";

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const MCP_TOOL_CONFIGS: Record<
  string,
  { envVar: string; testUrl: string; authHeader: string }
> = {
  brave: {
    envVar: "BRAVE_API_KEY",
    testUrl: "https://api.search.brave.com/res/v1/web/search?q=test&count=1",
    authHeader: "X-Subscription-Token",
  },
  firecrawl: {
    envVar: "FIRECRAWL_API_KEY",
    testUrl: "https://api.firecrawl.dev/v1/scrape",
    authHeader: "Authorization",
  },
};

export async function saveMcpToolKey(input: {
  workspace_slug: string;
  workspace_id: string;
  tool: string;
  value: string;
}): Promise<ActionResult<{ id: string }>> {
  if (!input.value.trim()) {
    return { ok: false, error: "API key mag niet leeg zijn." };
  }
  if (!MCP_TOOL_CONFIGS[input.tool]) {
    return { ok: false, error: `Onbekende MCP tool: "${input.tool}".` };
  }

  const res = await setApiKey({
    workspace_slug: input.workspace_slug,
    workspace_id: input.workspace_id,
    scope: "workspace",
    scope_id: input.workspace_id,
    provider: input.tool,
    value: input.value,
    kind: "provider",
  });
  if (!res.ok) return res;

  revalidatePath(`/${input.workspace_slug}/settings/mcp-tools`);
  return res;
}

export async function testMcpToolKey(input: {
  tool: string;
  value: string;
}): Promise<ActionResult<{ latencyMs: number; detail?: string }>> {
  const cfg = MCP_TOOL_CONFIGS[input.tool];
  if (!cfg) {
    return { ok: false, error: `Onbekende MCP tool: "${input.tool}".` };
  }
  if (!input.value.trim()) {
    return { ok: false, error: "API key is leeg." };
  }

  const start = Date.now();
  try {
    const headers: Record<string, string> = {
      [cfg.authHeader]:
        input.tool === "firecrawl"
          ? `Bearer ${input.value}`
          : input.value,
    };

    let res: Response;
    if (input.tool === "firecrawl") {
      // POST with a minimal scrape body — we just want a 2xx or auth error.
      res = await fetch(cfg.testUrl, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com", formats: ["markdown"] }),
        signal: AbortSignal.timeout(8000),
      });
    } else {
      res = await fetch(cfg.testUrl, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
    }

    const latencyMs = Date.now() - start;

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "API key ongeldig of verlopen." };
    }
    if (res.status === 429) {
      // Rate-limited but key is valid.
      return { ok: true, data: { latencyMs, detail: "Rate-limited — key is geldig." } };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: `Onverwachte status ${res.status} van ${input.tool} API.`,
      };
    }

    return { ok: true, data: { latencyMs } };
  } catch (err) {
    const latencyMs = Date.now() - start;
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, error: `${input.tool} API antwoordt niet binnen 8s.` };
    }
    return {
      ok: false,
      error: `Verbindingsfout: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
