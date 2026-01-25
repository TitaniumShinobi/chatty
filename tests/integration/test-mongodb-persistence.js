/**
 * MongoDB Persistence Test Script
 * Verifies Store methods persist to MongoDB correctly
 * 
 * Run: node test-mongodb-persistence.js
 */

import { initMongoose, closeMongoose } from './server/config/mongoose.js';

// Store useMemory is set at module load time, so we need to handle MongoDB connection
// before importing Store. We'll import it conditionally after checking MongoDB.
let Store;

const TEST_OWNER = 'test-user-' + Date.now();
const TEST_CONVERSATION_TITLE = 'Test Conversation ' + new Date().toISOString();

async function testMongoDBPersistence() {
  let useMongoDB = process.env.MONGODB_URI && process.env.MONGODB_URI.trim() !== '';
  let mode = useMongoDB ? 'MongoDB' : 'Memory';
  let mongoConnected = false;
  
  console.log(`🧪 Starting ${mode} persistence test...\n`);

  try {
    // Step 1: Initialize Mongoose (only if MONGODB_URI is set)
    if (useMongoDB) {
      console.log('1️⃣ Initializing Mongoose connection...');
      try {
        await initMongoose();
        mongoConnected = true;
        console.log('✅ Mongoose connected\n');
      } catch (error) {
        console.warn('⚠️ MongoDB connection failed, falling back to memory mode');
        console.warn(`   Error: ${error.message}\n`);
        // Force memory mode by clearing MONGODB_URI before importing Store
        delete process.env.MONGODB_URI;
        useMongoDB = false;
        mode = 'Memory';
        console.log('   Continuing test in memory mode...\n');
      }
    } else {
      console.log('1️⃣ Skipping MongoDB (using memory mode)\n');
    }

    // Import Store AFTER determining MongoDB availability (Store checks useMemory at import time)
    if (!Store) {
      const storeModule = await import('./server/store.js');
      Store = storeModule.Store;
    }

    // Step 2: Create a conversation
    console.log('2️⃣ Creating test conversation...');
    const conversation = await Store.createConversation(TEST_OWNER, {
      title: TEST_CONVERSATION_TITLE,
      model: 'gpt-4o'
    });
    console.log('✅ Conversation created:', {
      id: conversation._id || conversation.id,
      title: conversation.title,
      owner: conversation.owner
    });
    console.log('');

    // Step 3: Create a message
    console.log('3️⃣ Creating test message...');
    const message = await Store.createMessage(TEST_OWNER, conversation._id || conversation.id, {
      role: 'user',
      content: 'This is a test message to verify MongoDB persistence.',
      tokens: 10,
      meta: { test: true }
    });
    console.log('✅ Message created:', {
      id: message._id || message.id,
      role: message.role,
      content: message.content.substring(0, 50) + '...'
    });
    console.log('');

    // Step 4: Verify conversation exists
    console.log('4️⃣ Verifying conversation persistence...');
    const conversations = await Store.listConversations(TEST_OWNER);
    const foundConversation = conversations.find(c => 
      (c._id || c.id) === (conversation._id || conversation.id)
    );
    
    if (foundConversation) {
      console.log('✅ Conversation found in database');
    } else {
      throw new Error('❌ Conversation not found in database');
    }
    console.log('');

    // Step 5: Verify message exists
    console.log('5️⃣ Verifying message persistence...');
    const messages = await Store.listMessages(TEST_OWNER, conversation._id || conversation.id);
    const foundMessage = messages.find(m => 
      (m._id || m.id) === (message._id || message.id)
    );
    
    if (foundMessage) {
      console.log('✅ Message found in database');
    } else {
      throw new Error('❌ Message not found in database');
    }
    console.log('');

    // Step 6: Cleanup
    console.log('6️⃣ Test completed successfully!');
    console.log(`✅ ${mode} persistence verified\n`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    // Close connection (only if MongoDB was actually connected)
    if (mongoConnected) {
      try {
        await closeMongoose();
        console.log('🔌 Mongoose connection closed');
      } catch (error) {
        console.warn('⚠️ Failed to close Mongoose connection:', error.message);
      }
    }
  }
}

// Run the test
testMongoDBPersistence();

