// Builds the COMPLETE preamble that gets prepended to every agent's
// system prompt — across chat, scheduled cron, webhook triggers, and
// manual run-now. One source of truth so every agent knows:
//   - that it lives inside AIO Control (the platform)
//   - who it itself is (name, kind, provider, model, scope)
//   - which integrations are connected in this workspace
//   - which other agents exist alongside it
//   - the active business (if any) — description, mission, targets
//   - workspace-wide rules
//   - the current spend / budget snapshot
//
// Replaces the older `business-context.ts` (which only knew about
// businesses). The old file re-exports buildBusinessContextPrefix
// for backwards compat — new callers should use buildAgentSystemPrompt.

import "server-only";

import { getServiceRoleSupabase } from "../supabase/service";
import { getSpendSnapshot } from "../dispatch/spend-limit";

type Target = {
  id?: string;
  name?: string;
  target?: string;
  current?: string;
  deadline?: string | null;
  status?: "open" | "done" | "abandoned";
};

type AgentLike = {
  id: string;
  workspace_id: string;
  business_id: string | null;
  name: string;
  kind: string;
  provider: string;
  model?: string | null;
};

/**
 * Build the full system-prompt preamble for an agent run. Pass the
 * agent row (the dispatcher already loads it) — we'll fetch the
 * surrounding context (business, integrations, siblings, spend) and
 * stitch it into a single markdown block.
 *
 * The caller is responsible for combining this with the agent's
 * user-supplied `config.systemPrompt` (typically:
 * `${preamble}\n\n---\n\n${agent.config.systemPrompt}`).
 */
