import "server-only";

import { dispatchRun } from "../dispatch/runs";
import { getServiceRoleSupabase } from "../supabase/service";

export type NotificationCommandProvider = "telegram" | "slack" | "discord";

export type CommandContext = {
  workspace_id: string;
  provider: NotificationCommandProvider;
  target_id: string | null;
  inbound_id: string | null;
  external_user_id: string | null;
  external_username: string | null;
  reply: (text: string) => Promise<void>;
  markDispatched?: (
    kind: "run" | "queue_decision",
    id: string,
  ) => Promise<void>;
};

export type CommandOutcome = {
  ok: boolean;
  text: string;
  dispatched_to?: "run" | "queue_decision";
  dispatched_id?: string;
};

export async function dispatchNotificationCommand(
  ctx: CommandContext,
  text: string,
): Promise<void> {
  const outcome = await handleNotificationCommand(ctx, text);
  await markDispatched(ctx, outcome);
  await ctx.reply(outcome.text);
}

export async function dispatchNotificationAction(
  ctx: CommandContext,
  action: string,
): Promise<void> {
  const outcome = await handleNotificationAction(ctx, action);
  await markDispatched(ctx, outcome);
  await ctx.reply(outcome.text);
}

export async function handleNotificationCommand(
  ctx: CommandContext,
  text: string,
): Promise<CommandOutcome> {
  const parsed = parseCommand(text);
  if (!parsed) return { ok: true, text: "" };

  switch (parsed.command) {
    case "help":
    case "start":
      return ok(helpText());
    case "status":
      return ok(await statusText(ctx.workspace_id));
    case "agents":
      return ok(await agentsText(ctx.workspace_id));
    case "queue":
      return ok(await queueText(ctx.workspace_id));
    case "run":
      return runByName(ctx, parsed.arg);
    case "approve":
      return decideQueue(ctx.workspace_id, parsed.arg, "approve");
    case "reject":
      return decideQueue(ctx.workspace_id, parsed.arg, "reject");
    default:
      return fail(`Onbekend commando: ${parsed.command}. Gebruik /help.`);
  }
}

export async function handleNotificationAction(
  ctx: CommandContext,
  action: string,
): Promise<CommandOutcome> {
  const [verb, ...rest] = action.split(":");
  const arg = rest.join(":").trim();

  if (verb === "run_again" && arg) return runAgain(ctx, arg);
  if (verb === "approve" && arg)
    return decideQueue(ctx.workspace_id, arg, "approve");
  if (verb === "reject" && arg)
    return decideQueue(ctx.workspace_id, arg, "reject");

  return fail(`Onbekende actie: ${verb || action}.`);
}

function parseCommand(text: string): { command: string; arg: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  const rawHead = parts.shift() ?? "";
  const head = rawHead.replace(/^\/+/, "").split("@")[0]?.toLowerCase() ?? "";

  if (!head) return null;
  if (head === "aio") {
    const next = parts.shift()?.replace(/^\/+/, "").toLowerCase() ?? "help";
    return { command: next, arg: parts.join(" ").trim() };
  }

  return { command: head, arg: parts.join(" ").trim() };
}

async function statusText(workspaceId: string): Promise<string> {
  const supabase = getServiceRoleSupabase();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [businesses, openQueue, failedRuns, recentRuns] = await Promise.all([
    supabase
      .from("businesses")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("archived_at", null),
    supabase
      .from("queue_items")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("state", ["review", "fail"])
      .is("resolved_at", null),
    supabase
      .from("runs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "failed")
      .gte("created_at", since),
    supabase
      .from("runs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", since),
  ]);

  return [
    "AIO Control - Status",
    `Businesses: ${businesses.count ?? 0}`,
    `Queue open: ${openQueue.count ?? 0}`,
    `Runs 24h: ${recentRuns.count ?? 0}`,
    `Failed 24h: ${failedRuns.count ?? 0}`,
  ].join("\n");
}

async function agentsText(workspaceId: string): Promise<string> {
  const supabase = getServiceRoleSupabase();
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, provider, model")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .order("name", { ascending: true })
    .limit(20);

  if (!agents || agents.length === 0) return "Geen agents.";

  const lines = ["Agents:"];
  for (const agent of agents as Array<{
    id: string;
    name: string;
    provider: string;
    model: string | null;
  }>) {
    lines.push(
      `- ${agent.name} (${agent.provider}${agent.model ? ` / ${agent.model}` : ""})`,
    );
  }
  lines.push("", "Start een agent met /run <naam>.");
  return lines.join("\n");
}

async function queueText(workspaceId: string): Promise<string> {
  const supabase = getServiceRoleSupabase();
  const { data: items } = await supabase
    .from("queue_items")
    .select("id, title, state, created_at")
    .eq("workspace_id", workspaceId)
    .in("state", ["review", "fail"])
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!items || items.length === 0) return "Geen open queue items.";

  const lines = ["Queue open:"];
  for (const item of items as Array<{
    id: string;
    title: string;
    state: string;
  }>) {
    lines.push(
      `- ${item.id.slice(0, 8)} [${item.state}] ${truncate(item.title, 80)}`,
    );
  }
  lines.push("", "Gebruik /approve <id> of /reject <id>.");
  return lines.join("\n");
}

