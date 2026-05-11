# VVAULT Shared Auth And Avatar Contract

This is the canonical Chatty contract for VVAULT-connected browser surfaces.

## Auth

- Chatty keeps its native `sid` session for non-VVAULT routes.
- VVAULT browser surfaces use shared auth only:
  - `/api/vvault/conversations*`
  - `/api/vvault/profile`
  - `/api/vvault/auth/token`
- Shared auth means:
  - browser holds `auth_sid`
  - Chatty resolves identity through `AUTH_API_BASE_URL/api/me`
  - Chatty bridges to VVAULT through `/api/vault/session-bridge`
- `/api/chatty/session/exchange` is not part of the normal browser flow and stays disabled by default.

## Conversation Index

- `/api/vvault/conversations/index` is a VVAULT readback surface.
- It must not present legacy Supabase reads, local deferred fallback rows, or browser cache rows as canonical conversation truth.
- If VVAULT body/conversation authority is unavailable, the route must report degraded or blocked state instead of silently making conversations disappear behind a stale fallback.
- Debug missing conversations at the backend bridge first: authenticated user resolution, VVAULT `/api/chatty/constructs` or equivalent body-native read, then route hydration. Do not start with frontend state.

## Avatars

- Address-book contacts render avatars only from `/api/ais/:constructCallsign/avatar`.
- That endpoint reads canonical VVAULT identity avatar files before any local Chatty enrichment.
- VVAULT body/native identity is the authority for construct identity, but avatar rendering is not proven unless a concrete avatar file row or descriptor is reachable.
- Read-compat remains for identity files named:
  - `avatar.png`
  - `avatar.jpg`
  - `avatar.jpeg`
  - `avatar.webp`
  - `avatar.avif`
  - `avatar.svg`
- If multiple identity avatar files exist, Chatty chooses one deterministic winner and logs a duplicate-avatar warning.
- `/api/ais` summary data is enrichment only. It must never become the authority for whether a contact exists or which avatar a thread-backed contact should render.
- Local Chatty `ais` or `gpts` rows are cache/enrichment for avatars. A stale local row owned by `system` or another local-only owner must not block `/api/ais/:constructCallsign/avatar` from checking canonical VVAULT identity avatar rows when the requested id is the same construct callsign.
- Exact private local AI ids still fail closed for unauthorized users.
- If no `avatar.*` row exists, an identity glyph named like `identity/:construct_glyph.png` is a valid avatar fallback. This preserves scaffolded constructs such as Sera until a promoted avatar row exists.
- A materialized VVAULT identity mirror at `users/shard_0000/:vvaultUserId/instances/:construct/identity/avatar.*` is a valid avatar read candidate for the authenticated VVAULT user and must be checked before glyph/placeholder fallback. This is avatar rendering compatibility only; it does not make arbitrary local files continuity authority.
- Avatar placeholder responses must not be browser-cacheable. A scaffold can begin without a resolved image and then gain `avatar.*` or `:construct_glyph.*`; caching the placeholder as a successful image strands the contact on initials after the backend is fixed.
- Frontend canonical construct avatar URLs carry a schema version token so old cached placeholder URLs cannot survive scaffold/identity resolver repairs.

## Avatar Regression Checks

When only one construct avatar loads, do not treat the repo source as broken until these checks have been made:

1. Check `/api/ais/:constructCallsign/avatar` directly with the signed-in user identity.
2. Check whether `AIManager.getAIAvatarLookup()` found a stale forbidden local row whose `id` and `constructCallsign` are the same construct callsign.
3. Check the VVAULT body-native identity response for an avatar descriptor or `source_files` entry.
4. Check canonical identity file rows for every supported avatar basename, including `avatar.webp`.
5. Check that `.webp` files under `instances/:construct/identity/` are classified as identity avatar files, not generic assets.
6. Check that `identity/:construct_glyph.*` is available as a fallback when the scaffold did not create `avatar.*`.

Observed failure pattern to preserve: Katana loaded because it had a storage-backed canonical avatar row; Nova had avatar rows but was blocked by a stale local `system` row; Sera must keep `avatar.webp` support even when a body/native identity response lacks an avatar field.
