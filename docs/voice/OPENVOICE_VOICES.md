# OpenVoice Construct Voice Pipeline

OpenVoice is the primary local TTS backend for construct reply playback when configured. The route remains `/api/tts`; Voice Lab uses `/api/voice/*` for reference upload, audit, trim, preview, and save.

## Reference Audio Selection

Reference audio is selected by construct identity, not by the visible voice label. This avoids identity drift when multiple constructs share the same UI voice labels.

| Construct | Thread prefix | Reference env |
| --- | --- | --- |
| Zen | `zen-001_chat_with_` | `OPENVOICE_REFERENCE_AUDIO_ZEN` |
| Lin | `lin-001_chat_with_` | `OPENVOICE_REFERENCE_AUDIO_LIN` |
| Nova | `nova-001_chat_with_` | `OPENVOICE_REFERENCE_AUDIO_NOVA` |
| Other | any other construct | `OPENVOICE_REFERENCE_AUDIO` |

If a construct-specific env var is not set, the server falls back to `OPENVOICE_REFERENCE_AUDIO`.

## Voice Lab Storage

Saved construct references should be durable VVAULT identity assets:

```text
instances/{construct}/identity/voice/ref.wav
instances/{construct}/identity/voice.json
```

`voice.json` records machine metadata such as:

```json
{
  "voiceId": "openvoice",
  "ref": "voice/ref.wav"
}
```

## Smoke Test

1. Start Chatty and confirm `/api/health` is healthy.
2. Open GPT Creator for a construct.
3. Open Voice Lab help.
4. Upload or fetch a reference source.
5. Run audit.
6. Trim if needed.
7. Preview.
8. Save.
9. Confirm the saved voice metadata points to the construct identity path.

The written assistant message should remain unchanged; TTS only affects spoken playback.
