# Inventory

This file preserves the pre-cleanup overload snapshot and the final live-surface result.

## Current Live Surface

- top-level live sections: `README`, `reference`, `how-to`, `features`, `standards`, `reports`, `security`, `legal`, `prompts`, `assets`, `archive`
- live section file counts:
  - `docs/reference`: 7 entries
  - `docs/how-to`: 5 entries
  - `docs/features`: 7 entries
  - `docs/standards`: 4 entries
  - `docs/reports`: 2 entries
  - `docs/security`: 3 entries
  - `docs/legal`: 6 entries
  - `docs/prompts`: 1 entry

Legacy folders and root files from the overloaded tree were moved under `docs/archive/legacy/`.

## Pre-Cleanup Folder Pressure

- `docs/guides`: 69 files
- `docs/architecture`: 30 files
- `docs/implementation`: 29 files
- `docs/styling`: 25 files
- `docs/rubrics`: 22 files
- `docs/features`: 9 files
- `docs/debugging`: 8 files
- `docs/security`: 3 files
- `docs/legal`: 6 files

## Pre-Cleanup Top-Level Drift

Root-level files still mix canonical references, reports, setup notes, and one-off investigations:

- `docs/MODEL_PROVIDERS.md`
- `docs/CHATTY_STARTUP_CONTRACT.md`
- `docs/OAUTH_SETUP.md`
- `docs/DOCUMENTATION_ORGANIZATION_PLAN.md`
- `docs/DOCUMENTS_TREE_DIGEST.md`
- `docs/VVAULT_TRANSFER_AUDIT.md`
- `docs/commits.md`
- `docs/context-gap-analysis.md`
- `docs/verification-dictate-mic-transcription.md`
- `docs/voice-mode-verification.md`

## Pre-Cleanup Exact Duplicate Pairs

- `docs/architecture/CLI_WEB_ARCHITECTURE.md` and `docs/guides/CLI_WEB_ARCHITECTURE.md`
- `docs/features/LARGE_FILE_INTELLIGENCE.md` and `docs/guides/LARGE_FILE_INTELLIGENCE.md`
- `docs/features/MOCR_NATIVE_INTEGRATION.md` and `docs/guides/MOCR_NATIVE_INTEGRATION.md`
- `docs/debugging/MODAL_BYPASS_STRATEGY.md` and `docs/guides/MODAL_BYPASS_STRATEGY.md`
- `docs/infrastructure/TUNNEL_INFO.md` and `docs/guides/TUNNEL_INFO.md`

## Pre-Cleanup Near-Duplicate Clusters

- OAuth and auth setup: `docs/OAUTH_SETUP.md`, `docs/implementation/oauth/*`, `docs/guides/AUTHENTICATION_SETUP_GUIDE.md`, `docs/rubrics/GOOGLE OAUTH MASTER TEMPLATE.md`, `docs/guides/GOOGLE_OAUTH_MASTER_TEMPLATE.md`
- Profile photo: `docs/guides/PROFILE_PHOTO_IMPLEMENTATION.md`, `docs/implementation/PROFILE_PHOTO_IMPLEMENTATION.md`, `docs/guides/PROFILE_PICTURE_DEBUG_REPORT.md`, `docs/guides/PROFILE_PICTURE_ENHANCEMENT_GUIDE.md`
- OCR/MOCR: `docs/features/OCR_INTEGRATION_PLAN.md`, `docs/guides/OCR_INTEGRATION_PLAN.md`, `docs/guides/OCR_IMPLEMENTATION_SUMMARY.md`, `docs/features/MOCR_NATIVE_INTEGRATION.md`, `docs/guides/MOCR_IMPLEMENTATION_SUMMARY.md`
- Lin: `docs/README_LIN.md`, `docs/architecture/LIN_ARCHITECTURE.md`, `docs/implementation/LIN_ORCHESTRATION_IMPLEMENTATION_GUIDE.md`, `docs/implementation/UNIFIED_LIN_ORCHESTRATION.md`, `docs/guides/LIN_ORCHESTRATION_COMPLETION_REPORT.md`
- VVAULT/storage: `docs/architecture/*VVAULT*`, `docs/features/VVAULT_COMPLETE_GUIDE.md`, `docs/guides/VVAULT_TROUBLESHOOTING_GUIDE.md`, `docs/rubrics/CHATTY_VVAULT_TRANSCRIPT_SAVING_RUBRIC.md`

## Pre-Cleanup Misclassified Files

- `docs/guides/REPORT.md` is a report, not a guide
- `docs/guides/ENVIRONMENT_AUDIT_REPORT.md` and `docs/guides/PERFORMANCE_AUDIT_REPORT.md` are reports, not guides
- `docs/guides/CHATGPT_MY_GPTs_PAGE_REDESIGN_PROMPT.md` belongs under prompts
- `docs/guides/BUSINESS_PLAN_OUTLINE.md` is planning material, not a guide
- `docs/styling/MODAL_TEMPLATE.tsx` is source code, not documentation
- `docs/rubrics/GOOGLE OAUTH MASTER TEMPLATE.md` is a template, not a rubric
