// AI-powered flow plan generator. Takes a natural-language description and
// returns a complete FlowPlan — agent + optional schedule + optional skills.
// Supports Claude (Anthropic SDK) and MiniMax (via Anthropic-compatible endpoint).

import Anthropic from "@anthropic-ai/sdk";

export type SkillPlan = {
  name: string;
  description: string;
  body: string;
};

export type SchedulePlan = {
  kind: "cron" | "webhook" | "manual";
  cron_expr?: string;
  title: string;
  description: string;
  prompt: string;
};

export type AgentPlan = {
  name: string;
  kind: "chat" | "worker" | "reviewer" | "generator" | "router";
  provider: "claude" | "minimax" | "openrouter" | "ollama";
  model: string;
  system_prompt: string;
};

export type FlowPlan = {
  agent: AgentPlan;
  schedule: SchedulePlan | null;
  skills: SkillPlan[];
  explanation: string;
};

export type BlueprintSkillPlan = SkillPlan & {
  key: string;
};

export type BlueprintTopicPlan = {
  key: string;
  name: string;
  description: string;
  parent_key?: string | null;
  icon?: string | null;
};

export type McpPermissionsPlan = {
  filesystem?: "ro" | "rw";
  aio?: "ro" | "rw";
};

export type BlueprintAgentPlan = {
  key: string;
  name: string;
  role: "lead" | "subagent" | "specialist" | "ops" | "reviewer";
  kind: AgentPlan["kind"];
  provider: AgentPlan["provider"];
  model: string;
  description: string;
  system_prompt: string;
  topic_key?: string | null;
  skill_keys: string[];
  mcp_servers: string[];
  mcp_permissions?: McpPermissionsPlan;
  handoff_on_done_key?: string | null;
  handoff_on_fail_key?: string | null;
};

export type BlueprintSchedulePlan = SchedulePlan & {
  agent_key: string;
  topic_key?: string | null;
};

export type BlueprintIntegrationProvider =
  | "youtube_data"
  | "etsy"
  | "drive"
  | "stripe"
  | "shopify"
  | "openai"
  | "anthropic"
  | "openrouter"
  | "minimax"
  | "custom_mcp";

export type BlueprintIntegrationPlan = {
  key: string;
  provider: BlueprintIntegrationProvider;
  name: string;
  reason: string;
  setup_notes: string;
};

export type BusinessBlueprintPlan = {
  business: {
    name: string;
    sub: string;
    description: string;
    mission: string;
    icon?: string | null;
  };
  topics: BlueprintTopicPlan[];
  skills: BlueprintSkillPlan[];
  agents: BlueprintAgentPlan[];
  schedules: BlueprintSchedulePlan[];
  integrations: BlueprintIntegrationPlan[];
  team: {
    lead_agent_key: string;
    notes: string;
  };
  research_plan: {
    depth: "quick" | "standard" | "deep";
    questions: string[];
    sources_to_check: string[];
    recurring_review: string;
  };
  explanation: string;
};

export type FlowPlanProvider = "claude" | "minimax";

function buildSystem(provider: FlowPlanProvider): string {
  const defaultProvider =
    provider === "minimax"
      ? `- "minimax"    + model "MiniMax-M2.7-Highspeed"  (standaard, geconfigureerd in dit systeem)`
      : `- "claude"     + model "claude-sonnet-4-6"  (standaard, beste kwaliteit)`;

  return `Je bent een expert in het ontwerpen van AI-agent workflows voor AIO Control.
AIO Control is een multi-agent task management platform. Jouw taak: vertaal een gebruikersbeschrijving
naar een concreet uitvoerbaar plan bestaande uit een agent, een optionele schedule, en optionele skills.

## Agent kinds
- "worker"    — voert een taak uit en stopt (geen chat, wel output)
- "chat"      — interactief, multi-turn gesprekken
- "generator" — genereert content (tekst, code, etc.)
- "reviewer"  — beoordeelt of keurt goed/af
- "router"    — routeert naar andere agents op basis van regels

## Providers + modellen (kies de standaard tenzij de gebruiker iets anders vraagt)
${defaultProvider}
- "claude"      + model "claude-sonnet-4-6"  (beste kwaliteit)
- "claude"      + model "claude-haiku-4-5-20251001"  (snel + goedkoop)
- "minimax"     + model "MiniMax-M2.7-Highspeed"  (snel, goedkoop)
- "openrouter"  + model "meta-llama/llama-3.3-70b-instruct"  (open source)
- "ollama"      + model "llama3.2"  (lokaal, geen kosten)

## Schedule kinds
- "cron"    — tijdsgebaseerd, gebruik een geldige cron-expressie (bijv. "0 9 * * *" = elke dag 09:00)
- "webhook" — getriggerd door een extern HTTP request
- "manual"  — alleen handmatig starten

## Skills
Skills zijn markdown-snippets die in de system-prompt worden geïnjecteerd.
Gebruik ze voor herbruikbare procedurele kennis (e.g. "hoe post ik op Instagram", "hoe formatteer ik een rapport").
Maak alleen skills aan als de agent duidelijk herbruikbare instructies nodig heeft.

## Cron expressies (voorbeelden)
- "0 9 * * *"     elke dag 09:00
- "0 9 * * 1-5"   werkdagen 09:00
- "0 * * * *"     elk uur
- "*/15 * * * *"  elke 15 minuten
- "0 9 * * 1"     elke maandag 09:00
- "0 0 1 * *"     eerste dag van elke maand

Geef altijd een heldere system_prompt die exact beschrijft wat de agent moet doen.
Schrijf de system_prompt in dezelfde taal als de gebruikersbeschrijving.`;
}

