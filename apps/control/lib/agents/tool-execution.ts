// Server-side execution of AIO Control function-tools.
//
// The chat-route's tool-dispatch loop calls executeAioTool(name, args,
// ctx) for every tool_use the model emits. READ tools run immediately
// and return JSON; WRITE tools and META tools (ask_followup, …) are
// surfaced to the panel as AG-UI events instead — those return a
// `defer` flag and the loop ends until the user responds.
//
// Tools dispatch through existing server actions / query helpers so
// permissions + audit trails come along for free.

import "server-only";

import { getServiceRoleSupabase } from "../supabase/service";
import { resolveApiKey } from "../api-keys/resolve";

export type AioToolContext = {
  workspaceId: string;
  /** When the agent itself is business-scoped, defaults its writes
   *  to that business unless the caller passes business_id explicitly. */
  defaultBusinessId: string | null;
  /** Optional topic scope inherited from the active agent/run. */
  defaultNavNodeId?: string | null;
  /** Current agent/run attribution for durable review learning. */
  agentId?: string | null;
  runId?: string | null;
  /** Present for interactive chat turns so meta tools can write back to
   *  the same thread after the stream has closed. */
  chatThreadId?: string | null;
};

export type AioToolResult =
  | { kind: "ok"; data: unknown }
  | { kind: "error"; error: string }
  /**
   * Defer to the chat panel. The loop should emit the appropriate
   * AG-UI event (ask_followup / confirm_required / open_ui_at) and
   * stop streaming — the user's next request resumes the loop.
   */
  | {
      kind: "defer";
      event:
        | { type: "ask_followup"; question: string; options?: { label: string; description?: string }[] }
        | { type: "confirm_required"; summary: string; kind: string; pending: { name: string; args: unknown } }
        | { type: "open_ui_at"; path: string; label?: string }
        | { type: "todo_set"; items: Array<{ id: string; content: string; status: "pending" | "in_progress" | "completed" }> }
        | { type: "chat_ping_scheduled"; delayMinutes: number; message: string };
    };

function redactedDatabaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "(set, redacted)";
  }
}

function envVar(name: string): string | undefined {
  return process.env[name];
}

function getSupabaseContextForTool(ctx: AioToolContext): Record<string, unknown> {
  const supabaseUrl =
    envVar("SUPABASE_URL") ?? envVar("NEXT_PUBLIC_SUPABASE_URL") ?? null;
  const schema = envVar("AIO_SUPABASE_SCHEMA") ?? "aio_control";
  const restUrl = supabaseUrl ? `${supabaseUrl.replace(/\/+$/, "")}/rest/v1` : null;
  const databaseUrl = envVar("DATABASE_URL");
  return {
    ok: true,
    scope: {
      workspace_id: ctx.workspaceId,
      business_id: ctx.defaultBusinessId,
      nav_node_id: ctx.defaultNavNodeId ?? null,
      agent_id: ctx.agentId ?? null,
      run_id: ctx.runId ?? null,
    },
    supabase: {
      kind: "local_aio_control_supabase",
      url: supabaseUrl,
      rest_url: restUrl,
      schema,
      service_role_client_available: true,
      service_role_key_returned: false,
      postgres: {
        database_url_env: databaseUrl ? "DATABASE_URL is set" : null,
        database_url_redacted: redactedDatabaseUrl(databaseUrl),
        psql_command:
          envVar("AIO_SUPABASE_PSQL_COMMAND") ??
          "docker exec -i supabase-db psql -U postgres -d postgres",
      },
      rest_headers_for_aio_control_schema: {
        "Accept-Profile": schema,
        "Content-Profile": schema,
      },
    },
    rules: [
      "Use AIO Control tools for normal platform reads/writes; they already use service-role Supabase scoped to this workspace.",
      `Most domain tables live in schema '${schema}'. Direct REST calls without Accept-Profile/Content-Profile can 404 even when the table exists.`,
      "For improvements, use propose_improvement/aio__propose_improvement instead of direct REST inserts when available.",
      "For direct SQL inspection, keep queries scoped by workspace_id/business_id/nav_node_id and read-only unless a safe write is explicitly required.",
    ],
  };
}

