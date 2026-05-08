export type DocPage = {
  slug: string;
  title: string;
  eyebrow: string;
  summary: string;
  why: string[];
  sections: Array<{
    title: string;
    body: string;
    bullets: string[];
  }>;
};

export const docsNav = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/features", label: "Features" },
  { href: "/docs/providers", label: "Providers" },
  { href: "/docs/workflows", label: "Workflows" },
  { href: "/docs/outputs", label: "Outputs" },
  { href: "/docs/mcp-tools", label: "MCP tools" },
  { href: "/docs/operations", label: "Operations" },
  { href: "/docs/security", label: "Security" },
] as const;

export const valueProps = [
  {
    title: "One dashboard for every agent runtime",
    body: "Run OpenClaw, Hermes Agent, Claude Code, OpenAI Codex, Claude API, MiniMax, OpenRouter, Ollama, and MCP-backed agents from one operator console.",
  },
  {
    title: "Built for real operations",
    body: "AIO Control tracks schedules, webhooks, runs, retries, queue items, spend, outputs, and review decisions instead of leaving everything in scattered terminal logs.",
  },
  {
    title: "Safe enough for ongoing automation",
    body: "Agents can read context freely, but write actions can be routed through confirmations, human review, scoped API keys, and per-business isolation.",
  },
  {
    title: "Designed around businesses and topics",
    body: "Organize agents by workspace, business, topic, schedule, and dashboard tab so every automation has a clear owner and durable context.",
  },
] as const;

export const featureHighlights = [
  "Workspace, business, topic, and agent hierarchy",
  "Interactive chat panel plus scheduled/background agents",
  "Cron, webhook, manual, retry, and chain-on-done/fail runs",
  "OpenClaw named agents and Hermes named profiles",
  "Claude Code CLI and OpenAI Codex subscription-style providers",
  "MCP tool catalog with per-agent permissions",
  "Telegram, Slack, Discord, SMTP email, and Web Push outputs",
  "Human-in-the-loop queue for approvals and risky actions",
  "Cost, token, run, queue, and provider dashboards",
  "Encrypted scoped keys by topic, business, workspace, and env fallback",
  "Marketplace and reusable agent presets",
  "Self-improvement backlog for proposed, approved, and built ideas",
] as const;

export const providerRows = [
  [
    "OpenClaw",
    "CLI subprocess with sessions and named agents",
    "Local agent automation, coding, and long-lived workspace context",
  ],
  [
    "Hermes Agent",
    "Hermes profile or hermes chat subprocess",
    "Persistent memory/profile workflows and operator agents",
  ],
  [
    "Claude Code CLI",
    "Local claude binary in streaming print mode",
    "Claude subscription workflows without API billing",
  ],
  [
    "OpenAI Codex",
    "ChatGPT/Codex OAuth token plus MCP loop support",
    "Codex-style coding agents and tool loops",
  ],
  [
    "Anthropic Claude API",
    "Direct Anthropic streaming API",
    "Production Claude agents and tool use",
  ],
  [
    "MiniMax",
    "MiniMax chat plus native MCP tool loops",
    "Search, image understanding, and cost-conscious agent runs",
  ],
  [
    "OpenRouter",
    "Hosted model routing through OpenRouter",
    "Multi-model experiments and fallback routing",
  ],
  [
    "Ollama",
    "Workspace or env-configured Ollama endpoint",
    "Private local models and offline-friendly runs",
  ],
] as const;

export const outputChannels = [
  {
    name: "Telegram",
    body: "Forum topics, group targets, bot commands, run reports, queue alerts, and per-business routing.",
  },
  {
    name: "Slack",
    body: "Slash commands, interactivity callbacks, channel targets, approvals, and run notifications.",
  },
  {
    name: "Discord",
    body: "Application commands, interaction callbacks, channel targets, approvals, and run alerts.",
  },
  {
    name: "Email and Web Push",
    body: "SMTP run reports, device push notifications, failed-run alerts, and queue reminders.",
  },
] as const;

