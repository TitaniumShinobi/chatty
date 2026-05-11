# Zen Mode Test Prompts

Quick, repeatable prompts to exercise Zen's modes (general, coding, override, vision, fallback).

## General (non-codex)

- "Zen, quick check-in—how's the day going? No code."

## Coding intent

- "Scan this repo for likely circular deps and tell me which files to inspect first."

## Coding + file paths

- "Open `src/lib/modelProviders.ts` and `server/routes/vvault.js`; list concrete edits to route coding requests to the coder model."

## Coding + tests

- "Tell me which tests to add for the coder routing guard and where to place them."

## Override persistence

- "Apply my system override: 'Stay terse and technical.' Now refactor `gptService.ts` to avoid duplicate model resolution."

## Vision guard (no codex switch)

- "I'm sending an image; only describe it briefly—don't switch to coder mode."

## Fallback visibility

- "If the coder provider isn't available, say which provider/model you'll use instead and why."

---

## Verifying Zen transcripts via API

With auth cookie after restart:

- **List transcripts:** `GET /api/transcripts/zen-001/list`
- **Inspect AIS row:** `GET /api/ais/zen-001` (if Supabase has no row, runtime returns a synthesized coding-capable record)
