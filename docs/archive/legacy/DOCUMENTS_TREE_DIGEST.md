# Chatty Documentation Tree — Final Digest

**Source:** Full pass over `chatty/docs/` (logical documents tree).  
**Produced:** Single-shot digest; no interim updates.

---

## 1. Architecture & System Boundaries

- **Chatty** is a React/Node AI workspace with VVAULT-backed persistent memory, multi-construct identity (Zen, Lin, user GPTs), and strict separation between Chatty DB (user/app data) and VVAULT (sovereign construct storage). See [docs/architecture/CHATTY_COMPREHENSIVE_SUMMARY.md](architecture/CHATTY_COMPREHENSIVE_SUMMARY.md), [docs/architecture/CHATTY_PRINCIPLES.md](architecture/CHATTY_PRINCIPLES.md).
- **Core constructs:** Zen (`zen-001`) = primary conversation construct; Lin (`lin-001`) = undertone capsule + GPT Creator orchestration; Synth referenced as canonical runtime construct. Identity is enforced to prevent LLM absorption; LLM=GPT equality is an architectural invariant. [docs/architecture/IDENTITY_STORAGE_RUBRIC.md](architecture/IDENTITY_STORAGE_RUBRIC.md), [docs/README_ZEN.md](README_ZEN.md), [docs/README_LIN.md](README_LIN.md).
- **VVAULT vs Chatty DB:** VVAULT holds construct memories (STM/LTM), identities, transcripts, capsules; Chatty DB holds users, auth, UI state, ephemeral conversation cache. A known gap: some STM/LTM still use Chatty SQLite/localStorage; target state is all construct memory in VVAULT. [docs/architecture/VVAULT_CHATTY_DATABASE_SEPARATION.md](architecture/VVAULT_CHATTY_DATABASE_SEPARATION.md), [docs/architecture/MEMORY_STORAGE_INVESTIGATION_ADDENDUM.md](architecture/MEMORY_STORAGE_INVESTIGATION_ADDENDUM.md).
- **Sim vs GPT vs VSI:** GPT = Chatty config/orchestration; Sim = Ollama model artifact with identity baked in; VSI = intended governance/runtime boundary. Identity baseline lives in Sim builds; routing, memory injection, and policy stay in orchestration. [docs/architecture/SIM_GPT_VSI_BOUNDARY.md](architecture/SIM_GPT_VSI_BOUNDARY.md).

---

## 2. VVAULT & Memory Model

- **VVAULT layout:** User-sharded paths `users/shard_XXXX/{user_id}/instances/{construct}-001/` with `chatty/`, `chatgpt/`, `memories/` (ChromaDB), `identity/`, etc. Default constructs: `zen-001`, `lin-001`. [docs/features/VVAULT_COMPLETE_GUIDE.md](features/VVAULT_COMPLETE_GUIDE.md), [docs/guides/RUNTIME_FILE_ARCHITECTURE_RECAP.md](guides/RUNTIME_FILE_ARCHITECTURE_RECAP.md).
- **Memory behavior:** Debounced writes, query indexing, and result caching are implemented in memory ledger; persona routing and context scoring (embedding similarity, construct relevance, emotional resonance, recency) feed prompt construction. Lin uses RAG over `chatgpt/**`, `cursor_conversations/**`, `identity/lin-001/`. [docs/memory/MEMORY_MANAGEMENT_OPTIMIZATIONS_IMPLEMENTED.md](memory/MEMORY_MANAGEMENT_OPTIMIZATIONS_IMPLEMENTED.md), [docs/memory/MEMORY_MANAGEMENT_ANALYSIS_AND_OPTIMIZATION.md](memory/MEMORY_MANAGEMENT_ANALYSIS_AND_OPTIMIZATION.md), [docs/modules/lin-001.md](modules/lin-001.md).
- **Memup:** Production-ready in Frame; Chatty has wrapper and API endpoints; full E2E memory injection and preview integration not yet verified. [docs/memory/MEMUP_STATUS_AND_USAGE.md](memory/MEMUP_STATUS_AND_USAGE.md).

---

## 3. Core Features & Workflows

- **Features:** Real-time chat, VVAULT-backed history, file intelligence (PDF/DOCX/images, OCR, RAG), GPT Creator with Lin synthesis, community GPTs, runtime import of ChatGPT/Gemini/Claude exports, projects and search. [docs/architecture/CHATTY_COMPREHENSIVE_SUMMARY.md](architecture/CHATTY_COMPREHENSIVE_SUMMARY.md), [docs/features/README.md](features/README.md).
- **VVAULT flows:** Account linking, memory sharing, sidebar integration, and import file structure are consolidated in [docs/features/VVAULT_COMPLETE_GUIDE.md](features/VVAULT_COMPLETE_GUIDE.md). RAG and verification are in [docs/features/RAG_SYSTEM.md](features/RAG_SYSTEM.md).
- **Agent integration:** External agents (e.g. Copilot, VS Code) can send messages into a construct thread via backend API; see [docs/features/AGENT_DIRECT_SEND.md](features/AGENT_DIRECT_SEND.md).

