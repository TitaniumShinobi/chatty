# Voice v1 — Final validation / ship checklist

Use this for the manual validation pass. Fix only failures; do not redesign.

---

## 1. Dictate

- [ ] Mic icon in popup starts dictate.
- [ ] Speak → Stop.
- [ ] Transcript lands in **composer** (draft) only.
- [ ] **Manual send only** — no message sent until user presses Send.

## 2. Voice mode

- [ ] Message-circle icon in popup starts voice mode.
- [ ] Speak for a few seconds.
- [ ] **Partial transcript** appears **while speaking**.
- [ ] Stop → exactly **one** user message is appended to the thread.

## 3. Reply playback

- [ ] After voice-mode turn, assistant reply arrives.
- [ ] That reply **auto-plays once** (TTS).
- [ ] No duplicate playback.
- [ ] No old assistant message gets spoken (only the new reply).

## 4. Voice selection

- [ ] **Zen thread** uses `General > Zen voice`.
- [ ] **Lin thread** uses `General > Lin voice`.
- [ ] **Non–Zen/Lin thread** uses generic voice (main TTS setting).

## 5. No regressions

- [ ] Normal **text chat** still works.
- [ ] No thread rewrite.
- [ ] No composer pollution from voice mode (no stray draft).
- [ ] Popup has **exactly two icons** (mic + message-circle; no third).

---

**If all pass:** v1 complete.

**If any fail:** Fix only that behavior, re-test, then re-run this checklist.
