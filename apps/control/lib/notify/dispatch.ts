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
import { isEmailConfigured, parseRecipients, sendEmail } from "./email";
import { sendTelegram } from "./telegram";
import { getServiceRoleSupabase } from "../supabase/service";

type RunRow = {
  id: string;
  workspace_id: string;
  business_id: string | null;
  /** Optional nav_node id when the run was pinned to a topic (set by
   *  the agent's nav_node_id or the schedule's, propagated by the
   *  cron-scheduler). Drives per-topic Telegram routing. */
  nav_node_id?: string | null;
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
  notify_email?: string | null;
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
): Promise<{ telegram: boolean; custom: boolean; email: boolean }> {
  const supabase = getServiceRoleSupabase();

  // 1. Look up the agent + schedule (if any) so we know which target
  //    each one prefers. Schedule wins over agent.
  let agent: AgentLite | null = null;
  if (run.agent_id) {
    const { data } = await supabase
      .from("agents")
      .select(
        "id, name, telegram_target_id, custom_integration_id, notify_email",
      )
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

  // 2. Resolve the per-business / per-topic auto-created topic-targets
  //    so reports from BusinessA's agent end up in BusinessA's topic
  //    instead of being lobbed at whichever workspace-scope target was
  //    created first. Order from most → least specific:
  //      schedule → agent → nav_node → business → workspace fallback
  let businessTopicTargetId: string | null = null;
  if (run.business_id) {
    const { data: bizRow } = await supabase
      .from("businesses")
      .select("telegram_topic_target_id")
      .eq("id", run.business_id)
      .maybeSingle();
    businessTopicTargetId =
      (bizRow?.telegram_topic_target_id as string | null) ?? null;
  }
  let navTopicTargetId: string | null = null;
  if (run.nav_node_id) {
    const { data: nodeRow } = await supabase
      .from("nav_nodes")
      .select("telegram_topic_target_id")
      .eq("id", run.nav_node_id)
      .maybeSingle();
    navTopicTargetId =
      (nodeRow?.telegram_topic_target_id as string | null) ?? null;
  }

  // 3. Pick the target IDs — schedule wins over agent wins over
  //    nav_node wins over business; final fallback is "any enabled
  //    workspace-scope target" inside fireTelegram below.
  const telegramId =
    schedule?.telegram_target_id ??
    agent?.telegram_target_id ??
    navTopicTargetId ??
    businessTopicTargetId ??
    null;
  const customId =
    schedule?.custom_integration_id ?? agent?.custom_integration_id ?? null;

  // 3. If no specific target, fall back to ANY enabled workspace-scope row.
  const sentTelegram = await fireTelegram(supabase, run, agent, event, telegramId);
  const sentCustom = await fireCustom(supabase, run, agent, event, customId);
  const sentEmail = await fireEmail(supabase, run, agent, event);

  return { telegram: sentTelegram, custom: sentCustom, email: sentEmail };
}

async function fireTelegram(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
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

  // Row 2 / 3: deep-link buttons (URL). Plain labels — the design
  // language doesn't use emojis, including in outbound Telegram cards.
  if (origin && slug) {
    const links: { text: string; url: string }[] = [];
    if (run.business_id) {
      links.push({
        text: "Open business",
        url: `${origin}/${slug}/business/${run.business_id}`,
      });
    }
    links.push({ text: "All runs", url: `${origin}/${slug}/runs` });
    buttons.push(links);
  }

  const res = await sendTelegram({
    workspace_id: run.workspace_id,
    business_id: run.business_id,
    target,
    text,
    buttons: buttons.length > 0 ? buttons : undefined,
  });
  if (!res.ok) {
    console.error("Telegram send failed", res.error);
    return false;
  }
  return true;
}

async function fireCustom(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
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

async function fireEmail(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  run: RunRow,
  agent: AgentLite | null,
  event: "done" | "failed",
): Promise<boolean> {
  if (!(await isEmailConfigured(run.workspace_id))) return false;

  // Resolve recipients: agent.notify_email > business.notify_email >
  // workspace.notify_email. First non-empty wins (we don't merge —
  // agent override means "send only here").
  const { data: business } = run.business_id
    ? await supabase
        .from("businesses")
        .select("notify_email")
        .eq("id", run.business_id)
        .maybeSingle()
    : { data: null };
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("notify_email, notify_email_on_done, notify_email_on_fail")
    .eq("id", run.workspace_id)
    .maybeSingle();

  if (event === "done" && !workspace?.notify_email_on_done) return false;
  if (event === "failed" && !workspace?.notify_email_on_fail) return false;

  const list =
    parseRecipients(agent?.notify_email ?? null).length > 0
      ? parseRecipients(agent?.notify_email ?? null)
      : parseRecipients(
            (business as { notify_email?: string | null } | null)?.notify_email ??
              null,
          ).length > 0
        ? parseRecipients(
            (business as { notify_email?: string | null } | null)?.notify_email ??
              null,
          )
        : parseRecipients(workspace?.notify_email ?? null);

  if (list.length === 0) return false;

  const subject =
    event === "done"
      ? `[AIO] ✓ ${agent?.name ?? "Agent"} run done`
      : `[AIO] ✗ ${agent?.name ?? "Agent"} run failed`;

  const body = formatRunMessage(run, agent, event)
    // Strip Markdown markers for the plain-text email body.
    .replace(/[*_`]/g, "");

  const html = `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(body)}</pre>`;

  const res = await sendEmail({
    workspace_id: run.workspace_id,
    to: list,
    subject,
    text: body,
    html,
  });
  if (!res.ok) {
    console.error("Email send failed", res.error);
    return false;
  }
  return true;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatRunMessage(
  run: RunRow,
  agent: AgentLite | null,
  event: "done" | "failed",
): string {
  const head = event === "done" ? "✅ Run done" : "❌ Run failed";
  const lines: string[] = [
    `${head} — ${agent?.name ?? "(agent)"}`,
    `Status: ${run.status}`,
  ];
  if (run.cost_cents != null && run.cost_cents > 0) {
    lines.push(`Cost: €${(run.cost_cents / 100).toFixed(4)}`);
  }
  if (run.duration_ms != null && run.duration_ms > 0) {
    lines.push(`Duration: ${(run.duration_ms / 1000).toFixed(1)}s`);
  }
  if (event === "failed" && run.error_text) {
    lines.push(`\n${stripMarkdown(truncate(run.error_text, 800))}`);
  }
  if (event === "done") {
    const out = extractText(run.output);
    if (out) lines.push(`\n${stripMarkdown(truncate(out, 800))}`);
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

function stripMarkdown(s: string): string {
  return s.replace(/[*_`]/g, "");
}

// Tiny in-process cache so we don't hammer the workspaces table with
// the same lookup for every run report. Most workspaces emit lots of
// runs in quick succession; this trims the per-run cost.
const slugCache = new Map<string, { slug: string; expires: number }>();
async function workspaceSlug(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
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
