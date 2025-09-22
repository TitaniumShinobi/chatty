# Intelligent Entity Quick Start Guide

## Installation

No external dependencies needed! The system is completely self-contained.

## Basic Usage

### 1. Using with ConversationAI (Recommended)

```typescript
import { ConversationAI } from './lib/conversationAI';

// Create instance with IntelligentEntity enabled
const ai = new ConversationAI({ useIntelligentEntity: true });

// Process messages
const response = await ai.processMessage("Hello! How are you?");
console.log(response[0].payload.content);

// Provide feedback to help it learn
await ai.provideFeedback(true, 0.8); // positive feedback

// Check learning progress
const status = await ai.getEntityStatus();
console.log('Learning progress:', status);
```

### 2. Direct IntelligentEntity Usage

```typescript
import { intelligentEntity } from './engine/IntelligentEntity';

// Interact directly
const result = await intelligentEntity.interact("What can you help me with?");
console.log(result.response[0].payload.content);

// Access detailed metrics
console.log('Confidence:', result.metrics.confidence);
console.log('Processing time:', result.metrics.processingTime);
```

## Key Features

### Personality & Tone Control

```typescript
// Set tone
ai.setTone('enthusiastic'); // Options: laid_back, emotional, uncertain, professional, enthusiastic

// Activate persona
ai.activatePersona('creative_companion'); // Options: helpful_assistant, creative_companion, wise_mentor
```

### Learning & Feedback

```typescript
// After each interaction, provide feedback
await ai.provideFeedback(true, 0.9);  // Very positive
await ai.provideFeedback(false, 0.3); // Negative
await ai.provideFeedback(true, 0.5);  // Neutral positive
```

### State Persistence

```typescript
// Save state
const state = await ai.saveEntityState();
localStorage.setItem('ai-state', state);

// Load state
const savedState = localStorage.getItem('ai-state');
if (savedState) {
  await ai.loadEntityState(savedState);
}
```

## Learning Progression

The entity learns through:

1. **Pattern Recognition** - Identifies recurring patterns in conversations
2. **Memory Formation** - Stores important interactions
3. **Skill Development** - Builds capabilities from successful patterns
4. **Personality Evolution** - Adapts traits based on interactions

## Example Conversation Flow

```typescript
async function conversationExample() {
  const ai = new ConversationAI({ useIntelligentEntity: true });
  
  // 1. Greeting
  let response = await ai.processMessage("Hello!");
  console.log("AI:", response[0].payload.content);
  
  // 2. Emotional support
  response = await ai.processMessage("I'm feeling stressed about work");
  console.log("AI:", response[0].payload.content);
  await ai.provideFeedback(true, 0.8); // Good response
  
  // 3. Problem solving
  response = await ai.processMessage("How should I organize my tasks?");
  console.log("AI:", response[0].payload.content);
  
  // 4. Check learning
  const status = await ai.getEntityStatus();
  console.log("Skills learned:", status.stats.skills);
  console.log("Memories formed:", status.stats.memories);
}
```

## Tips for Best Results

1. **Provide Consistent Feedback** - The entity learns from your feedback
2. **Have Varied Conversations** - Different topics help it develop diverse skills
3. **Be Patient** - Learning takes time and multiple interactions
4. **Save State Regularly** - Preserve learning progress

## Debugging

```typescript
// Get detailed debug info
const debug = ai.getDebugInfo();
console.log('Debug info:', debug);

// Check entity status
const status = await ai.getEntityStatus();
console.log('Current state:', status.state);
console.log('Statistics:', status.stats);
console.log('Capabilities:', status.capabilities);
```

## Advanced Features

### Custom Personas

```typescript
// Create custom tone profile (requires direct entity access)
import { intelligentEntity } from './engine/IntelligentEntity';

intelligentEntity.toneAdapter.createCustomTone('friendly_teacher', {
  name: 'friendly_teacher',
  description: 'Supportive and educational',
  baseTraits: {
    formality: 0.4,
    emotionality: 0.6,
    verbosity: 0.7,
    assertiveness: 0.5,
    playfulness: 0.3
  },
  vocabularyPreferences: ['let\'s explore', 'great question', 'here\'s an idea'],
  phrasePrefixes: ['I\'d like to share ', 'Consider this: ', 'Here\'s what I think: '],
  responseSuffixes: ['. What do you think?', '. Does that help?', '!']
});
```

## Common Use Cases

1. **Customer Support Bot** - Learns from interactions to provide better help
2. **Personal Assistant** - Adapts to user preferences over time
3. **Educational Tutor** - Develops teaching strategies based on student responses
4. **Creative Companion** - Learns user's creative style and preferences
5. **Therapy Bot** - Develops empathetic responses through interaction

## Troubleshooting

**Q: Responses seem generic**
A: The entity needs time to learn. Provide feedback and have varied conversations.

**Q: How do I reset learning?**
A: Call `ai.resetConversation()` to reset the conversation, but learning persists.

**Q: Can I share learned knowledge?**
A: Yes, save and share the state string. Load it in another instance.

## Next Steps

1. Review the architecture document: `INTELLIGENT_ENTITY_ARCHITECTURE.md`
2. Run the demo: `npm run demo:intelligent-entity`
3. Explore individual modules in the `engine/` directory
4. Experiment with different conversation styles

Remember: This system grows smarter with every interaction!