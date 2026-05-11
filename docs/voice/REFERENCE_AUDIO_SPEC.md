# Reference Audio Spec

Recovery note, 2026-04-18: recovered from `chatty123` for the restored Voice Lab workflow. This spec defines operator expectations for reference audio assets; it does not prove that a live OpenVoice provider is currently configured.

## Purpose

Reference audio should be short, clean, and stable enough for repeatable voice cloning, preview, trimming, and audit workflows.

## Recommended Source

- Length: 10 to 30 seconds.
- Format: WAV preferred; high-quality MP3 acceptable if the upload path supports it.
- Channels: mono preferred.
- Sample rate: 16 kHz or higher.
- Speech: one speaker, no music bed, no heavy room noise.
- Content: neutral spoken phrase with enough phoneme variety.

## Quality Rules

Pass criteria:

- Voice is intelligible without volume boosting.
- No clipping or harsh distortion.
- No long silence at the beginning or end after trimming.
- No background music, crowd noise, or multiple speakers.
- File is small enough for local upload and provider limits.

Fail criteria:

- Less than 5 seconds of usable speech.
- More than one dominant speaker.
- Heavy compression artifacts.
- Long silent lead-in or tail that the trim step cannot remove.
- Privacy-sensitive content that should not be stored as a reusable reference.

## Voice Lab Flow

1. Upload or select a reference.
2. Audit quality before saving.
3. Trim silence if needed.
4. Preview if the provider is available.
5. Save only after audit/preview indicates the asset is usable.

## Storage Note

Saved voice metadata should remain attached to the construct identity. Voice references are construct assets, not orchestration configuration. Lin can orchestrate the turn while Nova, Katana, Sera, Zen, or another construct retains its own voice identity.
