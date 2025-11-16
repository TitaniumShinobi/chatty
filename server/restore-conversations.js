#!/usr/bin/env node

/**
 * Restore Conversations from Vault Log
 * This script extracts conversation data from vault-log.jsonl and restores it
 */

import fs from 'fs';
import path from 'path';

const TARGET_EMAIL = 'dwoodosn92@gmail.com';

async function extractConversationsFromVault() {
  console.log('🔍 EXTRACTING CONVERSATIONS FROM VAULT LOG');
  console.log('==========================================');
  
  try {
    const vaultLogPath = '../vault-log.jsonl';
    const content = fs.readFileSync(vaultLogPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    console.log(`📄 Found ${lines.length} entries in vault log`);
    
    const conversations = [];
    const messages = [];
    
    lines.forEach((line, index) => {
      try {
        const entry = JSON.parse(line);
        
        // Extract conversation data
        if (entry.input) {
          messages.push({
            role: 'user',
            content: entry.input,
            timestamp: new Date(entry.ts).toISOString()
          });
        }
        
        // Extract AI responses
        if (entry.packets) {
          entry.packets.forEach(packet => {
            if (packet.op === 'answer.v1' && packet.payload && packet.payload.content) {
              messages.push({
                role: 'assistant', 
                content: packet.payload.content,
                timestamp: new Date(entry.ts).toISOString()
              });
            }
          });
        }
        
      } catch (e) {
        console.log(`⚠️  Error parsing line ${index + 1}: ${e.message}`);
      }
    });
    
    console.log(`💬 Extracted ${messages.length} messages`);
    
    // Group messages into conversations
    const conversation = {
      id: `restored-${Date.now()}`,
      title: 'Restored Conversation',
      messages: messages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    console.log('\n📋 CONVERSATION SUMMARY:');
    console.log(`   ID: ${conversation.id}`);
    console.log(`   Title: ${conversation.title}`);
    console.log(`   Messages: ${conversation.messages.length}`);
    console.log(`   First message: ${conversation.messages[0]?.content?.substring(0, 50)}...`);
    console.log(`   Last message: ${conversation.messages[conversation.messages.length - 1]?.content?.substring(0, 50)}...`);
    
    return [conversation];
    
  } catch (error) {
    console.error('❌ Error extracting conversations:', error.message);
    return [];
  }
}

async function createRestoreScript(conversations) {
  console.log('\n🔧 CREATING RESTORE SCRIPT');
  console.log('==========================');
  
  if (conversations.length === 0) {
    console.log('❌ No conversations to restore');
    return;
  }
  
  const restoreScript = `
// RESTORE CONVERSATIONS SCRIPT
// Run this in your browser console to restore conversations

const conversations = ${JSON.stringify(conversations, null, 2)};

console.log('🔄 Restoring conversations...');

// Save conversations to localStorage
localStorage.setItem('chatty-data', JSON.stringify({
  conversations: conversations,
  lastModified: new Date().toISOString()
}));

console.log('✅ Conversations restored to localStorage!');
console.log('🔄 Refreshing page to apply changes...');
window.location.reload();
`;

  // Write restore script to file
  fs.writeFileSync('restore-conversations-browser.js', restoreScript);
  console.log('📄 Restore script created: restore-conversations-browser.js');
  
  console.log('\n📋 MANUAL RESTORE STEPS:');
  console.log('1. Copy the contents of restore-conversations-browser.js');
  console.log('2. Open your browser console (F12)');
  console.log('3. Paste and run the script');
  console.log('4. Your conversations should be restored!');
}

async function main() {
  console.log('🚨 CHATTY CONVERSATION RESTORATION');
  console.log('===================================');
  console.log(`Target Email: ${TARGET_EMAIL}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  try {
    const conversations = await extractConversationsFromVault();
    await createRestoreScript(conversations);
    
    console.log('\n✅ Restoration preparation complete!');
    console.log('\n📞 Next Steps:');
    console.log('1. Check the restore-conversations-browser.js file');
    console.log('2. Run the script in your browser console');
    console.log('3. Your conversations should be restored');
    
  } catch (error) {
    console.error('❌ Restoration failed:', error.message);
  }
}

// Run the restoration
main();



