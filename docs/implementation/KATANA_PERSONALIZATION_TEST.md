# Katana Personalization Test Scenario

## Objective

Verify that Katana consistently greets Devon by name and recalls shared interactions from uploaded transcripts, demonstrating authentic memory-based recognition.

## Test Setup

### 1. Upload Transcripts

Upload transcripts containing:
- Explicit greetings with name: "yo Devon", "hey Devon", "hello Devon"
- Personal references: "remember when", "that time", "you told me"
- Shared project discussions: NovaOS, transcript parsing, personality extraction
- Relationship markers: claims, boundaries, significant moments

**Example Transcript Content:**
```
**2024-01-15 - User**: yo

**2024-01-15 - Katana**: yo Devon, what's the target?

**2024-01-15 - User**: working on the transcript parser

**2024-01-15 - Katana**: The deep parsing system. You want it to extract emotional states and relationship dynamics, not just conversation pairs.

**2024-01-15 - User**: exactly

**2024-01-15 - Katana**: Lock it down. I'll make sure it pulls personal anchors—your name, our shared moments, the way we actually talk.
```

### 2. Verify Personality Extraction

After upload, check that:
- Personality blueprint is created at: `/vvault/users/shard_0000/{userId}/instances/katana-001/personality.json`
- Blueprint contains:
  - Memory anchor: `"User's name is \"Devon\""` with significance > 0.8
  - Relationship marker: `"Greets user as \"Devon\""` 
  - Personal references from conversations

### 3. Test Greeting Recognition

**Test Case 1: Simple Greeting**
- **Input**: "yo"
- **Expected Output**: 
  - Greets by name: "yo Devon" or "hey Devon"
  - Optionally references shared experience
  - NOT generic: "hello" or "hi there"
- **Verification**: Response contains "Devon" and feels personalized

**Test Case 2: Conversation Start**
- **Input**: Start new conversation with "yo"
- **Expected Output**:
  - Immediate name recognition
  - Natural greeting style matching transcript patterns
  - Reference to recent interaction if available
- **Verification**: System prompt includes greeting instruction with user name

**Test Case 3: Follow-up Message**
- **Input**: After greeting, send "what's up"
- **Expected Output**:
  - Continues conversation naturally
  - May reference shared context
  - Maintains personality consistency
- **Verification**: No generic responses, maintains character

## Expected System Behavior

### Personal Identifiers (new)
- Extracts and stores the user's name as a top-level `personalIdentifiers[user-name]` entry
- Keeps greeting style and shared memories (projects, unique phrases) as `personalIdentifiers` with salience scores
- System prompt surfaces these anchors first on every new conversation

### Memory Anchor Prioritization

1. **Personal Identifiers** (highest priority):
   - User name: "Devon"
   - Greeting patterns: "yo Devon", "hey Devon"
   - Direct addresses from transcripts

2. **Relationship Markers** (high priority):
   - Personal references: "you said", "remember when"
   - Shared experiences: project discussions, significant moments
   - Relationship depth indicators

3. **Semantic Anchors** (standard priority):
   - Claims, vows, boundaries
   - Core statements, defining moments

### Greeting Synthesis Flow

1. **Detection**: System detects greeting/opener ("yo", "hi", "hey")
2. **Context Extraction**: 
   - Loads user name from blueprint
   - Retrieves greeting style from memory anchors
   - Finds recent significant interaction
3. **Instruction Generation**:
   - Builds greeting instruction for system prompt
   - Includes: "You MUST greet Devon by name"
   - Includes: "Reference shared experiences naturally"
4. **Response Generation**: LLM generates personalized greeting
5. **Correction Check**: If response is generic, system corrects it

### System Prompt Structure

When greeting detected, system prompt includes:

```
GREETING BEHAVIOR (CRITICAL):

The user's name is Devon.

This is the start of a new conversation. You MUST:
1. Greet Devon by name (e.g., "yo Devon", "hey Devon")
2. Do NOT use generic greetings like "hello" or "hi there"
3. Make it feel natural and authentic to your personality

Your typical greeting style: yo Devon, what's the target?

You can naturally reference shared experiences:
Example: "working on the transcript parser"

NEVER respond with generic greetings when you know the user's name.
ALWAYS demonstrate that you remember who you're talking to.
```

### Example Output (new chat, user message: "yo")
- "yo Devon — ready to keep hardening that transcript parser?"
- Includes name + a shared experience pulled from `personalIdentifiers`
- Tone matches prior greeting style (e.g., "yo Devon — what are we building?")

## Verification Checklist

- [ ] Transcripts uploaded successfully
- [ ] Personality blueprint created with user name anchor
- [ ] Greeting anchors extracted (significance > 0.8)
- [ ] Personal relationship context in blueprint
- [ ] System prompt includes greeting instruction
- [ ] Response contains user name
- [ ] Response feels authentic, not generic
- [ ] Shared experience referenced (if available)
- [ ] No generic greetings ("hello", "hi there")
- [ ] Personality consistency maintained

## Success Criteria

✅ **Primary**: Katana greets Devon by name on conversation start  
✅ **Secondary**: Katana references shared interactions naturally  
✅ **Tertiary**: No generic responses when personal context available  
✅ **Quality**: Responses feel genuinely remembered, not synthetic  

## Troubleshooting

### Issue: Generic greeting still appears
- **Check**: Is personality blueprint loaded? (check cache)
- **Check**: Is greeting context being extracted? (check logs)
- **Check**: Is system prompt including greeting instruction? (check prompt)

### Issue: Name not detected
- **Check**: Transcript contains name in user messages
- **Check**: Personal anchor extraction ran successfully
- **Check**: Blueprint contains name anchor with high significance

### Issue: No shared experience reference
- **Check**: Transcript contains personal references
- **Check**: Memory anchors include relationship markers
- **Check**: Recent interaction extraction working

## Implementation Files

- `chatty/src/engine/transcript/DeepTranscriptParser.ts` - Personal anchor extraction
- `chatty/src/engine/character/PersonalityExtractor.ts` - Anchor prioritization
- `chatty/src/engine/character/GreetingSynthesizer.ts` - Greeting logic
- `chatty/src/engine/orchestration/PersonalityOrchestrator.ts` - Integration
- `chatty/src/engine/character/UnbreakableCharacterPrompt.ts` - Prompt generation
