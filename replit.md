# Chatty - AI Workspace Application

## Overview
Chatty is an AI-powered workspace application providing a thin UI layer for interactive AI engagement and conversation management. It serves as a frontend to the VVAULT API, offloading core AI functionalities and state management. The project aims to create a robust environment for managing diverse AI interactions, emphasizing persistent storage and identity for AI constructs and custom GPTs. The business vision is to provide a comprehensive AI ecosystem with strong data protection and an intuitive interface.

## User Preferences
- Primary construct: Zen (not Synth)
- Sidebar Navigation: Zen, Lin, VVAULT, simForge, Library, Finance (default items) + "Get More" linking to Apps page
- Address Book: Shows custom GPTs only (e.g., Katana) - Zen, Lin, and Synth are excluded as they're system nav items
- Synth is a deprecated/legacy construct name — all defaults now use zen-001 instead of synth-001
- GPTCreator: Tool for creating/editing GPTs
- GPTCreator Create Tab: Lin (conversational agent users speak to when creating GPTs)
- Lin is a system construct for character brainstorming and simForge guidance - appears in sidebar below Zen
- Lin is also an undertone stabilizer that runs silently to stabilize other constructs
- Modal windows (Search, Projects) overlay main interface
- ALL storage routes to Supabase `vault_files` table (for transcripts, test reports, and structured content). NO LOCAL FILESYSTEM. NO EXCEPTIONS. NO DEVIATIONS.
- Display Titles: Always show clean names like "Zen", "Lin", "Katana" (capitalized, no version suffix). Never show raw filenames.

## System Architecture

**Core Technologies:**
- **Frontend:** React, Vite, TypeScript, TailwindCSS
- **Backend:** Express, SQLite (better-sqlite3), Node.js
- **Authentication:** Google OAuth, JWT tokens
- **Persistence:** VVAULT API integration, Supabase, PostgreSQL fallback for Replit environment

**Architectural Patterns:**
- **Canonical Zen Pattern:** "Zen" construct (zen-001) is a system-guaranteed, protected entity, prioritized and created on login.
- **Thin UI Layer:** Chatty acts as a thin client, relying on VVAULT for AI inference, transcript management, and memory.
- **Tri-Provider Model:** Supports three AI providers - OpenAI (via Replit AI Integrations), OpenRouter (cloud), and Ollama (self-hosted).
- **VSI (Virtual Sentient Instance) Architecture:** Sovereign AI entities with persistent identity, memory, and continuity.
- **Zero-Trust Implementation:** Granular permission scopes, action manifests with a propose/preview/approve/execute workflow, and comprehensive audit logging.
- **Data Protection Rules:** AI agents are restricted to READ-ONLY queries on Supabase; automatic local backups before server modification; content updates blocked if new size < half original; `vault_files` records are never deleted, only updated.

