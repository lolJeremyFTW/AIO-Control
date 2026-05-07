# Slack and Discord Notifications Plan

Goal: add Slack and Discord with the same product shape as Telegram:
workspace/business/topic routing, run notifications, command input,
audit trail, allow/deny controls, test messages, and later automatic
topic/thread routing.

This plan intentionally avoids bolting `slack_target_id` and
`discord_target_id` onto every existing table. Telegram already proved
the shape works, but copying the columns per provider would make every
new channel more expensive. The target state is a provider-neutral
notification layer with provider-specific adapters.

## Existing Telegram Shape

Main files:

- `packages/db/supabase/migrations/016_telegram_and_integrations.sql`
- `packages/db/supabase/migrations/017_telegram_inbound.sql`
- `apps/control/lib/notify/dispatch.ts`
- `apps/control/lib/notify/telegram.ts`
- `apps/control/lib/notify/telegram-commands.ts`
- `apps/control/lib/notify/telegram-callbacks.ts`
- `apps/control/app/api/integrations/telegram/webhook/route.ts`
- `apps/control/components/TelegramPanel.tsx`
- `apps/control/app/actions/telegram.ts`

Current resolution order for run reports:

1. Schedule-specific Telegram target
2. Agent-specific Telegram target
3. Nav-node auto-created Telegram topic target
4. Business auto-created Telegram topic target
5. Oldest enabled workspace Telegram target

This hierarchy should survive in the new layer.

## Design Direction

Introduce a new notification layer:

- `notification_targets`: provider-specific destination config.
- `notification_bindings`: explicit links from workspace/business/navnode/agent/schedule to targets.
- `notification_inbound`: shared audit log for inbound commands/interactions.
- Provider adapters: `telegram`, `slack`, `discord`, and later `email/custom`.
- Command dispatcher shared by Telegram, Slack, and Discord.

Telegram can remain on its existing tables during phase 1. Slack and
Discord can launch on the new layer first. After parity is stable, add a
compatibility migration or read bridge so Telegram also resolves through
the generic layer.

## Database Proposal

### `aio_control.notification_targets`

Stores the actual destination.

```sql
create table aio_control.notification_targets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  provider text not null check (provider in ('telegram', 'slack', 'discord')),
  scope text not null check (scope in ('workspace', 'business', 'navnode')),
  scope_id uuid not null,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  allowlist text[] not null default array[]::text[],
  denylist text[] not null default array[]::text[],
  send_run_done boolean not null default true,
  send_run_fail boolean not null default true,
  send_queue_review boolean not null default true,
  enabled boolean not null default true,
  created_by uuid references aio_control.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Expected `config` by provider:

```json
{
  "telegram": {
    "chat_id": "-100123",
    "topic_id": 2
  },
  "slack": {
    "mode": "bot_token",
    "team_id": "T...",
    "channel_id": "C...",
    "thread_ts": null
  },
  "slack_webhook": {
    "mode": "incoming_webhook",
    "webhook_url_secret_provider": "SLACK_WEBHOOK_URL_OPS"
  },
  "discord": {
    "mode": "bot_token",
    "guild_id": "123",
    "channel_id": "456",
    "thread_id": null
  },
  "discord_webhook": {
    "mode": "webhook",
    "webhook_url_secret_provider": "DISCORD_WEBHOOK_URL_OPS"
  }
}
```

Secrets stay in `api_keys`, not in `config`. For example:

- `slack_bot_token`
- `slack_signing_secret`
- `discord_bot_token`
- `discord_public_key`
- optional custom secrets for webhook URLs

### `aio_control.notification_bindings`

Decouples "this agent reports here" from provider-specific columns.

```sql
create table aio_control.notification_bindings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  owner_type text not null check (owner_type in ('workspace', 'business', 'navnode', 'agent', 'schedule')),
  owner_id uuid not null,
  target_id uuid not null references aio_control.notification_targets(id) on delete cascade,
  event_mask text[] not null default array['run_done','run_fail']::text[],
  created_by uuid references aio_control.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, owner_type, owner_id, target_id)
);
```

This enables multiple targets per agent/schedule without adding more
columns. Resolution can still preserve the old priority:

1. Schedule bindings
2. Agent bindings
3. Nav-node bindings
4. Business bindings
5. Workspace bindings

### `aio_control.notification_inbound`

Shared audit trail for commands, buttons, and future message events.

```sql
create table aio_control.notification_inbound (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  target_id uuid references aio_control.notification_targets(id) on delete set null,
  provider text not null check (provider in ('telegram', 'slack', 'discord')),
  external_channel_id text,
  external_thread_id text,
  external_user_id text,
  external_username text,
  command text,
  text text,
  raw jsonb not null default '{}'::jsonb,
  dispatched_to text,
  dispatched_id uuid,
  created_at timestamptz not null default now()
);
```

## TypeScript Contracts

### Provider Adapter Interface

Create:

- `apps/control/lib/notify/providers/types.ts`
- `apps/control/lib/notify/providers/slack.ts`
- `apps/control/lib/notify/providers/discord.ts`
- later: `apps/control/lib/notify/providers/telegram.ts`

Contract:

```ts
export type NotificationProvider = "telegram" | "slack" | "discord";

