import axios from 'axios';
import { MongoClient } from 'mongodb';

const API_BASE = 'http://localhost:5000/api';
let authToken = null;
let userId = null;

// Test user data
const testUser = {
  email: 'test@chatty.com',
  password: 'testpassword123',
  name: 'Test User'
};

// Helper function to make authenticated requests
const makeAuthRequest = async (method, endpoint, data = null) => {
  const config = {
    method,
    url: `${API_BASE}${endpoint}`,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken && { 'Authorization': `Bearer ${authToken}` })
    },
    ...(data && { data })
  };
  
  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`❌ ${method} ${endpoint} failed:`, error.response?.data || error.message);
    throw error;
  }
};

// Test 1: User Registration
const testRegistration = async () => {
  console.log('\n🔐 Testing User Registration...');
  
  try {
    const result = await makeAuthRequest('POST', '/auth/register', testUser);
    console.log('✅ Registration successful:', {
      userId: result.user.id,
      email: result.user.email,
      hasToken: !!result.token
    });
    
    authToken = result.token;
    userId = result.user.id;
    return true;
  } catch (error) {
    console.log('❌ Registration failed');
    return false;
  }
};

// Test 2: User Login
const testLogin = async () => {
  console.log('\n🔑 Testing User Login...');
  
  try {
    const result = await makeAuthRequest('POST', '/auth/login', {
      email: testUser.email,
      password: testUser.password
    });
    
    console.log('✅ Login successful:', {
      userId: result.user.id,
      email: result.user.email,
      hasToken: !!result.token
    });
    
    authToken = result.token;
    userId = result.user.id;
    return true;
  } catch (error) {
    console.log('❌ Login failed');
    return false;
  }
};

// Test 3: Create Conversation
const testCreateConversation = async () => {
  console.log('\n💬 Testing Conversation Creation...');
  
  try {
    const result = await makeAuthRequest('POST', '/conversations', {
      title: 'Test Conversation',
      activeGPTId: 'chatty-core'
    });
    
    console.log('✅ Conversation created:', {
      conversationId: result._id,
      title: result.title,
      userId: result.userId
    });
    
    return result._id;
  } catch (error) {
    console.log('❌ Conversation creation failed');
    return null;
  }
};

// Test 4: Add Messages to Conversation
const testAddMessages = async (conversationId) => {
  console.log('\n📝 Testing Message Addition...');
  
  try {
    // Add user message
    const userMessage = await makeAuthRequest('POST', `/conversations/${conversationId}/messages`, {
      content: 'Hello, this is a test message!',
      role: 'user'
    });
    
    console.log('✅ User message added:', {
      messageId: userMessage.id,
      content: userMessage.content.substring(0, 30) + '...'
    });
    
    // Add AI response
    const aiMessage = await makeAuthRequest('POST', `/conversations/${conversationId}/messages`, {
      content: 'Hello! I received your test message. How can I help you today?',
      role: 'assistant'
    });
    
    console.log('✅ AI message added:', {
      messageId: aiMessage.id,
      content: aiMessage.content.substring(0, 30) + '...'
    });
    
    return true;
  } catch (error) {
    console.log('❌ Message addition failed');
    return false;
  }
};

// Test 5: Retrieve Conversation
const testRetrieveConversation = async (conversationId) => {
  console.log('\n📖 Testing Conversation Retrieval...');
  
  try {
    const result = await makeAuthRequest('GET', `/conversations/${conversationId}`);
    
    console.log('✅ Conversation retrieved:', {
      conversationId: result._id,
      title: result.title,
      messageCount: result.messages.length,
      lastMessage: result.messages[result.messages.length - 1]?.content.substring(0, 30) + '...'
    });
    
    return result.messages.length === 2; // Should have 2 messages
  } catch (error) {
    console.log('❌ Conversation retrieval failed');
    return false;
  }
};

