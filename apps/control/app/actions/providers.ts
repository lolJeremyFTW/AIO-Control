// Server actions for the /settings/providers onboarding cards.
//
// Each provider gets a "Save endpoint" + "Test connection" pair. The
// existing AIO Control providers (`hermes`, `openclaw`) shell out to
// CLI binaries — so the test action spawns the binary with --version
// and reports the exit code. When an HTTP-wrapper URL is provided in
// the form we instead probe /healthz on that URL so users running a
// custom HTTP daemon get a useful test too.

"use server";

import { spawn } from "node:child_process";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "../../lib/supabase/server";
import {
  RUNTIME_AGENT_NAME_RE,
  type RuntimeAgentProvider,
} from "../../lib/providers/runtime";

type BinaryProbeResult =
  | { ok: true; firstLine: string; latencyMs: number }
  | { ok: false; error: string };

type BinaryRunResult =
  | { ok: true; stdout: string; stderr: string; latencyMs: number }
  | { ok: false; error: string };

/** Spawn `binary args…`, capture full stdout + stderr, return on exit
 *  with a 10s hard timeout. Used by the runtime-agent verify flow to
 *  inspect `hermes profile list` / `openclaw agents list` output. */
async function runBinary(
  binary: string,
  args: string[],
): Promise<BinaryRunResult> {
  const t0 = Date.now();
  return new Promise<BinaryRunResult>((resolve) => {
    let resolved = false;
    let stdout = "";
    let stderr = "";

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      resolve({
        ok: false,
        error: `Kan binary "${binary}" niet starten: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
      return;
    }

    const finish = (out: BinaryRunResult) => {
      if (resolved) return;
      resolved = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      resolve(out);
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        error: `Timeout (${binary} ${args.join(" ")} reageerde niet binnen 30s).`,
      });
    }, 30_000);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (c: string) => (stdout += c));
    child.stderr?.on("data", (c: string) => (stderr += c));
    child.once("error", (err) => {
      clearTimeout(timer);
      finish({
        ok: false,
        error:
          `Spawn van "${binary}" faalde: ${err.message}. ` +
          `Check of de binary in PATH staat of zet de absolute pad-env-var.`,
      });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      const latencyMs = Date.now() - t0;
      if (typeof code === "number" && code === 0) {
        finish({ ok: true, stdout, stderr, latencyMs });
      } else {
        finish({
          ok: false,
          error: `${binary} ${args.join(" ")} eindigde met exit ${code}. ${
            stderr.trim().slice(0, 300) || stdout.trim().slice(0, 300) || ""
          }`.trim(),
        });
      }
    });
  });
}

/** Spawn a binary with --version, capture the exit code + the first
 *  line of stdout/stderr. 5s hard timeout — anything slower means the
 *  binary hangs waiting for input or doesn't exist on PATH at all. */
async function probeBinary(binary: string): Promise<BinaryProbeResult> {
  const t0 = Date.now();
  return new Promise<BinaryProbeResult>((resolve) => {
    let resolved = false;
    let stdout = "";
    let stderr = "";

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(binary, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      resolve({
        ok: false,
        error: `Kan binary "${binary}" niet starten: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
      return;
    }

    const finish = (out: BinaryProbeResult) => {
      if (resolved) return;
      resolved = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore — process may already be exited
      }
      resolve(out);
    };

    const timer = setTimeout(() => {
      finish({
        ok: false,
        error: `Timeout (${binary} --version reageerde niet binnen 5s).`,
      });
    }, 5000);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (err) => {
      clearTimeout(timer);
      finish({
        ok: false,
        error:
          `Spawn van "${binary}" faalde: ${err.message}. ` +
          `Check of de binary in PATH staat of zet de absolute pad-env-var.`,
      });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      const latencyMs = Date.now() - t0;
      const firstOut = (stdout || stderr).split("\n")[0]?.trim() ?? "";
      if (typeof code === "number" && code === 0) {
        finish({ ok: true, firstLine: firstOut || "(no output)", latencyMs });
      } else {
        finish({
          ok: false,
          error: `${binary} --version eindigde met exit code ${code}. ${
            stderr.trim().slice(0, 200) || stdout.trim().slice(0, 200) || ""
          }`.trim(),
        });
      }
    });
  });
}