---

## 4. Chat UI & Components

- **Core components:** `Chat.tsx` (main chat page, inline messages), `ChatArea.tsx` (file handling, actions, uses `Message.tsx`), `Message.tsx` (per-message rendering). Data flow: Layout → Chat/ChatArea with threads, sendMessage, renameThread, newThread. [docs/guides/CHAT_COMPONENTS_GUIDE.md](guides/CHAT_COMPONENTS_GUIDE.md).

---

## 5. Voice & Nova (Voice Lab, Reference Audio, Calling)

- **Voice Lab:** Upload (WAV/MP3/M4A/OGG/WebM, max 100 MB) or URL (HTTPS, max 50 MB). Quality check: 20–30 s, mono, loudness in range; long files use “Pick 25 s slice.” Save binds reference audio for the construct; Play sample for preview. [docs/voice-lab-help.md](voice-lab-help.md).
- **Voice identity:** Forge voice instructions in `instances/{callsign}/identity/voice.md`; Voice Lab reference audio in `identity/voice.wav`; `voice.json` optional metadata (e.g. `ref: "voice.wav"`). [docs/architecture/VOICE_IDENTITY_STORAGE.md](architecture/VOICE_IDENTITY_STORAGE.md), [docs/voice-lab-help.md](voice-lab-help.md).
- **Voice docs:** [docs/voice/](voice/) (e.g. OPENVOICE_VOICES, ZEN_LIN_VOICE_FAILURE_CHECKLIST), [docs/voice-v1-ship-checklist.md](voice-v1-ship-checklist.md), [docs/voice-mode-verification.md](voice-mode-verification.md).

---

## 6. Implementation Highlights (Lin/Zen, Orchestration, Import/Export, Runtimes)

- **Lin orchestration:** Dual layer — UnifiedLinOrchestrator (server-side, ChromaDB memories, system prompt assembly) and PersonalityOrchestrator (blueprint + transcript + context). Preview mode uses `buildKatanaPrompt()` (blueprint + VVAULT memory); UnifiedLinOrchestrator is not used in browser preview. [docs/implementation/LIN_ORCHESTRATION_DEEP_DIVE.md](implementation/LIN_ORCHESTRATION_DEEP_DIVE.md), [docs/implementation/LIN_ORCHESTRATION_IMPLEMENTATION_GUIDE.md](implementation/LIN_ORCHESTRATION_IMPLEMENTATION_GUIDE.md).
- **Zen:** Identity from `server/lib/identityLoader.js`, prompt/conditioning from `memoryContextBuilder.js`, message path `/api/vvault/message`. House rules and operating invariants: [docs/architecture/HOUSE_RULES_ZEN_LIN.md](architecture/HOUSE_RULES_ZEN_LIN.md) (referenced in README_ZEN, README_LIN).
- **Import/runtime:** HTML/conversation import, runtime import processing with Lin synthesis, GPT Creator pipeline, and file scaffolding (instances/{callsign}/identity/, chatty/) are documented under implementation and guides. [docs/plans/GPT_CREATION_THROUGH_LIN.md](plans/GPT_CREATION_THROUGH_LIN.md), [docs/architecture/GPT_CREATION_FILE_CREATION_PIPELINE.md](architecture/GPT_CREATION_FILE_CREATION_PIPELINE.md).

---

## 7. Security & Legal

- **Storage & session:** Backend as source of truth; small client cache (e.g. N=10 conversations); size/quota checks before large writes; HttpOnly/Secure cookies; auth and server-side user scoping (`req.user.sub`) on data endpoints; telemetry for quota failures; recovery tooling and PR checklist. [docs/security/STORAGE_AND_SESSION_SAFEGUARDS.md](security/STORAGE_AND_SESSION_SAFEGUARDS.md).
- **Data loss prevention:** [docs/security/DATA_LOSS_PREVENTION_PLAN.md](security/DATA_LOSS_PREVENTION_PLAN.md). Security index: [docs/security/README.md](security/README.md).
- **Legal:** EECC disclosure (no PSTN/SMS, no emergency access; scope, QoS, charges, termination, dispute resolution). [docs/legal/CHATTY_EUROPEAN_ELECTRONIC_COMMUNICATIONS_CODE_DISCLOSURE.md](legal/CHATTY_EUROPEAN_ELECTRONIC_COMMUNICATIONS_CODE_DISCLOSURE.md). Terms and privacy: [docs/legal/CHATTY_TERMS_OF_SERVICE.md](legal/CHATTY_TERMS_OF_SERVICE.md), [docs/legal/CHATTY_PRIVACY_NOTICE.md](legal/CHATTY_PRIVACY_NOTICE.md).

