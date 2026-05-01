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
  | { type: "error"; code: string; message: string };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
