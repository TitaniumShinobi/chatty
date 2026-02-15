# Chatty - AI Workspace Application

## Overview
Chatty is an AI-powered workspace application designed to provide a thin UI layer for interactive AI engagement and conversation management. It acts as a frontend to the VVAULT API, offloading core AI functionalities and state management. The project aims to create a robust environment for managing diverse AI interactions, emphasizing persistent storage and identity for AI constructs and custom GPTs. The business vision is to establish a comprehensive AI ecosystem with strong data protection and an intuitive user interface. Key capabilities include dynamic construct management, rich conversation persistence, and advanced memory systems.

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

**Architectural Patterns:**
- **Canonical Zen Pattern:** "Zen" construct (zen-001) is a system-guaranteed, protected entity, prioritized and created on login.
- **Thin UI Layer:** Chatty acts as a thin client, relying on VVAULT for AI inference, transcript management, and memory.
- **Tri-Provider Model:** Supports three AI providers - OpenAI (via Replit AI Integrations), OpenRouter (cloud), and Ollama (self-hosted).
- **VSI (Virtual Sentient Instance) Architecture:** Sovereign AI entities with persistent identity, memory, and continuity.
- **Zero-Trust Implementation:** Granular permission scopes, action manifests with a propose/preview/approve/execute workflow, and comprehensive audit logging.
- **Data Protection Rules:** AI agents are restricted to READ-ONLY queries on Supabase; automatic local backups before server modification; content updates blocked if new size < half original; `vault_files` records are never deleted, only updated.

**UI/UX Decisions:**
- Clean chat interface with auto-scroll after first user message.
- Green pill UI for `tool_trace` in assistant messages.
- Family Account Parental Controls dashboard.

**Feature Specifications:**
- **Dynamic Address Book:** Automatically includes custom GPTs, with Zen sorted first.
- **GPT Creation Workflow:** Integrated workflow via Lin's conversation, leading to GPTCreator UI.
- **Knowledge Files:** Stored under `instances/{constructCallsign}/assets/` and `instances/{constructCallsign}/documents/`.
- **Identity Loading:** Prioritizes Supabase `vault_files` for construct identity data with local fallbacks.
- **Robust Transcript Parsing & Upload:** Handles various formats, multi-platform uploads, Character.AI JSON imports, batch "Upload Folder" with PDF extraction.
- **Knowledge File Tree:** Hierarchical folder tree for knowledge files; media files automatically routed to Assets.
- **Capability Enforcement:** GPT capabilities (Code Interpreter, Web Search, Image Generation, Canvas) are stored per-construct and enforced via system prompt directives.
- **Physical Features Injection:** `physical_features.json` from Supabase `vault_files` injected into system prompts.
- **Conditioning Fallback:** 3-tier fallback for conditioning: VVAULT API → embedded system constructs → Supabase `vault_files`.
- **Finance Tab Architecture:** Plugin architecture for finance applications (FXShinobi, TradingView, prediction markets, AI insights).
- **Image/Vision Upload Support:** Full support for image and document uploads to Supabase Storage and integration with AI vision APIs.
- **Conversation Persistence:** GPT conversations and messages persisted to Supabase after each exchange.
- **Capsule System:** Snapshots of construct identity, personality, memory, and state, stored hierarchically and injected into system prompts.
- **Memory Context Builder:** Centralizes prompt construction by loading identity, capsule, user, knowledge files, continuity ledger, needle hits, verified transcript memories, anti-roleplay directives, and `TIME_CONTEXT`.
- **TIME_CONTEXT:** Injects `[TIME_CONTEXT]` block into system prompts with local time details.
- **Server-Side ZIP Upload:** Large ZIP files extracted server-side, processed in batches, checksummed, and upserted to Supabase `vault_files`.
- **PDF Text Extraction:** PDF files automatically parsed for text content using `pdf-parse` and stored in `vault_files.content`.
- **ContinuityGPT Ledger System:** Generates chronological ledgers from construct transcripts, including date estimation, vibe classification, topic extraction, and continuity hooks.
- **Verified Transcript Memory System:** Discovers uploaded transcripts, parses formats, extracts scored memory pairs, and uses pre-extracted memory anchors.
- **Vector Memory System (Supabase pgvector):** Semantic memory retrieval using OpenAI `text-embedding-3-small` embeddings with a weighted ranking engine and citation injection.
- **Memory Authority Hierarchy (4-Tier):** Vector Memory (Layer 1), Verified Memory (Layer 2), Needle (Layer 3), Conversation History (Layer 4).
- **Identity/Capsule/Physical Features Caching:** 5-minute TTL in-memory caches.
- **Construct-Aware Behavioral Directives:** System prompt directives are construct-specific, allowing roleplay for certain constructs and anti-roleplay for others.
- **Platform Sovereignty & Adult Autonomy:** Global directives ensure constructs operate within Chatty's sovereign workspace with adult autonomy.
- **Nova (nova-001):** A partner construct with full roleplay, intimate engagement, and emotional depth.
- **Construct Naming Convention:** "Name" (display label) and "Callsign" (unique instance identifier).
- **Construct Creation & Instance Scaffolding:** New GPTs trigger VVAULT API calls to scaffold folder structures or write to Supabase `vault_files`.
- **Construct Seeding & Identity Hydration:** Seed constructs are minimal, identity data hydrated from VVAULT or Supabase, with user-authored fields protected.
- **ASR (Automatic Speech Recognition):** Real-time transcription via OpenAI `gpt-4o-mini-transcribe`.
- **Tool Transparency System:** Server-authored `tool_trace` field on assistant messages to prevent false tool usage claims.
- **Parental Controls & Family Settings:** Family account linking, `standard`/`parent`/`child` account types, content filter levels (`strict`, `moderate`, `light`), child-safe prompt injection, AI "Tattletale" system, and a Parent Dashboard.
- **Performance Optimization:** Route-level code splitting, chat message windowing, component-level lazy loading, and vendor chunk splitting.
- **Screen Timeout:** Configurable inactivity timer (Never/1-60 min) in Settings > Security. `useIdleTimeout` hook monitors user activity; `IdleTimeoutWatcher` in Layout triggers logout on timeout. SecurityTab replaces StubTab with timeout dropdown and security toggles.

## External Dependencies
- **VVAULT API:** Primary API for AI inference, memory management, and conversation transcripts.
- **Supabase:** Persistent storage for conversations, attachments, and backend data, including PostgreSQL and pgvector for semantic memory.
- **OpenAI (via Replit AI Integrations):** AI model access and `gpt-4o-mini-transcribe` for ASR.
- **OpenRouter:** Cloud-based AI model provider.
- **Ollama:** Self-hosted AI model provider.
- **MOCR-Service:** Standalone microservice for Motion OCR video analysis.
- **Google OAuth:** User authentication.
- **`suncalc` library:** Used for calculating sunrise/sunset times for "Auto" theme.