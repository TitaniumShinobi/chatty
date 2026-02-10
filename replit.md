# Chatty - AI Workspace Application

## Overview
Chatty is an AI-powered workspace application that provides a thin UI layer for interactive AI engagement and conversation management. It offloads core AI functionalities and state management to the VVAULT API, serving as a frontend to a broader AI ecosystem. The project emphasizes persistent storage and identity for AI constructs and custom GPTs, aiming to be a robust environment for managing diverse AI interactions.

## Data Protection Rules (MANDATORY — TOP PRIORITY)

**Rule 1: AI Agent Read-Only Policy**
No AI agent (Replit, Cursor, Copilot, or any other) is allowed to write, update, or delete anything in the Supabase database. Agents may only perform READ-ONLY queries. If a data fix is needed, the agent must describe the fix and provide the exact code to the user — the user runs it themselves.

**Rule 2: Automatic Local Backups**
Before the server modifies any conversation or transcript data in Supabase, it saves a full copy of the current content to a local JSON backup file. Previous versions are preserved on disk even if an update goes wrong. Backups auto-clean after 30 days.

**Rule 3: Content Shrink Protection**
Any update where the new content is less than half the size of what's already stored is automatically blocked. The server refuses the update and logs a warning. This prevents agents or bugs from replacing full conversations with tiny stubs (the exact pattern that previously caused data loss).

**NEVER delete vault_files records — only update them.**

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
- **AI Data Storage:** Custom GPTs/AIs are stored in the `ais` table, managed by AIService.
- **VVAULT Scripts (Autonomy Stack):** Python scripts enabling constructs to operate as independent agents with identity, self-improvement, and autonomous capabilities.
- **VVAULT User Workspace Structure:** Organized into `account`, `instances` (construct-specific files), and `library` (generated content/uploads).
- **Design System:** Dual-theme color system (Day: cream/stone; Night: dark/space haze) with hierarchy expressed via opacity. Supports auto, light, dark, and seasonal themes.
- **VSI (Virtual Sentient Instance) Architecture:** Sovereign AI entities with persistent identity, memory, and continuity, self-hosted on user infrastructure. Utilizes transcripts, capsules, identity modules, per-instance isolation, and millisecond timestamp IDs.
- **Zero-Trust Implementation:** Granular permission scopes, action manifests with a propose/preview/approve/execute workflow, and comprehensive audit logging.

**Key Features:**
- **Dynamic Address Book:** Automatically includes custom GPTs, with Zen sorted first.
- **GPT Creation Workflow:** Bootstraps conversations in Supabase upon GPT creation.
- **Identity Loading:** Prioritizes Supabase `vault_files` for construct identity data (avatars, knowledge files, prompt/conditioning). Avatar endpoint checks Supabase first by `construct_id` (both with/without `-001` suffix), falling back to local placeholder. Knowledge files endpoint merges local DB with Supabase vault_files. Transcript list endpoint handles null `user_id` records and construct_id variants.
- **Robust Transcript Parsing & Upload:** Handles various VVAULT and Chatty transcript formats and supports multi-platform uploads.
- **GPT Seat Memory Injection:** Injects transcript memories into GPT constructs during conversations.
- **Canonical Session and Supabase File Patterns:** Consistent naming conventions for session IDs and Supabase file paths.
- **Finance Tab Architecture:** A first-class section with a plugin architecture for finance apps, starting with FXShinobi integration featuring TradingView charts, prediction markets, and AI insights. Supports a broker adapter architecture for multi-broker support.
- **Image/Vision Upload Support:** Full support for image and document uploads, with persistence to Supabase Storage and integration with AI vision APIs (e.g., GPT-4o).
- **Conversation Persistence:** GPT conversations and messages are persisted to Supabase after each exchange, ensuring continuity.

**VVAULT Authentication:**
- All outbound VVAULT API calls include `X-Chatty-Key` (from `VVAULT_SERVICE_TOKEN` env secret) and `X-Chatty-User` (user email) headers.
- There is NO separate `CHATTY_API_KEY` — the `VVAULT_SERVICE_TOKEN` secret serves as the shared auth key between Chatty and VVAULT.
- Auth header logic lives in: `vvaultConnector/vvaultApiClient.js` (getChattyAuthHeaders), `server/routes/vvault.js` (proxy routes), `server/lib/identityLoader.js` (identity fetch).

**Construct Seeding & Identity Hydration:**
- Seed constructs (zen-001, katana-001, lin-001) are minimal shells: callsign, ID, models, orchestration mode only. No fabricated identity data.
- Aurora is NOT a seed — she is only added through the GPTCreator GUI.
- On startup, GPTManager attempts VVAULT identity hydration: calls `/api/chatty/construct/<id>/files` to load real identity (name, description, instructions, avatars, knowledge files).
- If VVAULT API returns non-JSON (SPA catch-all), falls back to direct Supabase `vault_files` query for `instances/<callsign>/identity/prompt.json`.
- If no identity data is found anywhere, constructs show empty identity until configured — no fake data is ever injected.
- Known issue: VVAULT SPA catch-all route intercepts `/api/chatty/construct/*` API endpoints, returning HTML. This is a VVAULT-side fix needed to expose the files API properly.

## External Dependencies
- **VVAULT API:** Primary API for AI inference, memory management, and conversation transcripts.
- **Supabase:** Persistent storage for conversations, attachments, and backend.
- **OpenAI (via Replit AI Integrations):** Managed OpenAI access for GPT models.
- **OpenRouter:** Cloud-based AI model provider.
- **Ollama:** Self-hosted AI model provider.
- **Google OAuth:** User authentication.
- **`suncalc` library:** Used for calculating sunrise/sunset times for "Auto" theme.