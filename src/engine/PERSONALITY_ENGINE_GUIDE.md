# Personality Engine + Empathy Adapter Guide

## Overview

The Personality Engine provides dynamic tone shaping and empathetic responses based on user mood, message tone, and conversation context.

## Components

### 1. ToneAdapter (`composers/ToneAdapter.ts`)
- **Dynamic Tone Profiles**: laid_back, emotional, uncertain, professional, enthusiastic
- **Mood Detection**: Analyzes valence, arousal, and dominance
- **Automatic Adaptation**: Adjusts tone based on user's emotional state
- **Vocabulary & Phrase Modification**: Applies tone-specific language patterns

### 2. EmpathyEngine (`composers/empathy.ts`)
- **Emotion Detection**: Identifies primary emotions (happy, sad, angry, anxious, confused, grateful)
- **Contextual Empathy**: Generates appropriate acknowledgments, validations, and support
- **Emotional Journey Tracking**: Monitors emotional progression across conversations

### 3. PersonaPlugin (`composers/PersonaPlugin.ts`)
- **Pre-built Personas**: helpful_assistant, creative_companion, wise_mentor
- **Custom Personas**: Create and register new personas
- **Composite Personas**: Blend multiple personas with weighted traits
- **Context-aware Modifications**: Apply persona-specific transformations

### 4. ConversationCore (`ConversationCore.ts`)
- **Central orchestrator** for all personality components
- **Plugin system** for extensibility
- **State management** for conversation context
- **Fallback handling** for uncertain situations

## Usage Examples

### Basic Tone Adaptation
```typescript
const ai = new ConversationAI();
// Automatically adapts tone based on user mood
const response = await ai.processMessage("I'm feeling frustrated!");
```

### Manual Tone Control
```typescript
ai.setTone('professional'); // Force professional tone
ai.setPersonalityOverride('enthusiastic'); // Override with specific personality
```

### Using Personas
```typescript
ai.activatePersona('creative_companion');
const response = await ai.processMessage("Help me brainstorm ideas");
```

### Available Tones
- **laid_back**: Relaxed, casual, friendly
- **emotional**: Warm, empathetic, expressive  
- **uncertain**: Tentative, thoughtful, questioning
- **professional**: Formal, precise, respectful
- **enthusiastic**: Energetic, positive, encouraging

### Available Personas
- **helpful_assistant**: Professional and knowledgeable
- **creative_companion**: Imaginative and playful
- **wise_mentor**: Thoughtful and philosophical

## Fallback Responses

When the system is uncertain, it provides helpful fallback responses:
- "I'm not sure how to respond to that yet. Want to try asking in a different way?"
- "That's interesting! I might need a bit more context to give you a helpful response."
- "I want to make sure I understand correctly. Could you rephrase that?"

## Integration Points

1. **Preprocessing**: Add custom message preprocessors
2. **Postprocessing**: Add response modifiers
3. **Custom Tones**: Create new tone profiles
4. **Custom Personas**: Register new persona definitions

## Debug Information

Access debug info to monitor the engine state:
```typescript
const debug = ai.getDebugInfo();
// Returns: history, state, availableTones, availablePersonas, activePersona
```