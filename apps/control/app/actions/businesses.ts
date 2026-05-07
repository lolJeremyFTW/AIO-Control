// Server actions for business CRUD. RLS enforces workspace membership +
// editor-or-higher role; we still set workspace_id explicitly so the policy
// check can run and so the audit trigger picks it up.

"use server";

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { revalidatePath } from "next/cache";

import {
  telegramCloseForumTopic,
  telegramCreateForumTopic,
  telegramEditForumTopic,
} from "../../lib/notify/telegram";
import { generateUniqueBusinessSlug } from "../../lib/queries/businesses";
import {
  defaultBusinessOpenClawAgentName,
  RUNTIME_AGENT_NAME_RE,
} from "../../lib/providers/runtime";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { getServiceRoleSupabase } from "../../lib/supabase/service";

export type BusinessInput = {
  workspace_slug: string;
  workspace_id: string;
  name: string;
  sub?: string;
  letter?: string;
  variant?: string;
  /** Optional emoji (or any 1-3 chars) to render inside the rail node. */
  icon?: string;
  /** Optional CSS hex (e.g. "#7e3af2") — overrides variant palette. */
  color_hex?: string | null;
  /** Optional uploaded logo URL — overrides letter/icon. */
  logo_url?: string | null;
  description?: string;
  mission?: string;
  isolated?: boolean;
};

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type BinaryRunResult =
  | { ok: true; stdout: string; stderr: string; latencyMs: number }
  | { ok: false; error: string };

