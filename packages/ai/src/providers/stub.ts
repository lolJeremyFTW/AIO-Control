// Placeholder used by providers we haven't implemented yet (MiniMax MCP,
// Codex). Emits a single error event so the chat panel can show a clear
// "configure this provider" message.

import type { AGUIEvent } from "../ag-ui";
import type { StreamChatOptions } from "../router";

export async function* streamNotConfigured(
  _opts: StreamChatOptions,
  message: string,
): AsyncIterable<AGUIEvent> {
  yield {
    type: "error",
    code: "not_configured",
    message,
  };
}
