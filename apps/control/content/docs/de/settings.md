---
title: Settings (alle Sektionen)
description: Workspace, AI, Notifikationen, Geld, Gefahrenzone.
---

Hauptscreen: `/[ws]/settings/*`. Sub-Pages pro Sektion. Sidebar gruppiert in 5 Gruppen.

## Workspace

### General -- `/settings/general`

- Workspace-Name plus Slug plus Appearance
- Default Language
- Time Zone
- Default Provider plus Default Modell für neue agents
- Default System Prompt (Präambel für neue agents)

### Integrations -- `/settings/integrations`

Liste der extern gekoppelten Services: Stripe, Mollie, Telegram, Slack, Discord, Custom MCP Servern.

Pro Integration: Connect / Disconnect plus Status plus Last Sync.

### Team -- `/settings/team`

- Members-Liste (Name plus E-Mail plus Role)
- Roles: owner / admin / editor / viewer
- Invite per E-Mail
- Pending Invitations
- Member entfernen (nur Owner oder Admin)

### Weather -- `/settings/weather`

- Default-Stadt für den Header Weather-Chip
- Units (Celsius oder Fahrenheit)
- Update-Frequency

### Talk -- `/settings/talk`

Voice-Settings (siehe [Talk](talk)):

- Provider (ElevenLabs / OpenAI TTS / Azure)
- Voice plus Stability plus Similarity
- LLM für Zwischenschritt
- STT-Modell (Whisper-1 Default)
- Push-to-Talk / Auto-Stop / Hotword Toggles
- Masked Previews der Provider-Keys
- Talk Session Log (letzte 12)

### Server Files -- `/settings/server-files`

Browser für `/var/www/aio-files/` auf Ihrem VPS. Files hochladen, herunterladen, löschen. Files sind für agents über das `read_file` Tool verfügbar. Praktisch für:

- CSV-Daten, die agents parsen müssen
- PDF-Templates für Freebies
- Logos und Assets für Content-Generierung

## AI und Modelle

### Agent Defaults -- `/settings/agent-defaults`

Default-Werte für neue agents:

- Default Kind
- Default Tools Allow-List pro Kind
- Default Skills auto-zugewiesen
- Default `maxHops`
- Default `notify_email`

### Providers -- `/settings/providers`

Pro Provider:

- Connect Status (Zugangsdaten verfügbar oder nicht)
- Min Seconds Between Calls (Cooldown)
- Max Retries on Rate-Limit
- Test-Call Schaltfläche > zeigt Response-Time plus Error
- Test-Logs der letzten 5 Connection Attempts

OpenAI Codex über OAuth: ChatGPT-Login-Flow mit `/api/providers/openai-codex/login` > `/callback` > `/status`.

### API Keys -- `/settings/api-keys`

Pro Provider fügen Sie API-Keys auf drei Scopes hinzu:

- **Workspace** -- Default für alle businesses
- **Business** -- Override für spezifisches business (praktisch für Isolated Mode)
- **Topic (Nav-Node)** -- Override für ein topic

Keys werden encrypted gespeichert über pgcrypto mit dem `AGENT_SECRET_KEY` Symmetric Key. UI zeigt nur die letzten 4 Chars (`••••••••••••3a4b`).

### MCP Tools -- `/settings/mcp-tools`

MCP Server konfigurieren:

- Name plus Command (zum Beispiel `npx @modelcontextprotocol/server-filesystem /allowed/path`)
- Args plus Env Vars
- Active Toggle
- Test-Tools Schaltfläche > spawnt Server, listet Tools, kill

Custom Server werden in der `mcp_servers` Tabelle gespeichert. Verfügbar in der `mcpServers` Config jedes agent.

## Notifikationen

### Channels -- `/settings/channels`

Master-List der Notification Targets (unabhängig vom Typ). Schnell ein neues Binding erstellen, ohne zu Telegram, E-Mail oder einem anderen Kanal zu gehen.

### Telegram -- `/settings/telegram`

Bot-Token plus Targets plus Auto-Topic-Detection. Siehe [Notifications](notifications).

### Email -- `/settings/email`

- SMTP Server / Port / Auth
- Oder Resend API-Key
- From-Adresse plus Reply-To
- E-Mail-Templates pro Event-Type
- Test-E-Mail Schaltfläche

### Notifications -- `/settings/notifications`

Globale Notification-Preferences:

- Welche Events Notifikationen triggern (run-done / run-fail / queue-review / spend-alert)
- Pro Kanal an oder aus
- Quiet Hours (zum Beispiel keine Notifikationen zwischen 23:00 und 07:00)

### Custom Integrations -- `/settings/custom-integrations`

Eigene Webhooks. Siehe [Notifications](notifications).

## Geld und Plan

### Spend Limits -- `/settings/spend-limits`

- Per-Business oder Workspace Caps
- Daily / Weekly / Monthly
- Action: pause / notify / pause-and-notify

Bei Pause werden agents auto-disabled, bis Sie sie manuell re-enablen.

### Subscription -- `/settings/subscription`

Siehe [Pläne](plans).

## Gefahrenzone

### Danger -- `/settings/danger`

Destruktive Aktionen mit Confirmation:

- Workspace löschen (Cascade alles)
- Alle runs purgen, älter als X Tage
- Alle audit_logs purgen, älter als X Tage
- API-Keys rotieren (löschen plus neu anlegen)
- Supabase-Cache zurücksetzen (nur Owner)

Sidebar zeigt ein rotes Dreiecks-Badge, damit diese Sektion nicht versehentlich geöffnet wird.
