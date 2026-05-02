// Parses inbound Telegram commands (/run, /approve, /status, …) and
// dispatches them via the service-role Supabase client. Called from
// the inbound webhook AFTER allowlist + persistence so we have a row
// in telegram_inbound to attribute the action to.
//
// Reply text is rendered through the same sendTelegram path so the
// user gets confirmation in the same chat / topic they wrote in.

import "server-only";

import { sendTelegram } from "./telegram";
import { dispatchRun } from "../dispatch/runs";
import { getServiceRoleSupabase } from "../supabase/service";

type InboundCtx = {
  workspace_id: string;
  target_id: string;
  chat_id: string;
  message_thread_id: number | null;
  inbound_id: string;
  text: string;
  from_username: string | null;
};

export async function dispatchTelegramCommand(ctx: InboundCtx): Promise<void> {
  const text = ctx.text.trim();
  if (!text.startsWith("/")) return;

  // Strip @botname suffix Telegram appends in groups: "/run@aio_bot"
  const firstSpace = text.indexOf(" ");
  const head = firstSpace === -1 ? text : text.slice(0, firstSpace);
  const tail = firstSpace === -1 ? "" : text.slice(firstSpace + 1).trim();
  const cmd = head.split("@")[0]?.toLowerCase();
  if (!cmd) return;

  const reply = (body: string, parseMode: "Markdown" | "HTML" = "Markdown") =>
    replyTo(ctx, body, parseMode);

  switch (cmd) {
    case "/help":
    case "/start":
      await reply(helpText());
      return;
    case "/status":
      await reply(await statusText(ctx.workspace_id));
      return;
    case "/agents":
      await reply(await agentsText(ctx.workspace_id));
      return;
    case "/queue":
      await reply(await queueText(ctx.workspace_id));
      return;
    case "/run": {
      const result = await runByName(ctx, tail);
      await reply(result);
      return;
    }
    case "/approve": {
      const result = await decideQueue(ctx.workspace_id, tail, "approve");
      await reply(result);
      return;
    }
    case "/reject": {
      const result = await decideQueue(ctx.workspace_id, tail, "reject");
      await reply(result);
      return;
    }
    default:
      await reply(`Onbekend commando: \`${cmd}\`. Stuur \`/help\`.`);
      return;
  }
}

// ─── command handlers ──────────────────────────────────────────────────────

async function statusText(workspaceId: string): Promise<string> {
  const supabase = getServiceRoleSupabase();
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
      .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    supabase
      .from("runs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
  ]);

  const lines = [
    "*AIO Control · Status*",
    `Businesses: \`${businesses.count ?? 0}\``,
    `Queue (open review/fail): \`${openQueue.count ?? 0}\``,
    `Runs 24h: \`${recentRuns.count ?? 0}\` (failed: \`${failedRuns.count ?? 0}\`)`,
  ];
  return lines.join("\n");
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
  const lines = ["*Agents:*"];
  for (const a of agents as { id: string; name: string; provider: string; model: string | null }[]) {
    lines.push(`• \`${a.name}\` — ${a.provider}${a.model ? ` · ${a.model}` : ""}`);
  }
  lines.push("\nStart één met `/run <naam>`.");
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
  const lines = ["*Queue (open):*"];
  for (const q of items as { id: string; title: string; state: string }[]) {
    const id8 = q.id.slice(0, 8);
    lines.push(`• \`${id8}\` [${q.state}] ${truncate(q.title, 60)}`);
  }
  lines.push("\n`/approve <id>` of `/reject <id>` (eerste 8 tekens van de id).");
  return lines.join("\n");
}