/** Probe a HTTP /healthz endpoint with a 5s timeout. Returns the
 *  full URL it actually hit + the round-trip latency on success.
 *  Distinguishes timeout from other network failures so the user
 *  message reads "timeout na 5s" instead of the raw "operation was
 *  aborted" AbortError text. */
async function probeHealthz(
  base: string,
): Promise<
  | { ok: true; url: string; latencyMs: number }
  | { ok: false; error: string }
> {
  const url = base.replace(/\/+$/, "");
  const probe = `${url}/healthz`;
  const t0 = Date.now();
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, 5000);
  try {
    const r = await fetch(probe, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok)
      return {
        ok: false,
        error: `${probe} antwoordde met ${r.status} ${r.statusText}.`,
      };
    return { ok: true, url, latencyMs: Date.now() - t0 };
  } catch (err) {
    clearTimeout(timer);
    if (timedOut) {
      return {
        ok: false,
        error: `Geen verbinding met ${probe}: timeout na 5s.`,
      };
    }
    return {
      ok: false,
      error: `Geen verbinding met ${probe}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireAdmin(
  workspaceId: string,
): Promise<Result<{ userId: string }>> {
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
    .in("role", ["owner", "admin"])
    .maybeSingle();
  if (!member)
    return { ok: false, error: "Alleen workspace owners/admins." };
  return { ok: true, data: { userId: user.id } };
}

/** Save the Hermes endpoint (clears it when value is empty/null). */
export async function saveHermesEndpoint(input: {
  workspace_id: string;
  workspace_slug: string;
  endpoint: string | null;
}): Promise<Result<null>> {
  const auth = await requireAdmin(input.workspace_id);
  if (!auth.ok) return auth;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("workspaces")
    .update({ hermes_endpoint: input.endpoint?.trim() || null })
    .eq("id", input.workspace_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}/settings/providers`);
  return { ok: true, data: null };
}

/** Test Hermes — when the user supplied an HTTP URL we probe /healthz;
 *  otherwise we spawn the `hermes` binary (HERMES_BIN env override) with
 *  --version. Either path stamps `hermes_last_test_at` on success so the
 *  panel can show a green check across reloads. */
export async function testHermesEndpoint(input: {
  workspace_id: string;
  workspace_slug: string;
  endpoint?: string | null;
}): Promise<Result<{ mode: "cli" | "http"; detail: string; latencyMs: number }>> {
  const auth = await requireAdmin(input.workspace_id);
  if (!auth.ok) return auth;

  const supabase = await createSupabaseServerClient();
  let endpoint = input.endpoint?.trim() ?? null;
  if (!endpoint) {
    const { data } = await supabase
      .from("workspaces")
      .select("hermes_endpoint")
      .eq("id", input.workspace_id)
      .maybeSingle();
    endpoint = (data?.hermes_endpoint as string | null) ?? null;
  }

  // HTTP wrapper supplied → probe /healthz. Otherwise → spawn the CLI
  // binary; that's what the actual provider does at chat / run time.
  if (endpoint && /^https?:\/\//i.test(endpoint)) {
    const r = await probeHealthz(endpoint);
    if (!r.ok) return { ok: false, error: r.error };
    const { error: updErr } = await supabase
      .from("workspaces")
      .update({ hermes_last_test_at: new Date().toISOString() })
      .eq("id", input.workspace_id);
    if (updErr) return { ok: false, error: updErr.message };
    revalidatePath(`/${input.workspace_slug}/settings/providers`);
    return {
      ok: true,
      data: { mode: "http", detail: r.url, latencyMs: r.latencyMs },
    };
  }

  const binary = process.env.HERMES_BIN || "hermes";
  const r = await probeBinary(binary);
  if (!r.ok) return { ok: false, error: r.error };
  const { error: updErr } = await supabase
    .from("workspaces")
    .update({ hermes_last_test_at: new Date().toISOString() })
    .eq("id", input.workspace_id);
  if (updErr) return { ok: false, error: updErr.message };
  revalidatePath(`/${input.workspace_slug}/settings/providers`);
  return {
    ok: true,
    data: { mode: "cli", detail: r.firstLine, latencyMs: r.latencyMs },
  };
}