async function runBinary(
  binary: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<BinaryRunResult> {
  const t0 = Date.now();
  return new Promise<BinaryRunResult>((resolve) => {
    let resolved = false;
    let stdout = "";
    let stderr = "";

    const finish = (out: BinaryRunResult) => {
      if (resolved) return;
      resolved = true;
      resolve(out);
    };

    const child = spawn(binary, args, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      finish({
        ok: false,
        error: `Timeout (${binary} ${args.join(" ")} reageerde niet binnen ${Math.round((opts.timeoutMs ?? 30_000) / 1000)}s).`,
      });
    }, opts.timeoutMs ?? 30_000);

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
          "Check of de binary in PATH staat of zet OPENCLAW_BIN.",
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
            stderr.trim().slice(0, 400) || stdout.trim().slice(0, 400) || ""
          }`.trim(),
        });
      }
    });
  });
}

async function requireBusinessAdmin(
  businessId: string,
): Promise<
  ActionResult<{
    supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
    business: {
      id: string;
      workspace_id: string;
      slug: string;
      name: string;
      openclaw_agent_name: string | null;
    };
  }>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Niet ingelogd." };

  const { data: business, error: bizError } = await supabase
    .from("businesses")
    .select("id, workspace_id, slug, name, openclaw_agent_name")
    .eq("id", businessId)
    .maybeSingle();
  if (bizError || !business) {
    return { ok: false, error: bizError?.message ?? "Business niet gevonden." };
  }

  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", business.workspace_id as string)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();
  if (!member) {
    return {
      ok: false,
      error: "Alleen workspace owners/admins kunnen OpenClaw runtime-agents beheren.",
    };
  }

  return {
    ok: true,
    data: {
      supabase,
      business: business as {
        id: string;
        workspace_id: string;
        slug: string;
        name: string;
        openclaw_agent_name: string | null;
      },
    },
  };
}

export async function createBusiness(
  input: BusinessInput,
): Promise<
  ActionResult<{ id: string; slug: string; telegram_warning?: string }>
> {
  if (!input.name.trim()) {
    return { ok: false, error: "Naam mag niet leeg zijn." };
  }
  const letter = (input.letter ?? input.name).trim().slice(0, 1).toUpperCase();
  const variant = input.variant ?? "brand";

  const colorHex =
    input.color_hex && HEX_RE.test(input.color_hex)
      ? input.color_hex.toLowerCase()
      : null;

  const supabase = await createSupabaseServerClient();
  const slug = await generateUniqueBusinessSlug(
    supabase,
    input.workspace_id,
    input.name.trim(),
  );
  const { data, error } = await supabase
    .from("businesses")
    .insert({
      workspace_id: input.workspace_id,
      slug,
      name: input.name.trim(),
      sub: input.sub?.trim() || null,
      letter,
      variant,
      icon: input.icon?.trim() || null,
      color_hex: colorHex,
      logo_url: input.logo_url?.trim() || null,
      status: "paused",
      description: input.description?.trim() || null,
      mission: input.mission?.trim() || null,
      isolated: !!input.isolated,
    })
    .select("id, slug")
    .single();

  if (error) {
    console.error("createBusiness failed", error);
    return { ok: false, error: error.message };
  }

  // Wait briefly for the auto-topic create so we can surface a
  // "your bot is missing can_manage_topics" message in the UI instead
  // of silently swallowing it. 6s is generous — the Telegram API
  // typically replies in well under a second; on timeout we fall
  // through with a friendly hint.
  let telegramWarning: string | undefined;
  try {
    const result = await Promise.race([
      autoCreateTelegramTopicForBusiness({
        workspace_id: input.workspace_id,
        business_id: data.id,
        business_name: input.name.trim(),
        icon: input.icon ?? null,
      }),
      new Promise<{ ok: false; error: string }>((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: false,
              error:
                "Telegram API duurde te lang — controleer of de bot in de groep zit en als admin staat met 'Manage Topics' aan.",
            }),
          6000,
        ),
      ),
    ]);
    if (result && result.ok === false) telegramWarning = result.error;
  } catch (err) {
    telegramWarning =
      err instanceof Error ? err.message : "Telegram topic create faalde";
  }

  revalidatePath(`/${input.workspace_slug}/dashboard`);
  return {
    ok: true,
    data: {
      id: data.id,
      slug: data.slug as string,
      telegram_warning: telegramWarning,
    },
  };
}

export async function updateBusiness(input: {
  workspace_slug: string;
  id: string;
  /** Current business slug — used in revalidatePath so the slug-based URL cache is cleared. */
  business_slug?: string;
  patch: {
    name?: string;
    sub?: string | null;
    variant?: string;
    icon?: string | null;
    color_hex?: string | null;
    logo_url?: string | null;
    daily_spend_limit_cents?: number | null;
    monthly_spend_limit_cents?: number | null;
    status?: "running" | "paused";
    description?: string | null;
    mission?: string | null;
    targets?: unknown[];
    isolated?: boolean;
    /** Workspace-level wizard step #5 lets the user reuse an existing
     *  telegram_targets row instead of letting the auto-create flow
     *  spawn one. The column is the same (telegram_topic_target_id);
     *  the difference is who owns the row. */
    telegram_target_id?: string | null;
  };
}): Promise<ActionResult<null>> {
  const patch: Record<string, unknown> = {};
  if (input.patch.name !== undefined) {
    const trimmed = input.patch.name.trim();
    if (!trimmed) return { ok: false, error: "Naam mag niet leeg zijn." };
    patch.name = trimmed;
    patch.letter = trimmed.slice(0, 1).toUpperCase();
    // Regenerate slug on rename to keep URLs human-readable.
    const supabaseForSlug = await createSupabaseServerClient();
    const { data: bizForWorkspace } = await supabaseForSlug
      .from("businesses")
      .select("workspace_id")
      .eq("id", input.id)
      .maybeSingle();
    if (bizForWorkspace?.workspace_id) {
      patch.slug = await generateUniqueBusinessSlug(
        supabaseForSlug,
        bizForWorkspace.workspace_id as string,
        trimmed,
        input.id,
      );
    }
  }
  if (input.patch.sub !== undefined)
    patch.sub = input.patch.sub?.toString().trim() || null;
  if (input.patch.variant !== undefined) patch.variant = input.patch.variant;
  if (input.patch.icon !== undefined)
    patch.icon = input.patch.icon?.toString().trim() || null;
  if (input.patch.color_hex !== undefined) {
    const v = input.patch.color_hex;
    if (v === null || v === "") patch.color_hex = null;
    else if (HEX_RE.test(v)) patch.color_hex = v.toLowerCase();
    else
      return { ok: false, error: "Ongeldige hex (gebruik #rgb of #rrggbb)." };
  }
  if (input.patch.logo_url !== undefined)
    patch.logo_url = input.patch.logo_url?.toString().trim() || null;
  if (input.patch.daily_spend_limit_cents !== undefined)
    patch.daily_spend_limit_cents = input.patch.daily_spend_limit_cents;
  if (input.patch.monthly_spend_limit_cents !== undefined)
    patch.monthly_spend_limit_cents = input.patch.monthly_spend_limit_cents;
  if (input.patch.status !== undefined) patch.status = input.patch.status;
  if (input.patch.description !== undefined)
    patch.description = input.patch.description?.toString() || null;
  if (input.patch.mission !== undefined)
    patch.mission = input.patch.mission?.toString() || null;
  if (input.patch.targets !== undefined) patch.targets = input.patch.targets;
  if (input.patch.isolated !== undefined) patch.isolated = input.patch.isolated;
  if (input.patch.telegram_target_id !== undefined)
    patch.telegram_topic_target_id = input.patch.telegram_target_id;

  if (Object.keys(patch).length === 0) return { ok: true, data: null };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("businesses")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  // If the rename happened AND there's a bound Telegram topic, push
  // the new name to Telegram so the topic title stays in sync.
  if (input.patch.name !== undefined) {
    void renameTelegramTopicForBusiness({
      business_id: input.id,
      new_name: (patch.name as string) ?? input.patch.name,
    }).catch((err) => console.error("renameTelegramTopic failed", err));
  }

  revalidatePath(`/${input.workspace_slug}/dashboard`);
  const bizPathId =
    (patch.slug as string | undefined) ?? input.business_slug ?? input.id;
  revalidatePath(`/${input.workspace_slug}/business/${bizPathId}`, "layout");
  return { ok: true, data: null };
}

export async function setBusinessOpenClawAgentName(input: {
  workspace_slug: string;
  business_id: string;
  name: string | null;
}): Promise<ActionResult<null>> {
  const auth = await requireBusinessAdmin(input.business_id);
  if (!auth.ok) return auth;

  const trimmed = input.name?.trim().toLowerCase() || null;
  if (trimmed && !RUNTIME_AGENT_NAME_RE.test(trimmed)) {
    return {
      ok: false,
      error:
        "Agent-naam: kleine letters, cijfers, _ of -, 2-41 chars, beginnen met letter.",
    };
  }

  const { error } = await auth.data.supabase
    .from("businesses")
    .update({
      openclaw_agent_name: trimmed,
      openclaw_agent_initialized_at: null,
    })
    .eq("id", input.business_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(
    `/${input.workspace_slug}/business/${auth.data.business.slug}`,
    "layout",
  );
  return { ok: true, data: null };
}

export async function verifyBusinessOpenClawAgent(input: {
  workspace_slug: string;
  business_id: string;
}): Promise<ActionResult<{ name: string; latencyMs: number }>> {
  const auth = await requireBusinessAdmin(input.business_id);
  if (!auth.ok) return auth;

  const name =
    auth.data.business.openclaw_agent_name ??
    defaultBusinessOpenClawAgentName(auth.data.business.slug);
  const binary = process.env.OPENCLAW_BIN || "openclaw";
  const exists = await openclawAgentExists(binary, name);
  if (!exists.ok) return exists;
  if (!exists.data.exists) {
    return {
      ok: false,
      error: `OpenClaw-agent "${name}" niet gevonden op deze server. Klik eerst Create on VPS.`,
    };
  }

  const initializedAt = new Date().toISOString();
  const { error } = await auth.data.supabase
    .from("businesses")
    .update({
      openclaw_agent_name: name,
      openclaw_agent_initialized_at: initializedAt,
    })
    .eq("id", input.business_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(
    `/${input.workspace_slug}/business/${auth.data.business.slug}`,
    "layout",
  );
  return { ok: true, data: { name, latencyMs: exists.data.latencyMs } };
}

export async function createBusinessOpenClawAgent(input: {
  workspace_slug: string;
  business_id: string;
  name?: string | null;
}): Promise<ActionResult<{ name: string; mirroredFrom: string | null }>> {
  const auth = await requireBusinessAdmin(input.business_id);
  if (!auth.ok) return auth;

  const name = (
    input.name?.trim() ||
    auth.data.business.openclaw_agent_name ||
    defaultBusinessOpenClawAgentName(auth.data.business.slug)
  ).toLowerCase();
  if (!RUNTIME_AGENT_NAME_RE.test(name)) {
    return {
      ok: false,
      error:
        "Agent-naam: kleine letters, cijfers, _ of -, 2-41 chars, beginnen met letter.",
    };
  }

  const binary = process.env.OPENCLAW_BIN || "openclaw";
  const workspaceDir =
    process.env.OPENCLAW_WORKSPACE_DIR ||
    join(homedir(), ".openclaw", "workspace");
  const existing = await openclawAgentExists(binary, name);
  if (!existing.ok) return existing;

  if (!existing.data.exists) {
    const created = await runBinary(
      binary,
      [
        "agents",
        "add",
        name,
        "--non-interactive",
        "--workspace",
        workspaceDir,
        "--json",
      ],
      { timeoutMs: 45_000 },
    );
    if (!created.ok) {
      const afterFailure = await openclawAgentExists(binary, name);
      if (!afterFailure.ok || !afterFailure.data.exists) {
        return { ok: false, error: created.error };
      }
    }
  }

  const { data: ws } = await auth.data.supabase
    .from("workspaces")
    .select("openclaw_agent_name")
    .eq("id", auth.data.business.workspace_id)
    .maybeSingle();
  const sourceName =
    (ws?.openclaw_agent_name as string | null) ?? "aio-admin";
  const mirroredFrom = await mirrorOpenclawAgentFiles(sourceName, name);

  const { error } = await auth.data.supabase
    .from("businesses")
    .update({
      openclaw_agent_name: name,
      openclaw_agent_initialized_at: new Date().toISOString(),
    })
    .eq("id", input.business_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(
    `/${input.workspace_slug}/business/${auth.data.business.slug}`,
    "layout",
  );
  return { ok: true, data: { name, mirroredFrom } };
}

async function openclawAgentExists(
  binary: string,
  name: string,
): Promise<ActionResult<{ exists: boolean; latencyMs: number }>> {
  const r = await runBinary(binary, ["agents", "list", "--json"], {
    timeoutMs: 30_000,
  });
  if (!r.ok) return { ok: false, error: r.error };

  let matched = false;
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
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    matched = new RegExp(`(^|\\s)${escaped}(\\s|$)`, "m").test(r.stdout);
  }

  return { ok: true, data: { exists: matched, latencyMs: r.latencyMs } };
}

async function mirrorOpenclawAgentFiles(
  preferredSourceName: string,
  targetName: string,
): Promise<string | null> {
  if (preferredSourceName === targetName) return targetName;

  const agentsRoot = join(homedir(), ".openclaw", "agents");
  const targetDir = join(agentsRoot, targetName, "agent");
  await mkdir(targetDir, { recursive: true });

  const sourceNames = [
    preferredSourceName,
    "aio-admin",
    "main",
  ].filter((v, i, arr) => !!v && arr.indexOf(v) === i);

  for (const sourceName of sourceNames) {
    if (sourceName === targetName) continue;
    const sourceDir = join(agentsRoot, sourceName, "agent");
    const models = join(sourceDir, "models.json");
    const auth = join(sourceDir, "auth-profiles.json");
    if (!existsSync(models) && !existsSync(auth)) continue;

    if (existsSync(models)) {
      await copyFile(models, join(targetDir, "models.json"));
    }
    if (existsSync(auth)) {
      await copyFile(auth, join(targetDir, "auth-profiles.json"));
    }
    return sourceName;
  }

  return null;
}

export async function duplicateBusiness(input: {
  workspace_slug: string;
  workspace_id: string;
  source_id: string;
}): Promise<ActionResult<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: src, error: srcErr } = await supabase
    .from("businesses")
    .select(
      "name, sub, letter, variant, icon, color_hex, logo_url, status, primary_action",
    )
    .eq("id", input.source_id)
    .maybeSingle();
  if (srcErr || !src) {
    return { ok: false, error: srcErr?.message ?? "Origineel niet gevonden." };
  }
  const copyName = `${src.name} (kopie)`;
  const copySlug = await generateUniqueBusinessSlug(
    supabase,
    input.workspace_id,
    copyName,
  );
  const { data, error } = await supabase
    .from("businesses")
    .insert({
      workspace_id: input.workspace_id,
      slug: copySlug,
      name: copyName,
      sub: src.sub,
      letter: src.letter,
      variant: src.variant,
      icon: src.icon,
      color_hex: src.color_hex,
      logo_url: src.logo_url,
      status: "paused",
      primary_action: src.primary_action,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert faalde." };
  }
  revalidatePath(`/${input.workspace_slug}/dashboard`);
  return { ok: true, data: { id: data.id } };
}

export async function swapBusinessOrder(input: {
  workspace_slug: string;
  source_id: string;
  target_id: string;
}): Promise<ActionResult<null>> {
  if (input.source_id === input.target_id) return { ok: true, data: null };
  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase
    .from("businesses")
    .select("id, sort_order")
    .in("id", [input.source_id, input.target_id]);
  if (!rows || rows.length !== 2) {
    return { ok: false, error: "Businesses niet gevonden." };
  }
  const a = rows.find((r) => r.id === input.source_id);
  const b = rows.find((r) => r.id === input.target_id);
  if (!a || !b) return { ok: false, error: "Niet gevonden." };
  await supabase
    .from("businesses")
    .update({ sort_order: b.sort_order })
    .eq("id", a.id);
  await supabase
    .from("businesses")
    .update({ sort_order: a.sort_order })
    .eq("id", b.id);
  revalidatePath(`/${input.workspace_slug}/dashboard`);
  revalidatePath(`/${input.workspace_slug}`, "layout");
  return { ok: true, data: null };
}

export async function archiveBusiness({
  workspace_slug,
  id,
}: {
  workspace_slug: string;
  id: string;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("businesses")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // Close the bound Telegram topic so it visually grays out in the
  // group + new messages aren't accepted on it. Best-effort.
  void closeTelegramTopicForBusiness({ business_id: id }).catch((err) =>
    console.error("closeTelegramTopic failed", err),
  );

  revalidatePath(`/${workspace_slug}/dashboard`);
  return { ok: true, data: null };
}

// ─── Telegram auto-topic helpers ────────────────────────────────────
//
// These run on the service-role client so RLS doesn't block the
// targets-table insert + the businesses.telegram_topic_target_id
// update. Permission check happens in the calling action via the
// regular cookie-bound client.

type AutoCreateResult = { ok: true } | { ok: false; error: string };

/**
 * Server action wrapper around the internal auto-create. Lets the
 * EditBusinessDialog (and any other future caller) backfill a topic
 * for an existing business that was created before the bot had the
 * "Manage Topics" permission. RLS gates the read of the business row
 * via the service-role helper inside.
 */
export async function backfillBusinessTelegramTopic(input: {
  workspace_slug: string;
  business_id: string;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { data: biz, error } = await supabase
    .from("businesses")
    .select("workspace_id, name, icon, telegram_topic_target_id")
    .eq("id", input.business_id)
    .maybeSingle();
  if (error || !biz) return { ok: false, error: "Business niet gevonden." };
  if (biz.telegram_topic_target_id) {
    return {
      ok: false,
      error:
        "Business heeft al een Telegram topic gekoppeld. Verwijder eerst de bestaande binding via Settings → Telegram.",
    };
  }
  const result = await autoCreateTelegramTopicForBusiness({
    workspace_id: biz.workspace_id as string,
    business_id: input.business_id,
    business_name: (biz.name as string) ?? "Business",
    icon: (biz.icon as string | null) ?? null,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/${input.workspace_slug}/dashboard`);
  return { ok: true, data: null };
}

