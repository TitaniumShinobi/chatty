/**
 * HTML-to-Markdown Importer for Multi-Runtime Chat Workspace
 * 
 * Parses conversations.html and writes each conversation as a .md file
 * to chronological directory structure: /instances/{instanceId}/{year}/{month}/{title}.md
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { parseHtmlConversations, ParsedConversation } from './htmlParser.js';

export interface HtmlImportContext {
  userId: string;
  email: string;
  provider: string;
  instanceId?: string;
  vvaultRoot?: string;
  shardId?: string;
}

export interface HtmlImportResult {
  created: number;
  files: string[]; // Array of created file paths for debugging
  errors: Array<{ conversation: string; error: string }>;
}

/**
 * Process HTML import and write markdown files to chronological directory structure
 * 
 * @param html - HTML content from conversations.html
 * @param context - Context object with userId, email, provider
 * @returns Number of files created
 */
export async function processHtmlImport(
  html: string,
  context: HtmlImportContext
): Promise<HtmlImportResult> {
  const {
    userId,
    email,
    provider = 'chatgpt',
    instanceId,
    vvaultRoot,
    shardId = 'shard_0000'
  } = context;

  if (!userId || !email || !provider) {
    throw new Error('Missing required context: userId, email, and provider are required');
  }

  // Get VVAULT_ROOT from config if not provided
  let finalVvaultRoot = vvaultRoot;
  if (!finalVvaultRoot) {
    try {
      // Try to require VVAULT_ROOT from config (CommonJS module)
      const configModule = await import('../../vvaultConnector/config.js');
      const config = configModule.default || configModule;
      finalVvaultRoot = config.VVAULT_ROOT || process.env.VVAULT_ROOT_PATH || '/Users/devonwoodson/Documents/GitHub/vvault';
    } catch (error) {
      // Fallback to default
      finalVvaultRoot = process.env.VVAULT_ROOT_PATH || '/Users/devonwoodson/Documents/GitHub/vvault';
      console.warn(`⚠️ [htmlMarkdownImporter] Could not load VVAULT_ROOT from config, using: ${finalVvaultRoot}`);
    }
  }

  // Determine instanceId: default to {provider}-{email_username}
  const finalInstanceId = instanceId || buildInstanceId(provider, email);
  
  console.log(`📥 [htmlMarkdownImporter] Processing HTML import`);
  console.log(`   userId: ${userId}`);
  console.log(`   email: ${email}`);
  console.log(`   provider: ${provider}`);
  console.log(`   instanceId: ${finalInstanceId}`);
  console.log(`   vvaultRoot: ${finalVvaultRoot}`);
  console.log(`   shardId: ${shardId}`);

  // Verify VVAULT root exists
  try {
    await fs.access(finalVvaultRoot);
    console.log(`✅ [htmlMarkdownImporter] VVAULT root exists: ${finalVvaultRoot}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [htmlMarkdownImporter] VVAULT root does not exist: ${finalVvaultRoot}`);
    throw new Error(`VVAULT root directory not accessible: ${finalVvaultRoot} - ${errorMessage}`);
  }

  // Parse HTML to extract conversations
  console.log(`🔍 [htmlMarkdownImporter] Parsing HTML content...`);
  const conversations = await parseHtmlConversations(html);
  
  if (conversations.length === 0) {
    console.warn('⚠️ [htmlMarkdownImporter] No conversations found in HTML');
    return { created: 0, files: [], errors: [] };
  }

  console.log(`✅ [htmlMarkdownImporter] Found ${conversations.length} conversations`);

  // Build base path: {vvaultRoot}/users/shard_0000/{userId}/instances/{instanceId}
  const basePath = path.join(
    finalVvaultRoot,
    'users',
    shardId,
    userId,
    'instances',
    finalInstanceId
  );

  console.log(`📁 [htmlMarkdownImporter] Base path: ${basePath}`);

  // Ensure base directory exists
  try {
    await fs.mkdir(basePath, { recursive: true });
    console.log(`✅ [htmlMarkdownImporter] Base directory created/verified: ${basePath}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [htmlMarkdownImporter] Failed to create base directory: ${errorMessage}`);
    throw new Error(`Failed to create base directory: ${basePath} - ${errorMessage}`);
  }

  let createdCount = 0;
  const createdFiles: string[] = [];
  const errors: Array<{ conversation: string; error: string }> = [];

  // Process each conversation
  for (let i = 0; i < conversations.length; i++) {
    const conversation = conversations[i];
    const conversationTitle = conversation.title || `Conversation ${i + 1}`;
    
    try {
      // Determine year/month from conversation timestamp or use current date
      const { year, month } = extractDateFromConversation(conversation);
      
      // Build directory path: {basePath}/{year}/{month}
      const conversationDir = path.join(basePath, year, month);
      
      console.log(`📂 [htmlMarkdownImporter] Creating directory: ${conversationDir}`);
      await fs.mkdir(conversationDir, { recursive: true });
      
      // Sanitize title for filename
      const sanitizedTitle = sanitizeFileName(conversationTitle);
      if (!sanitizedTitle || sanitizedTitle === 'conversation') {
        // Use conversation index if title is invalid
        const fallbackTitle = `conversation-${i + 1}`;
        console.warn(`⚠️ [htmlMarkdownImporter] Invalid title for conversation ${i + 1}, using: ${fallbackTitle}`);
      }
      
      const filename = `${sanitizedTitle || `conversation-${i + 1}`}.md`;
      const filePath = path.join(conversationDir, filename);
      
      console.log(`📝 [htmlMarkdownImporter] Processing: ${filename}`);
      console.log(`   Full path: ${filePath}`);
      
      // Check if file already exists
      try {
        await fs.access(filePath);
        console.log(`⏭️ [htmlMarkdownImporter] Skipping existing file: ${filename}`);
        continue;
      } catch {
        // File doesn't exist, proceed
      }
      
      // Build markdown content with fenced JSON metadata
      const markdownContent = buildMarkdownWithMetadata(conversation, provider, finalInstanceId);
      
      if (!markdownContent || markdownContent.trim().length === 0) {
        throw new Error('Generated markdown content is empty');
      }
      
      console.log(`💾 [htmlMarkdownImporter] Writing file (${markdownContent.length} bytes)...`);
      
      // Write file atomically
      const tempPath = path.join(conversationDir, `.${filename}.tmp`);
      await fs.writeFile(tempPath, markdownContent, 'utf-8');
      
      // Verify temp file was written
      const stats = await fs.stat(tempPath);
      if (stats.size === 0) {
        throw new Error('Temporary file is empty after write');
      }
      
      await fs.rename(tempPath, filePath);
      
      // Verify final file exists
      const finalStats = await fs.stat(filePath);
      console.log(`✅ [htmlMarkdownImporter] File created successfully: ${filePath} (${finalStats.size} bytes)`);
      
      createdFiles.push(filePath);
      createdCount++;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`❌ [htmlMarkdownImporter] Failed to process conversation ${i + 1} (${conversationTitle}):`, errorMessage);
      if (errorStack) {
        console.error(`   Stack: ${errorStack}`);
      }
      errors.push({ conversation: conversationTitle, error: errorMessage });
      // Continue with next conversation
    }
  }

  console.log(`\n✅ [htmlMarkdownImporter] Import complete:`);
  console.log(`   Created: ${createdCount}/${conversations.length} files`);
  console.log(`   Errors: ${errors.length}`);
  if (createdFiles.length > 0) {
    console.log(`\n📄 Created files:`);
    createdFiles.forEach((file, idx) => {
      console.log(`   ${idx + 1}. ${file}`);
    });
  }
  
  return { created: createdCount, files: createdFiles, errors };
}

