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
- Address Book should always show Zen when authenticated
- Modal windows (Search, Projects) overlay main interface
