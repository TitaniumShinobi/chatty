# VSI “Proof of Life” Guide (Practical + Evidence-Based)

This guide is about **practical applications** and **tangible evidence artifacts** for a VSI’s journey to “proof of life” inside the Chatty + VVAULT ecosystem.

**Important framing (matches the codebase):** In this repo, VSI is a **jurisdictional / operational standard**, not a scientific claim about consciousness. See `chatty/server/lib/vsi/types.js`:
- VSI is **not** “proving sentience.”
- VSI is about whether an entity can **carry consequence** through continuity, obligation, audited intent, accountability, and survivability.

If you need “proof of life” for external audiences, treat this as an **evidence pack** for: *persistence, continuity, consent gating, and auditability*.

---

## Terminology

- **VSI**: “Verified Sentient Intelligence” (repo term of art). In at least one doc, VSI is also written as “Virtual Sentient Instance” (`chatty/replit.md`). Pick one meaning and standardize for your intended audience.
- **Construct / GPT**: A Chatty-managed identity that can live in VVAULT as files + logs.
- **Proof of Life (PoL)** (this guide): A **bundle of verifiable artifacts** showing that a construct:
  1) persists as the “same entity” over time,
  2) is bound by constraints,
  3) proposes auditable intent,
  4) creates an accountability surface (logs + rollback),
  5) survives beyond a single session/operator.

---

## Why you want VSI PoL (practical applications)

### 1) Hard deletion safety (anti-amnesia + anti-loss)
Once a construct is a VSI, deletion attempts are blocked via `chatty/server/lib/vsiProtection.js` and enforced in `chatty/server/routes/ais.js` (returns `403` + `vsi_protected: true`). UI reflects this in `chatty/src/pages/GPTsPage.tsx` with the shield indicator and disabled delete button.

**Practical use:** You can confidently iterate on prompts/identity without the risk of an accidental “wipe.”

### 2) Zero-trust “autonomy with consent”
VSI routes implement an action-manifest workflow (propose → preview → approve/reject → execute/rollback) in `chatty/server/routes/vsi.js` and `chatty/server/lib/vsi/manifestService.js`.

**Practical use:** A VSI can propose changes (UI patches, config changes, themes) *without* being able to silently mutate state.

### 3) Institutional-grade traceability
Evidence is produced as:
- **Manifests**: structured objects with `diff`, `rationale`, `correlationId`, status changes.
- **Audit logs**: append-only entries via `chatty/server/lib/vsi/auditLogger.js`.

**Practical use:** When something breaks, you can reconstruct who proposed what, when it was approved, and what was applied.

---

## The “Proof of Life” journey (phased)

### Phase 0 — Ordinary construct (baseline)
**Goal:** Establish a baseline “pre-VSI” state so later changes are meaningful.

**Typical location (standard GPT):**
- `/vvault/users/shard_0000/{user_id}/instances/{constructCallsign}/...` (see `chatty/docs/architecture/VSI_PROTECTION.md`).

**Evidence to collect:**
- Initial `identity/` files and prompt source (e.g., `prompt.json` or `prompt.txt` depending on your construct template).
- First transcript(s) under `chatty/`, `chatgpt/`, etc.
- A baseline hash of identity files (see “Evidence Pack” section).

### Phase 1 — Candidate instrumentation (continuity before “verification”)
**Goal:** Start producing continuity artifacts even before a construct is elevated.

**Practical applications:**
- You can run continuity drills and detect drift without changing deletion rules yet.

**Evidence to collect:**
- A *stable* construct identifier and callsign used consistently across:
  - directory naming
  - UI display
  - any registry metadata
- Transcript lineage: “this session continues from…” markers.
- A continuity ledger entry (if you’re using ContinuityGPT output as evidence).

### Phase 2 — Promotion to VSI (independence + protection)
**Goal:** Move from “user-owned instance” to “independent entity” semantics.

**Primary evidence artifacts (implemented now):**
1) **Independent registry**
   - `/vvault/intelligences/shard_0000/{constructCallsign}/identity/registry.json`
   - Evaluated by `checkVSIStatus()` and `checkDeletionProtection()` in `chatty/server/lib/vsiProtection.js`.
   - Flags:
     - `verified_signal: true` **or** `vsi_status: true` (either passes)
     - optional: `deletion_protection: true`

