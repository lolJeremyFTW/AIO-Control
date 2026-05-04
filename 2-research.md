# AIO Control Research Notes

## AI Provider Architecture

All source files are in `packages/ai/src/`. Key files:

| File | Role |
|---|---|
| `router.ts` | Provider router + `StreamChatOptions` interface + `streamChat()` dispatcher |
| `ag-ui.ts` | `AGUIEvent` union type (the wire protocol/stream event format) |
| `aio-tools.ts` | `AIO_TOOLS` registry (all platform tools agents can call) |
| `pricing.ts` | Per-model token pricing in USD cents |
| `providers/claude.ts` | Anthropic SDK streaming (HTTP/SSE) |
| `providers/claude-cli.ts` | Claude Code CLI `--print --output-format stream-json` subprocess |
| `providers/openrouter.ts` | OpenAI-compatible HTTP/SSE to `openrouter.ai` |
| `providers/ollama.ts` | Local Ollama HTTP/SSE |
| `providers/minimax.ts` | MiniMax HTTP/SSE (direct platform API) |
| `providers/minimax-mcp.ts` | MiniMax via Claude Code subprocess + MCP |
| `providers/openclaw.ts` | OpenClaw CLI subprocess (`openclaw agent --local --json`) |
| `providers/hermes.ts` | Hermes Python CLI subprocess (`hermes chat --json`) |
| `providers/stub.ts` | `streamNotConfigured()` placeholder |
| `providers/generic-http.ts` | Generic OpenAI-shape HTTP relay (unused but available) |

---

### 1. Provider Interface / Base Class

**There is no formal `Provider` interface or base class.**

Each provider is a plain async generator function with this exact signature:

```typescript
async function* streamProviderName(opts: StreamChatOptions): AsyncIterable<AGUIEvent>
```

Where `StreamChatOptions` (from `router.ts`) is:

```typescript
interface StreamChatOptions {
  provider: ProviderId;
  config: AgentConfig;       // { systemPrompt?, model?, temperature?, maxTokens?, mcpServers?, endpoint?, headers?, routingRules? }
  messages: ChatMessage[];   // { role: "system"|"user"|"assistant"; content: string }[]
  runId?: string;
  apiKey?: string | null;    // resolved per-tenant key; falls back to process.env.<PROVIDER>_API_KEY
  tenant?: {                 // tenancy context for per-workspace resource resolution
    workspaceId: string;
    businessId?: string | null;
    navNodeId?: string | null;
    ollamaEndpoint?: string | null;    // workspace-level Ollama URL
    hermesAgentName?: string | null;   // persistent Hermes profile name
    openclawAgentName?: string | null; // persistent OpenClaw agent name
  };
  sessionId?: string;        // stable session id for subprocess providers (openclaw/hermes)
  tools?: Array<{            // AIO Control function-tools exposed to the model
    name: string;
    description: string;
    parameters: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  }>;
}
```

**Required methods a provider must implement (implicit contract):**

1. Accept `StreamChatOptions` as the only argument.
2. Yield a `message_start` event first: `yield { type: "message_start", message_id: <uuid>, role: "assistant" }`.
3. Yield zero or more `token` events: `yield { type: "token", message_id, delta: string }`.
4. Yield zero or more `tool_call_start` events: `yield { type: "tool_call_start", tool_call_id, name, args }`.
5. Yield zero or more `tool_call_result` events (for tool results fed back): `yield { type: "tool_call_result", tool_call_id, output }`.
6. Yield a `message_end` event last: `yield { type: "message_end", message_id, usage: { input_tokens, output_tokens, cost_cents } }`.
7. On error, optionally yield an `error` event and return early (no `message_end`).

All providers are **pure functions** — no class inheritance, no interface, no dependency injection container. They are registered by adding a `case` in the `streamChat()` switch in `router.ts`.

---

### 2. Provider Instantiation and Selection

**Instantiation:** Providers are not instantiated — they are plain functions called directly in the switch statement:

```typescript
// router.ts lines 165-212
switch (opts.provider) {
  case "claude":      yield* streamClaude(opts);      return;
  case "claude_cli":  yield* streamClaudeCli(opts);    return;
  case "openrouter":  yield* streamOpenRouter(opts);   return;
  case "ollama":      yield* streamOllama(opts);       return;
  case "openclaw":    yield* streamOpenclaw(opts);     return;
  case "hermes":      yield* streamHermes(opts);       return;
  case "minimax":     yield* streamMinimax(opts);      return;
  // ...
}
```

**Selection:** `streamChat()` is the single entry point. The caller passes a `ProviderId` + `AgentConfig`. The function applies **smart-routing rules** first (`pickRouted()`), which can redirect to a different provider/model based on input length, content keywords, or conversation depth. If no rule matches, it dispatches to the configured provider.

