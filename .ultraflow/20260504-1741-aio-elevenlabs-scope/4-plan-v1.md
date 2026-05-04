# 4-plan-v1.md — Concrete Voice Pipeline Implementation Plan

**Datum**: 2026-05-04
**Bron**: 0-brief.md, 1-plan-v0.md, 2-research.md, 3-map.md
**Fase**: Na research — executive plan voor implementatie

---

## Status Quo

| Component | Status |
|---|---|
| TalkModule.tsx (mic button UI) | Bestaat, toggle werkt, geen audio capture |
| TalkSettings.tsx (settings page) | Bestaat, leest/schrijft naar DB, VOICES zijn display names |
| talk_settings table | Bestaat, opslag klaar, geen audio verwerkt |
| saveTalkSettings action | Bestaat, null logging |
| /api/chat/[agent_id] | Werkt volledig voor text |
| packages/ai providers | LLM-only, geen STT/TTS |

---

## P0 — Voice Pipeline (productie geblokkeerd)

### 0. Quick Win: Logging toevoegen aan saveTalkSettings

**File**: `apps/control/app/actions/talk.ts`

De huidige `saveTalkSettings` heeft letterlijk geen enkele logging. Voeg toe zodat settings-wijzigingen traceerbaar zijn.

```
Add console.log at entry, success, and error points.
```

---

### 1. Voice ID mapping fix

**File**: `apps/control/components/settings/TalkSettings.tsx`

**Probleem**: De `VOICES` array bevat display names (`rachel`, `adam`, etc.) maar dit zijn geen ElevenLabs voice IDs.

**Oplossing**: Haal echte voice IDs op via ElevenLabs Voices API en persist in DB of env.

**Stappen**:
1. Nieuwe env var `ELEVENLABS_VOICE_MAP` als JSON object: `{ "rachel": "EXACT_VOICE_ID", "adam": "EXACT_VOICE_ID", ... }`
2. Of: fetch live van `GET /v1/voices` met `xi-api-key` en match op name
3. Store de mapping in `talk_settings.voice_id_map` column (migration nodig)
4. TalkSettings.tsx leest de mapping bij laden

**Edge case**: Als voice niet in mapping zit, fallback naar first available voice + warning log.

---

### 2. API Route: POST /api/talk

**New file**: `apps/control/app/api/talk/route.ts`

Ontvangt audio blob van browser, returned audio.

```
Request: FormData { audio: Blob, agent_id: string, workspace_slug: string }
Response: audio/mpeg (MP3 stream)
```

**Stappen**:
1. Parse FormData
2. Valideer audio size (max ~30s bij 16kHz webm = ~1MB)
3. Log ontvangst
4. Roep STT aan
5. Roep LLM aan (bestaande streamChat)
6. Roep TTS aan
7. Log volledige flow
8. Return audio als streaming response

---

### 3. STT: Whisper-1 integratie

**Waar**: `apps/control/app/api/talk/route.ts` (server-side)

**Keuze**: Whisper-1 (OpenAI) — simpelste integratie, werkt goed voor algemene spraak.

```
POST https://api.openai.com/v1/audio/transcriptions
Headers: Authorization: Bearer <OPENAI_API_KEY>
Body: FormData { file: audio_blob, model: "whisper-1" }
Response: { text: "transcribed string" }
```

**Edge cases**:
- Audio format: MediaRecorder geeft webm/opus. Whisper-1 accepteert ook multipart. Geen aparte conversie nodig.
- Taal: auto-detect ( Whisper-1 default ), eventueel expliciet `language: "nl"` als user setting.
- Timeout: 30s max voor audio. Log als het langer duurt.

---

### 4. LLM: Bestaande streamChat hergebruiken

**Waar**: `apps/control/app/api/talk/route.ts` (server-side)

Gebruik de bestaande `/api/chat/[agent_id]` flow intern:

```ts
const response = await fetch(`${req.nextUrl.origin}/api/chat/${agent_id}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content: transcription }] }),
});
```

**Edge case**: Stream responses — LLM stream is SSE. We moeten wachten op volledige text response voordat we TTS aanroepen. Optioneel: eerste token al naar TTS sturen voor latency winst.

---

### 5. TTS: ElevenLabs integratie

**Waar**: `apps/control/app/api/talk/route.ts` (server-side)

```ts
const voiceId = resolveVoiceId(settings.voice_label); // "rachel" → "a1b2c3..."

