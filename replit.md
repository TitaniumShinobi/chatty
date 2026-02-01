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