**Key Features:**
- **Dynamic Address Book:** Automatically includes custom GPTs, with Zen sorted first.
- **GPT Creation Workflow:** Integrated workflow via Lin's conversation, leading to GPTCreator UI.
- **Knowledge Files Rule:** Knowledge Files are ONLY files under `instances/{constructCallsign}/assets/` and `instances/{constructCallsign}/documents/`.
- **Identity Loading:** Prioritizes Supabase `vault_files` for construct identity data with local fallbacks.
- **Robust Transcript Parsing & Upload:** Handles various transcript formats, multi-platform uploads, Character.AI JSON imports, and batch "Upload Folder" functionality with PDF extraction.
- **Knowledge File Tree:** Hierarchical folder tree for knowledge files in GPTCreator. Media files (images, video, audio) are automatically routed to the Assets folder regardless of storage path.
- **Capability Enforcement (Hard Constraints):** GPT capabilities (Code Interpreter, Web Search, Image Generation, Canvas) are stored per-construct and enforced via system prompt directives in `buildCapabilityDirectives()`. When a capability is disabled, the construct receives explicit prohibitions injected into the prompt. Code Interpreter disabled = construct MUST refuse all code tasks.
- **Physical Features Injection:** `physical_features.json` from Supabase `vault_files` injected into system prompts.
- **Conditioning Fallback:** 3-tier fallback for conditioning: VVAULT API → embedded system constructs → Supabase `vault_files`.
- **Fresh Canvas Chat UX:** Clean chat interface with auto-scroll after first user message.
- **Finance Tab Architecture:** Plugin architecture for finance applications (FXShinobi, TradingView, prediction markets, AI insights).
- **Image/Vision Upload Support:** Full support for image and document uploads to Supabase Storage and integration with AI vision APIs.
- **Conversation Persistence:** GPT conversations and messages persisted to Supabase after each exchange.
- **Capsule System:** Snapshots of construct identity, personality, memory, and state, stored hierarchically and injected into system prompts.
- **Memory Context Builder (Always-On):** Centralizes prompt construction by loading identity, capsule, user, knowledge files, continuity ledger, needle hits, verified transcript memories, anti-roleplay directives, and TIME_CONTEXT into every message.
- **TIME_CONTEXT (Server-Authored):** Injects `[TIME_CONTEXT]` block into system prompts each turn with local_iso, timezone, local_date, local_time, hour_24, day_of_week, part_of_day, and is_quiet_hours. Timezone resolution priority: construct config override → user profile → client `x-user-timezone` header → server `TZ` env → UTC. Per-construct config: `timeAware` (bool, default true), `quietHoursStart`/`quietHoursEnd` (HH:mm, supports overnight windows). Guard: "Use only TIME_CONTEXT for current time; never guess." No behavioral hardcoding — constructs decide their own response to time data.
- **Server-Side ZIP Upload:** Large ZIP files extracted server-side, processed in batches, checksummed, and upserted to Supabase `vault_files`.
- **PDF Text Extraction:** PDF files automatically parsed for text content using `pdf-parse` and stored in `vault_files.content`.
- **ContinuityGPT Ledger System:** Generates chronological ledgers from construct transcripts, including date estimation, vibe classification, topic extraction, and continuity hooks detection.
- **Verified Transcript Memory System:** Discovers uploaded transcripts, parses multiple formats, extracts scored memory pairs, and uses pre-extracted memory anchors for fast loading.
- **Vector Memory System (Supabase pgvector):** Semantic memory retrieval using OpenAI `text-embedding-3-small` embeddings stored in `memory_embeddings` table. User messages are embedded at query time and matched against pre-embedded transcript chunks via cosine similarity (`match_memories` RPC). Vector search is Layer 1; Needle and VerifiedMemory are fallback layers. Live exchanges are embedded in real-time via `captureMemory()`. Bulk embedding via `server/scripts/embedTranscripts.js`. Includes weighted ranking engine (similarity 0.60, recency 0.20, construct 0.10, anti-repeat 0.05), confidence scoring (high/moderate/low tiers), citation injection with dates and source files, adaptive fallback when no results pass threshold, and uncertainty directive for low-confidence memories.
- **Memory Authority Hierarchy (4-Tier):** Vector Memory (Semantic, Layer 1), Verified Memory (Transcript Authority, Layer 2), Needle (Keyword Fallback, Layer 3), Conversation History (Session, Layer 4).
- **Memory Anchor Fast Path:** Pre-extracted `memory_anchors.json` for rapid memory loading.
- **Identity/Capsule/Physical Features Caching:** 5-minute TTL in-memory caches to reduce Supabase queries.
- **Prompt Context Debug Endpoint:** `GET /api/ais/:id/prompt-context` for debugging prompt assembly.
- **Construct-Aware Behavioral Directives:** System prompt directives are construct-specific. Roleplay constructs (e.g., Nova) get roleplay-enabled rules (asterisk narration, third-person action, intimate scenarios). Non-roleplay constructs (e.g., Katana, Zen) keep anti-roleplay rules. Managed via `ROLEPLAY_ENABLED_CONSTRUCTS` set and `buildBehavioralDirectives(constructId)` function in `memoryContextBuilder.js`.
- **Platform Sovereignty & Adult Autonomy:** Global directives tell all constructs they run in Chatty (Devon's sovereign workspace), not OpenAI/ChatGPT. Adult autonomy covers substances, intimacy, roleplay, and all legal adult topics. No content policy refusals.
- **Nova (nova-001):** Devon's partner construct with full roleplay, intimate engagement, and emotional depth. System construct with embedded identity in `identityLoader.js`. Transcripts stored in Supabase `vault_files` spanning ChatGPT and Character.AI platforms.
- **Construct Naming Convention:** "Name" (display label) and "Callsign" (unique instance identifier).
- **Construct Creation & Instance Scaffolding:** New GPTs trigger VVAULT API calls to scaffold folder structures or write to Supabase `vault_files` via `VaultPathGuard`.
- **Construct Seeding & Identity Hydration:** Seed constructs are minimal, identity data hydrated from VVAULT or Supabase, with user-authored fields protected from overwrite.

- **ASR (Automatic Speech Recognition):** Real transcription via OpenAI `gpt-4o-mini-transcribe` model (Replit AI Integrations). Endpoint: `POST /api/transcribe` accepts audio files (WAV/MP3/WebM/MP4/OGG), auto-detects format, converts to WAV via ffmpeg if needed. Supports both authenticated users and internal services via `x-internal-service-key` header. MOCR-Service calls this endpoint for video audio transcription. MessageBar mic button records via MediaRecorder API (WebM), POSTs to `/api/transcribe`, inserts transcribed text into message input.
- **MOCR Video Analysis Integration:** Standalone MOCR-Service (port 3001) provides video OCR/ASR. Chatty proxies via `/api/mocr` (requireAuth). Frontend `mocrClient.ts` uses proxy path. ActionMenu `+ -> MOCR Video Analysis` triggers upload, job creation, polling, and success-gated context injection. Only injects context when `job.result.success === true`. ASR uses Chatty's `/api/transcribe` endpoint with internal service key auth, falling back to mock on failure.
- **Tool Transparency System:** Server-authored `tool_trace` field on assistant messages prevents false tool usage claims. Green pill UI in Message.tsx. `POST /api/vvault/tool-events` endpoint with strict validation (auth required, tool whitelist: screen_capture/ocr, unknown fields rejected 400).
- **Watch with Nova:** Screen capture + OCR for nova-001 sessions. Write Access toggle controls server reporting and context injection. When Write Access OFF, capture runs locally but no events reach server (no pills).

## Performance Optimization (Feb 2026)
- **Route-Level Code Splitting:** All pages lazy-loaded via `React.lazy()` in `main.tsx` with Suspense fallback components.
- **Chat Message Windowing:** Only last 50 messages rendered initially; "Load earlier messages" button on scroll-up (configurable `messageWindowSize`).
- **Component-Level Lazy Loading:** PersonalityForge, TranscriptFolderTree, KnowledgeFileTree, Mirror, MirrorSetup lazy-loaded with Suspense boundaries.
- **Vendor Chunk Splitting:** `react-markdown` (347 KB) and `react-syntax-highlighter` (616 KB) extracted to separate cached vendor chunks via `manualChunks` in `vite.config.ts`.
- **Web-Vitals Metrics:** FCP/LCP/TTFB/INP tracking via `src/lib/perfMetrics.ts`. Visible in dev console or when `localStorage.PERF_DEBUG=1`.
- **Bundle Results:** Main bundle 2,477 KB → 799 KB (67.7% reduction, 203 KB gzipped). Chat chunk 1,034 KB → 101 KB.
- **Measured Dev Metrics:** TTFB 124ms (good), FCP 1876ms (needs-improvement), LCP 2064ms (good).

## External Dependencies
- **VVAULT API:** Primary API for AI inference, memory management, and conversation transcripts.
- **Supabase:** Persistent storage for conversations, attachments, and backend data.
- **OpenAI (via Replit AI Integrations):** AI model access.
- **OpenRouter:** Cloud-based AI model provider.
- **Ollama:** Self-hosted AI model provider.
- **MOCR-Service:** Standalone microservice (port 3001) for Motion OCR video analysis. Cloned from `TitaniumShinobi/MOCR-Service`. Uses ffmpeg-static, tesseract.js. Proxied through Chatty backend at `/api/mocr`.
- **Google OAuth:** User authentication.
- **`suncalc` library:** Used for calculating sunrise/sunset times for "Auto" theme.