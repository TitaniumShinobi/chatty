# OpenVoice construct voice pipeline (Zen / Lin / Nova)

Local TTS for construct reply playback: OpenVoice is the primary backend. No per-minute cloud TTS billing for the main path.

## How OpenVoice was integrated

- **Server:** [server/routes/tts.js](server/routes/tts.js) handles `POST /api/tts` with `provider: 'openvoice'` (or no provider; server default is `openvoice`). Two modes:
  - **Direct:** `OPENVOICE_API_MODE=direct` or `auto` success → request to `OPENVOICE_BASE_URL` + `OPENVOICE_TTS_PATH` with text/style/voice.
  - **Gradio:** `OPENVOICE_API_MODE=gradio` or direct failure → proxy to Gradio `/api/predict` with `fn_index`, text, style, **reference audio path**, and agree flag.
- **Reference audio selection (by construct, not voice id):** The server derives **construct** from `threadId` (`zen-001_chat_with_*` → zen, `lin-001_chat_with_*` → lin, `nova-001_chat_with_*` → nova, else generic). `getOpenVoiceReferencePathByConstruct(construct)` then picks the reference file path: zen → `OPENVOICE_REFERENCE_AUDIO_ZEN`, lin → `OPENVOICE_REFERENCE_AUDIO_LIN`, nova → `OPENVOICE_REFERENCE_AUDIO_NOVA`, else `OPENVOICE_REFERENCE_AUDIO`. The **voice** field in the request is the user’s chosen label (e.g. Sage, Coral) and is used for style/API only; it does **not** determine which construct reference is used. That avoids identity drift when Zen and Lin share the same premium voice list.
- **Client:** [src/lib/tts.ts](src/lib/tts.ts) `speakPremium()` POSTs to `/api/tts` with `{ text, voice, provider: 'openvoice', threadId }`. **Premium reply TTS is OpenVoice-backed**; the name “premium” in the UI refers to this server TTS path. Voice resolution: Zen thread → General > Zen voice, Lin thread → General > Lin voice, Nova thread → generic voice (or `'nova'` if unset), others → generic voice. Spoken text is the existing spoken-text transform; the written thread message is unchanged.

## How construct and settings map into the local backend

| Construct   | Thread id prefix      | Settings control           | Reference audio (env)              |
|------------|------------------------|----------------------------|------------------------------------|
| Zen        | `zen-001_chat_with_`  | General > Zen voice       | `OPENVOICE_REFERENCE_AUDIO_ZEN`   |
| Lin        | `lin-001_chat_with_`  | General > Lin voice       | `OPENVOICE_REFERENCE_AUDIO_LIN`   |
| Nova       | `nova-001_chat_with_` | Generic voice (configurable) | `OPENVOICE_REFERENCE_AUDIO_NOVA`   |
| Other      | (any other)           | Generic voice             | `OPENVOICE_REFERENCE_AUDIO`        |

The server selects reference audio **only** from `threadId` (construct). The chosen **voice** (e.g. Sage, Coral) is sent as `voice` for OpenVoice style/label; it does not select the reference path.

## Local assets / reference audio required

- **Default (all constructs if per-construct not set):** `OPENVOICE_REFERENCE_AUDIO` — e.g. `resources/demo_speaker2.mp3` or a path your OpenVoice service can read.
- **Per-construct (optional):** Set to give Zen/Lin/Nova distinct cloned voices:
  - `OPENVOICE_REFERENCE_AUDIO_ZEN` — path to Zen reference (e.g. `resources/zen_speaker.mp3`).
  - `OPENVOICE_REFERENCE_AUDIO_LIN` — path to Lin reference (e.g. `resources/lin_speaker.mp3`).
  - `OPENVOICE_REFERENCE_AUDIO_NOVA` — path to Nova reference (e.g. `resources/nova_speaker.mp3`).

Paths are sent to the OpenVoice service as-is; the service must be able to resolve them (same container filesystem or mounted volume). If a per-construct var is unset, `OPENVOICE_REFERENCE_AUDIO` is used for that construct.

## End-to-end test steps (Zen / Lin / Nova voice playback)

1. **Setup**
   - OpenVoice service running (Gradio or direct API) and reachable at `OPENVOICE_BASE_URL`.
   - Set `TTS_PROVIDER=openvoice` (or rely on default). Optionally set `OPENVOICE_REFERENCE_AUDIO_ZEN`, `_LIN`, `_NOVA` to distinct reference files.
   - In Chatty: General > Voice provider = Premium (so reply TTS uses `/api/tts` and OpenVoice).

2. **Zen**
   - Open or create a thread whose id starts with `zen-001_chat_with_`.
   - Settings > General > Zen voice: choose a voice (e.g. Sage).
   - Enter voice mode; speak; stop. Wait for assistant reply.
   - **Expected:** Reply is spoken automatically using OpenVoice with Zen reference audio (distinct from Lin/Nova if ZEN ref is set).

3. **Lin**
   - Open or create a thread whose id starts with `lin-001_chat_with_`.
   - Settings > General > Lin voice: choose a voice (e.g. Coral).
   - Enter voice mode; speak; stop. Wait for assistant reply.
   - **Expected:** Reply is spoken automatically using OpenVoice with Lin reference audio.

4. **Nova**
   - Open or create a thread whose id starts with `nova-001_chat_with_`.
   - (Optional) Set generic voice to e.g. Nova; otherwise default `nova` is used.
   - Enter voice mode; speak; stop. Wait for assistant reply.
   - **Expected:** Reply is spoken using OpenVoice with Nova reference audio (construct from threadId); voice label comes from generic setting.

5. **Sanity**
   - Confirm no duplicate playback, written message in thread unchanged, and spoken output uses the spoken-text variant. Confirm no fallback to OpenAI/ElevenLabs for the primary reply path when provider is OpenVoice.
