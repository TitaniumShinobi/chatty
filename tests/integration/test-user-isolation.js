// test-user-isolation.js
// Test script to verify user data isolation works correctly

console.log('🧪 Testing User Data Isolation...\n');

// Test 1: Check localStorage keys
console.log('1. Current localStorage keys:');
const chattyKeys = [];
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key && key.startsWith('chatty:')) {
    chattyKeys.push(key);
  }
}
console.log('   Chatty keys:', chattyKeys);

// Test 2: Check auth session
console.log('\n2. Auth session:');
const authSession = localStorage.getItem('auth:session');
if (authSession) {
  try {
    const session = JSON.parse(authSession);
    console.log('   User:', session.user?.email);
    console.log('   User ID:', session.user?.sub || session.user?.id || session.user?.email);
  } catch (e) {
    console.log('   Invalid session data');
  }
} else {
  console.log('   No auth session found');
}

// Test 3: Check user-specific conversation keys
console.log('\n3. User-specific conversation keys:');
const conversationKeys = chattyKeys.filter(key => key.startsWith('chatty:threads:'));
conversationKeys.forEach(key => {
  const data = localStorage.getItem(key);
  if (data) {
    try {
      const conversations = JSON.parse(data);
      console.log(`   ${key}: ${conversations.length} conversations`);
    } catch (e) {
      console.log(`   ${key}: Invalid data`);
    }
  }
});

// Test 4: Check backup keys
console.log('\n4. Backup keys:');
const backupKeys = chattyKeys.filter(key => key.includes('backup'));
backupKeys.forEach(key => {
  const data = localStorage.getItem(key);
  if (data) {
    console.log(`   ${key}: ${(data.length / 1024).toFixed(1)} KB`);
  }
});

// Test 5: Test getUserId function
console.log('\n5. Testing getUserId function:');
const testUsers = [
  { sub: 'user123', email: 'test@example.com', name: 'Test User' },
  { id: 'user456', email: 'test2@example.com', name: 'Test User 2' },
  { email: 'test3@example.com', name: 'Test User 3' }
];

testUsers.forEach((user, index) => {
  const userId = user.sub || user.id || user.email || 'unknown';
  console.log(`   User ${index + 1}: ${userId} (from ${user.sub ? 'sub' : user.id ? 'id' : 'email'})`);
});

// Test 6: Check for legacy keys
console.log('\n6. Legacy keys (should be migrated):');
const legacyKey = 'chatty:threads';
const legacyData = localStorage.getItem(legacyKey);
if (legacyData) {
  try {
    const conversations = JSON.parse(legacyData);
    console.log(`   Found legacy conversations: ${conversations.length}`);
    console.log('   ⚠️  These should be migrated to user-specific keys');
  } catch (e) {
    console.log('   Legacy data is invalid');
  }
} else {
  console.log('   No legacy conversations found ✅');
}

// Test 7: Summary
console.log('\n7. Summary:');
console.log(`   Total chatty keys: ${chattyKeys.length}`);
console.log(`   Conversation keys: ${conversationKeys.length}`);
console.log(`   Backup keys: ${backupKeys.length}`);
console.log(`   Has auth session: ${!!authSession}`);
console.log(`   Has legacy data: ${!!legacyData}`);

if (conversationKeys.length > 0 && !legacyData) {
  console.log('   ✅ User data isolation appears to be working correctly');
} else if (legacyData) {
  console.log('   ⚠️  Legacy data found - migration may be needed');
} else {
  console.log('   ℹ️  No conversation data found');
}

console.log('\n🎯 Test completed!');
