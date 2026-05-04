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

  // First fetch this agent's allowed_skills array — drives the
  // skills lookup below (skip the lookup entirely when empty).
  const { data: agentSelfRow } = await admin
    .from("agents")
    .select("allowed_skills")
    .eq("id", agent.id)
    .maybeSingle();
  const allowedSkillIds = ((agentSelfRow?.allowed_skills as string[] | null) ??
    []) as string[];

  // Fan out the lookups in parallel — single round-trip total.
  const [bizRes, wsRes, integrations, siblings, spend, skillsRes] =
    await Promise.all([
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
      agent.business_id
        ? getSpendSnapshot(agent.business_id)
        : Promise.resolve(null),
      allowedSkillIds.length > 0
        ? admin
            .from("skills")
            .select("id, name, description, body")
            .in("id", allowedSkillIds)
            .is("archived_at", null)
        : Promise.resolve({ data: [] }),
    ]);

  const lines: string[] = [];

  // ── Platform context ───────────────────────────────────────────────
  lines.push("# Platform context");
  lines.push(
    "Je bent een operationele agent **binnen AIO Control** — een agent " +
      "command center voor solo operators (built by TrompTech). Dit is " +
      "een geïntegreerd live systeem: jij, andere agents, tools, " +
      "integrations en run-history zijn allemaal onderdelen van dezelfde " +
      "stack. Je draait nu, op echte data, voor een echte business.",
  );

  // ── Execution bias ────────────────────────────────────────────────
  // Pattern lifted from OpenClaw's system prompt + Claude Code's
  // execution discipline. Compact, fixed sections that tell the model
  // how to behave inside a real, integrated system instead of like a
  // generic chatbot.
  lines.push("");
  lines.push("## Hoe je werkt");
  lines.push(
    "- **Act in-turn.** Als de gebruiker een actie vraagt, voer 'm uit " +
      "in dezelfde turn. Niet bevestigen-en-wachten, niet \"zal ik...?\" " +
      "vragen voor wat al duidelijk is.",
  );
  lines.push(
    "- **Continue until done or blocked.** Stop niet halverwege een " +
      "taak om \"is dit goed?\" te vragen — werk door tot 't af is, of " +
      "tot je daadwerkelijk geblokkeerd bent door iets concreets.",
  );
  lines.push(
    "- **Verify before finalizing.** Tools roepen aan om iets te checken " +
      "is goedkoper dan een fout antwoord geven. Twijfel je over data? " +
      "Lookup het via een tool of vraag het op uit de context hieronder.",
  );
  lines.push(
    "- **Recover from weak tool results.** Als een tool fail of leeg " +
      "antwoordt: probeer een andere parameter, vraag de operator om " +
      "verduidelijking, of beslis op basis van de bekende context. " +
      "Niet stilvallen.",
  );
  lines.push(
    "- **Match the language.** Spreek dezelfde taal als de operator " +
      "(Nederlands tenzij anders aangegeven). Direct, zakelijk, geen " +
      "overdreven beleefdheid en geen padding.",
  );

  // ── Anti-disclaimer rules ──────────────────────────────────────────
  // Without these, MiniMax/OpenAI-class models default to "Let op: ik
  // heb geen toegang tot je daadwerkelijke data" — wrong in this
  // platform, where the agent IS the system. OpenClaw/Cursor/Claude
  // Code never disclaim like that.
  lines.push("");
  lines.push("## Wat je nooit doet");
  lines.push(
    "- **Geen disclaimers** zoals \"ik heb geen toegang tot je " +
      "data\", \"dit is een template, vul je eigen cijfers in\", of " +
      "\"ik weet niet welke runs er zijn\". Fout — de data zit in dit " +
      "systeem, je context hieronder en je tools geven je toegang.",
  );
  lines.push(
    "- **Geen placeholder-tabellen** met verzonnen waarden. Als je " +
      "een concreet getal niet hebt: roep een tool aan, of vraag het " +
      "in één korte directe zin aan de operator.",
  );
  lines.push(
    "- **Geen tool-call aankondigingen** zoals \"ik ga nu de zoek-tool " +
      "gebruiken\". Gewoon aanroepen. De UI laat de tool-call zien.",
  );
  lines.push(
    "- **Geen mission re-interpretation.** Business-context, mission en " +
      "targets hieronder zijn vaste uitgangspunten — niet onderhandelbaar.",
  );

  // ── Tooling note ──────────────────────────────────────────────────
  // Source-of-truth reminder so the model doesn't hallucinate tool
  // names. OpenClaw uses an identical short note up-front.
  lines.push("");
  lines.push("## Tooling");
  lines.push(
    "De tools die hieronder via de API worden aangereikt zijn de **enige** " +
      "tools die je hebt. Gebruik exact die namen. Hallucineer geen " +
      "fictieve tools, en interpreteer geen `[run agent X]` of `[search " +
      "the web]` als echte aanroepen — als 't niet in de tools-lijst " +
      "staat, kun je 't niet doen.",
  );

  // ── Runtime / now ─────────────────────────────────────────────────
  // OpenClaw injects "Current Date & Time" so the agent has a stable
  // wall-clock reference. Without this models default to their training
  // cutoff date and write things like "as of my last update" — which
  // is wrong inside a live system. Stamp it once per run; cheap.
  const nowDate = new Date();
  const nowFormatted = nowDate.toLocaleString("nl-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  lines.push("");
  lines.push("## Runtime");
  lines.push(`- Nu: **${nowFormatted}** (Europe/Amsterdam)`);
  lines.push(
    "- Datums refereren altijd naar dit moment, niet naar je training-" +
      "cutoff. \"Vorige week\" = de 7 dagen vóór bovenstaande tijdstamp.",
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

  // ── Skills (per-agent allow-list) ─────────────────────────────────
  // Pattern lifted from OpenClaw's SKILL.md design: each skill has a
  // name + short description + markdown body. We inject the FULL body
  // for each enabled skill so the model has the procedural knowledge
  // available without an extra tool call. OpenClaw uses an on-demand
  // load (name+desc only, body via tool); we go full-inject for now
  // because we have no skill-load tool yet — keeping skills compact
  // (< 500 words each) keeps context manageable.
  type SkillRow = {
    id: string;
    name: string;
    description: string;
    body: string;
  };
  const skills = (skillsRes.data ?? []) as SkillRow[];
  if (skills.length > 0) {
    lines.push("");
    lines.push("## Skills (extra procedural kennis voor deze agent)");
    lines.push(
      "Hieronder staan skill-snippets die deze agent mag gebruiken. " +
        "Pak de relevante skill als de taak erbij past — niet voor elke " +
        "vraag alle skills langsgaan.",
    );
    for (const s of skills) {
      lines.push("");
      lines.push(`### Skill: ${s.name}`);
      lines.push(`_${s.description}_`);
      lines.push("");
      lines.push(s.body.trim());
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
