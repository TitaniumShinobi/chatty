#!/usr/bin/env node

/**
 * Debug Conversation State
 * This script helps debug why conversations aren't showing
 */

import fs from 'fs';

async function createDebugScript() {
  console.log('🔍 DEBUG CONVERSATION STATE SCRIPT');
  console.log('===================================');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const debugScript = `
// DEBUG CONVERSATION STATE SCRIPT
// This script helps debug why conversations aren't showing

console.log('🔍 DEBUGGING CONVERSATION STATE');
console.log('===============================');

// 1. Check all localStorage keys
console.log('\\n📋 ALL LOCALSTORAGE KEYS:');
const allKeys = Object.keys(localStorage);
console.log(allKeys);

// 2. Check chatty-data specifically
console.log('\\n📊 CHATTY-DATA ANALYSIS:');
const chattyData = localStorage.getItem('chatty-data');
if (chattyData) {
  try {
    const parsed = JSON.parse(chattyData);
    console.log('✅ chatty-data exists');
    console.log(\`   Conversations: \${parsed.conversations?.length || 0}\`);
    console.log(\`   Last modified: \${parsed.lastModified}\`);
    console.log(\`   Source: \${parsed.source}\`);
    
    if (parsed.conversations && parsed.conversations.length > 0) {
      console.log('\\n💬 Conversation details:');
      parsed.conversations.forEach((conv, index) => {
        console.log(\`   \${index + 1}. \${conv.title || 'Untitled'} (ID: \${conv.id})\`);
        console.log(\`      Messages: \${conv.messages?.length || 0}\`);
        console.log(\`      Created: \${conv.createdAt}\`);
      });
    }
  } catch (e) {
    console.log('❌ Error parsing chatty-data:', e.message);
  }
} else {
  console.log('❌ No chatty-data found');
}

// 3. Check for other conversation storage
console.log('\\n🔍 OTHER CONVERSATION STORAGE:');
const conversationKeys = allKeys.filter(key => 
  key.includes('chat') || 
  key.includes('conversation') || 
  key.includes('thread')
);

conversationKeys.forEach(key => {
  if (key !== 'chatty-data') {
    console.log(\`\\n📄 \${key}:\`);
    const data = localStorage.getItem(key);
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        console.log(\`   Array with \${parsed.length} items\`);
      } else if (parsed.conversations) {
        console.log(\`   Object with \${parsed.conversations.length} conversations\`);
      } else {
        console.log(\`   Object with keys: \${Object.keys(parsed).join(', ')}\`);
      }
    } catch (e) {
      console.log(\`   Raw data: \${data.substring(0, 100)}...\`);
    }
  }
});

// 4. Check sessionStorage
console.log('\\n📊 SESSION STORAGE:');
const sessionKeys = Object.keys(sessionStorage);
console.log(\`Session keys: \${sessionKeys.length}\`);
if (sessionKeys.length > 0) {
  console.log(sessionKeys);
}

// 5. Force conversation restoration
console.log('\\n🔄 FORCING CONVERSATION RESTORATION:');
console.log('This will attempt to restore conversations from all sources...');

// Collect all conversations from all sources
const allConversations = [];

// From chatty-data
if (chattyData) {
  try {
    const parsed = JSON.parse(chattyData);
    if (parsed.conversations && Array.isArray(parsed.conversations)) {
      allConversations.push(...parsed.conversations);
      console.log(\`✅ Added \${parsed.conversations.length} conversations from chatty-data\`);
    }
  } catch (e) {
    console.log('❌ Error parsing chatty-data for restoration');
  }
}

// From STM threads
const stmKeys = allKeys.filter(key => key.startsWith('chatty_stm_'));
stmKeys.forEach(key => {
  const data = localStorage.getItem(key);
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Convert STM thread to conversation
      const conversation = {
        id: \`stm-\${key}\`,
        title: \`STM Thread \${key.split('_').pop()}\`,
        messages: parsed.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp
        })),
        createdAt: parsed[0]?.timestamp || new Date().toISOString(),
        updatedAt: parsed[parsed.length - 1]?.timestamp || new Date().toISOString()
      };
      allConversations.push(conversation);
      console.log(\`✅ Added 1 conversation from \${key}\`);
    }
  } catch (e) {
    console.log(\`❌ Error parsing \${key}\`);
  }
});

// From chatty:threads
const threadsKey = allKeys.find(key => key.startsWith('chatty:threads:'));
if (threadsKey) {
  const data = localStorage.getItem(threadsKey);
  try {
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      allConversations.push(...parsed);
      console.log(\`✅ Added \${parsed.length} conversations from \${threadsKey}\`);
    }
  } catch (e) {
    console.log(\`❌ Error parsing \${threadsKey}\`);
  }
}

console.log(\`\\n📊 TOTAL CONVERSATIONS FOUND: \${allConversations.length}\`);

// Save consolidated conversations
if (allConversations.length > 0) {
  const consolidatedData = {
    conversations: allConversations,
    lastModified: new Date().toISOString(),
    source: 'debug-restoration'
  };
  
  localStorage.setItem('chatty-data', JSON.stringify(consolidatedData));
  console.log(\`\\n✅ Saved \${allConversations.length} conversations to chatty-data\`);
  console.log('🔄 Refreshing page to apply changes...');
  window.location.reload();
} else {
  console.log('❌ No conversations found to restore');
}
`;

  // Write the debug script
  fs.writeFileSync('debug-conversation-state-browser.js', debugScript);
  console.log('📄 Debug script created: debug-conversation-state-browser.js');
  
  console.log('\n📋 TO DEBUG YOUR CONVERSATION STATE:');
  console.log('1. Copy the script from debug-conversation-state-browser.js');
  console.log('2. Open your browser console (F12)');
  console.log('3. Paste and run the script');
  console.log('4. This will show you exactly what\'s stored and force a restoration');
}

// Run the script creation
createDebugScript();



