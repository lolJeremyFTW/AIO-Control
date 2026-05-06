// Diagnostic endpoint — tests McpHost.connect() from within a Next.js
// HTTP handler context. Use this to isolate whether the listTools() hang
// is process-wide (affects any Next.js code) or only in the cron scheduler
// (instrumentation.ts) context.
//
// Auth: Bearer AGENT_SECRET_KEY
// Usage: curl -s -H "Authorization: Bearer $KEY" http://localhost:3012/api/internal/mcp-test | jq
// Optional ?servers=bash,fetch,filesystem (default: bash,fetch)

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { McpHost } from "@aio/ai/mcp";

export const dynamic = "force-dynamic";

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const auth = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const expected = process.env.AGENT_SECRET_KEY ?? "";
  if (!expected || !auth || !safeEquals(auth, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Which servers to test — default to two fast local servers.
  const url = new URL(req.url);
  const serversParam = url.searchParams.get("servers");
  const servers = serversParam
    ? serversParam.split(",").map((s) => s.trim())
    : ["bash", "fetch"];

  const overallT0 = Date.now();

  // Wrap the whole connect+tools in a 40 s timeout so the HTTP request
  // doesn't hang indefinitely if something freezes.
  type TestResult =
    | { status: "ok"; totalMs: number; toolCount: number }
    | { status: "error"; ms: number; error: string };

  let connectMs = -1;
  let toolCount = -1;
  let connectError: string | null = null;

  const host = new McpHost();
  try {
    await Promise.race([
      (async () => {
        const t0 = Date.now();
        await host.connect(servers);
        connectMs = Date.now() - t0;
        toolCount = host.tools().length;
      })(),
      new Promise<never>((_, rej) =>
        setTimeout(
          () => rej(new Error(`host.connect() timed out after 40s`)),
          40_000,
        ),
      ),
    ]);
  } catch (err) {
    connectError = err instanceof Error ? err.message : String(err);
  } finally {
    await host.close().catch(() => {});
  }

  return NextResponse.json({
    totalMs: Date.now() - overallT0,
    pid: process.pid,
    context: "http-handler",
    servers,
    connectMs,
    toolCount,
    error: connectError,
  });
}
