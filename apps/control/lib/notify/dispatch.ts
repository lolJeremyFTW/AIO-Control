// Single dispatcher that fires all configured outbound notifications
// for a given run lifecycle event. Called from /api/runs/[id]/result
// (Claude Routine callback) and from the chat-route's stream finally{}.
//
// Resolution rules:
//   - Find the agent's telegram_target_id and custom_integration_id
//     (set on the agent or via the schedule that fired this run).
//   - Fall back to the workspace-default telegram_target / custom_integration
//     when the agent didn't pick a specific one and `enabled=true`.
//   - Only send when the matching `send_run_done` / `send_run_fail` flag
//     is set on the row.

import "server-only";

import { sendCustom } from "./custom-integration";
import { sendTelegram } from "./telegram";
import { createSupabaseServerClient } from "../supabase/server";

type RunRow = {
  id: string;
  workspace_id: string;
  business_id: string | null;
  agent_id: string | null;
  schedule_id: string | null;
  status: string;
  cost_cents: number | null;
  duration_ms: number | null;
  output: Record<string, unknown> | null;
  error_text: string | null;
};

type AgentLite = {
  id: string;
  name: string;
  telegram_target_id: string | null;
  custom_integration_id: string | null;
};

type ScheduleLite = {
  id: string;
  title: string | null;
  telegram_target_id: string | null;
  custom_integration_id: string | null;
};

export async function dispatchRunEvent(
  run: RunRow,
  event: "done" | "failed",
): Promise<{ telegram: boolean; custom: boolean }> {
  const supabase = await createSupabaseServerClient();

  // 1. Look up the agent + schedule (if any) so we know which target
  //    each one prefers. Schedule wins over agent.
  let agent: AgentLite | null = null;
  if (run.agent_id) {
    const { data } = await supabase
      .from("agents")
      .select("id, name, telegram_target_id, custom_integration_id")
      .eq("id", run.agent_id)
      .maybeSingle();
    agent = (data as AgentLite | null) ?? null;
  }
  let schedule: ScheduleLite | null = null;
  if (run.schedule_id) {
    const { data } = await supabase
      .from("schedules")
      .select("id, title, telegram_target_id, custom_integration_id")
      .eq("id", run.schedule_id)
      .maybeSingle();
    schedule = (data as ScheduleLite | null) ?? null;
  }

  // 2. Pick the target IDs — schedule overrides agent.
  const telegramId =
    schedule?.telegram_target_id ?? agent?.telegram_target_id ?? null;
  const customId =
    schedule?.custom_integration_id ?? agent?.custom_integration_id ?? null;

  // 3. If no specific target, fall back to ANY enabled workspace-scope row.
  const sentTelegram = await fireTelegram(supabase, run, agent, event, telegramId);
  const sentCustom = await fireCustom(supabase, run, agent, event, customId);

  return { telegram: sentTelegram, custom: sentCustom };
}

