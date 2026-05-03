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

type BinaryProbeResult =
  | { ok: true; firstLine: string; latencyMs: number }
  | { ok: false; error: string };

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
 *  full URL it actually hit + the round-trip latency on success. */
async function probeHealthz(
  base: string,
): Promise<
  | { ok: true; url: string; latencyMs: number }
  | { ok: false; error: string }
> {
  const url = base.replace(/\/+$/, "");
  const probe = `${url}/healthz`;
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(probe, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok)
      return {
        ok: false,
        error: `${probe} antwoordde met ${r.status} ${r.statusText}.`,
      };
    return { ok: true, url, latencyMs: Date.now() - t0 };
  } catch (err) {
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
