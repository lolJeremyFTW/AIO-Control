---
title: Integrations in detail
description: Telegram, Slack, Discord, Stripe, Mollie, OpenAI Codex, MCP servers.
---

## Telegram

Bot token in Settings > Telegram. AIO Control:

1. Registers webhook with Telegram API
2. Listens on `/api/integrations/telegram/webhook`
3. Detects new chats automatically and creates targets
4. In supergroups creates a separate target per topic via `auto-telegram-topics`

Enable inbound triggers per agent.

## Slack

OAuth flow for Slack workspace install. Two endpoints:

- `/api/integrations/slack/interactions` -- buttons and selects
- `/api/integrations/slack/commands` -- slash commands

Slash command example: `/aio status` shows the queue summary in the channel.

## Discord

Bot apply plus interactions endpoint:

- `/api/integrations/discord/interactions` -- for slash commands and buttons

## Stripe

For AIO Control subscriptions. Webhook endpoint:

- `/api/integrations/stripe`

Events: `customer.subscription.created/updated/deleted`, `invoice.paid/failed`.

## Mollie

Alternative for EU customers. Endpoint:

- `/api/integrations/mollie`

Same as Stripe but for iDEAL and SEPA.

## OpenAI Codex (ChatGPT login)

OAuth flow:

1. Click "Connect" on Settings > Providers > OpenAI Codex
2. Redirect to OpenAI login
3. Callback to `/api/providers/openai-codex/callback`
4. Token in `provider_endpoints` table
5. Status check via `/status`

Disconnect: `/disconnect` clears token.

## Generic webhooks (custom integrations)

See [Notifications](notifications).

## MCP servers

Configurable in Settings > MCP Tools. Native host (`packages/ai/src/mcp/host.ts`) spawns servers on demand when an agent has them in `mcpServers`. Permissions per server (off / ro / rw).
