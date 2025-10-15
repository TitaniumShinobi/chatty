# rubric.md — GPTCreator.tsx

This rubric governs the **design, functionality, and structure** of the `GPTCreator.tsx` component within Chatty.

---

## 🧠 Purpose

The `GPTCreator` component is the central UI for defining, configuring, and previewing custom GPTs in Chatty. It must reflect the full functionality of OpenAI's `chat.openai.com/gpts` builder while being aligned with Chatty's backend architecture.

---

## 🧱 Component Identity

- **Component Name**: `GPTCreator`
- **File**: `src/components/GPTCreator.tsx`
- **Exports**: Single `default` React component
- **Dependencies**:
  - `GPTService` for all GPT-related persistence
  - `GPTConfig`, `GPTFile`, `GPTAction` interfaces from `lib/gptService`
  - `Synth` (or selected model) for chat preview

---

## 🔁 Tabs & Layout

### ➤ `Create` tab:

| Field         | Functionality                                       |
|---------------|-----------------------------------------------------|
| Name          | Text input, required, editable                      |
| Description   | Text input, optional                                |
| Instructions  | Multiline input, required                           |
| Model         | Dropdown selector for supported models              |
| Chat Preview  | LLM-powered chat UI simulating the current config   |

### ➤ `Configure` tab:

| Section             | Functionality                                                 |
|---------------------|---------------------------------------------------------------|
| Avatar              | Upload image or auto-generate from name/description           |
| Conversation Starters | Add/remove text starter phrases                           |
| Knowledge Files     | Upload files (OCR/MOCR), display file list, support deletion |
| Capabilities        | Toggle: Web Search, Canvas, Image Gen, Code Interpreter       |
| Actions             | Open schema editor to define API actions                     |
| Advanced Settings   | Reserved for feature flags, privacy controls, etc             |

---

## 📦 State Shape

```ts
interface GPTConfig {
  id: string;
  name: string;
  description: string;
  instructions: string;
  model: string;
  avatar?: string;
  capabilities: string[];
  conversationStarters: string[];
  files: GPTFile[];
  actions: GPTAction[];
}

	•	All fields are user-editable through the UI
	•	All uploaded files must be processed using OCR/MOCR
	•	Avatar is stored as a URL or base64 string

⸻

🧩 Non-Negotiable Functional Requirements
	•	✅ Model selection must persist and update live preview
	•	✅ Avatar must support both upload and auto-generation (generateAvatar())
	•	✅ File uploads must trigger OCR/MOCR and persist via GPTService
	•	✅ Files must show delete icons and support reordering
	•	✅ "Create GPT" saves GPTConfig, files, and actions to DB
	•	✅ Chat preview reflects full instruction and config state
	•	✅ "Actions" section opens a schema editor drawer or modal (OpenAPI)
	•	❌ Do NOT split this into separate files unless directed by rubric
	•	❌ Do NOT create GPTCreatorNew.tsx or any derivative clones

⸻

📖 UI Behavior Parity with OpenAI

This file is expected to reach functional parity with chat.openai.com/gpts in its create/configure workflow. Acceptable deviations:
	•	Design language matches Chatty instead of OpenAI's visual style
	•	Model selection may differ in label/options
	•	Backend calls go through GPTService instead of remote APIs

⸻

💬 LLM Chat Area
	•	Rendered in the Create tab only
	•	Driven by selected model (default: Synth)
	•	Uses instructions and description as injected system context
	•	Chat is stored locally per session

⸻

🧼 Commit & Maintenance Standards

Every change to this file must be logged in commits.md with:
	•	🧩 Description of what changed (restored, added, removed, fixed)
	•	🎯 Reference to rubric section (e.g. Functional Requirements)
	•	🧠 Reason for change (fixing regression, restoring broken state, etc.)
	•	🗂️ Commit message should start with: GPTCreator: prefix

⸻

🛡️ File Creation Policy

🚫 Do not create new GPTCreator-related files unless:
	•	Rubric is updated to allow a new component
	•	A new feature is too large to fit in the current file AND
	•	The new file will be limited to UI subcomponents (e.g. AvatarUploader.tsx)

All logic and state must remain in GPTCreator.tsx.

⸻

📌 Final Notes
	•	🛑 Creating GPTCreatorNew.tsx again is forbidden
	•	✅ GPTService must be the only interface for persistence
	•	✅ Follow gptConfig → state → UI unidirectional flow
	•	💬 Chat preview is required for user feedback
	•	🧪 Feature completeness is more important than design perfection

⸻