**Supported `ProviderId` values:**
- `"claude"` — Anthropic HTTP API (API key required)
- `"claude_cli"` — Local Claude Code CLI subprocess (subscription-based, no API key)
- `"openrouter"` — OpenAI-compatible HTTP proxy (100+ models)
- `"ollama"` — Local/self-hosted Ollama HTTP server
- `"minimax"` — MiniMax platform HTTP API (or MCP-via-Claude if `mcpServers` is set)
- `"openclaw"` — OpenClaw CLI subprocess
- `"hermes"` — Hermes Python CLI subprocess
- `"codex"` — Not yet implemented (placeholder)

**API key resolution order:**
1. `opts.apiKey` (per-request, resolved per-tenant)
2. `process.env.<PROVIDER>_API_KEY` (env fallback per provider name)

---

### 3. Non-LLM Provider Abstraction (Voice/TTS/STT)

**There is no abstraction for non-LLM providers.** The entire provider layer is LLM-only.

Voice, TTS, and STT are not mentioned anywhere in `packages/ai/src/`. The `AGUIEvent` union does not contain any voice-related event types. The `AIO_TOOLS` registry contains only text-based tools (list_businesses, create_agent, etc.). There is no `ProviderId` for voice, no `streamVoice()` function, no voice-specific event type.

If voice/TTS/STT support were added in the future, it would require entirely new event types (e.g., `audio_start`, `audio_chunk`, `transcript`) and new provider functions — the current architecture provides no hook or abstraction for it.

---

### 4. Streaming and AG-UI Events

**AG-UI is the wire protocol** — inspired by `github.com/ag-ui-protocol/ag-ui`. Every provider normalizes its output to `AGUIEvent` tokens, and `streamChat()` is itself an `AsyncIterable<AGUIEvent>` so consumers get a uniform stream regardless of which provider is used.

**Standard AG-UI event types** (`ag-ui.ts`):

```typescript
// Core chat streaming
{ type: "message_start";    message_id: string; role: "assistant" }
{ type: "token";             message_id: string; delta: string }
{ type: "tool_call_start";   tool_call_id: string; name: string; args: unknown }
{ type: "tool_call_result";  tool_call_id: string; output: unknown }
{ type: "message_end";      message_id: string; usage: { input_tokens, output_tokens, cost_cents } }
{ type: "state_update";     patch: Record<string, unknown> }
{ type: "error";            code: string; message: string }

// AIO Control extensions (rendered specially by the chat panel)
{ type: "ask_followup";      tool_call_id: string; question: string; options?: { label, description }[] }
{ type: "todo_set";          items: Array<{ id, content, status }> }
{ type: "plan_proposed";     tool_call_id: string; title: string; body: string }
{ type: "open_ui_at";        path: string; label?: string }
{ type: "confirm_required";  tool_call_id: string; summary: string; kind: string; pending: { name, args }; assistant_text?: string }
```

**How streaming works end-to-end:**

1. Caller (e.g., `chat-route.ts`) invokes `streamChat(opts)` which returns an `AsyncIterable<AGUIEvent>`.
2. `streamChat()` first runs `pickRouted()` to resolve smart-routing rules. If a rule redirects, it recursively calls itself with the new provider/model (guarded against loops).
3. The appropriate provider function is called. Each provider handles its own transport:
   - **HTTP/SSE** (claude, openrouter, ollama, minimax, generic-http): Uses `fetch()` with `stream: true`, iterates `response.body` as `AsyncIterable<Uint8Array>`, decodes SSE lines, parses per-provider JSON shape, yields `token` events per delta.
   - **Subprocess** (claude-cli, openclaw, hermes, minimax-mcp): Uses `child_process.spawn()`, writes prompt to stdin, reads stdout line-by-line as JSON stream-json, parses events, yields `token` / `tool_call_start` events.
4. Tool calls (`tool_call_start`) are yielded as the model produces them. The chat-route's tool-execution layer receives these events, runs the actual tool, and then re-invokes `streamChat()` with a `tool_result` message appended to the messages array — effectively resuming the stream.
5. The final `message_end` event carries `usage: { input_tokens, output_tokens, cost_cents }`. The `priceTokens()` function in `pricing.ts` converts token counts to USD cents using a hardcoded `PRICING` table per model.

