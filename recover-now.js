// IMMEDIATE RECOVERY SCRIPT FOR CHATTY CONVERSATIONS
// Run this in your browser console RIGHT NOW to recover your conversations

console.log('🚨 CHATTY EMERGENCY RECOVERY SCRIPT');
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
    // Try to get user info from API
    fetch('/api/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.user) {
          currentUser = data.user;
          console.log(`✅ User from API: ${currentUser.name} (${currentUser.sub})`);
          // Store in localStorage for future use
          localStorage.setItem('auth:session', JSON.stringify({ user: currentUser }));
          // Now run recovery
          runRecovery();
        }
      })
      .catch(e => console.log('❌ Failed to get user from API:', e));
  }
}

// Step 3: Recovery function
function runRecovery() {
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
    
    // Show success banner
    const banner = document.createElement('div');
    banner.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #10B981;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      max-width: 300px;
    `;
    banner.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">✅ Conversations Recovered!</div>
      <div>Restored ${uniqueThreads.length} conversations for ${currentUser.name || currentUser.email}</div>
    `;
    
    document.body.appendChild(banner);
    
    // Remove after 5 seconds
    setTimeout(() => {
      if (banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }
    }, 5000);
    
    return true;
  } else {
    console.log(`\n❌ No conversations found to recover.`);
    return false;
  }
}

// Step 4: Auto-run recovery if we have data and user
if (Object.keys(foundData).length > 0 && currentUser) {
  console.log('\n🚀 AUTO-RUNNING RECOVERY...');
  const success = runRecovery();
  
  if (success) {
    console.log('\n🎯 NEXT STEPS:');
    console.log('1. Refresh this page (Ctrl+R or Cmd+R)');
    console.log('2. Your conversations should appear in the sidebar');
    console.log('3. If they don\'t appear, check the browser console for errors');
  }
} else if (Object.keys(foundData).length > 0 && !currentUser) {
  console.log('\n⚠️ DATA FOUND BUT NO USER SESSION:');
  console.log('1. Make sure you are logged in to Chatty');
  console.log('2. Refresh the page and try again');
  console.log('3. Or run: runRecovery() manually after logging in');
} else {
  console.log('\n❌ NO DATA FOUND:');
  console.log('No conversation data found in localStorage');
  console.log('Your conversations may have been cleared or never saved');
}

// Export the recovery function for manual use
window.runRecovery = runRecovery;

console.log('\n📋 RECOVERY SUMMARY:');
console.log(`   Data sources found: ${Object.keys(foundData).length}`);
console.log(`   User session: ${currentUser ? '✅ Found' : '❌ Missing'}`);
console.log(`   Recovery function: window.runRecovery()`);


