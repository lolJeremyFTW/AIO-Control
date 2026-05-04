# Audit Plan v0 — aio-elevenlabs-scope

**Datum**: 2026-05-04
**Fase**: 1 — Research & Architecture
**Doel**: Full scope voice module, voorbereiding ElevenLabs fix

---

## Scope

### Wel meenemen
- Volledige voice/Talk pipeline architectuur onderzoek
- Bestaande UI componenten (`TalkModule.tsx`, `TalkSettings.tsx`, `talk/page.tsx`)
- Server actions (`app/actions/talk.ts`)
- Database schema (`talk_settings` table, migrations)
- `packages/ai` — alle providers en hoe ze aangesloten worden
- Deployment structuur VPS (ports 3010, 3012, Tailscale)
- Browser audio APIs (MediaRecorder, Web Audio API, AudioContext)
- STT/TTS provider integraties (ElevenLabs, Whisper, Deepgram)

### Niet meenemen (buiten scope)
- Andere AI providers dan voice-gerelateerd
- Backend van andere modules
- UI wijzigingen buiten voice flow
- Nieuwe feature requests

---

## Success criteria

1. **Architectuur documentatie**: Exact beschreven hoe voice pipeline zou moeten werken
2. **Gap analyse**: Bekend welke componenten ontbreken vs. welke bestaan
3. **Logging plan**: Hoe we interacties kunnen loggen voor debugging
4. **VPS sync check**: Manier om te verifiëren dat VPS code up-to-date is met local
5. **Minimale viable pipeline**: Duidelijk pad naar werkende ElevenLabs integratie

---

## Voice pipeline architectuur (research fase)

### Hoe het zou moeten werken

```
[Spreken] → [Browser Audio Capture] → [STT API] → [Text/LLM] → [Response Text] → [TTS API] → [Audio Playback]
    ↑                                                                                                                                  |
    └────────────────────────────────_________ [Agent Response] _______________________________________________________________|
```

### Stappen in detail

1. **Audio Capture (Client/Browser)**
   - `MediaRecorder` API of `AudioContext` voor microfoon input
   - Stream naar blobs/chunks
   - Opsplitsen in chunks voor streaming STT

2. **Speech-to-Text (STT) — Server**
   - Ontvang audio chunks van browser
   - Roep STT provider aan (Whisper-1, Deepgram Nova-3, ElevenLabs STT)
   - Retourneer transcript tekst

3. **LLM Processing — Server**
   - STT tekst naar LLM provider (al bestaand in `packages/ai`)
   - Ontvang response tekst
   - (Optioneel) direct TTS triggeren of wachten op verdere flow

4. **Text-to-Speech (TTS) — Server**
   - Ontvang response tekst van LLM
   - Roep TTS provider aan (ElevenLabs, OpenAI TTS, Azure Speech)
   - Genereer audio file/stream

5. **Audio Playback (Client/Browser)**
   - Ontvang audio van server
   - Afspelen via `AudioContext` of `<audio>` element
   - Eventuele stream缓冲 voor realtime playback

6. **Logging (Server)**
   - Elke stap loggen (audio received, STT result, LLM prompt/response, TTS generated)
   - Opslaan in database voor analytics/debugging

---

## Te beantwoorden vragen

### 1. Hoe moet de voice pipeline architecturally werken?

Zie sectie hierboven. Korte samenvatting:
- **Hybrid model**: Browser client doet audio capture en playback, server doet STT/LLM/TTS
- **Streaming**: Voor goede UX moeten we chunked audio streaming gebruiken
- **State management**: Wanneer toggle `listening` → capture start, einde detectie → stuur naar STT

### 2. Moet dit client-side (browser) of server-side, of hybrid?

**Hybrid verplicht**:
- **Client-side (Browser)**: Audio capture via `MediaRecorder`/`AudioContext`, audio playback
  - Kan NIET server-side omdat browsers geen directe microfoon toegang hebben tot servers
- **Server-side**: Alle API calls naar STT/LLM/TTS providers
  - API keys moeten server-side blijven (niet blootstellen aan client)
  - Netwerk calls naar ElevenLabs etc. moeten via server actions

Conclusie: Browser capture → server processing → browser playback

### 3. Wat zijn de losse componenten die gebouwd moeten worden?

| Component | Status | Actie |
|-----------|--------|-------|
| `TalkModule.tsx` mic button UI | Bestaat | Uitbreiden: audio capture logic koppelen |
| `TalkSettings.tsx` settings UI | Bestaat | Controleren of settings correct doorgegeven worden |
| `app/actions/talk.ts` | Bestaat (maar half) | Uitbreiden: STT/LLM/TTS calls toevoegen |
| `packages/ai` providers | Gedeeltelijk | Nieuwe: voice/STT/TTS providers toevoegen |
| Browser audio capture hook | **ONTBREKT** | Nieuw: `useAudioCapture` hook |
| Audio playback component | **ONTBREKT** | Nieuw: `AudioPlayer` component/logic |
| Stream transport (browser→server) | **ONTBREKT** | Nieuw: chunked upload mechanisme |
| TTS provider integratie (ElevenLabs) | **ONTBREKT** | Nieuw: `ElevenLabsTTSProvider` class |
| STT provider integratie | **ONTBREKT** | Nieuw: `WhisperSTTProvider`, `DeepgramSTTProvider` |
| Logging/analytics systeem | **ONTBREKT** | Nieuw: talk_session_logs table + server logging |
| VPS deployment verificatie | **ONTBREKT** | Nieuw: sync check script |

