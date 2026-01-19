# Documentation Organization Plan

**Last Updated**: January 16, 2026

This document outlines the plan to organize root-level documentation files into appropriate subdirectories.

---

## Files Already Organized ✅

- `CHATTY_PRINCIPLES.md` → `architecture/CHATTY_PRINCIPLES.md` ✅
- All root-level documentation files organized (January 16, 2026) ✅

---

## Proposed Organization

### **architecture/** (Core architectural documents)
- `CHATTY_COMPREHENSIVE_SUMMARY.md` - System overview
- `LIN_ARCHITECTURE_FOUNDATION.md` - Lin architecture foundation
- `HOUSE_RULES_ZEN_LIN.md` - Zen/Lin house rules

### **implementation/** (Implementation guides)
- `LIN_ORCHESTRATION_IMPLEMENTATION_GUIDE.md` - Lin orchestration guide
- `LIN_ORCHESTRATION_DEEP_DIVE.md` - Deep dive into Lin orchestration
- `LIN_COPILOT_IMPLEMENTATION.md` - Lin copilot implementation
- `UNIFIED_LIN_ORCHESTRATION.md` - Unified Lin orchestration
- `CONSTRUCT_CALLSIGN_ENFORCEMENT.md` - Construct callsign enforcement
- `CREATE_VS_PREVIEW_IDENTITY.md` - Create vs preview identity
- `CHATTY_USER_DIRECTORY_STRUCTURE.md` - User directory structure
- `CAPSULE_HARDLOCK_INTEGRATION.md` - Capsule hardlock integration

### **guides/** (User and developer guides)
- `USER_ID_MIGRATION_GUIDE.md` - User ID migration guide
- `VVAULT_USER_ID_GENERATION.md` - VVAULT user ID generation
- `USER_REGISTRY_TROUBLESHOOTING.md` - User registry troubleshooting
- `HISTORY_MEMORY_TEST_RUNNER_USAGE.md` - History memory test runner
- `LIN_TEST_RUNNER_USAGE.md` - Lin test runner usage
- `LIN_TEST_RUNNER_QUICK_REFERENCE.md` - Lin test runner quick reference
- `LIN_TEST_RUNNER_BROWSER_USAGE.md` - Lin test runner browser usage
- `LIN_CONVERSATIONAL_TEST_ROADMAP.md` - Conversational test roadmap
- `INSTANCE_FOLDER_CLEANUP.md` - Instance folder cleanup

### **implementation/oauth/** (OAuth-specific implementation)
- `GOOGLE_OAUTH_SETUP.md` - Google OAuth setup
- `GOOGLE_OAUTH_FIX_PROMPT.md` - Google OAuth fix prompt
- `OAUTH_DATA_AVAILABILITY.md` - OAuth data availability
- `OAUTH_FIX_APPLIED.md` - OAuth fix applied
- `WHY_OAUTH_BROKE.md` - Why OAuth broke

### **memory/** (Memory system documentation)
- `MEMORY_MANAGEMENT_ANALYSIS_AND_OPTIMIZATION.md` - Memory management analysis
- `MEMORY_MANAGEMENT_OPTIMIZATIONS_IMPLEMENTED.md` - Memory optimizations
- `MEMUP_STATUS_AND_USAGE.md` - MEMUP status and usage

### **implementation/lin/** (Lin-specific implementation docs)
- `LIN_CONTEXTUAL_AWARENESS.md` - Lin contextual awareness
- `LIN_CONVERSATIONAL_ABILITY_ASSESSMENT.md` - Conversational ability assessment
- `LIN_CONVERSATIONAL_ABILITY_GRADE.md` - Conversational ability grade
- `LIN_IDENTITY_PROTECTION.md` - Lin identity protection
- `TIME_AWARENESS.md` - Time awareness

### **rubrics/** (Design rubrics)
- `TRANSCRIPT_PROTECTION_RUBRIC.md` - Transcript protection rubric

### **analysis/** (Analysis documents)
- `DOCUMENTATION_OVERLAP_ANALYSIS.md` - Documentation overlap analysis
- `PARALLEL_USER_REGISTRIES.md` - Parallel user registries

### **debugging/** (Debug guides)
- `DEBUG_BACKUPS.md` - Debug backups

### **specifications/** (Technical specifications)
- `APP_TSX_SPECIFICATION.md` - App.tsx specification

---

## Organization Strategy

1. **Group by Function**: Files grouped by their primary purpose (architecture, implementation, guides, etc.)
2. **Subdirectories for Large Groups**: Create subdirectories for large groups (e.g., `implementation/oauth/`, `implementation/lin/`)
3. **Keep Related Files Together**: Related files stay in the same directory
4. **Maintain README.md**: Update `docs/README.md` to reflect new organization

---

## Next Steps

1. Create subdirectories as needed (`implementation/oauth/`, `implementation/lin/`)
2. Move files to appropriate directories
3. Update `docs/README.md` with new structure
4. Update any cross-references in moved files
5. Commit changes

---

**This plan ensures better organization for both humans and LLMs, making documentation easier to find and navigate.**