const TOOL: Anthropic.Tool = {
  name: "create_flow_plan",
  description: "Maak een volledig flow plan met agent, schedule en skills.",
  input_schema: {
    type: "object" as const,
    required: ["agent", "explanation"],
    properties: {
      explanation: {
        type: "string",
        description: "Korte uitleg (1-2 zinnen) van wat dit flow plan doet.",
      },
      agent: {
        type: "object",
        required: ["name", "kind", "provider", "model", "system_prompt"],
        properties: {
          name: { type: "string", description: "Naam van de agent (max 50 tekens)." },
          kind: {
            type: "string",
            enum: ["chat", "worker", "reviewer", "generator", "router"],
          },
          provider: {
            type: "string",
            enum: ["claude", "minimax", "openrouter", "ollama"],
          },
          model: { type: "string" },
          system_prompt: {
            type: "string",
            description: "System prompt voor de agent. Beschrijf precies wat de agent doet.",
          },
        },
      },
      schedule: {
        type: ["object", "null"],
        description: "null als er geen schedule nodig is.",
        required: ["kind", "title", "description", "prompt"],
        properties: {
          kind: { type: "string", enum: ["cron", "webhook", "manual"] },
          cron_expr: {
            type: "string",
            description: "Verplicht als kind=cron. Geldige cron-expressie.",
          },
          title: { type: "string", description: "Korte titel voor de schedule." },
          description: { type: "string" },
          prompt: {
            type: "string",
            description: "De instructie die meegegeven wordt bij elke run.",
          },
        },
      },
      skills: {
        type: "array",
        description: "Lege array als er geen skills nodig zijn.",
        items: {
          type: "object",
          required: ["name", "description", "body"],
          properties: {
            name: { type: "string" },
            description: {
              type: "string",
              description: "Wanneer gebruik je deze skill (1 zin).",
            },
            body: {
              type: "string",
              description: "De volledige skill body in markdown.",
            },
          },
        },
      },
    },
  },
};

function buildBusinessSystem(provider: FlowPlanProvider): string {
  const base = buildSystem(provider);
  return `${base}

## Business blueprint mode
Je ontwerpt nu niet 1 losse automatisering, maar een volledige business-operating-system blueprint.
De gebruiker beschrijft een business. Jij maakt een uitvoerbaar AIO Control plan met:
- business metadata;
- topics/modules voor de navigatie;
- een agentteam met lead agent, subagents/specialisten, reviewers en ops agents;
- herbruikbare skills;
- MCP servers per agent;
- cron/webhook/manual schedules;
- integraties die moeten worden voorbereid;
- een deep-research plan als de business of gebruiker daar baat bij heeft.

Belangrijke AIO Control beperkingen:
- Maak alleen providers uit: "claude", "minimax", "openrouter", "ollama".
- Gebruik standaard "claude" + "claude-sonnet-4-6" voor hoge kwaliteit.
- Gebruik "minimax" + "MiniMax-M2.7-Highspeed" voor research/tool-heavy agents.
- Geldige MCP servers: "minimax", "minimax-images", "openai-images", "aio", "bash", "filesystem", "fetch", "playwright", "brave", "memory", "firecrawl", "firecrawl-pc".
- Voor deep research: kies meestal "brave", "fetch", "firecrawl" of "minimax"; voeg "memory" toe als kennis moet blijven hangen.
- Geef "filesystem" en "aio" standaard read-only ("ro") tenzij de agent expliciet platform/filesystem writes moet kunnen doen.
- Integraties worden als disconnected placeholders aangemaakt. Schrijf setup_notes met wat de gebruiker later nog moet koppelen.
- Agent keys, skill keys en topic keys moeten slug-achtig en uniek zijn, bijvoorbeeld "lead_ops", "market_research", "content_calendar".
- Handoffs verwijzen naar andere agent keys. Gebruik ze alleen voor duidelijke pipelines.
- Schedules moeten praktisch zijn; maak niet meer cron jobs dan nodig.

Ontwerp compact maar compleet. Vermijd fantasie-API's. Maak liever een haalbare eerste versie met duidelijke uitbreidpunten.`;
}

