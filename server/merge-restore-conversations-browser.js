
// MERGE AND RESTORE CONVERSATIONS SCRIPT
// This script merges localStorage conversations with backend data and prevents overwrites

console.log('🔄 MERGING AND RESTORING CONVERSATIONS');
console.log('=====================================');

// Function to safely parse JSON
function safeParse(jsonString, key) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.log(`⚠️  Could not parse ${key}: ${e.message}`);
    return null;
  }
}

// Function to generate unique ID
function generateId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Function to merge conversations without duplicates
function mergeConversations(localConversations, backendConversations) {
  const merged = [...backendConversations];
  const existingIds = new Set(backendConversations.map(conv => conv.id));
  
  localConversations.forEach(localConv => {
    if (!existingIds.has(localConv.id)) {
      // Add local conversation that doesn't exist in backend
      merged.push(localConv);
      console.log(`✅ Added local conversation: ${localConv.title}`);
    } else {
      console.log(`⚠️  Skipping duplicate: ${localConv.title}`);
    }
  });
  
  return merged;
}

// Function to save conversations to backend
async function saveConversationsToBackend(conversations) {
  try {
    const response = await fetch('/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversations })
    });
    
    if (response.ok) {
      console.log('✅ Conversations saved to backend');
      return true;
    } else {
      console.log('❌ Failed to save to backend:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ Error saving to backend:', error.message);
    return false;
  }
}

// Main restoration process
async function restoreConversations() {
  console.log('🔍 STEP 1: EXTRACTING LOCAL CONVERSATIONS');
  console.log('=========================================');
  
  const localConversations = [];
  
  // Extract from chatty-data
  const chattyData = localStorage.getItem('chatty-data');
  if (chattyData) {
    const parsed = safeParse(chattyData, 'chatty-data');
    if (parsed && parsed.conversations && Array.isArray(parsed.conversations)) {
      localConversations.push(...parsed.conversations);
      console.log(`📄 Found ${parsed.conversations.length} conversations in chatty-data`);
    }
  }
  
  // Extract from STM threads
  const stmKeys = Object.keys(localStorage).filter(key => key.startsWith('chatty_stm_'));
  console.log(`📄 Found ${stmKeys.length} STM thread keys`);
  
  stmKeys.forEach(key => {
    const data = localStorage.getItem(key);
    const parsed = safeParse(data, key);
    
    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
      // Convert STM thread to conversation
      const conversation = {
        id: generateId(),
        title: `STM Thread ${key.split('_').pop()}`,
        messages: parsed.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp
        })),
        createdAt: parsed[0]?.timestamp || new Date().toISOString(),
        updatedAt: parsed[parsed.length - 1]?.timestamp || new Date().toISOString()
      };
      localConversations.push(conversation);
      console.log(`📄 Added conversation from ${key}`);
    }
  });
  
  // Extract from chatty:threads
  const threadsKey = Object.keys(localStorage).find(key => key.startsWith('chatty:threads:'));
  if (threadsKey) {
    const data = localStorage.getItem(threadsKey);
    const parsed = safeParse(data, threadsKey);
    if (parsed && Array.isArray(parsed)) {
      localConversations.push(...parsed);
      console.log(`📄 Added ${parsed.length} conversations from ${threadsKey}`);
    }
  }
  
  console.log(`\n📊 TOTAL LOCAL CONVERSATIONS: ${localConversations.length}`);
  
  console.log('\n🔍 STEP 2: FETCHING BACKEND CONVERSATIONS');
  console.log('==========================================');
  
  let backendConversations = [];
  try {
    const response = await fetch('/api/conversations');
    if (response.ok) {
      const data = await response.json();
      backendConversations = data.conversations || [];
      console.log(`📄 Found ${backendConversations.length} conversations in backend`);
    } else {
      console.log('⚠️  Could not fetch backend conversations, using local only');
    }
  } catch (error) {
    console.log('⚠️  Error fetching backend conversations:', error.message);
  }
  
  console.log('\n🔄 STEP 3: MERGING CONVERSATIONS');
  console.log('=================================');
  
  const mergedConversations = mergeConversations(localConversations, backendConversations);
  console.log(`📊 MERGED CONVERSATIONS: ${mergedConversations.length}`);
  console.log(`   Local: ${localConversations.length}`);
  console.log(`   Backend: ${backendConversations.length}`);
  console.log(`   Merged: ${mergedConversations.length}`);
  
  console.log('\n💾 STEP 4: SAVING TO BACKEND');
  console.log('=============================');
  
  // Save merged conversations to backend
  const saveSuccess = await saveConversationsToBackend(mergedConversations);
  
  console.log('\n💾 STEP 5: UPDATING LOCALSTORAGE');
  console.log('==================================');
  
  // Update localStorage with merged conversations
  const updatedData = {
    conversations: mergedConversations,
    lastModified: new Date().toISOString(),
    source: 'merge-restore',
    merged: true
  };
  
  localStorage.setItem('chatty-data', JSON.stringify(updatedData));
  console.log('✅ Updated localStorage with merged conversations');
  
  console.log('\n🔄 STEP 6: REFRESHING UI');
  console.log('==========================');
  
  console.log('🔄 Refreshing page to apply changes...');
  window.location.reload();
}

// Run the restoration
restoreConversations();
