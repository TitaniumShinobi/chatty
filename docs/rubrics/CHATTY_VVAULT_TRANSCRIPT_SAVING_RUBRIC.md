# Chatty ↔︎ VVAULT Real-Time Transcript Saving Rubric

## Purpose
Guarantee every Chatty message is persisted to VVAULT in a single, append-only markdown transcript per construct, with zero data loss and immediate availability for hydration, analytics, or auditing.

---

## 1. Trigger Coverage
- **1.1 Immediate Writes** – Every user/assistant/system packet triggers a write *before* the UI considers the message “sent”.
- **1.2 Browser vs Node Parity** – Browser proxy (`/api/vvault`) and Node connector paths both call the same construct-aware writer.
- **1.3 Error Surfacing** – Failures bubble up with actionable logs and do not silently skip writes.

## 2. File Layout & Naming
- **2.1 Callsign Enforcement** – Construct folders follow `<construct>-###` (e.g., `synth-001`), with helper tooling to add tags for new constructs.
- **2.2 Provider Segmentation** – Platform subfolder (default `Chatty/`) contains the canonical transcript `{{callsign}}_core_chat.md`.
- **2.3 Legacy Shielding** – No new `.txt` files under `/users/{id}/transcripts`; legacy readers still work until data fully migrates.

## 3. Markdown Structure
- **3.1 Header** – Each transcript begins with construct, platform, user, period, and session metadata.
- **3.2 Chronology Blocks** – Messages grouped under `## {weekday, Month Day, Year}`; ISO timestamp + local time badge for each entry.
- **3.3 Speaker Identity** – Names resolved to `user` vs `assistant` consistently (e.g., “Devon” vs “Synth”).
- **3.4 Append-Only** – No rewrites or truncations; new entries appended at EOF with a blank line between blocks.

## 4. Data Integrity
- **4.1 Ordering** – Writes preserve original send order, even when helpers respond out-of-band.
- **4.2 Duplication Guard** – Idempotent IDs or timestamp checks prevent duplicate rows on retries.
- **4.3 Time Context** – Stored timestamps are precise (ISO) and include timezone context for replay fidelity.

## 5. Hydration & Readback
- **5.1 Markdown Parser** – Reader reconstructs `ConversationThread` objects exclusively from consolidated files.
- **5.2 User Isolation** – Reader filters transcripts by user ID embedded in headers before returning conversations.
- **5.3 Pagination & Sorting** – Conversations sorted by latest message timestamp; partial reads do not break chronology.

## 6. Tooling & Migration
- **6.1 Callsign Script** – `scripts/add_callsigns_to_constructs.js` renames legacy construct roots safely.
- **6.2 Transcript Migrator** – `scripts/migrate_synth_transcripts.js` collapses per-message `.txt` shards into one markdown while archiving originals.
- **6.3 Verification Playbook** – QA steps include sending live messages, inspecting markdown diffs, and reloading Chatty to confirm hydration matches UI history.

## 7. Observability
- **7.1 Logging** – Each write logs construct, provider, and snippet; failures include stack traces and affected session IDs.
- **7.2 Metrics Hooks** – Optional counters/timers capture write latency and error rates for alerting.
- **7.3 Audit Trail** – Transcript headers + message blocks provide enough metadata for downstream audit jobs without extra sources.

---

### Pass Criteria Checklist
- [ ] All runtime paths (CLI, web, backend orchestrator) call the construct-aware writer.
- [ ] Construct directories exist with valid callsigns and provider subfolders.
- [ ] No new `.txt` shards created after migration date.
- [ ] Sending a message immediately appends to the correct markdown and survives page refresh.
- [ ] Hydration replays the same text/timestamps rendered in the UI.
- [ ] Scripts for migration/callsign tagging execute without manual edits.
