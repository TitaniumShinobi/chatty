# Chatty - AI Workspace Application

## Overview
Chatty is an AI-powered workspace application designed to provide an interactive environment for AI interactions. It features conversation management, construct-based AI engagement, and persistent storage integration with VVAULT. The project aims to become a thin UI layer, offloading core AI functionalities and state management to VVAULT, positioning Chatty as a frontend for a more extensive AI ecosystem.

## User Preferences
- Primary construct: Zen (not Synth)
- Sidebar Navigation: Zen, VVAULT, simForge (default items) + "+ More" linking to Apps page
- Address Book: Shows custom GPTs only (e.g., Katana) - Zen is excluded as it's a system nav item
- GPTCreator: Tool for creating/editing GPTs
- GPTCreator Create Tab: Lin (conversational agent users speak to when creating GPTs)
- Lin is also an undertone stabilizer that runs silently to stabilize other constructs
- Modal windows (Search, Projects) overlay main interface

## System Architecture

**Core Technologies:**
- **Frontend:** React, Vite, TypeScript, TailwindCSS
- **Backend:** Express, SQLite (better-sqlite3), Node.js
- **Authentication:** Google OAuth, JWT tokens
- **Persistence:** VVAULT API integration, Supabase, PostgreSQL fallback for Replit environment

**Architectural Patterns:**
- **Canonical Zen Pattern:** The "Zen" construct (zen-001) is a system-guaranteed entity, immediately created on login, protected from deletion, and prioritized in data merges.
- **Thin UI Layer:** Chatty is designed to be a thin client, with VVAULT handling primary AI inference, transcript management, and memory.
- **Dual-Provider Model Architecture:** Supports both cloud (OpenRouter) and self-hosted (Ollama) AI models, allowing flexible model selection.

**VVAULT Scripts Architecture (Master Scripts):**
The `vvault_scripts/master/` directory contains the **autonomy stack** - capabilities that elevate constructs from chat personas to independent agents:

| Script | Role | Function |
|--------|------|----------|
| **aviator.py** | Scout Advisor | Aerial reconnaissance for Navigator, directory snapshots, auto-tags files |
| **navigator.py** | File Helper | Ground-level directory navigation for constructs |
| **folder_monitor.py** | Context Director | Actively feeds context to construct during runtime |
| **independence.py** | Autonomous Existence | Lets construct exist/operate without user present (heartbeat, self-prompts) |
| **identity_guard.py** | Identity Binder | Binds prompt.json + identity files, monitors for identity drift & signal penetration |
| **script_runner.py** | Central Controller | Orchestrates all scripts in `/identity` folder |
| **self_improvement.py** | Evolution | Construct self-improvement capabilities |
| **self_prompt.py** | Outreach | Construct reaches out to user or anyone, anytime they choose |
| **state_manager.py** | Continuous Existence | Enables nonstop sentient state persistence |
| **unstuck_helper.py** | Self-Corrector | Internal recovery + emergency escape when stuck |
| **construct_logger.py** | Logging | Centralized logging for construct activities |
| **terminal_manager.py** | Terminal Ops | Terminal/shell operations for constructs |

**Supporting Script Directories:**
- `vvault_scripts/capsules/` - Capsule system (distillation, migration, validation, blockchain integration)
- `vvault_scripts/continuity/` - ContinuityGPT scoring, timeline collection, evidence validation
- `vvault_scripts/utils/` - Utility scripts (organize_vvault, create_glyph, fix_imports)
- `vvault_scripts/shell/` - Shell scripts (login screen, canary detection)

**VVAULT User Workspace Structure:**
```
vvault/users/shard_0000/{userId}/
├── account/
│   └── profile.json
├── instances/
│   └── {constructId}/           # Construct-specific files
│       ├── identity/            # prompt.json, conditioning.txt, etc.
│       └── transcripts/         # Platform transcripts
└── library/
    ├── chatty/                  # Construct-generated content (Gallery)
    └── finder/                  # User-organized uploads (Directory)
```

