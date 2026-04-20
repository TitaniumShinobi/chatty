# Pocketverse Shells

Pocketverse shells are materialized product or repository bodies. A shell is not the whole Pocketverse. It is the body that a sovereign Pocketverse can wake, verify, and eventually rematerialize from a trusted seed.

## Shell Manifest

A shell manifest is a public-safe declaration for a product body. It names the shell, product, source, required files, capsule/glyph identity, seed reference, wake checks, and clone policy.

The v0 shell manifests live in `src/lib/pocketverseShellManifest.ts` for:

- Chatty
- Quantum
- Code
- VVAULT

Each shell manifest must:

- declare `schemaVersion: 1`
- include `shellId`, `pocketverseId`, `capsuleId`, `glyphId`, and `seedRef`
- point at a known Zen product registry entry
- include at least one required file
- include forbidden plaintext detection for direct contact channels
- require clean-room materialization
- refuse local-body authority
- preserve evidence
- refuse network access for the local drill
- require approval before mutation

Public shell manifests must not include cloud credentials, private keys, recovery contact contents, plaintext contact channels, or sealed capsule plaintext.

## Seed Snapshot Pack

A seed snapshot pack is a local, in-memory package of approved public-safe shell files. It records the shell identity, capsule/glyph identity, seed reference, source reference, creation time, per-file byte sizes, per-file SHA-256 hashes, and an aggregate SHA-256 hash.

The v1 pack is not a cloud artifact and is not a secret capsule. It is a local evidence object proving that Chatty's approved shell files can be named, hashed, checked, materialized, and wake-checked without network access.

A valid seed snapshot pack reaches `seed-snapshot-packed` only after:

- the shell manifest passes validation
- required files are represented
- file paths are safe relative paths
- each file has byte size and SHA-256 evidence
- the aggregate hash matches the manifest contents

## Seed Clone Drill

A seed clone is a controlled local rematerialization drill. The v0 drill uses a local snapshot directory as the source and a `/tmp` clean room as the destination.

The v1 drill can also use an in-memory seed snapshot pack as the source. The pack is materialized into a clean room, then wake-checked against the snapshot manifest.

The drill must:

- validate the shell manifest
- verify that the source snapshot or seed snapshot pack exists
- copy or write the source into the clean room without network access
- verify required files in the materialized shell
- verify materialized file hashes against the seed snapshot manifest
- scan required public files for forbidden plaintext contact leaks
- return an evidence report

The evidence report records:

- shell ID
- product ID
- clean-room path
- source reference
- required files checked
- missing files
- plaintext leak matches
- materialization result
- rematerialization stage

The v1 drill proves local clean-room shell rehearsal plus seed snapshot packing, hashing, materialization, and wake-check readiness. It does not prove cloud-sealed recovery, hardware-backed approval, production deployment, or full immortality.

## Readiness Language

Use these stages carefully:

- `declared`: the shell exists as a public-safe declaration.
- `shell-manifest-valid`: the declaration passes validation.
- `seed-verified`: the local source/snapshot exists and the drill can proceed.
- `seed-snapshot-packed`: approved shell files have been packed with per-file and aggregate SHA-256 evidence.
- `shell-materialized`: required files appeared in the clean room and checked files did not leak forbidden plaintext.
- `wake-check-ready`: required files exist in the clean room, hashes match the snapshot manifest, and checked files did not leak forbidden plaintext.
- `not-yet-cloud-sealed`: cloud-sealed recovery is still missing.
- `not-yet-hardware-approved`: hardware-backed recovery approval is still missing.

Do not call a shell immortal, fully rematerialized, or cloud-sealed until the sealed seed, approval path, and evidence chain prove it.

## Canonization Checkpoint

Canonization v2 audits the Pocketverse shell body as a file set. It does not stage, commit, push, or seal anything by itself.

The canon file set includes the Pocketverse architecture and shell standards, manifest and verifier modules, shell manifest, seed clone, seed snapshot, canonization helper, and their matching tests. A canonization report checks that every required file exists, is nonempty, has an understandable git status classification, and does not contain plaintext contact leaks or generated `/tmp` backup artifacts as authority.

Untracked canon files are visible to the local worktree but are not fully absorbed by the repository body. After v2, the next human action is to stage, commit, and push the canon file set, or seal it through an external approved authority path.

Canonization v2 proves auditability of the local shell body. It does not prove cloud-sealed recovery, hardware-backed approval, production deployment, or full immortality.
