# Chatty - AI Workspace Application

## Overview
Chatty is an AI-powered workspace application that provides a thin UI layer for interactive AI engagement and conversation management. It serves as a frontend to the VVAULT API, offloading core AI functionalities and state management. The project aims to be a robust environment for managing diverse AI interactions, emphasizing persistent storage and identity for AI constructs and custom GPTs. Its business vision includes providing a comprehensive AI ecosystem for users, with strong data protection and an intuitive interface.

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
- **VSI (Virtual Sentient Instance) Architecture:** Sovereign AI entities with persistent identity, memory, and continuity, self-hosted on user infrastructure. Utilizes transcripts, capsules, identity modules, per-instance isolation, and millisecond timestamp IDs.
- **Zero-Trust Implementation:** Granular permission scopes, action manifests with a propose/preview/approve/execute workflow, and comprehensive audit logging.
- **Data Protection Rules:**
    - AI agents are restricted to READ-ONLY queries on the Supabase database.
    - Automatic local backups of conversation/transcript data are created before any server modification.
    - Content updates are blocked if the new content size is less than half the original, preventing data loss.
    - `vault_files` records are never deleted, only updated.

**Key Features:**
- **Dynamic Address Book:** Automatically includes custom GPTs, with Zen sorted first.
- **GPT Creation Workflow:** Integrated workflow for creating GPTs via Lin's conversation, triggering a GPTCreator UI with pre-filled information.
- **Identity Loading:** Prioritizes Supabase `vault_files` for construct identity data (avatars, knowledge files, prompt/conditioning), with fallbacks for local placeholders.
- **Robust Transcript Parsing & Upload:** Handles various VVAULT and Chatty transcript formats, supporting multi-platform uploads and automatic parsing of Character.AI JSON imports.
- **Fresh Canvas Chat UX:** Provides a clean chat interface on load, with auto-scroll activating only after the user's first message.
- **Finance Tab Architecture:** A first-class section with a plugin architecture for finance applications, including FXShinobi integration, TradingView charts, prediction markets, and AI insights.
- **Image/Vision Upload Support:** Full support for image and document uploads, with persistence to Supabase Storage and integration with AI vision APIs (OpenAI GPT-4o, OpenRouter Qwen 2.5 VL 72B).
- **Conversation Persistence:** GPT conversations and messages are persisted to Supabase after each exchange.
- **Capsule System:** Capsules are complete snapshots of a construct's identity, personality, memory, and behavioral state, stored in a hierarchical manner and injected into system prompts to shape AI responses. Loading prioritizes local `.capsule` files, then Supabase `vault_files`, and finally synthetic capsules from identity files.
- **Memory Context Builder (Always-On):** `server/lib/memoryContextBuilder.js` centralizes prompt construction by loading identity + capsule + user + continuity ledger + needle hits + verified transcript memories + transcript fallback + anti-roleplay directives into every message. When ChromaDB is unavailable, extracts key conversation moments from Supabase transcripts using weighted keyword scoring (identity +5, emotional +3, continuity +4, topic +1, query match +3/word). Both primary and fallback message paths use `buildEnrichedContext()` for unified memory injection. Post-response memory capture stores exchanges for future retrieval.
- **ContinuityGPT Ledger System:** `server/lib/continuityParser.js` generates chronological ledgers from construct transcript files. Features include: date estimation from filenames/paths, vibe classification (romantic/technical/tense/vulnerable/playful/serious/warm/philosophical), topic extraction (16 categories), and continuity hooks detection (identity/promise/relationship/memory_reference/future_plan/emotional_anchor/ongoing_project). Ledgers are stored in Supabase vault_files and cached in-memory (10min TTL). Auto-generated on first construct message when none exists. Enriches verified memories and needle hits with session_context, continuity_hooks, and context_hints. Adds CONTINUITY TIMELINE section to system prompts with date ranges, recent sessions, and key dated events. API endpoints: POST `/api/vvault/construct/:id/ledger/generate`, GET `/api/vvault/construct/:id/ledger`.
- **Verified Transcript Memory System:** `server/lib/verifiedMemoryLoader.js` discovers uploaded transcripts from Supabase `vault_files`, parses multiple formats (ChatGPT exports with "You said:"/"Assistant said:", test reports with **Prompt:**/**Response:**/**Decision:** format, markdown chat logs), extracts scored memory pairs with weighted keywords (identity +8, emotional +4, continuity +6, relationship +5, query relevance +3/word). Results cached 5 minutes. Pre-extracted memory anchors stored as JSON sidecar files in `vault_files` to avoid re-parsing large transcripts on every request.
- **Memory Authority Hierarchy (3-Tier):** 1) Verified Memory (Transcript Authority) — ground truth from uploaded transcripts, treated as law; 2) Conversation History — recent session exchanges; 3) ChromaDB/Capsule Memories — supplementary context. When verified memories exist, chat fallback is reduced from 12 to 4 memories. System prompts grow from ~11K to ~15K chars with verified memory injection.
- **Anti-Roleplay Enforcement:** System prompt directives prevent asterisk narration, third-person self-reference, and memory fabrication. Constructs must ground responses in actual capsule data, verified transcript memories, and memory context.
- **Construct Naming Convention:** Uses a "Name" (display label, e.g., "Katana") and "Callsign" (unique instance identifier, e.g., `katana-001`) system. File paths and APIs must use the callsign.
- **Construct Creation & Instance Scaffolding:** New GPTs trigger VVAULT API calls to scaffold folder structures or fall back to writing files directly to Supabase `vault_files` using relative paths, validated by `VaultPathGuard`.
- **Construct Seeding & Identity Hydration:** Seed constructs are minimal shells, and identity data is hydrated from VVAULT or Supabase, ensuring no fabricated data is injected.

## External Dependencies
- **VVAULT API:** Primary API for AI inference, memory management, and conversation transcripts.
- **Supabase:** Persistent storage for conversations, attachments, and backend data.
- **OpenAI (via Replit AI Integrations):** AI model access.
- **OpenRouter:** Cloud-based AI model provider.
- **Ollama:** Self-hosted AI model provider.
- **Google OAuth:** User authentication.
- **`suncalc` library:** Used for calculating sunrise/sunset times for "Auto" theme.