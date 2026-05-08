---
title: Erster Login und Setup
description: Account, Login, Onboarding-Wizard, erstes Business.
---

Diese Seite führt durch den gesamten Erstkontakt. Vom Signup bis zu Ihrem ersten Business mit einem funktionierenden Agent.

## Account erstellen

1. Gehen Sie zu `/signup`. Geben Sie E-Mail und Passwort ein. Keine Kreditkarte erforderlich.
2. Sie erhalten eine Bestätigungsmail. Klicken Sie auf den Link.
3. Nach der Bestätigung steht Ihr erster workspace bereit.

## Einloggen

`/login` unterstützt:

- E-Mail + Passwort
- OAuth-Provider (nur sichtbar, wenn das Gateway einen Provider anbietet, abgerufen über `/api/auth/oauth-config`)
- Passwort vergessen via Reset-Link

Login-Events werden pro 12-Stunden-Fenster gespeichert. Ihre Login-History finden Sie auf der [Profile-Seite](first-login).

## Der Onboarding-Wizard

Auf dem Workspace-Dashboard erscheint automatisch ein 3-Schritt-Wizard. Er bleibt bestehen, solange eines der drei Gates nicht erfüllt ist.

| Schritt | Check | Wo Sie es eingeben |
|------|-------|--------------------|
| 1. Business anlegen | `businesses.length > 0` | Schaltfläche öffnet NewBusinessDialog |
| 2. API Key hinzufügen | `api_keys` count > 0 | Settings > API Keys |
| 3. Agent anlegen | `agents.length > 0` | Aus Business > Agents-Tab |

Sobald alle drei erfüllt sind, verschwindet der Wizard. Kein Klick auf eine "Fertig"-Schaltfläche nötig.

## Ihr erstes Business

Der `BusinessSetupWizard` hat 7 Schritte:

1. **Identity** -- Name plus Appearance (Variante + Icon + Logo)
2. **Intent** -- Description, Mission, erste Targets (KPIs oder Ziele)
3. **Topics** -- Seed-Nav-Nodes wie "Content / Marketing / Sales"
4. **Main Agent** -- Name, Provider, Modell, Key Source
5. **Telegram** -- bestehendes Target wählen oder überspringen
6. **Isolation** -- standalone oder inherits-from-workspace
7. **Confirm** -- Zusammenfassung und Erstellung

Alles bis Schritt 7 ist lokaler State. Erst beim Confirm wird in die Datenbank geschrieben. Sie können frei durch die Schritte klicken, ohne etwas zu zerstören.

### Topic-Presets, die der Wizard vorschlägt

- Content / Marketing / Sales / Analytics
- Video / Thumbnails / Scripts / Publishing
- Listings / Customer Service / Fulfillment
- Agents / Schedules / Integrations

## Danach

Sobald der Wizard durchlaufen ist, befinden Sie sich auf dem [Business-Dashboard](businesses). Der Rest der Docs beschreibt, welche Aktionen Sie dort ausführen können.