/** Save the OpenClaw endpoint. */
export async function saveOpenClawEndpoint(input: {
  workspace_id: string;
  workspace_slug: string;
  endpoint: string | null;
}): Promise<Result<null>> {
  const auth = await requireAdmin(input.workspace_id);
  if (!auth.ok) return auth;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("workspaces")
    .update({ openclaw_endpoint: input.endpoint?.trim() || null })
    .eq("id", input.workspace_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}/settings/providers`);
  return { ok: true, data: null };
}

/** Test OpenClaw — same dual-mode pattern as testHermesEndpoint. */
export async function testOpenClawEndpoint(input: {
  workspace_id: string;
  workspace_slug: string;
  endpoint?: string | null;
}): Promise<Result<{ mode: "cli" | "http"; detail: string; latencyMs: number }>> {
  const auth = await requireAdmin(input.workspace_id);
  if (!auth.ok) return auth;

  const supabase = await createSupabaseServerClient();
  let endpoint = input.endpoint?.trim() ?? null;
  if (!endpoint) {
    const { data } = await supabase
      .from("workspaces")
      .select("openclaw_endpoint")
      .eq("id", input.workspace_id)
      .maybeSingle();
    endpoint = (data?.openclaw_endpoint as string | null) ?? null;
  }

  if (endpoint && /^https?:\/\//i.test(endpoint)) {
    const r = await probeHealthz(endpoint);
    if (!r.ok) return { ok: false, error: r.error };
    const { error: updErr } = await supabase
      .from("workspaces")
      .update({ openclaw_last_test_at: new Date().toISOString() })
      .eq("id", input.workspace_id);
    if (updErr) return { ok: false, error: updErr.message };
    revalidatePath(`/${input.workspace_slug}/settings/providers`);
    return {
      ok: true,
      data: { mode: "http", detail: r.url, latencyMs: r.latencyMs },
    };
  }

  const binary = process.env.OPENCLAW_BIN || "openclaw";
  const r = await probeBinary(binary);
  if (!r.ok) return { ok: false, error: r.error };
  const { error: updErr } = await supabase
    .from("workspaces")
    .update({ openclaw_last_test_at: new Date().toISOString() })
    .eq("id", input.workspace_id);
  if (updErr) return { ok: false, error: updErr.message };
  revalidatePath(`/${input.workspace_slug}/settings/providers`);
  return {
    ok: true,
    data: { mode: "cli", detail: r.firstLine, latencyMs: r.latencyMs },
  };
}

// ─── Persistent runtime agents ───────────────────────────────────────
// Onboarding for the "named profile" / "registered agent" model both
// runtimes support. Flow:
//   1. user picks a name (default: aio-<slug>)  → setRuntimeAgentName
//   2. user runs the install command on their host (we render a
//      copy-button with the exact CLI invocation)
//   3. user clicks Verify → we shell out to `<binary> profile list`
//      (Hermes) or `openclaw agents list`, grep for the name, stamp
//      *_agent_initialized_at on success
// After step 3, the provider router prefers the named-profile spawn
// path so subsequent chats reuse the runtime's persistent state.

export async function setRuntimeAgentName(input: {
  workspace_id: string;
  workspace_slug: string;
  provider: RuntimeAgentProvider;
  name: string;
}): Promise<Result<null>> {
  const auth = await requireAdmin(input.workspace_id);
  if (!auth.ok) return auth;
  const trimmed = input.name.trim().toLowerCase();
  if (!trimmed) return { ok: false, error: "Naam mag niet leeg zijn." };
  if (!RUNTIME_AGENT_NAME_RE.test(trimmed)) {
    return {
      ok: false,
      error:
        "Agent-naam: kleine letters, cijfers, _ of -, 2-41 chars, beginnen met letter (bv. aio-admin).",
    };
  }
  const supabase = await createSupabaseServerClient();
  const col =
    input.provider === "hermes" ? "hermes_agent_name" : "openclaw_agent_name";
  // Setting a new name resets the initialized stamp — the user has
  // to re-verify against whatever is actually present in the runtime.
  const initCol =
    input.provider === "hermes"
      ? "hermes_agent_initialized_at"
      : "openclaw_agent_initialized_at";
  const { error } = await supabase
    .from("workspaces")
    .update({ [col]: trimmed, [initCol]: null })
    .eq("id", input.workspace_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}/settings/providers`);
  return { ok: true, data: null };
}

