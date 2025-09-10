# 🧪 Testing User Account Memory System

This guide shows you how to test that user accounts and data persistence are working correctly in Chatty.

## 🚀 Quick Start Testing

### 1. **Setup Environment**

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Copy environment file
cp env.example .env

# Edit .env with your settings (at minimum, set JWT secrets)
```

### 2. **Start MongoDB**

```bash
# Local MongoDB
mongod

# Or use MongoDB Atlas (cloud)
# Update MONGODB_URI in .env
```

### 3. **Start the Server**

```bash
npm run dev
```

### 4. **Run Memory Tests**

```bash
npm run test:memory
```

## 📋 What the Tests Verify

### **🔐 Authentication Tests**
- ✅ User registration with email/password
- ✅ User login with credentials
- ✅ JWT token generation and validation
- ✅ Session persistence (logout/login)

### **💬 Conversation Tests**
- ✅ Create new conversations
- ✅ Add messages to conversations
- ✅ Retrieve conversations with messages
- ✅ User-specific data isolation

### **🤖 Custom GPT Tests**
- ✅ Create custom AI personalities
- ✅ Store GPT configurations
- ✅ User-specific GPT ownership

### **🗄️ Database Tests**
- ✅ Data stored in MongoDB
- ✅ User data relationships
- ✅ Data persistence across sessions

## 🛠️ Manual Testing

### **Test 1: User Registration**

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```

**Expected Response:**
```json
{
  "message": "User created successfully. Please check your email to verify your account.",
  "user": {
    "id": "...",
    "email": "test@example.com",
    "name": "Test User"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "..."
}
```

### **Test 2: User Login**

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### **Test 3: Create Conversation**

```bash
curl -X POST http://localhost:5000/api/conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Test Conversation",
    "activeGPTId": "chatty-core"
  }'
```

### **Test 4: Add Message**

```bash
curl -X POST http://localhost:5000/api/conversations/CONVERSATION_ID/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "content": "Hello, this is a test message!",
    "role": "user"
  }'
```

### **Test 5: Retrieve Conversations**

```bash
curl -X GET http://localhost:5000/api/conversations \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🔍 Database Verification

### **Check MongoDB Collections**

```bash
# Connect to MongoDB
mongosh

# Switch to chatty database
use chatty

# Check users collection
db.users.find().pretty()

# Check conversations collection
db.conversations.find().pretty()

# Check gpts collection
db.gpts.find().pretty()
```

### **Verify User Data Relationships**

```javascript
// Find user and their data
const user = db.users.findOne({email: "test@example.com"})
const conversations = db.conversations.find({userId: user._id})
const gpts = db.gpts.find({userId: user._id})

print("User:", user.name)
print("Conversations:", conversations.count())
print("Custom GPTs:", gpts.count())
```

## 🧪 Browser Testing

### **1. Open Browser DevTools**
- Press F12
- Go to Network tab
- Go to Application tab → Local Storage

### **2. Test Frontend Integration**
```javascript
// In browser console
const token = localStorage.getItem('authToken');
console.log('Auth token:', token);

// Test API call
fetch('http://localhost:5000/api/conversations', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(res => res.json())
.then(data => console.log('Conversations:', data));
```

## 🔄 Session Persistence Testing

### **Test Logout/Login Flow**

1. **Login** and get token
2. **Create** conversation/messages
3. **Clear** token (simulate logout)
4. **Login** again with same credentials
5. **Verify** data is still accessible

### **Test Multiple Users**

1. **Register** two different users
2. **Create** data for each user
3. **Verify** data isolation (User A can't see User B's data)

## 🚨 Common Issues & Solutions

### **Issue: "MongoDB connection failed"**
```bash
# Solution: Start MongoDB
mongod

# Or check connection string in .env
MONGODB_URI=mongodb://localhost:27017/chatty
```

### **Issue: "JWT_SECRET not set"**
```bash
# Solution: Set JWT secrets in .env
JWT_SECRET=your-super-secret-jwt-key-here
JWT_REFRESH_SECRET=your-super-secret-refresh-key-here
```

### **Issue: "CORS error"**
```bash
# Solution: Check FRONTEND_URL in .env
FRONTEND_URL=http://localhost:3000
```

### **Issue: "User already exists"**
```bash
# Solution: Use different email or clear database
mongosh
use chatty
db.users.deleteMany({})
```

## 📊 Expected Test Results

When all tests pass, you should see:

```
🧪 Starting User Account Memory Tests...

🔐 Testing User Registration...
✅ Registration successful: { userId: "...", email: "test@chatty.com", hasToken: true }

🔑 Testing User Login...
✅ Login successful: { userId: "...", email: "test@chatty.com", hasToken: true }

💬 Testing Conversation Creation...
✅ Conversation created: { conversationId: "...", title: "Test Conversation", userId: "..." }

📝 Testing Message Addition...
✅ User message added: { messageId: "...", content: "Hello, this is a test message!..." }
✅ AI message added: { messageId: "...", content: "Hello! I received your test message..." }

📖 Testing Conversation Retrieval...
✅ Conversation retrieved: { conversationId: "...", title: "Test Conversation", messageCount: 2 }

🤖 Testing Custom GPT Creation...
✅ Custom GPT created: { gptId: "...", name: "Test Assistant", userId: "..." }

🗄️ Testing Database Verification...
✅ User in database: { exists: true, userId: "...", email: "test@chatty.com" }
✅ Conversations in database: { count: 1, titles: ["Test Conversation"] }
✅ Custom GPTs in database: { count: 1, names: ["Test Assistant"] }

🔄 Testing Session Persistence...
✅ Correctly rejected request without token
✅ Session persistence verified: { canAccessAfterLogin: true, conversationCount: 1 }

📊 Test Results Summary:
========================
✅ registration: PASSED
✅ login: PASSED
✅ conversationCreation: PASSED
✅ messageAddition: PASSED
✅ conversationRetrieval: PASSED
✅ gptCreation: PASSED
✅ databaseVerification: PASSED
✅ sessionPersistence: PASSED

🎯 Overall: 8/8 tests passed
🎉 All tests passed! User account memory system is working correctly.
```

## 🎯 Success Criteria

Your user account memory system is working correctly if:

1. ✅ **Users can register and login**
2. ✅ **Data is stored in database**
3. ✅ **Data persists across sessions**
4. ✅ **Users can only access their own data**
5. ✅ **Conversations and messages are saved**
6. ✅ **Custom GPTs are stored and retrievable**
7. ✅ **Authentication tokens work properly**
8. ✅ **Session persistence works (logout/login)**

If all tests pass, your Chatty backend is ready for production! 🚀
