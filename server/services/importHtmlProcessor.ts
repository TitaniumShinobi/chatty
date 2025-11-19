/**
 * Main HTML Import Processor
 * Orchestrates parsing, conversion, and writing of conversations.html to individual markdown files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { parseHtmlConversations, ParsedConversation } from './htmlParser';
import { convertToMarkdown, writeConversationFile, ImportMeta, WriteOptions } from './markdownWriter';
import { detectConstructName } from './constructNameDetector';

export interface ProcessContext {
  shardId: string;
  userId: string;
  userEmail?: string;
  runtimeId: string;
  constructId: string;
  source?: string; // Provider source (e.g., 'chatgpt', 'gemini') for construct name detection fallback
  importSourceFilename: string;
  importedBy: string;
}

export interface ProcessOptions {
  destRootPath: string;
  overwrite?: boolean;
  dedupe?: 'byConversationId' | 'byTitle' | 'none';
}

export interface ProcessSummary {
  created: Array<{ filename: string; conversationId: string; title: string }>;
  skipped: Array<{ filename: string; conversationId: string; title: string; reason: string }>;
  errors: Array<{ conversationId?: string; title?: string; error: string }>;
  totalProcessed: number;
  totalCreated: number;
  totalSkipped: number;
  totalErrors: number;
}

/**
 * Process conversations.html file and write individual markdown files
 * 
 * @param htmlPathOrContent - Path to conversations.html file or HTML content string
 * @param context - Context object with user/runtime/construct information
 * @param options - Processing options (destRootPath, overwrite, dedupe)
 * @returns Summary of processing results
 */