const BUSINESS_BLUEPRINT_TOOL: Anthropic.Tool = {
  name: "create_business_blueprint",
  description:
    "Maak een volledig AIO Control business blueprint met business, topics, agents, skills, MCP servers, schedules en integraties.",
  input_schema: {
    type: "object" as const,
    required: [
      "business",
      "topics",
      "skills",
      "agents",
      "schedules",
      "integrations",
      "team",
      "research_plan",
      "explanation",
    ],
    properties: {
      explanation: {
        type: "string",
        description: "Korte uitleg van de gekozen business setup.",
      },
      business: {
        type: "object",
        required: ["name", "sub", "description", "mission"],
        properties: {
          name: { type: "string", description: "Business naam." },
          sub: { type: "string", description: "Korte ondertitel." },
          description: { type: "string" },
          mission: { type: "string" },
          icon: { type: "string", description: "Korte emoji/letter/icon hint." },
        },
      },
      topics: {
        type: "array",
        items: {
          type: "object",
          required: ["key", "name", "description"],
          properties: {
            key: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            parent_key: { type: ["string", "null"] },
            icon: { type: ["string", "null"] },
          },
        },
      },
      skills: {
        type: "array",
        items: {
          type: "object",
          required: ["key", "name", "description", "body"],
          properties: {
            key: { type: "string" },
            name: { type: "string" },
            description: {
              type: "string",
              description: "Wanneer gebruik je deze skill (1 zin).",
            },
            body: { type: "string", description: "Volledige skill body in markdown." },
          },
        },
      },
      agents: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: [
            "key",
            "name",
            "role",
            "kind",
            "provider",
            "model",
            "description",
            "system_prompt",
            "skill_keys",
            "mcp_servers",
          ],
          properties: {
            key: { type: "string" },
            name: { type: "string" },
            role: {
              type: "string",
              enum: ["lead", "subagent", "specialist", "ops", "reviewer"],
            },
            kind: {
              type: "string",
              enum: ["chat", "worker", "reviewer", "generator", "router"],
            },
            provider: {
              type: "string",
              enum: ["claude", "minimax", "openrouter", "ollama"],
            },
            model: { type: "string" },
            description: { type: "string" },
            system_prompt: { type: "string" },
            topic_key: { type: ["string", "null"] },
            skill_keys: { type: "array", items: { type: "string" } },
            mcp_servers: { type: "array", items: { type: "string" } },
            mcp_permissions: {
              type: "object",
              properties: {
                filesystem: { type: "string", enum: ["ro", "rw"] },
                aio: { type: "string", enum: ["ro", "rw"] },
              },
            },
            handoff_on_done_key: { type: ["string", "null"] },
            handoff_on_fail_key: { type: ["string", "null"] },
          },
        },
      },
      schedules: {
        type: "array",
        items: {
          type: "object",
          required: ["agent_key", "kind", "title", "description", "prompt"],
          properties: {
            agent_key: { type: "string" },
            topic_key: { type: ["string", "null"] },
            kind: { type: "string", enum: ["cron", "webhook", "manual"] },
            cron_expr: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            prompt: { type: "string" },
          },
        },
      },
      integrations: {
        type: "array",
        items: {
          type: "object",
          required: ["key", "provider", "name", "reason", "setup_notes"],
          properties: {
            key: { type: "string" },
            provider: {
              type: "string",
              enum: [
                "youtube_data",
                "etsy",
                "drive",
                "stripe",
                "shopify",
                "openai",
                "anthropic",
                "openrouter",
                "minimax",
                "custom_mcp",
              ],
            },
            name: { type: "string" },
            reason: { type: "string" },
            setup_notes: { type: "string" },
          },
        },
      },
      team: {
        type: "object",
        required: ["lead_agent_key", "notes"],
        properties: {
          lead_agent_key: { type: "string" },
          notes: { type: "string" },
        },
      },
      research_plan: {
        type: "object",
        required: ["depth", "questions", "sources_to_check", "recurring_review"],
        properties: {
          depth: { type: "string", enum: ["quick", "standard", "deep"] },
          questions: { type: "array", items: { type: "string" } },
          sources_to_check: { type: "array", items: { type: "string" } },
          recurring_review: { type: "string" },
        },
      },
    },
  },
};

