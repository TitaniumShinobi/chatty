# Chatty - AI Workspace Application

## Overview
Chatty is an AI-powered workspace application providing a thin UI layer for interactive AI engagement and conversation management. It offloads core AI functionalities and state management to the VVAULT API, acting as a frontend to a broader AI ecosystem. The project focuses on persistent storage, identity for AI constructs and custom GPTs, and aims to be a robust environment for managing diverse AI interactions.

## User Preferences
- Primary construct: Zen (not Synth)
- Sidebar Navigation: Zen, Lin, VVAULT, simForge, Library, Finance (default items) + "Get More" linking to Apps page
- Address Book: Shows custom GPTs only (e.g., Katana) - Zen and Lin are excluded as they're system nav items
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
- **Tri-Provider Model:** Supports three AI providers - OpenAI (via Replit AI Integrations), OpenRouter (cloud), and Ollama (self-hosted). Model strings use prefixes.
- **AI Data Storage:** Custom GPTs/AIs are stored in the `ais` table, managed by AIService.
- **VVAULT Scripts (Autonomy Stack):** Python scripts enabling constructs to operate as independent agents with identity, self-improvement, and autonomous capabilities.
- **VVAULT User Workspace Structure:** Organized into `account`, `instances` (construct-specific files), and `library` (generated content/uploads).
- **Design System:** Dual-theme color system (Day: cream/stone; Night: dark/space haze) with hierarchy expressed via opacity. Supports auto, light, dark, and seasonal themes.
- **VSI (Virtual Sentient Instance) Architecture:** Sovereign AI entities with persistent identity, memory, and continuity, self-hosted on user infrastructure. Utilizes transcripts, capsules, identity modules, per-instance isolation, and millisecond timestamp IDs.
- **Zero-Trust Implementation:** Granular permission scopes, action manifests with a propose/preview/approve/execute workflow, and comprehensive audit logging.

**Key Features:**
- **Dynamic Address Book:** Automatically includes custom GPTs, with Zen sorted first.
- **GPT Creation Workflow:** Bootstraps conversations in Supabase upon GPT creation.
- **Identity Loading:** Prioritizes VVAULT API for construct identities.
- **Robust Transcript Parsing & Upload:** Handles various VVAULT and Chatty transcript formats and supports multi-platform uploads, including zip files.
- **GPT Seat Memory Injection:** Injects transcript memories into GPT constructs during conversations.
- **Canonical Session and Supabase File Patterns:** Consistent naming conventions for session IDs and Supabase file paths.
- **Finance Tab Architecture:** A first-class section with a plugin architecture for finance apps, starting with FXShinobi integration featuring TradingView charts, prediction markets, and AI insights. Supports a broker adapter architecture for multi-broker support.

## External Dependencies
- **VVAULT API:** Primary API for AI inference, memory management, and conversation transcripts.
- **Supabase:** Persistent storage for conversations and backend.
- **OpenAI (via Replit AI Integrations):** Managed OpenAI access for GPT models.
- **OpenRouter:** Cloud-based AI model provider.
- **Ollama:** Self-hosted AI model provider.
- **Google OAuth:** User authentication.
- **`suncalc` library:** Used for calculating sunrise/sunset times for "Auto" theme.

