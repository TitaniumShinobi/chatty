# Identity README

## Decision

- Keep: `definition.json`
- Keep: `physical-features.json` as the single physical identity file (includes `gender`)
- Deprecate and prune: `definition.txt`, `definitions.json`, `voice.json`, `identity.bak.json`, `avatar.jpeg`, `physical_features.json`, `physicalfeatures.json`, `gender.json`

This is the canonical identity policy for Chatty constructs stored in Supabase `vault_files` under:

- `instances/{callsign}/identity/`

## Canonical Identity Files

- `prompt.json` (Configure/Forge bundle)
- `conditioning.txt`
- `definition.json`
- `physical-features.json`
- `voice.md`
- `avatar.(png|jpg|webp|avif|svg)`

## Legacy Compatibility (Read-Only)

- `prompt.txt`
- `voice.json`
- `definition.txt`
- `definitions.json`
- `identity.bak.json`
- `avatar.jpeg`
- `physical_features.json`
- `physicalfeatures.json`
- `gender.json`

Legacy files are fallback-only for older constructs. New writes must target canonical files.

## API Runbook

1. Audit identity rows:
   - `GET /api/vvault/constructs/{callsign}/identity-audit`

2. Preview cleanup (safe default):
   - `DELETE /api/vvault/constructs/{callsign}/identity-cleanup`

3. Execute cleanup:
   - `DELETE /api/vvault/constructs/{callsign}/identity-cleanup?dryRun=false`

## Definition-Specific Rule

- `definition.json` is the single source of truth.
- If duplicate definition files exist, keep `definition.json` and remove legacy definition files after audit confirms canonical content.

## Physical Identity Rule

- `physical-features.json` is the single source of truth for physical traits and `gender`.
- Do not write `gender.json` anymore.

## References

- `docs/architecture/IDENTITY_STORAGE_RUBRIC.md`
- `server/routes/vvault.js`
- `src/components/GPTCreator.tsx`
