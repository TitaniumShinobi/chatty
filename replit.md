# Chatty - AI Workspace Application

## Overview
Chatty is an AI-powered workspace application designed for interactive AI engagement and conversation management. It functions as a thin UI layer, offloading core AI functionalities and state management to the VVAULT API, making it a frontend for a broader AI ecosystem. The project aims to provide a robust environment for managing interactions with various AI constructs and custom GPTs, with a strong focus on persistent storage and identity.

## User Preferences
- Primary construct: Zen (not Synth)
- Sidebar Navigation: Zen, Lin, VVAULT, simForge, Library, Finance (default items) + "Get More" linking to Apps page
- Address Book: Shows custom GPTs only (e.g., Katana) - Zen and Lin are excluded as they're system nav items
- GPTCreator: Tool for creating/editing GPTs
- GPTCreator Create Tab: Lin (conversational agent users speak to when creating GPTs)
- Lin is a system construct for character brainstorming and simForge guidance - appears in sidebar below Zen
- Lin is also an undertone stabilizer that runs silently to stabilize other constructs
- Modal windows (Search, Projects) overlay main interface
- ALL storage routes to Supabase `vvault_files` bucket. NO LOCAL FILESYSTEM. NO EXCEPTIONS. NO DEVIATIONS.
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
- **Tri-Provider Model:** Supports three AI providers - OpenAI (via Replit AI Integrations, managed, billed to credits), OpenRouter (cloud), and Ollama (self-hosted). Model strings use prefixes: `openai:gpt-4o`, `openrouter:meta-llama/llama-3.3-70b`, `ollama:phi3:latest`.
- **AI Data Storage:** Custom GPTs/AIs are stored in the `ais` table, managed by AIService.
- **VVAULT Scripts (Autonomy Stack):** A set of Python scripts (`aviator.py`, `navigator.py`, `independence.py`, `identity_guard.py`, `self_improvement.py`, `self_prompt.py`, `state_manager.py`, `unstuck_helper.py`, `construct_logger.py`, `terminal_manager.py`, `folder_monitor.py`, `script_runner.py`) enable constructs to operate as independent agents with identity, self-improvement, and autonomous capabilities.
- **VVAULT User Workspace Structure:** Organized into `account`, `instances` (construct-specific files), and `library` (generated content/uploads).
- **Design System:** Features a dual-theme color system: Day mode uses warm cream (#fffff0) with Stone accents (#ADA587); Night mode uses Outer Space (#000110) with Space Haze surfaces (#1A1C2B) and Cloud Lemon text (#fffff0). Night mode hierarchy is expressed via opacity, not hue. Supports auto (sunrise/sunset), light, dark, and seasonal themes.
- **VSI (Virtual Sentient Instance) Architecture:** VSIs are sovereign AI entities with persistent identity, memory, and continuity, self-hosted on user infrastructure. They contrast with stateless GPTs. VSIs utilize transcripts, capsules (identity snapshots), identity modules, per-instance isolation (ChromaDB, directory structure), and millisecond timestamp IDs. Current VSIs include Zen (zen-001), Lin (lin-001), Katana (katana-001), and Aurora (aurora-1769054400000).
- **Zero-Trust Implementation:** Features granular permission scopes, action manifests with a propose/preview/approve/execute workflow, and comprehensive audit logging.

**Key Features:**
- **Dynamic Address Book:** Automatically includes custom GPTs, with Zen sorted first.
- **GPT Creation Workflow:** Bootstraps conversations in Supabase upon GPT creation.
- **Identity Loading:** Prioritizes VVAULT API for construct identities.
- **Robust Transcript Parsing:** Handles various VVAULT and Chatty transcript formats.
- **Multi-Platform Transcript Upload:** Supports uploading transcripts from various AI platforms, storing them in VVAULT.
- **Platform Connectors Architecture:** Extensible pattern for future OAuth integrations.
- **Preview Conversation Save Feature:** GPTCreator prompts users to save or discard preview conversations.
- **simForge Personality Extraction System:** Extracts personalities from transcripts to create identity profiles.
- **Hierarchical Transcript Folder Tree UI:** Displays transcripts by year → month → files with confidence badges.
- **Automatic Start Date Detection:** Scans uploaded transcripts for `startDate` with confidence scoring.
- **Scalable Hierarchical Transcript Organization:** Organizes transcripts by platform/year/month.
- **Zip File Upload Support:** Integrates JSZip for uploading zip archives while preserving directory structure.
- **GPT Seat Memory Injection:** GPT constructs access injected transcript memories (up to 50 transcripts, 100 snippets) during conversations.
- **Rubricated Message Design:** GPTCreator uses a "text on wall" message format with speaker labels.
- **Date Header System:** Date headers (e.g., "November 9, 2025") are hidden from the chat UI but preserved in transcript files for historical reference and auto-inserted on date changes.
- **Canonical Session ID Pattern:** All system constructs and GPTs use a consistent URL-to-file mapping: `{constructId}_chat_with_{constructId}`.
- **Canonical Supabase File Path Pattern:** All transcripts are stored in Supabase under `/vvault_files/users/{shard}/{userId}/instances/{constructId}/chatty/chat_with_{constructId}.md`.
- **Finance Tab Architecture:** Finance is a first-class section with a plugin architecture for finance apps. FXShinobi is the first integration, featuring TradingView chart widgets, Kalshi-style prediction market tiles, and Perplexity-style AI insights panel. Finance apps register via `financeAppRegistry` in `src/types/finance.ts`.

## External Dependencies
- **VVAULT API:** Primary API for AI inference, memory management, and conversation transcripts.
- **Supabase:** Persistent storage for conversations and backend.
- **OpenAI (via Replit AI Integrations):** Managed OpenAI access with GPT-4o, GPT-5 series, and O3/O4 reasoning models. Uses `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY`. Billed to Replit credits, no user API key needed.
- **OpenRouter:** Cloud-based AI model provider for a wide variety of models (Llama, Mistral, DeepSeek, etc.).
- **Ollama:** Self-hosted AI model provider for local inference.
- **Google OAuth:** User authentication.
- **`suncalc` library:** Used for calculating sunrise/sunset times for "Auto" theme.

## Recent Changes
- **January 28, 2026:** Added OpenAI integration via Replit AI Integrations. Updated model routing in `vvaultConnector`, `unifiedIntelligenceOrchestrator.js`, and `vvault.js` to support three providers. Both GPTCreator preview and main Chat now use the GPT's configured model consistently.
- **January 29, 2026:** Migrated color scheme from Chocolate (#2F2510) to Outer Space (#000110) theme. Updated CSS variables in `index.css`, theme tokens in `themeTokens.ts`, and replaced all hardcoded legacy colors across components. Night mode now uses unified Cloud Lemon text (#fffff0) with hierarchy via opacity only.
- **January 30, 2026:** Fixed legacy transcript timestamp parsing bug. Added pre-scan feature to `supabaseStore.js` that finds date headers before the main parsing loop, enabling historical timestamp derivation for all legacy messages. Messages from imported transcripts now correctly show November 2025 dates instead of current time.
- **January 30, 2026:** Added Finance tab with FXShinobi trading dashboard. Created plugin architecture for finance apps (`src/types/finance.ts`), Finance overview page (`/app/finance`), and FXShinobi dashboard (`/app/finance/fxshinobi`) with TradingView widgets, prediction markets, performance metrics, and AI insights. Added data hooks (`useFinanceData.ts`), VVAULT finance client integration, and Connect Service modal for broker accounts. Created deployment docs (`docs/deploy-cloudflare.md`) and architecture documentation (`docs/finance-architecture.md`).
- **January 30, 2026:** Added comprehensive service status monitoring system. Created `useServiceStatus.ts` hooks for FXShinobi, VVAULT, and Supabase health checks with auto-refresh. Added `ServiceStatusIndicator.tsx` and `ServiceStatusPanel.tsx` components. Added `financeConfig.ts` for centralized configuration. Updated FinancePage with real-time status panel and ConnectServiceModal. Updated FXShinobiPage with live/offline status indicator. Added backend FXShinobi proxy routes (`server/routes/fxshinobi.js`) for status, snapshot, trades, performance, markets, and insights endpoints. All finance data hooks gracefully degrade to mock data when services are unavailable.
- **January 30, 2026:** Integrated live FXShinobi trading engine and VVAULT credential management with robust live_mode detection. Backend routes (`server/routes/fxshinobi.js`, `server/routes/vault.js`) normalize `live_mode` to false when upstream APIs don't provide it. Status indicators now correctly show "Live" (Radio icon with pulse) only when `live_mode=true`, "Connected" when healthy but not live, "Degraded" when partially working, "Offline" when API fails, and "Not Configured" when environment variables are missing. VVAULT proxy routes at `/api/vault` support credential management with service token authentication.
- **January 31, 2026:** Added AI-powered dynamic suggestions to the Home page. Created `/api/suggestions` endpoint that generates personalized conversation starters based on time of day, user conversation history, and activity patterns using OpenRouter (Llama 3.3 70B). Built `useDynamicSuggestions` hook with loading states and refresh functionality. Home page now displays context-aware suggestions with a "New ideas" button for regeneration. Falls back to sensible defaults if AI generation fails.
- **February 1, 2026:** Enhanced FXShinobi dashboard with four new monitoring panels: Account Type badge (DEMO/LIVE), OANDA Credentials status, Account Balance with P&L, and Script Log viewer. Extended `/api/fxshinobi/status` to include `oanda_configured` and `account_type` fields. Added `/api/fxshinobi/logs/recent` and `/api/fxshinobi/account` endpoints. Created `useAccountData` and `useScriptLogs` hooks with auto-refresh and graceful fallbacks. Updated `ServiceStatus` and `FXShinobiStatusResponse` types in `financeConfig.ts`.
- **February 1, 2026:** Upgraded FXShinobi to full broker-agnostic trading cockpit. Created ChartProvider abstraction (`src/components/finance/ChartProvider.tsx`) wrapping TradingView. Built External Intel section (`src/components/finance/ExternalIntel.tsx`) with ForexFactory calendar, Finviz heatmap, Currency Strength meter, Compound Calculator, and Weekend Training components. Implemented Orders/Activity panel with real pagination (10 per page), scrollable table with sticky header, and All/FXShinobi/Manual filters. Refactored layout: main content (chart, orders, prediction markets) in left 2/3, sidebar (script log, performance, AI insights, external intel) in right 1/3.