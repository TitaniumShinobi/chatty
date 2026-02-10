/**
 * Markdown Writer for Chatty conversation files
 * Writes individual conversation markdown files with IMPORT_METADATA
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ParsedConversation } from './htmlParser';

export interface ImportMeta {
  source: string;
  importedAt: string; // ISO8601
  importSourceFilename: string;
  importedBy: string;
  runtimeId: string;
  constructId: string;
  conversationId: string;
  conversationTitle: string;
}

export interface WriteOptions {
  overwrite?: boolean;
  dedupe?: 'byConversationId' | 'byTitle' | 'none';
  relativeSubdir?: string;
  customFileName?: string;
}

export interface WriteResult {
  filename: string;
  conversationId: string;
  title: string;
  skipped?: boolean;
  error?: string;
}

/**
 * Convert parsed conversation to markdown format with IMPORT_METADATA
 */
export async function convertToMarkdown(
  parsed: ParsedConversation,
  meta: ImportMeta
): Promise<{ filename: string; content: string; conversationId: string }> {
  const conversationId = parsed.conversationId || meta.conversationId || generateConversationId();
  const title = parsed.title || meta.conversationTitle || 'Untitled Conversation';
  
  // Generate filename: chat_with_{constructId}-{NNN}.md
  // NNN will be determined during write
  const constructBase = meta.constructId.replace(/-001$/, ''); // Remove callsign if present
  const filename = `chat_with_${constructBase}-{NNN}.md`; // Placeholder, will be replaced
  
  // Build IMPORT_METADATA block
  const importMetadata = buildImportMetadata(meta, conversationId, title);
  
  // Build markdown content
  const markdownContent = buildMarkdownContent(parsed, title, importMetadata);
  
  return {
    filename,
    content: markdownContent,
    conversationId
  };
}

/**
 * Write conversation file to VVAULT structure
 */
