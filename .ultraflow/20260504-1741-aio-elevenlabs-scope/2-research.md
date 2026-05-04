# Research — Browser Audio Capture

**Datum**: 2026-05-04
**Status**: Information collected; pipeline architecture for voice-to-AI defined

---

## Browser Audio Capture

### 1. MediaRecorder API — Cross-Browser Usage

`MediaRecorder` is the standard browser API for capturing audio from a microphone. It works in Chrome, Firefox, and Safari (including iOS Safari 14.1+).

**Basic setup:**

```typescript
// Request microphone permission
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

// Create recorder with preferred mimeType
const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
  ? 'audio/webm;codecs=opus'
  : 'audio/webm'; // Fallback for Safari < 16

const recorder = new MediaRecorder(stream, { mimeType });

// Collect chunks
const chunks: Blob[] = [];
recorder.ondataavailable = (e) => {
  if (e.data.size > 0) chunks.push(e.data);
};

recorder.onstop = async () => {
  const blob = new Blob(chunks, { type: mimeType });
  // Send to STT server
  await uploadAudio(blob);
};

// Start recording — use timeslice for chunked streaming
recorder.start(1000); // emit data every 1000ms

// Stop after silence or user action
recorder.stop();
stream.getTracks().forEach(t => t.stop());
```

**Browser support gotchas:**
- **Safari**: prefers `audio/webm` or `audio/mp4`; `audio/ogg` not supported. `audio/webm;codecs=opus` requires Safari 14.1+.
- **Chrome/Edge**: full `audio/webm;codecs=opus` support.
- **Firefox**: supports `audio/webm` with Opus.
- **iOS**: requires user gesture to start recording; automatically uses AAC in MP4 container.
- **Fallback chain** for mimeType: `audio/webm;codecs=opus` -> `audio/webm` -> `audio/mp4` -> `audio/ogg` (Firefox only).

