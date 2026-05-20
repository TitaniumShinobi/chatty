# Voice Identity Storage

## Current contract

Chatty uses one canonical Supabase document for the Forge voice instructions field:

- `instances/{callsign}/identity/voice.md`

This file stores the plain text spoken-tone instructions shown in the GPTCreator Forge voice textarea.

## Reference audio (Voice Lab)

- `instances/{callsign}/identity/voice.wav`

Canonical OpenVoice (or other) reference clip saved from Voice Lab. Stored in Supabase Storage with a matching `vault_files` row (`storage_path` under bucket `vault-files`).

## Reserved machine metadata

`voice.json` is not used for Forge voice instructions.

- `instances/{callsign}/identity/voice.json`

Reserved for machine-readable voice metadata (for example `{ "voiceId": "openvoice", "ref": "voice.wav" }`). TTS resolves `identity/voice.wav` first; `voice.json` remains for metadata and legacy `ref` values such as `voice/ref.wav`.

## Rules

- The Forge voice textarea reads from `voice.md`.
- The Forge voice textarea saves to `voice.md`.
- Identity aggregation uses `voice.md` as the single source of truth for voice instruction text.
- TTS and Voice Lab use `voice.wav` at the identity root; `voice.json` carries optional metadata and legacy `ref` paths only.

## Legacy compatibility

Older constructs may still have Forge voice text stored in `voice.json` as `{ "text": "..." }`.

- Chatty may read that legacy `text` value as a fallback so existing constructs still render in GPTCreator.
- New saves do not write Forge voice text back to `voice.json`.
