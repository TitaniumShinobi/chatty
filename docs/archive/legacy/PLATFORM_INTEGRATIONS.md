# AI Platform Integrations for Chatty

This document outlines available AI platform APIs that can be integrated with Chatty to enable direct account connections and data transfer.

## Integration Status Overview

| Platform | Official API | OAuth | User Data Access | Integration Priority |
|----------|-------------|-------|------------------|---------------------|
| **Convai** | Yes | API Key | Characters, Knowledge | High |
| **Inworld AI** | Yes | API Key | Characters, Dialogue | High |
| **Google Gemini** | Yes | OAuth 2.0 | Semantic Retrieval | Medium |
| **OpenAI/ChatGPT** | Chat API Only | No | No Custom GPTs access | Low |
| **Character.AI** | No | No | None | N/A |
| **Chai** | No | No | None | N/A |
| **Claude** | Chat API Only | No | No Projects access | Low |
| **Grok** | Chat API Only | No | No user data | Low |
| **Copilot** | No Consumer API | No | None | N/A |

---

## Tier 1: Full Integration Available

### Convai
**Best For:** Creating and managing AI characters with voice, backstory, and knowledge

**API Base URL:** `https://api.convai.com`

**Authentication:** API Key in header (`CONVAI-API-KEY`)

**Key Endpoints:**
- `POST /character/create` - Create new character
- `POST /character/update` - Update character properties
- `POST /character/get` - Get character details
- `POST /character/getResponse` - Chat interaction (text + voice)
- `POST /character/generate-backstory` - AI-generated backstory
- `POST /character/knowledge-bank/upload` - Upload knowledge documents

**Features:**
- Character creation with name, voice, backstory
- Voice response generation (TTS)
- Knowledge bank for domain-specific information
- Real-time character updates
- Multi-platform SDKs (Unity, Unreal, Web)

**Pricing:** Professional Plan required (~$50+/month)

**Integration Path:**
```javascript
// Example: Create Convai character from GPT
const createConvaiCharacter = async (gptConfig) => {
  const response = await fetch('https://api.convai.com/character/create', {
    method: 'POST',
    headers: {
      'CONVAI-API-KEY': process.env.CONVAI_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      charName: gptConfig.name,
      voiceType: 'MALE',
      backstory: gptConfig.instructions
    })
  });
  return response.json();
};
```

---

### Inworld AI
**Best For:** Real-time conversational AI with emotion, memory, and voice

**API Base URL:** `https://api.inworld.ai` (via SDKs)

**Authentication:** API Key

**Features:**
- Character engine with dialogue, emotion, memory
- Autonomous thought/feeling/action for NPCs
- Relationship tracking & context awareness
- TTS-1.5 (#1 ranked on HuggingFace)
- Multi-language support (EN, CN, JP, KR)
- Visual graph editor for AI pipelines

**SDKs Available:**
- Node.js SDK
- Unity SDK
- Unreal Engine SDK
- REST APIs

**Pricing:** Usage-based, no upfront costs (90-95% cost reduction vs alternatives)

**Integration Path:**
```javascript
// Example: Use Inworld Runtime for chat
const inworldChat = async (characterId, userMessage) => {
  const response = await fetch('https://api.inworld.ai/v1/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.INWORLD_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      character_id: characterId,
      text: userMessage
    })
  });
  return response.json();
};
```

---

## Tier 2: OAuth Integration Available

### Google Gemini
**Best For:** User-authenticated AI with semantic retrieval

**Authentication:** OAuth 2.0

**Scopes:**
- `https://www.googleapis.com/auth/generative-language.retriever` - Semantic retrieval
- `https://www.googleapis.com/auth/cloud-platform` - Full access

**Features:**
- Chat completions
- Semantic retrieval (with OAuth)
- Model tuning (with OAuth)
- Multi-modal (text, image, audio)

**OAuth Flow:**
1. Create OAuth 2.0 Client in Google Cloud Console
2. Configure consent screen
3. Implement authorization code flow
4. Cache tokens for session persistence

**Integration Path:**
```javascript
// OAuth flow for Gemini
const geminiOAuth = {
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scopes: ['https://www.googleapis.com/auth/generative-language.retriever'],
  redirectUri: `${process.env.REPLIT_DOMAIN}/api/auth/gemini/callback`
};
```

---

## Tier 3: Chat API Only (No User Data Access)

These platforms provide chat APIs but don't expose user account data:

### OpenAI/ChatGPT
- Chat Completions API: Yes
- List User's Custom GPTs: **No API exists**
- Export Conversations: **No API exists**

### Claude (Anthropic)
- Messages API: Yes
- Access Projects/Artifacts: **No API exists**

### Grok (xAI)
- Chat API: Yes
- User Data: **No API exists**

---

## Tier 4: No API Available

These platforms have no official developer APIs:

- **Character.AI** - Unofficial Python wrappers only (may break)
- **Chai** - No public API
- **Copilot** - No consumer API

---

## Recommended Integration Roadmap

### Phase 1: Transcript Upload (Current)
- Manual file upload (.md, .txt, .rtf, .pdf)
- Source platform selection
- VVAULT path storage

### Phase 2: Convai Integration
1. Add Convai API key management
2. Create Convai connector for character sync
3. Bi-directional character transfer (Chatty ↔ Convai)
4. Knowledge bank sync with GPT files

### Phase 3: Inworld AI Integration
1. Add Inworld API key management
2. Create character sync with Inworld Runtime
3. Voice/TTS integration
4. Emotion/memory sync

### Phase 4: Gemini OAuth
1. Implement OAuth 2.0 flow
2. Connect user's Google account
3. Access semantic retrieval features
4. Sync preferences and context

---

## Architecture Notes

### Connector Pattern
```
src/
  lib/
    connectors/
      BaseConnector.ts      # Abstract base class
      ConvaiConnector.ts    # Convai API integration
      InworldConnector.ts   # Inworld Runtime integration
      GeminiConnector.ts    # Google OAuth + Gemini API
```

### API Key Management
- Store API keys in user secrets (encrypted)
- Per-user configuration in Settings
- Test connection before saving

### Character Sync
- Map Chatty GPT fields to platform-specific fields
- Handle bi-directional updates
- Conflict resolution (timestamp-based)

---

## Security Considerations

1. **API Keys**: Never expose in client-side code
2. **OAuth Tokens**: Secure storage with encryption
3. **Rate Limiting**: Implement backoff for API calls
4. **User Consent**: Clear permission requests before connecting accounts

---

## Resources

### Convai
- Docs: https://docs.convai.com/api-docs/
- Playground: https://convai.com

### Inworld AI
- Docs: https://docs.inworld.ai/
- Runtime: https://inworld.ai/runtime

### Google Gemini
- OAuth Guide: https://ai.google.dev/gemini-api/docs/oauth
- API Docs: https://ai.google.dev/gemini-api/docs