**Key design notes:**
- No backpressure mechanism — events are yielded as they arrive.
- `sessionId` is passed to subprocess providers (openclaw, hermes) to maintain conversation context across turns in the same chat thread.
- `tenant.ollamaEndpoint`, `tenant.hermesAgentName`, and `tenant.openclawAgentName` allow per-workspace resource routing without a DB round-trip in the provider.
- Token counts and cost are provider-calculated (or 0 for subprocess providers and openrouter, which don't report usage).

---

## ElevenLabs TTS API

**Base URL:** `https://api.elevenlabs.io/v1/`

**Authentication:** Header `xi-api-key: <your-api-key>` (required on every request)

**Available regional endpoints** (for data residency):
- `https://api.elevenlabs.io` (default)
- `https://api.us.elevenlabs.io`
- `https://api.eu.residency.elevenlabs.io`
- `https://api.in.residency.elevenlabs.io`

---

### Endpoints

#### 1. Text-to-Speech (non-streaming, returns binary audio)

**`POST /v1/text-to-speech/{voice_id}`**

- Path param: `voice_id` (string, required)
- Returns: binary audio (`application/octet-stream`, default MP3) on HTTP 200; `application/json` on 422 validation error

#### 2. Text-to-Speech Streaming

**`POST /v1/text-to-speech/{voice_id}/stream`**

- Path param: `voice_id` (string, required)
- Returns: streaming audio as `text/event-stream` with binary audio chunks (`audio/mpeg` for MP3)
- The SDK example shows `Content-Type: application/json` on the request body

---

### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `text` | string | **Yes** | — | Text to convert to speech |
| `model_id` | string | No | `eleven_multilingual_v2` | Model identifier |
| `voice_settings` | object | No | — | Override stored voice settings |
| `language_code` | string | No | — | ISO 639-1 language code |

**`voice_settings` properties:**

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `stability` | number | `0.5` | Voice stability. Higher = more consistent/monotonous; lower = broader emotional range |
| `similarity_boost` | number | `0.75` | How closely the AI adheres to the original voice when replicating it |
| `style` | number | `0` | Style exaggeration (higher = more expressive; 0 = neutral) |
| `use_speaker_boost` | boolean | `true` | Boost similarity to original speaker |
| `speed` | number | `1.0` | Speech speed (1.0 = normal) |

---

### Query Parameters (both endpoints)

| Parameter | Values | Description |
|-----------|--------|-------------|
| `output_format` | `mp3_44100_128` (default), `mp3_44100_64`, `pcm_44100`, `pcm_24000`, `ulaw_8000`, etc. | Audio output format |
| `optimize_streaming_latency` | `0`–`4` | Latency optimization level (0 = no optimization, 4 = maximum) |
| `enable_logging` | boolean | `false` enables zero-retention mode (no logging) |

---

### Response Format

- **Non-streaming:** Binary audio (MP3 by default — `application/octet-stream` with `Content-Type: audio/mpeg`)
- **Streaming:** Server-Sent Events stream (`text/event-stream`), each event containing binary audio data chunks
- Output formats: MP3, Opus, PCM, WAV in various sample rates (configured via `output_format` query param)

---

### Voice IDs

**Default voices** are included in the voice library but their string IDs are not published in public docs (they are retrieved via `GET /v2/voices`). The docs explicitly mention Rachel, Adam, Bella, Josh, and Dani as default voices (included in the first page of results).

The `voice_id` in the URL is a UUID-style string, e.g., `JBFqnCBsd6RMkjVDRZzb` (used as a sample in ElevenLabs documentation).

To list available voices:
```
GET /v2/voices
Headers: xi-api-key: <key>
Query: voice_ids=<id1>,<id2>,... (max 100)
```

---

### Node.js HTTP Example (server-side, no SDK)

**Streaming via fetch + ReadableStream:**

```javascript
// Node.js >= 18 — native fetch + streaming
const voiceId = 'JBFqnCBsd6RMkjVDRZzb';
const apiKey = process.env.ELEVENLABS_API_KEY;

const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: 'The first move is what sets everything in motion.',
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
        speed: 1.0,
      },
    }),
  }
);

// response.body is a ReadableStream<Uint8Array>
for await (const chunk of response.body) {
  // chunk is a Uint8Array of MP3 audio data — pipe to file or WebSocket
  process.stdout.write(chunk);
}
```

**Non-streaming (full audio in memory):**

```javascript
const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: 'Hello, this is a test.',
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  }
);

const buffer = Buffer.from(await response.arrayBuffer());
// buffer contains the full MP3 file
```

**Using the native `http` module (no fetch):**

```javascript
const http = require('http');

const postData = JSON.stringify({
  text: 'The first move is what sets everything in motion.',
  model_id: 'eleven_multilingual_v2',
  voice_settings: {
    stability: 0.5,
    similarity_boost: 0.75,
  },
});

const options = {
  hostname: 'api.elevenlabs.io',
  path: `/v1/text-to-speech/${voiceId}/stream`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'xi-api-key': apiKey,
    'Content-Length': Buffer.byteLength(postData),
  },
};

const req = http.request(options, (res) => {
  res.on('data', (chunk) => {
    // chunk is a Buffer of MP3 audio data
    process.stdout.write(chunk);
  });
});

req.write(postData);
req.end();
```

**Key headers to remember:**
- `xi-api-key` — your ElevenLabs API key (secret, never client-side)
- `Content-Type: application/json` — request body format
- `Accept` (optional) — `audio/mpeg`, `audio/wav`, or omit for SSE stream via `text/event-stream`

---

### Sources

- [ElevenLabs API Reference](https://elevenlabs.io/docs/api-reference)
- [Text-to-Speech Create Speech (convert)](https://elevenlabs.io/docs/api-reference/text-to-speech/convert.mdx)
- [Text-to-Speech Stream Speech](https://elevenlabs.io/docs/api-reference/text-to-speech/stream.mdx)
- [Authentication docs](https://elevenlabs.io/docs/api-reference/authentication.mdx)
- [Voice Search / List Voices](https://elevenlabs.io/docs/api-reference/voices/search)
- [OpenAPI spec](https://elevenlabs.io/openapi.json)