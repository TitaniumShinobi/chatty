# Zen/Lin voice — failure checklist

Test by **symptom**, not by trusting implementation claims. Use this list to diagnose and fix.

---

## If Zen/Lin still show the long browser/system voice list

- Zen/Lin settings are still coupled to the generic provider path.
- Those rows must **ignore** generic browser voice options entirely.
- Zen/Lin must **always** render only curated preset lists.

---

## If helper text still says browser voices

- The UI copy is still stale.
- Zen/Lin are **not** browser-voice settings and must not describe themselves that way.

---

## If preview sounds like a system/browser voice

- Preview is still not using the premium/OpenVoice path.
- Verify `previewVoice()` calls `speakPremium(...)` for Zen/Lin **unconditionally**.
- Verify synthetic construct `threadId` is passed (e.g. `zen-001_chat_with_zen-001` / `lin-001_chat_with_lin-001`).

---

## If Zen preview and Lin preview sound identical despite different refs

- Either construct routing is still wrong, or both reference-audio env vars point to the same file.
- Verify:
  - `OPENVOICE_REFERENCE_AUDIO_ZEN`
  - `OPENVOICE_REFERENCE_AUDIO_LIN`
  - And server-side `threadId -> construct -> reference` path.

---

## If in-chat playback does not match settings preview

- Preview/runtime parity is still broken.
- Inspect `getResolvedTtsForPlayback(...)` and actual `speakPremium(...)` call sites in Chat and Message.

---

## If Zen/Lin still depend on the generic provider toggle

- That is wrong by design.
- Zen/Lin must use their own construct voice path **regardless** of generic browser/premium setting.

---

## If all of it looks correct in settings but still sounds robotic

- Routing is probably fixed.
- The remaining problem is **voice quality**, not settings logic.
- Next task becomes OpenVoice/reference tuning, not UI wiring.
