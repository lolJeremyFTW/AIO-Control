# 3-map.md — AIO Control Codebase Map

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 (App Router, Server Actions, Route Handlers) |
| Auth | Supabase Auth (cookie session via `@supabase/ssr`) |
| Database | Supabase/PostgreSQL (`aio_control` schema, RLS enforced) |
| AI providers | Anthropic Claude, OpenRouter, MiniMax, Ollama, Hermes CLI, OpenClaw CLI |
| Realtime | Supabase Realtime (for future run notifications) |
| Push | Web Push API (for browser notifications) |
| Styling | CSS custom properties + plain CSS (no Tailwind) |
| Package manager | pnpm (monorepo: `packages/ai`, `apps/control`) |

---

## Entry Points

### Chat UI → `ChatPanel.tsx`
`apps/control/components/ChatPanel.tsx`

- Client component. Mounted in `WorkspaceShell.tsx` line 1047 only when `chatPanelAgents` prop is provided.
- Agent selection: dropdown from `agents` prop (full `AgentRow[]`).
- User picks an agent, types a message, hits send.

### Voice UI → `TalkModule.tsx`
`apps/control/components/TalkModule.tsx`

- Client component in `WorkspaceShell.tsx` header (line 913–918), prop `agents: TalkAgent[]`.
- Agent list built in `WorkspaceShell.tsx` lines 322–353 — maps workspace agents to `TalkAgent[]` (name, variant from business, static `"online"` status, voice label from `provider · model`).
- **Talk settings are NOT read at runtime by TalkModule** — TalkModule only saves to `talk_settings` via `saveTalkSettings` server action.

### Server Actions
- `apps/control/app/actions/chat.ts` — `listThreads`, `createThread`, `updateThreadTitle`, `deleteThread`, `listMessages`, `ensureThreadForChat`, `persistChatTurn`
- `apps/control/app/actions/talk.ts` — `saveTalkSettings(TalkSettingsInput & {workspace_slug})` → upserts `talk_settings` table

---

## Critical Paths

### Path A: Text Chat (`/api/chat/[agent_id]`)

```
ChatPanel.tsx (client)
  POST /api/chat/[agent_id]  { messages, thread_id?, approve_tool? }
    → chat/route.ts POST
      1. getAgentById(agent_id)
      2. checkSpendLimit(business_id)
      3. ensureThreadForChat(...)
      4. Insert runs row
      5. buildAgentSystemPrompt(agent)
      6. resolveApiKey(provider, ctx)
      7. resolveOllamaEndpoint(ws_id)
      8. streamChat(opts) — packages/ai/src/router.ts:145
         → streamClaude / streamOpenRouter / streamMinimax / streamOllama / streamHermes / streamOpenclaw
      9. Multi-turn tool loop (max 5 hops):
          executeAioTool(name, args, ctx)
          If defer → emit AG-UI event, stop loop
          If ok → append tool_result to messages, continue
      10. On stream end: update runs row
      11. dispatchRunEvent(run, "done")
      12. persistChatTurn(thread_id, ...)
      13. SSE response
```

**Key function signatures:**

`POST /api/chat/[agent_id]` (`apps/control/app/api/chat/[agent_id]/route.ts:56`)
```ts
Body: {
  messages: ChatMessage[];
  thread_id?: string;
  approve_tool?: { tool_call_id: string; decision: "approve" | "cancel" };
}
Returns: text/event-stream (SSE), headers: x-aio-thread-id, x-aio-run-id
```

`streamChat(opts: StreamChatOptions): AsyncIterable<AGUIEvent>` (`packages/ai/src/router.ts:145`)

### Path B: Talk Settings (read @ runtime)

**Saving:** `saveTalkSettings()` (`app/actions/talk.ts:36`) upserts `aio_control.talk_settings`.

**Reading at runtime:** `/[workspace_slug]/settings/talk/page.tsx` lines 48-61:
```ts
const [{ data: row }] = await Promise.all([
  supabase.from("talk_settings").select("...").eq("workspace_id", workspace.id).maybeSingle()
]);
```

**TalkModule does NOT read `talk_settings` at runtime.** The actual audio processing pipeline (STT → LLM → TTS) is **NOT yet implemented** — TalkModule currently only has the mic button UI (toggle state `listening`), but no actual audio capture, no STT call, no TTS call. The settings page comment at line 87–89 explicitly says "Log: empty for now."

---

## Externe Integraties

| Integration | File | Description |
|---|---|---|
| Anthropic Claude | `packages/ai/src/providers/claude.ts` | SDK streaming, tool_use |
| OpenRouter | `packages/ai/src/providers/openrouter.ts` | OpenAI-compatible SSE |
| MiniMax | `packages/ai/src/providers/minimax.ts` | Direct HTTP |
| Ollama | `packages/ai/src/providers/ollama.ts` | Local, endpoint resolved per workspace |
| Hermes CLI | `packages/ai/src/providers/hermes.ts` | Subprocess `hermes chat --json` |
| OpenClaw CLI | `packages/ai/src/providers/openclaw.ts` | Subprocess `openclaw agent` |
| Telegram | `lib/notify/telegram.ts` | `sendTelegram()` |
| Email | `lib/notify/email.ts` | `sendEmail()` |
| Supabase DB (service role) | `lib/supabase/service.ts` | `getServiceRoleSupabase()` |

---

## Configuratie / Secrets

Resolution order for API keys (`lib/api-keys/resolve.ts:31`):
```
navnode → business → workspace → env-var fallback
```

---

## Mogelijk Audit-Relevant

**1. No audio pipeline exists yet**
`TalkSettings.tsx` line 87–89 comment: "Log: empty for now — wired to the actual interactions table when push-to-talk is hooked into the chat-route." The `talk_settings` table and `TalkModule` UI are scaffolding — the STT→LLM→TTS flow is not yet built.

**2. `talk_settings` table** (`packages/db/supabase/migrations/038_talk_settings.sql`)
Workspace-level STT/TTS/voice config. No audio is currently processed — this is stored config only.

**3. Voice IDs are display names, not ElevenLabs IDs**
`TalkSettings.tsx` VOICES array hardcodes: `rachel`, `adam`, `bella`, `daniel`, `sarah`, `antoni` — these are display labels, NOT ElevenLabs voice IDs. The actual voice IDs need to be resolved via ElevenLabs Voices API.

**4. Provider architecture is LLM-only**
`packages/ai/src/` — no voice, TTS, or STT provider IDs exist. Adding voice requires entirely new provider types.

**5. Pending approvals are in-memory**
`lib/agents/pending-approvals.ts` — server-side in-memory Map (no DB row), expires when server restarts.