async function runByName(ctx: InboundCtx, name: string): Promise<string> {
  if (!name) return "Geef een agent-naam mee: `/run mijn-agent`.";
  const supabase = getServiceRoleSupabase();
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, business_id")
    .eq("workspace_id", ctx.workspace_id)
    .is("archived_at", null)
    .ilike("name", `%${name}%`)
    .limit(5);

  if (!agents || agents.length === 0) {
    return `Geen agent gevonden voor "${escapeMd(name)}".`;
  }
  if (agents.length > 1) {
    const list = (agents as { id: string; name: string }[])
      .map((a) => `• \`${a.name}\``)
      .join("\n");
    return `Meerdere matches:\n${list}\n\nWees specifieker.`;
  }
  const agent = agents[0] as { id: string; name: string; business_id: string | null };

  // Insert a queued run row, then fire the dispatcher in the background.
  const { data: run, error } = await supabase
    .from("runs")
    .insert({
      workspace_id: ctx.workspace_id,
      agent_id: agent.id,
      business_id: agent.business_id,
      triggered_by: "telegram",
      status: "queued",
      input: {
        source: "telegram",
        from_username: ctx.from_username,
        chat_id: ctx.chat_id,
      },
    })
    .select("id")
    .single();
  if (error || !run) {
    return `Insert faalde: ${error?.message ?? "onbekend"}`;
  }
  void dispatchRun(run.id).catch((err) => {
    console.error("dispatchRun (telegram) failed", err);
  });

  await markDispatched(ctx.inbound_id, "run", run.id);
  return `▶ \`${agent.name}\` start (run \`${run.id.slice(0, 8)}\`).`;
}

async function decideQueue(
  workspaceId: string,
  arg: string,
  decision: "approve" | "reject",
): Promise<string> {
  if (!arg)
    return `Geef het queue id mee: \`/${decision} <id>\` (eerste 8 tekens werkt ook).`;

  const supabase = getServiceRoleSupabase();
  const id = arg.trim();
  // Match on prefix when the user gave the short form.
  const filter =
    id.length === 36
      ? supabase.from("queue_items").select("id, title").eq("id", id)
      : supabase
          .from("queue_items")
          .select("id, title")
          .eq("workspace_id", workspaceId)
          .ilike("id", `${id}%`);
  const { data, error } = await filter.limit(2);
  if (error) return `DB error: ${error.message}`;
  if (!data || data.length === 0) return `Geen item gevonden voor \`${id}\`.`;
  if (data.length > 1) return `Meerdere matches voor \`${id}\` — geef de volledige id.`;

  const target = data[0] as { id: string; title: string };
  const patch =
    decision === "approve"
      ? {
          state: "auto",
          decision: "approve",
          resolved_at: new Date().toISOString(),
        }
      : {
          state: "auto",
          decision: "reject",
          resolved_at: new Date().toISOString(),
        };
  const { error: upErr } = await supabase
    .from("queue_items")
    .update(patch)
    .eq("id", target.id);
  if (upErr) return `Update faalde: ${upErr.message}`;
  return `${decision === "approve" ? "✓" : "✗"} \`${target.id.slice(0, 8)}\` — ${truncate(target.title, 60)}`;
}

// ─── helpers ───────────────────────────────────────────────────────────────

function helpText(): string {
  return [
    "*AIO Control · Bot commands*",
    "/status — workspace overzicht",
    "/agents — lijst agents in deze workspace",
    "/run <naam> — start een agent (naam of substring)",
    "/queue — open queue items met short-id",
    "/approve <id> — keur een queue item goed",
    "/reject <id> — wijs een queue item af",
    "/help — deze tekst",
  ].join("\n");
}

async function replyTo(
  ctx: InboundCtx,
  text: string,
  parseMode: "Markdown" | "HTML",
): Promise<void> {
  const supabase = getServiceRoleSupabase();
  const { data: target } = await supabase
    .from("telegram_targets")
    .select("id, workspace_id, chat_id, topic_id, enabled")
    .eq("id", ctx.target_id)
    .maybeSingle();
  if (!target) return;
  await sendTelegram({
    workspace_id: ctx.workspace_id,
    target,
    text,
    parse_mode: parseMode,
  });
}

async function markDispatched(
  inboundId: string,
  kind: "run" | "queue_decision",
  id: string,
): Promise<void> {
  const supabase = getServiceRoleSupabase();
  await supabase
    .from("telegram_inbound")
    .update({ dispatched_to: kind, dispatched_id: id })
    .eq("id", inboundId);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function escapeMd(s: string): string {
  return s.replace(/[*_`[\]]/g, "\\$&");
}
