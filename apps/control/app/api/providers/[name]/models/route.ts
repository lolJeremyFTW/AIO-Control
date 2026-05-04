// List the models a CLI-based provider (openclaw, hermes) currently
// has configured on this host. Used by the agent edit dialog so the
// user can pick from a dropdown of "this is actually wired up" models
// instead of typing a string that may not exist.
//
// We read the local config files the CLIs themselves use AND, for
// openclaw, intersect with the auth-profiles.json so we only show
// models for providers the user is actually authenticated against.
// Without that filter the dropdown lists e.g. `codex/gpt-5.4` (a
// provider the user isn't auth'd on) instead of
// `openai-codex/gpt-5.5` (their real ChatGPT-OAuth profile).
//
//   - openclaw: ~/.openclaw/agents/<agent>/agent/models.json
//                ∩ auth-profiles.json providers
//                ∪ openclaw capability model list (for providers in
//                  auth-profiles.json that aren't in models.json,
//                  e.g. openai-codex which has 0 entries in models.json
//                  but ~10 valid models in the catalog).
//   - hermes:   ~/.hermes/models_dev_cache.json filtered by env vars
//
// Returns:  { models: [{ id, label, group }] }

import { spawn } from "node:child_process";
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

  // Step 1: figure out which providers actually have credentials in
  // this agent. Without this we end up listing models for providers
  // the user isn't auth'd against (the original bug — `codex/gpt-5.4`
  // showed up but `openai-codex/gpt-5.5` didn't).
  const authedProviders = await readAuthedProviders(agentName, home);

  // Step 2: read the local models.json catalog (the per-agent
  // canonical list of model ids OpenClaw knows). Intersect with the
  // authed-provider set when we have one.
  const fromJson = await readModelsJson(agentName, home);

  // Step 3: ask the openclaw CLI for the FULL catalog (909 entries
  // at the time of writing). This catches providers that are
  // authed but have an empty `models` block in models.json (e.g.
  // openai-codex when only the OAuth profile is registered). We
  // dedupe by id when merging.
  const fromCli = authedProviders.size > 0 ? await readCatalog() : [];

  const seen = new Set<string>();
  const out: Model[] = [];
  const consider = (m: Model, provider: string) => {
    if (authedProviders.size > 0 && !authedProviders.has(provider)) return;
    if (seen.has(m.id)) return;
    seen.add(m.id);
    out.push(m);
  };
  for (const m of fromJson) consider(m, m.group);
  for (const m of fromCli) consider(m, m.group);

  // No authed-provider data → fall back to the full local catalog so
  // the dropdown isn't empty for users who haven't set up auth yet.
  if (out.length === 0 && authedProviders.size === 0) return fromJson;

  // Sort by provider then label for readable optgroups.
  out.sort((a, b) => {
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    return a.label.localeCompare(b.label);
  });
  return out;
}

async function readAuthedProviders(
  agentName: string,
  home: string,
): Promise<Set<string>> {
  const result = new Set<string>();
  const candidates = [
    join(home, ".openclaw", "agents", agentName, "agent", "auth-profiles.json"),
    join(home, ".openclaw", "agents", "main", "agent", "auth-profiles.json"),
  ];
  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      const raw = await readFile(path, "utf8");
      const json = JSON.parse(raw) as {
        profiles?: Record<string, { provider?: string }>;
      };
      for (const profile of Object.values(json.profiles ?? {})) {
        if (profile?.provider) result.add(profile.provider);
      }
      if (result.size > 0) return result;
    } catch {
      // ignore
    }
  }
  return result;
}

async function readModelsJson(
  agentName: string,
  home: string,
): Promise<Model[]> {
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
      // try next
    }
  }
  return [];
}

async function readCatalog(): Promise<Model[]> {
  // `openclaw capability model list` outputs JSON-per-line with the
  // canonical 909-entry catalog. We spawn it with a 6s timeout so a
  // hung CLI doesn't block the dropdown render.
  return new Promise((resolve) => {
    let stdout = "";
    const child = spawn(
      process.env.OPENCLAW_BIN ?? "openclaw",
      ["capability", "model", "list"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve([]);
    }, 6_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.once("error", () => {
      clearTimeout(timeout);
      resolve([]);
    });
    child.once("close", () => {
      clearTimeout(timeout);
      const out: Model[] = [];
      for (const line of stdout.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("{")) continue;
        try {
          const obj = JSON.parse(t) as {
            id?: string;
            name?: string;
            provider?: string;
          };
          if (!obj.id || !obj.provider) continue;
          out.push({
            id: `${obj.provider}/${obj.id}`,
            label: obj.name ?? obj.id,
            group: obj.provider,
          });
        } catch {
          // skip bad line
        }
      }
      resolve(out);
    });
  });
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
