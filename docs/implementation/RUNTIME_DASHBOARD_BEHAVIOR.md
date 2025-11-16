# Runtime Dashboard Behavior Rubric

## Overview
The Runtime Dashboard is a full-screen interface that allows users to:
1. View available imported runtimes/personas
2. Import new chat archives (ChatGPT, Gemini, etc.)
3. Select a runtime to begin chatting with
4. Manage imported runtimes

## Key Behaviors

### 1. Import Flow
- **When importing from Runtime Dashboard:**
  - User clicks "Data Import" button
  - Modal opens for file selection
  - After file selection, modal closes
  - Import process begins (shows "Uploading..." message)
  - **Dashboard stays open** during and after import
  - Success notification appears in green box below header
  - Import summary card appears showing detected files
  - User can continue importing or select a runtime

- **Success Notification Format:**
  ```
  ✅ Imported ChatGPT archive for devon@thewreck.org.
  Created runtime "devon@thewreck.org — ChatGPT" with 12 conversations and 3568 messages.
  Detected 5 known items (chat.html, conversations.json, message_feedback.json, shared_conversations.json, user.json). Found 219 unknown files.
  ```

### 2. Dashboard Persistence
- **Dashboard should NOT close automatically after import**
- User explicitly closes via "Skip for now" button or by selecting a runtime
- This allows users to:
  - Import multiple archives in sequence
  - Review import summaries
  - See all available runtimes before selecting

### 3. Runtime Display
- Shows available runtimes as cards
- Each runtime card displays:
  - Runtime name
  - Provider (ChatGPT, Gemini, etc.)
  - Awareness metadata (time, location, mood if available)
  - Description
- Clicking a runtime card selects it and closes the dashboard

### 4. Import Status States
- **Processing**: Blue border, shows "Uploading..." message
- **Success**: Green border, shows success message with details
- **Error**: Red border, shows error message, allows retry

### 5. Import Summary Card
- Appears below header when import summary is available
- Shows detected files and archive contents
- Helps user understand what was imported before selecting runtime

## Implementation Notes

### State Management
- RuntimeDashboard uses local state for import status/message/summary
- Props (`importStatus`, `importMessage`, `importSummary`) are for external control
- Local state takes precedence when import happens within dashboard

### Event Flow
1. User selects file → `handleImportConfirm` called
2. Modal closes, import starts
3. Local state updated: `setLocalImportStatus('processing')`
4. API call to `/api/import/chat-export`
5. On success: `setLocalImportStatus('success')`, `setLocalImportMessage(...)`
6. Dashboard stays open, success notification displayed
7. `chatty:runtime-imported` event dispatched for other components

### Closing Behavior
- Dashboard closes ONLY when:
  - User clicks "Skip for now"
  - User selects a runtime card
  - Parent component calls `onDismiss()`
- Dashboard does NOT close automatically after successful import

