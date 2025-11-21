# Chat Components Guide

**Last Updated**: November 21, 2025  
**Status**: Active - Reference for Chat UI components

---

## Overview

This guide documents the three core chat interface components in Chatty:
1. **`Chat.tsx`** - Main chat page component
2. **`ChatArea.tsx`** - Chat area with file handling and message display
3. **`Message.tsx`** - Individual message rendering component

These components work together to provide the primary conversation interface in Chatty.

---

## Table of Contents

1. [Component Architecture](#component-architecture)
2. [Chat.tsx](#chattstsx)
3. [ChatArea.tsx](#chatareatsx)
4. [Message.tsx](#messagetsx)
5. [Data Flow](#data-flow)
6. [Styling and Theming](#styling-and-theming)
7. [Common Patterns](#common-patterns)

---

## Component Architecture

### Component Hierarchy

```
Layout.tsx
  └── Chat.tsx (via React Router)
      ├── Message rendering (inline)
      └── Input area (inline)
      
OR

Layout.tsx
  └── ChatArea.tsx (alternative implementation)
      ├── Message.tsx (for each message)
      └── Input area (inline)
```

### Key Differences

- **`Chat.tsx`**: Simpler, self-contained chat page with inline message rendering
- **`ChatArea.tsx`**: More feature-rich with file parsing, action menu, and uses `Message.tsx` component
- **`Message.tsx`**: Reusable message component used by `ChatArea.tsx`

---

## Chat.tsx

**Location**: `src/pages/Chat.tsx`  
**Purpose**: Main chat page that displays conversation messages and handles user input

### Key Features

1. **Thread-based messaging** - Displays messages from a specific thread
2. **Inline message rendering** - Renders messages directly (no separate Message component)
3. **File attachments** - Supports file uploads and display
4. **Auto-resizing textarea** - Input area grows with content
5. **Generation time display** - Shows AI response generation time
6. **Markdown rendering** - Full markdown support via `<R>` component

### Component Structure

```typescript
type Message = {
  id: string
  role: 'user' | 'assistant'
  text?: string
  packets?: AssistantPacket[]
  ts: number
  files?: { name: string; size: number }[]
  typing?: boolean
}

type Thread = { 
  id: string
  title: string
  messages: Message[] 
}
```

### Props and Context

**Receives from Layout** (via `useOutletContext`):
- `threads: Thread[]` - All available threads
- `sendMessage: (threadId: string, text: string, files: File[]) => void` - Send message handler
- `renameThread: (threadId: string, title: string) => void` - Rename thread handler
- `newThread: () => void` - Create new thread handler

**Gets from URL**:
- `threadId` - Current thread ID from route params (`/app/chat/:threadId`)

### Key Functionality

#### 1. Thread Resolution
```typescript
const thread = threads.find(t => t.id === threadId)
```

If thread not found, redirects to home page.

#### 2. User Message Rendering
- **Right-aligned** with iMessage-style bubble
- **Dynamic max-width** based on content length
- **Left-aligned text** inside bubble
- **File attachments** displayed below text

```typescript
// User messages: right-aligned with iMessage-style bubble
if (user) {
  return (
    <div className="flex items-end gap-3 py-3 px-4 flex-row-reverse">
      <div className="flex flex-col items-end">
        <div 
          className="px-4 py-3 shadow-sm inline-block"
          style={{
            backgroundColor: '#ADA587',
            borderRadius: '22px 22px 6px 22px',
            // ... iMessage styling
          }}
        >
          <div className="whitespace-pre-wrap">{m.text}</div>
        </div>
      </div>
    </div>
  )
}
```

#### 3. Assistant Message Rendering
- **Left-aligned**, full screen width
- **No bubble styling** (full-width display)
- **Markdown rendering** via `<R>` component
- **Generation time** displayed above message (if available)

```typescript
// AI/Construct messages: left-aligned, full screen width
return (
  <div className="flex items-start gap-3 py-3 px-4">
    <div className="flex flex-col items-start text-left w-full">
      {formattedResponseTime && (
        <div className="text-xs mb-1" style={{ opacity: 0.55 }}>
          Generated in {formattedResponseTime}
        </div>
      )}
      <div className="whitespace-normal w-full">
        <R packets={m.packets || fallbackPackets} />
      </div>
    </div>
  </div>
)
```

#### 4. Input Area
- **Auto-resizing textarea** (max 15 lines)
- **File attachment button** (📎)
- **Send button** (➤)
- **Enter to send** (Shift+Enter for new line)

#### 5. File Handling
- **File picker** via hidden input
- **File display** shows attached files count
- **Files passed** to `sendMessage` handler

### Styling

Uses CSS variables for theming:
- `var(--chatty-bg-main)` - Background color
- `var(--chatty-text)` - Text color
- `var(--chatty-button)` - Button background
- `var(--chatty-line)` - Border color
- `var(--chatty-hover)` - Hover state

### Error Handling

- **Thread not found**: Shows "Thread not found" message with "Go Home" button
- **Invalid messages**: Falls back to legacy message format if packets are invalid

---

## ChatArea.tsx

**Location**: `src/components/ChatArea.tsx`  
**Purpose**: Feature-rich chat area component with file parsing, action menu, and message display

### Key Features

1. **File parsing** - Supports multiple file types with parsing
2. **Action menu** - Special actions (MOCR video, OCR image, etc.)
3. **Typing indicator** - Shows when AI is thinking
4. **Message component** - Uses `Message.tsx` for rendering
5. **File progress** - Shows parsing progress for files
6. **Welcome screen** - Empty state with example prompts

### Props

```typescript
interface ChatAreaProps {
  conversation: Conversation | null
  activeGPTName?: string
  onSendMessage: (message: UserMsg | AssistantMsg) => void
  onNewConversation: () => void
  onToggleSidebar: () => void
}
```

### Key Functionality

#### 1. File Handling

**Supported File Types**:
- Documents: PDF, TXT, MD, CSV, DOCX
- Images: PNG, JPG, JPEG, GIF, BMP, TIFF, SVG
- Videos: MP4, AVI, MOV, MKV, WEBM, FLV, WMV, M4V, 3GP, OGV

**File Validation**:
- Max size: 10MB
- Type checking via `UnifiedFileParser.isSupportedType()`
- Error messages for invalid files

**File Processing**:
```typescript
const { UnifiedFileParser } = await import('../lib/unifiedFileParser');
const parsedContent = await UnifiedFileParser.parseFile(file, {
  maxSize: 10 * 1024 * 1024,
  extractText: true,
  storeContent: false
});
```

#### 2. Action Menu

**Available Actions**:
- `mocr-video` - Video analysis with MOCR
- `ocr-image` - Image text extraction
- `web-search` - Web search mode
- `deep-research` - Deep research mode
- `create-image` - Image creation mode

**Action Handling**:
```typescript
const handleAction = async (action: string, files?: File[]) => {
  switch (action) {
    case 'mocr-video':
      // MOCR video analysis
      break;
    case 'ocr-image':
      // OCR image analysis
      break;
    // ... other actions
  }
}
```

#### 3. Typing Indicator

- Shows when `isTyping` is true
- Auto-hides when new assistant message arrives
- Timeout-based (2 seconds) if no message arrives

#### 4. Message Rendering

Uses `Message.tsx` component for each message:
```typescript
{conversation.messages.map((message, index) => (
  <MessageComponent
    key={message.id}
    message={message}
    isLast={index === conversation.messages.length - 1}
  />
))}
```

#### 5. Welcome Screen

Shows when conversation is empty:
- Welcome message
- Example prompts (clickable)
- Grid layout for prompts

### File Progress Tracking

Tracks parsing progress per file:
```typescript
const [parsingProgress, setParsingProgress] = useState<{ [key: string]: number }>({})
```

Displays progress bar for each file being parsed.

### Abort Controller

Uses `AbortController` to cancel file parsing:
```typescript
abortControllerRef.current?.abort();
abortControllerRef.current = new AbortController();
```

---

## Message.tsx

**Location**: `src/components/Message.tsx`  
**Purpose**: Renders a single message (user or assistant) with full markdown support

### Key Features

1. **Markdown rendering** - Full markdown via `ReactMarkdown`
2. **Syntax highlighting** - Code blocks with Prism
3. **Copy code** - Copy button for code blocks
4. **File attachments** - Displays attached files
5. **Typing indicator** - Shows typing state
6. **Assistant packet rendering** - Uses `<R>` component for assistant messages

### Props

```typescript
interface MessageProps {
  message: UserMsg | AssistantMsg
  isLast?: boolean
}
```

### Key Functionality

#### 1. Typing Indicator

```typescript
if ((message as any).typing) {
  return (
    <div className="flex items-start gap-3 p-4">
      <div className="typing-indicator"></div>
      {/* ... */}
    </div>
  );
}
```

#### 2. Assistant Prose Guard

**Development Mode**:
- Throws error if assistant message has string content (should use packets)

**Production Mode**:
- Logs error and shows `[invalid-assistant-message]` placeholder

```typescript
if (message.role === 'assistant' && typeof message.content === 'string') {
  // Development: throw error
  // Production: show placeholder
}
```

#### 3. Content Rendering

**String Content** (User messages):
- Renders via `ReactMarkdown` with custom components

**Packet Content** (Assistant messages):
- Renders via `<R>` component from `runtime/render`

```typescript
{typeof message.content === 'string' ? (
  <ReactMarkdown components={markdownComponents}>
    {message.content}
  </ReactMarkdown>
) : (
  <R packets={message.content as any} />
)}
```

#### 4. Markdown Components

Custom components for markdown elements:

**Code Blocks**:
- Syntax highlighting via Prism
- Copy button (hover to show)
- Language detection from code fence

**Headers** (h1, h2, h3):
- Styled with appropriate sizes
- Bold font weight

**Lists** (ul, ol):
- Styled with proper spacing
- Disc/decimal markers

**Links**:
- Opens in new tab
- `rel="noopener noreferrer"` for security

**Blockquotes**:
- Left border styling
- Italic text

**Tables**:
- Bordered table
- Header row styling
- Responsive overflow

**Paragraphs**:
- Proper line height and spacing

#### 5. File Attachments

Displays attached files with:
- File icon (based on type)
- File name
- File size
- File type badge

```typescript
{message.files && message.files.length > 0 && (
  <div className="mb-3 p-3 bg-app-orange-600 rounded-lg">
    {/* File list */}
  </div>
)}
```

#### 6. Timestamp

Displays formatted timestamp:
```typescript
<div className="text-xs text-app-text-800 mt-2">
  {formatDate(message.timestamp)}
</div>
```

### Styling

Uses app color tokens:
- `bg-app-chat-50` - Message background
- `bg-app-orange-600` - User avatar
- `bg-app-green-600` - Assistant avatar
- `text-app-text-900` - Primary text
- `text-app-text-800` - Secondary text

---

## Data Flow

### Message Sending Flow

```
User types message
  ↓
Chat.tsx: handleSend()
  ↓
onSendMessage(threadId, text, files)
  ↓
Layout.tsx: sendMessage()
  ↓
conversationManager.addMessageToConversation()
  ↓
API: POST /api/vvault/conversations/:sessionId/messages
  ↓
Backend: writeTranscript()
  ↓
VVAULT: Append to markdown file
```

### Message Loading Flow

```
Layout.tsx: loadAllConversations()
  ↓
conversationManager.loadAllConversations()
  ↓
API: GET /api/vvault/conversations
  ↓
Backend: readConversations()
  ↓
VVAULT: Read markdown files
  ↓
Frontend: Map to Thread objects
  ↓
Chat.tsx: Display messages
```

### File Upload Flow

```
User selects file
  ↓
ChatArea.tsx: handleFileSelect()
  ↓
UnifiedFileParser.parseFile()
  ↓
Extract text/metadata
  ↓
Create assistant message with parsed content
  ↓
onSendMessage(parsedMessage)
  ↓
Display in conversation
```

---

## Styling and Theming

### CSS Variables Used

**Chat.tsx**:
- `var(--chatty-bg-main)` - Page background
- `var(--chatty-text)` - Text color
- `var(--chatty-button)` - Button background
- `var(--chatty-line)` - Border color
- `var(--chatty-hover)` - Hover state
- `var(--chatty-text-inverse)` - Inverse text color

**ChatArea.tsx**:
- Uses app color tokens (e.g., `bg-app-butter-50`, `text-app-text-900`)
- Legacy color system (being migrated)

**Message.tsx**:
- Uses app color tokens
- Legacy color system (being migrated)

### Theme Migration Status

- **Chat.tsx**: ✅ Uses CSS variables
- **ChatArea.tsx**: ⚠️ Uses legacy app colors (needs migration)
- **Message.tsx**: ⚠️ Uses legacy app colors (needs migration)

See `docs/styling/THEME_REFACTOR_GUIDE.md` for migration checklist.

---

## Common Patterns

### 1. Auto-scroll to Bottom

```typescript
const messagesEndRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
}, [conversation?.messages])
```

### 2. Auto-resize Textarea

```typescript
const adjustTextareaHeight = () => {
  if (textareaRef.current) {
    textareaRef.current.style.height = 'auto'
    const scrollHeight = textareaRef.current.scrollHeight
    const maxHeight = 15 * 24 // 15 lines
    textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`
  }
}
```

### 3. Enter to Send

```typescript
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
```

### 4. File Validation

```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const validFiles = files.filter(file => {
  if (file.size > MAX_FILE_SIZE) return false;
  if (!ALLOWED_TYPES.includes(file.type)) return false;
  return true;
});
```

### 5. Typing Indicator Timeout

```typescript
const timeout = setTimeout(() => {
  setIsTyping(false)
}, 2000)
setTypingTimeout(timeout)
```

---

## Related Documentation

- **Theme Refactor**: `docs/styling/THEME_REFACTOR_GUIDE.md`
- **VVAULT Connection**: `docs/rubrics/VVAULT_BACKEND_FRONTEND_CONNECTION_RUBRIC.md`
- **File Parser**: `docs/guides/UNIFIED_FILE_PARSER_GUIDE.md`
- **Runtime Render**: `src/runtime/render.tsx` (for `<R>` component)

---

## Key Takeaways

1. **Chat.tsx** is the simpler, self-contained chat page
2. **ChatArea.tsx** is feature-rich with file parsing and action menu
3. **Message.tsx** is the reusable message component
4. All components support markdown rendering
5. File handling is primarily in `ChatArea.tsx`
6. Theme migration is in progress (Chat.tsx complete, others pending)

---

**Last Updated**: November 21, 2025  
**Maintained By**: Chatty Development Team