export async function buildAgentSystemPrompt(
  agent: AgentLike,
): Promise<string> {
  const admin = getServiceRoleSupabase();

  // Fan out the lookups in parallel — single round-trip total.
  const [bizRes, wsRes, integrations, siblings, spend] = await Promise.all([
    agent.business_id
      ? admin
          .from("businesses")
          .select("name, sub, description, mission, targets")
          .eq("id", agent.business_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("workspaces")
      .select("name, default_system_prompt")
      .eq("id", agent.workspace_id)
      .maybeSingle(),
    admin
      .from("integrations")
      .select("provider, name, status, business_id")
      .eq("workspace_id", agent.workspace_id)
      .eq("status", "connected"),
    admin
      .from("agents")
      .select("id, name, kind, provider, business_id")
      .eq("workspace_id", agent.workspace_id)
      .is("archived_at", null)
      .neq("id", agent.id),
    agent.business_id ? getSpendSnapshot(agent.business_id) : Promise.resolve(null),
  ]);

  const lines: string[] = [];

  // ── Platform context ───────────────────────────────────────────────
  lines.push("# Platform context");
  lines.push(
    "Je bent een AI-agent die binnen **AIO Control** draait — een agent " +
      "command center voor solo operators (built by TrompTech). De " +
      "gebruiker beheert hier meerdere mini-businesses met agents zoals " +
      "jij. Je hebt potentieel toegang tot tools, integrations en andere " +
      "agents in deze workspace; gebruik die context i.p.v. te raden of " +
      "te vragen welk systeem je draait.",
  );

  // ── Wie ben jij ────────────────────────────────────────────────────
  lines.push("");
  lines.push("## Wie ben jij");
  lines.push(`- Naam: **${agent.name}**`);
  lines.push(`- Type: ${agent.kind}`);
  lines.push(
    `- Provider: ${agent.provider}` +
      (agent.model ? ` · Model: ${agent.model}` : ""),
  );
  if (!agent.business_id) {
    lines.push(`- Scope: **workspace-global** (niet aan een business gekoppeld)`);
  }

  // ── Beschikbare integrations ───────────────────────────────────────
  type IntegrationRow = {
    provider: string;
    name: string | null;
    status: string;
    business_id: string | null;
  };
  const allIntegrations = (integrations.data ?? []) as IntegrationRow[];
  const relevantIntegrations = agent.business_id
    ? allIntegrations.filter(
        (i) => i.business_id === null || i.business_id === agent.business_id,
      )
    : allIntegrations.filter((i) => i.business_id === null);
  if (relevantIntegrations.length > 0) {
    lines.push("");
    lines.push("## Beschikbare integrations (connected)");
    for (const i of relevantIntegrations) {
      lines.push(`- ${i.provider}${i.name ? ` — ${i.name}` : ""}`);
    }
  }

  // ── Andere agents ──────────────────────────────────────────────────
  type SiblingRow = {
    id: string;
    name: string;
    kind: string;
    provider: string;
    business_id: string | null;
  };
  const sibs = (siblings.data ?? []) as SiblingRow[];
  if (sibs.length > 0) {
    lines.push("");
    lines.push("## Andere agents in deze workspace");
    for (const s of sibs.slice(0, 30)) {
      const scope = s.business_id ? `business ${s.business_id.slice(0, 8)}` : "global";
      lines.push(`- "${s.name}" (${s.provider} · ${s.kind}, ${scope})`);
    }
    if (sibs.length > 30) {
      lines.push(`- … plus ${sibs.length - 30} more`);
    }
  }

  // ── Budget context ─────────────────────────────────────────────────
  if (spend) {
    lines.push("");
    lines.push("## Budget context (deze business)");
    if (spend.daily_limit_cents != null) {
      const pct = Math.round(
        (spend.cost_24h_cents / spend.daily_limit_cents) * 100,
      );
      lines.push(
        `- Vandaag: €${(spend.cost_24h_cents / 100).toFixed(2)} ` +
          `/ €${(spend.daily_limit_cents / 100).toFixed(2)} daily (${pct}%)`,
      );
    } else {
      lines.push(`- Vandaag: €${(spend.cost_24h_cents / 100).toFixed(2)} (geen daily limit)`);
    }
    if (spend.monthly_limit_cents != null) {
      const pct = Math.round(
        (spend.cost_30d_cents / spend.monthly_limit_cents) * 100,
      );
      lines.push(
        `- Deze maand: €${(spend.cost_30d_cents / 100).toFixed(2)} ` +
          `/ €${(spend.monthly_limit_cents / 100).toFixed(2)} monthly (${pct}%)`,
      );
    } else {
      lines.push(`- Deze maand: €${(spend.cost_30d_cents / 100).toFixed(2)} (geen monthly limit)`);
    }
  }

  // ── Business context ───────────────────────────────────────────────
  type BusinessRow = {
    name: string;
    sub: string | null;
    description: string | null;
    mission: string | null;
    targets: Target[] | null;
  };
  const biz = (bizRes.data ?? null) as BusinessRow | null;
  if (biz) {
    lines.push("");
    lines.push(`# Business context — je werkt voor: **${biz.name}**`);
    if (biz.sub) lines.push(`Sub: ${biz.sub}`);
    if (biz.description) {
      lines.push("");
      lines.push("## Description");
      lines.push(biz.description);
    }
    if (biz.mission) {
      lines.push("");
      lines.push("## Mission / Operating rules");
      lines.push(biz.mission);
    }
    const targets = (biz.targets ?? []) as Target[];
    const open = targets.filter((t) => (t.status ?? "open") === "open");
    if (open.length > 0) {
      lines.push("");
      lines.push("## Active targets (work toward these)");
      for (const t of open) {
        const parts = [`- ${t.name ?? "(unnamed)"}`];
        if (t.target) parts.push(`→ ${t.target}`);
        if (t.current) parts.push(`(current: ${t.current})`);
        if (t.deadline) parts.push(`by ${t.deadline}`);
        lines.push(parts.join(" "));
      }
    }
    const done = targets.filter((t) => t.status === "done");
    if (done.length > 0) {
      lines.push("");
      lines.push("## Already achieved");
      for (const t of done) {
        lines.push(`- ${t.name ?? ""} ${t.target ? `(${t.target})` : ""}`);
      }
    }
  }

  // ── Workspace-wide rules ───────────────────────────────────────────
  type WsRow = { name: string; default_system_prompt: string | null };
  const ws = (wsRes.data ?? null) as WsRow | null;
  if (ws?.default_system_prompt) {
    lines.push("");
    lines.push("## Workspace-wide rules");
    lines.push(ws.default_system_prompt);
  }

  return lines.join("\n");
}
