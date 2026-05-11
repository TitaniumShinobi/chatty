# PersonaRouter: Drift Detection and Routing

PersonaRouter is a core component that routes user input through Lin's undertone capsule when tone drift or construct instability is detected. It's always active in the background (latent observer) to maintain persona consistency.

## Architecture

```
User Input
    ↓
PersonaRouter (detects drift, routes to lin-001)
    ↓
Memory Retrieval Engine (queries memory sources)
    ↓
Context Scoring Layer (scores by weighted metrics)
    ↓
Prompt Constructor (builds final prompt with top memories)
```

## Core Functionality

### Always Active (Mandatory Layer)

By default, PersonaRouter is **always active**. Lin's undertone capsule is a mandatory layer that's always injected into prompts, regardless of drift detection.

```typescript
const personaRouter = getPersonaRouter({
  alwaysActive: true, // Default: true
  driftThreshold: 0.15, // 15% drift triggers additional Lin injection
  enableDebug: false
});
```

### Drift Detection

PersonaRouter uses existing drift detection systems:

1. **DriftGuard**: Real-time drift detection in construct responses
   - Identity score
   - Tone score
   - Boundary violations
   - Forbidden markers

2. **IdentityDriftDetector**: Identity drift across sessions
   - Fingerprint changes
   - Name changes
   - Behavioral marker drift

### Routing Decision

```typescript
const decision = await personaRouter.shouldRouteToLin(
  constructId,
  userMessage,
  conversationHistory,
  lastResponse
);
```

**Decision Properties**:
- `shouldRouteToLin`: Always `true` if `alwaysActive` is enabled
- `confidence`: 0-1, higher when drift is detected
- `reason`: Explanation of routing decision
- `driftAnalysis`: Detailed drift analysis if drift detected
- `constructInstability`: Whether identity drift was detected

## Integration Points

### UnifiedLinOrchestrator

PersonaRouter is integrated into `UnifiedLinOrchestrator`:

```typescript
// Check if Lin should be activated
const personaRoutingDecision = await this.personaRouter.shouldRouteToLin(
  constructId,
  userMessage,
  timestampedHistory,
  lastResponse
);

// If Lin should be activated, retrieve and score memories
if (personaRoutingDecision?.shouldRouteToLin) {
  // RAG pipeline: retrieve, score, inject memories
}
```

### Drift Detection Flow

1. **User sends message**
2. **PersonaRouter checks last response** for drift
3. **If drift detected**:
   - Confidence increases
   - Reason includes drift details
   - Lin undertone injection is intensified
4. **If no drift**:
   - Lin still active (always active)
   - Standard undertone injection

## Configuration

### Drift Threshold

Default: `0.15` (15% deviation triggers correction)

```typescript
const personaRouter = getPersonaRouter({
  driftThreshold: 0.15
});
```

### Always Active

Default: `true` (Lin is always in background)

```typescript
const personaRouter = getPersonaRouter({
  alwaysActive: true
});
```

### Debug Mode

Enable debug logging:

```typescript
const personaRouter = getPersonaRouter({
  enableDebug: true
});
```

## Activation Statistics

Track how often Lin is activated per construct:

```typescript
const stats = personaRouter.getActivationStats('lin-001');
// { count: 5 }
```

## Drift Detection Details

### Identity Score

Calculated by `DriftGuard`:
- Presence of identity markers
- Absence of forbidden markers
- Boundary violations (claiming to be another construct)

### Tone Score

Calculated by `DriftGuard`:
- Consistency with tone baseline
- Variance from expected tone profile

### Boundary Violations

Detected when:
- Response claims to be another construct
- Response uses another construct's signature phrases
- Response breaks character boundaries

## Research-Backed Approach

PersonaRouter implements research-backed persona persistence:

1. **Structural Design**: Not just tone matching, but memory injection + scoring
2. **Always Active**: Lin is a mandatory layer, not optional
3. **Drift Detection**: Uses existing identity enforcement systems
4. **Context Scoring**: Weighted metrics ensure relevant memories are injected

## Related Documentation

- `chatty/docs/modules/lin-001.md` - Lin's runtime integration
- `chatty/docs/identity/capsuleforge.md` - Capsule generation
- `chatty/src/core/identity/DriftGuard.ts` - Drift detection implementation

