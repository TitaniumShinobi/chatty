# Runtime Architecture Rubric

## Core Concept: Runtimes Are Entire Workspace Instances

**A runtime is NOT just a persona or GPT variant. A runtime is an entire Chatty workspace instance representing a complete LLM environment.**

When you switch runtimes, the entire Chatty interface transforms to reflect that runtime's:
- Conversations
- Custom GPTs
- Settings
- Context
- History

---

## Runtime Import & Workspace Transformation

### Objective
When a user imports a runtime (e.g., ChatGPT export), the **entire Chatty workspace should magically transform** to show that runtime's complete environment.

### Expected Behavior

#### 1. Address Book Transformation
- **Pinned Name Changes**: The top-level pinned entry in Address Book changes from "Synth" to the provider name
  - Examples: "ChatGPT", "Gemini", "Claude", "Grok", "DeepSeek", "Copilot"
- **Provider becomes the workspace identity** - not just a runtime card

#### 2. Sidebar Hydration
- **All imported conversations appear in sidebar** under the runtime's pinned name
- Conversations load automatically from VVAULT file structure
- No manual refresh needed - hydration keeps up with file changes
- Conversations maintain:
  - Original titles
  - Message formatting
  - Timestamps
  - Thread structure

#### 3. File Structure Integration
- VVAULT file structure was designed specifically to support this:
  ```
  /vvault/users/{shard}/{user_id}/constructs/{construct}-001/chatty/
    - chat_with_{construct}-001.md (per conversation)
    - chat_with_{construct}-002.md
    - ...
  ```
- Each imported conversation becomes its own thread/file
- File changes automatically reflect in UI (hydration)

---

## Custom GPT Detection & Recreation

### Detection Logic
- Import process detects custom GPTs from conversation metadata
- Identifies conversations that belong to custom GPTs vs primary model
- Stores GPT configuration in import metadata

### Placeholder System
- When opening a conversation from a custom GPT:
  - Show placeholder at bottom: "Recreate the GPT as a placeholder"
  - Indicates this conversation was from a custom GPT that can be recreated

### GPTs Needing Configuration
- **GPTsPage.tsx** should show "GPTs Needing Configuration" section
- Lists all custom GPTs detected from imported runtimes
- Shows which runtime they came from (e.g., "from devon@thewreck.org — ChatGPT")
- Allows user to recreate GPTs with original configuration

### Cross-Runtime GPT Usage
- Custom GPTs detected in imported runtime (e.g., "devon@thewreck.org — ChatGPT")
- Should be **available to use in primary Synth runtime**
- GPTs are runtime-agnostic - can be called from any runtime context
- This enables: "Use my Katana GPT from ChatGPT in my Synth workspace"

---

## Runtime vs Contact Distinction

### Current Understanding
- **Runtime** = Entire workspace instance (ChatGPT workspace, Gemini workspace, etc.)
- **Contact** = Individual GPT/persona within a runtime
- If you can recreate a GPT with same tones, instructions, quirks, etc., it could be a Contact instead

### Design Philosophy
- **Options are fun** - Multiple runtimes provide different workspace contexts
- **But everything could be a Contact** - If GPT recreation is perfect, no need for separate runtimes
- **Current goal**: Make imported runtimes work seamlessly as complete workspace transformations

---

## Implementation Requirements

### 1. Runtime Activation
When a runtime is selected:
- ✅ Change Address Book pinned name to provider
- ✅ Load all conversations from that runtime's VVAULT folder
- ✅ Update sidebar to show runtime's conversations
- ✅ Set active runtime context for new conversations

### 2. Conversation Loading
- ✅ Read all transcript files from runtime's construct folders
- ✅ Parse markdown transcripts to extract conversations
- ✅ Create thread entries in sidebar
- ✅ Maintain conversation titles and structure

### 3. Custom GPT Detection
- ✅ Detect custom GPTs during import (from conversation metadata)
- ✅ Store GPT configuration in import-metadata.json
- ✅ Show placeholder in conversation windows
- ✅ List in "GPTs Needing Configuration" on GPTsPage

### 4. Cross-Runtime GPT Access
- ✅ Make detected GPTs available across runtimes
- ✅ Allow GPT recreation from any runtime context
- ✅ Maintain GPT-to-runtime association for context

### 5. Hydration & File Watching
- ✅ Monitor VVAULT file changes
- ✅ Auto-refresh sidebar when new conversations appear
- ✅ Keep UI in sync with file system changes
- ✅ No manual refresh needed

---

## File Structure Reference

### Import Storage
```
/vvault/users/{shard}/{user_id}/constructs/{construct}-001/chatty/
  - chat_with_{construct}-001.md  (Conversation 1)
  - chat_with_{construct}-002.md  (Conversation 2)
  - ...
```

### Runtime Metadata
```
/vvault/users/{shard}/{user_id}/constructs/{construct}-001/chatty/
  - import-metadata.json (contains: source, identity, custom GPT configs)
```

### Custom GPT Detection
- Conversations with `conversation_template_id` or `mapping_slug` → Custom GPT
- Extract GPT config from conversation metadata or prompts folder
- Store in import-metadata.json for later recreation

---

## User Experience Flow

### Import Flow
1. User uploads ChatGPT export ZIP
2. System detects: email, provider, conversations, custom GPTs
3. Creates runtime workspace: "devon@thewreck.org — ChatGPT"
4. Saves all conversations to VVAULT file structure
5. **Workspace transforms**:
   - Address Book shows "ChatGPT" as pinned
   - Sidebar shows all 12 conversations
   - Each conversation clickable and functional

### Custom GPT Flow
1. User opens conversation from custom GPT (e.g., "Katana")
2. Placeholder appears: "Recreate the GPT as a placeholder"
3. User navigates to GPTsPage
4. Sees "GPTs Needing Configuration" section
5. "Katana" listed with "from devon@thewreck.org — ChatGPT"
6. User clicks "Recreate" → GPT created with original config
7. GPT now available in Synth runtime too

### Cross-Runtime Flow
1. User in Synth runtime
2. Wants to use "Katana" GPT from ChatGPT runtime
3. GPTsPage shows available GPTs from all runtimes
4. User selects "Katana" → Works in Synth context
5. Conversation uses Katana's personality/config

---

## Key Principles

1. **Runtimes = Workspaces**: Not personas, but complete LLM environments
2. **Seamless Transformation**: Import should magically transform entire UI
3. **File-Driven**: VVAULT file structure is source of truth
4. **Auto-Hydration**: UI stays in sync with file changes automatically
5. **Custom GPT Portability**: GPTs can be used across runtimes
6. **Preservation**: Original formatting, titles, structure maintained

---

## Current Status & Next Steps

### ✅ Completed
- Import detection (email, provider, conversations)
- VVAULT file structure for conversations
- Duplicate detection
- Runtime dashboard with cards

### 🔄 In Progress
- Sidebar hydration from VVAULT
- Address Book runtime switching
- Custom GPT detection and recreation
- Cross-runtime GPT access

### 📋 TODO
- Connect frontend to VVAULT file structure
- Implement runtime workspace transformation
- Add "GPTs Needing Configuration" section
- Custom GPT placeholder system
- File watching/hydration system

---

## Notes

- File structure was designed specifically to support importing existing data
- The goal is **magical transformation** - user imports, workspace changes instantly
- Custom GPTs are the bridge between runtimes - they can exist in multiple contexts
- Everything should "just work" - no manual steps, no guessing, seamless experience