async function autoCreateTelegramTopicForBusiness(opts: {
  workspace_id: string;
  business_id: string;
  business_name: string;
  icon: string | null;
}): Promise<AutoCreateResult> {
  const admin = getServiceRoleSupabase();

  // Skip silently when the workspace hasn't opted into auto-topics.
  // We surface a warning only when the topology IS set but the
  // creation failed, so the user has actionable feedback.
  const { data: ws } = await admin
    .from("workspaces")
    .select("telegram_topology")
    .eq("id", opts.workspace_id)
    .maybeSingle();
  const topology = ws?.telegram_topology as string | null | undefined;
  if (
    topology !== "topic_per_business" &&
    topology !== "topic_per_business_and_node"
  ) {
    return { ok: true };
  }

  // Find the parent group. Prefer the explicit auto_create_topics flag
  // when set; fall back to any enabled workspace-scope target so that
  // users who flip telegram_topology to topic_per_business without
  // explicitly marking a parent still get topics auto-created.
  const { data: parent } = await admin
    .from("telegram_targets")
    .select("id, chat_id, auto_create_topics_for_businesses")
    .eq("workspace_id", opts.workspace_id)
    .eq("scope", "workspace")
    .eq("enabled", true)
    .order("auto_create_topics_for_businesses", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!parent?.chat_id) {
    return {
      ok: false,
      error:
        "Geen workspace-Telegram target gevonden — voeg er een toe in Settings → Telegram met de chat_id van je groep.",
    };
  }

  const topicName = opts.icon
    ? `${opts.icon} ${opts.business_name}`
    : opts.business_name;
  const created = await telegramCreateForumTopic({
    workspace_id: opts.workspace_id,
    chat_id: parent.chat_id,
    name: topicName,
  });
  if (!created.ok) {
    // Translate the most common Telegram error so the user sees the
    // fix instead of the raw API string.
    const raw = created.error ?? "";
    const friendly = /not enough rights|can_manage_topics/i.test(raw)
      ? "Telegram weigert: de bot mist de 'Manage Topics' permissie. Maak de bot admin in de groep en zet 'Manage Topics' aan."
      : /chat not found|invalid chat/i.test(raw)
        ? `Telegram chat_id '${parent.chat_id}' niet gevonden — controleer of de bot in de groep zit.`
        : `Telegram: ${raw}`;
    return { ok: false, error: friendly };
  }

  // Mint a per-business telegram_targets row pointing at the new
  // topic — so the run-event dispatcher routes reports to it.
  const { data: newTarget } = await admin
    .from("telegram_targets")
    .insert({
      workspace_id: opts.workspace_id,
      scope: "business",
      scope_id: opts.business_id,
      name: `Auto: ${opts.business_name}`,
      chat_id: parent.chat_id,
      topic_id: created.message_thread_id,
      enabled: true,
      send_run_done: true,
      send_run_fail: true,
      send_queue_review: true,
    })
    .select("id")
    .single();
  if (!newTarget) {
    return {
      ok: false,
      error: "Topic aangemaakt in Telegram, maar opslaan in DB faalde.",
    };
  }

  // Bind the target to the business so we can rename/close later.
  await admin
    .from("businesses")
    .update({ telegram_topic_target_id: newTarget.id })
    .eq("id", opts.business_id);

  return { ok: true };
}

