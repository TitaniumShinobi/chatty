// IMMEDIATE FIX AND RECOVERY SCRIPT
// This handles the user.sub undefined issue and recovers your conversations

console.log('🚨 CHATTY FIX AND RECOVERY SCRIPT');
console.log('===================================');

// Step 1: Get user from API and fix the session
console.log('\n🔧 FIXING USER SESSION:');

fetch('/api/me', { credentials: 'include' })
  .then(r => r.json())
  .then(data => {
    if (data.ok && data.user) {
      const user = data.user;
      console.log('✅ Got user from API:', user);
      console.log('User keys:', Object.keys(user));
      console.log('user.sub:', user.sub);
      console.log('user.id:', user.id);
      console.log('user.email:', user.email);
      
      // Store user session properly
      localStorage.setItem('auth:session', JSON.stringify({ user }));
      console.log('💾 Stored user session in localStorage');
      
      // Now run recovery with the fixed user
      runRecoveryWithUser(user);
    } else {
      console.log('❌ No user found in API response');
    }
  })
  .catch(e => {
    console.log('❌ API error:', e);
    // Try to get user from existing session
    const authSession = localStorage.getItem('auth:session');
    if (authSession) {
      try {
        const parsed = JSON.parse(authSession);
        if (parsed.user) {
          console.log('📋 Using existing user session:', parsed.user);
          runRecoveryWithUser(parsed.user);
        }
      } catch (e) {
        console.log('❌ Failed to parse existing session:', e);
      }
    }
  });

function runRecoveryWithUser(user) {
  console.log('\n🔄 RUNNING RECOVERY WITH USER:');
  console.log('User:', user);
  
  // Handle missing user.sub by using fallback ID
  const userId = user.sub || user.id || user.email || 'unknown';
  console.log('Using userId:', userId);
  
  // Check for old conversations
  const sources = [
    'chatty:threads',
    'chatty-data', 
    'chatty:threads:backup',
    'chatty-conversations'
  ];
  
  let oldData = null;
  let sourceKey = null;
  
  console.log('\n📦 CHECKING FOR OLD CONVERSATIONS:');
  for (const source of sources) {
    const data = localStorage.getItem(source);
    if (data && data.length > 10) {
      oldData = data;
      sourceKey = source;
      console.log(`✅ Found data in ${source}: ${data.length} characters`);
      break;
    } else {
      console.log(`❌ ${source}: ${data ? data.length : 0} characters`);
    }
  }
  
  if (!oldData) {
    console.log('❌ No old conversations found to recover');
    return;
  }
  
  // Check if already migrated
  const newKey = `chatty:threads:${userId}`;
  if (localStorage.getItem(newKey)) {
    console.log('ℹ️ Conversations already migrated for this user');
    try {
      const existing = JSON.parse(localStorage.getItem(newKey) || '[]');
      console.log(`✅ Found ${existing.length} existing conversations`);
      showSuccess(user, existing.length);
      return;
    } catch (e) {
      console.log('⚠️ Failed to parse existing conversations, continuing with migration');
    }
  }
  
  // Migrate conversations
  console.log('\n🔄 MIGRATING CONVERSATIONS:');
  try {
    const parsed = JSON.parse(oldData);
    let oldThreads = [];
    
    if (Array.isArray(parsed)) {
      oldThreads = parsed;
    } else if (parsed.conversations && Array.isArray(parsed.conversations)) {
      oldThreads = parsed.conversations;
    } else if (parsed.threads && Array.isArray(parsed.threads)) {
      oldThreads = parsed.threads;
    } else if (parsed.messages && Array.isArray(parsed.messages)) {
      // Convert messages to thread
      oldThreads = [{
        id: `recovered_${Date.now()}`,
        title: 'Recovered Conversation',
        messages: parsed.messages,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }];
    }
    
    if (!Array.isArray(oldThreads) || oldThreads.length === 0) {
      console.log('❌ No valid conversations found in data');
      return;
    }
    
    // Create backup
    const backupKey = `chatty:threads:backup:${userId}:${Date.now()}`;
    localStorage.setItem(backupKey, oldData);
    console.log(`🛡️ Created backup: ${backupKey}`);
    
    // Migrate to user-specific storage
    localStorage.setItem(newKey, JSON.stringify(oldThreads));
    console.log(`✅ Migrated ${oldThreads.length} conversations from ${sourceKey} to ${newKey}`);
    
    // Show success
    showSuccess(user, oldThreads.length);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

function showSuccess(user, count) {
  console.log(`\n🎉 SUCCESS! Recovered ${count} conversations for ${user.name || user.email}`);
  
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
    <div>Restored ${count} conversations for ${user.name || user.email}</div>
    <div style="font-size: 12px; margin-top: 4px; opacity: 0.9;">Refresh the page to see them</div>
  `;
  
  document.body.appendChild(banner);
  
  // Remove after 8 seconds
  setTimeout(() => {
    if (banner.parentNode) {
      banner.parentNode.removeChild(banner);
    }
  }, 8000);
  
  console.log('\n🎯 NEXT STEPS:');
  console.log('1. Refresh this page (Ctrl+R or Cmd+R)');
  console.log('2. Your conversations should appear in the sidebar');
  console.log('3. If they don\'t appear, check the browser console for errors');
}

console.log('\n⏳ Running recovery...');
