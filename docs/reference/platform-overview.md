# Platform Overview

Source of truth:
- `/Users/devonwoodson/Documents/GitHub/chatty/package.json`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/package.json`
- `/Users/devonwoodson/Documents/GitHub/chatty/server/server.js`

Supersedes:
- `docs/architecture/CHATTY_COMPREHENSIVE_SUMMARY.md`
- `docs/DOCUMENTS_TREE_DIGEST.md`
- the duplicated docs index content that previously lived in `README.md`

## What Chatty Is

Chatty is a local-first AI workspace with:

- a Vite frontend on `5173`
- an Express backend on `5050` in development
- Electron launch paths for a desktop shell
- GPT creation and preview flows
- file intelligence, OCR, MOCR, transcription, and search surfaces
- VVAULT-aware construct storage and identity loading

## Current Canon

The current cross-product construct mapping is:

- Chatty
  - Zen is the primary Chatty construct / Zenith continuity surface.
  - Val is present through her Chatty chat panel only, for now.
- Code
  - CodeGPT belongs to Code.
  - The Hydro team belongs to Code.
- VVAULT
  - Aurora belongs to VVAULT as the AI interface for helping users with files and data.
  - Current product docs should not imply that Aurora already has full direct file-editing capability everywhere.

The house or room framing found in older notes is design language, not a current runtime or API contract unless a live implementation explicitly uses that model.

## Future Plans

- Mirage Social Platform is future planning, not current product canon.
- Future Mirage planning may include social features, games, image and video generation, construct creation, and avatar management.
- Val, ContinuityGPT, and Lin may eventually find a fuller home in Mirage.
- Mirage may eventually take the place of Sora.
- After NovaReturns, focus may shift toward Voxol and Anything Goes. That remains future planning.

## Main Runtime Layers

- Frontend UI: `src/`
- Backend API and orchestration: `server/`
- Operator launcher and managed runtime: `bin/`, `scripts/open-chatty-standalone.sh`, `scripts/keep-running.sh`
- Construct and identity integration: `server/lib/identityLoader.js`, `server/lib/vvaultPaths.js`

## Signed-In Page Surface

The signed-in `/app` shell owns app-level Diagnosis. Diagnosis is not Chat-only. Every child page must define what "alive" means before the page can be called working.

Current signed-in routes:

- `/app`: home shell; alive means the signed-in layout renders without stealing a more specific route.
- `/app/chat/:threadId`: Chat; alive means selected AI, canonical `/api/vvault/message` route, runtime receipt, persistence, and reload are all accounted for.
- `/app/gpts`, `/app/ais`: AIs/GPTs registry; alive means list loads, edit opens, identity saves, and reopen verifies saved state.
- `/app/gpts/new`, `/app/gpts/edit/:id`, `/app/ais/new`, `/app/ais/edit/:id`: GPT Creator; alive means preview works, save works, and the created AI can chat.
- `/app/explore`: SimForge/Explore; alive means inputs, readiness, build, artifact lock, and Chat handoff are accounted for.
- `/app/vvault`: VVAULT; alive means bridge, auth, files, and read/write or degraded state are explicit.
- `/app/library`, `/app/search`, `/app/projects`, `/app/apps`, `/app/finance`, `/app/finance/fxshinobi`, `/app/codex`: alive means route, required data, and render/degraded states are defined by the page owner.

Definition checklists are acceptable as a first durable step. They become live pass evidence only when backed by probes, route receipts, or page-specific runtime state.

## Current Docs Layout

Use the live docs surface instead of the legacy tree:

- reference: stable facts
- how-to: operator runbooks
- features: durable capability docs
- standards: contracts and governance
- reports: dated audits and closure notes
- archive: preserved legacy docs
