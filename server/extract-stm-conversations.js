#!/usr/bin/env node

/**
 * Extract Conversations from STM Threads
 * This script creates a recovery script for STM thread conversations
 */

import fs from 'fs';

async function createSTMRecoveryScript() {
  console.log('🔍 STM THREAD CONVERSATION EXTRACTION');
  console.log('=====================================');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const stmRecoveryScript = `
// STM THREAD CONVERSATION EXTRACTION SCRIPT
// This script properly extracts conversations from STM threads

console.log('🔄 EXTRACTING STM THREAD CONVERSATIONS');
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

// Function to convert STM thread messages to conversation format
function convertSTMThreadToConversation(messages, threadKey) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }
  
  // Group messages by conversation (look for gaps in timestamps)
  const conversations = [];
  let currentConversation = [];
  
  messages.forEach((message, index) => {
    const messageTime = new Date(message.timestamp).getTime();
    const prevMessageTime = index > 0 ? new Date(messages[index - 1].timestamp).getTime() : 0;
    
    // If gap is more than 2 hours, start new conversation
    if (index > 0 && (messageTime - prevMessageTime) > 7200000) {
      if (currentConversation.length > 0) {
        conversations.push([...currentConversation]);
        currentConversation = [];
      }
    }
    
    currentConversation.push(message);
  });
  
  // Add the last conversation
  if (currentConversation.length > 0) {
    conversations.push(currentConversation);
  }
  
  // Convert to conversation format
  return conversations.map((conv, index) => ({
    id: \`\${threadKey}-conv-\${index}\`,
    title: \`STM Thread \${threadKey.split('_').pop()} - Conversation \${index + 1}\`,
    messages: conv.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp
    })),
    createdAt: conv[0]?.timestamp || new Date().toISOString(),
    updatedAt: conv[conv.length - 1]?.timestamp || new Date().toISOString()
  }));
}

// Extract from all STM threads
const allConversations = [];

// Get all STM thread keys
const stmKeys = Object.keys(localStorage).filter(key => key.startsWith('chatty_stm_'));
console.log(\`🔍 Found \${stmKeys.length} STM thread keys\`);

stmKeys.forEach(key => {
  console.log(\`\\n📄 Processing: \${key}\`);
  
  const data = localStorage.getItem(key);
  const parsed = safeParse(data, key);
  
  if (!parsed) {
    console.log('❌ Could not parse data');
    return;
  }
  
  // Convert STM thread to conversations
  const conversations = convertSTMThreadToConversation(parsed, key);
  
  if (conversations && conversations.length > 0) {
    console.log(\`💬 Extracted \${conversations.length} conversations from \${key}\`);
    conversations.forEach((conv, index) => {
      console.log(\`   \${index + 1}. \${conv.title} (\${conv.messages.length} messages)\`);
      console.log(\`      First message: "\${conv.messages[0]?.content?.substring(0, 50)}..."\`);
    });
    allConversations.push(...conversations);
  } else {
    console.log(\`⚠️  No conversations found in \${key}\`);
  }
});

// Also extract from existing chatty-data and threads
console.log('\\n📄 Processing existing chatty-data...');
const chattyData = localStorage.getItem('chatty-data');
if (chattyData) {
  const parsed = safeParse(chattyData, 'chatty-data');
  if (parsed && parsed.conversations) {
    console.log(\`💬 Found \${parsed.conversations.length} existing conversations in chatty-data\`);
    allConversations.push(...parsed.conversations);
  }
}

console.log('\\n📄 Processing existing chatty:threads...');
const threadsKey = Object.keys(localStorage).find(key => key.startsWith('chatty:threads:'));
if (threadsKey) {
  const data = localStorage.getItem(threadsKey);
  const parsed = safeParse(data, threadsKey);
  if (parsed && Array.isArray(parsed)) {
    console.log(\`💬 Found \${parsed.length} existing conversations in \${threadsKey}\`);
    allConversations.push(...parsed);
  }
}

console.log('\\n📊 COMPLETE EXTRACTION SUMMARY:');
console.log('===============================');
console.log(\`Total conversations found: \${allConversations.length}\`);
allConversations.forEach((conv, index) => {
  console.log(\`   \${index + 1}. \${conv.title} (\${conv.messages?.length || 0} messages)\`);
});

// Save all conversations to chatty-data
if (allConversations.length > 0) {
  const consolidatedData = {
    conversations: allConversations,
    lastModified: new Date().toISOString(),
    source: 'stm-thread-extraction'
  };
  
  localStorage.setItem('chatty-data', JSON.stringify(consolidatedData));
  console.log(\`\\n✅ \${allConversations.length} conversations consolidated into chatty-data!\`);
  console.log('🔄 Refreshing page to apply changes...');
  window.location.reload();
} else {
  console.log('❌ No conversations found to restore');
}
`;

  // Write the STM recovery script
  fs.writeFileSync('extract-stm-conversations-browser.js', stmRecoveryScript);
  console.log('📄 STM thread extraction script created: extract-stm-conversations-browser.js');
  
  console.log('\n📋 TO EXTRACT ALL YOUR STM THREAD CONVERSATIONS:');
  console.log('1. Copy the script from extract-stm-conversations-browser.js');
  console.log('2. Open your browser console (F12)');
  console.log('3. Paste and run the script');
  console.log('4. This will properly extract conversations from your STM threads!');
  
  console.log('\n🎯 EXPECTED RESULTS:');
  console.log('- STM threads contain your missing conversations');
  console.log('- This script will convert them to proper conversation format');
  console.log('- You should see 5+ additional conversations from the STM threads!');
}

// Run the script creation
createSTMRecoveryScript();



