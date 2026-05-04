// List the models a CLI-based provider (openclaw, hermes) currently
// has configured on this host. Used by the agent edit dialog so the
// user can pick from a dropdown of "this is actually wired up" models
// instead of typing a string that may not exist.
//
// We read the local config files the CLIs themselves use:
//   - openclaw: ~/.openclaw/agents/<agent>/agent/models.json
//   - hermes:   ~/.hermes/models_dev_cache.json
//
// Returns:  { models: [{ id, label, group }] }
// Where `id` is what gets passed to the CLI as --model (e.g.
// "minimax/MiniMax-M2.7"), `label` is the display name and `group`
// is the provider for visual grouping.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type Model = { id: string; label: string; group: string };

export async function GET(
  req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  const { name } = await ctx.params;
  const url = new URL(req.url);
  const agentName = url.searchParams.get("agent") || "aio-admin";

  // Auth: any logged-in workspace member can list models. We don't
  // gate per-workspace because the file is host-wide config.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (name === "openclaw") {
    return NextResponse.json({ models: await readOpenclawModels(agentName) });
  }
  if (name === "hermes") {
    return NextResponse.json({ models: await readHermesModels() });
  }
  return NextResponse.json({ models: [] });
}

async function readOpenclawModels(agentName: string): Promise<Model[]> {
  const home = homedir();
  // Try the per-agent path first (the path the CLI itself uses), then
  // fall back to the "main" directory so workspaces that haven't set
  // an explicit openclaw_agent_name still get something useful.
  const candidates = [
    join(home, ".openclaw", "agents", agentName, "agent", "models.json"),
    join(home, ".openclaw", "agents", "main", "agent", "models.json"),
  ];
  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      const raw = await readFile(path, "utf8");
      const json = JSON.parse(raw) as {
        providers?: Record<
          string,
          { models?: Array<{ id?: string; name?: string }> }
        >;
      };
      const out: Model[] = [];
      for (const [provider, cfg] of Object.entries(json.providers ?? {})) {
        for (const m of cfg.models ?? []) {
          if (!m.id) continue;
          out.push({
            id: `${provider}/${m.id}`,
            label: m.name ?? m.id,
            group: provider,
          });
        }
      }
      return out;
    } catch {
      // try next candidate
    }
  }
  return [];
}

async function readHermesModels(): Promise<Model[]> {
  // Hermes maintains a giant models_dev_cache.json with hundreds of
  // providers/models. We filter to the ones whose API key env var is
  // actually set in this process — that maps almost exactly to "the
  // ones this server can authenticate against". Keeps the list short.
  const home = homedir();
  const candidates = [
    join(home, ".hermes", "models_dev_cache.json"),
    "/root/.hermes/models_dev_cache.json",
  ];
  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      const raw = await readFile(path, "utf8");
      const json = JSON.parse(raw) as Record<
        string,
        {
          name?: string;
          env?: string[];
          models?: Record<string, { id?: string; name?: string }>;
        }
      >;
      const out: Model[] = [];
      for (const [provider, cfg] of Object.entries(json)) {
        const envOk =
          !cfg.env ||
          cfg.env.length === 0 ||
          cfg.env.some((v) => process.env[v] && process.env[v]!.length > 0);
        if (!envOk) continue;
        for (const [, m] of Object.entries(cfg.models ?? {})) {
          if (!m.id) continue;
          out.push({
            id: `${provider}/${m.id}`,
            label: m.name ?? m.id,
            group: cfg.name ?? provider,
          });
        }
      }
      return out;
    } catch {
      // try next candidate
    }
  }
  return [];
}
