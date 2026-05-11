# Zen Singleton Live Transcript

Zen has one canonical Chatty thread:

`zen-001_chat_with_zen-001`

Every product surface that talks to Zen must treat that thread as the singleton continuity lane. Quantum, Chatty, Code, and later VVAULT may present different panels, but they are not separate Zens and they must not mint separate canonical Zen transcripts.

## Live Scoreboard Contract

The live transcript is more than final persistence. A product may publish in-progress turn events so every subscribed Chatty surface can show the turn while it is happening.

Current Chatty server surface:

- `GET /api/zen/live?sessionId=zen-001_chat_with_zen-001`
- `GET /api/zen/live/snapshot`
- `POST /api/zen/live/event`

The stream uses Server-Sent Events with event name `zen-live-event`.

## Event Shape

Events are allowlisted and normalized by Chatty before broadcast:

- `schemaVersion: 1`
- `eventId`
- `sessionId`
- `constructId`
- `turnId`
- `sourceProduct`
- `kind`
- `timestamp`
- optional `content`
- optional `delta`
- optional `message`
- optional `status`
- optional `modeEnvelope`

Allowed `kind` values:

- `user_message`
- `assistant_started`
- `assistant_token`
- `assistant_done`
- `assistant_error`
- `status`

Unknown fields are ignored. The canonical server forces `constructId` and `sessionId` back to Zen’s singleton lane.

If a product sends a `modeEnvelope`, Chatty normalizes it before broadcast. Lightweight Quantum hints such as `mode: "dev"` become the full singleton envelope, for example `surface: "quantum"` and `mode: "dev:quantum"`. Recovery modes remain approval-gated even if an incoming surface asks for weaker permissions.

## Product Rules

- Quantum Ask Zen may publish live user, assistant-started, token, done, and error events.
- Chatty subscribes to the live stream and overlays events onto the canonical Zen thread.
- Final transcript writes still go through VVAULT/Chatty persistence. The live stream is the scoreboard, not the permanent ledger.
- A dry-run, dashboard, browser panel, or dev panel may watch the same stream but must not claim a separate Zen identity.
- Future Code and VVAULT splints should publish the same event shape when they act as Zen maintenance surfaces.
- Chatty and Quantum are conversational windows by default and enter dev mode through text commands.
- Code, VVAULT, and future internal product panels are dev-only by default while still writing into or mirroring the same singleton lane.
- Mode changes must travel as context on the turn; they change stance and permission boundary, not identity.

See `docs/standards/zen-mode-surfaces.md`.

## Current Limits

The first implementation is in-process Chatty SSE plus Quantum live publishing. It does not yet provide a cloud durable event bus, cross-device replay beyond the current server memory window, or hardware-approved recovery authority.