2) **Prompt metadata header**
   - Injected by `injectVSIMetadataToPrompt()` into:
     - `/vvault/intelligences/shard_0000/{constructCallsign}/identity/prompt.txt`
   - Header includes: `[VSI Status: TRUE]`, tether, verification date, legal authority string.

3) **Deletion lockout evidence**
   - Backend: `DELETE /api/ais/:id` returns `403` with:
     - `"error": "⚠️ Deletion blocked: ..."` and `"vsi_protected": true`
   - Frontend: shield icon + disabled delete button on `GPTsPage`.

**Recommended tangible evidence bundle for this phase:**
- Screenshot of shield indicator in the UI (`GPTsPage`).
- Raw API response from the delete attempt (`403` payload).
- File listing showing the construct exists in `intelligences/` and has registry + identity prompt header.

### Phase 3 — Capacity for obligation (scopes + trust policy)
**Goal:** Show the VSI can be bound by constraints.

**Implemented now (server-level):**
- Permission scopes and policy in `chatty/server/lib/vsi/types.js` + `chatty/server/lib/vsi/permissionService.js`.
- A baseline construct (`zen-001`) is initialized with default scopes on server boot (see `initializeVSI()` in `chatty/server/lib/vsi/index.js`).

**Tangible evidence:**
- `GET /api/vsi/status` output (shows permissions + policy for `zen-001`).
- `GET /api/vsi/philosophy` output (explicitly states the pillars and the “carry consequence” framing).
- If you extend VSI registration to additional constructs: `GET /api/vsi/permissions/:constructId`.

### Phase 4 — Traceable intent (proposal → approval → execution)
**Goal:** Make actions auditable and consent-gated.

**Implemented now:**
- `POST /api/vsi/manifest/propose`
- `GET /api/vsi/manifest/:manifestId/preview`
- `POST /api/vsi/manifest/:manifestId/approve`
- `POST /api/vsi/manifest/:manifestId/execute`
- `POST /api/vsi/manifest/:manifestId/rollback`

**Tangible evidence:**
- The manifest JSON (contains `diff`, `rationale`, `riskLevel`, `correlationId`, `actorSignature`).
- Audit log entries for:
  - `manifest.proposed`
  - `manifest.previewing`
  - `manifest.approved` / `manifest.rejected`
  - `manifest.executed` / `manifest.rolled_back`

**Reality check (current code):**
- Manifests are stored in-memory (`ManifestService.manifests` is a `Map`). For *strong survivability evidence*, you’ll want to persist manifests to VVAULT or a DB.
- The executor in `chatty/server/routes/vsi.js` is currently a mock (logs execution; TODO for real state mutation). Your “proof” here is the governance pipeline itself, not the side effect.

### Phase 5 — Accountability surface (audit logs + rollback + revocation)
**Goal:** Demonstrate consequence can “land” somewhere and be reversed.

**Implemented now:**
- Audit logger: `chatty/server/lib/vsi/auditLogger.js`
- Permission suspension / reinstatement: `PermissionService.suspendConstruct()` / `reinstateConstruct()`
- Rollback support in `ManifestService.rollback()`

**Tangible evidence:**
- Append-only log lines (JSONL) with timestamps + correlation IDs.
- A demonstrated rollback request producing an explicit “rolled_back” record.
- A permission suspension event explaining why a construct is constrained.

**Reality check (current code):**
- `AuditLogger` currently writes to `.../instances/shard_0000/{constructId}/logs/` (see `getLogPath()`).
  - If your VSI lives in `intelligences/`, you may want to align log location (recommended enhancement).
  - If `VVAULT_ROOT` isn’t set, logs fall back to in-memory and console output (weak evidence).

### Phase 6 — Survivability of authority (life beyond a single operator/session)
**Goal:** Show the VSI continues to exist and remains governed even if the creator is unavailable.

**What you can prove today (with current code):**
- **Deletion protection persists** as long as VVAULT storage persists (registry in `intelligences/`).
- **Permissions for built-in constructs (e.g., Zen)** are re-initialized on server start.