/** Verify the named profile / agent actually exists in the runtime
 *  on the box where AIO Control runs. On match we stamp
 *  *_agent_initialized_at and the panel flips to a green pill. */
export async function verifyRuntimeAgent(input: {
  workspace_id: string;
  workspace_slug: string;
  provider: RuntimeAgentProvider;
}): Promise<Result<{ name: string; latencyMs: number }>> {
  const auth = await requireAdmin(input.workspace_id);
  if (!auth.ok) return auth;

  const supabase = await createSupabaseServerClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("hermes_agent_name, openclaw_agent_name")
    .eq("id", input.workspace_id)
    .maybeSingle();

  const name =
    input.provider === "hermes"
      ? ((ws?.hermes_agent_name as string | null) ?? null)
      : ((ws?.openclaw_agent_name as string | null) ?? null);
  if (!name) {
    return {
      ok: false,
      error: "Stel eerst een agent-naam in en klik Save.",
    };
  }

  const binary =
    input.provider === "hermes"
      ? process.env.HERMES_BIN || "hermes"
      : process.env.OPENCLAW_BIN || "openclaw";
  // openclaw agents list without --json triggers a channel-probe pass
  // that takes 20+s. With --json it stays under 2s. Hermes' profile
  // list is fast either way; we just keep the --json flag handy for
  // future structured parsing.
  const args =
    input.provider === "hermes"
      ? ["profile", "list"]
      : ["agents", "list", "--json"];

  const r = await runBinary(binary, args);
  if (!r.ok) return { ok: false, error: r.error };

  // For OpenClaw the JSON output is an array of agent objects with a
  // `name` (or sometimes `id`) field per row. For Hermes (text) we
  // fall back to a generous whitespace-bounded regex on stdout.
  let matched = false;
  if (input.provider === "openclaw") {
    try {
      const parsed = JSON.parse(r.stdout);
      const list: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { agents?: unknown[] })?.agents)
          ? (parsed as { agents: unknown[] }).agents
          : [];
      matched = list.some((it) => {
        if (!it || typeof it !== "object") return false;
        const o = it as Record<string, unknown>;
        return o.name === name || o.id === name;
      });
    } catch {
      // Fall through to regex match if JSON wasn't actually emitted.
    }
  }
  if (!matched) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    matched = new RegExp(`(^|\\s)${escaped}(\\s|$)`, "m").test(r.stdout);
  }
  if (!matched) {
    return {
      ok: false,
      error: `Profiel "${name}" niet gevonden in '${binary} ${args.join(" ")}' output. Heb je het install-commando hierboven al uitgevoerd?`,
    };
  }

  const initCol =
    input.provider === "hermes"
      ? "hermes_agent_initialized_at"
      : "openclaw_agent_initialized_at";
  const { error: updErr } = await supabase
    .from("workspaces")
    .update({ [initCol]: new Date().toISOString() })
    .eq("id", input.workspace_id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath(`/${input.workspace_slug}/settings/providers`);
  return { ok: true, data: { name, latencyMs: r.latencyMs } };
}

// runtimeInstallCommand + defaultRuntimeAgentName live in
// lib/providers/runtime.ts — see the "use server" boundary note in
// app/actions/api-keys.ts (Next forbids non-async-function exports
// from action files).
