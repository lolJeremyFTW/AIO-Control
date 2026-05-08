---
title: Talk met agents (voice)
description: De microfoon-knop in de header. Push-to-talk, auto-stop, hotword.
---

Naast de tekstchat heeft u een voice-modus. Bovenaan de header zit een microfoon-icon.

## States van de mic-knop

| State | Visueel |
|-------|---------|
| Idle | Groen pulsend, klaar om op te nemen |
| Recording | Oranje plus waveform |
| Processing | Blauw spinner (STT > LLM > TTS round-trip) |
| Playing | Blauw spinner met play-icon (TTS audio) |

## Push-to-talk vs auto-stop

In Settings > Talk:

- **Push-to-talk** -- houd ingedrukt om op te nemen
- **Auto-stop** -- automatisch stoppen na pauze van X seconden
- **Hotword** -- start opname via een trigger-woord

## Agent kiezen

Naast de mic staat een dropdown met agents. De gekozen agent verwerkt uw audio.

## Voice-stack (default)

| Laag | Default |
|------|---------|
| STT | Whisper-1 |
| LLM | claude-sonnet-4-5 |
| TTS | ElevenLabs `eleven_multilingual_v2`, voice "rachel" |
| Stability | 0.55 |
| Similarity | 0.75 |

Wijzigen in Settings > Talk. Andere providers: OpenAI TTS, Azure Speech.

## Talk session log

Elke voice-call wordt gelogd: transcription, LLM response, duration, errors. Settings > Talk toont de laatste 12 sessions.

## 45-seconden timeout

Als de server-roundtrip vastloopt, breekt na 45 seconden zodat de mic-knop niet bevriest.
