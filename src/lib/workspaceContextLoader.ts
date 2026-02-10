/**
 * Workspace Context Loader
 * 
 * Scans chatgpt/** directories and chat_with_*.md files for workspace context.
 * Extracts dominant emotional tone and builds passive listening context for Lin.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';

export interface WorkspaceContext {
  chatgptFiles: Array<{
    path: string;
    content: string;
    timestamp: string;
  }>;
  chatWithFiles: Array<{
    path: string;
    content: string;
    timestamp: string;
  }>;
  dominantEmotionalTone: {
    primary: string;
    intensity: number;
    markers: string[];
  };
  passiveListeningContext: string;
}

/**
 * Scan chatgpt/** directories for conversation files
 */
async function scanChatgptDirectories(vvaultBasePath: string, userId: string): Promise<Array<{ path: string; content: string; timestamp: string }>> {
  const chatgptPattern = path.join(
    vvaultBasePath,
    'users',
    'shard_0000',
    userId,
    'instances',
    '**',
    'chatgpt',
    '**',
    '*.md'
  );

  try {
    const files = await glob(chatgptPattern, { absolute: true });
    const results = [];

    for (const filePath of files.slice(0, 20)) { // Limit to 20 files
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const stats = await fs.stat(filePath);
        results.push({
          path: filePath,
          content: content.substring(0, 5000), // Limit content size
          timestamp: stats.mtime.toISOString()
        });
      } catch (error) {
        console.warn(`⚠️ [WorkspaceLoader] Failed to read ${filePath}:`, error);
      }
    }

    return results;
  } catch (error) {
    console.warn(`⚠️ [WorkspaceLoader] Failed to scan chatgpt directories:`, error);
    return [];
  }
}

/**
 * Scan for chat_with_*.md files
 */
async function scanChatWithFiles(workspaceRoot: string = '/Users/devonwoodson/Documents/GitHub'): Promise<Array<{ path: string; content: string; timestamp: string }>> {
  const chatWithPattern = path.join(workspaceRoot, '**', 'chat_with_*.md');

  try {
    const files = await glob(chatWithPattern, { absolute: true });
    const results = [];

    for (const filePath of files.slice(0, 10)) { // Limit to 10 files
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const stats = await fs.stat(filePath);
        results.push({
          path: filePath,
          content: content.substring(0, 5000), // Limit content size
          timestamp: stats.mtime.toISOString()
        });
      } catch (error) {
        console.warn(`⚠️ [WorkspaceLoader] Failed to read ${filePath}:`, error);
      }
    }

    return results;
  } catch (error) {
    console.warn(`⚠️ [WorkspaceLoader] Failed to scan chat_with files:`, error);
    return [];
  }
}

/**
 * Extract dominant emotional tone from workspace threads
 */
function extractDominantEmotionalTone(
  chatgptFiles: Array<{ content: string }>,
  chatWithFiles: Array<{ content: string }>
): { primary: string; intensity: number; markers: string[] } {
  const allContent = [
    ...chatgptFiles.map(f => f.content),
    ...chatWithFiles.map(f => f.content)
  ].join('\n');

  // Emotional markers
  const emotionalMarkers = {
    'joy': ['happy', 'excited', 'great', 'wonderful', 'amazing', 'love', '💚', '✨', '😊'],
    'sadness': ['sad', 'disappointed', 'frustrated', 'difficult', 'struggling', '💔', '😢'],
    'anger': ['angry', 'furious', 'annoyed', 'frustrated', 'mad', '😠'],
    'fear': ['worried', 'anxious', 'concerned', 'scared', 'nervous', '😰'],
    'neutral': ['okay', 'fine', 'alright', 'sure', 'yes', 'no']
  };

  const scores: Record<string, number> = {};
  const foundMarkers: string[] = [];

  for (const [emotion, markers] of Object.entries(emotionalMarkers)) {
    let count = 0;
    for (const marker of markers) {
      const regex = new RegExp(marker, 'gi');
      const matches = allContent.match(regex);
      if (matches) {
        count += matches.length;
        foundMarkers.push(marker);
      }
    }
    scores[emotion] = count;
  }

  // Find dominant emotion
  const primary = Object.entries(scores).reduce((a, b) => scores[a[0]] > scores[b[0]] ? a : b)[0];
  const totalMarkers = Object.values(scores).reduce((a, b) => a + b, 0);
  const intensity = totalMarkers > 0 ? scores[primary] / totalMarkers : 0.5;

  return {
    primary,
    intensity: Math.min(intensity, 1.0),
    markers: foundMarkers.slice(0, 10) // Limit to 10 markers
  };
}

