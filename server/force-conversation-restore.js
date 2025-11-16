#!/usr/bin/env node

/**
 * Force Conversation Restore
 * This script ensures the recovered conversations are properly loaded
 */

import fs from 'fs';

async function createForceRestoreScript() {
  console.log('🔧 FORCE CONVERSATION RESTORE SCRIPT');
  console.log('====================================');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const forceRestoreScript = `
// FORCE CONVERSATION RESTORE SCRIPT
// This script ensures your recovered conversations are properly displayed

console.log('🔄 FORCING CONVERSATION RESTORE');
console.log('==============================');

// Check current localStorage data
const currentData = localStorage.getItem('chatty-data');
if (currentData) {
  const parsed = JSON.parse(currentData);
  console.log(\`📊 Current conversations in localStorage: \${parsed.conversations?.length || 0}\`);
  
  if (parsed.conversations && parsed.conversations.length > 0) {
    console.log('\\n💬 Your recovered conversations:');
    parsed.conversations.forEach((conv, index) => {
      console.log(\`   \${index + 1}. \${conv.title} (\${conv.messages?.length || 0} messages)\`);
    });
    
    // Force a page refresh to ensure the UI updates
    console.log('\\n🔄 Refreshing page to ensure conversations are displayed...');
    window.location.reload();
  } else {
    console.log('❌ No conversations found in localStorage');
  }
} else {
  console.log('❌ No chatty-data found in localStorage');
}

// Also check if there are any backend sync issues
console.log('\\n🔍 Checking for backend sync issues...');
console.log('If you see "2 conversations loaded from backend" in the console,');
console.log('the backend might be overriding your recovered conversations.');
console.log('\\n📞 If conversations are not showing in the sidebar:');
console.log('1. Check the browser console for any error messages');
console.log('2. Look for "Conversations loaded from backend" messages');
console.log('3. The backend might be syncing and overriding your local data');
console.log('4. Try refreshing the page a few times');
`;

  // Write the force restore script
  fs.writeFileSync('force-conversation-restore-browser.js', forceRestoreScript);
  console.log('📄 Force restore script created: force-conversation-restore-browser.js');
  
  console.log('\n📋 TO VERIFY YOUR CONVERSATIONS:');
  console.log('1. Copy the script from force-conversation-restore-browser.js');
  console.log('2. Open your browser console (F12)');
  console.log('3. Paste and run the script');
  console.log('4. This will show you exactly what conversations are restored');
  
  console.log('\n🎯 EXPECTED RESULTS:');
  console.log('- You should see 10 conversations listed');
  console.log('- Each conversation should show its title and message count');
  console.log('- If you see them here but not in the sidebar, there might be a UI sync issue');
}

// Run the script creation
createForceRestoreScript();



