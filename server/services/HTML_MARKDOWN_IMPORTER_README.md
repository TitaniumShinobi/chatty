# HTML-to-Markdown Importer

## Overview

The HTML-to-Markdown Importer processes `conversations.html` files from ChatGPT (and other providers) and converts each conversation into individual markdown files stored in a chronological directory structure.

## Features

- ✅ Parses HTML conversations from ChatGPT exports
- ✅ Extracts each conversation as a separate `.md` file
- ✅ Organizes files chronologically: `{year}/{month}/{title}.md`
- ✅ Sanitizes file names (removes emojis, special characters, slashes)
- ✅ Includes fenced JSON metadata at the top of each file
- ✅ Defaults `instanceId` to `{provider}-{email_username}` format
- ✅ Handles missing timestamps (defaults to current date)

## File Structure

Files are written to:
```
/vvault/users/shard_0000/{userId}/instances/{instanceId}/{year}/{month}/{title}.md
```

### Example
For user `devon_woodson_123` with email `devon@thewreck.org` importing from ChatGPT:
```
/vvault/users/shard_0000/devon_woodson_123/instances/chatgpt-devon/2024/01/Research Plan.md
```

## Usage

### Basic Usage

```typescript
import { processHtmlImport } from './htmlMarkdownImporter.js';

const htmlContent = await fs.readFile('conversations.html', 'utf-8');

const result = await processHtmlImport(htmlContent, {
  userId: 'devon_woodson_123',
  email: 'devon@thewreck.org',
  provider: 'chatgpt'
});

console.log(`Created ${result.created} files`);
```

### With Custom Instance ID

```typescript
const result = await processHtmlImport(htmlContent, {
  userId: 'devon_woodson_123',
  email: 'devon@thewreck.org',
  provider: 'chatgpt',
  instanceId: 'my-custom-instance' // Override default
});
```

### With Custom VVAULT Root

```typescript
const result = await processHtmlImport(htmlContent, {
  userId: 'devon_woodson_123',
  email: 'devon@thewreck.org',
  provider: 'chatgpt',
  vvaultRoot: '/custom/vvault/path',
  shardId: 'shard_0001' // Custom shard
});
```

## Markdown Format

Each generated markdown file follows this structure:

```markdown
```json
{
  "importedFrom": "chatgpt",
  "instanceId": "chatgpt-devon"
}
```

# Conversation Title

[2024-01-15 10:30:00] **You said:**

I need help creating a research plan for my thesis.

[2024-01-15 10:31:00] **Assistant said:**

I'd be happy to help you create a research plan. Let's start by identifying your research question and objectives.

[2024-01-15 10:32:00] **You said:**

My research question is about the impact of AI on education.
```

## Configuration

### Context Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `userId` | ✅ Yes | - | User ID from the system |
| `email` | ✅ Yes | - | User email address |
| `provider` | ✅ Yes | `'chatgpt'` | Provider name (e.g., 'chatgpt', 'deepseek') |
| `instanceId` | ❌ No | `{provider}-{email_username}` | Custom instance ID |
| `vvaultRoot` | ❌ No | `'/vvault'` | VVAULT root directory path |
| `shardId` | ❌ No | `'shard_0000'` | Shard identifier |

### Instance ID Default

If `instanceId` is not provided, it defaults to:
```
{provider}-{email_username}
```

Examples:
- `devon@thewreck.org` + `chatgpt` → `chatgpt-devon`
- `alice@example.com` + `deepseek` → `deepseek-alice`

## File Name Sanitization

File names are sanitized to ensure filesystem compatibility:
- Removes invalid filename characters: `<>:"/\|?*` and control characters
- Removes emojis (Unicode range U+1F300-U+1F9FF)
- Normalizes whitespace
- Limits length to 100 characters
- Falls back to `conversation` if title is empty

## Date Extraction

The system determines the year/month directory from:
1. Conversation metadata (`createdAt` or `updatedAt`)
2. Message timestamps (first available)
3. Current date (fallback)

## Error Handling

- Individual conversation failures don't stop the import process
- Existing files are skipped (no overwrite by default)
- Errors are logged to console with conversation index
- Returns count of successfully created files

## Testing

Run the test file:
```bash
npx tsx server/services/htmlMarkdownImporter.test.ts
```

Or import and use programmatically:
```typescript
import { testHtmlImport } from './htmlMarkdownImporter.test.js';
await testHtmlImport();
```

## Integration

This importer can be integrated into the existing import flow:

```typescript
// In importService.js or similar
import { processHtmlImport } from './htmlMarkdownImporter.js';

// When processing HTML files
if (htmlFile) {
  const htmlContent = await htmlFile.async('string');
  const result = await processHtmlImport(htmlContent, {
    userId,
    email: identity?.email,
    provider: source,
    vvaultRoot: VVAULT_ROOT
  });
  console.log(`Imported ${result.created} conversations`);
}
```

## Notes

- The HTML file is parsed in-memory and not saved permanently
- Files are written atomically (temp file → rename) to prevent corruption
- Directory structure is created recursively as needed
- No conversations.html file is saved - only the extracted markdown files

