# VVAULT Connector for Chatty

A secure, append-only memory system that **automatically** integrates Chatty conversations with VVAULT's structured storage system.

## 🎯 **Automatic Integration - Zero Manual Code Required!**

The VVAULT Connector now provides **automatic integration** that hooks into Chatty's existing conversation flow without requiring any manual code changes or API calls.

## 🚀 **Quick Setup (30 seconds)**

### **One-Line Integration**
Add this single line to your Chatty server startup:

```javascript
// In your Chatty server file (server/server.js or similar)
require('./vvaultConnector/auto-enable');
```

That's it! All conversations will now be automatically stored in VVAULT.

## Overview

The VVAULT Connector ensures all user conversations in Chatty are **automatically** stored in VVAULT through a local, backend-only system. It provides:

- **Automatic integration** - No manual code required
- **Append-only storage** - No deletions or edits allowed
- **Structured memory retrieval** - Read .json capsule files
- **Secure transcript storage** - Write-only .txt files
- **Robust error handling** - Retry logic and validation
- **Profile isolation** - User-specific storage
- **Non-blocking** - No performance impact on Chatty

## Installation

```bash
# The connector is already included in the Chatty project
cd /path/to/chatty
npm install
```

## Quick Start

### **Automatic Integration (Recommended)**
```javascript
// Simply add this line to your Chatty server startup
require('./vvaultConnector/auto-enable');

// That's it! All conversations are now automatically stored in VVAULT
```

### **Manual Integration (Advanced)**
```javascript
const { VVAULTConnector } = require('./vvaultConnector');

// Create connector instance
const connector = new VVAULTConnector({
    vvaultPath: '/path/to/VVAULT'  // Optional, defaults to ../VVAULT
});

// Initialize
await connector.initialize();

// Write a transcript
await connector.writeTranscript({
    userId: 'user123',
    sessionId: 'session456', 
    timestamp: '2025-01-27T10:30:00Z',
    role: 'user',
    content: 'Hello, how are you today?',
    emotionScores: { joy: 0.8, surprise: 0.2 }
});

// Read memories
const memories = await connector.readMemories('user123', { limit: 10 });
```

## API Reference

### VVAULTConnector Class

#### `new VVAULTConnector(options)`
Create a new connector instance.

**Options:**
- `vvaultPath` (string): Path to VVAULT directory (default: `../VVAULT`)

#### `async initialize()`
Initialize the connector and ensure directory structure exists.

#### `async writeTranscript(params)`
Write a conversation transcript to VVAULT.

**Parameters:**
- `userId` (string): User identifier
- `sessionId` (string): Session identifier
- `timestamp` (string): ISO timestamp
- `role` (string): Message role ('user', 'assistant', 'system')
- `content` (string): Message content
- `emotionScores` (object, optional): Emotion analysis scores

**Returns:** Promise with write result and metadata

#### `async readMemories(userId, options)`
Read memories from VVAULT.

**Parameters:**
- `userId` (string): User identifier
- `options` (object, optional):
  - `limit` (number): Maximum memories to return (default: 10)
  - `sessionId` (string): Filter by session
  - `role` (string): Filter by role
  - `since` (Date): Only memories since this date
  - `until` (Date): Only memories until this date

**Returns:** Promise with array of memory objects

#### `async getUserSessions(userId)`
Get list of user sessions.

**Returns:** Promise with array of session objects

#### `async getSessionTranscripts(userId, sessionId)`
Get transcripts for a specific session.

**Returns:** Promise with array of transcript objects

#### `async healthCheck()`
Check connector health status.

**Returns:** Promise with health status object

## Directory Structure

The connector creates the following VVAULT structure:

```
/vvault/
  /users/
    <userId>/
      /transcripts/
        <sessionId>/
          2025-01-27T10-30-00Z_user.txt
          2025-01-27T10-30-01Z_assistant.txt
      /capsules/
        <capsuleId>.json
```

## File Formats

### Transcript Files (.txt)
```
# Timestamp: 2025-01-27T10:30:00Z
# Role: user
# User: user123
# Session: session456
# Emotions: {"joy":0.8,"surprise":0.2}
# ---

Hello, how are you today?
```

### Capsule Files (.json)
```json
{
  "memory_id": "mem_1234567890",
  "source_id": "chatty_session456",
  "created_ts": "2025-01-27T10:30:00Z",
  "raw": "Hello, how are you today?",
  "raw_sha256": "abc123...",
  "embed_model": "all-MiniLM-L6-v2:1.0.0",
  "embedding": [0.1, 0.2, ...],
  "consent": "self",
  "tags": ["conversation", "greeting"]
}
```

## Security Features

- **Append-only writes** - Files cannot be overwritten
- **User isolation** - Each user has separate storage
- **Content validation** - Input sanitization and validation
- **Error handling** - Robust retry logic
- **Integrity checks** - File hash verification

## Error Handling

The connector includes comprehensive error handling:

- **Retry logic** - Automatic retries with exponential backoff
- **Validation** - Input parameter validation
- **Graceful degradation** - Fallback to transcript storage
- **Detailed logging** - Debug and error logging

## Configuration

The connector can be configured via environment variables or options:

```javascript
const connector = new VVAULTConnector({
    vvaultPath: process.env.VVAULT_PATH || '/path/to/VVAULT',
    security: {
        appendOnly: true,
        filePermissions: 0o644
    },
    logging: {
        debug: process.env.NODE_ENV === 'development'
    }
});
```

## Integration with Chatty

See `integration-example.js` for a complete example of integrating the connector with Chatty's conversation system.
