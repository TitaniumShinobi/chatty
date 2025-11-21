/**
 * TypeScript scaffolding for import and canonical conversation management.
 * This file intentionally mirrors the existing JavaScript implementation but provides
 * typed entrypoints for the new runtime-aware pipeline (Katana-style).
 */

import path from 'path';
import fs from 'fs/promises';

export type PrimaryConversationParams = {
  constructId: string;
  runtimeId?: string;
  userId: string;
  email?: string;
  provider?: string;
  vvaultRoot?: string;
  shardId?: string;
};

/**
 * Create the canonical conversation markdown file for a runtime construct.
 * The file is placed at: /users/{shard}/{userId}/instances/{constructId}/chatty/chat_with_{constructId}.md
 * A metadata block is written to align runtime pinning and canonical detection.
 */
export async function createPrimaryConversationFile(params: PrimaryConversationParams): Promise<string> {
  const {
    constructId,
    runtimeId,
    userId,
    email,
    provider = 'chatgpt',
    vvaultRoot = process.env.VVAULT_ROOT || path.resolve(process.cwd(), 'vvault'),
    shardId = 'shard_0000'
  } = params;

  if (!constructId || !userId) {
    throw new Error('constructId and userId are required to create canonical conversation file');
  }

  const resolvedRuntimeId = runtimeId || constructId.replace(/-001$/, '') || constructId;
  const canonicalDir = path.join(vvaultRoot, 'users', shardId, userId, 'instances', constructId, 'chatty');
  const filePath = path.join(canonicalDir, `chat_with_${constructId}.md`);
  const sessionId = `${constructId}_chat_with_${constructId}`;
  const timestamp = new Date().toISOString();

  const metadataBlock = `<!-- IMPORT_METADATA
{
  "isPrimary": true,
  "constructId": "${constructId}",
  "runtimeId": "${resolvedRuntimeId}"
}
-->`;

  const header = `${metadataBlock}

# Chat with ${provider.charAt(0).toUpperCase() + provider.slice(1)}

**Created**: ${timestamp}  
**Session ID**: ${sessionId}  
**Construct**: ${constructId}

---
`;

  await fs.mkdir(canonicalDir, { recursive: true });
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    // fall through to write
  }

  await fs.writeFile(filePath, header, 'utf8');
  return filePath;
}

/**
 * Placeholder for HTML import processing.
 * In the rebuilt pipeline, this should normalize HTML exports to markdown and
 * call createPrimaryConversationFile after the import completes.
 */
export async function processHtmlImport(importPath: string, constructId: string, userId: string): Promise<string> {
  void importPath;
  // TODO: wire to htmlMarkdownImporter and persist transcripts
  return createPrimaryConversationFile({ constructId, userId });
}

/**
 * Placeholder for runtime bootstrap; retained for parity with Katana architecture.
 */
export async function bootstrapImports(): Promise<void> {
  // TODO: hook into zip importer and memory ingestion
}

export default {
  createPrimaryConversationFile,
  processHtmlImport,
  bootstrapImports
};