async function fireTelegram(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  run: RunRow,
  agent: AgentLite | null,
  event: "done" | "failed",
  preferredId: string | null,
): Promise<boolean> {
  let target;
  if (preferredId) {
    const { data } = await supabase
      .from("telegram_targets")
      .select(
        "id, workspace_id, chat_id, topic_id, enabled, send_run_done, send_run_fail",
      )
      .eq("id", preferredId)
      .maybeSingle();
    target = data;
  } else {
    // Workspace-default: any enabled workspace-scope target.
    const { data } = await supabase
      .from("telegram_targets")
      .select(
        "id, workspace_id, chat_id, topic_id, enabled, send_run_done, send_run_fail",
      )
      .eq("workspace_id", run.workspace_id)
      .eq("scope", "workspace")
      .eq("enabled", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    target = data;
  }
  if (!target) return false;
  if (event === "done" && !target.send_run_done) return false;
  if (event === "failed" && !target.send_run_fail) return false;

  const text = formatRunMessage(run, agent, event);
  // Build deep-links + actionable buttons. URL buttons just open AIO
  // Control; callback_data buttons trigger a server-side action via
  // /api/integrations/telegram/webhook. We mix both kinds.
  const origin = process.env.NEXT_PUBLIC_TRIGGER_ORIGIN ?? "";
  const buttons: { text: string; url?: string; callback_data?: string }[][] = [];
  const slug = origin ? await workspaceSlug(supabase, run.workspace_id) : "";

  // Row 1: action buttons (callback) — only when we have an agent so
  // "Run again" actually does something.
  if (agent?.id) {
    buttons.push([
      { text: "🔁 Run again", callback_data: `run_again:${agent.id}` },
    ]);
  }

  // Row 2 / 3: deep-link buttons (URL)
  if (origin && slug) {
    const links: { text: string; url: string }[] = [];
    if (run.business_id) {
      links.push({
        text: "📊 Business",
        url: `${origin}/${slug}/business/${run.business_id}`,
      });
    }
    links.push({ text: "📜 Runs", url: `${origin}/${slug}/runs` });
    buttons.push(links);
  }

  const res = await sendTelegram({
    workspace_id: run.workspace_id,
    business_id: run.business_id,
    target,
    text,
    parse_mode: "Markdown",
    buttons: buttons.length > 0 ? buttons : undefined,
  });
  if (!res.ok) {
    console.error("Telegram send failed", res.error);
    return false;
  }
  return true;
}

async function fireCustom(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  run: RunRow,
  agent: AgentLite | null,
  event: "done" | "failed",
  preferredId: string | null,
): Promise<boolean> {
  let integration;
  if (preferredId) {
    const { data } = await supabase
      .from("custom_integrations")
      .select(
        "id, workspace_id, url, method, headers, body_template, enabled, on_run_done, on_run_fail",
      )
      .eq("id", preferredId)
      .maybeSingle();
    integration = data;
  } else {
    const { data } = await supabase
      .from("custom_integrations")
      .select(
        "id, workspace_id, url, method, headers, body_template, enabled, on_run_done, on_run_fail",
      )
      .eq("workspace_id", run.workspace_id)
      .eq("scope", "workspace")
      .eq("enabled", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    integration = data;
  }
  if (!integration) return false;
  if (event === "done" && !integration.on_run_done) return false;
  if (event === "failed" && !integration.on_run_fail) return false;

  const res = await sendCustom({
    integration: integration as Parameters<typeof sendCustom>[0]["integration"],
    vars: {
      run: {
        id: run.id,
        status: run.status,
        agent: agent?.name ?? "(geen agent)",
        cost_cents: run.cost_cents ?? 0,
        duration_ms: run.duration_ms ?? 0,
        output: extractText(run.output) ?? "",
        error: run.error_text ?? "",
      },
      event,
    },
  });
  if (!res.ok) {
    console.error("Custom integration send failed", res.error);
    return false;
  }
  return true;
}

function formatRunMessage(
  run: RunRow,
  agent: AgentLite | null,
  event: "done" | "failed",
): string {
  const head = event === "done" ? "✅ Run done" : "❌ Run failed";
  const lines: string[] = [
    `*${head}* — ${agent?.name ?? "(agent)"}`,
    `Status: \`${run.status}\``,
  ];
  if (run.cost_cents != null && run.cost_cents > 0) {
    lines.push(`Cost: €${(run.cost_cents / 100).toFixed(4)}`);
  }
  if (run.duration_ms != null && run.duration_ms > 0) {
    lines.push(`Duration: ${(run.duration_ms / 1000).toFixed(1)}s`);
  }
  if (event === "failed" && run.error_text) {
    lines.push(`\n${truncate(run.error_text, 800)}`);
  }
  if (event === "done") {
    const out = extractText(run.output);
    if (out) lines.push(`\n${truncate(out, 800)}`);
  }
  return lines.join("\n");
}

function extractText(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  if (typeof o.text === "string") return o.text;
  if (typeof o.message === "string") return o.message;
  return null;
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

// Tiny in-process cache so we don't hammer the workspaces table with
// the same lookup for every run report. Most workspaces emit lots of
// runs in quick succession; this trims the per-run cost.
const slugCache = new Map<string, { slug: string; expires: number }>();
async function workspaceSlug(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  workspaceId: string,
): Promise<string> {
  const cached = slugCache.get(workspaceId);
  if (cached && cached.expires > Date.now()) return cached.slug;
  const { data } = await supabase
    .from("workspaces")
    .select("slug")
    .eq("id", workspaceId)
    .maybeSingle();
  const slug = (data?.slug as string | undefined) ?? "";
  slugCache.set(workspaceId, { slug, expires: Date.now() + 5 * 60 * 1000 });
  return slug;
}
