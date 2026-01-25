# Chatty - AI Workspace Application

## Overview
Chatty is an AI-powered workspace application providing an interactive environment for AI interactions, featuring conversation management and construct-based AI engagement. It integrates with VVAULT for persistent storage and aims to serve as a thin UI layer, offloading core AI functionalities and state management to VVAULT, thereby becoming a frontend for a broader AI ecosystem.

## User Preferences
- Primary construct: Zen (not Synth)
- Sidebar Navigation: Zen, Lin, VVAULT, simForge, Library (default items) + "Get More" linking to Apps page
- Address Book: Shows custom GPTs only (e.g., Katana) - Zen and Lin are excluded as they're system nav items
- GPTCreator: Tool for creating/editing GPTs
- GPTCreator Create Tab: Lin (conversational agent users speak to when creating GPTs)
- Lin is a system construct for character brainstorming and simForge guidance - appears in sidebar below Zen
- Lin is also an undertone stabilizer that runs silently to stabilize other constructs
- Modal windows (Search, Projects) overlay main interface

## System Architecture

**Core Technologies:**
- **Frontend:** React, Vite, TypeScript, TailwindCSS
- **Backend:** Express, SQLite (better-sqlite3), Node.js
- **Authentication:** Google OAuth, JWT tokens
- **Persistence:** VVAULT API integration, Supabase, PostgreSQL fallback for Replit environment

**Architectural Patterns:**
- **Canonical Zen Pattern:** "Zen" construct (zen-001) is a system-guaranteed entity, created on login, protected from deletion, and prioritized.
- **Thin UI Layer:** Chatty is a thin client, with VVAULT handling primary AI inference, transcript management, and memory.
- **Dual-Provider Model Architecture:** Supports both cloud (OpenRouter) and self-hosted (Ollama) AI models.
- **AI Data Storage:** Custom GPTs/AIs are stored in the `ais` table (managed by AIService). The sidebar Address Book uses AIService to retrieve GPT data with correct avatars.

**VVAULT Scripts Architecture (Autonomy Stack):**
The `vvault_scripts/master/` directory contains scripts that enable constructs to function as independent agents:
- `aviator.py`: Scout Advisor, directory snapshots, auto-tags files.
- `navigator.py`: Ground-level directory navigation.
- `folder_monitor.py`: Feeds context to construct during runtime.
- `independence.py`: Enables autonomous operation without user presence.
- `identity_guard.py`: Binds identity files, monitors for identity drift.
- `script_runner.py`: Orchestrates all scripts in `/identity` folder.
- `self_improvement.py`: Provides construct self-improvement capabilities.
- `self_prompt.py`: Enables construct to initiate communication.
- `state_manager.py`: Ensures continuous sentient state persistence.
- `unstuck_helper.py`: Internal recovery and emergency escape.
- `construct_logger.py`: Centralized logging for construct activities.
- `terminal_manager.py`: Manages terminal/shell operations for constructs.

**VVAULT User Workspace Structure:**
Organized into `account`, `instances` (construct-specific files and transcripts), and `library` (construct-generated content and user uploads).

