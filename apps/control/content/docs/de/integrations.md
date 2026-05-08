---
title: Integrationen im Detail
description: Telegram, Slack, Discord, Stripe, Mollie, OpenAI Codex, MCP Server.
---

## Telegram

Bot-Token in Settings > Telegram. AIO Control:

1. Registriert Webhook bei Telegram API
2. Lauscht auf `/api/integrations/telegram/webhook`
3. Erkennt neue Chats automatisch und erstellt Targets
4. In Supergroups erstellt pro Topic ein separates Target über `auto-telegram-topics`

Inbound Triggers pro agent aktivieren.

## Slack

OAuth-Flow für Slack-Workspace-Install. Zwei Endpoints:

- `/api/integrations/slack/interactions` -- Buttons und Selects
- `/api/integrations/slack/commands` -- Slash Commands

Beispiel Slash Command: `/aio status` zeigt die Queue-Summary im Channel.

## Discord

Bot-Toepassen plus Interactions Endpoint:

- `/api/integrations/discord/interactions` -- für Slash Commands und Buttons

## Stripe

Für AIO Control Subscriptions. Webhook Endpoint:

- `/api/integrations/stripe`

Events: `customer.subscription.created/updated/deleted`, `invoice.paid/failed`.

## Mollie

Alternative für EU-Customers. Endpoint:

- `/api/integrations/mollie`

Wie Stripe, aber für iDEAL und SEPA.

## OpenAI Codex (ChatGPT Login)

OAuth-Flow:

1. Klicken Sie "Connect" auf Settings > Providers > OpenAI Codex
2. Redirect zum OpenAI-Login
3. Callback an `/api/providers/openai-codex/callback`
4. Token in der `provider_endpoints` Tabelle
5. Status Check über `/status`

Disconnect: `/disconnect` clear Token.

## Generic Webhooks (Custom Integrations)

Siehe [Notifications](notifications).

## MCP Server

Konfigurierbar in Settings > MCP Tools. Native Host (`packages/ai/src/mcp/host.ts`) spawnt Server on-demand, wenn ein agent sie in `mcpServers` hat. Permissions pro Server (off / ro / rw).