/**
 * Build instance ID from provider and email
 * @param provider - Provider name (e.g., 'chatgpt')
 * @param email - User email (e.g., 'devon@thewreck.org')
 * @returns Instance ID (e.g., 'chatgpt-devon')
 */
function buildInstanceId(provider: string, email: string): string {
  const emailHandle = email.split('@')[0];
  const sanitizedProvider = sanitizeInstanceId(provider);
  const sanitizedHandle = sanitizeInstanceId(emailHandle);
  return `${sanitizedProvider}-${sanitizedHandle}`;
}

/**
 * Sanitize instance ID component
 * @param value - Value to sanitize
 * @returns Sanitized value
 */
function sanitizeInstanceId(value: string | null | undefined): string {
  if (!value) return 'runtime';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'runtime';
}

/**
 * Extract date from conversation to determine year/month
 * @param conversation - Parsed conversation object
 * @returns Year and month segments
 */
function extractDateFromConversation(conversation: ParsedConversation): { year: string; month: string } {
  // Try to find timestamp from messages
  let date: Date | null = null;
  
  // Check metadata first
  if (conversation.metadata?.createdAt) {
    date = new Date(conversation.metadata.createdAt);
  } else if (conversation.metadata?.updatedAt) {
    date = new Date(conversation.metadata.updatedAt);
  }
  
  // Check messages for timestamps
  if (!date || isNaN(date.getTime())) {
    for (const message of conversation.messages || []) {
      if (message.timestamp) {
        const parsed = new Date(message.timestamp);
        if (!isNaN(parsed.getTime())) {
          date = parsed;
          break;
        }
      }
    }
  }
  
  // Default to current date if no timestamp found
  if (!date || isNaN(date.getTime())) {
    date = new Date();
  }
  
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  
  return { year, month };
}

/**
 * Sanitize file name (remove slashes, emojis, special characters)
 * @param title - Original title
 * @returns Sanitized filename (without extension)
 */
function sanitizeFileName(title: string | undefined): string {
  if (!title) return 'conversation';
  
  return title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // Remove invalid filename characters
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, 100) // Limit length
    || 'conversation';
}

/**
 * Build markdown content with fenced JSON metadata
 * @param conversation - Parsed conversation object
 * @param provider - Provider name
 * @param instanceId - Instance ID
 * @returns Markdown content
 */
function buildMarkdownWithMetadata(
  conversation: ParsedConversation,
  provider: string,
  instanceId: string
): string {
  const lines: string[] = [];
  
  // Add fenced JSON metadata at the top
  const metadata = {
    importedFrom: provider,
    instanceId: instanceId
  };
  
  lines.push('```json');
  lines.push(JSON.stringify(metadata, null, 2));
  lines.push('```');
  lines.push('');
  
  // Add conversation title as H1
  const title = conversation.title || 'Untitled Conversation';
  lines.push(`# ${title}`);
  lines.push('');
  
  // Add messages
  for (const message of conversation.messages || []) {
    const roleLabel = message.role === 'user' ? 'You' : 'Assistant';
    const timestamp = message.timestamp ? `[${formatTimestamp(message.timestamp)}] ` : '';
    
    lines.push(`${timestamp}**${roleLabel} said:**`);
    lines.push('');
    lines.push(message.text || '');
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Format timestamp for display
 * @param timestamp - Timestamp to format
 * @returns Formatted timestamp
 */
function formatTimestamp(timestamp: string | Date | undefined): string {
  if (!timestamp) return '';
  try {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    if (isNaN(date.getTime())) return '';
    return date.toISOString().replace('T', ' ').substring(0, 19);
  } catch {
    return '';
  }
}