// Test 6: Create Custom GPT
const testCreateGPT = async () => {
  console.log('\n🤖 Testing Custom GPT Creation...');
  
  try {
    const result = await makeAuthRequest('POST', '/gpts', {
      name: 'Test Assistant',
      description: 'A test assistant for testing purposes',
      instructions: 'You are a helpful test assistant.',
      conversationStarters: ['Hello!', 'How can I help?'],
      capabilities: {
        webSearch: false,
        canvas: false,
        imageGeneration: false,
        codeInterpreter: true
      },
      modelId: 'chatty-core'
    });
    
    console.log('✅ Custom GPT created:', {
      gptId: result._id,
      name: result.name,
      userId: result.userId
    });
    
    return result._id;
  } catch (error) {
    console.log('❌ Custom GPT creation failed');
    return null;
  }
};

// Test 7: Database Verification
const testDatabaseVerification = async () => {
  console.log('\n🗄️ Testing Database Verification...');
  
  try {
    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    
    const db = client.db('chatty');
    
    // Check user exists
    const user = await db.collection('users').findOne({ email: testUser.email });
    console.log('✅ User in database:', {
      exists: !!user,
      userId: user?._id,
      email: user?.email,
      name: user?.name
    });
    
    // Check conversations exist
    const conversations = await db.collection('conversations').find({ userId: user._id }).toArray();
    console.log('✅ Conversations in database:', {
      count: conversations.length,
      titles: conversations.map(c => c.title)
    });
    
    // Check GPTs exist
    const gpts = await db.collection('gpts').find({ userId: user._id }).toArray();
    console.log('✅ Custom GPTs in database:', {
      count: gpts.length,
      names: gpts.map(g => g.name)
    });
    
    await client.close();
    return true;
  } catch (error) {
    console.log('❌ Database verification failed:', error.message);
    return false;
  }
};

// Test 8: Session Persistence (Logout and Login)
const testSessionPersistence = async () => {
  console.log('\n🔄 Testing Session Persistence...');
  
  try {
    // Clear token (simulate logout)
    const oldToken = authToken;
    authToken = null;
    
    // Try to access protected resource (should fail)
    try {
      await makeAuthRequest('GET', '/conversations');
      console.log('❌ Should have failed without token');
      return false;
    } catch (error) {
      console.log('✅ Correctly rejected request without token');
    }
    
    // Login again
    const result = await makeAuthRequest('POST', '/auth/login', {
      email: testUser.email,
      password: testUser.password
    });
    
    authToken = result.token;
    
    // Try to access protected resource again (should succeed)
    const conversations = await makeAuthRequest('GET', '/conversations');
    
    console.log('✅ Session persistence verified:', {
      canAccessAfterLogin: !!conversations,
      conversationCount: conversations.length
    });
    
    return true;
  } catch (error) {
    console.log('❌ Session persistence test failed');
    return false;
  }
};

// Main test runner
const runAllTests = async () => {
  console.log('🧪 Starting User Account Memory Tests...\n');
  
  const results = {
    registration: await testRegistration(),
    login: await testLogin(),
    conversationCreation: false,
    messageAddition: false,
    conversationRetrieval: false,
    gptCreation: false,
    databaseVerification: false,
    sessionPersistence: false
  };
  
  if (results.login) {
    const conversationId = await testCreateConversation();
    if (conversationId) {
      results.conversationCreation = true;
      results.messageAddition = await testAddMessages(conversationId);
      results.conversationRetrieval = await testRetrieveConversation(conversationId);
    }
    
    const gptId = await testCreateGPT();
    if (gptId) {
      results.gptCreation = true;
    }
    
    results.databaseVerification = await testDatabaseVerification();
    results.sessionPersistence = await testSessionPersistence();
  }
  
  // Summary
  console.log('\n📊 Test Results Summary:');
  console.log('========================');
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASSED' : 'FAILED'}`);
  });
  
  const passedTests = Object.values(results).filter(Boolean).length;
  const totalTests = Object.keys(results).length;
  
  console.log(`\n🎯 Overall: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! User account memory system is working correctly.');
  } else {
    console.log('⚠️ Some tests failed. Check the implementation.');
  }
};

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export { runAllTests };
