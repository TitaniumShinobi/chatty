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
- **Knowledge File Tree:** Hierarchical folder tree for knowledge files in GPTCreator.
- **Physical Features Injection:** `physical_features.json` from Supabase `vault_files` injected into system prompts.
- **Conditioning Fallback:** 3-tier fallback for conditioning: VVAULT API → embedded system constructs → Supabase `vault_files`.
- **Fresh Canvas Chat UX:** Clean chat interface with auto-scroll after first user message.
- **Finance Tab Architecture:** Plugin architecture for finance applications (FXShinobi, TradingView, prediction markets, AI insights).
- **Image/Vision Upload Support:** Full support for image and document uploads to Supabase Storage and integration with AI vision APIs.
- **Conversation Persistence:** GPT conversations and messages persisted to Supabase after each exchange.
- **Capsule System:** Snapshots of construct identity, personality, memory, and state, stored hierarchically and injected into system prompts.
- **Memory Context Builder (Always-On):** Centralizes prompt construction by loading identity, capsule, user, knowledge files, continuity ledger, needle hits, verified transcript memories, and anti-roleplay directives into every message.
- **Server-Side ZIP Upload:** Large ZIP files extracted server-side, processed in batches, checksummed, and upserted to Supabase `vault_files`.
- **PDF Text Extraction:** PDF files automatically parsed for text content using `pdf-parse` and stored in `vault_files.content`.
- **ContinuityGPT Ledger System:** Generates chronological ledgers from construct transcripts, including date estimation, vibe classification, topic extraction, and continuity hooks detection.
- **Verified Transcript Memory System:** Discovers uploaded transcripts, parses multiple formats, extracts scored memory pairs, and uses pre-extracted memory anchors for fast loading.
- **Vector Memory System (Supabase pgvector):** Semantic memory retrieval using OpenAI `text-embedding-3-small` embeddings stored in `memory_embeddings` table. User messages are embedded at query time and matched against pre-embedded transcript chunks via cosine similarity (`match_memories` RPC). Vector search is Layer 1; Needle and VerifiedMemory are fallback layers. Live exchanges are embedded in real-time via `captureMemory()`. Bulk embedding via `server/scripts/embedTranscripts.js`.
- **Memory Authority Hierarchy (4-Tier):** Vector Memory (Semantic, Layer 1), Verified Memory (Transcript Authority, Layer 2), Needle (Keyword Fallback, Layer 3), Conversation History (Session, Layer 4).
- **Memory Anchor Fast Path:** Pre-extracted `memory_anchors.json` for rapid memory loading.
- **Identity/Capsule/Physical Features Caching:** 5-minute TTL in-memory caches to reduce Supabase queries.
- **Prompt Context Debug Endpoint:** `GET /api/ais/:id/prompt-context` for debugging prompt assembly.
- **Anti-Roleplay Enforcement:** System prompt directives prevent asterisk narration, third-person self-reference, and memory fabrication.
- **Construct Naming Convention:** "Name" (display label) and "Callsign" (unique instance identifier).
- **Construct Creation & Instance Scaffolding:** New GPTs trigger VVAULT API calls to scaffold folder structures or write to Supabase `vault_files` via `VaultPathGuard`.
- **Construct Seeding & Identity Hydration:** Seed constructs are minimal, identity data hydrated from VVAULT or Supabase, with user-authored fields protected from overwrite.

## External Dependencies
- **VVAULT API:** Primary API for AI inference, memory management, and conversation transcripts.
- **Supabase:** Persistent storage for conversations, attachments, and backend data.
- **OpenAI (via Replit AI Integrations):** AI model access.
- **OpenRouter:** Cloud-based AI model provider.
- **Ollama:** Self-hosted AI model provider.
- **Google OAuth:** User authentication.
- **`suncalc` library:** Used for calculating sunrise/sunset times for "Auto" theme.