# HTML Conversation Import Processor

Production-ready processor for extracting conversations from ChatGPT `conversations.html` files and converting them to individual markdown files in VVAULT structure.

## Overview

This processor:
1. Parses `conversations.html` to extract individual conversations
2. Converts each conversation to markdown format with `IMPORT_METADATA`
3. Writes individual files to VVAULT structure: `users/{shard}/{userId}/constructs/{constructId}/chatty/`
4. Handles deduplication, error recovery, and atomic writes

## Files

- `server/services/htmlParser.ts` - HTML parsing logic
- `server/services/markdownWriter.ts` - Markdown conversion and file writing
- `server/services/importHtmlProcessor.ts` - Main orchestrator
- `scripts/extract-conversations.ts` - CLI tool

## Usage

### CLI Usage

```bash
# Basic usage
node scripts/extract-conversations.js \
  --src path/to/conversations.html \
  --userId devon_woodson_1762969514958 \
  --runtimeId chatgpt-devon \
  --constructId chatgpt-devon-001 \
  --importedBy devon@thewreck.org

# With options
node scripts/extract-conversations.js \
  --src conversations.html \
  --userId devon_woodson_1762969514958 \
  --shardId shard_0000 \
  --userEmail devon@thewreck.org \
  --runtimeId chatgpt-devon \
  --constructId chatgpt-devon-001 \
  --importSourceFilename conversations.html \
  --importedBy devon@thewreck.org \
  --destRoot /path/to/vvault \
  --overwrite \
  --dedupe byConversationId
```

### Programmatic Usage

```typescript
import { processConversationsHtml, ProcessContext, ProcessOptions } from './server/services/importHtmlProcessor';

const context: ProcessContext = {
  shardId: 'shard_0000',
  userId: 'devon_woodson_1762969514958',
  userEmail: 'devon@thewreck.org',
  runtimeId: 'chatgpt-devon',
  constructId: 'chatgpt-devon-001',
  importSourceFilename: 'conversations.html',
  importedBy: 'devon@thewreck.org'
};

const options: ProcessOptions = {
  destRootPath: '/path/to/vvault',
  overwrite: false,
  dedupe: 'byConversationId'
};

const summary = await processConversationsHtml(
  '/path/to/conversations.html',
  context,
  options
);

console.log(`Created: ${summary.totalCreated}`);
console.log(`Skipped: ${summary.totalSkipped}`);
console.log(`Errors: ${summary.totalErrors}`);
```

### Integration with importService.js

**File**: `chatty/server/services/importService.js`

**Location**: In `persistImportToVVAULT()` function, replace the HTML parsing section (around line 1328-1343):

```javascript
// OLD CODE (lines 1328-1343):
// If no JSON conversations found, try HTML parsing
if (conversations.length === 0) {
  const htmlFiles = zip.file(/(^|\/)chat\.html$/i);
  if (htmlFiles?.length) {
    console.log('📄 [persistImportToVVAULT] Found conversations.html, parsing HTML...');
    const { parseHTMLConversations } = await import('./htmlConversationParser.js');
    const htmlContent = await htmlFiles[0].async("string");
    const htmlConversations = parseHTMLConversations(htmlContent, source);
    
    if (htmlConversations.length > 0) {
      console.log(`✅ [persistImportToVVAULT] Extracted ${htmlConversations.length} conversations from HTML`);
      conversations = htmlConversations;
    } else {
      console.warn('⚠️ [persistImportToVVAULT] No conversations extracted from HTML');
    }
  }
}

// REPLACE WITH:
// If no JSON conversations found, try HTML parsing with new processor
if (conversations.length === 0) {
  const htmlFiles = zip.file(/(^|\/)chat\.html$/i);
  if (htmlFiles?.length) {
    console.log('📄 [persistImportToVVAULT] Found conversations.html, using HTML processor...');
    
    try {
      const { processConversationsHtml } = await import('./importHtmlProcessor.js');
      const { VVAULT_ROOT } = require('../../vvaultConnector/config');
      const { resolveVVAULTUserId } = require('../../vvaultConnector/writeTranscript');
      
      // Resolve VVAULT user ID
      const vvaultUserId = await resolveVVAULTUserId(userId, identity?.email);
      if (!vvaultUserId) {
        throw new Error(`Cannot resolve VVAULT user ID for: ${userId}`);
      }
      
      // Get HTML content
      const htmlContent = await htmlFiles[0].async("string");
      
      // Build context
      const context = {
        shardId: 'shard_0000', // TODO: Calculate from userId if needed
        userId: vvaultUserId,
        userEmail: identity?.email,
        runtimeId: runtimeMetadata?.runtimeId || 'chatgpt-devon',
        constructId: runtimeMetadata?.constructId || 'chatgpt-devon-001',
        importSourceFilename: htmlFiles[0].name,
        importedBy: identity?.email || userId
      };
      
      // Build options
      const options = {
        destRootPath: VVAULT_ROOT,
        overwrite: false,
        dedupe: 'byConversationId'
      };
      
      // Process HTML
      const summary = await processConversationsHtml(htmlContent, context, options);
      
      console.log(`✅ [persistImportToVVAULT] HTML processor created ${summary.totalCreated} conversations`);
      console.log(`   Skipped: ${summary.totalSkipped}, Errors: ${summary.totalErrors}`);
      
      if (summary.totalErrors > 0) {
        console.warn(`⚠️ [persistImportToVVAULT] ${summary.totalErrors} errors during HTML processing:`);
        summary.errors.forEach(err => {
          console.warn(`   - ${err.title || 'Unknown'}: ${err.error}`);
        });
      }
      
      // Return early - HTML processor handles file writing directly
      return;
      
    } catch (error) {
      console.error(`❌ [persistImportToVVAULT] HTML processor failed:`, error);
      // Fall back to old parser if new processor fails
      console.log('🔄 [persistImportToVVAULT] Falling back to legacy HTML parser...');
      const { parseHTMLConversations } = await import('./htmlConversationParser.js');
      const htmlContent = await htmlFiles[0].async("string");
      const htmlConversations = parseHTMLConversations(htmlContent, source);
      if (htmlConversations.length > 0) {
        conversations = htmlConversations;
      }
    }
  }
}
```