async function renameTelegramTopicForBusiness(opts: {
  business_id: string;
  new_name: string;
}): Promise<void> {
  const admin = getServiceRoleSupabase();
  const { data: biz } = await admin
    .from("businesses")
    .select("workspace_id, icon, telegram_topic_target_id")
    .eq("id", opts.business_id)
    .maybeSingle();
  if (!biz?.telegram_topic_target_id) return;

  const { data: target } = await admin
    .from("telegram_targets")
    .select("chat_id, topic_id")
    .eq("id", biz.telegram_topic_target_id)
    .maybeSingle();
  if (!target?.chat_id || target.topic_id == null) return;

  const topicName = biz.icon ? `${biz.icon} ${opts.new_name}` : opts.new_name;
  await telegramEditForumTopic({
    workspace_id: biz.workspace_id,
    chat_id: target.chat_id,
    message_thread_id: target.topic_id,
    name: topicName,
  });
  // Keep the target's display name in sync too.
  await admin
    .from("telegram_targets")
    .update({ name: `Auto: ${opts.new_name}` })
    .eq("id", biz.telegram_topic_target_id);
}

async function closeTelegramTopicForBusiness(opts: {
  business_id: string;
}): Promise<void> {
  const admin = getServiceRoleSupabase();
  const { data: biz } = await admin
    .from("businesses")
    .select("workspace_id, telegram_topic_target_id")
    .eq("id", opts.business_id)
    .maybeSingle();
  if (!biz?.telegram_topic_target_id) return;

  const { data: target } = await admin
    .from("telegram_targets")
    .select("chat_id, topic_id")
    .eq("id", biz.telegram_topic_target_id)
    .maybeSingle();
  if (!target?.chat_id || target.topic_id == null) return;

  await telegramCloseForumTopic({
    workspace_id: biz.workspace_id,
    chat_id: target.chat_id,
    message_thread_id: target.topic_id,
  });
  // Disable the target row so the dispatcher stops routing to it.
  await admin
    .from("telegram_targets")
    .update({ enabled: false })
    .eq("id", biz.telegram_topic_target_id);
}

export async function toggleBusinessStatus({
  workspace_slug,
  id,
  to,
}: {
  workspace_slug: string;
  id: string;
  to: "running" | "paused";
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("businesses")
    .update({ status: to })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${workspace_slug}/dashboard`);
  return { ok: true, data: null };
}
