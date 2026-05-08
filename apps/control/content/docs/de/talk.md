---
title: Talk mit Agents (Voice)
description: Die Mikrofon-Schaltfläche in der Header. Push-to-Talk, Auto-Stop, Hotword.
---

Neben dem Text-Chat haben Sie einen Voice-Modus. Oben in der Header befindet sich ein Mikrofon-Icon.

## States der Mic-Schaltfläche

| State | Visuell |
|-------|---------|
| Idle | Grün pulsierend, bereit zur Aufnahme |
| Recording | Orange plus Waveform |
| Processing | Blauer Spinner (STT > LLM > TTS Round-Trip) |
| Playing | Blauer Spinner mit Play-Icon (TTS Audio) |

## Push-to-Talk vs Auto-Stop

In Settings > Talk:

- **Push-to-Talk** -- gedrückt halten zur Aufnahme
- **Auto-Stop** -- automatisch nach Pause von X Sekunden stoppen
- **Hotword** -- Aufnahme über ein Trigger-Wort starten

## Agent wählen

Neben dem Mic steht ein Dropdown mit agents. Der gewählte agent verarbeitet Ihr Audio.

## Voice Stack (Default)

| Schicht | Default |
|------|---------|
| STT | Whisper-1 |
| LLM | claude-sonnet-4-5 |
| TTS | ElevenLabs `eleven_multilingual_v2`, Voice "rachel" |
| Stability | 0.55 |
| Similarity | 0.75 |

Änderbar in Settings > Talk. Andere Provider: OpenAI TTS, Azure Speech.

## Talk Session Log

Jeder Voice-Call wird geloggt: Transcription, LLM Response, Duration, Errors. Settings > Talk zeigt die letzten 12 Sessions.

## 45-Sekunden-Timeout

Falls der Server-Roundtrip hängt, bricht er nach 45 Sekunden ab, damit die Mic-Schaltfläche nicht einfriert.
