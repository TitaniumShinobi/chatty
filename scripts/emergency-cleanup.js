// emergency-cleanup.js
// Emergency script to clear localStorage and fix quota exceeded error

console.log('🚨 EMERGENCY CLEANUP - Fixing localStorage quota exceeded error...\n');

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

// Step 2: Show largest keys
console.log('\n2. Largest Chatty keys:');
chattyKeys.sort((a, b) => b.size - a.size);
chattyKeys.slice(0, 10).forEach(item => {
  console.log(`   ${item.key}: ${(item.size / 1024).toFixed(1)} KB`);
});

// Step 3: Emergency cleanup
console.log('\n3. Performing emergency cleanup...');

// Remove all backup files except the most recent one per user
const backupKeys = chattyKeys.filter(item => 
  item.key.includes('backup') || item.key.includes('full_backup')
);

console.log(`   Found ${backupKeys.length} backup files`);

// Group by user
const userBackups = {};
backupKeys.forEach(item => {
  const parts = item.key.split(':');
  const userId = parts[3] || 'unknown';
  if (!userBackups[userId]) userBackups[userId] = [];
  userBackups[userId].push(item);
});

// Keep only the most recent backup per user
let removedCount = 0;
let freedSpace = 0;

Object.values(userBackups).forEach(backups => {
  if (backups.length > 1) {
    // Sort by timestamp (newest last)
    backups.sort((a, b) => {
      const timestampA = parseInt(a.key.split(':').pop() || '0');
      const timestampB = parseInt(b.key.split(':').pop() || '0');
      return timestampA - timestampB;
    });
    
    // Remove all but the most recent
    const toRemove = backups.slice(0, -1);
    toRemove.forEach(item => {
      localStorage.removeItem(item.key);
      removedCount++;
      freedSpace += item.size;
      console.log(`   🗑️ Removed: ${item.key}`);
    });
  }
});

// Step 4: Remove old migration backups
const migrationBackups = chattyKeys.filter(item => 
  item.key.includes('migration') || item.key.includes('restore_backup')
);

migrationBackups.forEach(item => {
  localStorage.removeItem(item.key);
  removedCount++;
  freedSpace += item.size;
  console.log(`   🗑️ Removed migration backup: ${item.key}`);
});

// Step 5: Results
console.log('\n4. Cleanup results:');
console.log(`   Removed ${removedCount} files`);
console.log(`   Freed ${(freedSpace / 1024 / 1024).toFixed(2)} MB`);

// Step 6: Check remaining usage
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

// Step 7: Recommendations
console.log('\n5. Recommendations:');
console.log('   ✅ Try refreshing the page now');
console.log('   ✅ The app should load properly');
console.log('   ⚠️  Consider reducing conversation history if the issue persists');
console.log('   💡 Use the backup system to export important conversations');

console.log('\n🎯 Emergency cleanup completed!');
console.log('   Please refresh the page to continue using Chatty.');