export async function writeConversationFile(
  destRoot: string,
  shardId: string,
  userId: string,
  constructId: string,
  filenameTemplate: string,
  content: string,
  options: WriteOptions = {}
): Promise<string> {
  const instanceDir = path.join(destRoot, 'users', shardId, userId, 'instances', constructId);
  const destinationDir = options.relativeSubdir
    ? path.join(instanceDir, sanitizeSubdir(options.relativeSubdir))
    : path.join(instanceDir, 'chatty');
  
  await fs.mkdir(destinationDir, { recursive: true });
  
  let finalFilename: string;
  if (options.customFileName) {
    finalFilename = await ensureUniqueCustomFilename(destinationDir, options.customFileName);
  } else {
    const sequence = await getNextSequenceNumber(destinationDir, constructId, options);
    finalFilename = filenameTemplate.replace('{NNN}', sequence);
  }
  const filePath = path.join(destinationDir, finalFilename);
  
  // Check for duplicates if dedupe is enabled
  if (options.dedupe && options.dedupe !== 'none') {
    const existing = await findExistingConversation(destinationDir, content, options.dedupe);
    if (existing && !options.overwrite) {
      throw new Error(`Conversation already exists: ${existing}`);
    }
  }
  
  // Atomic write: write to temp file then rename
  const tempFile = path.join(destinationDir, `.${finalFilename}.tmp`);
  
  try {
    // Write to temp file
    await fs.writeFile(tempFile, content, { encoding: 'utf-8', flag: 'w' });
    
    // Rename to final file (atomic on most filesystems)
    await fs.rename(tempFile, filePath);
    
    console.log(`✅ [markdownWriter] Wrote conversation file: ${filePath}`);
    return path.relative(instanceDir, filePath);
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.unlink(tempFile);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Get next available sequence number for conversation file
 */
async function getNextSequenceNumber(
  destinationDir: string,
  constructId: string,
  options: WriteOptions
): Promise<string> {
  try {
    const files = await fs.readdir(destinationDir);
    const constructBase = constructId.replace(/-001$/, '');
    const pattern = new RegExp(`^chat_with_${constructBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d{3})\\.md$`);
    
    const sequences: number[] = [];
    
    for (const file of files) {
      const match = file.match(pattern);
      if (match) {
        sequences.push(parseInt(match[1], 10));
      }
    }
    
    if (sequences.length === 0) {
      return '001';
    }
    
    const maxSequence = Math.max(...sequences);
    const nextSequence = maxSequence + 1;
    
    return String(nextSequence).padStart(3, '0');
  } catch (error) {
    // Directory doesn't exist or can't read - start at 001
    return '001';
  }
}

/**
 * Find existing conversation file if deduplication is enabled
 */
async function findExistingConversation(
  destinationDir: string,
  content: string,
  dedupeMode: 'byConversationId' | 'byTitle'
): Promise<string | null> {
  try {
    const files = await fs.readdir(destinationDir);
    
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      
      try {
        const filePath = path.join(destinationDir, file);
        const fileContent = await fs.readFile(filePath, 'utf-8');
        
        if (dedupeMode === 'byConversationId') {
          // Extract conversationId from IMPORT_METADATA
          const metaMatch = fileContent.match(/conversationId:\s*([^\n]+)/);
          const contentMetaMatch = content.match(/conversationId:\s*([^\n]+)/);
          
          if (metaMatch && contentMetaMatch && metaMatch[1].trim() === contentMetaMatch[1].trim()) {
            return file;
          }
        } else if (dedupeMode === 'byTitle') {
          // Extract title from IMPORT_METADATA
          const metaMatch = fileContent.match(/conversationTitle:\s*"([^"]+)"/);
          const contentMetaMatch = content.match(/conversationTitle:\s*"([^"]+)"/);
          
          if (metaMatch && contentMetaMatch && metaMatch[1] === contentMetaMatch[1]) {
            return file;
          }
        }
      } catch {
        // Skip files we can't read
        continue;
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Build IMPORT_METADATA HTML comment block
 */
function buildImportMetadata(meta: ImportMeta, conversationId: string, title: string): string {
  return `<!-- IMPORT_METADATA
source: ${meta.source}
importedAt: ${meta.importedAt}
importSourceFilename: ${meta.importSourceFilename}
importedBy: ${meta.importedBy}
runtimeId: ${meta.runtimeId}
constructId: ${meta.constructId}
conversationId: ${conversationId}
conversationTitle: "${title.replace(/"/g, '\\"')}"
-->`;
}

/**
 * Build markdown content from parsed conversation
 */
function buildMarkdownContent(
  parsed: ParsedConversation,
  title: string,
  importMetadata: string
): string {
  const lines: string[] = [];
  
  // Add IMPORT_METADATA block
  lines.push(importMetadata);
  lines.push('');
  
  // Add title header
  lines.push(`# ${title}`);
  lines.push('');
  
  // Add messages
  for (const message of parsed.messages) {
    const timestamp = message.timestamp 
      ? `[${message.timestamp}] `
      : '';
    
    const roleLabel = message.role === 'user' ? 'User' :
                      message.role === 'assistant' ? 'Assistant' :
                      'System';
    
    lines.push(`${timestamp}**${roleLabel}**: ${escapeMarkdown(message.text)}`);
    lines.push('');
  }
  
  // Normalize line endings and ensure trailing newline
  return lines.join('\n').replace(/\r\n/g, '\n') + '\n';
}

/**
 * Escape markdown special characters
 */
function escapeMarkdown(text: string): string {
  // Preserve markdown formatting if already present
  if (text.includes('**') || text.includes('*') || text.includes('`') || text.includes('[')) {
    // Keep as-is but ensure newlines are handled
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
  
  // For plain text, preserve newlines but escape special markdown chars
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

/**
 * Generate conversation ID if missing
 */
function generateConversationId(): string {
  const { randomBytes } = require('crypto');
  return randomBytes(16).toString('hex');
}

function sanitizeSubdir(relativePath: string): string {
  return relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map(segment => segment.replace(/^\.+$/, '').replace(/[<>:"|?*]/g, '').trim())
    .filter(Boolean)
    .join(path.sep);
}

async function ensureUniqueCustomFilename(baseDir: string, rawName: string): Promise<string> {
  const base = sanitizeFileName(rawName);
  const hasExtension = base.toLowerCase().endsWith('.md');
  const nameWithoutExt = hasExtension ? base.slice(0, -3) : base;
  let candidate = hasExtension ? base : `${nameWithoutExt}.md`;
  let counter = 1;

  while (await pathExists(path.join(baseDir, candidate))) {
    counter += 1;
    candidate = `${nameWithoutExt}-${counter}.md`;
  }

  return candidate;
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned || 'conversation';
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
