---
title: Veelgestelde vragen
description: De meest voorkomende issues en hoe u ze oplost.
---

## Mijn agent maakt geen gebruik van de skill die ik heb toegewezen

Check of de skill in `allowed_skills` van de agent staat. De system-prompt builder injecteert alleen toegewezen skills. Als u skills laat aan/uitvinken via een toggle moet u de agent-edit ook saven.

## Een schedule draait niet om de tijd die ik heb ingesteld

Cron-expressions zijn in UTC. NL is UTC+1 (winter) of UTC+2 (zomer). Voorbeeld: "elke dag 09:00 NL-tijd in de winter" = `0 8 * * *` UTC. AIO toont een uitleg-regel onder de cron-builder die laat zien wanneer hij draait.

## Ik krijg geen Telegram notificaties

Drie checks:

1. Is uw bot token gevuld in Settings > Telegram?
2. Heeft u uw bot een `/start` gestuurd vanuit de chat waarheen notificaties moeten?
3. Is de telegram-target gebound aan de juiste agent?

## Mijn run staat al uren op `running`

Mogelijk is de worker-process gecrashed. Stop de run via `/api/runs/[id]/stop` en check de VPS logs (`sudo journalctl -u aio-control-root --since '1 hour ago'`).

## Hoeveel kost een gemiddelde run?

Hangt af van provider en model. Indicatie:

- MiniMax-M2.7-Highspeed: ~ EUR 0,002 per 1k tokens out
- Claude Sonnet 4.6: ~ EUR 0,015 per 1k tokens out
- Claude Haiku 4.5: ~ EUR 0,002 per 1k tokens out
- Ollama: gratis (loopt op uw VPS)

Voor 1000 runs/maand met gemiddeld 2k input + 1k output op Sonnet: ~ EUR 30/maand aan tokens. MiniMax voor zelfde workload: ~ EUR 5.

## Kan ik AIO Control offline gebruiken?

Niet volledig. De Next.js app heeft Supabase nodig. Maar als u Ollama agents draait, hebben uw agents zelf geen internet nodig. De UI moet wel een verbinding hebben naar uw VPS.

## Wat als mijn VPS down is?

- Subscription Claude agents blijven werken (draaien op Anthropic).
- Webhook triggers en cron schedules op de VPS falen tot weer up.
- Failed runs worden automatisch gere-tried zodra de retry-sweep weer loopt.

## Kan een agent een andere workspace zien?

Nee. Row Level Security (RLS) staat op elke user-data tabel. Een agent heeft alleen toegang tot zijn eigen workspace. Workspace-isolation is hard.

## Kan ik mijn data exporteren?

Op Team plan: ja, via audit-log-export en GDPR DSR helpers. Op Free of Pro: niet via UI. Direct uit de database via uw VPS.

## Worden mijn API keys gedeeld als ik een agent op marketplace zet?

Nee. Marketplace-listings bevatten de agent-config maar geen credentials. De installer moet eigen keys toevoegen.

## Werkt de iOS app?

Capacitor-build is in productie. Push notifications werken. Talk-feature werkt op iOS Safari (na home-screen-toevoegen) of de native app.

## Hoe link ik AIO Control aan andere TrompTech-projecten?

Twee opties:

1. **Custom integration** -- AIO POST'd naar uw andere project's webhook
2. **Inkomende webhook** -- uw andere project POST'd naar `/api/triggers/[secret]`

Voor automation-pipelines met n8n, Zapier of Make: gebruik die als bridge.
