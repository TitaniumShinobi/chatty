# Avatar Canonicalization Audit

Date: 2026-05-10

## Target Invariant

VVAULT is the authority. A construct avatar is canonical only when VVAULT stores `instances/:construct/identity/avatar.png` and the stored content decodes to PNG bytes beginning with the PNG signature.

Compatibility inputs such as `avatar.webp`, `avatar.jpg`, `avatar.jpeg`, `avatar.gif`, or `avatar.avif` can be read as migration sources. They do not satisfy the canonical invariant by filename, path rewrite, local file presence, or legacy Supabase-only row visibility.

## Baseline Grade

Status: fail.

Failures found:

- Chatty accepted `instances/:construct/identity/avatar.webp` as a canonical success by returning the `avatar.png` path without converting or writing PNG bytes.
- VVAULT editor and create flows wrote `avatar.png` metadata while preserving the incoming image bytes, so WebP/JPEG data could be mislabeled as PNG.
- VVAULT body file inventory classified identity image files as assets before checking `/identity/`.
- VVAULT body identity did not expose `avatar.png` as body-native avatar descriptor/content for Chatty readback.
- Chatty legacy avatar backfill/smoke scripts referenced a missing `server/lib/avatarService.js`, so the repair path failed before doing useful work.

## Repair Receipts

Implemented repair:

- VVAULT now normalizes avatar payloads through `vvault/server/avatar_canonicalization.py`, validates base64 image input with Pillow, converts raster inputs to PNG, and records `contentType=image/png`, `mimeType=image/png`, source metadata, byte counts, and `pngMagicOk`.
- VVAULT editor save, construct create, and `POST /api/vault/constructs/:construct/avatar/canonicalize` now use the same canonicalization path.
- VVAULT body file inventory treats `/identity/avatar.*` as identity before generic image asset handling.
- VVAULT body identity exposes `avatar_descriptor` / `avatarDescriptor` and includes `avatar.png` content in `source_files` for Chatty service readback.
- Chatty body identity normalization accepts VVAULT `avatar.png` as the canonical descriptor and avatar row.
- Chatty avatar serving now tries VVAULT body-native avatar rows before local identity-file compatibility fallback.
- Chatty no longer treats a compatibility path like `avatar.webp` as a completed canonical PNG conversion.

## Test Ladder

Soft:

- PNG input canonicalizes to PNG bytes and remains `avatar.png`.
- VVAULT body identity exposes `avatar.png` as a present avatar descriptor.

Medium:

- JPEG input converts to PNG bytes.
- WebP input converts to PNG bytes when Pillow WebP support is present.
- `instances/:construct/identity/avatar.png` is classified under identity, not assets.

Hard:

- Existing `avatar.png` rows that contain non-PNG bytes are selected for repair by the canonicalization endpoint.
- Existing `avatar.webp` rows are migration sources only; they remain visible as compatibility/provenance but do not count as canonical success.
- Chatty serves VVAULT body-native `avatar.png` content without requiring local archive fallback.

Should Not Pass:

- Random base64 labeled as `image/webp` is rejected.
- A compatibility path alone does not rewrite to canonical `avatar.png`.
- Oversized payloads are rejected by the normalization helper.
- MIME labels are not trusted over decoded image bytes.

## Sera One-Time Repair Receipt

Command shape:

```bash
curl -X POST "$VVAULT_API_BASE/api/vault/constructs/sera-001/avatar/canonicalize" \
  -H "X-Chatty-Key: $VVAULT_SERVICE_TOKEN" \
  -H "X-Chatty-User: $CHATTY_USER_EMAIL" \
  -H "X-Chatty-User-Id: $CHATTY_USER_ID"
```

Expected receipt:

- `status`: `canonicalized` or `already_canonical`
- `source`: legacy source row/path when repair was needed
- `target`: `instances/sera-001/identity/avatar.png`
- `sha256`: hash of decoded PNG bytes
- `pngMagicOk`: `true`
- `storageOwner`: authenticated VVAULT owner id

This receipt is the acceptance proof. A local file, a Supabase-only row, or a rewritten path string is not acceptance proof.
