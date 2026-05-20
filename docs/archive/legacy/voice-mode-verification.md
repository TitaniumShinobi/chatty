# Voice mode streaming-partial verification

Use this checklist to validate the voice mode implementation without regressing batch dictate.

## 1. Batch dictate unchanged

- [ ] Open voice popover (hover/focus near send button). Click **Dictate** (mic icon).
- [ ] Speak, then press **Stop** (checkmark).
- [ ] **Expected:** Transcript appears in the **composer** (draft area). No message is sent yet.
- [ ] Press **Send** (or Enter) to send.
- [ ] **Expected:** One user message is added to the thread. No regression from previous dictate behavior.

## 2. Voice mode partials

- [ ] Open voice popover. Click **Voice** (message-circle icon).
- [ ] Speak for at least **3–5 seconds**.
- [ ] **Expected:** Label shows "Speaking…" and waveform (if enabled). After ~2.5s, **partial transcript** text appears in the bar and updates on the next interval(s).
- [ ] **Expected:** Partial text appears **while still recording**, i.e. materially faster than waiting until after stop.

## 3. Final voice-mode commit

- [ ] In voice mode, speak a short phrase (e.g. "Okay, let's try.") and press **Stop**.
- [ ] **Expected:** Exactly **one** new user message is appended to the thread (the final transcript).
- [ ] **Expected:** No duplicate user messages.
- [ ] **Expected:** Composer is **empty** (no stale partial transcript left in the draft area).

## 4. Thread integrity

- [ ] Send at least one text message, then use voice mode to send a spoken message.
- [ ] **Expected:** Previous messages are unchanged. New message is appended only. No rewrite of history.

## 5. State cleanup

- [ ] Start voice mode, speak, then stop.
- [ ] **Expected:** Recording stops, "Speaking…" / "Finalizing…" disappears, partial transcript text clears.
- [ ] **Expected:** UI returns to normal (composer visible, no recording panel). No leftover "Speaking…" or partial text.

## 6. Failure handling

- [ ] **Partial failure:** (Optional) With backend down or slow, start voice mode and speak. Partial requests may fail.
  - **Expected:** Thread is not corrupted. On stop, final request fails and user sees error toast; **no** empty or bad user turn is created.
- [ ] **Final failure:** Stop voice mode when backend returns an error (e.g. 500).
  - **Expected:** Error toast is shown. No user message is appended. State cleans up (no recording panel, no stale partial).
- [ ] **Empty final:** If final transcript is empty (e.g. silence), **expected:** No `onSubmit` call; no empty bubble. Error or no-op; state still cleans up.

## Acceptance summary

- Batch dictate still works unchanged (draft → manual send).
- Voice mode shows partial transcript while speaking.
- Stopping voice mode appends exactly one final user turn.
- No duplicate messages.
- No thread rewrite.
- No stale partial state after stop.
- Partial/final failures do not corrupt the thread; errors are surfaced cleanly.
