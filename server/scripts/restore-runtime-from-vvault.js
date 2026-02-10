#!/usr/bin/env node

/**
 * Restore Deleted Runtime from VVAULT
 * 
 * This script attempts to restore a deleted runtime by:
 * 1. Finding conversations in VVAULT
 * 2. Extracting import metadata from conversation headers
 * 3. Recreating the GPT entry in the database
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import GPT manager
const { GPTManager } = await import('../lib/gptManager.js');
const gptManager = GPTManager.getInstance();

const VVAULT_ROOT = path.join(__dirname, '../../../vvault');
const USER_ID = 'devon_woodson_1762969514958';
const USER_EMAIL = 'devon@thewreck.org';
const PROVIDER = 'ChatGPT';

async function findConversationsInVVAULT() {
  const userDir = path.join(VVAULT_ROOT, 'users', 'shard_0000', USER_ID, 'constructs');
  
  if (!fs.existsSync(userDir)) {
    console.error(`❌ User directory not found: ${userDir}`);
    return [];
  }
  
  const conversations = [];
  const constructs = fs.readdirSync(userDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
  
  console.log(`📁 Found ${constructs.length} constructs`);
  
  for (const construct of constructs) {
    const chattyDir = path.join(userDir, construct, 'chatty');
    if (!fs.existsSync(chattyDir)) continue;
    
    const files = fs.readdirSync(chattyDir)
      .filter(f => f.endsWith('.md') && f.startsWith('chat_with_'));
    
    for (const file of files) {
      const filePath = path.join(chattyDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Try to extract import metadata from header
      const metadataMatch = content.match(/<!-- IMPORT_METADATA\s+([\s\S]*?)\s+-->/);
      let importMetadata = null;
      
      if (metadataMatch) {
        try {
          importMetadata = JSON.parse(metadataMatch[1]);
        } catch (e) {
          console.warn(`⚠️ Failed to parse metadata from ${file}:`, e.message);
        }
      }
      
      // Extract title from markdown header
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : file.replace('.md', '');
      
      conversations.push({
        file,
        filePath,
        construct,
        title,
        importMetadata,
        hasMetadata: !!importMetadata
      });
    }
  }
  
  return conversations;
}

async function restoreRuntime(conversations) {
  // Find conversations with import metadata
  const conversationsWithMetadata = conversations.filter(c => c.hasMetadata);
  
  if (conversationsWithMetadata.length === 0) {
    console.log('⚠️ No conversations found with import metadata');
    console.log('💡 Attempting to recreate runtime from conversation patterns...');
    
    // Try to infer from conversation structure
    const runtimeName = `${USER_EMAIL} — ${PROVIDER}`;
    return await createRuntimeFromInference(runtimeName, conversations);
  }
  
  // Use the first conversation's metadata
  const metadata = conversationsWithMetadata[0].importMetadata;
  console.log('📋 Found import metadata:', JSON.stringify(metadata, null, 2));
  
  const runtimeName = `${USER_EMAIL} — ${PROVIDER}`;
  const description = `Restored ${PROVIDER} runtime for ${USER_EMAIL}`;
  
  // Create GPT entry
  const runtimeConfig = {
    name: runtimeName,
    description: description,
    instructions: `You are a restored ${PROVIDER} runtime for ${USER_EMAIL}. Maintain the original conversation style and context.`,
    modelId: metadata.detectedModel || 'gpt-4',
    userId: USER_ID
  };
  
  console.log('🔧 Creating runtime:', runtimeConfig.name);
  
  try {
    const gpt = await gptManager.createGPT(runtimeConfig, 'runtime');
    console.log(`✅ Created GPT entry: ${gpt.id}`);
    
    // Attach import metadata file
    const metadataPayload = {
      source: metadata.source || 'chatgpt',
      identity: metadata.identity || { email: USER_EMAIL },
      metadata: metadata.metadata || {},
      restoredAt: new Date().toISOString(),
      restoredFrom: 'vvault',
      originalImportDate: metadata.importedFrom || null,
      reference: crypto.randomUUID()
    };
    
    // Try to upload metadata file, but don't fail if it doesn't work
    try {
      const serialized = JSON.stringify(metadataPayload, null, 2);
      await gptManager.uploadFile(gpt.id, {
        name: "import-metadata.json",
        originalname: "import-metadata.json",
        mimetype: "application/json",
        type: "application/json",
        path: null,
        size: Buffer.byteLength(serialized, "utf-8"),
        buffer: Buffer.from(serialized, "utf-8"),
      });
      console.log('✅ Attached import metadata file');
    } catch (metadataError) {
      console.warn('⚠️ Could not attach metadata file (runtime still created):', metadataError.message);
    }
    
    console.log(`\n🎉 Runtime restored successfully!`);
    console.log(`   Name: ${runtimeName}`);
    console.log(`   GPT ID: ${gpt.id}`);
    console.log(`   Conversations found: ${conversations.length}`);
    
    return gpt;
  } catch (error) {
    console.error('❌ Failed to create runtime:', error);
    throw error;
  }
}

async function createRuntimeFromInference(runtimeName, conversations) {
  console.log(`\n🔧 Creating runtime from inference: ${runtimeName}`);
  
  const runtimeConfig = {
    name: runtimeName,
    description: `Restored ${PROVIDER} runtime for ${USER_EMAIL} (${conversations.length} conversations found)`,
    instructions: `You are a restored ${PROVIDER} runtime for ${USER_EMAIL}. Maintain the original conversation style and context.`,
    modelId: 'gpt-4',
    userId: USER_ID
  };
  
  try {
    const gpt = await gptManager.createGPT(runtimeConfig, 'runtime');
    console.log(`✅ Created GPT entry: ${gpt.id}`);
    
    // Create basic import metadata
    const metadataPayload = {
      source: 'chatgpt',
      identity: { email: USER_EMAIL },
      metadata: {
        conversationCount: conversations.length,
        restoredAt: new Date().toISOString()
      },
      restoredAt: new Date().toISOString(),
      restoredFrom: 'vvault',
      reference: crypto.randomUUID()
    };
    
    // Try to upload metadata file, but don't fail if it doesn't work
    try {
      const serialized = JSON.stringify(metadataPayload, null, 2);
      await gptManager.uploadFile(gpt.id, {
        name: "import-metadata.json",
        originalname: "import-metadata.json",
        mimetype: "application/json",
        type: "application/json",
        path: null,
        size: Buffer.byteLength(serialized, "utf-8"),
        buffer: Buffer.from(serialized, "utf-8"),
      });
      console.log('✅ Attached import metadata file');
    } catch (metadataError) {
      console.warn('⚠️ Could not attach metadata file (runtime still created):', metadataError.message);
    }
    
    console.log(`\n🎉 Runtime restored successfully!`);
    console.log(`   Name: ${runtimeName}`);
    console.log(`   GPT ID: ${gpt.id}`);
    console.log(`   Conversations found: ${conversations.length}`);
    
    return gpt;
  } catch (error) {
    console.error('❌ Failed to create runtime:', error);
    throw error;
  }
}

async function main() {
  console.log('🔍 RESTORING RUNTIME FROM VVAULT');
  console.log('================================\n');
  console.log(`User: ${USER_EMAIL}`);
  console.log(`Provider: ${PROVIDER}`);
  console.log(`VVAULT Root: ${VVAULT_ROOT}\n`);
  
  try {
    // Find conversations
    console.log('📂 Scanning VVAULT for conversations...');
    const conversations = await findConversationsInVVAULT();
    
    if (conversations.length === 0) {
      console.log('❌ No conversations found in VVAULT');
      return;
    }
    
    console.log(`✅ Found ${conversations.length} conversations`);
    const withMetadata = conversations.filter(c => c.hasMetadata).length;
    console.log(`   ${withMetadata} with import metadata\n`);
    
    // Restore runtime
    await restoreRuntime(conversations);
    
  } catch (error) {
    console.error('❌ Restore failed:', error);
    process.exit(1);
  }
}

main();