export async function processConversationsHtml(
  htmlPathOrContent: string,
  context: ProcessContext,
  options: ProcessOptions
): Promise<ProcessSummary> {
  const summary: ProcessSummary = {
    created: [],
    skipped: [],
    errors: [],
    totalProcessed: 0,
    totalCreated: 0,
    totalSkipped: 0,
    totalErrors: 0
  };

  try {
    // Read HTML content
    let htmlContent: string;
    if (await isFilePath(htmlPathOrContent)) {
      console.log(`📄 [importHtmlProcessor] Reading HTML file: ${htmlPathOrContent}`);
      htmlContent = await fs.readFile(htmlPathOrContent, 'utf-8');
    } else {
      htmlContent = htmlPathOrContent;
    }

    // Parse conversations from HTML
    console.log(`🔍 [importHtmlProcessor] Parsing HTML content...`);
    const parsedConversations = await parseHtmlConversations(htmlContent);
    
    if (parsedConversations.length === 0) {
      console.warn(`⚠️ [importHtmlProcessor] No conversations found in HTML`);
      return summary;
    }

    console.log(`✅ [importHtmlProcessor] Found ${parsedConversations.length} conversations`);

    // Detect construct name from conversation context (like ContinuityGPT)
    // Use first conversation to detect name, or scan all if needed
    // Extract email handle from userEmail for fallback format (e.g., "devon" from "devon@thewreck.org")
    const emailHandle = context.userEmail?.split('@')[0] || null;
    let detectedConstructName = context.constructId || buildDefaultInstanceId(context.source || 'chatgpt', emailHandle); // Start with provided constructId
    
    if (parsedConversations.length > 0) {
      // Try to detect name from first few conversations
      const sampleConversations = parsedConversations.slice(0, Math.min(3, parsedConversations.length));
      for (const conv of sampleConversations) {
        const detected = detectConstructName(conv, context.source || 'chatgpt', emailHandle || undefined);
        // If detected name is different from provider-emailHandle format, use it
        const providerEmailFormat = emailHandle ? `${context.source || 'chatgpt'}-${emailHandle}` : (context.source || 'chatgpt');
        if (detected && detected !== providerEmailFormat && detected !== context.source) {
          detectedConstructName = detected;
          console.log(`✅ [importHtmlProcessor] Detected construct name from conversation: "${detectedConstructName}"`);
          break;
        }
      }
      
      // If still using provider-emailHandle format, that's correct (e.g., "chatgpt-devon")
      if (!detectedConstructName) {
        detectedConstructName = buildDefaultInstanceId(context.source || 'chatgpt', emailHandle);
      } else if (detectedConstructName === context.constructId || detectedConstructName === (context.source || 'chatgpt')) {
        const providerName = buildDefaultInstanceId(context.source || 'chatgpt', emailHandle);
        detectedConstructName = providerName;
        console.log(`⚠️ [importHtmlProcessor] No construct name detected, using provider-emailHandle format: "${providerName}"`);
      }
    }
    
    const finalConstructId = sanitizeInstanceId(detectedConstructName);

    // Process each conversation
    const importedAt = new Date().toISOString();
    
    for (let i = 0; i < parsedConversations.length; i++) {
      const parsed = parsedConversations[i];
      summary.totalProcessed++;

      try {
        // Build import metadata with detected construct name
        const importMeta: ImportMeta = {
          source: context.source || 'chatgpt',
          importedAt,
          importSourceFilename: context.importSourceFilename,
          importedBy: context.importedBy,
          runtimeId: context.runtimeId,
          constructId: finalConstructId, // Use detected construct name
          conversationId: parsed.conversationId || generateConversationId(),
          conversationTitle: parsed.title || `Conversation ${i + 1}`
        };

        // Convert to markdown
        const { filename: templateFilename, content, conversationId } = await convertToMarkdown(parsed, importMeta);

        const { yearSegment, monthSegment } = determineDateSegments(parsed);
        const relativeSubdir = path.join(yearSegment, monthSegment);
        const customFileName = buildConversationFileName(importMeta.conversationTitle, conversationId);

        // Write file
        const writeOptions: WriteOptions = {
          overwrite: options.overwrite || false,
          dedupe: options.dedupe || 'byConversationId',
          relativeSubdir,
          customFileName
        };

        try {
          const relativePath = await writeConversationFile(
            options.destRootPath,
            context.shardId,
            context.userId,
            finalConstructId, // Use detected construct name
            templateFilename,
            content,
            writeOptions
          );

          summary.created.push({
            filename: relativePath,
            conversationId,
            title: importMeta.conversationTitle
          });
          summary.totalCreated++;

          console.log(`✅ [importHtmlProcessor] Created conversation ${i + 1}/${parsedConversations.length}: ${relativePath}`);

        } catch (writeError) {
          // Check if error is due to duplicate (skip)
          if (writeError instanceof Error && writeError.message.includes('already exists')) {
            summary.skipped.push({
              filename: templateFilename,
              conversationId,
              title: importMeta.conversationTitle,
              reason: 'duplicate'
            });
            summary.totalSkipped++;
            console.log(`⏭️ [importHtmlProcessor] Skipped duplicate conversation: ${importMeta.conversationTitle}`);
          } else {
            throw writeError;
          }
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ [importHtmlProcessor] Failed to process conversation ${i + 1}:`, errorMessage);
        
        summary.errors.push({
          conversationId: parsed.conversationId,
          title: parsed.title,
          error: errorMessage
        });
        summary.totalErrors++;
      }
    }

    console.log(`\n✅ [importHtmlProcessor] Processing complete:`);
    console.log(`   Created: ${summary.totalCreated}`);
    console.log(`   Skipped: ${summary.totalSkipped}`);
    console.log(`   Errors: ${summary.totalErrors}`);

    return summary;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [importHtmlProcessor] Fatal error:`, errorMessage);
    
    summary.errors.push({
      error: `Fatal error: ${errorMessage}`
    });
    summary.totalErrors++;

    return summary;
  }
}

/**
 * Check if string is a file path
 */
async function isFilePath(str: string): Promise<boolean> {
  try {
    const stats = await fs.stat(str);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Generate conversation ID
 */
function generateConversationId(): string {
  const { randomBytes } = require('crypto');
  return randomBytes(16).toString('hex');
}

function buildDefaultInstanceId(source: string, emailHandle?: string | null): string {
  const provider = sanitizeInstanceId(source || 'chatgpt');
  if (emailHandle) {
    const handle = sanitizeInstanceId(emailHandle);
    if (handle) {
      return `${provider}-${handle}`;
    }
  }
  return provider;
}

function sanitizeInstanceId(value?: string | null): string {
  if (!value) {
    return 'imported-runtime';
  }
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'imported-runtime';
}

function determineDateSegments(conversation: ParsedConversation): { yearSegment: string; monthSegment: string } {
  const date = extractConversationDate(conversation);
  if (!date) {
    return { yearSegment: 'undated', monthSegment: 'unknown' };
  }

  const formatter = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
  const yearSegment = String(date.getUTCFullYear());
  const monthSegment = formatter.format(date).toLowerCase();
  return { yearSegment, monthSegment };
}

function extractConversationDate(conversation: ParsedConversation): Date | null {
  const candidates: (string | undefined)[] = [
    conversation.metadata?.createdAt,
    conversation.metadata?.updatedAt,
    conversation.messages?.find(msg => !!msg.timestamp)?.timestamp
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }

  return null;
}

function buildConversationFileName(title: string, conversationId: string): string {
  const cleanedTitle = (title || 'conversation')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${cleanedTitle || 'conversation'}-${conversationId.slice(0, 8)}.md`;
}
