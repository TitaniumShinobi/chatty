#!/usr/bin/env node

/**
 * Check Current localStorage Data
 * This script helps analyze what's currently in localStorage
 */

console.log('🔍 CHECKING CURRENT LOCALSTORAGE DATA');
console.log('=====================================');
console.log('');
console.log('To check your current localStorage data, run this in your browser console:');
console.log('');
console.log('```javascript');
console.log('// Check all localStorage keys');
console.log('console.log("📋 All localStorage keys:", Object.keys(localStorage));');
console.log('');
console.log('// Check chatty-data specifically');
console.log('const chattyData = localStorage.getItem("chatty-data");');
console.log('if (chattyData) {');
console.log('  const parsed = JSON.parse(chattyData);');
console.log('  console.log("📊 Chatty data:", parsed);');
console.log('  console.log("💬 Conversations count:", parsed.conversations?.length || 0);');
console.log('  if (parsed.conversations) {');
console.log('    parsed.conversations.forEach((conv, i) => {');
console.log('      console.log(`  ${i+1}. ${conv.title} (${conv.messages?.length || 0} messages)`);');
console.log('    });');
console.log('  }');
console.log('} else {');
console.log('  console.log("❌ No chatty-data found in localStorage");');
console.log('}');
console.log('');
console.log('// Check for other conversation-related keys');
console.log('Object.keys(localStorage).forEach(key => {');
console.log('  if (key.includes("chat") || key.includes("conversation") || key.includes("thread")) {');
console.log('    console.log(`🔍 Found conversation key: ${key}`);');
console.log('    const data = localStorage.getItem(key);');
console.log('    try {');
console.log('      const parsed = JSON.parse(data);');
console.log('      console.log(`   Data:`, parsed);');
console.log('    } catch (e) {');
console.log('      console.log(`   Raw data:`, data);');
console.log('    }');
console.log('  }');
console.log('});');
console.log('```');
console.log('');
console.log('📞 Next Steps:');
console.log('1. Open your browser console (F12)');
console.log('2. Copy and paste the script above');
console.log('3. Run it to see what conversations you currently have');
console.log('4. Share the output so I can help recover the missing ones');