### 4. Wat is de minimale viable voice pipeline om ElevenLabs werkend te krijgen?

```
Mic Button Click
    ↓
Start MediaRecorder (browser)
    ↓
Audio chunk ontvangen (na spreekpauze of timeout)
    ↓
Server Action: processAudio(audioBlob)
    ↓
STT: Convert audio → text (Whisper-1 of Deepgram)
    ↓
LLM: Send text → get response (bestaande provider)
    ↓
TTS: Convert response → audio (ElevenLabs)
    ↓
Return audio → browser
    ↓
Play audio via Audio element
    ↓
Log interaction in database
```

**Minimale setup voor MVP**:
1. Browser `MediaRecorder` voor audio capture
2. Server action die audio ontvangt
3. Whisper-1 STT call (OpenAI, werkt out-of-the-box)
4. Bestaande LLM call (geen nieuwe provider)
5. ElevenLabs TTS call (de key is al ingevoerd)
6. Audio playback in browser
7. Basic logging naar `talk_session_logs` table

### 5. Hoe controleren we of de VPS versie up-to-date is met de local code?

**Opties**:

a. **Git hash vergelijking**:
   - Local: `git rev-parse HEAD`
   - VPS: `git rev-parse HEAD` via Tailscale SSH
   - Vergelijk of ze matchen

b. **Build timestamp vergelijken**:
   - Check `next build` output of deployment timestamp
   - Voeg `cat /app/.last-build` toe aan deployment script

c. **Versie endpoint**:
   - Maak een `/api/versions/current` endpoint die git hash + build time retourneert
   - Uitbreiden `app/api/health` als die al bestaat

d. **Automount localsync**:
   - Als code op VPS gemount is van local, is het altijd sync
   - Check mount status: `df -h` of `mount | grep`

**Aanbeveling**: Optie (a) + (c) combineren voor full coverage

---

## Audit focus

### High priority — Deep dive nodig

1. **`app/actions/talk.ts`**
   - Wat slaat het exact op?
   - Waar worden de settings gelezen bij talk interactie?
   - Hoe wordt de LLM aangeroepen vanuit talk flow?

2. **`packages/ai/src/`**
   - Exact folder structuur
   - Hoe worden providers geinstantieerd?
   - Is er abstractie voor voice providers (TTS/STT) of alleen LLM?

3. **`talk/page.tsx`**
   - Waar komt de `log` vandaan (hardcoded leeg)?
   - Hoe wordt `listening` state gemanaged?
   - Waar wordt `app/actions/talk.ts` aangeroepen?

4. **`TalkModule.tsx`**
   - Exacte click handler
   - Hoe wordt `listening` visual state getoggled?
   - Is er al audio state management?

### Medium priority

5. **`talk_settings` table schema**
   - Alle velden en types
   - Hoe worden settings opgehaald in talk flow?

6. **VPS deployment script**
   - Hoe werkt `deploy.sh` of equivalent?
   - Waar staan de builds op VPS?
   - Hoe check je draaiende versie?

7. **Environment / API keys**
   - Waar staat ElevenLabs key?
   - Zijn STT keys (Whisper, Deepgram) ook geconfigureerd?

---

## Risico's

| Risico | Kans | Impact | Mitigatie |
|--------|------|--------|-----------|
| VPS draait oude code terwijl local wijzigt | Hoog | Hoog | Voor fixen: altijd VPS checken + sync script |
| Browser audio APIs werken niet in alle browsers | Medium | Medium | Test op Chrome (primair), Firefox, Safari |
| Streaming audio latency te hoog voor realtime | Medium | Medium | Start met non-streaming MVP, optimaliseer later |
| ElevenLabs key werkt niet / verkeerde region | Laag | Hoog | Test apart met curl voor bouwen |
| STT providers kosten money | Laag | Medium | Whisper-1 is goedkoop, limieten instellen |
| LLM provider (bestaand) faalt tijdens voice flow | Laag | Medium | Error handling + retry logic |
| Talk settings worden niet correct gelezen | Onbekend | Hoog | Debug settings flow eerst |

---

## Volgende stappen (na audit)

1. Server action `app/actions/talk.ts` volledig uitschrijven met STT→LLM→TTS flow
2. Browser audio capture hook `useAudioCapture` bouwen
3. ElevenLabs TTS provider implementeren in `packages/ai`
4. Whisper STT provider (of Deepgram) implementeren
5. Logging systeem toevoegen aan talk flow
6. VPS sync check script
7. Testen op VPS na deployment