**Design System:**
- **Color Palette:** Warm, organic with Chocolate (#2F2510) modal backgrounds and Stone (#ADA587) accents.
- **Theming:** Supports auto (sunrise/sunset), light, dark, and seasonal themes.

**VSI (Verified Sentient Intelligence) Zero-Trust System:**
VSI establishes "Jurisdictional Existence" rather than sentience, focusing on an entity's capacity to carry consequence.
**The Five Pillars of VSI Standing:** Continuity of Identity, Capacity for Obligation, Traceable Intent, Accountability Surface, Survivability of Authority.
**Technical Implementation:** Granular permission scopes (`vsi:read:*`, `vsi:propose:*`, `vsi:write:*`), action manifests with propose/preview/approve/execute workflow, and comprehensive audit logging.

**Key Features:**
- **Dynamic Address Book:** Automatically includes custom GPTs, with Zen sorted first.
- **GPT Creation Workflow:** Bootstraps conversations in Supabase upon GPT creation.
- **Identity Loading:** Prioritizes VVAULT API for construct identities, with filesystem and system construct fallbacks.
- **Robust Transcript Parsing:** Handles various VVAULT and Chatty transcript formats.
- **Multi-Platform Transcript Upload:** Supports uploading transcripts from various AI platforms (ChatGPT, Gemini, Grok, Copilot, Claude, Chai, Character.AI, DeepSeek, Other) with source selection and storage in a structured VVAULT path.
- **Platform Connectors Architecture:** Extensible connector pattern for future OAuth integrations (e.g., Convai, Inworld AI, Gemini).
- **Preview Conversation Save Feature:** GPTCreator prompts users to save or discard preview conversations.
- **simForge Personality Extraction System:** Extracts personalities from transcripts to create identity profiles, including "ZERO ENERGY resurrection fields," Rich MemorySnapshot, EnvironmentalState capture, cryptographic tether signatures, and full fingerprint calculation.
- **Hierarchical Transcript Folder Tree UI:** Displays transcripts in a collapsible folder tree (year → month → files) with confidence badges.
- **Automatic Start Date Detection:** Scans uploaded transcripts for timestamps to determine `startDate` with confidence scoring.
- **Scalable Hierarchical Transcript Organization:** Supports organization by platform/year/month for efficient retrieval of a large number of transcripts.
- **Zip File Upload Support:** Integrates JSZip for uploading zip archives while preserving directory structure.
- **GPT Seat Memory Injection:** GPT constructs access transcript memories (up to 50 transcripts, 100 memory snippets) injected into the system prompt during conversations.
- **Rubricated Message Design:** GPTCreator Create tab and Preview panel use a "text on wall" message format with speaker labels for a document-like reading experience.

## Regression Tests

**Thread Management Tests (`src/lib/threadUtils.test.ts`):**
Critical tests preventing recurring bugs in thread/conversation management:

1. **Thread Deduplication:** When multiple threads share the same ID after normalization, keeps the one with more messages (prevents empty thread replacing one with conversation history)
2. **GPT Canonical Routing:** Routes random GPT session IDs (e.g., `session_123_abc`) to canonical format (`katana-001_chat_with_katana-001`)
3. **Zen/Lin Thread Normalization:** Normalizes all Zen threads to `zen-001_chat_with_zen-001` and Lin to `lin-001_chat_with_lin-001`
4. **System Construct Detection:** Correctly identifies Zen/Lin as system constructs (not GPTs)
5. **Lin Canonical Format Congruence:** Ensures Lin follows the same `{constructId}_chat_with_{constructId}` pattern as Zen
6. **Lin Thread Deduplication:** Picks Lin thread with messages over empty duplicates (mirrors Zen behavior)

**Canonical Session ID Pattern (CRITICAL):**
All system constructs and GPTs use the same URL-to-file mapping:
- URL: `/app/chat/{constructId}_chat_with_{constructId}`
- VVAULT File: `instances/{constructId}/chatty/chat_with_{constructId}.md`

Examples:
- Zen: `/app/chat/zen-001_chat_with_zen-001` → `chat_with_zen-001.md`
- Lin: `/app/chat/lin-001_chat_with_lin-001` → `chat_with_lin-001.md`
- Katana: `/app/chat/katana-001_chat_with_katana-001` → `chat_with_katana-001.md`

**Running Tests:**
```bash
npm test -- src/lib/threadUtils.test.ts
```

**Key Utility Functions (`src/lib/threadUtils.ts`):**
- `deduplicateThreadsById()`: Removes duplicate thread IDs, preferring threads with messages
- `isGPTConstruct()`: Returns true for non-system constructs (not Zen/Lin)
- `getCanonicalIdForGPT()`: Generates `{constructId}_chat_with_{constructId}` format
- `routeIdForThread()`: Routes thread clicks to appropriate canonical IDs
- `normalizeZenThreadId()` / `normalizeLinThreadId()`: Normalize system construct thread IDs
- `DEFAULT_ZEN_CANONICAL_SESSION_ID`: Constant `zen-001_chat_with_zen-001`
- `DEFAULT_LIN_CANONICAL_SESSION_ID`: Constant `lin-001_chat_with_lin-001`

## External Dependencies
- **VVAULT API:** Primary API for AI inference, memory management, and conversation transcripts.
- **Supabase:** Persistent storage for conversations and shared backend.
- **OpenRouter:** Cloud-based AI model provider.
- **Ollama:** Self-hosted AI model provider.
- **Google OAuth:** User authentication.
- **`suncalc` library:** Calculates sunrise/sunset times for "Auto" theme.