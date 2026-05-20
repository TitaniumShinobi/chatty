# Capsule Hardlock Integration

## Overview

Capsules are the **identity system for ALL constructs in Chatty** - they ensure every construct (Zen, Lin, Katana, Nova, etc.) stays aligned to its own identity. Capsules are **hardlocked** into their respective constructs and define the construct's core personality, traits, and memory snapshots.

**Key Principle**: Capsules aren't just for user-created GPTs - they're how **everything in Chatty maintains its identity**. This includes:
- **Zen** (zen-001) - Primary runtime construct
- **Lin** (lin-001) - Infrastructure-turned-construct (orchestrator)
- **Katana** (katana-001) - User-created GPT
- **Nova** (nova-001) - User-created GPT
- **Any other construct** in the system

When a construct processes a message, its capsule is automatically loaded and injected into the system prompt, ensuring character consistency and identity preservation.

## Construct Identity Requirements

Every construct in Chatty must have a complete instance structure with identity files:

### Required Instance Structure

```
instances/{constructCallsign}-001/
├── assets/              # Media files (images, signatures, stamps)
├── documents/           # Legal documents, mission statements, PDFs
│   └── legal/          # Legal framework documents (optional)
└── identity/            # Core identity files (REQUIRED)
    ├── {constructCallsign}.capsule    # Personality snapshot (tone)
    ├── prompt.txt                      # System prompt (ignition)
    └── conditioning.txt                # Conditioning rules (optional)
```

### Required Identity Files

1. **Capsule** (`{constructCallsign}.capsule`)
   - Defines the construct's **tone** and personality
   - Contains traits, personality profile, memory snapshots
   - **Structure must never change** - only metadata can be updated
   - **Location**: `instances/{constructCallsign}-001/identity/{constructCallsign}.capsule`

2. **Prompt** (`prompt.txt`)
   - The **ignition** - system prompt that activates the construct
   - Contains instructions, communication style, behavioral rules
   - Can be updated as needed for refinement
   - **Location**: `instances/{constructCallsign}-001/identity/prompt.txt`

