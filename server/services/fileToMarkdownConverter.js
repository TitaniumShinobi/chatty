/**
 * File to Markdown Converter
 * Converts PDF, DOCX, TXT files to markdown and stores in VVAULT
 * 
 * Storage: instances/{runtimeId}/{service_provider}/{filename}.md
 */

import fs from 'fs/promises';
import path from 'path';
import { VVAULT_ROOT } from '../../vvaultConnector/config.js';
import { resolveVVAULTUserId } from '../../vvaultConnector/writeTranscript.js';
import { ServerFileParser } from '../lib/serverFileParser.js';

/**
 * Convert file to markdown and store in VVAULT
 * @param {Object} file - File object (from multer or file upload)
 * @param {string} runtimeId - Runtime ID (e.g., "chatgpt-devon-001")
 * @param {string} serviceProvider - Service provider (e.g., "chatgpt", "gemini", "chatty")
 * @param {string} userId - Chatty user ID
 * @param {string} email - User email (for VVAULT user resolution)
 * @param {string} shardId - Shard ID (default: "shard_0000")
 * @returns {Promise<{success: boolean, filePath: string, markdown: string}>}
 */
export async function convertFileToMarkdown({
  file,
  runtimeId,
  serviceProvider,
  userId,
  email,
  shardId = 'shard_0000'
}) {
  try {
    console.log(`📄 [fileToMarkdownConverter] Converting file: ${file.originalname || file.name}`);
    console.log(`   Runtime: ${runtimeId}, Provider: ${serviceProvider}`);
    
    // Resolve VVAULT user ID
    const vvaultUserId = await resolveVVAULTUserId(userId, email);
    if (!vvaultUserId) {
      throw new Error(`Cannot resolve VVAULT user ID for: ${userId} (email: ${email || 'none'})`);
    }
    
    // Parse file to extract text
    const parsed = await ServerFileParser.parseFile(file, {
      maxSize: 10 * 1024 * 1024, // 10MB
      extractText: true,
      storeContent: false // Don't store base64, we'll save as markdown
    });
    
    // Convert extracted text to markdown
    const markdown = convertTextToMarkdown(parsed.extractedText, file.originalname || file.name, parsed.metadata);
    
    // Build storage path: instances/{runtimeId}/{service_provider}/{filename}.md
    const sanitizedProvider = sanitizeProviderName(serviceProvider);
    const sanitizedFilename = sanitizeFilename(file.originalname || file.name);
    const markdownFilename = `${sanitizedFilename}.md`;
    
    const storageDir = path.join(
      VVAULT_ROOT,
      'users',
      shardId,
      vvaultUserId,
      'instances',
      runtimeId,
      sanitizedProvider
    );
    
    const filePath = path.join(storageDir, markdownFilename);
    
    // Ensure directory exists
    await fs.mkdir(storageDir, { recursive: true });
    
    // Write markdown file
    await fs.writeFile(filePath, markdown, 'utf8');
    
    console.log(`✅ [fileToMarkdownConverter] Saved markdown: ${filePath}`);
    
    return {
      success: true,
      filePath,
      markdown,
      metadata: {
        originalName: file.originalname || file.name,
        originalType: file.mimetype || file.type,
        originalSize: file.size,
        provider: sanitizedProvider,
        runtimeId,
        wordCount: parsed.metadata.wordCount
      }
    };
  } catch (error) {
    console.error(`❌ [fileToMarkdownConverter] Failed to convert file:`, error);
    throw error;
  }
}

/**
 * Convert extracted text to markdown format
 * @param {string} text - Extracted text content
 * @param {string} filename - Original filename
 * @param {Object} metadata - File metadata
 * @returns {string} Markdown content
 */
function convertTextToMarkdown(text, filename, metadata) {
  const timestamp = new Date().toISOString();
  const title = path.basename(filename, path.extname(filename));
  
  // Build markdown with metadata header
  const markdown = `# ${title}

**Source File**: ${filename}
**Converted**: ${timestamp}
**Word Count**: ${metadata.wordCount || 0}
**File Category**: ${metadata.fileCategory || 'unknown'}

<!-- FILE_METADATA
sourceFile: ${filename}
convertedAt: ${timestamp}
wordCount: ${metadata.wordCount || 0}
fileCategory: ${metadata.fileCategory || 'unknown'}
programmingLanguage: ${metadata.programmingLanguage || 'none'}
complexity: ${metadata.complexity || 'unknown'}
-->

---

${text}
`;
  
  return markdown;
}

/**
 * Sanitize provider name for filesystem
 * @param {string} provider - Provider name (e.g., "ChatGPT", "chatgpt", "Gemini")
 * @returns {string} Sanitized provider name (e.g., "chatgpt", "gemini")
 */
function sanitizeProviderName(provider) {
  if (!provider) return 'chatty'; // Default to chatty
  
  return provider
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Sanitize filename for filesystem
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename (without extension)
 */
function sanitizeFilename(filename) {
  if (!filename) return 'untitled';
  
  const base = path.basename(filename, path.extname(filename));
  return base
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100); // Limit length
}

/**
 * Batch convert multiple files
 * @param {Array<Object>} files - Array of file objects
 * @param {string} runtimeId - Runtime ID
 * @param {string} serviceProvider - Service provider
 * @param {string} userId - Chatty user ID
 * @param {string} email - User email
 * @returns {Promise<Array<{success: boolean, filePath?: string, error?: string}>>}
 */
export async function convertFilesToMarkdown(files, runtimeId, serviceProvider, userId, email) {
  const results = [];
  
  for (const file of files) {
    try {
      const result = await convertFileToMarkdown({
        file,
        runtimeId,
        serviceProvider,
        userId,
        email
      });
      results.push({
        success: true,
        filePath: result.filePath,
        metadata: result.metadata
      });
    } catch (error) {
      console.error(`❌ [fileToMarkdownConverter] Failed to convert ${file.originalname || file.name}:`, error);
      results.push({
        success: false,
        error: error.message,
        filename: file.originalname || file.name
      });
    }
  }
  
  return results;
}

