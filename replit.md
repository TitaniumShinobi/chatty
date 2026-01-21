# Chatty - AI Workspace Application

## Overview
Chatty is an AI-powered workspace application with a React+Vite frontend and Express backend. It features conversation management, construct-based AI interactions, and integration with VVAULT for persistent storage.

## Architecture

### Ports
- **Frontend (Vite)**: Port 5000 (public via Replit proxy)
- **Backend (Express)**: Port 3000 (internal)

### Key Technologies
- Frontend: React, Vite, TypeScript, TailwindCSS
- Backend: Express, SQLite (better-sqlite3), Node.js
- Authentication: Google OAuth, JWT tokens, development mode bypass

## Key Patterns

### Canonical Zen Pattern (Layout.tsx)
The primary construct "Zen" (zen-001) is implemented as a **system-guaranteed entity**, not data-dependent:

1. **Immediate Creation**: Zen thread created synchronously on login, before any async VVAULT calls
2. **Protected Flag**: Marked with `isPrimary: true` and `constructId: 'zen-001'`
3. **Merge Preservation**: When VVAULT data loads, Zen is merged but never removed
4. **Deletion Protection**: `handleDeleteConversation` blocks deletion of Zen

**Session ID**: `zen-001_chat_with_zen-001`

### Design System
- Modal backgrounds: Chocolate (#2F2510)
- Accent elements: Stone (#ADA587)
- Theme: Warm, organic color palette

## Directory Structure
```
src/
  components/        # React components (Layout, Sidebar, SearchModal, etc.)
  pages/             # Page components (Home, Chat, Settings)
  lib/               # Utilities (auth, vvaultConversationManager, etc.)
  engine/            # AI processing (orchestration, identity)
  core/              # Core services (memory, identity)
server/
  server.js          # Express server entry point
  routes/            # API routes (vvault.js, etc.)
  models/            # Data models (User.js, etc.)
docs/
  implementation/    # Implementation documentation
  rubrics/           # Design rubrics and patterns
```

## Recent Changes
- **2026-01-21**: Theme System - Appearance + Theme Rows in Settings
  - Renamed "Theme" to "Appearance" (controls Auto/Light/Dark mode)
  - Added new "Theme" row for color scheme selection (None/Auto/Christmas)
  - Calendar-driven themes: Auto detects seasonal themes based on date
  - Christmas theme: Active Dec 1 - Jan 6
    - Deep forest green background (#0f1f0f)
    - Cloud lemon starbursts (#ffffeb), white novas (#ffffff), gold rays (#ffd700)
    - Tiered star animations on hover: 7s starbursts, 14s rays, 28s novas
  - Key files:
    - `src/lib/calendarThemeService.ts` - Theme detection and Christmas script definition
    - `src/lib/ThemeContext.tsx` - Added activeThemeScript, themeScriptSetting state
    - `src/components/settings/GeneralTab.tsx` - Updated UI with Appearance + Theme rows
    - `src/index.css` - Christmas theme CSS variable overrides
- **2026-01-21**: VVAULT Transfer Audit (Aurora as VVAULT's AI)
  - Created comprehensive audit: `docs/VVAULT_TRANSFER_AUDIT.md`
  - Identified 86 files of AI functionality to transfer from Chatty to VVAULT
  - Aurora will handle: orchestration, persona routing (Lin undertone), identity enforcement, memory, inference
  - Chatty becomes thin UI: components, theme, auth, API clients calling VVAULT
  - Key VVAULT endpoints needed: `/api/aurora/orchestrate`, `/api/aurora/persona-route`, `/api/aurora/memory/*`
- **2026-01-20**: Sunrise/Sunset-based Auto Theme
  - Renamed "System" theme to "Auto" - now follows real sunrise/sunset times, not OS preference
  - Uses `suncalc` library to calculate actual sunrise/sunset for user's location
  - Geolocation: Requests user location on first load, caches in localStorage
  - Default fallback: Atlanta, GA coordinates if geolocation denied
  - Settings UI: Shows timezone + sunrise/sunset times when "Auto" is selected
  - Theme transitions: Light theme during day (sunrise→sunset), Dark during night (sunset→sunrise)
  - Key files:
    - `src/lib/ThemeContext.tsx` - SunCalc integration, geolocation, auto theme logic
    - `src/components/settings/GeneralTab.tsx` - Updated theme options (Auto/Light/Dark)
- **2026-01-20**: VVAULT API Message Routing Architecture (Thin UI Layer)
  - **Architecture Principle**: Chatty is now a thin UI layer; VVAULT is the stateful home for constructs
  - **Message Flow**: Browser → `/api/vvault/message` → VVAULT API → Ollama → transcript saved
  - Key changes:
    - Added `postMessage()` and `appendMessage()` to `vvaultConnector/vvaultApiClient.js`
    - Added proxy routes in `server/routes/vvault.js`:
      - `POST /api/vvault/message` - Proxies to VVAULT's `/api/chatty/message` for LLM inference
      - `POST /api/vvault/transcript/:constructId/append` - Appends messages to transcripts
    - Updated `src/lib/aiService.ts` to use VVAULT API instead of internal `/api/conversations`
  - VVAULT handles: LLM inference (Ollama), transcript markdown saving, memory management
  - Chatty handles: UI rendering, local session state only
  - Transcript format: `**HH:MM:SS AM/PM TZ - Name** [ISO8601Z]: message`
- **2026-01-20**: Sidebar simplification - removed "GPTS" section header
  - simForge moved into main navigation options (alongside Library, Code, VVAULT, Projects)
  - Removed redundant custom GPTs list from sidebar (constructs appear in Address Book instead)
  - Chatty uses singleton threads per construct model, not ChatGPT's "GPTs section + multiple chats" model
- **2026-01-20**: GPT creation now bootstraps conversation in Supabase (ChatGPT model)
  - When a GPT is created via GPTCreator, a conversation scaffold is automatically created in Supabase
  - This ensures the new GPT immediately appears as a contact in the Address Book
  - Flow: GPT created → `writeConversationToSupabase()` called with CONVERSATION_CREATED marker
  - SessionId convention: `{constructCallsign}_chat_with_{constructCallsign}`
  - File: `server/routes/gpts.js` POST handler
- **2026-01-20**: Fixed parser to handle bold markdown timestamp format
  - **Root cause**: VVAULT transcripts use bold markdown: `**06:48:09 AM EST - Devon** [ISO_TIMESTAMP]: message`
  - **Fix**: Updated regex in `vvaultApiClient.js` to handle optional `**` markers: `\*{0,2}` at start and end
  - Parser now recognizes all 181 messages in zen-001 transcript (was only 4)
  - File path fix: Copied transcript data from old path (`chat_with_zen-001.md`) to new path (`instances/zen-001/chatty/chat_with_zen-001.md`)
- **2026-01-20**: Parser improvements for VVAULT transcript formats
  - Parser in `vvaultApiClient.js` now handles:
    - VVAULT format: "You said:" / "Synth said:" / "[Name] said:"
    - Plain timestamp: "HH:MM:SS AM/PM TZ - Name [ISO_TIMESTAMP]: message"
    - Bold timestamp: "**HH:MM:SS AM/PM TZ - Name** [ISO_TIMESTAMP]: message"
  - Regex updated to handle multiword speaker names (e.g., "Devon Woodson")
  - Speaker matching uses `.startsWith('devon')` for flexibility
- **2026-01-20**: Fixed raw markdown rendering issue in chat messages
  - **Root cause**: `mapChatMessageToThreadMessage()` in Layout.tsx was treating string content as a packets array
  - **Fix**: Added type checking to distinguish between string content (from VVAULT) and packet arrays (from live chat)
  - String content now properly wrapped in `{ op: "answer.v1", payload: { content: ... } }` structure
  - This ensures ReactMarkdown in the `R` component receives proper packet format for rendering
- **2026-01-20**: Chat UI rendering fixes and code cleanup
  - Fixed VVAULT transcript parsing: Added `stripSurroundingQuotes()` in `vvaultApiClient.js` to remove literal quote characters from message content
  - Cleaned up debug logging code in `Chat.tsx` (removed leftover fetch calls to localhost:7242)
  - Vite configuration restored: Port 5000, host 0.0.0.0, API proxy to port 3000
  - **Pending**: VVAULT needs `/api/identity/{constructId}` endpoint to serve identity files for user-created GPTs like Katana
- **2026-01-20**: Identity loading architecture and Address Book
  - Identity loading priority: VVAULT API → Filesystem → System construct fallback
  - System constructs (Zen, Lin only): Have embedded fallback for resilience
  - User-created GPTs (including Katana): Load from VVAULT only, no embedded fallback
  - Address Book filtering: shows Zen (primary) + custom GPTs, excludes Lin (GPTCreator agent)
  - Key files:
    - `server/lib/identityLoader.js` - Identity loading with VVAULT API-first pattern
    - `src/components/Layout.tsx` - Address Book filtering logic
- **2026-01-19**: VVAULT API Integration (API-first architecture)
  - VVAULT API is now the canonical source for conversation transcripts
  - Priority: VVAULT API → Supabase (fallback only when API unavailable)
  - Key modules:
    - `vvaultConnector/vvaultApiClient.js` - API client for VVAULT endpoints
    - `vvaultConnector/supabaseStore.js` - Updated to use VVAULT API first
  - Markdown parser handles both VVAULT format ("You said:" / "Synth said:") and Chatty format
  - Construct deduplication implemented to prevent duplicate conversations
  - Environment: `VVAULT_API_BASE_URL` points to VVAULT deployment
- **2026-01-19**: Supabase integration for shared backend with VVAULT
  - Supabase is now the single source of truth for construct conversations
  - Conversations stored in `vault_files` table with file_type='conversation'
  - Filename convention: `chat/{constructId}/{sessionId}.md`
  - User resolution: Uses shard_0000 fallback for VVAULT sharding compatibility
  - PostgreSQL serves as ephemeral cache with async sync after Supabase writes
  - Key modules:
    - `server/lib/supabaseClient.js` - ES module Supabase client
    - `vvaultConnector/supabaseStore.js` - Read/write conversations to Supabase
  - All vvaultConnector modules converted to ES modules (import/export)
  - Supabase Realtime subscription enabled for live cross-app sync
- **2026-01-19**: PostgreSQL-backed VVAULT fallback for Replit environment
  - vvaultConnector/readConversations.js and writeTranscript.js use PostgreSQL as fallback
  - Tables: vvault_conversations, vvault_messages (auto-created via ensureTable())
  - ID normalization: frontend `zen-001_chat_with_zen-001` maps to DB `zen_<timestamp>` via constructId matching
  - Upsert with COALESCE preserves existing metadata while updating new fields
  - Safe user ID handling: never stores NULL user_id (falls back to email or 'unknown_user')
- **2026-01-19**: Implemented Canonical Zen Pattern in Layout.tsx
  - Zen appears immediately on login (system-guaranteed)
  - Added deletion protection for primary construct
  - VVAULT merge preserves canonical Zen

## User Preferences
- Primary construct: Zen (not Synth)
- Address Book: Zen (primary with blue pin) + custom GPTs like Katana (chat contacts)
- GPTCreator: Tool for creating/editing GPTs
- GPTCreator Create Tab: Lin (conversational agent users speak to when creating GPTs)
- Lin is also an undertone stabilizer that runs silently to stabilize other constructs
- Modal windows (Search, Projects) overlay main interface