**Note**: The new HTML processor writes files directly to VVAULT, so you don't need to call `convertConversationToTranscript()` or `writeTranscript()` for HTML imports. The processor handles everything.

## Output Format

### File Structure

```
vvault/users/{shard}/{userId}/constructs/{constructId}/chatty/
  chat_with_{constructId}-001.md
  chat_with_{constructId}-002.md
  chat_with_{constructId}-003.md
  ...
```

### Markdown Format

```markdown
<!-- IMPORT_METADATA
source: chatgpt
importedAt: 2025-11-13T18:00:00Z
importSourceFilename: conversations.html
importedBy: devon@thewreck.org
runtimeId: chatgpt-devon
constructId: chatgpt-devon-001
conversationId: original-12345
conversationTitle: "How to build X"
-->

# How to build X

[2025-11-13T18:00:00Z] **User**: Hello, how can I build X?

[2025-11-13T18:00:05Z] **Assistant**: To build X, you need to...
```

## Features

- ✅ Robust HTML parsing with multiple fallback strategies
- ✅ Role normalization (user/assistant/system)
- ✅ Automatic conversation ID generation
- ✅ Atomic file writes (temp file → rename)
- ✅ Deduplication by conversationId or title
- ✅ Error recovery (continues on individual failures)
- ✅ Comprehensive logging
- ✅ TypeScript types throughout

## Testing

```bash
# Run unit tests
npm test -- htmlParser.test.ts
npm test -- markdownWriter.test.ts

# Run integration tests
npm test -- extract.test.ts

# Run all tests
npm test
```

## Error Handling

The processor handles errors gracefully:
- Individual conversation failures don't abort the entire import
- Malformed HTML segments are logged and skipped
- File write errors are caught and reported in summary
- Duplicate detection prevents overwriting existing conversations

## Logging

The processor logs:
- Parsing progress (`🔍 Parsing HTML content...`)
- File creation (`✅ Created conversation 1/10: chat_with_...-001.md`)
- Skipped duplicates (`⏭️ Skipped duplicate conversation: ...`)
- Errors (`❌ Failed to process conversation: ...`)
- Summary (`✅ Processing complete: Created: 10, Skipped: 2, Errors: 0`)

## Summary Format

```typescript
{
  created: [
    { filename: 'chat_with_chatgpt-devon-001.md', conversationId: '...', title: '...' }
  ],
  skipped: [
    { filename: '...', conversationId: '...', title: '...', reason: 'duplicate' }
  ],
  errors: [
    { conversationId: '...', title: '...', error: '...' }
  ],
  totalProcessed: 12,
  totalCreated: 10,
  totalSkipped: 1,
  totalErrors: 1
}
```

## Dependencies

- `cheerio` - HTML parsing (already in `server/package.json`)
- Node.js built-in modules: `fs/promises`, `path`, `crypto`

No additional dependencies required!

## Implementation Summary

### ✅ Completed

1. **HTML Parser** (`htmlParser.ts`)
   - Robust parsing with multiple fallback strategies
   - Role normalization (user/assistant/system)
   - Automatic conversation ID generation
   - Handles missing titles, timestamps, malformed HTML

2. **Markdown Writer** (`markdownWriter.ts`)
   - Converts parsed conversations to markdown format
   - Adds IMPORT_METADATA block
   - Atomic file writes (temp → rename)
   - Sequence number management (001, 002, ...)
   - Deduplication support

3. **Main Processor** (`importHtmlProcessor.ts`)
   - Orchestrates parsing → conversion → writing
   - Error recovery (continues on individual failures)
   - Comprehensive logging
   - Returns detailed summary

4. **CLI Tool** (`scripts/extract-conversations.ts`)
   - Command-line interface for manual extraction
   - Full argument parsing
   - Progress reporting

5. **Tests**
   - Unit tests for parser (edge cases, role normalization)
   - Unit tests for writer (file creation, deduplication)
   - Integration tests (end-to-end flow)

### ⏳ Pending Integration

- [ ] Integrate into `importService.js` (see integration guide above)
- [ ] Test with real conversations.html file
- [ ] Verify files appear in frontend sidebar

## Quick Start

```bash
# Extract conversations from HTML file
npx tsx scripts/extract-conversations.ts \
  --src /path/to/conversations.html \
  --userId devon_woodson_1762969514958 \
  --runtimeId chatgpt-devon \
  --constructId chatgpt-devon-001 \
  --importedBy devon@thewreck.org

# Check created files
find vvault/users -path "*/chatgpt-devon-001/chatty/*.md" | head -10

# Verify IMPORT_METADATA
grep -A 10 "IMPORT_METADATA" vvault/users/.../chatgpt-devon-001/chatty/chat_with_chatgpt-devon-001.md
```

## Next Steps

1. **Integrate into importService.js** (see integration guide above)
2. **Test with real import**: Import a ChatGPT zip archive containing conversations.html
3. **Verify frontend**: Check that conversations appear in sidebar when runtime is selected
4. **Monitor logs**: Check server logs for processing summary and any errors

