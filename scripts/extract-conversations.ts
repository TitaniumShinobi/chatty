#!/usr/bin/env tsx
/**
 * CLI tool for extracting conversations from conversations.html
 * Usage: npx tsx scripts/extract-conversations.ts --src path/to/conversations.html --userId ... --constructId ...
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { processConversationsHtml, ProcessContext, ProcessOptions } from '../server/services/importHtmlProcessor';

interface CLIArgs {
  src: string;
  userId: string;
  shardId?: string;
  userEmail?: string;
  runtimeId: string;
  constructId: string;
  importSourceFilename?: string;
  importedBy: string;
  destRoot?: string;
  overwrite?: boolean;
  dedupe?: 'byConversationId' | 'byTitle' | 'none';
}

function parseArgs(): CLIArgs {
  const args: Partial<CLIArgs> = {};
  
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    const nextArg = process.argv[i + 1];
    
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-/g, '') as keyof CLIArgs;
      
      if (key === 'overwrite') {
        args.overwrite = true;
      } else if (nextArg && !nextArg.startsWith('--')) {
        (args as any)[key] = nextArg;
        i++; // Skip next arg
      }
    }
  }
  
  // Validate required args
  if (!args.src || !args.userId || !args.runtimeId || !args.constructId || !args.importedBy) {
    console.error('❌ Missing required arguments');
    console.error('\nUsage:');
    console.error('  node scripts/extract-conversations.js \\');
    console.error('    --src path/to/conversations.html \\');
    console.error('    --userId devon_woodson_1762969514958 \\');
    console.error('    --runtimeId chatgpt-devon \\');
    console.error('    --constructId chatgpt-devon-001 \\');
    console.error('    --importedBy devon@thewreck.org \\');
    console.error('    [--shardId shard_0000] \\');
    console.error('    [--userEmail devon@thewreck.org] \\');
    console.error('    [--importSourceFilename conversations.html] \\');
    console.error('    [--destRoot /path/to/vvault] \\');
    console.error('    [--overwrite] \\');
    console.error('    [--dedupe byConversationId|byTitle|none]');
    process.exit(1);
  }
  
  return args as CLIArgs;
}

async function main() {
  const args = parseArgs();
  
  // Set defaults
  const shardId = args.shardId || 'shard_0000';
  const destRoot = args.destRoot || path.join(__dirname, '../../vvault');
  const importSourceFilename = args.importSourceFilename || path.basename(args.src);
  const dedupe = args.dedupe || 'byConversationId';
  
  // Build context
  const context: ProcessContext = {
    shardId,
    userId: args.userId,
    userEmail: args.userEmail,
    runtimeId: args.runtimeId,
    constructId: args.constructId,
    importSourceFilename,
    importedBy: args.importedBy
  };
  
  // Build options
  const options: ProcessOptions = {
    destRootPath: destRoot,
    overwrite: args.overwrite || false,
    dedupe
  };
  
  console.log('🚀 Starting conversations.html extraction...');
  console.log(`   Source: ${args.src}`);
  console.log(`   User: ${args.userId}`);
  console.log(`   Construct: ${args.constructId}`);
  console.log(`   Destination: ${destRoot}`);
  console.log('');
  
  try {
    const summary = await processConversationsHtml(args.src, context, options);
    
    console.log('\n📊 Summary:');
    console.log(`   Total processed: ${summary.totalProcessed}`);
    console.log(`   Created: ${summary.totalCreated}`);
    console.log(`   Skipped: ${summary.totalSkipped}`);
    console.log(`   Errors: ${summary.totalErrors}`);
    
    if (summary.created.length > 0) {
      console.log('\n✅ Created files:');
      summary.created.forEach((item, i) => {
        console.log(`   ${i + 1}. ${item.filename} - "${item.title}"`);
      });
    }
    
    if (summary.skipped.length > 0) {
      console.log('\n⏭️ Skipped files:');
      summary.skipped.forEach((item, i) => {
        console.log(`   ${i + 1}. ${item.filename} - "${item.title}" (${item.reason})`);
      });
    }
    
    if (summary.errors.length > 0) {
      console.log('\n❌ Errors:');
      summary.errors.forEach((item, i) => {
        console.log(`   ${i + 1}. ${item.title || 'Unknown'}: ${item.error}`);
      });
      process.exit(1);
    }
    
    console.log('\n✅ Extraction complete!');
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