---

## 8. Debugging & Infrastructure

- **Debugging:** Sidebar click diagnosis, modal bypass strategy, conversation locations ledger, persistence path investigation (UI messages → Supabase), scroll-to-bottom fix, debug backups. [docs/debugging/README.md](debugging/README.md), [docs/debugging/PERSISTENCE_PATH_INVESTIGATION.md](debugging/PERSISTENCE_PATH_INVESTIGATION.md).
- **Infrastructure:** Cloudflare tunnel setup, public URL, Katana integration, API endpoint config. [docs/infrastructure/README.md](infrastructure/README.md), [docs/infrastructure/TUNNEL_INFO.md](infrastructure/TUNNEL_INFO.md).

---

## 9. Rubrics, Prompts, and Plans

- **Rubrics:** Design and process standards — construct formatting, login process, VVAULT transcript saving, user registry, address book, Z-axis layering, transcript structure/protection, hydration gating, knowledge files. [docs/rubrics/README.md](rubrics/README.md).
- **Prompts:** Implementation and investigation prompts (e.g. connect chat to Synth, HTML reconstruction, DID mitigation, storage investigation, runtime routing). [docs/prompts/README.md](prompts/README.md).
- **Plans:** GPT creation through Lin (GUI flow from Lin conversation → GPTCreator form → backend create → scaffolding → bootstrap), GPT deletion/Supabase cleanup, multi-user isolation. [docs/plans/GPT_CREATION_THROUGH_LIN.md](plans/GPT_CREATION_THROUGH_LIN.md), [docs/plans/GPT_DELETION_SUPABASE_CLEANUP.md](plans/GPT_DELETION_SUPABASE_CLEANUP.md).
- **Modules/personality:** Lin module (RAG, scoring, undertone capsule) in [docs/modules/lin-001.md](modules/lin-001.md). Katana personality audit (traits, sources, conflicts) in [docs/personality/KATANA_PERSONALITY_AUDIT.md](personality/KATANA_PERSONALITY_AUDIT.md).

---

## Keystone References (Quick Links)

| Area | Doc |
|------|-----|
| System overview | [docs/architecture/CHATTY_COMPREHENSIVE_SUMMARY.md](architecture/CHATTY_COMPREHENSIVE_SUMMARY.md) |
| Principles & boundaries | [docs/architecture/CHATTY_PRINCIPLES.md](architecture/CHATTY_PRINCIPLES.md) |
| VVAULT ↔ Chatty | [docs/features/VVAULT_COMPLETE_GUIDE.md](features/VVAULT_COMPLETE_GUIDE.md), [docs/architecture/VVAULT_CHATTY_DATABASE_SEPARATION.md](architecture/VVAULT_CHATTY_DATABASE_SEPARATION.md) |
| Memory optimizations | [docs/memory/MEMORY_MANAGEMENT_OPTIMIZATIONS_IMPLEMENTED.md](memory/MEMORY_MANAGEMENT_OPTIMIZATIONS_IMPLEMENTED.md) |
| Chat UI | [docs/guides/CHAT_COMPONENTS_GUIDE.md](guides/CHAT_COMPONENTS_GUIDE.md) |
| Voice Lab & identity | [docs/voice-lab-help.md](voice-lab-help.md), [docs/architecture/VOICE_IDENTITY_STORAGE.md](architecture/VOICE_IDENTITY_STORAGE.md) |
| Identity contract | [docs/architecture/IDENTITY_STORAGE_RUBRIC.md](architecture/IDENTITY_STORAGE_RUBRIC.md) |
| Security | [docs/security/STORAGE_AND_SESSION_SAFEGUARDS.md](security/STORAGE_AND_SESSION_SAFEGUARDS.md) |
| Legal (EECC) | [docs/legal/CHATTY_EUROPEAN_ELECTRONIC_COMMUNICATIONS_CODE_DISCLOSURE.md](legal/CHATTY_EUROPEAN_ELECTRONIC_COMMUNICATIONS_CODE_DISCLOSURE.md) |

---

*End of digest. Unreadable files were skipped; coverage is per the existing `docs/` structure.*