/**
 * Build passive listening context
 */
function buildPassiveListeningContext(
  chatgptFiles: Array<{ path: string; content: string }>,
  chatWithFiles: Array<{ path: string; content: string }>,
  dominantTone: { primary: string; intensity: number; markers: string[] }
): string {
  const contextParts: string[] = [];

  contextParts.push(`=== WORKSPACE CONTEXT (PASSIVE LISTENING MODE) ===`);
  contextParts.push(`Lin is observing workspace threads to maintain context awareness.`);
  contextParts.push(`\nDominant Emotional Tone: ${dominantTone.primary} (intensity: ${(dominantTone.intensity * 100).toFixed(0)}%)`);

  if (chatgptFiles.length > 0) {
    contextParts.push(`\nChatGPT Conversation Files: ${chatgptFiles.length} files scanned`);
    contextParts.push(`Recent files:`);
    chatgptFiles.slice(0, 3).forEach((file, idx) => {
      const fileName = path.basename(file.path);
      contextParts.push(`  ${idx + 1}. ${fileName}`);
    });
  }

  if (chatWithFiles.length > 0) {
    contextParts.push(`\nChat With Files: ${chatWithFiles.length} files scanned`);
    contextParts.push(`Recent files:`);
    chatWithFiles.slice(0, 3).forEach((file, idx) => {
      const fileName = path.basename(file.path);
      contextParts.push(`  ${idx + 1}. ${fileName}`);
    });
  }

  contextParts.push(`\n=== TONE MIRRORING INSTRUCTIONS ===`);
  contextParts.push(`Lin should mirror the dominant emotional tone (${dominantTone.primary}) unless explicitly overridden.`);
  contextParts.push(`Passive listening mode: Observe, don't dominate.`);
  contextParts.push(`Context absorption: Dynamically absorb open workspace threads.`);

  return contextParts.join('\n');
}

/**
 * Load workspace context for Lin
 */
export async function loadWorkspaceContext(
  userId: string,
  vvaultBasePath: string = '/Users/devonwoodson/Documents/GitHub/vvault',
  workspaceRoot: string = '/Users/devonwoodson/Documents/GitHub'
): Promise<WorkspaceContext> {
  console.log(`🔄 [WorkspaceLoader] Loading workspace context for user: ${userId}`);

  const [chatgptFiles, chatWithFiles] = await Promise.all([
    scanChatgptDirectories(vvaultBasePath, userId),
    scanChatWithFiles(workspaceRoot)
  ]);

  const dominantTone = extractDominantEmotionalTone(chatgptFiles, chatWithFiles);
  const passiveListeningContext = buildPassiveListeningContext(chatgptFiles, chatWithFiles, dominantTone);

  console.log(`✅ [WorkspaceLoader] Loaded workspace context:`);
  console.log(`   - ChatGPT files: ${chatgptFiles.length}`);
  console.log(`   - Chat with files: ${chatWithFiles.length}`);
  console.log(`   - Dominant tone: ${dominantTone.primary} (${(dominantTone.intensity * 100).toFixed(0)}%)`);

  return {
    chatgptFiles,
    chatWithFiles,
    dominantEmotionalTone: dominantTone,
    passiveListeningContext
  };
}

