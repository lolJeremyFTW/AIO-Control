// POST /api/flows/generate
// Takes a natural-language description and returns a FlowPlan — the
// complete spec for an agent + optional schedule + optional skills.
// Claude generates this via tool_use so the output is always valid JSON.

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "../../../../lib/auth/workspace";

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

const SYSTEM = `Je bent een expert in het ontwerpen van AI-agent workflows voor AIO Control.
AIO Control is een multi-agent task management platform. Jouw taak: vertaal een gebruikersbeschrijving
naar een concreet uitvoerbaar plan bestaande uit een agent, een optionele schedule, en optionele skills.

## Agent kinds
- "worker"    — voert een taak uit en stopt (geen chat, wel output)
- "chat"      — interactief, multi-turn gesprekken
- "generator" — genereert content (tekst, code, etc.)
- "reviewer"  — beoordeelt of keurt goed/af
- "router"    — routeert naar andere agents op basis van regels

## Providers + modellen
- "claude"      + model "claude-sonnet-4-6"  (standaard, beste kwaliteit)
- "claude"      + model "claude-haiku-4-5-20251001"  (snel + goedkoop)
- "minimax"     + model "MiniMax-M2.7-highspeed"  (Chinees, snel)
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

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const description: string = body?.description ?? "";
  if (!description.trim()) {
    return NextResponse.json({ error: "description is verplicht" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Geen Anthropic API key geconfigureerd." }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM,
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
    return NextResponse.json({ error: "AI kon geen plan genereren." }, { status: 500 });
  }

  const input = toolBlock.input as {
    agent: AgentPlan;
    schedule?: SchedulePlan | null;
    skills?: SkillPlan[];
    explanation: string;
  };

  const plan: FlowPlan = {
    agent: input.agent,
    schedule: input.schedule ?? null,
    skills: input.skills ?? [],
    explanation: input.explanation,
  };

  return NextResponse.json({ ok: true, plan });
}
