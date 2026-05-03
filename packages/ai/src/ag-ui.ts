// AG-UI event format — the wire protocol our provider router emits and our
// chat panel consumes. Inspired by github.com/ag-ui-protocol/ag-ui; we adopt a
// minimal subset that fits multi-provider streaming with tool calls.

export type AGUIEvent =
  | { type: "message_start"; message_id: string; role: "assistant" }
  | { type: "token"; message_id: string; delta: string }
  | {
      type: "tool_call_start";
      tool_call_id: string;
      name: string;
      args: unknown;
    }
  | {
      type: "tool_call_result";
      tool_call_id: string;
      output: unknown;
    }
  | {
      type: "message_end";
      message_id: string;
      usage: { input_tokens: number; output_tokens: number; cost_cents: number };
    }
  | { type: "state_update"; patch: Record<string, unknown> }
  | { type: "error"; code: string; message: string }
  // ── AIO Control extensions to AG-UI ────────────────────────────────
  // These flow from the chat-route tool-dispatcher to the chat-panel
  // (and beyond) — they're not standard AG-UI events but the panel
  // knows how to render them. Inspired by Claude Code's plan-mode +
  // todo-panel + AskUserQuestion.
  | {
      type: "ask_followup";
      tool_call_id: string;
      question: string;
      /** Optional multiple-choice. When provided, the panel renders
       *  a button row; the user's pick is sent back as the
       *  tool_call_result. */
      options?: { label: string; description?: string }[];
    }
  | {
      type: "todo_set";
      items: Array<{
        id: string;
        content: string;
        status: "pending" | "in_progress" | "completed";
      }>;
    }
  | {
      type: "plan_proposed";
      tool_call_id: string;
      title: string;
      /** Markdown body describing context / steps / verification. */
      body: string;
    }
  | {
      type: "open_ui_at";
      path: string;
      /** Optional human-readable label for the link. */
      label?: string;
    }
  | {
      type: "confirm_required";
      tool_call_id: string;
      summary: string;
      /** Short danger label like "create_agent" or "set_api_key" so
       *  the panel can colour the confirm button. */
      kind: string;
    };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