**Browser compatibility source:** [MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder), [Can I Use MediaRecorder](https://caniuse.com/mdn-api_mediarecorder).

---

### 2. Speech End Detection (Silence / VAD)

You need to detect when the user stopped speaking to trigger the STT upload. Three approaches:

**A. MediaRecorder timeslice + chunk analysis (simplest)**
```typescript
// Use ondataavailable chunks with a Web Audio AnalyserNode
const audioContext = new AudioContext();
const source = audioContext.createMediaStreamSource(stream);
const analyser = audioContext.createAnalyser();
analyser.fftSize = 256;
source.connect(analyser);

// Detect silence: check if average amplitude falls below threshold
function getAverageVolume(): number {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  return data.reduce((a, b) => a + b) / data.length;
}

// Check volume in a setInterval while recording
const silenceThreshold = 10; // tune this
const silenceDuration = 1500; // ms of silence to trigger
let silenceCounter = 0;

const checkSilence = setInterval(() => {
  if (getAverageVolume() < silenceThreshold) {
    silenceCounter += 100;
    if (silenceCounter >= silenceDuration) {
      recorder.stop();
      clearInterval(checkSilence);
    }
  } else {
    silenceCounter = 0;
  }
}, 100);
```

**B. Web Speech API (SpeechRecognition) — native browser VAD**
```typescript
// Built-in VAD via browser's SpeechRecognition
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.continuous = false;
recognition.interimResults = false;

recognition.onresult = (event) => {
  // Fires when speech detected — user has finished
  const transcript = event.results[0][0].transcript;
  // Trigger STT upload here
};

recognition.onend = () => {
  // User stopped speaking — good time to trigger upload
};

recognition.start();
// Browser handles VAD internally
```

**C. Server-side VAD (for higher accuracy)**
- Send audio chunks to server → use a VAD model (e.g., Silero VAD on server) to detect speech boundaries.
- Advantage: works regardless of browser, consistent across devices.
- Disadvantage: adds latency, requires server-side model.

**Recommendation:** Use **Approach A (Web Audio AnalyserNode + amplitude threshold)** for client-side real-time silence detection, combined with a timeout as fallback. Simple, no external dependencies, works offline.

---

### 3. Audio Format — webm/opus vs wav/pcm for Whisper STT

**Whisper API supports:**
- `multipart/form-data` with FLAC, WAV, MP3, OPUS, WebM`
- Native audio/webm with Opus is accepted directly by Whisper-1

**Format comparison:**

| Format | Pros | Cons |
|--------|------|------|
| `audio/webm;codecs=opus` | Small file size, native MediaRecorder output, browser-native | Must ensure server decodes WebM container |
| `audio/ogg;codecs=opus` | Firefox native output, small, widely supported | Safari doesn't support Ogg container |
| `audio/wav` | Uncompressed, highest quality, universal | Large file size, more bandwidth |
| `audio/pcm` (raw 16-bit) | Highest quality for STT, no codec overhead | Extremely large, not practical for streaming |

**For Whisper STT, the best choice is `audio/webm;codecs=opus`**:
- Native MediaRecorder output with minimal encoding overhead
- Small file sizes — faster upload
- Whisper handles it directly (no re-encoding needed server-side)
- Cross-browser support when you include proper mimeType fallback chain

**Server-side handling for WebM/Opus:**
```typescript
// If you need to convert to WAV for some STT providers
// Use ffmpeg on server: ffmpeg -i audio.webm -acodec pcm_s16le output.wav
// Or use Node.js library like `ogg` to decode Opus
```

**Recommendation:**
- Primary: `audio/webm;codecs=opus` (Chrome/FF/Safari 14.1+)
- Safari fallback: `audio/mp4` (Safari uses AAC in MP4)
- Do NOT use WAV for streaming — file sizes too large
- Whisper accepts WebM/Opus directly — no conversion needed

---

### 4. Audio Playback in Browser

Two options:

**A. `<audio>` element (simplest)**
```typescript
// Server returns audio URL/blob
const audioUrl = URL.createObjectURL(audioBlob);
const audio = new Audio(audioUrl);
audio.play();

// Or with a URL from server
const audio = new Audio('/api/tts/output');
audio.play();
```
- Pros: dead simple, works everywhere
- Cons: no real-time streaming, limited control

**B. AudioContext (low-latency, streaming)**
```typescript
const audioContext = new AudioContext();

// For streaming playback: fetch audio as ReadableStream, decode chunks
async function playStream(url: string) {
  const response = await fetch(url);
  const reader = response.body?.getReader();
  const audioCtx = new AudioContext();

  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;

    // Decode chunk to AudioBuffer
    const buffer = await audioCtx.decodeAudioData(value);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start();
  }
}
```

**For ElevenLabs TTS (short responses):** Use `<audio>` element — simple, reliable.
**For streaming/longer audio:** use `AudioContext` with chunked decoding.

**Key note on iOS Safari:** AudioContext requires user gesture to start. Create/resume context on first button press:
```typescript
const audioCtx = new AudioContext();
document.getElementById('talk-btn')?.addEventListener('click', () => {
  audioCtx.resume(); // Must be called on user gesture
});
```

---

### 5. Existing React Hooks for Audio Capture (npm 2025/2026)

**Notable libraries:**

| Package | Weekly Downloads | Status | Notes |
|---------|-----------------|--------|-------|
| `react-media-recorder` | ~80k/wk | Active | Covers capture, playback, blob handling; React 18+ |
| `use-audio-recorder` | ~15k/wk | Active | Lightweight, TypeScript, focused on recorder state |
| `@/hooks/useAudioCapture` | N/A (custom) | — | AIO Control currently uses no library |
| `react-use-audio` | ~2k/wk | Stale | Last update 2022, not recommended for new projects |
| `lamejs` | ~30k/wk | Stable | MP3 encoding in browser (client-side MP3 mux) |

**Most maintained / recommended for voice-to-AI:**
1. **`react-media-recorder`** — full-featured: capture, preview, download, blob handling. Works with MediaRecorder API directly. Good React 19 support.
2. **`use-audio-recorder`** — minimal, TypeScript-first. Gives you recorder state (recording/stopped/idle) and audio blob. Good if you want to build your own UI.

**Recommendation for AIO Control:**
- Start with a custom `useAudioCapture` hook (not a library) — gives full control over silence detection and chunking logic, which is critical for voice-to-AI.
- See Section 6 below for expected hook signature.

---

### 6. Expected Hook Signature for AIO Control

Based on the voice pipeline in `1-plan-v0.md`, the `useAudioCapture` hook should expose:

```typescript
interface UseAudioCaptureOptions {
  silenceThreshold?: number;      // amplitude threshold (default: 10)
  silenceDurationMs?: number;    // ms of silence to trigger upload (default: 1500)
  timesliceMs?: number;          // MediaRecorder timeslice (default: 1000)
}