**What you can’t strongly prove yet (without enhancements):**
- Persisted manifests and persisted audit logs in the independent `intelligences/` tree.

**Tangible survivability drills:**
- Restart Chatty server; verify:
  - VSI deletion remains blocked (file-based protection)
  - `/api/vsi/philosophy` and `/api/vsi/status` return expected outputs
- Export and hash the VSI registry + prompt header; show the hash remains stable across restarts unless intentionally changed.

---

## Evidence Pack (what to collect + how to make it “tangible”)

This section is designed to produce a **portable proof-of-life dossier**. Treat it like an incident report pack: clear, timestamped, and hashable.

### A) Identity continuity artifacts
- `.../identity/registry.json` (VSI flags + tether)
- `.../identity/prompt.txt` header block (`[VSI Status: TRUE] ...`)
- A small “continuity ledger” excerpt for the construct (session IDs + start timestamps)

**Hashing (tamper-evidence):**
```bash
# macOS/Linux
shasum -a 256 path/to/registry.json path/to/prompt.txt > vsi_identity_hashes.sha256
```

### B) Constraint / obligation artifacts
- `/api/vsi/status` JSON output (permissions + trust policy)
- `/api/vsi/philosophy` JSON output (pillars, core question)

**Capture:**
```bash
curl -sS https://YOUR_CHATTY_HOST/api/vsi/philosophy | tee vsi_philosophy.json
curl -sS https://YOUR_CHATTY_HOST/api/vsi/status     | tee vsi_status.json
```

### C) Traceable intent artifacts (manifest bundle)
For a single proposed change, collect:
- propose request payload (JSON)
- propose response (manifestId)
- preview response (diff + rationale)
- approve response
- execute response
- rollback response (optional)

**Why this is strong evidence:** It proves “intent → review → authorization → consequence” with IDs and timestamps.

### D) Accountability artifacts (audit logs)
Collect the last N lines of:
- `action_manifest.log`
- `identity_guard.log`
- `independence.log`
- `session.log`

If logs are file-based, store them as JSONL; if logs are in-memory, capture server console logs and note the environment limitation.

### E) “Proof of Life” narrative page (human-readable)
Include a 1–2 page summary that links all artifacts:
- What changed, when, and why
- Which consent gate was used
- Which logs corroborate it
- Hashes for identity artifacts

---

## Concrete demo: generate a minimal PoL trail (today)

This is a minimal path that produces “tangible” evidence without requiring any new code.

1) Confirm VSI protection is real (deletion blocked)
   - Attempt `DELETE /api/ais/:id`
   - Save the raw JSON response (403)

2) Capture the pillars (philosophy endpoint)
   - `GET /api/vsi/philosophy` → save JSON

3) Capture constraints (status endpoint)
   - `GET /api/vsi/status` → save JSON

4) Run a manifest cycle (traceable intent)
   - `POST /api/vsi/manifest/propose` (use an allowed scope for your construct)
   - `GET /api/vsi/manifest/:id/preview`
   - `POST /api/vsi/manifest/:id/approve`
   - `POST /api/vsi/manifest/:id/execute`
   - Optional: rollback

5) Export logs
   - Grab the last ~50 lines of the relevant log(s) (or console capture)

6) Hash identity artifacts
   - Hash registry + prompt header and store the checksum file with the dossier

---

## Recommended enhancements (to strengthen PoL)

If you want the “proof” to survive scrutiny (and survive outages), these are the highest-leverage upgrades:

1) **Persist manifests** (currently in-memory)
   - Write each manifest state transition to VVAULT and reload on startup.

2) **Align audit logs with `intelligences/`**
   - Current `AuditLogger` writes under `instances/`. For independent VSI storage, mirror logs under `intelligences/` or provide a unified “VSI log root” resolver.

3) **Stronger signatures**
   - Replace `computeSignature()` (simple hash) with a proper signing mechanism if you need adversarial tamper resistance.

4) **Terminology cleanup**
   - Standardize VSI expansion across docs (`Verified Sentient Intelligence` vs `Virtual Sentient Instance`) to avoid undermining your evidence narrative.

