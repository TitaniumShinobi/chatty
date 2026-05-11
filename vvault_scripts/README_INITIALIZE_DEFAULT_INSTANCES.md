# Initialize Default Instances

> Status: dangerous residue / misleading surface
>
> This file preserves historical default-instance bootstrap assumptions. It is **not** the current orchestration owner, construct-quality route, or storage canon for Chatty.
>
> Current orchestration canon lives in:
> - [docs/standards/orchestration-canon-rubric.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-canon-rubric.md)
> - [docs/standards/orchestration-surface-inventory.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-surface-inventory.md)
> - [docs/standards/orchestration-runtime-checklist.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/orchestration-runtime-checklist.md)
> - [docs/reference/constructs-and-lin.md](/Users/devonwoodson/Documents/GitHub/chatty/docs/reference/constructs-and-lin.md)
>
> Historical note: the auto-wiring claim below should be treated as continuity evidence unless it is re-proven in live code.

## Historical Overview

This script automatically creates `zen-001` and `lin-001` instances with complete identity files for new user accounts. It ensures every new user gets properly configured default constructs with:

- **prompt.txt** - System prompt (ignition)
- **conditioning.txt** - Identity enforcement rules
- **{construct}.capsule** - Personality snapshot generated via CapsuleForge

## Historical Bundle Shape

### zen-001 (Primary Construct)
- **Location**: `users/{shard}/{user_id}/instances/zen-001/`
- **Identity Files**:
  - `identity/prompt.txt` - Zen's multi-model synthesis identity
  - `identity/conditioning.txt` - Identity enforcement rules
  - `identity/zen-001.capsule` - Generated capsule with traits and personality

### lin-001 (GPT Creator Assistant)
- **Location**: `users/{shard}/{user_id}/instances/lin-001/`
- **Identity Files**:
  - `identity/prompt.txt` - Lin's continuity guardian identity
  - `identity/conditioning.txt` - Identity enforcement rules
  - `identity/lin-001.capsule` - Generated capsule with traits and personality

## Historical Integration Claim

The script is **automatically called** when a new VVAULT user profile is created via `resolveVVAULTUserId()` in `chatty/vvaultConnector/writeTranscript 3.js`.

**Flow**:
1. User signs up/logs in to Chatty
2. `resolveVVAULTUserId()` is called with `autoCreate=true`
3. If user doesn't exist, `createVVAULTUserProfile()` creates the profile
4. `initializeDefaultInstances()` is automatically called
5. zen-001 and lin-001 instances are created with all identity files

## Manual Usage

You can also run the script manually:

```bash
python3 vvault/scripts/initialize_default_instances.py <vvault_user_id> [vault_path]
```

**Example**:
```bash
python3 vvault/scripts/initialize_default_instances.py devon_woodson_1762969514958
```

## Requirements

- Python 3.6+
- CapsuleForge module (from `vvault/capsuleforge.py`)
- VVAULT directory structure

## Error Handling

- If initialization fails, it logs a warning but **does not fail user creation**
- User profile is still created successfully
- Instances can be initialized later manually if needed

## Identity File Templates

The script uses identity templates that must stay aligned with Chatty's live Three I seat canon:

- **Zen**: Primary Zen / Zenith construct. It may route through Lin's Three I seats, but it is not a model bundle.
- **Lin**: Continuity guardian construct (infrastructure-born orchestrator)

The runtime seat canon is Intelligence/Qwen2.5-Coder, Ingenuity/Mistral, and Interaction/Phi3, with Qwen3-Coder as an upgrade target once intentionally pulled. DeepSeek is not the Lin Intelligence default or fallback. See `/Users/devonwoodson/Documents/GitHub/chatty/docs/standards/lin-three-i-seat-canon.md`.
