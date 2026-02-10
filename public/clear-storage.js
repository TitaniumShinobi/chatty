// clear-storage.js
// Emergency script to clear all localStorage and fix storage issues

console.log('🚨 EMERGENCY STORAGE CLEAR - Fixing localStorage issues...\n');

// Step 1: Check current localStorage usage
console.log('1. Current localStorage usage:');
let totalSize = 0;
let chattyKeys = [];
let chattySize = 0;

for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key) {
    const value = localStorage.getItem(key);
    const size = value ? value.length : 0;
    totalSize += size;
    
    if (key.startsWith('chatty:')) {
      chattyKeys.push({ key, size });
      chattySize += size;
    }
  }
}

console.log(`   Total localStorage size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`   Chatty keys: ${chattyKeys.length}`);
console.log(`   Chatty size: ${(chattySize / 1024 / 1024).toFixed(2)} MB`);

// Step 2: Clear ALL chatty data
console.log('\n2. Clearing all Chatty data...');

let removedCount = 0;
let freedSpace = 0;

chattyKeys.forEach(item => {
  localStorage.removeItem(item.key);
  removedCount++;
  freedSpace += item.size;
  console.log(`   🗑️ Removed: ${item.key}`);
});

// Step 3: Results
console.log('\n3. Cleanup results:');
console.log(`   Removed ${removedCount} files`);
console.log(`   Freed ${(freedSpace / 1024 / 1024).toFixed(2)} MB`);

// Step 4: Check remaining usage
let newTotalSize = 0;
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key) {
    const value = localStorage.getItem(key);
    newTotalSize += value ? value.length : 0;
  }
}

console.log(`   New total size: ${(newTotalSize / 1024 / 1024).toFixed(2)} MB`);
console.log(`   Space freed: ${((totalSize - newTotalSize) / 1024 / 1024).toFixed(2)} MB`);

// Step 5: Recommendations
console.log('\n4. Next steps:');
console.log('   ✅ Refresh the page');
console.log('   ✅ Chatty will now use backend as primary storage');
console.log('   ✅ localStorage will only cache recent conversations');
console.log('   💡 Your conversations are safe on the server');

console.log('\n🎯 Storage cleared successfully!');
console.log('   Chatty will now work without localStorage issues.');