const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text: llmResponseText,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
        speed: 1.0,
      },
    }),
  }
);
```

Stream response direct terug als `audio/mpeg`.

---

### 6. Browser: useAudioCapture hook

**New file**: `apps/control/hooks/useAudioCapture.ts`

```ts
interface UseAudioCapture {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob>;
  error: string | null;
}
```

**Implementatie**:
- `navigator.mediaDevices.getUserMedia({ audio: true })`
- `MediaRecorder` met `audio/webm` mimeType (fallback naar `audio/mp4`)
- Collect chunks in array
- `stopRecording()` returns `new Blob(chunks, { type: "audio/webm" })`

**Edge cases**:
- Permission denied: catch en return error string
- Browser ondersteunt geen MediaRecorder: fallback error
- Recording te lang (>30s): auto-stop met timeout

---

### 7. Browser: TalkModule.tsx audioconnectie

**File**: `apps/control/components/TalkModule.tsx`

Huidige state: mic button togglet `listening` boolean.

**Nodig**:
1. Import `useAudioCapture` hook
2. `startRecording()` op mic-button-click (als `listening` false)
3. `stopRecording()` + verzenden via `POST /api/talk` op tweede click (als `listening` true)
4. Toon loading state tijdens verwerking
5. Speel ontvangen audio af via `<audio>` element of `AudioContext`
6. Reset `listening` naar false na playback

---

### 8. Logging: talk_session_logs table + write

**New migration**: `039_talk_session_logs.sql`

```sql
CREATE TABLE aio_control.talk_session_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES aio_control.workspaces(id),
  agent_id UUID NOT NULL REFERENCES aio_control.agents(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  transcription TEXT,
  llm_prompt TEXT,
  llm_response TEXT,
  tts_voice_id TEXT,
  duration_ms INTEGER,
  error TEXT,
  vps_git_hash TEXT
);
```

**Server-side logging in /api/talk**:
- Log ontvangst audio (size, duration)
- Log STT resultaat (transcription text)
- Log LLM input/output (truncated als te lang)
- Log TTS input length
- Log totale duration
- Log error als any

---

### 9. VPS Sync Check (P1)

**Doel**: Weten of VPS achterloopt op local.

**Implementatie**:

1. **Git hash vergelijking**:
   ```bash
   # Local
   git rev-parse HEAD

   # VPS (via Tailscale SSH)
   ssh 87.106.146.35 "cd /app && git rev-parse HEAD"
   ```

2. **Script**: `scripts/vps-sync-check.sh`
   ```bash
   LOCAL_HASH=$(git rev-parse HEAD)
   VPS_HASH=$(ssh 87.106.146.35 "cd /app && git rev-parse HEAD")
   if [ "$LOCAL_HASH" != "$VPS_HASH" ]; then
     echo "OUT OF SYNC: local=$LOCAL_HASH vps=$VPS_HASH"
     exit 1
   else
     echo "SYNCED: $LOCAL_HASH"
   fi
   ```

3. **API endpoint** (optioneel): `GET /api/version` die `{ git_hash, deployed_at }` retourneert.

---

## Edge Cases Summary

| Edge case | Oplossing |
|---|---|
| Voice ID niet gevonden in mapping | Fallback naar first voice + console.warn |
| Whisper-1 timeout (>30s) | Log als error, return user-facing "Kon niet verstaan" |
| LLM geeft lege response | Skip TTS, log error |
| Browser ondersteunt geen MediaRecorder | Toon error in TalkModule |
| Microfoon permission geweigerd | Catch error, toon "Mikrofon toegang nodig" |
| Supabase local op VPS niet bereikbaar | Check connection string, log als fetch failed |
| VPS code verouderd | VPS sync check script |

---

## Implementatie Volgorde

```
Step 1: Logging op saveTalkSettings       (15 min — quick win)
Step 2: /api/talk skeleton                 (30 min — debuggable)
Step 3: Whisper-1 STT call                (30 min)
Step 4: Bestaande LLM hergebruiken         (20 min)
Step 5: ElevenLabs TTS call              (30 min)
Step 6: useAudioCapture hook              (45 min)
Step 7: TalkModule.tsx audioconnectie     (45 min)
Step 8: talk_session_logs migration       (20 min)
Step 9: Logging in /api/talk              (30 min)
Step 10: Voice ID mapping fix             (30 min)
Step 11: VPS sync check script            (20 min)
```

---

## Wat niet hoeft (buiten MVP scope)

- Real-time streaming STT ( chunked upload terwijl je spreekt )
- WebSocket voor audio streaming
- Meerdere STT/TTS providers tegelijk
- Audio playback visualisatie (waveform)
- Push-to-talk timeout fine-tuning
- Custom ElevenLabs voice cloning
- Browser extension voice input

---

## Verwachte Uitkomst na MVP

1. Klik mic button
2. Spreek vraag
3. Klik nogmaals om op te nemen
4. Wacht op verwerking (1-3s)
5. Hoor audio antwoord
6. Logs zichtbaar in `talk_session_logs`