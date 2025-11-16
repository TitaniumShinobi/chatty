#!/usr/bin/env node

/**
 * Restore Multiple Conversations from Vault Log
 * This script properly separates conversations and creates individual chat threads
 */

import fs from 'fs';

async function extractMultipleConversations() {
  console.log('🔍 EXTRACTING MULTIPLE CONVERSATIONS FROM VAULT LOG');
  console.log('====================================================');
  
  try {
    const vaultLogPath = '../vault-log.jsonl';
    const content = fs.readFileSync(vaultLogPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    console.log(`📄 Found ${lines.length} entries in vault log`);
    
    const conversations = [];
    let currentConversation = null;
    let conversationId = 1;
    
    lines.forEach((line, index) => {
      try {
        const entry = JSON.parse(line);
        const timestamp = new Date(entry.ts);
        
        // Check if this is a new conversation (gap of more than 1 hour)
        const isNewConversation = !currentConversation || 
          (timestamp.getTime() - new Date(currentConversation.lastTimestamp).getTime()) > 3600000; // 1 hour
        
        if (isNewConversation) {
          // Save previous conversation if it exists
          if (currentConversation && currentConversation.messages.length > 0) {
            conversations.push(currentConversation);
          }
          
          // Start new conversation
          currentConversation = {
            id: `restored-conv-${conversationId}`,
            title: `Restored Conversation ${conversationId}`,
            messages: [],
            createdAt: timestamp.toISOString(),
            updatedAt: timestamp.toISOString(),
            lastTimestamp: entry.ts
          };
          conversationId++;
        }
        
        // Add user message
        if (entry.input) {
          currentConversation.messages.push({
            role: 'user',
            content: entry.input,
            timestamp: timestamp.toISOString()
          });
        }
        
        // Add AI response
        if (entry.packets) {
          entry.packets.forEach(packet => {
            if (packet.op === 'answer.v1' && packet.payload && packet.payload.content) {
              currentConversation.messages.push({
                role: 'assistant',
                content: packet.payload.content,
                timestamp: timestamp.toISOString()
              });
            }
          });
        }
        
        // Update conversation timestamp
        if (currentConversation) {
          currentConversation.updatedAt = timestamp.toISOString();
          currentConversation.lastTimestamp = entry.ts;
        }
        
      } catch (e) {
        console.log(`⚠️  Error parsing line ${index + 1}: ${e.message}`);
      }
    });
    
    // Add the last conversation
    if (currentConversation && currentConversation.messages.length > 0) {
      conversations.push(currentConversation);
    }
    
    console.log(`\n📊 EXTRACTION SUMMARY:`);
    console.log(`   Total conversations: ${conversations.length}`);
    conversations.forEach((conv, index) => {
      console.log(`   ${index + 1}. ${conv.title} (${conv.messages.length} messages)`);
      console.log(`      First message: ${conv.messages[0]?.content?.substring(0, 50)}...`);
      console.log(`      Created: ${conv.createdAt}`);
    });
    
    return conversations;
    
  } catch (error) {
    console.error('❌ Error extracting conversations:', error.message);
    return [];
  }
}

async function createMultipleRestoreScript(conversations) {
  console.log('\n🔧 CREATING MULTIPLE CONVERSATION RESTORE SCRIPT');
  console.log('==================================================');
  
  if (conversations.length === 0) {
    console.log('❌ No conversations to restore');
    return;
  }
  
  const restoreScript = `
// RESTORE MULTIPLE CONVERSATIONS SCRIPT
// Run this in your browser console to restore all conversations

const conversations = ${JSON.stringify(conversations, null, 2)};

console.log('🔄 Restoring ${conversations.length} conversations...');

// Save conversations to localStorage
localStorage.setItem('chatty-data', JSON.stringify({
  conversations: conversations,
  lastModified: new Date().toISOString()
}));

console.log('✅ ${conversations.length} conversations restored to localStorage!');
console.log('🔄 Refreshing page to apply changes...');
window.location.reload();
`;

  // Write restore script to file
  fs.writeFileSync('restore-multiple-conversations-browser.js', restoreScript);
  console.log('📄 Multiple conversation restore script created: restore-multiple-conversations-browser.js');
  
  console.log('\n📋 MANUAL RESTORE STEPS:');
  console.log('1. Copy the contents of restore-multiple-conversations-browser.js');
  console.log('2. Open your browser console (F12)');
  console.log('3. Paste and run the script');
  console.log('4. Your ${conversations.length} conversations should be restored!');
}

async function main() {
  console.log('🚨 CHATTY MULTIPLE CONVERSATION RESTORATION');
  console.log('============================================');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  try {
    const conversations = await extractMultipleConversations();
    await createMultipleRestoreScript(conversations);
    
    console.log('\n✅ Multiple conversation restoration preparation complete!');
    console.log('\n📞 Next Steps:');
    console.log('1. Check the restore-multiple-conversations-browser.js file');
    console.log('2. Run the script in your browser console');
    console.log('3. Your conversations should be restored as separate threads');
    
  } catch (error) {
    console.error('❌ Restoration failed:', error.message);
  }
}

// Run the restoration
main();



