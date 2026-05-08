---
title: Talk to agents (voice)
description: The microphone button in the header. Push-to-talk, auto-stop, hotword.
---

Alongside text chat you have a voice mode. At the top of the header sits a microphone icon.

## States of the mic button

| State | Visual |
|-------|---------|
| Idle | Green pulsing, ready to record |
| Recording | Orange plus waveform |
| Processing | Blue spinner (STT > LLM > TTS round-trip) |
| Playing | Blue spinner with play icon (TTS audio) |

## Push-to-talk vs auto-stop

In Settings > Talk:

- **Push-to-talk** -- hold to record
- **Auto-stop** -- automatically stop after a pause of X seconds
- **Hotword** -- start recording via a trigger word

## Choosing an agent

Next to the mic is a dropdown with agents. The chosen agent processes your audio.

## Voice stack (default)

| Layer | Default |
|------|---------|
| STT | Whisper-1 |
| LLM | claude-sonnet-4-5 |
| TTS | ElevenLabs `eleven_multilingual_v2`, voice "rachel" |
| Stability | 0.55 |
| Similarity | 0.75 |

Change in Settings > Talk. Other providers: OpenAI TTS, Azure Speech.

## Talk session log

Each voice call gets logged: transcription, LLM response, duration, errors. Settings > Talk shows the last 12 sessions.

## 45-second timeout

If the server round-trip stalls, it breaks after 45 seconds so the mic button doesn't freeze.
