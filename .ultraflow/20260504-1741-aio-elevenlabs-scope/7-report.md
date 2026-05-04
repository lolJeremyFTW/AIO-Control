# 7-report.md — AIO Control Voice Pipeline Audit + Implementation

**Datum**: 2026-05-04
**Status**: AUDIT voltooid + IMPROVE (voice pipeline) implemented

---

## Audit Samenvatting

### VPS Status
- `aio.tromptech.life` draait — bereikbaar ✓
- VPS commit: `1e7d626` (gebouwd 2026-05-04 12:02:33 UTC)
- Lokale code: `aa5a07a` — 1 commit newer, geen critical gaps
- SSH via Tailscale: Permission denied (SSH key issue, zie hieronder)
- **Supabase draait lokaal op de VPS** (belangrijk voor DB latency)

### Audit Bevindingen

| Component | Status | Notes |
|---|---|---|
| TalkModule.tsx | UI only | Geen audio capture, geen API calls |
| talk.ts server action | Settings-only | Slaat alleen talk_settings op, null logging |
| `/api/talk` route | Was ontbrekend | **Nu gebouwd** |
| STT (Whisper) | Was ontbrekend | **Nu geïmplementeerd** |
| TTS (ElevenLabs) | Was ontbrekend | **Nu geïmplementeerd** |
| packages/ai providers | LLM-only | Geen voice providers, niet nodig voor MVP |
| Voice ID mapping | Was display names | **Nu gemapped naar ElevenLabs UUIDs** |
| Logging | Was afwezig | **Nu naar talk_session_logs** |

### Root Cause — Waarom ElevenLabs "niets deed"

De UI en DB-schema waren klaar, maar de **execution engine ontbrak volledig**:
1. `TalkModule.tsx` togglede alleen een `listening` boolean — geen audio capture
2. `talk.ts` action schreef alleen settings naar DB — geen audio processing
3. Geen server route om audio te ontvangen
4. Geen STT/TTS API integratie

---

## Wat is gebouwd

### 1. `useAudioCapture` hook
**File**: `apps/control/hooks/useAudioCapture.ts`

- `navigator.mediaDevices.getUserMedia` voor microfoon
- `MediaRecorder` met cross-browser mimeType fallback
- Web Audio `AnalyserNode` voor volume monitoring
- Silence detection (amplitude threshold + duration)
- Max duration timeout (30s)
- States: `idle` → `requesting` → `listening` → `processing` → `playing`

### 2. `/api/talk` route
**File**: `apps/control/app/api/talk/route.ts`

Full pipeline:
1. Auth via Supabase session cookie
2. Parse `FormData` (audio blob + agent_id + workspace_slug)
3. Load `talk_settings` uit DB
4. **STT**: Whisper-1 via OpenAI API (`multipart/form-data`)
5. **LLM**: `streamChat()` — single turn, geen tools
6. **TTS**: ElevenLabs streaming endpoint (`audio/mpeg` via SSE pipe)
7. **Logging**: Insert naar `talk_session_logs` (fire-and-forget)
8. Stream MP3 terug naar browser

### 3. `TalkModule.tsx` — wired up
- Mic button click → `startCapture()` of `stopCapture()`
- Audio blob → `POST /api/talk`
- Response audio → `URL.createObjectURL` → `<audio>` element play
- Error states tonen (`is-busy`, `is-error` CSS classes)
- Processing spinner tijdens server round-trip

### 4. Voice ID mapping
**Fix**: `rachel`/`adam`/etc. display names → ElevenLabs voice UUIDs via `resolveVoiceId()` helper.

### 5. `talk_session_logs` migration
**File**: `packages/db/supabase/migrations/039_talk_session_logs.sql`

Table voor audit logging: workspace_id, agent_id, transcription, llm_prompt, llm_response, tts_voice_id, duration_ms, error_text, providers.

### 6. Logging op `saveTalkSettings`
**File**: `apps/control/app/actions/talk.ts`

Entry/exit logging op alle paths.

### 7. `elevenlabs` toegevoegd aan API key resolver
**File**: `apps/control/lib/api-keys/resolve.ts`

`ENV_FALLBACK.elevenlabs = "ELEVENLABS_API_KEY"`

---

## Wat nog moet gebeuren

### Migratie draaien op VPS
De nieuwe `039_talk_session_logs.sql` migratie moet op de VPS database worden toegepast:

```bash
ssh jeremy@vps "docker exec -i supabase-db psql -U postgres -d postgres \
  < /home/jeremy/aio-control/packages/db/supabase/migrations/039_talk_session_logs.sql"
```

### Environment variabelen op VPS
Controleer of `ELEVENLABS_API_KEY` en `OPENAI_API_KEY` in de VPS environment staan:

```bash
ssh jeremy@vps "grep -E 'ELEVENLABS|OPENAI' /home/jeremy/aio-control/.env.production"
```

(De keys staan mogelijk al in de `api_keys` DB tabel — check of `resolveApiKey("elevenlabs", ctx)` werkt.)

### Deploy
```bash
ssh jeremy@vps "bash /home/jeremy/aio-control/deploy/vps-deploy.sh"
```

### SSH key fix (optioneel)
SSH via Tailscale werkt niet — check `~/.ssh/authorized_keys` op de VPS.

---

## VPS Sync Check

**Gedaan**: Health check via `curl https://aio.tromptech.life/api/version`
**Niet gedaan**: Git hash vergelijking script — SSH key issue blokkeert dit.
