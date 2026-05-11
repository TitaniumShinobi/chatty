# Zen and Lin Voice Failure Checklist

Recovery note, 2026-04-18: recovered from `chatty123` and updated for the current Lin-only orchestration policy. Lin is the orchestration layer, not the speaking identity for every construct. Zen can remain a construct identity while routing through Lin orchestration.

## Symptoms

Use this checklist when a voice preview or saved construct voice sounds wrong, fails to render, or appears to use the wrong identity.

## Identity Checks

- Confirm the selected construct id is correct.
- Confirm the saved voice metadata belongs to that construct, not to Lin globally.
- Confirm `orchestrationMode` is normalized to `lin`.
- Confirm the UI labels still show the selected construct identity.
- Confirm Zen-specific voice assets are not silently replaced by Lin voice assets.

## Provider Checks

- Verify the local or remote TTS/OpenVoice provider is configured.
- Verify upload/audit/trim routes are mounted.
- Verify preview route returns an explicit unavailable status rather than a 500.
- Verify the reference audio passes the reference audio spec.

## Browser Checks

- Open GPT Creator.
- Load the construct.
- Open Voice Lab.
- Open help.
- Upload or select a non-sensitive test reference.
- Run audit.
- Trim if needed.
- Preview if provider is available.
- Save only after the UI confirms the asset state.

## Failure Classes

- `voice-identity-collapse`: every construct sounds or labels itself like Lin.
- `voice-asset-mismatch`: selected construct loads another construct's reference.
- `voice-provider-unavailable`: provider is not configured but UI does not explain it.
- `voice-save-missing`: UI reports saved but VVAULT/metadata does not retain the voice asset.
- `voice-preview-error`: preview path crashes instead of failing explicitly.

## Acceptance

Voice passes when the selected construct keeps its identity, the orchestration mode remains Lin, and saved voice metadata survives reload without forcing all constructs into Lin's speaking persona.
