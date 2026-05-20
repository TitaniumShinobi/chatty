2025-10-30 ROADMAP

⸻

✅ Chatty: Zip Archive Import Rubric (Singleton-Compliant)

🔄 PHASE 1: Import Archive UI Trigger
	•	“Import Conversations” button visible in sidebar or settings
	•	Supports drag-and-drop .zip upload
	•	Upload accepts only valid .zip files
	•	Shows file validation status (✅ valid / ❌ invalid format)

⸻

📦 PHASE 2: Extract + Parse Archive
	•	Use JSZip or equivalent to extract contents
	•	Parse files for *.json, *.txt, or *.md transcripts
	•	Validate expected format: messages, timestamp, role, threadId
	•	Group messages by threadId for conversation reconstruction

⸻

📁 PHASE 3: Normalize Threads
	•	For each conversation:
	•	Extract unique threadId or generate UUID if missing
	•	Convert all messages into Chatty’s internal format:

type Message = {
  id: string;
  timestamp: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
};


	•	Generate default title from first user message if title missing
	•	Skip any malformed threads with no messages

⸻

🧠 PHASE 4: VVAULT Storage
	•	Store conversations via VVAULTConversationManager.createConversation()
	•	Prevent overwrites by checking for existing session ID
	•	Write transcript files as append-only
	•	Add system message:

CONVERSATION_IMPORTED: {source: 'zip', importedAt: new Date().toISOString()}



⸻

🧼 PHASE 5: Deduplication Logic
	•	During import, check VVAULT for existing session IDs
	•	If threadId exists, skip OR append -imported-{n} to make unique
	•	Avoid adding to threads[] in frontend state unless confirmed persisted

⸻

🖼️ PHASE 6: Sidebar Refresh
	•	Force call to loadUserConversations(user) after import
	•	Confirm merged threads are:
	•	Singleton (no duplicates)
	•	Sorted by updatedAt descending
	•	Only one default conversation exists (e.g., no Welcome to Chatty spam)
	•	Sidebar updates immediately without full reload

⸻

🛡️ PHASE 7: Fail Safes
	•	Prevent infinite loop by flagging imported threads (imported: true)
	•	Check for duplicates in local threads[] before calling setThreads()
	•	Retry failed imports with a separate queue mechanism (optional)

⸻

✅ Sample Final State (Sidebar Thread Structure):

[
  {
    id: "session_abc123",
    title: "Exploring Zip Imports",
    messages: [...],
    createdAt: 1698800000000,
    updatedAt: 1698800900000,
    imported: true,
    archived: false
  },
  ...
]


⸻

📌 Notes:
	•	Compliant with SINGLETON_CONVERSATION_RUBRIC.md
	•	Uses VVAULT_INTEGRATION_SUMMARY.md format for persistence
	•	Respects USER_REGISTRY_RUBRIC.md isolation per user
	•	Clean, conflict-free import with no duplication on refresh