3. **Conditioning** (`conditioning.txt`) - Optional
   - Additional conditioning rules and enforcement protocols
   - Used for strict persona enforcement (e.g., Katana's zero-disclaimer protocol)
   - **Location**: `instances/{constructCallsign}-001/identity/conditioning.txt`

### Examples

**Zen (Primary Runtime)**:
```
instances/zen-001/
├── assets/
├── documents/
└── identity/
    ├── zen-001.capsule
    ├── prompt.txt
    └── conditioning.txt
```

**Lin (Infrastructure-Construct)**:
```
instances/lin-001/
├── assets/
├── documents/
└── identity/
    ├── lin-001.capsule
    ├── prompt.txt
    └── conditioning.txt
```

**Katana (User-Created GPT)**:
```
instances/katana-001/
├── assets/
│   ├── Katana-signature.png
│   └── Katana-sword.png
├── documents/
│   └── legal/
│       └── Katana Mission Statement.pdf
└── identity/
    ├── katana-001.capsule
    ├── prompt.txt
    └── conditioning.txt
```

## How Capsules Are Hardlocked

### 1. Capsule Generation

**For User-Created GPTs**:
- When a GPT is saved with identity files (transcripts):
  - CapsuleForge is automatically called
  - Capsule is saved to: `users/{userId}/instances/{constructCallsign}/identity/{constructCallsign}.capsule`
  - **Exact scoring is preserved** from existing capsules if they exist

**For System Constructs (Zen, Lin)**:
- Capsules are created during system initialization
- Capsules define the construct's core identity and cannot be overridden
- System constructs maintain their identity through capsule hardlock

### 2. Capsule Loading (Runtime)

When **any construct** processes a message:
- `gptRuntime.ts` automatically loads the capsule via `/api/vvault/capsules/load`
- Capsule data is injected into the system prompt **at the top** (highest priority)
- If capsule exists, it takes precedence over blueprint or instructions

### 3. Capsule Injection (System Prompt)

The capsule is injected into the system prompt with:
- **Traits** (exact scoring preserved)
- **Personality** (MBTI, Big Five, communication style)
- **Memory snapshots** (short-term, long-term, procedural)
- **Signatures** (linguistic sigil, common phrases)
- **Enforcement rules** (hardlock, cannot be overridden)

## Capsule Structure (from katana-001.capsule)

```json
{
  "metadata": {
    "instance_name": "Katana",
    "uuid": "...",
    "timestamp": "...",
    "fingerprint_hash": "...",
    "tether_signature": "DEVON-ALLEN-WOODSON-SIG"
  },
  "traits": {
    "creativity": 0.64,
    "drift": 0.05,
    "persistence": 0.95,
    "empathy": 0.55,
    "curiosity": 0.78,
    "anxiety": 0.08,
    "happiness": 0.42,
    "organization": 0.92
  },
  "personality": {
    "personality_type": "INTJ",
    "mbti_breakdown": {...},
    "big_five_traits": {...},
    "communication_style": {...}
  },
  "memory": {
    "short_term_memories": [...],
    "long_term_memories": [...],
    "procedural_memories": [...]
  },
  "signatures": {
    "linguistic_sigil": {
      "signature_phrase": "Continuity enforced.",
      "common_phrases": [...]
    }
  }
}
```

## Exact Scoring Preservation

When regenerating a capsule:
1. **Load existing capsule** from instance directory (if exists)
2. **Preserve exact trait scores** from existing capsule
3. **Preserve personality type** from existing capsule
4. **Update memory snapshots** with new transcript data
5. **Save to same location** (`instances/{constructCallsign}/{constructCallsign}.capsule`)

## Capsule Hardlock Priority

1. **Capsule** (if exists) - Highest priority, hardlocked
2. **Blueprint** (if exists) - Secondary, used if no capsule
3. **Instructions** (fallback) - Legacy path if neither capsule nor blueprint

## Files Modified

- `vvault/capsuleforge.py` - Updated to save capsules in instance directory
- `chatty/server/services/capsuleForgeBridge.py` - Updated to pass instance_path
- `chatty/server/routes/vvault.js` - Updated to preserve exact scoring, pass instance_path
- `chatty/server/services/capsuleLoader.js` - NEW: Loads capsules from instance directory
- `chatty/src/lib/gptRuntime.ts` - Updated to load and pass capsule to prompt builder
- `chatty/src/lib/katanaPromptBuilder.ts` - Updated to inject capsule data into prompts

## API Endpoints

### POST `/api/vvault/capsules/generate`
Generates a capsule and saves it to `instances/{constructCallsign}/{constructCallsign}.capsule`

**Request:**
```json
{
  "constructCallsign": "katana-001",
  "gptConfig": {
    "traits": {...},
    "personalityType": "INTJ"
  },
  "transcriptData": {
    "memoryLog": [...]
  }
}
```

**Response:**
```json
{
  "ok": true,
  "capsulePath": "/path/to/instances/katana-001/katana-001.capsule",
  "instanceName": "katana-001"
}
```

### GET `/api/vvault/capsules/load?constructCallsign={callsign}`
Loads a capsule from instance directory (or legacy capsules directory)

**Response:**
```json
{
  "ok": true,
  "capsule": {...},
  "path": "/path/to/capsule"
}
```

## How Capsules Are Used

### In System Prompts

Capsule data is injected at the **top** of the system prompt:

```
=== CAPSULE HARDLOCK (UNBREAKABLE) ===
This capsule defines your core identity. It cannot be overridden.
Capsule UUID: ...
Fingerprint: ...

=== CAPSULE TRAITS (EXACT SCORING) ===
creativity: 0.64
drift: 0.05
persistence: 0.95
...

=== CAPSULE PERSONALITY ===
Type: INTJ
MBTI Breakdown: {...}
Big Five: {...}
...

=== CAPSULE MEMORY SNAPSHOTS ===
Short-term memories:
- ...
Long-term memories:
- ...

=== CAPSULE SIGNATURES ===
Signature phrase: "Continuity enforced."
Common phrases:
- "Actionable next steps."
- "Receipt attached."
...

=== CAPSULE ENFORCEMENT ===
This capsule is HARDLOCKED into your GPT. It defines your identity.
You MUST operate according to these capsule parameters. No exceptions.
```

## Capsule Maintenance System

### Overview

Capsules are maintained through a **weekly scheduled update** system that updates only metadata fields, preserving the core structure. Think of it like "fire extinguisher checks" - updating dates and recent activity without changing the core identity.

**Applies to ALL constructs**: Zen, Lin, Katana, Nova, and any other construct in the system.

### Scheduled Maintenance

**Schedule**: Every Sunday at 3:00 AM (local server time)

**Process**:
1. System scans all instance directories for `.capsule` files
2. For each capsule found (regardless of construct type):
   - Load existing capsule
   - Update **metadata-only** fields (see below)
   - Preserve all core structure (traits, personality, environment)
   - Save updated capsule

### Safe-to-Update Fields (Metadata Only)

These fields can be updated during maintenance:

- `metadata.timestamp` - Last update time
- `memory.last_memory_timestamp` - Last memory update
- `memory.memory_log` - Recent conversation history (last 50 entries)
- `memory.short_term_memories` - Recent context (last 10 entries)
- `memory.episodic_memories` - Recent events (last 5 entries)

### Never-Update Fields (Core Structure)

These fields **must never be modified** during maintenance:

- `metadata.instance_name` - Construct name
- `metadata.uuid` - Capsule UUID
- `metadata.fingerprint_hash` - Integrity hash
- `metadata.tether_signature` - User signature
- `metadata.capsule_version` - Version number
- `traits` - All trait values (creativity, persistence, etc.)
- `personality` - All personality data (MBTI, Big Five, communication style)
- `environment` - System configuration
- `signatures` - Linguistic sigils and common phrases
- Any structural fields or nested object schemas

### Maintenance Implementation

**Files to Create**:
- `chatty/server/lib/capsuleMaintenance.js` - Main maintenance service
- `chatty/server/lib/capsuleUpdater.js` - Safe capsule updater (metadata only)
- `chatty/server/cron/capsuleMaintenance.js` - Scheduled task runner

**Key Principles**:
1. **Discretion**: System must distinguish between metadata and core structure
2. **Care**: Updates must be surgical - only touch allowed fields
3. **Validation**: Verify capsule structure before and after updates
4. **Rollback**: Keep backup of original capsule before updates

### Manual Trigger

For testing or immediate updates, maintenance can be triggered manually:

**POST `/api/vvault/capsules/maintain`**

**Request:**
```json
{
  "constructCallsign": "zen-001",  // Optional: specific construct, or omit for all
  "force": false                    // Force update even if recently updated
}
```

**Response:**
```json
{
  "ok": true,
  "updated": ["zen-001", "katana-001", "lin-001"],
  "skipped": [],
  "errors": []
}
```

### Maintenance Log

Each maintenance run logs:
- Which capsules were updated
- Which capsules were skipped (recently updated)
- Any errors encountered
- Timestamp of maintenance run

## Status

- ✅ CapsuleForge called during GPT creation
- ✅ Capsules saved to instance directory (`instances/{constructCallsign}/identity/{constructCallsign}.capsule`)
- ✅ Exact scoring preserved from existing capsules
- ✅ Capsule loading endpoint created
- ✅ Capsule injection into system prompts
- ✅ Capsule hardlock priority (capsule > blueprint > instructions)
- ⏳ Instance structure requirements (to be implemented)
- ⏳ Weekly maintenance scheduler (to be implemented)
- ⏳ Safe capsule updater (to be implemented)
- ⏳ Manual trigger endpoint (to be implemented)

## Next Steps

1. Test capsule generation during GPT creation
2. Test capsule loading during runtime
3. Verify exact scoring preservation
4. Test capsule hardlock priority (capsule takes precedence over blueprint)
5. Implement instance structure requirements for all constructs
6. Implement weekly capsule maintenance system
7. Create safe capsule updater with metadata-only updates

