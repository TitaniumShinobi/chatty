# Capsule Hardlock Integration

## Overview

Capsules are now **hardlocked** into their respective GPTs. When a GPT is created with transcripts uploaded, a capsule is automatically generated and saved directly in the instance directory (`instances/{constructCallsign}/{constructCallsign}.capsule`). This capsule is then loaded and injected into every system prompt, ensuring character consistency.

## How Capsules Are Hardlocked

### 1. Capsule Generation (GPT Creation)

When a GPT is saved with identity files (transcripts):
- CapsuleForge is automatically called
- Capsule is saved to: `users/{userId}/instances/{constructCallsign}/{constructCallsign}.capsule`
- **Exact scoring is preserved** from existing capsules if they exist

### 2. Capsule Loading (Runtime)

When a GPT processes a message:
- `gptRuntime.ts` automatically loads the capsule via `/api/vvault/capsules/load`
- Capsule data is injected into the system prompt **at the top** (highest priority)
- If capsule exists, it takes precedence over blueprint

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

## Status

- ✅ CapsuleForge called during GPT creation
- ✅ Capsules saved to instance directory (`instances/{constructCallsign}/{constructCallsign}.capsule`)
- ✅ Exact scoring preserved from existing capsules
- ✅ Capsule loading endpoint created
- ✅ Capsule injection into system prompts
- ✅ Capsule hardlock priority (capsule > blueprint > instructions)

## Next Steps

1. Test capsule generation during GPT creation
2. Test capsule loading during runtime
3. Verify exact scoring preservation
4. Test capsule hardlock priority (capsule takes precedence over blueprint)

