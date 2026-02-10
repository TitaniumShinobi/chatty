#!/usr/bin/env node

/**
 * Analyze Conversation Details - Look for Empty Conversations
 * This script creates a detailed analysis script to find empty conversations
 */

import fs from 'fs';

async function createDetailedAnalysisScript() {
  console.log('🔍 DETAILED CONVERSATION ANALYSIS SCRIPT');
  console.log('========================================');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const analysisScript = `
// DETAILED CONVERSATION ANALYSIS SCRIPT
// This script shows you EXACTLY what's in each localStorage key

console.log('🔍 DETAILED CONVERSATION ANALYSIS');
console.log('=================================');

// Function to safely parse JSON
function safeParse(jsonString, key) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.log(\`⚠️  Could not parse \${key}: \${e.message}\`);
    return null;
  }
}

// Function to analyze conversation structure
function analyzeConversation(conv, index, sourceName) {
  const messageCount = conv.messages ? conv.messages.length : 0;
  const isEmpty = messageCount === 0;
  const hasTitle = conv.title && conv.title.trim() !== '';
  
  console.log(\`   \${index + 1}. \${conv.title || 'Untitled'} (ID: \${conv.id})\`);
  console.log(\`      Messages: \${messageCount} \${isEmpty ? '🔴 EMPTY' : '✅ Has content'}\`);
  console.log(\`      Title: \${hasTitle ? '✅ Has title' : '🔴 No title'}\`);
  console.log(\`      Created: \${conv.createdAt || 'Unknown'}\`);
  console.log(\`      Updated: \${conv.updatedAt || 'Unknown'}\`);
  
  if (conv.messages && conv.messages.length > 0) {
    console.log(\`      First message: "\${conv.messages[0]?.content?.substring(0, 50) || 'No content'}..."\`);
  }
  
  return { isEmpty, messageCount, hasTitle };
}

// Analyze all localStorage keys
console.log('📋 ALL LOCALSTORAGE KEYS:');
const allKeys = Object.keys(localStorage);
console.log(allKeys);

console.log('\\n🔍 CONVERSATION-RELATED KEYS ANALYSIS:');
console.log('=====================================');

const conversationKeys = allKeys.filter(key => 
  key.includes('chat') || 
  key.includes('conversation') || 
  key.includes('thread') ||
  key.includes('construct')
);

let totalConversations = 0;
let emptyConversations = 0;
let totalMessages = 0;

conversationKeys.forEach(key => {
  console.log(\`\\n📄 Analyzing: \${key}\`);
  console.log('='.repeat(key.length + 15));
  
  const data = localStorage.getItem(key);
  const parsed = safeParse(data, key);
  
  if (!parsed) {
    console.log('❌ Could not parse data');
    return;
  }
  
  // Show raw data structure
  console.log('📊 Data structure:');
  if (Array.isArray(parsed)) {
    console.log(\`   Type: Array with \${parsed.length} items\`);
    if (parsed.length > 0) {
      console.log(\`   First item keys: \${Object.keys(parsed[0] || {}).join(', ')}\`);
    }
  } else if (typeof parsed === 'object') {
    console.log(\`   Type: Object with keys: \${Object.keys(parsed).join(', ')}\`);
  }
  
  // Extract and analyze conversations
  const conversations = [];
  
  if (Array.isArray(parsed)) {
    // Direct array of conversations
    parsed.forEach((item, index) => {
      if (item.messages !== undefined || item.title !== undefined) {
        conversations.push({
          id: \`\${key}-\${index}\`,
          title: item.title || \`\${key} Item \${index + 1}\`,
          messages: item.messages || [],
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        });
      }
    });
  } else if (parsed.conversations && Array.isArray(parsed.conversations)) {
    // Object with conversations array
    parsed.conversations.forEach((conv, index) => {
      conversations.push({
        id: \`\${key}-\${index}\`,
        title: conv.title || \`\${key} Conversation \${index + 1}\`,
        messages: conv.messages || [],
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt
      });
    });
  } else if (parsed.messages !== undefined) {
    // Single conversation
    conversations.push({
      id: \`\${key}-single\`,
      title: parsed.title || \`\${key} Conversation\`,
      messages: parsed.messages || [],
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt
    });
  }
  
  console.log(\`\\n💬 Found \${conversations.length} conversations:\`);
  
  conversations.forEach((conv, index) => {
    const analysis = analyzeConversation(conv, index, key);
    totalConversations++;
    totalMessages += analysis.messageCount;
    if (analysis.isEmpty) {
      emptyConversations++;
    }
  });
});

console.log('\\n📊 COMPLETE ANALYSIS SUMMARY:');
console.log('=============================');
console.log(\`Total conversations found: \${totalConversations}\`);
console.log(\`Empty conversations: \${emptyConversations}\`);
console.log(\`Conversations with content: \${totalConversations - emptyConversations}\`);
console.log(\`Total messages across all conversations: \${totalMessages}\`);

console.log('\\n🔍 EMPTY CONVERSATION BREAKDOWN:');
console.log('==================================');
if (emptyConversations > 0) {
  console.log(\`Found \${emptyConversations} empty conversations that would show in your sidebar\`);
  console.log('These are likely the "empty conversations" you mentioned seeing in the side panel');
} else {
  console.log('No empty conversations found');
}

console.log('\\n📞 NEXT STEPS:');
console.log('1. Review the detailed analysis above');
console.log('2. Look for conversations marked as "🔴 EMPTY"');
console.log('3. These empty conversations are likely what you saw in the sidebar');
console.log('4. Run the comprehensive recovery script to consolidate everything');
`;

  // Write the analysis script
  fs.writeFileSync('analyze-conversation-details-browser.js', analysisScript);
  console.log('📄 Detailed analysis script created: analyze-conversation-details-browser.js');
  
  console.log('\n📋 TO ANALYZE YOUR CONVERSATIONS IN DETAIL:');
  console.log('1. Copy the script from analyze-conversation-details-browser.js');
  console.log('2. Open your browser console (F12)');
  console.log('3. Paste and run the script');
  console.log('4. This will show you EXACTLY what\'s in each localStorage key');
  console.log('5. Look for conversations marked as "🔴 EMPTY" - these are your empty sidebar conversations!');
}

// Run the script creation
createDetailedAnalysisScript();



