"use server";

import { revalidatePath } from "next/cache";

import { setApiKey } from "./api-keys";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import {
  recordProviderConnectionLog,
  type ProviderConnectionLog,
} from "../../lib/provider-connection-logs";

type ActionResult<T> =
  | { ok: true; data: T; log?: ProviderConnectionLog | null }
  | { ok: false; error: string; log?: ProviderConnectionLog | null };

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
  const auth = await requireEditor(input.workspace_id);
  if (!auth.ok) return auth;

  if (!input.value.trim()) {
    const error = "API key mag niet leeg zijn.";
    const log = await logMcpToolEvent(input.tool, {
      workspaceId: input.workspace_id,
      actorId: auth.data.userId,
      eventType: "save",
      status: "error",
      message: error,
    });
    return { ok: false, error, log };
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
  if (!res.ok) {
    const log = await logMcpToolEvent(input.tool, {
      workspaceId: input.workspace_id,
      actorId: auth.data.userId,
      eventType: "save",
      status: "error",
      message: res.error,
    });
    return { ...res, log };
  }

  const log = await logMcpToolEvent(input.tool, {
    workspaceId: input.workspace_id,
    actorId: auth.data.userId,
    eventType: "save",
    status: "success",
    message:
      input.tool === "firecrawl"
        ? "Firecrawl API key opgeslagen voor jouw account."
        : `${input.tool} API key opgeslagen.`,
  });

  revalidatePath(`/${input.workspace_slug}/settings/mcp-tools`);
  return { ...res, log };
}

export async function testMcpToolKey(input: {
  workspace_slug: string;
  workspace_id: string;
  tool: string;
  value: string;
}): Promise<ActionResult<{ latencyMs: number; detail?: string }>> {
  const auth = await requireEditor(input.workspace_id);
  if (!auth.ok) return auth;

  const cfg = MCP_TOOL_CONFIGS[input.tool];
  if (!cfg) {
    return { ok: false, error: `Onbekende MCP tool: "${input.tool}".` };
  }
  if (!input.value.trim()) {
    const error = "API key is leeg.";
    const log = await logMcpToolEvent(input.tool, {
      workspaceId: input.workspace_id,
      actorId: auth.data.userId,
      eventType: "test",
      status: "error",
      message: error,
    });
    return { ok: false, error, log };
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
      res = await fetch(cfg.testUrl, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com",
          formats: ["markdown"],
        }),
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
      const error = "API key ongeldig of verlopen.";
      const log = await logMcpToolEvent(input.tool, {
        workspaceId: input.workspace_id,
        actorId: auth.data.userId,
        eventType: "test",
        status: "error",
        latencyMs,
        message: error,
        metadata: testMetadata(input.tool, cfg.testUrl, res.status),
      });
      return { ok: false, error, log };
    }
    if (res.status === 429) {
      const detail = "Rate-limited - key is geldig.";
      const log = await logMcpToolEvent(input.tool, {
        workspaceId: input.workspace_id,
        actorId: auth.data.userId,
        eventType: "test",
        status: "success",
        latencyMs,
        message:
          input.tool === "firecrawl"
            ? "Firecrawl key is geldig, maar de API zit op de rate-limiet."
            : detail,
        metadata: testMetadata(input.tool, cfg.testUrl, res.status),
      });
      return { ok: true, data: { latencyMs, detail }, log };
    }
    if (!res.ok) {
      const error = `Onverwachte status ${res.status} van ${input.tool} API.`;
      const log = await logMcpToolEvent(input.tool, {
        workspaceId: input.workspace_id,
        actorId: auth.data.userId,
        eventType: "test",
        status: "error",
        latencyMs,
        message: error,
        metadata: testMetadata(input.tool, cfg.testUrl, res.status),
      });
      return { ok: false, error, log };
    }

    const log = await logMcpToolEvent(input.tool, {
      workspaceId: input.workspace_id,
      actorId: auth.data.userId,
      eventType: "test",
      status: "success",
      latencyMs,
      message:
        input.tool === "firecrawl"
          ? `Firecrawl scrape-test gelukt in ${latencyMs}ms.`
          : `${input.tool} test gelukt in ${latencyMs}ms.`,
      metadata: testMetadata(input.tool, cfg.testUrl, res.status),
    });
    return { ok: true, data: { latencyMs }, log };
  } catch (err) {
    const latencyMs = Date.now() - start;
    if (err instanceof Error && err.name === "TimeoutError") {
      const error = `${input.tool} API antwoordt niet binnen 8s.`;
      const log = await logMcpToolEvent(input.tool, {
        workspaceId: input.workspace_id,
        actorId: auth.data.userId,
        eventType: "test",
        status: "error",
        latencyMs,
        message: error,
        metadata: testMetadata(input.tool, cfg.testUrl),
      });
      return { ok: false, error, log };
    }

    const error = `Verbindingsfout: ${
      err instanceof Error ? err.message : String(err)
    }`;
    const log = await logMcpToolEvent(input.tool, {
      workspaceId: input.workspace_id,
      actorId: auth.data.userId,
      eventType: "test",
      status: "error",
      latencyMs,
      message: error,
      metadata: testMetadata(input.tool, cfg.testUrl),
    });
    return { ok: false, error, log };
  }
}

type AuthResult =
  | { ok: true; data: { userId: string } }
  | { ok: false; error: string };

async function requireEditor(workspaceId: string): Promise<AuthResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Niet ingelogd." };

  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin", "editor"])
    .maybeSingle();
  if (!member) {
    return {
      ok: false,
      error: "Alleen workspace owners/admins/editors.",
    };
  }
  return { ok: true, data: { userId: user.id } };
}

async function logMcpToolEvent(
  tool: string,
  input: {
    workspaceId: string;
    actorId: string;
    eventType: "test" | "save";
    status: "success" | "error";
    latencyMs?: number;
    message: string;
    metadata?: Record<string, unknown>;
  },
): Promise<ProviderConnectionLog | null> {
  if (tool !== "firecrawl") return null;
  return recordProviderConnectionLog({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    provider: "firecrawl",
    eventType: input.eventType,
    status: input.status,
    latencyMs: input.latencyMs,
    message: input.message,
    metadata: {
      tool,
      ...(input.metadata ?? {}),
    },
  });
}

function testMetadata(tool: string, apiUrl: string, statusCode?: number) {
  return {
    api_url: apiUrl,
    status_code: statusCode ?? null,
    test_url: tool === "firecrawl" ? "https://example.com" : null,
  };
}
