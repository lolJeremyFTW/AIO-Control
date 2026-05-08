---
title: Häufig gestellte Fragen
description: Die häufigsten Issues und wie Sie sie lösen.
---

## Mein agent verwendet den Skill nicht, den ich zugewiesen habe

Prüfen Sie, ob der Skill in `allowed_skills` des agent steht. Der System-Prompt-Builder injiziert nur zugewiesene Skills. Wenn Sie Skills über einen Toggle aktivieren/deaktivieren lassen, müssen Sie das Agent-Edit auch saven.

## Ein Schedule läuft nicht zu der Zeit, die ich eingestellt habe

Cron-Expressions sind in UTC. NL ist UTC+1 (Winter) oder UTC+2 (Sommer). Beispiel: "täglich 09:00 NL-Zeit im Winter" = `0 8 * * *` UTC. AIO zeigt eine Erklärungszeile unter dem Cron-Builder, die zeigt, wann er läuft.

## Ich erhalte keine Telegram-Notifikationen

Drei Checks:

1. Ist Ihr Bot-Token in Settings > Telegram ausgefüllt?
2. Haben Sie Ihrem Bot ein `/start` aus dem Chat geschickt, an den Notifikationen gehen sollen?
3. Ist das Telegram-Target an den richtigen agent gebunden?

## Mein run steht seit Stunden auf `running`

Möglicherweise ist der Worker-Process gecrashed. Stoppen Sie den run über `/api/runs/[id]/stop` und prüfen Sie die VPS-Logs (`sudo journalctl -u aio-control-root --since '1 hour ago'`).

## Was kostet ein durchschnittlicher run?

Hängt von Provider und Modell ab. Indikation:

- MiniMax-M2.7-Highspeed: ~ EUR 0,002 pro 1k Tokens out
- Claude Sonnet 4.6: ~ EUR 0,015 pro 1k Tokens out
- Claude Haiku 4.5: ~ EUR 0,002 pro 1k Tokens out
- Ollama: gratis (läuft auf Ihrem VPS)

Für 1000 runs/Monat mit durchschnittlich 2k Input + 1k Output auf Sonnet: ~ EUR 30/Monat an Tokens. MiniMax für dieselbe Workload: ~ EUR 5.

## Kann ich AIO Control offline verwenden?

Nicht vollständig. Die Next.js App benötigt Supabase. Aber wenn Sie Ollama-Agents betreiben, brauchen Ihre agents selbst kein Internet. Die UI muss eine Verbindung zu Ihrem VPS haben.

## Was passiert, wenn mein VPS down ist?

- Subscription-Claude-Agents bleiben funktionsfähig (laufen auf Anthropic).
- Webhook-Triggers und Cron-Schedules auf dem VPS schlagen fehl, bis wieder up.
- Failed Runs werden automatisch geretryed, sobald der Retry-Sweep wieder läuft.

## Kann ein agent einen anderen workspace sehen?

Nein. Row Level Security (RLS) ist auf jeder User-Data-Tabelle aktiv. Ein agent hat nur Zugriff auf seinen eigenen workspace. Workspace-Isolation ist hart.

## Kann ich meine Daten exportieren?

Auf Team-Plan: ja, über Audit-Log-Export und GDPR DSR Helper. Auf Free oder Pro: nicht über die UI. Direkt aus der Datenbank über Ihren VPS.

## Werden meine API-Keys geteilt, wenn ich einen agent in der Marketplace platziere?

Nein. Marketplace-Listings enthalten die Agent-Config, aber keine Credentials. Der Installer muss eigene Keys hinzufügen.

## Funktioniert die iOS App?

Der Capacitor-Build ist in Produktion. Push-Notifikationen funktionieren. Die Talk-Feature funktioniert auf iOS Safari (nach Home-Screen-Hinzufügen) oder der nativen App.

## Wie verbinde ich AIO Control mit anderen TrompTech-Projekten?

Zwei Optionen:

1. **Custom Integration** -- AIO POSTet an den Webhook Ihres anderen Projekts
2. **Inbound Webhook** -- Ihr anderes Projekt POSTet an `/api/triggers/[secret]`

Für Automation-Pipelines mit n8n, Zapier oder Make: verwenden Sie diese als Bridge.
