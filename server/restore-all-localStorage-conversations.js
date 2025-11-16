#!/usr/bin/env node

/**
 * Restore ALL Conversations from ALL localStorage Sources
 * This script creates a comprehensive recovery script for all conversation data
 */

import fs from 'fs';

async function createCompleteRecoveryScript() {
  console.log('🚨 COMPREHENSIVE CONVERSATION RECOVERY SCRIPT');
  console.log('==============================================');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const recoveryScript = `
// COMPREHENSIVE CONVERSATION RECOVERY SCRIPT
// This script extracts conversations from ALL localStorage sources

console.log('🔄 COMPREHENSIVE CONVERSATION RECOVERY');
console.log('=====================================');

// Function to safely parse JSON
function safeParse(jsonString, key) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.log(\`⚠️  Could not parse \${key}: \${e.message}\`);
    return null;
  }
}

// Function to extract conversations from any data structure
function extractConversations(data, sourceName) {
  const conversations = [];
  
  if (!data) return conversations;
  
  // Handle different data structures
  if (Array.isArray(data)) {
    // Direct array of conversations
    data.forEach((item, index) => {
      if (item.messages || item.title) {
        conversations.push({
          id: \`\${sourceName}-\${index}\`,
          title: item.title || \`\${sourceName} Conversation \${index + 1}\`,
          messages: item.messages || [],
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString()
        });
      }
    });
  } else if (data.conversations && Array.isArray(data.conversations)) {
    // Object with conversations array
    data.conversations.forEach((conv, index) => {
      conversations.push({
        id: \`\${sourceName}-\${index}\`,
        title: conv.title || \`\${sourceName} Conversation \${index + 1}\`,
        messages: conv.messages || [],
        createdAt: conv.createdAt || new Date().toISOString(),
        updatedAt: conv.updatedAt || new Date().toISOString()
      });
    });
  } else if (data.messages && Array.isArray(data.messages)) {
    // Single conversation with messages
    conversations.push({
      id: \`\${sourceName}-single\`,
      title: data.title || \`\${sourceName} Conversation\`,
      messages: data.messages,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString()
    });
  }
  
  return conversations;
}

// Collect all conversations from all sources
const allConversations = [];

// 1. Extract from chatty_stm threads
const stmKeys = Object.keys(localStorage).filter(key => key.startsWith('chatty_stm_'));
console.log(\`🔍 Found \${stmKeys.length} STM thread keys\`);

stmKeys.forEach(key => {
  const data = localStorage.getItem(key);
  const parsed = safeParse(data, key);
  if (parsed) {
    const conversations = extractConversations(parsed, key.replace('chatty_stm_', 'STM-'));
    allConversations.push(...conversations);
    console.log(\`📄 \${key}: \${conversations.length} conversations\`);
  }
});

// 2. Extract from chatty-data
const chattyData = localStorage.getItem('chatty-data');
if (chattyData) {
  const parsed = safeParse(chattyData, 'chatty-data');
  if (parsed) {
    const conversations = extractConversations(parsed, 'chatty-data');
    allConversations.push(...conversations);
    console.log(\`📄 chatty-data: \${conversations.length} conversations\`);
  }
}

// 3. Extract from chatty:threads
const threadsKey = Object.keys(localStorage).find(key => key.startsWith('chatty:threads:'));
if (threadsKey) {
  const data = localStorage.getItem(threadsKey);
  const parsed = safeParse(data, threadsKey);
  if (parsed) {
    const conversations = extractConversations(parsed, 'threads');
    allConversations.push(...conversations);
    console.log(\`📄 \${threadsKey}: \${conversations.length} conversations\`);
  }
}

// 4. Extract from chatty_construct
const constructKey = Object.keys(localStorage).find(key => key.startsWith('chatty_construct'));
if (constructKey) {
  const data = localStorage.getItem(constructKey);
  const parsed = safeParse(data, constructKey);
  if (parsed) {
    const conversations = extractConversations(parsed, 'construct');
    allConversations.push(...conversations);
    console.log(\`📄 \${constructKey}: \${conversations.length} conversations\`);
  }
}

console.log(\`\\n📊 RECOVERY SUMMARY:\`);
console.log(\`   Total conversations found: \${allConversations.length}\`);
allConversations.forEach((conv, index) => {
  console.log(\`   \${index + 1}. \${conv.title} (\${conv.messages?.length || 0} messages)\`);
});

// Save all conversations to chatty-data
if (allConversations.length > 0) {
  const consolidatedData = {
    conversations: allConversations,
    lastModified: new Date().toISOString(),
    source: 'comprehensive-recovery'
  };
  
  localStorage.setItem('chatty-data', JSON.stringify(consolidatedData));
  console.log(\`\\n✅ \${allConversations.length} conversations consolidated into chatty-data!\`);
  console.log('🔄 Refreshing page to apply changes...');
  window.location.reload();
} else {
  console.log('❌ No conversations found to restore');
}
`;

  // Write the recovery script
  fs.writeFileSync('restore-all-localStorage-conversations-browser.js', recoveryScript);
  console.log('📄 Comprehensive recovery script created: restore-all-localStorage-conversations-browser.js');
  
  console.log('\n📋 TO RESTORE ALL YOUR CONVERSATIONS:');
  console.log('1. Copy the script from restore-all-localStorage-conversations-browser.js');
  console.log('2. Open your browser console (F12)');
  console.log('3. Paste and run the script');
  console.log('4. All your conversations should be consolidated and restored!');
  
  console.log('\n🎯 EXPECTED RESULTS:');
  console.log('- STM threads: 5 conversations (3+1+1)');
  console.log('- chatty-data: 1 conversation');
  console.log('- chatty:threads: 1 conversation');
  console.log('- Total: ~7+ conversations from localStorage alone!');
}

// Run the script creation
createCompleteRecoveryScript();