async function runByName(
  ctx: CommandContext,
  name: string,
): Promise<CommandOutcome> {
  if (!name) return fail("Geef een agent-naam mee: /run mijn-agent.");

  const supabase = getServiceRoleSupabase();
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, business_id, nav_node_id")
    .eq("workspace_id", ctx.workspace_id)
    .is("archived_at", null)
    .ilike("name", `%${name}%`)
    .limit(5);

  if (!agents || agents.length === 0) {
    return fail(`Geen agent gevonden voor "${name}".`);
  }
  if (agents.length > 1) {
    const matches = (agents as Array<{ id: string; name: string }>)
      .map((agent) => `- ${agent.name}`)
      .join("\n");
    return fail(`Meerdere matches:\n${matches}\n\nWees specifieker.`);
  }

  const agent = agents[0] as {
    id: string;
    name: string;
    business_id: string | null;
    nav_node_id: string | null;
  };

  const { data: run, error } = await supabase
    .from("runs")
    .insert({
      workspace_id: ctx.workspace_id,
      agent_id: agent.id,
      business_id: agent.business_id,
      nav_node_id: agent.nav_node_id ?? null,
      triggered_by: ctx.provider,
      status: "queued",
      input: {
        source: ctx.provider,
        target_id: ctx.target_id,
        external_user_id: ctx.external_user_id,
        external_username: ctx.external_username,
      },
    })
    .select("id")
    .single();

  if (error || !run) {
    return fail(`Insert faalde: ${error?.message ?? "onbekend"}`);
  }

  void dispatchRun(run.id).catch((err) => {
    console.error(`dispatchRun (${ctx.provider}) failed`, err);
  });

  return {
    ok: true,
    text: `Run gestart: ${agent.name} (${run.id.slice(0, 8)}).`,
    dispatched_to: "run",
    dispatched_id: run.id,
  };
}

async function runAgain(
  ctx: CommandContext,
  agentId: string,
): Promise<CommandOutcome> {
  const supabase = getServiceRoleSupabase();
  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, business_id, nav_node_id, archived_at")
    .eq("id", agentId)
    .eq("workspace_id", ctx.workspace_id)
    .maybeSingle();

  if (!agent || agent.archived_at) {
    return fail("Agent niet gevonden of gearchiveerd.");
  }

  const { data: run, error } = await supabase
    .from("runs")
    .insert({
      workspace_id: ctx.workspace_id,
      agent_id: agent.id,
      business_id: agent.business_id,
      nav_node_id: agent.nav_node_id ?? null,
      triggered_by: ctx.provider,
      status: "queued",
      input: {
        source: `${ctx.provider}_action`,
        target_id: ctx.target_id,
        external_user_id: ctx.external_user_id,
        external_username: ctx.external_username,
      },
    })
    .select("id")
    .single();

  if (error || !run) return fail(error?.message ?? "Run insert faalde.");

  void dispatchRun(run.id).catch((err) => {
    console.error(`dispatchRun (${ctx.provider} action) failed`, err);
  });

  return {
    ok: true,
    text: `Run gestart (${run.id.slice(0, 8)}).`,
    dispatched_to: "run",
    dispatched_id: run.id,
  };
}

async function decideQueue(
  workspaceId: string,
  arg: string,
  decision: "approve" | "reject",
): Promise<CommandOutcome> {
  if (!arg) {
    return fail(`Geef het queue id mee: /${decision} <id>.`);
  }

  const supabase = getServiceRoleSupabase();
  const id = arg.trim();
  const query =
    id.length === 36
      ? supabase.from("queue_items").select("id, title").eq("id", id)
      : supabase
          .from("queue_items")
          .select("id, title")
          .eq("workspace_id", workspaceId)
          .ilike("id", `${id}%`);

  const { data, error } = await query.limit(2);
  if (error) return fail(`DB error: ${error.message}`);
  if (!data || data.length === 0) return fail(`Geen item gevonden voor ${id}.`);
  if (data.length > 1) return fail(`Meerdere matches voor ${id}.`);

  const target = data[0] as { id: string; title: string };
  const { error: updateError } = await supabase
    .from("queue_items")
    .update({
      state: "auto",
      decision,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", target.id);

  if (updateError) return fail(`Update faalde: ${updateError.message}`);

  return {
    ok: true,
    text: `${decision === "approve" ? "Approved" : "Rejected"} ${target.id.slice(0, 8)} - ${truncate(target.title, 80)}`,
    dispatched_to: "queue_decision",
    dispatched_id: target.id,
  };
}

async function markDispatched(
  ctx: CommandContext,
  outcome: CommandOutcome,
): Promise<void> {
  if (!outcome.dispatched_to || !outcome.dispatched_id) return;
  if (ctx.markDispatched) {
    await ctx.markDispatched(outcome.dispatched_to, outcome.dispatched_id);
    return;
  }
  if (!ctx.inbound_id) return;

  const supabase = getServiceRoleSupabase();
  await supabase
    .from("notification_inbound")
    .update({
      dispatched_to: outcome.dispatched_to,
      dispatched_id: outcome.dispatched_id,
    })
    .eq("id", ctx.inbound_id);
}

function helpText(): string {
  return [
    "AIO Control - Bot commands",
    "/status - workspace overzicht",
    "/agents - lijst agents",
    "/run <naam> - start een agent",
    "/queue - open queue items",
    "/approve <id> - keur een queue item goed",
    "/reject <id> - wijs een queue item af",
    "/help - deze tekst",
  ].join("\n");
}

function ok(text: string): CommandOutcome {
  return { ok: true, text };
}

function fail(text: string): CommandOutcome {
  return { ok: false, text };
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}
