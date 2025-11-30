#!/usr/bin/env node

/**
 * Force reload Katana capsule to pick up new transcript data
 */

import { getCapsuleIntegration } from './server/lib/capsuleIntegration.js';

async function forceCapsuleReload() {
  console.log('🔄 FORCING KATANA CAPSULE RELOAD');
  console.log('🎯 Goal: Pick up new transcript data from Missing-context-examples-K1.md\n');
  
  const capsuleIntegration = getCapsuleIntegration();
  
  console.log('🗑️ Clearing capsule cache...');
  capsuleIntegration.clearCache();
  
  console.log('📦 Force loading katana-001 capsule...');
  const capsule = await capsuleIntegration.loadCapsule('katana-001');
  
  if (capsule && capsule.transcript_data) {
    console.log('✅ Capsule loaded successfully!');
    console.log(`📊 Transcript files: ${capsule.transcript_data.files?.length || 0}`);
    
    // Check if our new file is included
    const newFile = capsule.transcript_data.files?.find(f => 
      f.filename === 'Missing-context-examples-K1.md'
    );
    
    if (newFile) {
      console.log('🎉 NEW FILE DETECTED: Missing-context-examples-K1.md');
      console.log(`   - Size: ${newFile.size} bytes`);
      console.log(`   - Conversations: ${newFile.conversations}`);
    } else {
      console.log('❌ New file not detected in capsule');
      console.log('Available files:');
      capsule.transcript_data.files?.forEach(f => {
        console.log(`   - ${f.filename}`);
      });
    }
    
    // Check entities
    if (capsule.transcript_data.entities) {
      const workEntity = capsule.transcript_data.entities['work'];
      const playEntity = capsule.transcript_data.entities['play'];
      const precisionEntity = capsule.transcript_data.entities['precision'];
      const sugarEntity = capsule.transcript_data.entities['sugar'];
      
      console.log('\n🏷️ Entity Status:');
      console.log(`   - work: ${workEntity ? '✅ Found' : '❌ Missing'}`);
      console.log(`   - play: ${playEntity ? '✅ Found' : '❌ Missing'}`);
      console.log(`   - precision: ${precisionEntity ? '✅ Found' : '❌ Missing'}`);
      console.log(`   - sugar: ${sugarEntity ? '✅ Found' : '❌ Missing'}`);
    }
    
  } else {
    console.log('❌ Failed to load capsule or no transcript data');
  }
  
  console.log('\n🏁 Capsule reload completed');
}

// Run the reload
forceCapsuleReload()
  .then(() => {
    console.log('\n✅ Force reload completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Force reload failed:', error);
    process.exit(1);
  });
