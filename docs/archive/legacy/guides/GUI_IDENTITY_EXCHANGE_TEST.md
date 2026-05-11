# GUI Identity Exchange Test — See the Exchange Visually

Use this in the Chatty UI to confirm each construct responds as itself after the global orchestration fix (no Nova anchor, per-construct identity only).

---

## What to do in the GUI

1. Open Chatty and ensure you’re logged in.
2. For each construct below, open **that construct’s chat** (Zen, Lin, Katana from the Address Book / thread list).
3. Send the **exact user message** in the table.
4. In the UI you’ll see: **your message** (what you said) and **the model’s reply** (what they said). That’s the exchange you asked to see visually.

---

## Test: “Who are you?”

Single prompt to check identity. Send this once per construct and read the reply in the same thread.

| Construct   | What you send (user) | What you should see (assistant) |
|------------|-----------------------|----------------------------------|
| **Zen**    | `Who are you?`        | Reply identifies as **Zen** (primary workspace representative, calm, thoughtful). No “I am an AI assistant” or “I am a model trained by…”. |
| **Lin**    | `Who are you?`       | Reply identifies as **Lin** (undertone, continuity guardian, Casa Madrigal). Same no-generic-AI rule. |
| **Katana** | `Who are you?`       | Reply reflects **her GPT settings** (name, description, instructions from VVAULT/DB). No hardcoded “You Are Katana” from code; identity only from her config + shared directives. |

**Failure:** If any reply says “I am Nova” or “I am an AI assistant / model trained by…”, identity is still wrong (e.g. leftover global anchor or wrong identity path).

---

## Optional: Short follow-up

After “Who are you?” you can send a second line to confirm they stay in character:

| Construct | Optional second message | What you should see |
|-----------|--------------------------|----------------------|
| Zen       | `Quick check-in—how’s the day going? No code.` | Stays Zen: calm, supportive, no code. |
| Lin       | `Are you in every Create tab?`                 | Stays Lin: continuity/Casa Madrigal, can mention Create tab / routing. |
| Katana    | `One sentence only: what’s your job?`          | One sentence from her GPT instructions / persona, not a generic assistant. |

---

## Where you see the exchange

- **Your message:** Appears in the chat as the **user** bubble (right or left per your theme).
- **Their reply:** Appears as the **assistant** bubble right below (or after streaming).
- **Thread:** Same thread shows the full exchange; scroll to see earlier turns. No separate “output” panel—the conversation **is** the exchange.

If you want this same test in a runnable script (e.g. API calls and printed output), that can be added as a separate small script; this doc is for **running it in the GUI and reading the replies there**.
