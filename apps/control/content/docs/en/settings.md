---
title: Settings (all sections)
description: Workspace, AI, notifications, money, danger zone.
---

Main screen: `/[ws]/settings/*`. Sub-pages per section. Sidebar groups into 5 groups.

## Workspace

### General -- `/settings/general`

- Workspace name plus slug plus appearance
- Default language
- Time zone
- Default provider plus default model for new agents
- Default system prompt (preamble for new agents)

### Integrations -- `/settings/integrations`

List of externally linked services: Stripe, Mollie, Telegram, Slack, Discord, custom MCP servers.

Per integration: connect / disconnect plus status plus last sync.

### Team -- `/settings/team`

- Members list (name plus email plus role)
- Roles: owner / admin / editor / viewer
- Invite via email
- Pending invitations
- Remove member (only owner or admin)

### Weather -- `/settings/weather`

- Default city for the header weather chip
- Units (celsius or fahrenheit)
- Update frequency

### Talk -- `/settings/talk`

Voice settings (see [Talk](talk)):

- Provider (ElevenLabs / OpenAI TTS / Azure)
- Voice plus stability plus similarity
- LLM for in-between step
- STT model (Whisper-1 default)
- Push-to-talk / auto-stop / hotword toggles
- Masked previews of the provider keys
- Talk session log (last 12)

### Server Files -- `/settings/server-files`

Browser for `/var/www/aio-files/` on your VPS. Upload, download, delete files. Files are available to agents via the `read_file` tool. Useful for:

- CSV data agents need to parse
- PDF templates for freebies
- Logos and assets for content generation

## AI and models

### Agent Defaults -- `/settings/agent-defaults`

Default values for new agents:

- Default kind
- Default tools allow-list per kind
- Default skills auto-assigned
- Default `maxHops`
- Default `notify_email`

### Providers -- `/settings/providers`

Per provider:

- Connect status (data available or not)
- Min seconds between calls (cooldown)
- Max retries on rate-limit
- Test call button > shows response time plus error
- Test logs of last 5 connection attempts

OpenAI Codex via OAuth: ChatGPT login flow with `/api/providers/openai-codex/login` > `/callback` > `/status`.

### API Keys -- `/settings/api-keys`

Per provider you add API keys at three scopes:

- **Workspace** -- default for all businesses
- **Business** -- override for specific business (handy for isolated mode)
- **Topic (nav-node)** -- override for one topic

Keys are stored encrypted via pgcrypto with the `AGENT_SECRET_KEY` symmetric key. UI shows only the last 4 chars (`••••••••••••3a4b`).

### MCP Tools -- `/settings/mcp-tools`

Configure MCP servers:

- Name plus command (for example `npx @modelcontextprotocol/server-filesystem /allowed/path`)
- Args plus env vars
- Active toggle
- Test tools button > spawns server, lists tools, kills

Custom servers are stored in `mcp_servers` table. Available in every agent's `mcpServers` config.

## Notifications

### Channels -- `/settings/channels`

Master list of notification targets (regardless of type). Quickly create a new binding without going to Telegram, Email or another channel.

### Telegram -- `/settings/telegram`

Bot token plus targets plus auto-topic-detection. See [Notifications](notifications).

### Email -- `/settings/email`

- SMTP server / port / auth
- Or Resend API key
- From address plus reply-to
- Email templates per event type
- Test email button

### Notifications -- `/settings/notifications`

Global notification preferences:

- Which events trigger notifications (run-done / run-fail / queue-review / spend-alert)
- Per channel on or off
- Quiet hours (no notifications between 23:00 and 07:00 for example)

### Custom Integrations -- `/settings/custom-integrations`

Your own webhooks. See [Notifications](notifications).

## Money and plan

### Spend Limits -- `/settings/spend-limits`

- Per business or workspace caps
- Daily / weekly / monthly
- Action: pause / notify / pause-and-notify

On pause agents are auto-disabled until you manually re-enable.

### Subscription -- `/settings/subscription`

See [Plans](plans).

## Danger zone

### Danger -- `/settings/danger`

Destructive actions with confirmation:

- Delete workspace (cascade everything)
- Purge all runs older than X days
- Purge all audit_logs older than X days
- Rotate API keys (delete plus recreate)
- Reset Supabase cache (owner only)

Sidebar shows a red triangle badge so this section doesn't get opened by accident.
