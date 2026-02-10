
// FORCE CONVERSATION RESTORE SCRIPT
// This script ensures your recovered conversations are properly displayed

console.log('🔄 FORCING CONVERSATION RESTORE');
console.log('==============================');

// Check current localStorage data
const currentData = localStorage.getItem('chatty-data');
if (currentData) {
  const parsed = JSON.parse(currentData);
  console.log(`📊 Current conversations in localStorage: ${parsed.conversations?.length || 0}`);
  
  if (parsed.conversations && parsed.conversations.length > 0) {
    console.log('\n💬 Your recovered conversations:');
    parsed.conversations.forEach((conv, index) => {
      console.log(`   ${index + 1}. ${conv.title} (${conv.messages?.length || 0} messages)`);
    });
    
    // Force a page refresh to ensure the UI updates
    console.log('\n🔄 Refreshing page to ensure conversations are displayed...');
    window.location.reload();
  } else {
    console.log('❌ No conversations found in localStorage');
  }
} else {
  console.log('❌ No chatty-data found in localStorage');
}

// Also check if there are any backend sync issues
console.log('\n🔍 Checking for backend sync issues...');
console.log('If you see "2 conversations loaded from backend" in the console,');
console.log('the backend might be overriding your recovered conversations.');
console.log('\n📞 If conversations are not showing in the sidebar:');
console.log('1. Check the browser console for any error messages');
console.log('2. Look for "Conversations loaded from backend" messages');
console.log('3. The backend might be syncing and overriding your local data');
console.log('4. Try refreshing the page a few times');
