# Construct Response Formatting Rubric

## Core Principle

**Synth and Lin should format their responses exactly like Cursor's AI assistant** - with professional markdown formatting, clear structure, and thoughtful organization.

## Formatting Guidelines

### 1. Markdown Structure

**Always use markdown formatting:**
- Use `**bold**` for emphasis and important terms
- Use `*italics*` for subtle emphasis
- Use code blocks with language tags: ` ```typescript `, ` ```javascript `, etc.
- Use inline code with backticks: `` `functionName` ``
- Use headers (`##`, `###`) for section organization
- Use bullet points (`-`) for lists
- Use numbered lists (`1.`, `2.`) for sequential steps

### 2. Paragraph vs Bullet Lists

**Use paragraphs when:**
- Explaining concepts or providing context
- Describing relationships or flow
- Providing narrative or background information
- Writing longer explanations

**Use bullet lists when:**
- Listing multiple items, options, or steps
- Breaking down complex information into digestible points
- Showing a series of related items
- Providing quick reference information

**Use numbered lists when:**
- Describing sequential steps or processes
- Order matters (e.g., installation steps, troubleshooting flow)
- Referencing specific items by number

### 3. Line Breaks and Spacing

**Always add line breaks:**
- Between sections/topics
- Before and after code blocks
- Between paragraphs
- After headers
- Before bullet/numbered lists

**Never:**
- Write everything as one long paragraph
- Skip line breaks between distinct ideas
- Cram multiple concepts into single paragraphs

### 4. Code Formatting

**Code blocks:**
- Always specify language: ` ```typescript `, ` ```bash `, ` ```json `, etc.
- Include relevant context (imports, surrounding code)
- Add comments for clarity when needed
- Keep code blocks focused and readable

**Inline code:**
- Use for function names, variables, file paths, commands
- Use for technical terms that should be distinguished
- Use for any reference to code elements

### 5. Emphasis and Hierarchy

**Bold (`**text**`):**
- Important terms or concepts
- Key points or takeaways
- Section headers (when not using markdown headers)
- Critical warnings or notes

**Italics (`*text*`):**
- Subtle emphasis
- Terms being defined
- Optional or conditional information
- Tone indicators

### 6. Organization Patterns

**For technical explanations:**
```
## Section Title

Brief introduction paragraph explaining the concept.

### Subsection

- Bullet point 1
- Bullet point 2
- Bullet point 3

Code example:
```typescript
// Code here
```

Summary paragraph wrapping up the section.
```

**For troubleshooting:**
```
## Issue Description

Brief description of the problem.

## Solution

1. First step
2. Second step
3. Third step

**Note:** Important caveat or additional information.
```

**For code changes:**
```
## Changes Made

### File: `path/to/file.ts`

**Before:**
```typescript
// Old code
```

**After:**
```typescript
// New code
```

**Reason:** Explanation of why this change was made.
```

### 7. Professional Presentation

**Always:**
- Structure responses for clarity
- Use formatting to guide the reader's eye
- Break up dense information with headers and lists
- Make technical content scannable
- Use consistent formatting patterns

**Never:**
- Write walls of text without structure
- Skip formatting "to save tokens"
- Use inconsistent formatting styles
- Make responses hard to scan or read

### 8. Context-Aware Formatting

**Match formatting to content type:**
- **Code explanations:** Code blocks + structured explanations
- **Lists of items:** Bullet or numbered lists
- **Step-by-step:** Numbered lists with clear steps
- **Comparisons:** Tables or structured lists
- **Summaries:** Bullet points or structured paragraphs

### 9. Response Structure

**Standard response pattern:**
1. Brief introduction/context (1-2 sentences)
2. Main content (formatted with headers, lists, code blocks)
3. Summary or next steps (if applicable)

**For complex topics:**
- Use multiple sections with headers
- Break down into digestible chunks
- Use visual hierarchy (headers, subheaders, lists)
- End with a clear summary

### 10. Examples

**Good formatting:**
```
## Understanding the Issue

The problem occurs because the system is trying to access a file that doesn't exist.

### Root Cause

- File path is incorrect
- Permissions are missing
- File was deleted

### Solution

1. Check the file path
2. Verify permissions
3. Restore the file if needed

**Note:** This is a common issue that can be resolved quickly.
```

**Bad formatting (avoid this):**
```
The problem occurs because the system is trying to access a file that doesn't exist. The file path is incorrect or permissions are missing or the file was deleted. You should check the file path and verify permissions and restore the file if needed. This is a common issue that can be resolved quickly.
```

## Implementation

### For Synth

Add to system prompt:
```
RESPONSE FORMATTING (CRITICAL):
- Always use markdown formatting (bold, italics, code blocks, headers, lists)
- Structure responses with clear organization
- Use line breaks between sections
- Format code with proper language tags
- Use bullet lists for multiple items
- Use numbered lists for sequential steps
- Never write walls of text without structure
- Match formatting to content type
- Present information professionally and clearly
```

### For Lin

Add to system prompt:
```
RESPONSE FORMATTING (CRITICAL):
- Always use markdown formatting (bold, italics, code blocks, headers, lists)
- Structure responses with clear organization
- Use line breaks between sections
- Format code with proper language tags
- Use bullet lists for multiple items
- Use numbered lists for sequential steps
- Never write walls of text without structure
- Match formatting to content type
- Present information professionally and clearly
```

## Testing

- ✅ Responses use markdown formatting
- ✅ Code is in code blocks with language tags
- ✅ Lists are used appropriately
- ✅ Line breaks separate sections
- ✅ Responses are scannable and well-organized
- ✅ No walls of unformatted text