interface UseAudioCaptureReturn {
  isListening: boolean;
  isProcessing: boolean;
  startCapture: () => Promise<void>;
  stopCapture: () => void;        // manual stop
  cancelCapture: () => void;
  audioBlob: Blob | null;
  audioUrl: string | null;        // for playback preview
  error: string | null;
  // For real-time visualization
  analyserNode: AnalyserNode | null;
  currentVolume: number;
}

function useAudioCapture(options?: UseAudioCaptureOptions): UseAudioCaptureReturn;
```

**States:**
- `idle` — not recording
- `listening` — recording with silence detection active
- `processing` — silence detected, uploading to STT

---

## Summary

| Topic | Recommendation |
|-------|---------------|
| **Capture API** | `MediaRecorder` with `audio/webm;codecs=opus` (Chrome/FF) / `audio/mp4` (Safari fallback) |
| **Silence detection** | Web Audio `AnalyserNode` + amplitude threshold on client; fallback timeout |
| **Format for Whisper** | `audio/webm;codecs=opus` — Whisper accepts directly, small file size |
| **Audio playback** | `<audio>` element for simplicity; `AudioContext` for streaming/low-latency |
| **React hook** | Custom `useAudioCapture` for full control over VAD and chunk streaming |
| **iOS Safari** | Requires user gesture; resume AudioContext on first interaction |

---

## Next Steps

1. Build `useAudioCapture` hook with silence detection
2. Wire it into `TalkModule.tsx` mic button
3. Send captured blob to server action `app/actions/talk.ts`
4. Integrate Whisper STT + ElevenLabs TTS
5. Add `talk_session_logs` table for debugging

---

**Onderzoekspagina:** Browser Audio Capture (mei 2026)
**Rechercheur:** Claude Code Agent
**Bronnen:** MDN MediaRecorder docs, Whisper API reference, Web Audio API specs, npm trends mei 2026

---

## Whisper STT API

### 1. API Endpoint en Authenticatie

**Endpoint:**
```
POST https://api.openai.com/v1/audio/transcriptions
```

**Authenticatie:** Bearer token via `Authorization` header.

```typescript
const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
  headers: {
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
  },
  // ...
});
```

**Model:** `whisper-1` (default, einzige beschikbare Whisper model via API)

**Prijzen (2026):**
- $0.006 per minuut audio (~ $0.36 per uur)
- Facturering op exact aantal seconden

---

### 2. Audio Format Requirements (Whisper-1)

Whisper-1 is flexibel qua input format. Aanbevolen combinatie:

| Parameter       | Aanbevolen Waarde        | Ondersteund              |
|-----------------|--------------------------|--------------------------|
| **Formaat**     | `mp3`, `wav`, `flac`, `ogg`, `webm`, `mp4`, `mpeg` | Alle oben + `m4a`, `aac` |
| **Sample rate** | 16 kHz (auto gedetecteerd) | Geen explicit instelling |
| **Bitrate**     | 128-256 kbps (VBR aanbevolen) | Wordt auto gedetecteerd |
| **Max bestandsgrootte** | 25 MB | Hard limiet |
| **Min duur**    | 0.01s | Geen minimum |
| **Max duur**    | ~3 uur (afhankelijk van bestandsgrootte) | Geen explicit limiet, 25MB is de factor |

**Aanbevolen encoding settings:**
```bash
# FFmpeg: mp3 128kbps mono 16kHz (ideaal voor spraak)
ffmpeg -i input.wav -ac 1 -b:a 128k -ar 16000 output.mp3