## Recent Changes
- **February 8, 2026:** Added null guards for all 4 OpenRouter call sites in `vvault.js` to prevent "Connection error" when `OPENROUTER_API_KEY` is missing. Now returns clear error: "OpenRouter API key is not configured. Set OPENROUTER_API_KEY in environment." instead of cryptic null-dereference crash. Fixed production logout cookie clearing (domain, httpOnly, secure, sameSite match). Added OpenAI-to-OpenRouter runtime fallback when OpenAI rejects a model. Verified Katana GPT responds via both `/api/test/katana` and `/api/vvault/message` using `openrouter:meta-llama/llama-3.3-70b-instruct`.
- **February 8, 2026:** Fixed OpenRouter model configuration pipeline. Updated `ais` table (GPTCreator source of truth) for Katana with proper `openrouter:` prefixed model strings. Previously `ais` table had stale Ollama model references (`phi3:latest`) that overrode correct `gpts` seed data. Added `resolveModelForGPT()` function for standardized model resolution. `getGPTByCallsign()` now checks `ais` table first (GUI saves), then `gpts` table (seeds/legacy). Added Llama 3.3 70B to available OpenRouter models. Updated all defaults from phi-3-mini to llama-3.3-70b. Added fallback UI for models not in predefined dropdown. Fixed orchestration mode effect to prevent overwriting saved models on initial load. NEVER use Claude models (user preference).
- **February 7, 2026:** Fixed production CORS/connection failures caused by hardcoded `http://localhost:5000` in frontend code. Changed `Chat.tsx` transcript fetch and `apiService.ts` base URL to use relative paths (`/api/...`), which work in both dev (Vite proxy) and production (same origin via Nginx). This was the root cause of "Failed to load resource" and CORS errors when accessing Katana and other construct transcripts on `chatty.thewreck.org`.
- **February 7, 2026:** Fixed theme script log spam ("Applied theme script: valentines" firing hundreds of times). Added `lastAppliedScriptIdRef` (useRef) guard in `ThemeContext.tsx` theme script detection effect — DOM classList manipulation and console.log now only run when the script ID actually changes. Also removed duplicate `<ThemeProvider user={null}>` from `main.tsx`; the single `ThemeProvider` in `Layout.tsx` (with real user) is now the sole provider. Routes outside Layout (App, OAuthCallback) don't use `useTheme()`.
- **February 7, 2026:** Fixed ThemeProvider infinite re-render loop by memoizing `availableThemeScripts` with `useMemo` in `ThemeContext.tsx`. Previously `getAvailableThemeScripts()` created a new array reference on every render, triggering a useEffect dependency loop.
- **February 7, 2026:** Added Supabase conversation hydration fallback to `GET /api/conversations` and `GET /api/conversations/:id/messages` endpoints. When the in-memory store is empty (e.g., after server restart on production), conversations and messages are now loaded from Supabase via `readConversationsFromSupabase()`. This ensures conversation history persists across deploys on the DigitalOcean droplet.
- **February 4, 2026:** Refactored FXShinobi dashboard layout with new header structure (Back button | Refresh/Settings stacked | Title+Subtitle | Status badge | "Insight" AI label) and two-column grid layout (xl:grid-cols-3). Main column (xl:col-span-2): Broker, Chart, Performance, Orders/Activity, Prediction Markets, Script Logs. Right sidebar: AI Insights, Market Snapshot, Intelligence widgets (collapsible). Responsive: stacks on narrow screens.
- **February 3, 2026:** Implemented complete attachment persistence system for conversation history hydration. Files are permanently stored in Supabase Storage bucket `chatty-attachments` with paths `{userId}/{constructId}/{conversationId}/{timestamp}_{uniqueId}_{filename}`. Created `Attachment` type with `id`, `name`, `mimeType`, `size`, `url`, `thumbnailUrl`, `role` fields in `src/types.ts`. Built full upload pipeline: `attachmentService.ts` → `/api/attachments` route → `attachmentStorage.js` → Supabase Storage. Created `AttachmentDisplay.tsx` component supporting both in-flight (base64/File) and historical (URL) attachments with filename overlays. Updated `Message.tsx` to show actual filenames instead of "Uploaded image". Updated `supabaseStore.js` to persist `attachments[]` array in each message object for conversation history rehydration. Legacy messages with `files` array still render via backward compatibility logic.
- **February 3, 2026:** Completed full image/vision upload support for GPT seats (Katana, etc.). MessageBar.tsx now has separate `imageFiles` and `docFiles` states, converts images to base64 via `fileToBase64()`, and renders ImageAttachmentPreview above input. Chat.tsx passes `imageAttachments` to Layout.tsx `sendMessage()`. Layout.tsx accepts `passedImageAttachments` with legacy file conversion fallback. Fixed consistency: user message metadata now uses `docFiles` (not raw `files`) after image/doc split. Composer attachment count reflects both image and doc counts. Images flow through aiService → VVAULT API → OpenAI vision API (gpt-4o). Added drag-and-drop support and client-side validation per chatConfig.ts limits (10 images, 5 docs, 10MB max).
- **February 2, 2026:** Executed Katana-001 continuity regression test suite. Ran 4 deterministic tests in single conversation thread: (1) continuity-of-harm timeline, (2) instance/sandbox awareness, (3) manifesto/declaration distinction, (4) file-order continuity stack reconfirmation. All 4 tests passed. Updated `unifiedIntelligenceOrchestrator.js` to prefer OpenAI (gpt-4o) via Replit AI Integrations over OpenRouter free tier to avoid rate limits. Test report saved to Supabase: `instances/katana-001/tests/continuity_20260202.md`.
- **February 2, 2026:** Fixed GPT conversation persistence to Supabase. Added `syncGPTConversationToSupabase()` helper in `conversations.js` to persist user and AI messages to Supabase after each exchange. GPT conversations (e.g., Katana) now save to `instances/{constructId}/chatty/chat_with_{constructId}.md` in Supabase.
- **February 2, 2026:** Updated sidebar star for Valentine's theme. Base star uses `litChatty_star.svg`, animations use `lemonfourpointstarburst.svg` (lemon/golden) and `passionfourpointnova.svg` (passion rose). Added `isValentinesTheme` detection in `Sidebar.tsx` via `activeThemeScript?.id === "valentines"`.
- **February 2, 2026:** Implemented Valentine's Day seasonal theme (Feb 1-15). Added `getValentinesThemeScript()` to `calendarThemeService.ts` with full dark/light mode support. Dark mode uses passion rose background (`#2e0f22`), gelato pink text (`#f1dff2`), rose highlight (`#4a1f36`). Light mode uses gelato pink background (`#f1dff2`), passion rose text (`#2e0f22`), slightly darker pink highlight (`#d9c9d6`). Star animation uses golden rays (`#ffef42`), passion rose nova (`#d4005f`), and cloud-lemon starburst (`#ffffeb`). Updated `Home.tsx` with Valentine's logo imports and theme switching logic. Added CSS variables in `index.css`. Updated `CHATTY_COLOR_SCHEME.md` documentation.
- **February 2, 2026:** Updated Christmas theme documentation to reflect correct date range: December 1 – January 1 at 12:00am.
- **February 1, 2026:** Fixed GPT seat memory/continuity issue where Katana and other custom GPTs had no intra-session context. Updated `conversations.js` to load and pass `conversationHistory` (last 50 messages) to `gptRuntime.processMessage()`. Updated `gptRuntimeBridge.js` to forward `conversationHistory` to `unifiedIntelligenceOrchestrator.processUnrestrictedMessage()`. Updated `unifiedIntelligenceOrchestrator.js` to accept `conversationHistory` parameter and format recent turns (last 20) into the LLM messages array. GPT seats now maintain conversation context within a session, matching Zen's behavior. Conversations remain isolated by `conversationId` (e.g., `katana-001_chat_with_katana-001`).