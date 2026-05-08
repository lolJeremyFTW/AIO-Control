---
title: Chat mit Agents
description: Das schwebende Chat-Panel, Threads, Tool Calls, HITL-Approval.
---

Klicken Sie auf die grüne Glocke rechts unten. Das Chat-Panel öffnet sich.

## Agent wählen

Oben sehen Sie ein Dropdown mit allen workspace-agents. Beim Wechsel zwischen agents bekommt jeder agent seine eigene Thread-History.

## Threads und History

Pro agent speichert AIO Control Conversations in `chat_threads` plus `chat_messages`. Sie öffnen einen alten Thread über die Threads-Schaltfläche oder starten einen neuen mit "+ Neuer Chat".

Threads können Sie über das Kontextmenü in der Threads-Liste löschen.

## AG-UI Streaming

Der Chat verwendet das AG-UI Event-Format. Sie sehen Tokens eintreffen, während das Modell generiert. Nicht erst ein Block am Ende.

## Tool Calls inline

Wenn ein agent ein Tool verwendet, erscheint ein Chip im Chat:

```
🔧 list_businesses (geen args)
🔧 create_agent (name="Outreach worker", provider="minimax")
```

READ-Tools führen direkt aus. WRITE-Tools fragen Approve.

## Approve / Cancel WRITE-Tools

Ein WRITE-Tool zeigt eine grüne Approve-Schaltfläche und eine rote Cancel-Schaltfläche. Der agent wartet, bis Sie wählen. Der Round-Trip über `tool_call_id` sorgt dafür, dass der richtige Pending-State gematched wird.

## Auto-Approve Mode

Pro Thread können Sie Auto-Approve über einen Toggle aktivieren. Danach erhalten WRITE-Tools keine Bestätigung mehr. Empfohlen für agents mit beschränkter Tool-Allowlist.

## Ask-Followup

Der agent kann Ihnen über `ask_followup` eine Frage stellen:

```
"Welk model wilt u voor deze nieuwe agent?
[claude-sonnet-4-6] [claude-haiku-4-5] [minimax-m2.7-highspeed]"
```

Klicken Sie auf eine Schaltfläche, um diese als Ihre Antwort zu senden.

## Open-UI-At Navigation Hints

Ein agent kann einen Pfad vorschlagen, zu dem navigiert werden soll:

```
🔗 Bekijk de runs op /[ws]/runs?status=failed
```

Klicken Sie, um dorthin zu gelangen.

## Confirm für destruktive Aktionen

Außerhalb von WRITE-Confirmations hat der agent eine zweite Confirmation-Schicht für wirklich destruktive Aktionen (wie ein business löschen). Erscheint als gelbe Karte mit Zusammenfassung plus Approve/Cancel.

## Cost und Tokens pro Message

Unter jeder Antwort steht:

```
1.2k input · 340 output · €0.0089
```

Estimated, wenn noch kein exakter Tokens-Report vom Provider vorliegt.

## Markdown Rendering

Antworten werden als Markdown gerendert. Code-Blocks erhalten Syntax Highlighting. Links sind klickbar.

## Command Palette in Chat

Tippen Sie `/` in das Chat-Input, um Commands zu suchen: agents, skills, MCP-Tools, Custom Commands. Funktioniert fuzzy.

## Tastenkombinationen

| Taste | Was |
|-------|-----|
| `Enter` | Send Message |
| `Shift+Enter` | New Line |
| `/` | Command Palette öffnen |
| `Esc` | Chat-Panel schließen |