export type NotificationEvent = "run_done" | "run_fail" | "queue_review";

export type NotificationTarget = {
  id: string;
  workspace_id: string;
  provider: NotificationProvider;
  config: Record<string, unknown>;
  enabled: boolean;
};

export type RunNotificationPayload = {
  event: "done" | "failed";
  run: RunRow;
  agent: AgentLite | null;
  links: {
    business?: string;
    runs?: string;
  };
};

export type NotificationAdapter = {
  sendRun(
    payload: RunNotificationPayload,
    target: NotificationTarget,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  sendText?(
    target: NotificationTarget,
    text: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  test?(
    target: NotificationTarget,
  ): Promise<{ ok: true; label?: string } | { ok: false; error: string }>;
};
```

### Shared Message Builder

Move formatting out of Telegram-specific code:

- `apps/control/lib/notify/run-message.ts`

Exports:

- `formatRunPlainText(...)`
- `formatRunSlackBlocks(...)`
- `formatRunDiscordEmbeds(...)`
- `buildRunActionButtons(...)`

The existing Telegram formatter can call the plain-text builder first.

## Outbound Flow

Replace the current one-off section in `dispatch.ts` with:

1. Load agent/schedule context.
2. Resolve target ids by owner priority.
3. If no explicit bindings, use enabled workspace targets.
4. Filter targets by event flags.
5. Call the adapter for each provider.
6. Return a provider result map instead of `{ telegram, custom, email }`.

Temporary compatibility:

- Keep existing Telegram dispatch active.
- Add generic Slack/Discord dispatch next to it.
- Once Telegram is migrated, remove the duplicated path.

## Slack Implementation

### Phase 1 Slack Outbound

Preferred path: bot token + `chat.postMessage`.

Why:

- Can target channels dynamically.
- Can send Block Kit.
- Can update/delete later.
- Supports better button interaction flow than pure incoming webhooks.

Required app scopes:

- `chat:write`
- `commands` for slash commands
- `channels:read` / `groups:read` only if we later discover channels automatically

Secrets:

- `slack_bot_token`
- `slack_signing_secret`

Target config:

- `team_id`
- `channel_id`
- optional `thread_ts`

### Slack Inbound

Routes:

- `apps/control/app/api/integrations/slack/commands/route.ts`
- `apps/control/app/api/integrations/slack/interactions/route.ts`

Security:

- Verify `X-Slack-Signature`.
- Verify `X-Slack-Request-Timestamp` is recent.
- Use raw request body for HMAC verification.

Commands:

- `/aio status`
- `/aio agents`
- `/aio run <agent>`
- `/aio queue`
- `/aio approve <id>`
- `/aio reject <id>`
- `/aio help`

Interactions:

- Button `run_again:<agent_id>`
- Button `approve:<queue_id>`
- Button `reject:<queue_id>`

Use Slack `response_url` for fast acknowledgements where present. Use
`chat.postMessage` for async responses that outlive response_url limits.

## Discord Implementation

### Phase 1 Discord Outbound

Two supported modes:

1. Webhook mode for simple channel reports.
2. Bot-token mode for full parity and later slash commands.

Recommended launch:

- Webhook mode for fastest outbound value.
- Bot-token/app mode for slash commands and components in phase 2.

Secrets:

- `discord_bot_token`
- `discord_public_key`
- optional custom webhook URL secrets

Target config:

- `guild_id`
- `channel_id`
- optional `thread_id`
- optional `webhook_url_secret_provider`

### Discord Inbound

Route:

- `apps/control/app/api/integrations/discord/interactions/route.ts`

Security:

- Respond to PING with `{ type: 1 }`.
- Verify `X-Signature-Ed25519` and `X-Signature-Timestamp`.
- Return `401` on invalid signatures.

Commands:

- `/aio status`
- `/aio agents`
- `/aio run`
- `/aio queue`
- `/aio approve`
- `/aio reject`

Testing:

- Register guild commands first, because they update instantly.
- Promote to global commands after stable.

## Shared Command Dispatcher

Extract Telegram command logic into:

- `apps/control/lib/notify/commands.ts`

Provider-neutral API:

```ts
export type CommandContext = {
  workspace_id: string;
  provider: "telegram" | "slack" | "discord";
  target_id: string | null;
  inbound_id: string;
  external_user_id: string | null;
  external_username: string | null;
  reply: (text: string) => Promise<void>;
};

export async function dispatchNotificationCommand(
  ctx: CommandContext,
  text: string,
): Promise<void>;
export async function dispatchNotificationAction(
  ctx: CommandContext,
  action: string,
): Promise<void>;
```

Telegram then becomes an adapter around the same dispatcher instead of
owning command behavior.

## UI Plan

### Settings

Short-term:

- Add `settings/channels` or `settings/notifications/channels`.
- Keep `settings/telegram` route and link it to the new page later.

Panel layout:

- Provider tabs: Telegram, Slack, Discord.
- Target list grouped by provider.
- Add target form changes fields per provider.
- Test target button uses the provider adapter.

### Agent and Schedule Forms

Current single dropdown:

- `telegram_target_id`
- `custom_integration_id`

Target state:

- multi-select notification targets
- optional event filter per target
- default text: "Workspace default"

Transition path:

- Keep old dropdowns visible while generic bindings are introduced.
- Add a "Additional channels" section backed by `notification_bindings`.
- Later remove old Telegram dropdowns after migration.

## Migration Strategy

Phase 1: foundation, no Telegram changes.

- Add notification tables.
- Add RLS policies.
- Add Slack and Discord provider keys to the API key panel.
- Add Slack/Discord send adapters.
- Add test actions for Slack/Discord targets.
- Add generic target settings panel, or a minimal internal action path.

Phase 2: run reports.

- Resolve notification bindings in `dispatchRunEvent`.
- Send Slack Block Kit messages.
- Send Discord embeds.
- Keep Telegram path untouched.
- Add tests for target resolution.

Phase 3: interactions and commands.

- Extract shared command dispatcher.
- Wire Slack commands and interactions.
- Wire Discord interactions.
- Move Telegram command handler onto shared dispatcher.

Phase 4: Telegram migration.

- Backfill `notification_targets` from `telegram_targets`.
- Backfill bindings from existing `agents.telegram_target_id` and `schedules.telegram_target_id`.
- Read from generic targets first, with legacy fallback.
- Remove legacy-specific UI once production has been stable.

Phase 5: topology parity.

- Telegram keeps forum topics.
- Slack can use either dedicated channels or threads under a parent channel.
- Discord can use forum channels, threads, or dedicated text channels.
- Add provider-specific topology config on workspace settings.

## Minimal First PR

The first production-safe PR should be small:

1. Add `notification_targets`, `notification_bindings`, and `notification_inbound`.
2. Add RLS policies matching `telegram_targets`.
3. Add provider entries to the API key panel:
   - Slack bot token
   - Slack signing secret
   - Discord bot token
   - Discord public key
4. Add `sendSlackText` and `sendDiscordText` helpers.
5. Add server actions to create/test/delete generic notification targets.
6. Do not change `dispatchRunEvent` yet.

That gives us a safe configuration surface and live test pings before any
run-completion fanout changes.

## Risk Notes

- Slack incoming webhook URLs and Discord webhook URLs are secrets. Store
  them via `api_keys` or custom secrets, not directly in target `config`.
- Slack signature verification needs the exact raw request body. Avoid
  parsing before verification.
- Discord rejects insecure interaction endpoints and can remove the URL if
  invalid signatures are accepted.
- Button callbacks should be idempotent where possible, because users can
  double-click or retry.
- Do not migrate Telegram until Slack/Discord have proven the generic
  model in production.
