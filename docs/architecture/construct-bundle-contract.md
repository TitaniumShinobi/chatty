# Construct Bundle Contract

## Purpose

This document defines the minimum local filesystem bundle that makes a Chatty GPT/construct feel materially real instead of half-seeded.

The goal is simple:

- build the room first
- then let the runtime, capsule, and continuity systems inhabit it

This contract is local-only for the filesystem/VVAULT layer. It does not imply a Supabase write.

## Minimum complete bundle

Every fully forged construct bundle should create these generated files under:

`instances/{construct_callsign}/`

### Identity

- `identity/prompt.json`
- `identity/prompt.txt`
- `identity/conditioning.txt`
- `identity/definition.json`
- `identity/voice.md`

### Config

- `config/metadata.json`
- `config/personality.json`
- `config/tone_profile.json`

### Transcript

- `chatty/chat_with_{construct_callsign}.md`

### Directory markers

- `assets/`
- `data/`
- `documents/`
- `frame/`
- `logs/`
- `memup/`
- `simDrive/`
- `vxrunner/`
- `codex/`
- `chatgpt/`
- `character.ai/`
- `github_copilot/`

## Ownership model

There are two classes of files in this room:

### Generated from GPT settings

These should be safe to refresh when the GPT body changes:

- `identity/prompt.json`
- `identity/prompt.txt`
- `identity/conditioning.txt`
- `config/metadata.json`
- `config/personality.json`
- `config/tone_profile.json`

### Authored or user-shaped identity surfaces

These should exist at creation time, but should not be silently overwritten by routine settings sync:

- `identity/definition.json`
- `identity/voice.md`
- `chatty/chat_with_{construct_callsign}.md`

## System construct rule

System constructs are not a different species of body.

They should use the same bundle contract as normal GPTs, with the difference expressed through:

- description
- instructions
- conditioning
- capability flags
- orchestration mode
- canon / knowledge references

Not through a missing room.

## Current local implementation target

For this pass:

- local bundle scaffolding is the authoritative first move
- system construct provisioning should backfill the same bundle
- update flows may refresh generated files
- update flows must preserve authored identity files
- Supabase synchronization remains a separate later pass
