// AI-powered flow plan generator. Takes a natural-language description and
// returns a complete FlowPlan — agent + optional schedule + optional skills.
// Supports Claude (Anthropic SDK) and MiniMax (via Anthropic-compatible endpoint).

import Anthropic from "@anthropic-ai/sdk";

export type SkillPlan = {
  name: string;
  description: string;
  body: string;
};

export type SkillDraftPlan = SkillPlan & {
  explanation: string;
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

export type PipelineStepPlan = {
  id: string;
  label: string;
  agent: string;
  provider: string;
  model: string;
  needs: string;
  task: string;
  handoff: string;
  qa_rule: string;
  positive_prompt: string;
  negative_prompt: string;
  context_policy: "handoff_only" | "none";
};

export type PipelineBlueprintPlan = {
  pipeline_id: string;
  pipeline_name: string;
  orchestrator_agent_id: string | null;
  learning_enabled: boolean;
  correction_rules: string[];
  steps: PipelineStepPlan[];
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

export type BusinessTopicSuggestion = {
  name: string;
  reason: string;
};

export type BusinessTopicSuggestionsPlan = {
  topics: BusinessTopicSuggestion[];
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

const SKILL_TOOL: Anthropic.Tool = {
  name: "create_skill",
  description: "Maak een compacte AIO Control skill.",
  input_schema: {
    type: "object" as const,
    required: ["name", "description", "body", "explanation"],
    properties: {
      name: {
        type: "string",
        description:
          "Korte naam, liefst slug-achtig of identifier-achtig, max 50 tekens.",
      },
      description: {
        type: "string",
        description:
          "Een zin die exact zegt wanneer een agent deze skill moet gebruiken.",
      },
      body: {
        type: "string",
        description:
          "Compacte markdown instructies. Richtlijn: 150-450 woorden.",
      },
      explanation: {
        type: "string",
        description: "Korte uitleg waarom deze skill zo is opgebouwd.",
      },
    },
  },
};

const PIPELINE_BLUEPRINT_TOOL: Anthropic.Tool = {
  name: "create_pipeline_blueprint",
  description:
    "Maak een volledige AIO pipeline blueprint met orchestrator, geisoleerde subagent stappen, QA-regels en prompts.",
  input_schema: {
    type: "object" as const,
    required: [
      "pipeline_name",
      "learning_enabled",
      "correction_rules",
      "steps",
      "explanation",
    ],
    properties: {
      pipeline_id: { type: "string" },
      pipeline_name: { type: "string" },
      orchestrator_agent_id: { type: ["string", "null"] },
      learning_enabled: { type: "boolean" },
      correction_rules: { type: "array", items: { type: "string" } },
      explanation: { type: "string" },
      steps: {
        type: "array",
        items: {
          type: "object",
          required: [
            "id",
            "label",
            "agent",
            "provider",
            "model",
            "needs",
            "task",
            "handoff",
            "qa_rule",
            "positive_prompt",
            "negative_prompt",
            "context_policy",
          ],
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            agent: { type: "string" },
            provider: { type: "string" },
            model: { type: "string" },
            needs: { type: "string" },
            task: { type: "string" },
            handoff: { type: "string" },
            qa_rule: { type: "string" },
            positive_prompt: { type: "string" },
            negative_prompt: { type: "string" },
            context_policy: {
              type: "string",
              enum: ["handoff_only", "none"],
            },
          },
        },
      },
    },
  },
};

function buildSkillSystem(provider: FlowPlanProvider): string {
  return `Je bent een senior AI-operations architect voor AIO Control.
Je maakt losse skills: compacte markdown-snippets die alleen per gekozen agent in de system-prompt worden geladen.

Ontwerpregels:
- Maak precies 1 skill.
- Skills moeten context-bloat verminderen: zet alleen herbruikbare procedurele kennis in de body.
- De description is de trigger: wanneer moet een agent deze skill gebruiken?
- De body is operationeel en compact. Gebruik concrete stappen, checks en outputcriteria.
- Vermijd algemene "wees behulpzaam" regels; die horen niet in een skill.
- Vermijd secrets, API keys, accountgegevens en grote achtergrondcontext.
- Schrijf in dezelfde taal als de gebruikersbeschrijving.
- Gebruik markdown, maar houd het klein genoeg om vaak in een system-prompt mee te sturen.

Provider voor generatie: ${provider}.`;
}

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
- Voeg meestal 1 lead/main-loop agent toe voor de business of het belangrijkste topic. Die agent gebruikt AIO MCP met get_business_operating_snapshot om targets, KPIs, runs en schedules te lezen, plant in korte cycli, en gebruikt propose_improvement voor nieuwe agents/skills of risicovolle wijzigingen.
- Main-loop schedules moeten korte control loops zijn (bijv. elk uur of dagelijks), geen oneindige 24/7 run. Elke run kiest 1 bottleneck, doet 1 veilige actie of maakt 1 voorstel, en stopt.

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

const TOPIC_SUGGESTIONS_TOOL: Anthropic.Tool = {
  name: "suggest_business_topics",
  description:
    "Stel sterke root-topics voor de AIO Control business rail voor.",
  input_schema: {
    type: "object" as const,
    required: ["topics", "explanation"],
    properties: {
      explanation: {
        type: "string",
        description: "Korte uitleg waarom deze topic set past.",
      },
      topics: {
        type: "array",
        minItems: 4,
        maxItems: 8,
        items: {
          type: "object",
          required: ["name", "reason"],
          properties: {
            name: {
              type: "string",
              description: "Korte rail-topicnaam, 1-3 woorden.",
            },
            reason: {
              type: "string",
              description: "Waarom dit topic nuttig is voor deze business.",
            },
          },
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

function parseJsonObjectFromText<T>(text: string): T | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

function textFromMessage(msg: Anthropic.Message): string {
  return msg.content
    .filter((block) => block.type === "text")
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n\n");
}

function normalizeBusinessBlueprintPlan(
  input: Partial<BusinessBlueprintPlan>,
): BusinessBlueprintPlan {
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

function normalizeSkillDraftPlan(input: Partial<SkillDraftPlan>): SkillDraftPlan {
  const name = input.name?.trim() || "Nieuwe skill";
  const description =
    input.description?.trim() ||
    "Gebruik deze skill wanneer de taak deze procedurele werkwijze nodig heeft.";
  const body =
    input.body?.trim() ||
    "## Werkwijze\n1. Lees de taak en bepaal of deze skill past.\n2. Voer de stappen compact uit.\n3. Geef een concreet resultaat terug.";
  return {
    name,
    description,
    body,
    explanation: input.explanation?.trim() ?? "",
  };
}

function slugifyPipelineId(value: string, fallback: string): string {
  const id = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return id || fallback;
}

function normalizePipelineBlueprintPlan(
  input: Partial<PipelineBlueprintPlan>,
): PipelineBlueprintPlan {
  const name = input.pipeline_name?.trim() || "Nieuwe pipeline";
  const steps = (input.steps ?? [])
    .map((step, index) => {
      const label = step.label?.trim() || `Stap ${index + 1}`;
      return {
        id: slugifyPipelineId(step.id || label, `step_${index + 1}`),
        label,
        agent: step.agent?.trim() || "Subagent",
        provider: step.provider?.trim() || "openai_codex",
        model: step.model?.trim() || "",
        needs:
          step.needs?.trim() ||
          "Alleen de expliciete instructie en vorige output van de orchestrator.",
        task: step.task?.trim() || "Voer deze pipeline-stap afgebakend uit.",
        handoff:
          step.handoff?.trim() ||
          "Geef resultaat, bewijs, onzekerheden en aanbevolen vervolgactie terug.",
        qa_rule:
          step.qa_rule?.trim() ||
          "Orchestrator controleert volledigheid, risico en herbruikbaarheid.",
        positive_prompt:
          step.positive_prompt?.trim() ||
          "Volg de taak strikt en lever compact bewijs bij je output.",
        negative_prompt:
          step.negative_prompt?.trim() ||
          "Geen brede context ophalen, geen aannames en geen externe actie uitvoeren.",
        context_policy: (
          step.context_policy === "none" ? "none" : "handoff_only"
        ) as PipelineStepPlan["context_policy"],
      };
    })
    .slice(0, 20);

  return {
    pipeline_id: slugifyPipelineId(
      input.pipeline_id || name,
      `pipeline_${Date.now().toString(36)}`,
    ),
    pipeline_name: name,
    orchestrator_agent_id:
      typeof input.orchestrator_agent_id === "string"
        ? input.orchestrator_agent_id
        : null,
    learning_enabled: input.learning_enabled !== false,
    correction_rules: (input.correction_rules ?? [])
      .map((rule) => rule.trim())
      .filter(Boolean)
      .slice(0, 20),
    steps,
    explanation: input.explanation?.trim() ?? "",
  };
}

function normalizeTopicSuggestionsPlan(
  input: Partial<BusinessTopicSuggestionsPlan>,
): BusinessTopicSuggestionsPlan {
  const seen = new Set<string>();
  const topics = (input.topics ?? [])
    .map((topic) => ({
      name: topic.name?.trim() ?? "",
      reason: topic.reason?.trim() ?? "",
    }))
    .filter((topic) => {
      if (!topic.name) return false;
      const key = topic.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);

  return {
    topics,
    explanation: input.explanation?.trim() ?? "",
  };
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

export async function generateSkillDraftPlan(
  input: {
    request: string;
    existingSkills?: Array<{ name: string; description: string }>;
  },
  apiKey: string,
  provider: FlowPlanProvider = "claude",
): Promise<SkillDraftPlan> {
  const clientOpts: ConstructorParameters<typeof Anthropic>[0] = { apiKey };
  if (provider === "minimax") {
    clientOpts.baseURL = minimaxAnthropicBase();
    clientOpts.defaultHeaders = { Authorization: `Bearer ${apiKey}` };
  }

  const model = provider === "minimax" ? MINIMAX_MODEL : "claude-sonnet-4-6";
  const client = new Anthropic(clientOpts);

  const msg = await client.messages.create({
    model,
    max_tokens: 4096,
    system: buildSkillSystem(provider),
    tools: [SKILL_TOOL],
    tool_choice: { type: "tool", name: "create_skill" },
    messages: [
      {
        role: "user",
        content:
          "Maak een AIO Control skill op basis van deze wens.\n" +
          "Gebruik verplicht de create_skill tool. Als de provider geen tool-call kan teruggeven, antwoord dan uitsluitend met een JSON object volgens hetzelfde schema.\n\n" +
          JSON.stringify(
            {
              request: input.request,
              existing_skills: input.existingSkills ?? [],
            },
            null,
            2,
          ),
      },
    ],
  });

  const toolBlock = msg.content.find((block) => block.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    const parsed =
      parseJsonObjectFromText<Partial<SkillDraftPlan>>(textFromMessage(msg));
    if (parsed) return normalizeSkillDraftPlan(parsed);
    throw new Error(
      "AI gaf geen bruikbare skill terug. Probeer opnieuw met een concretere beschrijving.",
    );
  }

  return normalizeSkillDraftPlan(toolBlock.input as Partial<SkillDraftPlan>);
}

export async function generatePipelineBlueprintPlan(
  input: {
    description: string;
    scopeName?: string;
    availableAgents?: Array<{
      id: string;
      name: string;
      kind?: string;
      provider?: string;
      model?: string | null;
    }>;
  },
  apiKey: string,
  provider: FlowPlanProvider = "claude",
): Promise<PipelineBlueprintPlan> {
  const clientOpts: ConstructorParameters<typeof Anthropic>[0] = { apiKey };
  if (provider === "minimax") {
    clientOpts.baseURL = minimaxAnthropicBase();
    clientOpts.defaultHeaders = { Authorization: `Bearer ${apiKey}` };
  }

  const model = provider === "minimax" ? MINIMAX_MODEL : "claude-sonnet-4-6";
  const client = new Anthropic(clientOpts);
  const system = `Je bent een senior AIO Control pipeline architect.
Ontwerp pipelines als n8n-achtige uitvoerbare stappen voor multi-agent werk.

Regels:
- Gebruik de main/orchestrator agent als planner en QA. Kies een beschikbare router/reviewer/lead agent als orchestrator_agent_id wanneer dat logisch is.
- Elke subagent stap krijgt alleen context_policy "handoff_only", tenzij de taak expliciet helemaal zonder context kan.
- Subagents mogen geen volledige thread of business context krijgen; beschrijf in "needs" exact wat de orchestrator moet doorgeven.
- Zet per stap provider en model. Gebruik bestaande agent provider/model wanneer de stap aan een bestaande agent lijkt te koppelen, anders "openai_codex" met leeg model.
- Geen fake externe acties: als e-mailen, formulieren invullen, betalen of publiceren niet expliciet als beschikbare integratie bestaat, maak de stap een draft/QA/handmatige review stap.
- Voeg positieve en negatieve promptregels per stap toe.
- Voeg self-learning correctieregels toe die QA-fouten als regels vastleggen.
- Geef dezelfde taal terug als de gebruiker gebruikt.`;

  const msg = await client.messages.create({
    model,
    max_tokens: 8192,
    system,
    tools: [PIPELINE_BLUEPRINT_TOOL],
    tool_choice: { type: "tool", name: "create_pipeline_blueprint" },
    messages: [
      {
        role: "user",
        content:
          "Maak een AIO pipeline blueprint. Gebruik verplicht de create_pipeline_blueprint tool. Als de provider geen tool-call kan teruggeven, antwoord dan uitsluitend met JSON volgens hetzelfde schema.\n\n" +
          JSON.stringify(
            {
              scope_name: input.scopeName ?? "",
              description: input.description,
              available_agents: input.availableAgents ?? [],
            },
            null,
            2,
          ),
      },
    ],
  });

  const toolBlock = msg.content.find((block) => block.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    const parsed =
      parseJsonObjectFromText<Partial<PipelineBlueprintPlan>>(
        textFromMessage(msg),
      );
    if (parsed) return normalizePipelineBlueprintPlan(parsed);
    throw new Error(
      "AI gaf geen bruikbare pipeline terug. Probeer opnieuw met een concretere beschrijving.",
    );
  }

  return normalizePipelineBlueprintPlan(
    toolBlock.input as Partial<PipelineBlueprintPlan>,
  );
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
    tool_choice: { type: "tool", name: "create_business_blueprint" },
    messages: [
      {
        role: "user",
        content:
          "Maak een volledige business blueprint voor AIO Control op basis van deze beschrijving.\n" +
          "Gebruik verplicht de create_business_blueprint tool. Als de provider geen tool-call kan teruggeven, antwoord dan uitsluitend met een JSON object volgens exact hetzelfde schema.\n\n" +
          description,
      },
    ],
  });

  const toolBlock = msg.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    const parsed = parseJsonObjectFromText<Partial<BusinessBlueprintPlan>>(
      textFromMessage(msg),
    );
    if (parsed) return normalizeBusinessBlueprintPlan(parsed);
    throw new Error(
      "AI gaf geen bruikbaar blueprint-object terug. Probeer opnieuw of maak de beschrijving iets concreter.",
    );
  }

  const input = toolBlock.input as Partial<BusinessBlueprintPlan>;
  return normalizeBusinessBlueprintPlan(input);
}

export async function generateBusinessTopicSuggestions(
  input: {
    name: string;
    description?: string;
    mission?: string;
    targets?: Array<{ name?: string; target?: string; unit?: string }>;
    existingTopics?: string[];
  },
  apiKey: string,
  provider: FlowPlanProvider = "claude",
): Promise<BusinessTopicSuggestionsPlan> {
  const clientOpts: ConstructorParameters<typeof Anthropic>[0] = { apiKey };
  if (provider === "minimax") {
    clientOpts.baseURL = minimaxAnthropicBase();
    clientOpts.defaultHeaders = { Authorization: `Bearer ${apiKey}` };
  }

  const model = provider === "minimax" ? MINIMAX_MODEL : "claude-sonnet-4-6";
  const client = new Anthropic(clientOpts);

  const system = `Je bent een senior AI-operations architect voor AIO Control.
Stel root-topics voor die als rail-navigatie dienen binnen een nieuwe automated business.

Ontwerpregels:
- Geef 5 tot 8 root-topics.
- Topicnamen zijn kort, scanbaar en operationeel: 1-3 woorden.
- Denk aan hoe de business dagelijks bestuurd wordt: aanbod, research, content, sales, delivery, klanten, finance, analytics, automations.
- Maak ze specifiek voor de business; vermijd generieke setjes als die niet passen.
- Vermijd dubbele of overlappende topics.
- Stel alleen root-topics voor, geen subtopics.
- Gebruik dezelfde taal als de businessbeschrijving.`;

  const msg = await client.messages.create({
    model,
    max_tokens: 2048,
    system,
    tools: [TOPIC_SUGGESTIONS_TOOL],
    tool_choice: { type: "tool", name: "suggest_business_topics" },
    messages: [
      {
        role: "user",
        content:
          "Stel goede AIO Control root-topics voor deze nieuwe business voor.\n" +
          "Gebruik verplicht de suggest_business_topics tool. Als de provider geen tool-call kan teruggeven, antwoord dan uitsluitend met een JSON object volgens hetzelfde schema.\n\n" +
          JSON.stringify(
            {
              business_name: input.name,
              description: input.description ?? "",
              mission: input.mission ?? "",
              targets: input.targets ?? [],
              existing_topics: input.existingTopics ?? [],
            },
            null,
            2,
          ),
      },
    ],
  });

  const toolBlock = msg.content.find((block) => block.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    const parsed =
      parseJsonObjectFromText<Partial<BusinessTopicSuggestionsPlan>>(
        textFromMessage(msg),
      );
    if (parsed) return normalizeTopicSuggestionsPlan(parsed);
    throw new Error(
      "AI gaf geen bruikbare topic-suggesties terug. Probeer opnieuw met een concretere beschrijving.",
    );
  }

  return normalizeTopicSuggestionsPlan(
    toolBlock.input as Partial<BusinessTopicSuggestionsPlan>,
  );
}
