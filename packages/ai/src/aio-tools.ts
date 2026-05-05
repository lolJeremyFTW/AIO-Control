// AIO Control function-tools — the agents' window into the platform.
//
// Two categories:
//   - READ tools (list_*, get_*) execute immediately, no confirmation.
//   - WRITE tools (create_*, update_*, set_*) require user confirm in
//     the chat panel before they actually run, EXCEPT when the agent
//     is in "auto-approve" mode (a per-thread flag the user can flip).
//   - META tools (ask_followup, todo_set, open_ui_at) are emitted as
//     AG-UI events and don't return a useful payload — they're UI
//     side-effects the chat panel renders.
//
// The schemas here are JSONSchema-shaped so we can hand them to any
// provider that supports tool-use (Anthropic, OpenAI, Ollama, …).
// Per-provider conversion (e.g. Anthropic's Tool object) happens in
// the provider files.

export type AioToolCategory = "read" | "write" | "meta";

export type AioToolSpec = {
  name: string;
  category: AioToolCategory;
  description: string;
  /** JSONSchema for the args object. */
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

/** Canonical registry. Every tool the platform exposes lives here. */
export const AIO_TOOLS: Record<string, AioToolSpec> = {
  // ── READ ─────────────────────────────────────────────────────────
  list_businesses: {
    name: "list_businesses",
    category: "read",
    description:
      "List all businesses in the current workspace. Use this when the user asks 'what businesses do I have?' or before any action that operates on a specific business.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  list_agents: {
    name: "list_agents",
    category: "read",
    description:
      "List agents in the workspace. Optional scope filter: 'global' (workspace-wide), 'business' (only business-scoped), or 'all' (default).",
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["all", "global", "business"],
          description: "Which agents to include.",
        },
        business_id: {
          type: "string",
          description: "Filter to a specific business id (optional).",
        },
      },
      additionalProperties: false,
    },
  },
  list_integrations: {
    name: "list_integrations",
    category: "read",
    description:
      "List connected external services (YouTube, Stripe, Telegram, custom MCP servers, …) in the workspace.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  list_schedules: {
    name: "list_schedules",
    category: "read",
    description:
      "List cron + webhook + manual schedules across the workspace, optionally filtered to one business.",
    parameters: {
      type: "object",
      properties: {
        business_id: { type: "string", description: "Optional filter." },
      },
      additionalProperties: false,
    },
  },
  list_runs: {
    name: "list_runs",
    category: "read",
    description:
      "Recent agent runs. Useful for diagnosing failures or summarising activity.",
    parameters: {
      type: "object",
      properties: {
        business_id: { type: "string" },
        agent_id: { type: "string" },
        limit: { type: "number", description: "Default 20, max 100." },
        status: {
          type: "string",
          enum: ["queued", "running", "done", "failed", "review"],
        },
      },
      additionalProperties: false,
    },
  },
  get_workspace_settings: {
    name: "get_workspace_settings",
    category: "read",
    description:
      "Workspace-level defaults: default provider/model, default system prompt, telegram topology, etc.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  read_secret: {
    name: "read_secret",
    category: "read",
    description:
      "Read a workspace custom secret by its UPPERCASE name (e.g. AIRTABLE_API_KEY, MIJN_INTERNAL_TOKEN). Operators set these via Settings → API Keys → Custom secrets. Returns { value: string } when set, { value: null } when not configured. Use sparingly — never echo the value back to the chat verbatim.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Exact name of the custom secret as configured (e.g. AIRTABLE_API_KEY).",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },

  // ── WRITE (require confirm) ──────────────────────────────────────
  create_business: {
    name: "create_business",
    category: "write",
    description:
      "Create a new business under the current workspace. The user's confirmation is required before this runs.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Display name." },
        sub: { type: "string", description: "Optional subtitle / category." },
        description: { type: "string" },
        mission: { type: "string" },
        variant: {
          type: "string",
          description:
            "Color preset (orange, indigo, blue, violet, rose, amber, teal, lime, magenta, sky, coral, slate, gold, brand).",
        },
        icon: {
          type: "string",
          description:
            "AppIconName from the icon registry (e.g. video, rocket, briefcase). NOT an emoji.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  create_agent: {
    name: "create_agent",
    category: "write",
    description:
      "Create a new agent. Pass business_id=null for a workspace-global agent.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: {
          type: "string",
          enum: ["chat", "worker", "reviewer", "generator", "router"],
        },
        provider: {
          type: "string",
          enum: [
            "claude",
            "claude_cli",
            "openrouter",
            "minimax",
            "ollama",
            "openclaw",
            "hermes",
            "codex",
          ],
        },
        model: { type: "string" },
        systemPrompt: { type: "string" },
        business_id: {
          type: ["string", "null"],
          description: "Null for workspace-global agent.",
        },
        key_source: {
          type: "string",
          enum: ["subscription", "api_key", "env"],
          description:
            "Where credentials come from. 'subscription' is Claude-only.",
        },
      },
      required: ["name", "provider"],
      additionalProperties: false,
    },
  },
  update_agent: {
    name: "update_agent",
    category: "write",
    description:
      "Patch an existing agent. Only the supplied fields change.",
    parameters: {
      type: "object",
      properties: {
        agent_id: { type: "string" },
        patch: {
          type: "object",
          properties: {
            name: { type: "string" },
            model: { type: "string" },
            systemPrompt: { type: "string" },
            kind: { type: "string" },
          },
          additionalProperties: false,
        },
      },
      required: ["agent_id", "patch"],
      additionalProperties: false,
    },
  },
  create_schedule: {
    name: "create_schedule",
    category: "write",
    description:
      "Create a cron / webhook / manual schedule for an agent. For cron pass cron_expr (5-field, UTC).",
    parameters: {
      type: "object",
      properties: {
        agent_id: { type: "string" },
        kind: {
          type: "string",
          enum: ["cron", "webhook", "manual"],
        },
        cron_expr: { type: "string" },
        prompt: {
          type: "string",
          description: "Instructions the agent runs with on each tick.",
        },
        title: { type: "string" },
      },
      required: ["agent_id", "kind"],
      additionalProperties: false,
    },
  },

  // ── META (UI side-effects, emitted as AG-UI events) ──────────────
  ask_followup: {
    name: "ask_followup",
    category: "meta",
    description:
      "Pause and ask the user one clarifying question before continuing. Render multiple-choice options when there's a small set of likely answers — the user can also type free text. USE THIS LIBERALLY in plan-mode rather than guessing.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              description: { type: "string" },
            },
            required: ["label"],
          },
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
  todo_set: {
    name: "todo_set",
    category: "meta",
    description:
      "Replace the chat panel's todo list with this set. Update statuses as you progress (pending → in_progress → completed). Helps the user see what you're doing.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              content: { type: "string" },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed"],
              },
            },
            required: ["id", "content", "status"],
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
  open_ui_at: {
    name: "open_ui_at",
    category: "meta",
    description:
      "Suggest the user navigates to a UI path. Renders as a clickable link in the chat. Use when an action requires manual confirmation or a UI element you can't drive (auth flows, file pickers, etc.).",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Path within the workspace, e.g. '/[ws]/business/<id>/integrations'.",
        },
        label: { type: "string", description: "Link text." },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
};

export const AIO_TOOL_NAMES = Object.keys(AIO_TOOLS);
export const AIO_READ_TOOLS = Object.values(AIO_TOOLS).filter(
  (t) => t.category === "read",
);
export const AIO_WRITE_TOOLS = Object.values(AIO_TOOLS).filter(
  (t) => t.category === "write",
);
export const AIO_META_TOOLS = Object.values(AIO_TOOLS).filter(
  (t) => t.category === "meta",
);

/** Default tool sets per agent kind. EditAgentDialog uses this when
 *  the user hasn't customised allowed_tools yet. */
export function defaultToolsForKind(kind: string): string[] {
  switch (kind) {
    case "chat":
      // Chat agents get normal read + meta tools by default. Plaintext
      // secret access is explicit opt-in per agent.
      return [
        ...AIO_READ_TOOLS.map((t) => t.name).filter((n) => n !== "read_secret"),
        ...AIO_META_TOOLS.map((t) => t.name),
      ];
    case "router":
      // Router agents need to introspect siblings.
      return ["list_agents", "list_businesses", "ask_followup"];
    default:
      // Worker/reviewer/generator: minimal — only ask_followup for
      // edge-case clarifications.
      return ["ask_followup"];
  }
}
