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

export type AioToolContext = {
  workspaceId: string;
  /** When the agent itself is business-scoped, defaults its writes
   *  to that business unless the caller passes business_id explicitly. */
  defaultBusinessId: string | null;
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
        | { type: "todo_set"; items: Array<{ id: string; content: string; status: "pending" | "in_progress" | "completed" }> };
    };

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

      // ── WRITE — gated behind user confirm in the chat panel ──────
      case "create_business":
      case "create_agent":
      case "update_agent":
      case "create_schedule": {
        // Don't execute yet — emit confirm_required and stop the
        // loop. The panel renders an Approve/Cancel chip; on approve
        // the panel re-invokes with a special "confirmed:true"
        // tool_result, then the next chat-route iteration calls a
        // separate executeWriteAioTool path. That second-pass handler
        // ships in a follow-up commit so we don't half-build it.
        return {
          kind: "defer",
          event: {
            type: "confirm_required",
            summary: `Voer ${name} uit met argumenten: ${JSON.stringify(a, null, 2)}`,
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