const MINIMAX_BASE = "https://api.minimax.io/v1";
const MINIMAX_MODEL = "MiniMax-M2.7-Highspeed";

// Mirrors the logic in packages/ai/src/providers/minimax.ts:
// strip the trailing /v1 and append /anthropic so the Anthropic SDK
// constructs URLs like https://api.minimax.io/anthropic/v1/messages.
function minimaxAnthropicBase(base = MINIMAX_BASE): string {
  return base.replace(/\/v1\/?$/, "") + "/anthropic";
}

export async function generateFlowPlan(
  description: string,
  apiKey: string,
  provider: FlowPlanProvider = "claude",
): Promise<FlowPlan> {
  const clientOpts: ConstructorParameters<typeof Anthropic>[0] = { apiKey };
  if (provider === "minimax") {
    clientOpts.baseURL = minimaxAnthropicBase();
    // MiniMax requires Bearer token auth in addition to x-api-key
    clientOpts.defaultHeaders = { Authorization: `Bearer ${apiKey}` };
  }

  const model = provider === "minimax" ? MINIMAX_MODEL : "claude-sonnet-4-6";
  const client = new Anthropic(clientOpts);

  const msg = await client.messages.create({
    model,
    max_tokens: 4096,
    system: buildSystem(provider),
    tools: [TOOL],
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content: `Maak een flow plan voor de volgende automatisering:\n\n${description}`,
      },
    ],
  });

  const toolBlock = msg.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("AI kon geen plan genereren.");
  }

  const input = toolBlock.input as {
    agent: AgentPlan;
    schedule?: SchedulePlan | null;
    skills?: SkillPlan[];
    explanation: string;
  };

  return {
    agent: input.agent,
    schedule: input.schedule ?? null,
    skills: input.skills ?? [],
    explanation: input.explanation,
  };
}

export async function generateBusinessBlueprintPlan(
  description: string,
  apiKey: string,
  provider: FlowPlanProvider = "claude",
): Promise<BusinessBlueprintPlan> {
  const clientOpts: ConstructorParameters<typeof Anthropic>[0] = { apiKey };
  if (provider === "minimax") {
    clientOpts.baseURL = minimaxAnthropicBase();
    clientOpts.defaultHeaders = { Authorization: `Bearer ${apiKey}` };
  }

  const model = provider === "minimax" ? MINIMAX_MODEL : "claude-sonnet-4-6";
  const client = new Anthropic(clientOpts);

  const msg = await client.messages.create({
    model,
    max_tokens: 8192,
    system: buildBusinessSystem(provider),
    tools: [BUSINESS_BLUEPRINT_TOOL],
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content: `Maak een volledige business blueprint voor AIO Control op basis van deze beschrijving:\n\n${description}`,
      },
    ],
  });

  const toolBlock = msg.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("AI kon geen business blueprint genereren.");
  }

  const input = toolBlock.input as Partial<BusinessBlueprintPlan>;
  const agents = input.agents ?? [];
  const leadKey =
    input.team?.lead_agent_key ??
    agents.find((agent) => agent.role === "lead")?.key ??
    agents[0]?.key ??
    "";

  return {
    business: {
      name: input.business?.name ?? "Nieuwe business",
      sub: input.business?.sub ?? "",
      description: input.business?.description ?? "",
      mission: input.business?.mission ?? "",
      icon: input.business?.icon ?? null,
    },
    topics: input.topics ?? [],
    skills: input.skills ?? [],
    agents,
    schedules: input.schedules ?? [],
    integrations: input.integrations ?? [],
    team: {
      lead_agent_key: leadKey,
      notes: input.team?.notes ?? "",
    },
    research_plan: {
      depth: input.research_plan?.depth ?? "standard",
      questions: input.research_plan?.questions ?? [],
      sources_to_check: input.research_plan?.sources_to_check ?? [],
      recurring_review: input.research_plan?.recurring_review ?? "",
    },
    explanation: input.explanation ?? "",
  };
}
