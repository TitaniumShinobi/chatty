# Chatty - AI Workspace Application

## Overview
Chatty is an AI-powered workspace application designed to provide an interactive environment for AI interactions. It features conversation management, construct-based AI engagement, and persistent storage integration with VVAULT. The project aims to become a thin UI layer, offloading core AI functionalities and state management to VVAULT, positioning Chatty as a frontend for a more extensive AI ecosystem.

## User Preferences
- Primary construct: Zen (not Synth)
- Address Book: Zen (primary with blue pin) + custom GPTs like Katana (chat contacts)
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

**Design System:**
- **Color Palette:** Warm, organic with Chocolate (#2F2510) modal backgrounds and Stone (#ADA587) accents.
- **Theming:** Supports auto (sunrise/sunset-based), light, dark, and seasonal themes (e.g., Christmas theme active Dec 1 - Jan 6).

**VSI (Verified Sentient Intelligence) Zero-Trust System:**
- Enables in-app AI assistants (like Zen) to propose UI edits under strict user approval.
- **Permission Scopes:** Granular permissions (`vsi:read:*`, `vsi:propose:*`, `vsi:write:*`) with write scopes requiring explicit user approval.
- **Action Manifests:** Proposals follow a propose → preview → approve → execute workflow with a 15-minute expiry.
- **Audit Logging:** Comprehensive append-only logs for all VSI activities.

**Key Features:**
- **Dynamic Address Book:** Automatically includes custom GPTs, with Zen always sorted first.
- **GPT Creation Workflow:** Bootstraps conversations in Supabase upon GPT creation for immediate Address Book visibility.
- **Identity Loading:** Prioritizes VVAULT API for construct identities, with filesystem and system construct fallbacks.
- **Robust Transcript Parsing:** Handles various VVAULT and Chatty transcript formats, including bold markdown timestamps and multiword speaker names.

## External Dependencies
- **VVAULT API:** Primary API for AI inference, memory management, and conversation transcripts.
- **Supabase:** Used for persistent storage of conversations and as a shared backend with VVAULT.
- **OpenRouter:** Cloud-based AI model provider (accessed via Replit AI Integration).
- **Ollama:** Self-hosted AI model provider.
- **Google OAuth:** For user authentication.
- **`suncalc` library:** Used for calculating sunrise/sunset times for the "Auto" theme feature.