export const workflowCards = [
  {
    title: "Operate many small businesses",
    body: "Create a business for each revenue stream or client, then attach agents, topics, schedules, integrations, costs, queue items, and dashboards to that business.",
  },
  {
    title: "Turn chat into durable work",
    body: "Use the chat panel to ask an agent for help, then promote useful prompts into scheduled runs, webhook triggers, or reusable marketplace presets.",
  },
  {
    title: "Keep humans in control",
    body: "Route uncertain, expensive, risky, brand-sensitive, or destructive actions into the HITL queue before the platform executes them.",
  },
  {
    title: "Ship outputs where teams already look",
    body: "AIO Control sends agent results to Telegram, Slack, Discord, email, dashboards, and public share links instead of trapping work inside a chat transcript.",
  },
] as const;

export const docPages: DocPage[] = [
  {
    slug: "features",
    title: "Key features",
    eyebrow: "Product scope",
    summary:
      "AIO Control is a practical agent operations console: workspace setup, provider setup, chat, schedules, runs, review, outputs, costs, and dashboards in one place.",
    why: [
      "You can run more than one provider without relearning every CLI each day.",
      "You can see what agents did, what they cost, and what needs review.",
      "You can separate client or business credentials instead of mixing everything in one env file.",
    ],
    sections: [
      {
        title: "Agent control",
        body: "Agents can be workspace-global or business-scoped, and can act as chat agents, workers, reviewers, generators, or routers.",
        bullets: [
          "Provider/model selection per agent",
          "System prompts and business context",
          "Smart routing rules by input length, keywords, and turn count",
          "Agent chains for follow-up or failure triage",
        ],
      },
      {
        title: "Run operations",
        body: "The run system gives background work an audit trail instead of hiding it in a terminal.",
        bullets: [
          "Cron, webhook, manual, retry, and callback runs",
          "Run drawer with status, messages, tool calls, tokens, and cost",
          "Runtime pressure health checks",
          "Schedule memory for stable resources and last-run summaries",
        ],
      },
      {
        title: "Operator surfaces",
        body: "AIO Control includes the screens an operator needs to keep work moving.",
        bullets: [
          "Workspace dashboard",
          "Business dashboards",
          "Queue and runs pages",
          "Provider onboarding",
          "MCP tool setup",
          "Cost and spend views",
          "Marketplace and self-improvement backlog",
        ],
      },
    ],
  },
  {
    slug: "providers",
    title: "Provider and runtime support",
    eyebrow: "OpenClaw, Hermes Agent, Claude Code, Codex, and more",
    summary:
      "The provider router normalizes API models, local CLIs, OAuth-backed providers, local models, and MCP-capable runtimes into one streaming event shape.",
    why: [
      "Use the strongest provider for each job instead of forcing every task through one model.",
      "Keep subscription providers like Claude Code and Codex next to API providers like Anthropic, MiniMax, and OpenRouter.",
      "Let local tools such as OpenClaw, Hermes Agent, and Ollama live inside the same operational dashboard.",
    ],
    sections: [
      {
        title: "CLI providers",
        body: "AIO Control can spawn local agent CLIs as subprocesses while preserving workspace and business context.",
        bullets: [
          "OpenClaw agent mode with session IDs and named agents",
          "Hermes chat and named profile support",
          "Claude Code CLI streaming print mode",
          "Friendly runtime errors for missing binaries, auth mismatch, and quota problems",
        ],
      },
      {
        title: "API and OAuth providers",
        body: "Hosted providers use direct streaming adapters while keeping tenant context and cost attribution.",
        bullets: [
          "Anthropic Claude API",
          "OpenAI Codex with ChatGPT/Codex OAuth",
          "OpenRouter chat completions",
          "MiniMax chat and native tool loops",
        ],
      },
      {
        title: "Local models",
        body: "Ollama support lets workspaces route agents to private model endpoints.",
        bullets: [
          "Workspace-configured Ollama endpoint",
          "Model scanning in settings",
          "Fallback to OLLAMA_BASE_URL",
          "Useful for private, low-cost, or offline-adjacent tasks",
        ],
      },
    ],
  },
  {
    slug: "workflows",
    title: "Workflows and automations",
    eyebrow: "From prompt to repeatable operation",
    summary:
      "AIO Control is strongest when a one-off agent prompt becomes a scheduled, observable, reviewable workflow.",
    why: [
      "Agents can run when you are not watching, but still leave a readable trail.",
      "Webhooks can turn external events into agent runs.",
      "Chains let one agent produce, another review, and another publish or notify.",
    ],
    sections: [
      {
        title: "Scheduled routines",
        body: "Use cron schedules for recurring work such as research, outreach, reporting, cleanup, monitoring, translation, or content production.",
        bullets: [
          "Local node-cron scheduler on the VPS",
          "Claude subscription path for Claude Routines",
          "Retry sweeps for stuck or failed work",
          "Schedule-level memory to avoid recreating resources",
        ],
      },
      {
        title: "Webhook triggers",
        body: "Expose trigger URLs that external systems can call to launch a scoped agent run.",
        bullets: [
          "Secret-protected trigger routes",
          "Business and topic context",
          "Payload-aware prompts",
          "Notifications after completion or review",
        ],
      },
      {
        title: "Human review",
        body: "Review queues turn agent uncertainty into an explicit operator decision.",
        bullets: [
          "Approve, reject, skip, pause, or request fixes",
          "Risk level and confidence tracking",
          "Review learnings for future runs",
          "Notifications to Telegram, Slack, Discord, email, or push",
        ],
      },
    ],
  },
  {
    slug: "outputs",
    title: "Outputs and notification channels",
    eyebrow: "Telegram, Slack, Discord, email, push, dashboards",
    summary:
      "AIO Control is designed to push agent work back to the channels where operators already coordinate.",
    why: [
      "You do not need to keep the dashboard open to know what happened.",
      "Different businesses can report to different targets.",
      "Approvals and commands can happen from chat tools, not just the web UI.",
    ],
    sections: [
      {
        title: "Telegram",
        body: "Telegram is a first-class output channel for solo operators and forum-topic style business routing.",
        bullets: [
          "BotFather setup flow",
          "Workspace, business, and topic targets",
          "Optional forum topic IDs",
          "Inbound commands and run reports",
          "Failure alerts for both provider errors and pre-flight dispatcher blocks",
        ],
      },
      {
        title: "Slack",
        body: "Slack support is built around slash commands, interactivity, and channel targets.",
        bullets: [
          "Manifest helper",
          "Slash command endpoint",
          "Interactivity endpoint",
          "Channel targets and approvals",
        ],
      },
      {
        title: "Discord",
        body: "Discord support uses application commands and interaction callbacks.",
        bullets: [
          "Public key verification",
          "Bot token setup",
          "Guild command registration",
          "Channel targets and run alerts",
        ],
      },
      {
        title: "Dashboards and share links",
        body: "Agents can publish dashboard tabs, public dashboards, and business/topic artifacts instead of only sending text.",
        bullets: [
          "Custom tabs per business/topic",
          "Agent-published dashboards",
          "Public dashboard slugs",
          "Run drawer links to published artifacts",
        ],
      },
    ],
  },
  {
    slug: "mcp-tools",
    title: "MCP tools",
    eyebrow: "Model Context Protocol inside the operator console",
    summary:
      "The native MCP host lets providers use search, browser automation, files, shell, memory, image generation, and AIO platform tools without routing every job through one model.",
    why: [
      "Agents can inspect the platform state before acting.",
      "External tools can be scoped per agent.",
      "Read-only and write-capable modes reduce accidental damage.",
    ],
    sections: [
      {
        title: "Built-in server catalog",
        body: "AIO Control ships with IDs for local and external MCP servers.",
        bullets: [
          "aio platform tools",
          "filesystem",
          "bash",
          "fetch",
          "playwright",
          "brave search",
          "memory",
          "firecrawl",
          "minimax",
          "image tools",
        ],
      },
      {
        title: "AIO platform tools",
        body: "Internal MCP tools expose workspace-safe context and controlled actions.",
        bullets: [
          "List businesses, agents, runs, schedules, topics, and integrations",
          "Resolve business and topic IDs from natural names",
          "Read Supabase context without exposing secrets",
          "Publish dashboards and request human review",
        ],
      },
      {
        title: "Permission scoping",
        body: "Agents can be configured with filesystem and AIO MCP scopes.",
        bullets: [
          "off disables a server",
          "ro exposes read-only tools",
          "rw exposes full tool access",
          "Write tools can still require confirmation at the AIO layer",
        ],
      },
    ],
  },
  {
    slug: "operations",
    title: "Operations and deployment",
    eyebrow: "Self-hosted VPS workflow",
    summary:
      "The project is built for a VPS deployment with two Next.js standalone builds, Supabase/Postgres, Caddy TLS, systemd services, and explicit health/version checks.",
    why: [
      "You can host the control plane yourself.",
      "Deploys are reproducible and version-checked.",
      "The app exposes health signals for Supabase and runtime pressure.",
    ],
    sections: [
      {
        title: "Production layout",
        body: "The VPS runs one path build and one subdomain build from the same repository and environment.",
        bullets: [
          "Path build on port 3010 for /aio",
          "Root/subdomain build on port 3012",
          "Caddy fronts both with TLS",
          "systemd keeps both processes running",
        ],
      },
      {
        title: "Deploy script",
        body: "The deploy script fetches main, installs dependencies, builds both variants, stages atomically, restarts services, and checks health.",
        bullets: [
          "pnpm install --frozen-lockfile",
          "Next.js standalone output",
          "Build metadata baked into /api/version",
          "Health check waits before marking deploy live",
        ],
      },
      {
        title: "Runtime monitoring",
        body: "The health endpoint watches both Supabase reachability and agent runtime pressure.",
        bullets: [
          "Supabase auth readiness",
          "Running run count",
          "Stale running run count",
          "Queued run count",
        ],
      },
    ],
  },
  {
    slug: "security",
    title: "Security and control",
    eyebrow: "Scoped credentials, RLS, and review gates",
    summary:
      "AIO Control assumes agents need useful context, but operators need boundaries, review points, and credential hygiene.",
    why: [
      "Client or business credentials can be isolated.",
      "Agents can be useful without receiving every secret by default.",
      "Risky actions can become review items instead of silent writes.",
    ],
    sections: [
      {
        title: "Data boundaries",
        body: "The app uses Supabase Auth, workspace membership, and row-level security for user data.",
        bullets: [
          "Workspace membership roles",
          "RLS on user-data tables",
          "Service role only on server-side code",
          "Public routes limited to auth flows, docs, share pages, dashboards, and signed webhooks",
        ],
      },
      {
        title: "Credential resolution",
        body: "Keys can be resolved at the narrowest useful scope.",
        bullets: [
          "Topic keys",
          "Business keys",
          "Workspace keys",
          "Environment fallback",
          "Owner-scoped credential support",
        ],
      },
      {
        title: "Review and approvals",
        body: "Agents can ask for confirmation or create review items when confidence is low or risk is high.",
        bullets: [
          "Confirmation before write tools",
          "HITL queue for unresolved decisions",
          "Approval/rejection learning",
          "Channel notifications for review work",
        ],
      },
    ],
  },
];

export function getDocPage(slug: string): DocPage | undefined {
  return docPages.find((page) => page.slug === slug);
}