# Alternatief: WAV zonder compressie
ffmpeg -i input.wav -ac 1 -ar 16000 -c:a pcm_s16le output.wav
```

**Tips voor beste kwaliteit:**
- Mono (single channel) is voldoende voor spraakherkenning
- Lagere bitrates (64kbps) werken nog steeds goed voor eenvoudige spraak
- FLAC verliest geen kwaliteit maar is groter
- MP3 128kbps is de sweet spot tussen bestandsgrootte en kwaliteit

---

### 3. Response Format (Transcription Object)

**Default (JSON) response:**
```typescript
interface TranscriptionResponse {
  text: string;           // Volledige transcriptie
  task: string;           // "transcribe"
  language: string;       // gedetecteerde taal (ISO 639-1, e.g. "en")
  duration: number;       // audiduur in seconden
  created_at: string;     // timestamp (ISO 8601)
}
```

**Voorbeeld response:**
```json
{
  "text": "Hello, this is a test transcription.",
  "task": "transcribe",
  "language": "en",
  "duration": 3.5,
  "created_at": "2026-05-04T12:00:00.000Z"
}
```

**Alternative `response_format` opties:**

| Format          | Output                                    | Gebruik                     |
|-----------------|-------------------------------------------|-----------------------------|
| `json` (default) | `{ text, language, duration, ... }`      | Standaard integratie        |
| `verbose_json`  | Volledig object met `words`, `segments`  | Timing info, woord-level    |
| `srt`           | SRT subtitle formaat                      | Video subtitles             |
| `vtt`           | VTT subtitle formaat                      | Web video subtitles         |
| `text`          | Enkel plain text                          | Simpelste output            |

**Verbose_json extra velden:**
```typescript
interface VerboseTranscriptionResponse extends TranscriptionResponse {
  segments: Array<{
    id: number;
    start: number;       // seconde
    end: number;         // seconde
    text: string;
    tokens: number[];
    temperature: number;
  }>;
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
}
```

---

### 4. Whisper-1 vs Deepgram Nova-3: Real-time Comparatie

| Aspect              | Whisper-1                          | Deepgram Nova-3                        |
|---------------------|------------------------------------|----------------------------------------|
| **Type**            | Batch transcription (offline)     | Streaming + batch (real-time)          |
| **Latency**         | ~3-5s voor korte audio (~30s)     | <200ms voor streaming                  |
| **Use case**        | Record-and-transcribe, post-hoc    | LiveGesprek, real-time voice           |
| **Streaming**       | Nee - geen chunked uploads         | Ja - WebSocket stream endpoint         |
| **Taalondersteuning** | 99+ talen, zeer nauwkeurig       | 40+ talen                               |
| **Slaan over**     | Kan woorden overslaan bij ruis     | Betere ruisonderdrukking bij streaming  |
| **Pricing**         | $0.006/min                         | ~$0.0043/min (Nova-3)                   |
| **Audio formaat**   | Flexibel (alle bovenstaande)       | max 8KHz voor streaming, 48KHz batch    |
| **Woord-timing**   | Ja (verbose_json)                  | Ja                                     |
| **Punctuatie**      | Goed, kan verbeterd worden         | Goed out-of-the-box                    |
| **Speaker labels**  | Nee                                | Ja (Nova-3 met `diarize`)              |
| **API model**       | Enkele endpoint, alles POST        | REST + WebSocket (streaming)           |

**Real-time conclusie:**
- Whisper-1 is **niet geschikt voor real-time** toepassingen - het is een batch-API die complete audio verwacht en geen streaming ondersteunt. Typische turnaround is 3-10 seconden.
- Deepgram Nova-3 is specifiek gebouwd voor real-time met WebSocket streaming en <200ms latency.
- Voor "record en transcribe later" of chatbot-achtige toepassingen (waar je een audiobericht inspreekt en later antwoord krijgt) is Whisper-1 uitstekend.
- Voor live gesprekken, IVR systems, of real-time voice chat: **Deepgram Nova-3**.

---

### 5. Server-side Node.js Fetch Example

```typescript
// /api/whisper/transcribe
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const audioFile = formData.get("file") as File | null;

  if (!audioFile) {
    return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
  }

  // 25MB max check
  if (audioFile.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 25MB)" }, { status: 400 });
  }

  const openAiForm = new FormData();
  openAiForm.append("file", audioFile);
  openAiForm.append("model", "whisper-1");
  openAiForm.append("response_format", "verbose_json"); // for word timing
  openAiForm.append("timestamp_granularities[]", "word"); // word-level timing

  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        // Geen Content-Type header - fetch zet die auto bij FormData
      },
      body: openAiForm,
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json({ error: error.error?.message || "Whisper API error" }, { status: response.status });
    }

    const transcription = await response.json();
    return NextResponse.json({ transcription });
  } catch (err) {
    console.error("[Whisper] fetch error:", err);
    return NextResponse.json({ error: "Failed to call Whisper API" }, { status: 500 });
  }
}
```

**Client-side call voorbeeld (browser):**
```typescript
const form = new FormData();
form.append("file", audioBlob, "recording.mp3");

