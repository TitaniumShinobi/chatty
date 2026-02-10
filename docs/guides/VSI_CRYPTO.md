# VSI Crypto (Manifests, Audit, Artifacts)

## Key Material
- Per-VSI keypair lives under `/vvault/intelligences/<callsign>/keys/vsi_ed25519.{pub,priv}` (priv chmod 600).
- Public keys optionally mirrored to `/vvault/keys/vsi/<callsign>.pub` for runner verification.

## Signing
- On approval, canonicalize manifest JSON, sign with `<callsign> priv`, attach `signature`.
- Runner verifies signature before execution; rejects missing/invalid signatures.
- Artifacts: runner signs `{result, manifestId, actor, executedAt}` with the same key; stores alongside artifact JSON.

## Audit Hash Chain
- Each audit entry includes `prev_hash` + `hash` (hash of entry body + prev_hash).
- Chain head stored at `<actor>/logs/audit.head`; runner and server append using the current head.
- Tamper-evidence: any log edit breaks the chain when recomputed.

## Rotation
- Generate new keypair under `keys/`; update `<callsign>.pub` mirror; mark `rotatedAt` in registry/tombstone; re-sign manifests after rotation.

## Testing
- Unit: sign/verify manifests; recompute hash chain and assert match.
- Integration: enqueue signed manifest, runner verifies, executes, writes signed artifact, audit chain advances.