export async function executeAioTool(
  name: string,
  args: unknown,
  ctx: AioToolContext,
): Promise<AioToolResult> {
  const a = (args ?? {}) as Record<string, unknown>;
  const admin = getServiceRoleSupabase();

  try {
    switch (name) {
      // ── READ ─────────────────────────────────────────────────────
      case "list_businesses": {
        const { data, error } = await admin
          .from("businesses")
          .select(
            "id, name, sub, status, description, mission, color_hex, icon, isolated",
          )
          .eq("workspace_id", ctx.workspaceId)
          .is("archived_at", null)
          .order("created_at", { ascending: true });
        if (error) return { kind: "error", error: error.message };
        return { kind: "ok", data: data ?? [] };
      }

      case "get_supabase_context": {
        return { kind: "ok", data: getSupabaseContextForTool(ctx) };
      }

      case "list_agents": {
        const scope = (a.scope as string | undefined) ?? "all";
        let q = admin
          .from("agents")
          .select(
            "id, business_id, name, kind, provider, model, key_source, allowed_tools",
          )
          .eq("workspace_id", ctx.workspaceId)
          .is("archived_at", null);
        if (scope === "global") q = q.is("business_id", null);
        if (scope === "business") q = q.not("business_id", "is", null);
        if (a.business_id) q = q.eq("business_id", String(a.business_id));
        const { data, error } = await q.order("created_at", { ascending: true });
        if (error) return { kind: "error", error: error.message };
        return { kind: "ok", data: data ?? [] };
      }

      case "list_nav_nodes": {
        let q = admin
          .from("nav_nodes")
          .select("id, business_id, parent_id, slug, name, sub, href, sort_order")
          .eq("workspace_id", ctx.workspaceId)
          .is("archived_at", null)
          .order("sort_order", { ascending: true });
        if (a.business_id) q = q.eq("business_id", String(a.business_id));
        const { data, error } = await q;
        if (error) return { kind: "error", error: error.message };
        const decorated = await decorateNavNodesForTools(
          ctx.workspaceId,
          (data ?? []) as ToolNavNode[],
        );
        const search = typeof a.search === "string" ? normalizeToolLookup(a.search) : "";
        const filtered = search
          ? decorated.filter((node) =>
              [node.name, node.slug, node.sub, node.path, node.business_name]
                .filter(Boolean)
                .some((value) =>
                  normalizeToolLookup(String(value)).includes(search),
                ),
            )
          : decorated;
        return { kind: "ok", data: filtered };
      }

      case "resolve_topic": {
        const business = String(a.business ?? "").trim();
        const topic = String(a.topic ?? "").trim();
        if (!business || !topic) {
          return {
            kind: "error",
            error: "resolve_topic needs `business` and `topic`.",
          };
        }
        const resolved = await resolveTopicForTools(
          ctx.workspaceId,
          business,
          topic,
        );
        if ("error" in resolved) {
          return { kind: "error", error: String(resolved.error) };
        }
        return { kind: "ok", data: resolved };
      }

      case "list_integrations": {
        const { data, error } = await admin
          .from("integrations")
          .select("id, business_id, provider, name, status, last_refresh_at")
          .eq("workspace_id", ctx.workspaceId)
          .order("provider", { ascending: true });
        if (error) return { kind: "error", error: error.message };
        return { kind: "ok", data: data ?? [] };
      }

      case "list_schedules": {
        let q = admin
          .from("schedules")
          .select(
            "id, agent_id, business_id, kind, cron_expr, enabled, last_fired_at, title",
          )
          .eq("workspace_id", ctx.workspaceId);
        if (a.business_id) q = q.eq("business_id", String(a.business_id));
        const { data, error } = await q.order("created_at", { ascending: false });
        if (error) return { kind: "error", error: error.message };
        return { kind: "ok", data: data ?? [] };
      }

      case "list_runs": {
        const limit = Math.min(Number(a.limit ?? 20), 100);
        let q = admin
          .from("runs")
          .select(
            "id, business_id, agent_id, schedule_id, triggered_by, status, started_at, ended_at, duration_ms, cost_cents, error_text",
          )
          .eq("workspace_id", ctx.workspaceId);
        if (a.business_id) q = q.eq("business_id", String(a.business_id));
        if (a.agent_id) q = q.eq("agent_id", String(a.agent_id));
        if (a.status) q = q.eq("status", String(a.status));
        const { data, error } = await q
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return { kind: "error", error: error.message };
        return { kind: "ok", data: data ?? [] };
      }

      case "list_review_learnings": {
        const limit = Math.min(Math.max(Number(a.limit ?? 10), 1), 50);
        const businessId =
          typeof a.business_id === "string"
            ? a.business_id
            : ctx.defaultBusinessId;
        const navNodeId =
          typeof a.nav_node_id === "string"
            ? a.nav_node_id
            : ctx.defaultNavNodeId;
        const agentId = typeof a.agent_id === "string" ? a.agent_id : null;
        const outcome = typeof a.outcome === "string" ? a.outcome : null;
        const { data, error } = await admin
          .from("agent_review_lessons")
          .select(
            "id, business_id, nav_node_id, agent_id, queue_item_id, lesson_type, outcome, confidence, title, body, payload, created_at",
          )
          .eq("workspace_id", ctx.workspaceId)
          .order("created_at", { ascending: false })
          .limit(Math.max(limit * 4, limit));
        if (error) return { kind: "error", error: error.message };
        const rows = ((data ?? []) as Array<Record<string, unknown>>)
          .filter((row) =>
            !businessId ||
            row.business_id == null ||
            row.business_id === businessId,
          )
          .filter((row) =>
            !navNodeId ||
            row.nav_node_id == null ||
            row.nav_node_id === navNodeId,
          )
          .filter((row) => !agentId || row.agent_id === agentId)
          .filter((row) => !outcome || row.outcome === outcome)
          .slice(0, limit);
        return { kind: "ok", data: rows };
      }

      case "get_workspace_settings": {
        const { data, error } = await admin
          .from("workspaces")
          .select(
            "id, slug, name, default_provider, default_model, default_system_prompt, telegram_topology",
          )
          .eq("id", ctx.workspaceId)
          .maybeSingle();
        if (error) return { kind: "error", error: error.message };
        return { kind: "ok", data };
      }

      case "read_secret": {
        const name = String(a.name ?? "").trim();
        if (!name)
          return {
            kind: "error",
            error: "read_secret needs a `name` (e.g. AIRTABLE_API_KEY).",
          };
        // Resolve through the same tier-resolver the rest of the app
        // uses — navnode → business → workspace → env. Custom secrets
        // live alongside provider keys in api_keys (kind='custom') so
        // resolveApiKey already finds them.
        const value = await resolveApiKey(name, {
          workspaceId: ctx.workspaceId,
          businessId: ctx.defaultBusinessId,
        });
        // Returning value: null is the explicit "not configured" signal
        // the model can branch on without exception-handling.
        return { kind: "ok", data: { value: value ?? null } };
      }

      // ── META (UI side-effects) ───────────────────────────────────
      case "ask_followup": {
        const question = String(a.question ?? "").trim();
        if (!question) return { kind: "error", error: "ask_followup needs a `question`." };
        type Opt = { label: string; description?: string };
        const options = Array.isArray(a.options)
          ? (a.options as unknown[])
              .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
              .map((o) => ({
                label: String((o as Record<string, unknown>).label ?? ""),
                description:
                  typeof (o as Record<string, unknown>).description === "string"
                    ? (o as Record<string, unknown>).description as string
                    : undefined,
              }))
              .filter((o: Opt) => !!o.label)
          : undefined;
        return {
          kind: "defer",
          event: { type: "ask_followup", question, options },
        };
      }

      case "todo_set": {
        const items = Array.isArray(a.items)
          ? (a.items as unknown[])
              .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
              .map((i) => ({
                id: String((i as Record<string, unknown>).id ?? ""),
                content: String((i as Record<string, unknown>).content ?? ""),
                status: ((s) =>
                  s === "in_progress" || s === "completed" ? s : "pending")(
                  (i as Record<string, unknown>).status as string,
                ) as "pending" | "in_progress" | "completed",
              }))
              .filter((i) => i.id && i.content)
          : [];
        return {
          kind: "defer",
          event: { type: "todo_set", items },
        };
      }

      case "open_ui_at": {
        const path = String(a.path ?? "").trim();
        if (!path) return { kind: "error", error: "open_ui_at needs a `path`." };
        const label = typeof a.label === "string" ? a.label : undefined;
        return { kind: "defer", event: { type: "open_ui_at", path, label } };
      }

      case "schedule_chat_ping": {
        const delayMinutes = Number(a.delay_minutes ?? 0);
        const message = String(a.message ?? "").trim();
        if (!ctx.chatThreadId) {
          return {
            kind: "error",
            error: "schedule_chat_ping werkt alleen in een actieve chat-thread.",
          };
        }
        if (!Number.isFinite(delayMinutes) || delayMinutes <= 0) {
          return {
            kind: "error",
            error: "schedule_chat_ping needs delay_minutes > 0.",
          };
        }
        if (!message) {
          return { kind: "error", error: "schedule_chat_ping needs a message." };
        }
        scheduleChatPing(ctx.chatThreadId, delayMinutes, message);
        return {
          kind: "defer",
          event: { type: "chat_ping_scheduled", delayMinutes, message },
        };
      }

      // ── WRITE — gated behind user confirm in the chat panel ──────
      // First-pass: defer with confirm_required. The chat-route's
      // approve_tool path re-enters via executeAioWriteTool below
      // when the user clicks Approve.
      case "request_human_review": {
        const created = await createHumanReviewItem(a, ctx);
        if ("error" in created) return { kind: "error", error: created.error };
        return { kind: "ok", data: created };
      }

      case "create_business":
      case "create_agent":
      case "update_agent":
      case "create_schedule": {
        return {
          kind: "defer",
          event: {
            type: "confirm_required",
            summary: humanizeWriteSummary(name, a),
            kind: name,
            pending: { name, args: a },
          },
        };
      }

      default:
        return { kind: "error", error: `Onbekend tool: ${name}` };
    }
  } catch (err) {
    return {
      kind: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function createHumanReviewItem(
  a: Record<string, unknown>,
  ctx: AioToolContext,
): Promise<
  | {
      ok: true;
      queue_item_id: string;
      lesson_id: string | null;
      state: "review" | "fail";
      queue_path: string | null;
    }
  | { error: string }
> {
  const title = cleanReviewText(a.title, 160);
  const reason = cleanReviewText(a.reason, 2_000);
  if (!title) return { error: "request_human_review needs a title." };
  if (!reason) return { error: "request_human_review needs a reason." };

  const scope = await resolveHumanReviewScope(ctx.workspaceId, {
    businessId:
      typeof a.business_id === "string" ? a.business_id : ctx.defaultBusinessId,
    navNodeId:
      typeof a.nav_node_id === "string" ? a.nav_node_id : ctx.defaultNavNodeId,
  });
  if ("error" in scope) return { error: scope.error };

  const admin = getServiceRoleSupabase();
  const state = a.state === "fail" ? "fail" : "review";
  const riskLevel =
    a.risk_level === "low" || a.risk_level === "high"
      ? a.risk_level
      : "medium";
  const confidence = clamp01(Number(a.confidence ?? 0.5));
  const proposedAction = cleanReviewText(a.proposed_action, 2_000);
  const extraPayload =
    a.payload && typeof a.payload === "object" && !Array.isArray(a.payload)
      ? (a.payload as Record<string, unknown>)
      : {};
  const payload = {
    source: "agent_uncertainty",
    reason,
    proposed_action: proposedAction || null,
    risk_level: riskLevel,
    confidence,
    agent_id: ctx.agentId ?? null,
    run_id: ctx.runId ?? null,
    chat_thread_id: ctx.chatThreadId ?? null,
    context: extraPayload,
  };
  const metaParts = [
    `${riskLevel} risk`,
    `${Math.round(confidence * 100)}% confidence`,
    reason,
  ];

  const { data: queueItem, error: queueError } = await admin
    .from("queue_items")
    .insert({
      workspace_id: ctx.workspaceId,
      business_id: scope.businessId,
      nav_node_id: scope.navNodeId,
      agent_id: ctx.agentId ?? null,
      state,
      confidence,
      title,
      meta: cleanReviewText(metaParts.filter(Boolean).join(" - "), 500),
      payload,
    })
    .select("id")
    .single();
  if (queueError || !queueItem) {
    return { error: queueError?.message ?? "queue item insert failed" };
  }

  const { data: lesson, error: lessonError } = await admin
    .from("agent_review_lessons")
    .insert({
      workspace_id: ctx.workspaceId,
      business_id: scope.businessId,
      nav_node_id: scope.navNodeId,
      agent_id: ctx.agentId ?? null,
      run_id: ctx.runId ?? null,
      queue_item_id: queueItem.id,
      lesson_type: "uncertainty",
      outcome: "pending",
      confidence,
      title: `Review requested: ${title}`,
      body: proposedAction
        ? `${reason}\n\nProposed action: ${proposedAction}`
        : reason,
      payload,
    })
    .select("id")
    .maybeSingle();
  if (lessonError) {
    console.error("agent_review_lessons insert failed", lessonError);
  }

  const { data: workspace } = await admin
    .from("workspaces")
    .select("slug")
    .eq("id", ctx.workspaceId)
    .maybeSingle();

  return {
    ok: true,
    queue_item_id: queueItem.id as string,
    lesson_id: (lesson?.id as string | undefined) ?? null,
    state,
    queue_path: workspace?.slug ? `/${workspace.slug}/queue` : null,
  };
}

async function resolveHumanReviewScope(
  workspaceId: string,
  input: { businessId?: string | null; navNodeId?: string | null },
): Promise<{ businessId: string; navNodeId: string | null } | { error: string }> {
  const admin = getServiceRoleSupabase();
  let businessId = input.businessId ?? null;
  const navNodeId = input.navNodeId ?? null;

  if (navNodeId) {
    const { data: node, error } = await admin
      .from("nav_nodes")
      .select("id, business_id")
      .eq("workspace_id", workspaceId)
      .eq("id", navNodeId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!node) return { error: "nav_node_id not found in current workspace." };
    const nodeBusinessId = node.business_id as string;
    if (businessId && businessId !== nodeBusinessId) {
      return { error: "nav_node_id belongs to a different business_id." };
    }
    businessId = nodeBusinessId;
  }

  if (businessId) {
    const { data: business, error } = await admin
      .from("businesses")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", businessId)
      .is("archived_at", null)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!business) {
      return { error: "business_id not found in current workspace." };
    }
    return { businessId, navNodeId };
  }

  const { data: businesses, error } = await admin
    .from("businesses")
    .select("id")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .limit(2);
  if (error) return { error: error.message };
  if ((businesses ?? []).length === 1) {
    return { businessId: businesses![0]!.id as string, navNodeId };
  }
  return {
    error:
      "request_human_review needs business_id because this workspace has multiple businesses and the agent is not business-scoped.",
  };
}

function cleanReviewText(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > max ? text.slice(0, max - 1) + "..." : text;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

export function scheduleChatPing(
  threadId: string,
  delayMinutes: number,
  message: string,
): void {
  const delayMs = Math.min(Math.round(delayMinutes * 60_000), 24 * 60 * 60_000);
  const dueAt = new Date(Date.now() + Math.max(delayMs, 1_000)).toISOString();
  const admin = getServiceRoleSupabase();

  void admin
    .from("chat_scheduled_messages")
    .insert({
      thread_id: threadId,
      message,
      due_at: dueAt,
    })
    .select("id")
    .single()
    .then(({ data, error }) => {
      if (error || !data) {
        console.error("schedule_chat_ping enqueue failed", error);
        setTimeout(() => {
          void insertScheduledPingMessage(threadId, message);
        }, Math.max(delayMs, 1_000));
        return;
      }
      const scheduledId = data.id as string;
      setTimeout(() => {
        void deliverScheduledChatPing(scheduledId);
      }, Math.max(delayMs, 1_000));
    });
}

export async function deliverDueChatPings(limit = 50): Promise<void> {
  const admin = getServiceRoleSupabase();
  const { data, error } = await admin
    .from("chat_scheduled_messages")
    .select("id")
    .is("delivered_at", null)
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("deliverDueChatPings query failed", error);
    return;
  }
  for (const row of data ?? []) {
    await deliverScheduledChatPing(row.id as string);
  }
}

async function deliverScheduledChatPing(id: string): Promise<void> {
  const admin = getServiceRoleSupabase();
  const { data: claimed, error: claimError } = await admin
    .from("chat_scheduled_messages")
    .update({ delivered_at: new Date().toISOString() })
    .eq("id", id)
    .is("delivered_at", null)
    .lte("due_at", new Date().toISOString())
    .select("thread_id, message")
    .maybeSingle();
  if (claimError) {
    console.error("deliverScheduledChatPing claim failed", claimError);
    return;
  }
  if (!claimed) return;
  const delivered = await insertScheduledPingMessage(
    claimed.thread_id as string,
    claimed.message as string,
  );
  if (!delivered) {
    await admin
      .from("chat_scheduled_messages")
      .update({ delivered_at: null })
      .eq("id", id);
  }
}

async function insertScheduledPingMessage(
  threadId: string,
  message: string,
): Promise<boolean> {
  const admin = getServiceRoleSupabase();
  const { error } = await admin.from("chat_messages").insert({
    thread_id: threadId,
    role: "assistant",
    content: {
      text: message,
      kind: "scheduled_ping",
      scheduled_for: new Date().toISOString(),
    },
  });
  if (error) {
    console.error("schedule_chat_ping insert failed", error);
    return false;
  }
  await admin
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId);
  return true;
}

/**
 * Second-pass execution for write tools, called by the chat-route
 * AFTER the user clicks Approve on a confirm_required card. Bypasses
 * the defer path and actually runs the underlying server action.
 */
export async function executeAioWriteTool(
  name: string,
  args: unknown,
  ctx: AioToolContext,
): Promise<AioToolResult> {
  const a = (args ?? {}) as Record<string, unknown>;

  // Lazy-import the server actions so the AI package can stay free of
  // app-layer deps. Same module-graph trick the dispatcher uses.
  try {
    switch (name) {
      case "create_business": {
        const { createBusiness } = await import(
          "../../app/actions/businesses"
        );
        const slugRow = await getServiceRoleSupabase()
          .from("workspaces")
          .select("slug")
          .eq("id", ctx.workspaceId)
          .maybeSingle();
        const slug = slugRow.data?.slug as string | undefined;
        if (!slug)
          return { kind: "error", error: "Workspace slug niet gevonden." };
        const res = await createBusiness({
          workspace_slug: slug,
          workspace_id: ctx.workspaceId,
          name: String(a.name ?? "").trim(),
          sub: typeof a.sub === "string" ? a.sub : undefined,
          variant: typeof a.variant === "string" ? a.variant : undefined,
          icon: typeof a.icon === "string" ? a.icon : undefined,
          description:
            typeof a.description === "string" ? a.description : undefined,
          mission: typeof a.mission === "string" ? a.mission : undefined,
        });
        if (!res.ok) return { kind: "error", error: res.error };
        return { kind: "ok", data: res.data };
      }

      case "create_agent": {
        const { createAgent } = await import("../../app/actions/agents");
        const slugRow = await getServiceRoleSupabase()
          .from("workspaces")
          .select("slug")
          .eq("id", ctx.workspaceId)
          .maybeSingle();
        const slug = slugRow.data?.slug as string | undefined;
        if (!slug)
          return { kind: "error", error: "Workspace slug niet gevonden." };
        const res = await createAgent({
          workspace_slug: slug,
          workspace_id: ctx.workspaceId,
          business_id:
            (a.business_id as string | null | undefined) ??
            ctx.defaultBusinessId,
          name: String(a.name ?? "").trim(),
          provider: a.provider as Parameters<typeof createAgent>[0]["provider"],
          kind: a.kind as Parameters<typeof createAgent>[0]["kind"],
          model: typeof a.model === "string" ? a.model : undefined,
          systemPrompt:
            typeof a.systemPrompt === "string" ? a.systemPrompt : undefined,
          key_source: a.key_source as
            | "subscription"
            | "api_key"
            | "env"
            | undefined,
        });
        if (!res.ok) return { kind: "error", error: res.error };
        return { kind: "ok", data: res.data };
      }

      case "update_agent": {
        const { updateAgent } = await import("../../app/actions/agents");
        const slugRow = await getServiceRoleSupabase()
          .from("workspaces")
          .select("slug")
          .eq("id", ctx.workspaceId)
          .maybeSingle();
        const slug = slugRow.data?.slug as string | undefined;
        if (!slug)
          return { kind: "error", error: "Workspace slug niet gevonden." };
        const patch = (a.patch ?? {}) as Record<string, unknown>;
        const res = await updateAgent({
          workspace_slug: slug,
          business_id: ctx.defaultBusinessId,
          id: String(a.agent_id ?? ""),
          patch: {
            name: typeof patch.name === "string" ? patch.name : undefined,
            model: typeof patch.model === "string" ? patch.model : undefined,
            systemPrompt:
              typeof patch.systemPrompt === "string"
                ? patch.systemPrompt
                : undefined,
            kind: patch.kind as Parameters<
              typeof updateAgent
            >[0]["patch"]["kind"],
          },
        });
        if (!res.ok) return { kind: "error", error: res.error };
        return { kind: "ok", data: res.data };
      }

      case "create_schedule": {
        const { createCronSchedule, createWebhookSchedule, createManualSchedule } =
          await import("../../app/actions/schedules");
        const slugRow = await getServiceRoleSupabase()
          .from("workspaces")
          .select("slug")
          .eq("id", ctx.workspaceId)
          .maybeSingle();
        const slug = slugRow.data?.slug as string | undefined;
        if (!slug)
          return { kind: "error", error: "Workspace slug niet gevonden." };
        const kind = (a.kind as string) ?? "manual";
        if (kind === "cron") {
          const res = await createCronSchedule({
            workspace_slug: slug,
            workspace_id: ctx.workspaceId,
            agent_id: String(a.agent_id ?? ""),
            business_id: ctx.defaultBusinessId,
            cron_expr: String(a.cron_expr ?? ""),
            prompt: String(a.prompt ?? ""),
            title: typeof a.title === "string" ? a.title : null,
          });
          if (!res.ok) return { kind: "error", error: res.error };
          return { kind: "ok", data: res.data };
        }
        if (kind === "webhook") {
          const res = await createWebhookSchedule({
            workspace_slug: slug,
            workspace_id: ctx.workspaceId,
            agent_id: String(a.agent_id ?? ""),
            business_id: ctx.defaultBusinessId,
          });
          if (!res.ok) return { kind: "error", error: res.error };
          return { kind: "ok", data: res.data };
        }
        const res = await createManualSchedule({
          workspace_slug: slug,
          workspace_id: ctx.workspaceId,
          agent_id: String(a.agent_id ?? ""),
          business_id: ctx.defaultBusinessId,
        });
        if (!res.ok) return { kind: "error", error: res.error };
        return { kind: "ok", data: res.data };
      }

      default:
        return { kind: "error", error: `Onbekend write-tool: ${name}` };
    }
  } catch (err) {
    return {
      kind: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Pretty-print the args block for the confirm card. JSON works but
 *  is dense; pull the most relevant fields out for human readers. */
function humanizeWriteSummary(name: string, a: Record<string, unknown>): string {
  const lines: string[] = [`Tool: ${name}`];
  for (const [k, v] of Object.entries(a)) {
    if (typeof v === "string" && v.length < 120) lines.push(`  ${k}: ${v}`);
    else if (v == null) lines.push(`  ${k}: —`);
    else lines.push(`  ${k}: ${JSON.stringify(v)}`);
  }
  return lines.join("\n");
}

type ToolNavNode = {
  id: string;
  business_id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  sub: string | null;
  href: string | null;
  sort_order: number;
};

function normalizeToolLookup(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function decorateNavNodesForTools(
  workspaceId: string,
  nodes: ToolNavNode[],
) {
  const admin = getServiceRoleSupabase();
  const businessIds = Array.from(new Set(nodes.map((n) => n.business_id)));
  const { data: businesses } =
    businessIds.length === 0
      ? { data: [] }
      : await admin
          .from("businesses")
          .select("id, name, slug")
          .eq("workspace_id", workspaceId)
          .in("id", businessIds);
  const businessById = new Map(
    (businesses ?? []).map((b) => [
      b.id as string,
      { name: b.name as string, slug: b.slug as string | null },
    ]),
  );
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  function pathFor(node: ToolNavNode): string {
    const parts: string[] = [];
    let current: ToolNavNode | undefined = node;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      parts.unshift(current.slug);
      current = current.parent_id ? nodeById.get(current.parent_id) : undefined;
    }
    return parts.join("/");
  }

  return nodes.map((node) => {
    const business = businessById.get(node.business_id);
    return {
      ...node,
      business_name: business?.name ?? null,
      business_slug: business?.slug ?? null,
      path: pathFor(node),
    };
  });
}

async function resolveTopicForTools(
  workspaceId: string,
  businessRef: string,
  topicRef: string,
) {
  const admin = getServiceRoleSupabase();
  const businessNeedle = normalizeToolLookup(businessRef);
  const topicNeedle = normalizeToolLookup(topicRef);
  const { data: businesses, error: bizError } = await admin
    .from("businesses")
    .select("id, name, slug, sub")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (bizError) return { error: bizError.message };
  const businessMatches = (businesses ?? []).filter((b) =>
    [b.id, b.name, b.slug, b.sub]
      .filter(Boolean)
      .some((value) => normalizeToolLookup(String(value)).includes(businessNeedle)),
  );
  if (businessMatches.length === 0) {
    return { error: `Business '${businessRef}' not found.` };
  }
  if (businessMatches.length > 1) {
    return { error: `Business '${businessRef}' is ambiguous.` };
  }

  const business = businessMatches[0]!;
  const { data: nodes, error: nodeError } = await admin
    .from("nav_nodes")
    .select("id, business_id, parent_id, slug, name, sub, href, sort_order")
    .eq("workspace_id", workspaceId)
    .eq("business_id", business.id)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (nodeError) return { error: nodeError.message };
  const decorated = await decorateNavNodesForTools(
    workspaceId,
    (nodes ?? []) as ToolNavNode[],
  );
  const matches = decorated.filter((node) =>
    [node.id, node.name, node.slug, node.sub, node.path]
      .filter(Boolean)
      .some((value) => normalizeToolLookup(String(value)).includes(topicNeedle)),
  );
  if (matches.length === 0) {
    return { error: `Topic '${topicRef}' not found in '${business.name}'.` };
  }
  const exact =
    matches.find((node) => normalizeToolLookup(node.name) === topicNeedle) ??
    matches.find((node) => normalizeToolLookup(node.slug) === topicNeedle) ??
    matches.find((node) => normalizeToolLookup(node.path) === topicNeedle);
  if (!exact && matches.length > 1) {
    return { error: `Topic '${topicRef}' is ambiguous in '${business.name}'.` };
  }
  const topic = exact ?? matches[0]!;
  return {
    business_id: business.id as string,
    business_name: business.name as string,
    business_slug: (business.slug as string | null) ?? null,
    nav_node_id: topic.id,
    topic_name: topic.name,
    topic_slug: topic.slug,
    topic_path: topic.path,
  };
}
