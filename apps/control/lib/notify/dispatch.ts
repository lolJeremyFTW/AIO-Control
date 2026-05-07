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
import { sendDiscordText } from "./providers/discord";
import { sendSlackText } from "./providers/slack";
import type { NotificationTarget } from "./providers/types";
import {
  formatRunDiscordComponents,
  formatRunDiscordEmbeds,
  formatRunPlainText,
  formatRunSlackBlocks,
  type RunMessageLink,
} from "./run-message";
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
  business_id?: string | null;
  nav_node_id?: string | null;
  telegram_target_id: string | null;
  custom_integration_id: string | null;
  notify_email?: string | null;
};

type ScheduleLite = {
  id: string;
  title: string | null;
  business_id?: string | null;
  nav_node_id?: string | null;
  telegram_target_id: string | null;
  custom_integration_id: string | null;
};

type GenericNotificationTarget = NotificationTarget & {
  provider: "slack" | "discord";
  send_run_done: boolean;
  send_run_fail: boolean;
  send_queue_review: boolean;
  scope?: "workspace" | "business" | "navnode";
  scope_id?: string;
  created_at?: string;
};

export async function dispatchRunEvent(
  run: RunRow,
  event: "done" | "failed",
): Promise<{
  telegram: boolean;
  custom: boolean;
  email: boolean;
  slack: boolean;
  discord: boolean;
}> {
  const supabase = getServiceRoleSupabase();

  // 1. Look up the agent + schedule (if any) so we know which target
  //    each one prefers. Schedule wins over agent.
  let agent: AgentLite | null = null;
  if (run.agent_id) {
    const { data } = await supabase
      .from("agents")
      .select(
        "id, name, business_id, nav_node_id, telegram_target_id, custom_integration_id, notify_email",
      )
      .eq("id", run.agent_id)
      .maybeSingle();
    agent = (data as AgentLite | null) ?? null;
  }
  let schedule: ScheduleLite | null = null;
  if (run.schedule_id) {
    const { data } = await supabase
      .from("schedules")
      .select(
        "id, title, business_id, nav_node_id, telegram_target_id, custom_integration_id",
      )
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
  const sentTelegram = await fireTelegram(
    supabase,
    run,
    agent,
    event,
    telegramId,
  );
  const sentCustom = await fireCustom(supabase, run, agent, event, customId);
  const sentEmail = await fireEmail(supabase, run, agent, event);
  const sentGeneric = await fireNotificationTargets(
    supabase,
    run,
    agent,
    schedule,
    event,
  );

  return {
    telegram: sentTelegram,
    custom: sentCustom,
    email: sentEmail,
    slack: sentGeneric.slack,
    discord: sentGeneric.discord,
  };
}

async function fireTelegram(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  run: RunRow,
  agent: AgentLite | null,
  event: "done" | "failed",
  preferredId: string | null,
): Promise<boolean> {
  const genericTarget = await fetchGenericTelegramTarget(
    supabase,
    run.workspace_id,
    preferredId,
  );
  if (genericTarget) {
    return sendTelegramRunNotification(
      supabase,
      run,
      agent,
      event,
      genericTarget,
    );
  }

  const target = await fetchLegacyTelegramTarget(
    supabase,
    run.workspace_id,
    preferredId,
  );
  if (!target) return false;
  return sendTelegramRunNotification(supabase, run, agent, event, target);
}

async function fetchGenericTelegramTarget(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  workspaceId: string,
  preferredId: string | null,
): Promise<{
  id: string;
  workspace_id: string;
  chat_id: string;
  topic_id: number | null;
  enabled: boolean;
  send_run_done: boolean;
  send_run_fail: boolean;
} | null> {
  const select =
    "id, workspace_id, config, enabled, send_run_done, send_run_fail";
  const query = preferredId
    ? supabase
        .from("notification_targets")
        .select(select)
        .eq("workspace_id", workspaceId)
        .eq("provider", "telegram")
        .eq("id", preferredId)
        .maybeSingle()
    : supabase
        .from("notification_targets")
        .select(select)
        .eq("workspace_id", workspaceId)
        .eq("provider", "telegram")
        .eq("scope", "workspace")
        .eq("enabled", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

  const { data } = await query;
  if (!data) return null;

  const row = data as {
    id: string;
    workspace_id: string;
    config: Record<string, unknown>;
    enabled: boolean;
    send_run_done: boolean;
    send_run_fail: boolean;
  };
  const chatId =
    typeof row.config.chat_id === "string" && row.config.chat_id.trim()
      ? row.config.chat_id.trim()
      : null;
  if (!chatId) return null;

  return {
    id: row.id,
    workspace_id: row.workspace_id,
    chat_id: chatId,
    topic_id: numberOrNull(row.config.topic_id),
    enabled: row.enabled,
    send_run_done: row.send_run_done,
    send_run_fail: row.send_run_fail,
  };
}

async function fetchLegacyTelegramTarget(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  workspaceId: string,
  preferredId: string | null,
): Promise<{
  id: string;
  workspace_id: string;
  chat_id: string;
  topic_id: number | null;
  enabled: boolean;
  send_run_done: boolean;
  send_run_fail: boolean;
} | null> {
  if (preferredId) {
    const { data } = await supabase
      .from("telegram_targets")
      .select(
        "id, workspace_id, chat_id, topic_id, enabled, send_run_done, send_run_fail",
      )
      .eq("id", preferredId)
      .maybeSingle();
    return data as Awaited<ReturnType<typeof fetchLegacyTelegramTarget>>;
  }

  const { data } = await supabase
    .from("telegram_targets")
    .select(
      "id, workspace_id, chat_id, topic_id, enabled, send_run_done, send_run_fail",
    )
    .eq("workspace_id", workspaceId)
    .eq("scope", "workspace")
    .eq("enabled", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data as Awaited<ReturnType<typeof fetchLegacyTelegramTarget>>;
}

async function sendTelegramRunNotification(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  run: RunRow,
  agent: AgentLite | null,
  event: "done" | "failed",
  target: {
    id: string;
    workspace_id: string;
    chat_id: string;
    topic_id: number | null;
    enabled: boolean;
    send_run_done: boolean;
    send_run_fail: boolean;
  },
): Promise<boolean> {
  if (event === "done" && !target.send_run_done) return false;
  if (event === "failed" && !target.send_run_fail) return false;

  const text = formatRunMessage(run, agent, event);
  // Build deep-links + actionable buttons. URL buttons just open AIO
  // Control; callback_data buttons trigger a server-side action via
  // /api/integrations/telegram/webhook. We mix both kinds.
  const origin = process.env.NEXT_PUBLIC_TRIGGER_ORIGIN ?? "";
  const buttons: { text: string; url?: string; callback_data?: string }[][] =
    [];
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

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
            (business as { notify_email?: string | null } | null)
              ?.notify_email ?? null,
          ).length > 0
        ? parseRecipients(
            (business as { notify_email?: string | null } | null)
              ?.notify_email ?? null,
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

async function fireNotificationTargets(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  run: RunRow,
  agent: AgentLite | null,
  schedule: ScheduleLite | null,
  event: "done" | "failed",
): Promise<{ slack: boolean; discord: boolean }> {
  const targets = await resolveNotificationTargets(
    supabase,
    run,
    agent,
    schedule,
    event,
  );
  if (targets.length === 0) return { slack: false, discord: false };

  const links = await runLinks(supabase, run);
  const text = formatRunPlainText({ run, agent, event, links });
  const results = await Promise.all(
    targets.map(async (target) => {
      const res =
        target.provider === "slack"
          ? await sendSlackText({
              workspace_id: run.workspace_id,
              target,
              text,
              blocks: formatRunSlackBlocks({ run, agent, event, links }),
            })
          : await sendDiscordText({
              workspace_id: run.workspace_id,
              target,
              text,
              embeds: formatRunDiscordEmbeds({ run, agent, event, links }),
              components: formatRunDiscordComponents({ agent, links }),
            });
      if (!res.ok) {
        console.error(`${target.provider} notification failed`, {
          target_id: target.id,
          error: res.error,
        });
        return { provider: target.provider, sent: false };
      }
      return { provider: target.provider, sent: true };
    }),
  );

  return {
    slack: results.some((r) => r.provider === "slack" && r.sent),
    discord: results.some((r) => r.provider === "discord" && r.sent),
  };
}

async function resolveNotificationTargets(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  run: RunRow,
  agent: AgentLite | null,
  schedule: ScheduleLite | null,
  event: "done" | "failed",
): Promise<GenericNotificationTarget[]> {
  const eventName = event === "done" ? "run_done" : "run_fail";
  const ownerLevels = ownerPriority(run, agent, schedule);

  const boundTargets = await resolveBoundNotificationTargets(
    supabase,
    run.workspace_id,
    ownerLevels,
    eventName,
    event,
  );
  if (boundTargets.length > 0) return boundTargets;

  return resolveScopedNotificationTargets(
    supabase,
    run.workspace_id,
    ownerLevels,
    event,
  );
}

function ownerPriority(
  run: RunRow,
  agent: AgentLite | null,
  schedule: ScheduleLite | null,
): Array<{
  owner_type: "schedule" | "agent" | "navnode" | "business" | "workspace";
  owner_id: string;
}> {
  const businessId =
    run.business_id ?? schedule?.business_id ?? agent?.business_id ?? null;
  const navNodeId =
    run.nav_node_id ?? schedule?.nav_node_id ?? agent?.nav_node_id ?? null;
  return [
    run.schedule_id
      ? { owner_type: "schedule" as const, owner_id: run.schedule_id }
      : null,
    run.agent_id
      ? { owner_type: "agent" as const, owner_id: run.agent_id }
      : null,
    navNodeId ? { owner_type: "navnode" as const, owner_id: navNodeId } : null,
    businessId
      ? { owner_type: "business" as const, owner_id: businessId }
      : null,
    { owner_type: "workspace" as const, owner_id: run.workspace_id },
  ].filter((level): level is NonNullable<typeof level> => level != null);
}

async function resolveBoundNotificationTargets(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  workspaceId: string,
  ownerLevels: Array<{
    owner_type: "schedule" | "agent" | "navnode" | "business" | "workspace";
    owner_id: string;
  }>,
  eventName: "run_done" | "run_fail",
  event: "done" | "failed",
): Promise<GenericNotificationTarget[]> {
  const ownerTypes = [...new Set(ownerLevels.map((level) => level.owner_type))];
  const ownerIds = [...new Set(ownerLevels.map((level) => level.owner_id))];
  const { data: bindings } = await supabase
    .from("notification_bindings")
    .select("owner_type, owner_id, target_id, event_mask")
    .eq("workspace_id", workspaceId)
    .in("owner_type", ownerTypes)
    .in("owner_id", ownerIds);

  const rows = (
    (bindings ?? []) as Array<{
      owner_type: string;
      owner_id: string;
      target_id: string;
      event_mask: string[];
    }>
  ).filter((binding) => (binding.event_mask ?? []).includes(eventName));

  for (const level of ownerLevels) {
    const matches = rows.filter(
      (binding) =>
        binding.owner_type === level.owner_type &&
        binding.owner_id === level.owner_id,
    );
    if (matches.length === 0) continue;
    const targets = await fetchNotificationTargets(
      supabase,
      workspaceId,
      matches.map((binding) => binding.target_id),
      event,
    );
    if (targets.length > 0) return targets;
  }
  return [];
}

async function resolveScopedNotificationTargets(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  workspaceId: string,
  ownerLevels: Array<{
    owner_type: "schedule" | "agent" | "navnode" | "business" | "workspace";
    owner_id: string;
  }>,
  event: "done" | "failed",
): Promise<GenericNotificationTarget[]> {
  const scopeLevels = ownerLevels
    .filter(
      (
        level,
      ): level is {
        owner_type: "navnode" | "business" | "workspace";
        owner_id: string;
      } =>
        level.owner_type === "navnode" ||
        level.owner_type === "business" ||
        level.owner_type === "workspace",
    )
    .map((level) => ({
      scope: level.owner_type,
      scope_id: level.owner_id,
    }));

  const { data } = await supabase
    .from("notification_targets")
    .select(
      "id, workspace_id, provider, scope, scope_id, config, enabled, send_run_done, send_run_fail, send_queue_review, created_at",
    )
    .eq("workspace_id", workspaceId)
    .in("provider", ["slack", "discord"])
    .eq("enabled", true)
    .order("created_at", { ascending: true });

  const allTargets = ((data ?? []) as GenericNotificationTarget[]).filter(
    (target) => targetEnabledForEvent(target, event),
  );

  for (const level of scopeLevels) {
    const matches = allTargets.filter(
      (target) =>
        target.scope === level.scope && target.scope_id === level.scope_id,
    );
    if (matches.length > 0) return dedupeTargets(matches);
  }
  return [];
}

async function fetchNotificationTargets(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  workspaceId: string,
  targetIds: string[],
  event: "done" | "failed",
): Promise<GenericNotificationTarget[]> {
  const ids = [...new Set(targetIds)];
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("notification_targets")
    .select(
      "id, workspace_id, provider, scope, scope_id, config, enabled, send_run_done, send_run_fail, send_queue_review, created_at",
    )
    .eq("workspace_id", workspaceId)
    .in("provider", ["slack", "discord"])
    .eq("enabled", true)
    .in("id", ids)
    .order("created_at", { ascending: true });

  return dedupeTargets(
    ((data ?? []) as GenericNotificationTarget[]).filter((target) =>
      targetEnabledForEvent(target, event),
    ),
  );
}

function targetEnabledForEvent(
  target: GenericNotificationTarget,
  event: "done" | "failed",
): boolean {
  if (event === "done") return target.send_run_done;
  return target.send_run_fail;
}

function dedupeTargets(
  targets: GenericNotificationTarget[],
): GenericNotificationTarget[] {
  const byId = new Map<string, GenericNotificationTarget>();
  for (const target of targets) byId.set(target.id, target);
  return [...byId.values()];
}

async function runLinks(
  supabase: ReturnType<typeof getServiceRoleSupabase>,
  run: RunRow,
): Promise<RunMessageLink[]> {
  const origin = process.env.NEXT_PUBLIC_TRIGGER_ORIGIN ?? "";
  if (!origin) return [];

  const slug = await workspaceSlug(supabase, run.workspace_id);
  if (!slug) return [];

  const links: RunMessageLink[] = [];
  if (run.business_id) {
    links.push({
      label: "Open business",
      url: `${origin}/${slug}/business/${run.business_id}`,
    });
  }
  links.push({ label: "All runs", url: `${origin}/${slug}/runs` });
  return links;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatRunMessage(
  run: RunRow,
  agent: AgentLite | null,
  event: "done" | "failed",
): string {
  return formatRunPlainText({ run, agent, event });
}

function extractText(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  if (typeof o.text === "string") return o.text;
  if (typeof o.message === "string") return o.message;
  return null;
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