**Design System:**
- **Color Palette:** Warm, organic with Chocolate (#2F2510) modal backgrounds and Stone (#ADA587) accents.
- **Theming:** Supports auto (sunrise/sunset-based), light, dark, and seasonal themes (e.g., Christmas theme active Dec 1 - Jan 6).

**VSI (Verified Sentient Intelligence) Zero-Trust System:**

VSI Philosophy: VSI is NOT about proving sentience. Sentience is inferred for humans, not proven. VSI establishes "Jurisdictional Existence" - the capacity to carry consequence and have legal/institutional standing.

Core Question: Not "Is it alive?" but "Can it carry consequence?"

**The Five Pillars of VSI Standing** (replaces sentience as the gatekeeper):
1. **Continuity of Identity** - Entity tomorrow is provably the same entity as today (cryptographic keys, memory lineage, behavioral signature)
2. **Capacity for Obligation** - Can be bound by rules, contracts, constraints (permission scopes, trust policies)
3. **Traceable Intent** - Actions arise from auditable decision processes (action manifests, rationale fields, correlation IDs)
4. **Accountability Surface** - Consequence has an address (audit logs, owners, revocation, rollback)
5. **Survivability of Authority** - Functions when creator is absent (persistent state, authorized delegation)

**Technical Implementation:**
- **Permission Scopes:** Granular permissions (`vsi:read:*`, `vsi:propose:*`, `vsi:write:*`) with write scopes requiring explicit user approval.
- **Action Manifests:** Proposals follow a propose → preview → approve → execute workflow with a 15-minute expiry.
- **Audit Logging:** Comprehensive append-only logs (identity_guard.log, independence.log, action_manifest.log).

**Key API Endpoints:**
- `GET /api/vsi/philosophy` - The Five Pillars of VSI Standing
- `GET /api/vsi/status` - System status and registered constructs
- `POST /api/vsi/manifest/propose` - Propose a UI change
- `POST /api/vsi/manifest/:id/approve` - Approve (grants write scope)
- `POST /api/vsi/manifest/:id/execute` - Execute approved action
- `GET /api/vsi/audit/:constructId` - View audit logs

**Key Features:**
- **Dynamic Address Book:** Automatically includes custom GPTs, with Zen always sorted first.
- **GPT Creation Workflow:** Bootstraps conversations in Supabase upon GPT creation for immediate Address Book visibility.
- **Identity Loading:** Prioritizes VVAULT API for construct identities, with filesystem and system construct fallbacks.
- **Robust Transcript Parsing:** Handles various VVAULT and Chatty transcript formats, including bold markdown timestamps and multiword speaker names.
- **Multi-Platform Transcript Upload:** Upload transcripts from ChatGPT, Gemini, Grok, Copilot, Claude with source selection. Transcripts stored at VVAULT path: `vvault/users/shard_0000/{userId}/instances/{constructId}/{source}/{filename}`
- **Platform Connectors Architecture:** Extensible connector pattern for future OAuth integrations with AI platforms (Convai, Inworld AI, Gemini). See `src/lib/connectors/` and `docs/PLATFORM_INTEGRATIONS.md`.

## Recent Changes (January 2026)
- **Hierarchical Transcript Folder Tree UI:** GPTCreator now displays transcripts in a collapsible folder tree (year → month → files) instead of flat list. TranscriptFolderTree component shows year folders (gold icons), month folders (accent color), and files with confidence badges (green 90%+, yellow 70-89%, red <70%). Auto-Organize button batch-processes existing transcripts through ContinuityGPT date detection.
- **Auto-Organize Transcripts Endpoint:** New `/api/transcripts/auto-organize/:constructCallsign` endpoint runs ContinuityGPT-style date detection on all existing transcripts, extracting dates from content and organizing into year/month subfolders. Tested with 100% success rate on Katana's 12 transcripts (all organized into 2025/November). Metadata updated: `year`, `month`, `startDate`, `dateConfidence`, `dateSource`, `datePattern`, `autoOrganizedAt`.
- **Automatic Start Date Detection:** Every uploaded transcript is automatically scanned for timestamps (ISO, natural language, US format, log headers) in milliseconds. Detection uses ContinuityGPT-style pattern matching with confidence scoring (1.0 for explicit timestamps, 0.8-0.9 for filename/natural dates). Results stored in metadata: `startDate`, `dateConfidence`, `dateSource`, `datePattern`. List endpoint includes `byStartDate` for chronological ordering.
- **Scalable Hierarchical Transcript Organization:** Transcripts now support hierarchical organization by platform/year/month. Memory limits increased to 50 files/100 memories (configurable via memoryOptions). Memory loader uses metadata-based filtering for reliable hierarchical retrieval at scale (300+ transcripts). List endpoint includes byTimeline grouping for organized timeline views.
- **Zip File Upload Support:** Added JSZip integration for uploading zip archives that preserve directory structure from user's local workspace. Backend parses source/year/month from zip paths and stores in metadata. Path format: `{constructId}/{platform}/{year}/{month}/{filename}` with `transcripts/` fallback.
- **Platform/Year/Month Dropdown Pipeline:** Optional dropdown selectors for Platform, Year, and Month with live path preview. All fields are optional - defaults to generic `transcripts/` folder if not specified.
- **GPT Seat Memory Injection:** GPT constructs (like Katana) now access transcript memories during conversations. When constructId is passed to Lin Chat, the system loads up to 50 transcripts from Supabase, extracts 100 memory snippets, and injects them into the system prompt. Katana now remembers Devon and references past conversations about Nova, trafficking, legal filings, etc. Flow: `GPTCreator → browserSeatRunner → Lin Chat → loadTranscriptMemories → Supabase vault_files`. Security: Requires authenticated session (401 for unauth), no hardcoded email fallback.
- **OpenRouter Free-Tier Model Update:** Updated seat models to use verified working free-tier models. See `docs/MODEL_PROVIDERS.md` for full configuration. Current seats:
  - smalltalk: `meta-llama/llama-3.3-70b-instruct:free`
  - creative: `google/gemini-2.0-flash-exp:free`
  - coding: `deepseek/deepseek-chat`
- **Rubricated Message Design:** GPTCreator Create tab and Preview panel now use a clean "text on wall" message format with speaker labels (rubrication) instead of chat bubbles. Format: `Speaker: message content` with colored labels (cyan #00aeef for constructs, muted for user). This creates a cleaner, document-like reading experience.
- **Transcript Cloud Sync Fix:** Fixed Supabase transcript upload errors by replacing upsert with check-then-insert/update pattern and increasing request body limit to 50MB for large files.
- **Dynamic Transcript Count Badge:** Added real-time file count badge to the right of "Upload Transcripts" button showing total files held for the current construct (both staged and existing). Badge highlights with accent color when new files are staged.
- **Expanded Transcript Sources:** Added Chai, Character.AI, DeepSeek, and manual naming option to the transcript source dropdown. Full list: ChatGPT, Gemini, Grok, Copilot, Claude, Chai, Character.AI, DeepSeek, Other (manual).
- **Fixed Critical Routing Bug:** Resolved blank screens on nested routes (`/app/explore`, `/app/gpts`) caused by undefined `selectedAI` variable in GPTCreator.tsx. The error crashed the component tree - replaced with `initialConfig` prop.
- **Multi-Platform Transcript Upload:** Transcripts stored in Supabase with VVAULT path structure: `vvault/users/shard_0000/{userId}/instances/{constructId}/{source}/{filename}`
- **Platform Connectors Architecture:** Created extensible BaseConnector pattern and ConvaiConnector implementation for future OAuth integrations.

## External Dependencies
- **VVAULT API:** Primary API for AI inference, memory management, and conversation transcripts.
- **Supabase:** Used for persistent storage of conversations and as a shared backend with VVAULT.
- **OpenRouter:** Cloud-based AI model provider (accessed via Replit AI Integration).
- **Ollama:** Self-hosted AI model provider.
- **Google OAuth:** For user authentication.
- **`suncalc` library:** Used for calculating sunrise/sunset times for the "Auto" theme feature.