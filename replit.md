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
- **Fixed Critical Routing Bug:** Resolved blank screens on nested routes (`/app/explore`, `/app/gpts`) caused by undefined `selectedAI` variable in GPTCreator.tsx. The error crashed the component tree - replaced with `initialConfig` prop.
- **Multi-Platform Transcript Upload:** Added source selection dropdown (ChatGPT, Gemini, Grok, Copilot, Claude) for transcript uploads with VVAULT path structure: `.../{constructId}/{source}/{filename}`
- **Platform Connectors Architecture:** Created extensible BaseConnector pattern and ConvaiConnector implementation for future OAuth integrations.

## External Dependencies
- **VVAULT API:** Primary API for AI inference, memory management, and conversation transcripts.
- **Supabase:** Used for persistent storage of conversations and as a shared backend with VVAULT.
- **OpenRouter:** Cloud-based AI model provider (accessed via Replit AI Integration).
- **Ollama:** Self-hosted AI model provider.
- **Google OAuth:** For user authentication.
- **`suncalc` library:** Used for calculating sunrise/sunset times for the "Auto" theme feature.