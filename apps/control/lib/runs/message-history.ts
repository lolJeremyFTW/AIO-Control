// Shape of the per-run conversation we capture during dispatch.
//
// Stored as runs.message_history jsonb; consumed by the run-detail drawer to
// render a past run chat-style (user bubble → assistant bubble → tool call
// chip → tool result → error). Designed to round-trip with the AGUIEvent
// stream emitted by the provider router.

export type RunStep =
  | { kind: "user"; text: string; at?: string }
  | { kind: "assistant"; text: string; at?: string }
  | {
      kind: "tool_call";
      name: string;
      args: unknown;
      result?: unknown;
      at?: string;
    }
  | { kind: "error"; message: string; at?: string };

export type RunMessageHistory = RunStep[];
