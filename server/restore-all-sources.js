#!/usr/bin/env node

/**
 * Restore ALL Conversations from ALL Sources
 * This script combines conversations from vault-log.jsonl AND SQLite Database
 */

import { execSync } from 'child_process';
import fs from 'fs';

async function extractFromVaultLog() {
  console.log('🔍 EXTRACTING FROM VAULT-LOG.JSONL');
  console.log('==================================');
  
  try {
    const vaultLogPath = '../vault-log.jsonl';
    if (!fs.existsSync(vaultLogPath)) {
      console.log('❌ vault-log.jsonl not found');
      return [];
    }
    
    const content = fs.readFileSync(vaultLogPath, 'utf8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    console.log(`📄 Found ${lines.length} lines in vault-log.jsonl`);
    
    // Group messages by conversation (using timestamps to group)
    const messageGroups = [];
    let currentGroup = [];
    
    lines.forEach((line, index) => {
      try {
        const data = JSON.parse(line);
        if (data.input && data.ts) {
          const message = {
            role: 'user',
            content: data.input,
            timestamp: new Date(data.ts).toISOString()
          };
          
          // Check if this should start a new conversation (gap > 2 hours)
          if (currentGroup.length > 0) {
            const lastMessage = currentGroup[currentGroup.length - 1];
            const timeDiff = data.ts - (new Date(lastMessage.timestamp).getTime());
            if (timeDiff > 7200000) { // 2 hours
              messageGroups.push([...currentGroup]);
              currentGroup = [];
            }
          }
          
          currentGroup.push(message);
          
          // Add AI response if available
          if (data.packets && data.packets.length > 0) {
            const answerPacket = data.packets.find(p => p.op === 'answer.v1');
            if (answerPacket && answerPacket.payload && answerPacket.payload.content) {
              const aiMessage = {
                role: 'assistant',
                content: answerPacket.payload.content,
                timestamp: new Date(data.ts + 1000).toISOString() // 1 second after user message
              };
              currentGroup.push(aiMessage);
            }
          }
        }
      } catch (parseError) {
        console.log(`⚠️  Skipping invalid JSON on line ${index + 1}`);
      }
    });
    
    // Add the last group
    if (currentGroup.length > 0) {
      messageGroups.push(currentGroup);
    }
    
    // Convert groups to conversations
    const conversations = messageGroups.map((group, index) => ({
      id: `vault-conv-${index + 1}`,
      title: `Vault Conversation ${index + 1}`,
      messages: group,
      createdAt: group[0]?.timestamp || new Date().toISOString(),
      updatedAt: group[group.length - 1]?.timestamp || new Date().toISOString()
    }));
    
    console.log(`💬 Extracted ${conversations.length} conversations from vault-log`);
    return conversations;
    
  } catch (error) {
    console.error('❌ Error extracting from vault-log:', error.message);
    return [];
  }
}

async function extractFromSQLite() {
  console.log('\n🔍 EXTRACTING FROM SQLITE DATABASE');
  console.log('===================================');
  
  try {
    const sqliteQuery = `SELECT * FROM messages ORDER BY ts ASC;`;
    const result = execSync(`sqlite3 ../chatty.db "${sqliteQuery}"`, { encoding: 'utf8' });
    
    const lines = result.trim().split('\n').filter(line => line.trim());
    console.log(`📄 Found ${lines.length} messages in SQLite database`);
    
    const messages = [];
    
    lines.forEach((line, index) => {
      const parts = line.split('|');
      if (parts.length >= 5) {
        const [id, userId, role, timestamp, text] = parts;
        messages.push({
          id: parseInt(id),
          userId,
          role,
          timestamp: parseInt(timestamp),
          text: text,
          date: new Date(parseInt(timestamp))
        });
      }
    });
    
    console.log(`💬 Processed ${messages.length} messages`);
    
    // Group messages into conversations
    const conversations = [];
    let currentConversation = null;
    let conversationId = 1;
    
    messages.forEach((message, index) => {
      const messageDate = message.date;
      
      // Check if this is a new conversation (gap of more than 2 hours or different day)
      const isNewConversation = !currentConversation || 
        (messageDate.getTime() - new Date(currentConversation.lastMessageTime).getTime()) > 7200000 || // 2 hours
        messageDate.getDate() !== new Date(currentConversation.lastMessageTime).getDate();
      
      if (isNewConversation) {
        // Save previous conversation if it exists
        if (currentConversation && currentConversation.messages.length > 0) {
          conversations.push(currentConversation);
        }
        
        // Start new conversation
        currentConversation = {
          id: `sqlite-conv-${conversationId}`,
          title: `SQLite Conversation ${conversationId}`,
          messages: [],
          createdAt: messageDate.toISOString(),
          updatedAt: messageDate.toISOString(),
          lastMessageTime: message.timestamp
        };
        conversationId++;
      }
      
      // Add message to current conversation
      currentConversation.messages.push({
        role: message.role,
        content: message.text,
        timestamp: messageDate.toISOString()
      });
      
      // Update conversation timestamp
      currentConversation.updatedAt = messageDate.toISOString();
      currentConversation.lastMessageTime = message.timestamp;
    });
    
    // Add the last conversation
    if (currentConversation && currentConversation.messages.length > 0) {
      conversations.push(currentConversation);
    }
    
    console.log(`💬 Extracted ${conversations.length} conversations from SQLite`);
    return conversations;
    
  } catch (error) {
    console.error('❌ Error extracting from SQLite:', error.message);
    return [];
  }
}

async function createCompleteRestoreScript(allConversations) {
  console.log('\n🔧 CREATING COMPLETE CONVERSATION RESTORE SCRIPT');
  console.log('================================================');
  
  if (allConversations.length === 0) {
    console.log('❌ No conversations to restore');
    return;
  }
  
  const restoreScript = `
// RESTORE ALL CONVERSATIONS SCRIPT
// Run this in your browser console to restore ALL conversations from ALL sources

const conversations = ${JSON.stringify(allConversations, null, 2)};

console.log('🔄 Restoring ${allConversations.length} conversations from all sources...');

// Save conversations to localStorage
localStorage.setItem('chatty-data', JSON.stringify({
  conversations: conversations,
  lastModified: new Date().toISOString()
}));

console.log('✅ ${allConversations.length} conversations restored to localStorage!');
console.log('🔄 Refreshing page to apply changes...');
window.location.reload();
`;

  // Write restore script to file
  fs.writeFileSync('restore-all-sources-browser.js', restoreScript);
  console.log('📄 Complete restore script created: restore-all-sources-browser.js');
  
  console.log('\n📋 MANUAL RESTORE STEPS:');
  console.log('1. Copy the contents of restore-all-sources-browser.js');
  console.log('2. Open your browser console (F12)');
  console.log('3. Paste and run the script');
  console.log('4. Your ${allConversations.length} conversations should be restored!');
}

async function main() {
  console.log('🚨 CHATTY COMPLETE CONVERSATION RESTORATION');
  console.log('============================================');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  try {
    // Extract from both sources
    const vaultConversations = await extractFromVaultLog();
    const sqliteConversations = await extractFromSQLite();
    
    // Combine all conversations
    const allConversations = [...vaultConversations, ...sqliteConversations];
    
    console.log('\n📊 COMPLETE EXTRACTION SUMMARY:');
    console.log(`   Vault-log conversations: ${vaultConversations.length}`);
    console.log(`   SQLite conversations: ${sqliteConversations.length}`);
    console.log(`   Total conversations: ${allConversations.length}`);
    
    allConversations.forEach((conv, index) => {
      console.log(`   ${index + 1}. ${conv.title} (${conv.messages.length} messages)`);
      console.log(`      First message: ${conv.messages[0]?.content?.substring(0, 50)}...`);
      console.log(`      Created: ${conv.createdAt}`);
    });
    
    await createCompleteRestoreScript(allConversations);
    
    console.log('\n✅ Complete conversation restoration preparation complete!');
    console.log('\n📞 Next Steps:');
    console.log('1. Check the restore-all-sources-browser.js file');
    console.log('2. Run the script in your browser console');
    console.log('3. Your ${allConversations.length} conversations should be restored as separate threads');
    
  } catch (error) {
    console.error('❌ Restoration failed:', error.message);
  }
}

// Run the restoration
main();



