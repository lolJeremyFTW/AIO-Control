---
title: Integrations in detail
description: Telegram, Slack, Discord, Stripe, Mollie, OpenAI Codex, MCP servers.
---

## Telegram

Bot-token in Settings > Telegram. AIO Control:

1. Registreert webhook bij Telegram API
2. Listent op `/api/integrations/telegram/webhook`
3. Detecteert nieuwe chats automatisch en maakt targets
4. In supergroups maakt per topic een aparte target via `auto-telegram-topics`

Inbound triggers per agent enablen.

## Slack

OAuth-flow voor Slack workspace install. Twee endpoints:

- `/api/integrations/slack/interactions` -- buttons en selects
- `/api/integrations/slack/commands` -- slash commands

Slash command voorbeeld: `/aio status` toont de queue-summary in de channel.

## Discord

Bot-toepassen plus interactions endpoint:

- `/api/integrations/discord/interactions` -- voor slash commands en buttons

## Stripe

Voor AIO Control subscriptions. Webhook endpoint:

- `/api/integrations/stripe`

Events: `customer.subscription.created/updated/deleted`, `invoice.paid/failed`.

## Mollie

Alternatief voor EU-customers. Endpoint:

- `/api/integrations/mollie`

Idem als Stripe maar voor iDEAL en SEPA.

## OpenAI Codex (ChatGPT login)

OAuth-flow:

1. Klik "Connect" op Settings > Providers > OpenAI Codex
2. Redirect naar OpenAI login
3. Callback naar `/api/providers/openai-codex/callback`
4. Token in `provider_endpoints` tabel
5. Status check via `/status`

Disconnect: `/disconnect` clear token.

## Generic webhooks (custom integrations)

Zie [Notifications](notifications).

## MCP servers

Configureerbaar in Settings > MCP Tools. Native host (`packages/ai/src/mcp/host.ts`) spawnt servers op-demand wanneer een agent ze in `mcpServers` heeft staan. Permissions per server (off / ro / rw).