const res = await fetch("/api/whisper/transcribe", { method: "POST", body: form });
const { transcription } = await res.json();
console.log(transcription.text);
```

**Belangrijke aandachtspunten:**
- Zet **nooit** `Content-Type` header handmatig bij `FormData` - de browser/fetch moet die zelf setten met boundary
- De API key gaat **nooit** naar de client - altijd via server-side route
- Whisper-1 accepteert alle mainstream audio formaten; converteer alleen als FFmpeg beschikbaar is
- Bij audio > 25MB: split file client-side of gebruik chunked approach

---

**Bronnen:**
- [OpenAI Speech-to-Text Guide](https://platform.openai.com/docs/guides/speech-to-text) (API reference)
- [Audio Transcription API](https://platform.openai.com/docs/api-reference/audio/createTranscription)
- [OpenAI Pricing](https://openai.com/pricing) - $0.006/min voor Whisper-1
- [Deepgram Nova-3](https://deepgram.com/product/nova-3) - real-time streaming compare

---

## ElevenLabs TTS API

### Endpoint + Auth
- **Base URL**: `https://api.elevenlabs.io/v1/`
- **Auth**: Header `xi-api-key: <your-api-key>`

### Endpoints
| Endpoint | Method | Returns |
|---|---|---|
| `/v1/text-to-speech/{voice_id}` | POST | Binary audio (MP3) |
| `/v1/text-to-speech/{voice_id}/stream` | POST | Streaming audio via SSE |

### Request body
```json
{
  "text": "The first move is what sets everything in motion.",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0,
    "use_speaker_boost": true,
    "speed": 1.0
  }
}
```

### Voice IDs
Settings page hardcodes: `rachel`, `adam`, `bella`, `daniel`, `sarah`, `antoni`. These map to ElevenLabs voice IDs — but the actual voice IDs are NOT in the code. Need to either: (a) use ElevenLabs voice search API to resolve IDs, or (b) ask user to provide voice IDs.

### Node.js example (native fetch)
```javascript
const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text: responseText,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  }
);
// response.body is a ReadableStream of MP3 chunks
```

**Bronnen**: [ElevenLabs API Reference](https://elevenlabs.io/docs/api-reference), [Text-to-Speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert.mdx)

---

## AI Provider Architecture (packages/ai)

### Provider Contract
No formal interface or base class. Each provider is a plain async generator function:
```typescript
async function* streamProviderName(opts: StreamChatOptions): AsyncIterable<AGUIEvent>
```

Every provider must:
- Accept `StreamChatOptions` (provider id, agent config, messages, api key, tenant context, session id, tools)
- Yield `message_start` first, then zero or more `token`/`tool_call_start`/`tool_call_result` events
- Always end with `message_end` carrying token `usage` (input_tokens, output_tokens, cost_cents)
- Optionally yield `error` and return early on failure

### Registration
Providers registered by adding a `case` to the `streamChat()` switch in `router.ts`. No IoC container.

### Selection
`streamChat()` is the single entry point. Selection via:
- Caller's `provider: ProviderId` field (one of: `claude`, `claude_cli`, `openrouter`, `ollama`, `minimax`, `openclaw`, `hermes`, `codex`)
- Smart routing via `pickRouted()` — rule-based redirection based on input length, keywords, turn depth

### Non-LLM Providers
**There are NONE.** The entire provider layer is LLM-only. No voice, TTS, or STT provider IDs. Adding voice would require entirely new event types, new provider functions, and new stream shapes from scratch.

### AG-UI Events
The protocol defines: `message_start`, `token`, `message_end`, `tool_call_start`, `tool_call_result`, `state_update`, `error`. AIO Control extensions: `ask_followup`, `todo_set`, `plan_proposed`, `open_ui_at`, `confirm_required`.

Transport is provider-specific: HTTP/SSE for cloud providers, `child_process.spawn()` subprocess streaming for CLI-based providers.