---
title: Settings (alle secties)
description: Workspace, AI, notificaties, geld, gevarenzone.
---

Hoofdscherm: `/[ws]/settings/*`. Sub-pages per sectie. Sidebar groepeert in 5 groepen.

## Workspace

### General -- `/settings/general`

- Workspace naam plus slug plus appearance
- Default language
- Time zone
- Default provider plus default model voor nieuwe agents
- Default system prompt (preamble voor nieuwe agents)

### Integrations -- `/settings/integrations`

Lijst van extern gekoppelde services: Stripe, Mollie, Telegram, Slack, Discord, custom MCP servers.

Per integratie: connect / disconnect plus status plus last sync.

### Team -- `/settings/team`

- Members lijst (naam plus email plus role)
- Roles: owner / admin / editor / viewer
- Invite via email
- Pending invitations
- Remove member (alleen owner of admin)

### Weather -- `/settings/weather`

- Default stad voor de header weather-chip
- Units (celsius of fahrenheit)
- Update frequency

### Talk -- `/settings/talk`

Voice-settings (zie [Talk](talk)):

- Provider (ElevenLabs / OpenAI TTS / Azure)
- Voice plus stability plus similarity
- LLM voor tussenstap
- STT model (Whisper-1 default)
- Push-to-talk / auto-stop / hotword toggles
- Masked previews van de provider keys
- Talk session log (laatste 12)

### Server Files -- `/settings/server-files`

Browser voor `/var/www/aio-files/` op uw VPS. Upload, download, delete files. Files zijn beschikbaar voor agents via de `read_file` tool. Handig voor:

- CSV-data die agents moeten parsen
- PDF-templates voor freebies
- Logo's en assets voor content-generatie

## AI en modellen

### Agent Defaults -- `/settings/agent-defaults`

Default-waarden voor nieuwe agents:

- Default kind
- Default tools allow-list per kind
- Default skills auto-toegewezen
- Default `maxHops`
- Default `notify_email`

### Providers -- `/settings/providers`

Per provider:

- Connect status (gegevens beschikbaar of niet)
- Min seconds between calls (cooldown)
- Max retries on rate-limit
- Test-call knop > toont response-time plus error
- Test-logs van laatste 5 connection attempts

OpenAI Codex via OAuth: ChatGPT login flow met `/api/providers/openai-codex/login` > `/callback` > `/status`.

### API Keys -- `/settings/api-keys`

Per provider voegt u API-keys toe op drie scopes:

- **Workspace** -- default voor alle businesses
- **Business** -- override voor specifieke business (handig voor isolated mode)
- **Topic (nav-node)** -- override voor één topic

Keys worden encrypted opgeslagen via pgcrypto met de `AGENT_SECRET_KEY` symmetric key. UI toont alleen de laatste 4 chars (`••••••••••••3a4b`).

### MCP Tools -- `/settings/mcp-tools`

MCP servers configureren:

- Naam plus command (bijvoorbeeld `npx @modelcontextprotocol/server-filesystem /allowed/path`)
- Args plus env vars
- Active toggle
- Test-tools knop > spawnt server, lijst tools, kill

Custom servers worden opgeslagen in `mcp_servers` tabel. Beschikbaar in elke agent's `mcpServers` config.

## Notificaties

### Channels -- `/settings/channels`

Master-list van notification targets (ongeacht type). Snel een nieuwe binding maken zonder naar Telegram, Email of een ander kanaal te gaan.

### Telegram -- `/settings/telegram`

Bot token plus targets plus auto-topic-detection. Zie [Notifications](notifications).

### Email -- `/settings/email`

- SMTP server / port / auth
- Of Resend API-key
- From-address plus reply-to
- Email templates per event-type
- Test-email knop

### Notifications -- `/settings/notifications`

Globale notification-preferences:

- Welke events triggeren notificaties (run-done / run-fail / queue-review / spend-alert)
- Per kanaal aan of uit
- Quiet hours (geen notificaties tussen 23:00 en 07:00 bijvoorbeeld)

### Custom Integrations -- `/settings/custom-integrations`

Eigen webhooks. Zie [Notifications](notifications).

## Geld en plan

### Spend Limits -- `/settings/spend-limits`

- Per business of workspace caps
- Daily / weekly / monthly
- Action: pause / notify / pause-and-notify

Bij pause worden agents auto-disabled tot u manually re-enabled.

### Subscription -- `/settings/subscription`

Zie [Plannen](plans).

## Gevarenzone

### Danger -- `/settings/danger`

Destructieve acties met confirmatie:

- Workspace verwijderen (cascade alles)
- Alle runs purgen ouder dan X dagen
- Alle audit_logs purgen ouder dan X dagen
- API keys roteren (delete plus her-aanmaken)
- Reset Supabase-cache (alleen owner)

Sidebar toont een rood driehoek-badge zodat deze sectie niet per ongeluk wordt geopend.
