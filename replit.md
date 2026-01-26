# Chatty - AI Workspace Application

## Overview
Chatty is an AI-powered workspace application designed for interactive AI engagement and conversation management. It functions as a thin UI layer, offloading core AI functionalities and state management to the VVAULT API, making it a frontend for a broader AI ecosystem. The project aims to provide a robust environment for managing interactions with various AI constructs and custom GPTs, with a strong focus on persistent storage and identity.

## User Preferences
- Primary construct: Zen (not Synth)
- Sidebar Navigation: Zen, Lin, VVAULT, simForge, Library (default items) + "Get More" linking to Apps page
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
- **Dual-Provider Model:** Supports both cloud (OpenRouter) and self-hosted (Ollama) AI models.
- **AI Data Storage:** Custom GPTs/AIs are stored in the `ais` table, managed by AIService.
- **VVAULT Scripts (Autonomy Stack):** A set of Python scripts (`aviator.py`, `navigator.py`, `independence.py`, `identity_guard.py`, `self_improvement.py`, `self_prompt.py`, `state_manager.py`, `unstuck_helper.py`, `construct_logger.py`, `terminal_manager.py`, `folder_monitor.py`, `script_runner.py`) enable constructs to operate as independent agents with identity, self-improvement, and autonomous capabilities.
- **VVAULT User Workspace Structure:** Organized into `account`, `instances` (construct-specific files), and `library` (generated content/uploads).
- **Design System:** Features a warm, organic color palette with Chocolate (#2F2510) and Stone (#ADA587), supporting auto, light, dark, and seasonal themes.
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

## External Dependencies
- **VVAULT API:** Primary API for AI inference, memory management, and conversation transcripts.
- **Supabase:** Persistent storage for conversations and backend.
- **OpenRouter:** Cloud-based AI model provider.
- **Ollama:** Self-hosted AI model provider.
- **Google OAuth:** User authentication.
- **`suncalc` library:** Used for calculating sunrise/sunset times for "Auto" theme.