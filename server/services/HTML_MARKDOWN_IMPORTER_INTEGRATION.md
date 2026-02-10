# HTML Markdown Importer Integration Guide

## Quick Fix: Use the New Importer

The new `htmlMarkdownImporter.ts` writes files to the correct chronological structure. To use it in `importService.js`, replace the existing HTML processor call:

### Option 1: Replace Existing HTML Processor (Recommended)

In `importService.js`, around line 1300, replace:

```javascript
const { processConversationsHtml } = await import('./importHtmlProcessor.js');
```

With:

```javascript
const { processHtmlImport } = await import('./htmlMarkdownImporter.js');
```

Then update the call:

```javascript
// OLD:
const summary = await processConversationsHtml(htmlContent, context, options);

// NEW:
const result = await processHtmlImport(htmlContent, {
  userId: vvaultUserId,
  email: identity?.email,
  provider: source || 'chatgpt',
  vvaultRoot: VVAULT_ROOT,
  shardId: 'shard_0000'
});

console.log(`✅ [persistImportToVVAULT] HTML importer created ${result.created} conversations`);
if (result.errors.length > 0) {
  console.warn(`⚠️ [persistImportToVVAULT] ${result.errors.length} errors during HTML processing:`);
  result.errors.forEach(err => {
    console.warn(`   - ${err.conversation}: ${err.error}`);
  });
}
```

### Option 2: Add as Alternative Path

Keep the existing processor but add the new one as a fallback or alternative:

```javascript
// Try new importer first
try {
  const { processHtmlImport } = await import('./htmlMarkdownImporter.js');
  const result = await processHtmlImport(htmlContent, {
    userId: vvaultUserId,
    email: identity?.email,
    provider: source || 'chatgpt',
    vvaultRoot: VVAULT_ROOT,
    shardId: 'shard_0000'
  });
  
  if (result.created > 0) {
    console.log(`✅ [persistImportToVVAULT] New importer created ${result.created} files`);
    return; // Success, exit early
  }
} catch (error) {
  console.warn(`⚠️ [persistImportToVVAULT] New importer failed, falling back to old processor:`, error);
  // Fall through to old processor
}
```

## Testing

### Run Diagnostic Test

```bash
npx tsx server/services/testHtmlMarkdownImporter.ts
```

This will:
1. Create test markdown files
2. Verify they're written to disk
3. Show file paths and sizes
4. Display any errors

### Manual Test

```javascript
import { processHtmlImport } from './htmlMarkdownImporter.js';
import * as fs from 'fs/promises';

// Read your conversations.html
const htmlContent = await fs.readFile('path/to/conversations.html', 'utf-8');

// Process it
const result = await processHtmlImport(htmlContent, {
  userId: 'devon_woodson_1762969514958',
  email: 'devon@thewreck.org',
  provider: 'chatgpt'
});

console.log(`Created ${result.created} files`);
console.log('Files:', result.files);
```

## Expected Output

Files should be created at:
```
/vvault/users/shard_0000/devon_woodson_1762969514958/instances/chatgpt-devon/2024/01/Test Conversation 1.md
/vvault/users/shard_0000/devon_woodson_1762969514958/instances/chatgpt-devon/2024/01/Test Conversation 2.md
```

## Debugging

If files aren't being created, check:

1. **VVAULT_ROOT path**: The function logs the path it's using. Verify it's correct.
2. **Permissions**: Ensure the process has write permissions to the VVAULT directory.
3. **Console logs**: The function logs each step - check for error messages.
4. **Return value**: Check `result.files` array - it contains all created file paths.

## Key Differences from Old Processor

- ✅ Writes to chronological structure: `{year}/{month}/{title}.md`
- ✅ Uses correct VVAULT_ROOT from config
- ✅ Returns list of created files for debugging
- ✅ Better error handling and logging
- ✅ Verifies files are actually written before returning

