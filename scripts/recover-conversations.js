// IMMEDIATE CONVERSATION RECOVERY SCRIPT
// Run this in your browser console to recover your conversations right now

console.log('🚨 CHATTY CONVERSATION RECOVERY SCRIPT');
console.log('=====================================');

// Step 1: Check what data we have
console.log('\n📊 CHECKING AVAILABLE DATA:');

const dataSources = [
  'chatty:threads',
  'chatty:threads:backup', 
  'chatty-data',
  'chatty-conversations',
  'chatty:threads:undefined'
];

let foundData = {};

dataSources.forEach(source => {
  const data = localStorage.getItem(source);
  if (data && data.length > 10) {
    foundData[source] = data;
    console.log(`✅ ${source}: ${data.length} characters`);
    
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        console.log(`   → ${parsed.length} items (array)`);
      } else if (parsed.conversations) {
        console.log(`   → ${parsed.conversations.length} conversations`);
      } else if (parsed.threads) {
        console.log(`   → ${parsed.threads.length} threads`);
      } else {
        console.log(`   → Object with keys: ${Object.keys(parsed).join(', ')}`);
      }
    } catch (e) {
      console.log(`   → Parse error: ${e.message}`);
    }
  } else {
    console.log(`❌ ${source}: ${data ? data.length : 0} characters (empty)`);
  }
});

// Step 2: Get current user
console.log('\n👤 CHECKING USER SESSION:');
let currentUser = null;

// Try to get user from auth session
try {
  const authSession = localStorage.getItem('auth:session');
  if (authSession) {
    const parsed = JSON.parse(authSession);
    if (parsed.user) {
      currentUser = parsed.user;
      console.log(`✅ User from auth: ${currentUser.name} (${currentUser.sub})`);
    }
  }
} catch (e) {
  console.log('❌ No auth session found');
}

// Try to get user from cookies
const cookies = document.cookie.split(';');
const sessionCookie = cookies.find(c => c.trim().startsWith('sid='));
if (sessionCookie) {
  console.log('✅ Session cookie found (user logged in)');
  if (!currentUser) {
    currentUser = { sub: 'cookie_user', name: 'User', email: 'unknown' };
  }
}

if (!currentUser) {
  console.log('❌ No user session found - you may need to log in first');
}

// Step 3: Recovery function
function recoverConversations() {
  console.log('\n🔄 STARTING RECOVERY PROCESS:');
  
  if (!currentUser) {
    console.log('❌ Cannot recover without user session. Please log in first.');
    return;
  }

  let recoveredThreads = [];
  
  // Try to recover from each source
  Object.entries(foundData).forEach(([source, data]) => {
    try {
      const parsed = JSON.parse(data);
      let threads = [];
      
      if (Array.isArray(parsed)) {
        threads = parsed.filter(t => t && t.id);
      } else if (parsed.conversations) {
        threads = parsed.conversations.filter(t => t && t.id);
      } else if (parsed.threads) {
        threads = parsed.threads.filter(t => t && t.id);
      } else if (parsed.messages) {
        // Convert messages to thread
        threads = [{
          id: `recovered_${Date.now()}`,
          title: 'Recovered Conversation',
          messages: parsed.messages,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }];
      }
      
      if (threads.length > 0) {
        console.log(`✅ Recovered ${threads.length} threads from ${source}`);
        recoveredThreads = [...recoveredThreads, ...threads];
      }
    } catch (e) {
      console.log(`❌ Failed to parse ${source}: ${e.message}`);
    }
  });
  
  // Remove duplicates
  const uniqueThreads = [];
  const seen = new Set();
  recoveredThreads.forEach(thread => {
    if (!seen.has(thread.id)) {
      seen.add(thread.id);
      uniqueThreads.push(thread);
    }
  });
  
  console.log(`\n🎉 RECOVERY COMPLETE:`);
  console.log(`   → Found ${recoveredThreads.length} total threads`);
  console.log(`   → ${uniqueThreads.length} unique threads after deduplication`);
  
  if (uniqueThreads.length > 0) {
    // Save to user-specific storage
    const userKey = `chatty:threads:${currentUser.sub}`;
    localStorage.setItem(userKey, JSON.stringify(uniqueThreads));
    
    // Create backup
    const backupKey = `chatty:threads:backup:${currentUser.sub}:${Date.now()}`;
    localStorage.setItem(backupKey, JSON.stringify(uniqueThreads));
    
    console.log(`💾 Saved to: ${userKey}`);
    console.log(`🛡️ Backup created: ${backupKey}`);
    console.log(`\n✅ SUCCESS! Your conversations have been recovered.`);
    console.log(`   Refresh the page to see them in the sidebar.`);
    
    return true;
  } else {
    console.log(`\n❌ No conversations found to recover.`);
    return false;
  }
}

// Step 4: Auto-run recovery if we have data and user
if (Object.keys(foundData).length > 0 && currentUser) {
  console.log('\n🚀 AUTO-RUNNING RECOVERY...');
  const success = recoverConversations();
  
  if (success) {
    console.log('\n🎯 NEXT STEPS:');
    console.log('1. Refresh this page (Ctrl+R or Cmd+R)');
    console.log('2. Your conversations should appear in the sidebar');
    console.log('3. If they don\'t appear, check the browser console for errors');
  }
} else {
  console.log('\n⚠️ MANUAL RECOVERY NEEDED:');
  console.log('Run: recoverConversations()');
}

// Export the recovery function for manual use
window.recoverConversations = recoverConversations;

console.log('\n📋 RECOVERY SUMMARY:');
console.log(`   Data sources found: ${Object.keys(foundData).length}`);
console.log(`   User session: ${currentUser ? '✅ Found' : '❌ Missing'}`);
console.log(`   Recovery function: window.recoverConversations()`);

