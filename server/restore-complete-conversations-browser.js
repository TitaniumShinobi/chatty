
// RESTORE ALL CONVERSATIONS SCRIPT
// Run this in your browser console to restore ALL conversations from ALL sources

const conversations = [
  {
    "id": "sqlite-conv-1",
    "title": "SQLite Conversation 1",
    "messages": [
      {
        "role": "user",
        "content": "Hello! My name is Devon and I'm testing persistent memory.",
        "timestamp": "2025-10-12T20:10:53.932Z"
      },
      {
        "role": "user",
        "content": "Hello! My name is Devon and I'm testing persistent memory.",
        "timestamp": "2025-10-12T20:11:18.231Z"
      },
      {
        "role": "user",
        "content": "What are your current limitations? Be specific about which models you're using.",
        "timestamp": "2025-10-12T21:08:35.864Z"
      },
      {
        "role": "user",
        "content": "What models are you using?",
        "timestamp": "2025-10-12T21:08:46.084Z"
      },
      {
        "role": "user",
        "content": "hello",
        "timestamp": "2025-10-12T21:08:56.454Z"
      },
      {
        "role": "user",
        "content": "What models are you currently using?",
        "timestamp": "2025-10-12T21:15:09.130Z"
      },
      {
        "role": "user",
        "content": "/help",
        "timestamp": "2025-10-12T21:31:26.223Z"
      }
    ],
    "createdAt": "2025-10-12T20:10:53.932Z",
    "updatedAt": "2025-10-12T21:31:26.223Z",
    "lastMessageTime": 1760304686223
  },
  {
    "id": "sqlite-conv-2",
    "title": "SQLite Conversation 2",
    "messages": [
      {
        "role": "user",
        "content": "well hello again Chatty!",
        "timestamp": "2025-10-21T15:56:16.264Z"
      },
      {
        "role": "user",
        "content": "test",
        "timestamp": "2025-10-21T15:56:52.903Z"
      },
      {
        "role": "user",
        "content": "hello again, Chatty!",
        "timestamp": "2025-10-21T15:57:37.720Z"
      },
      {
        "role": "assistant",
        "content": "\"Hey there! I'm always here and ready for a good chat.",
        "timestamp": "2025-10-21T15:57:46.827Z"
      },
      {
        "role": "user",
        "content": "you even remember the last time we spoke??",
        "timestamp": "2025-10-21T15:58:07.525Z"
      },
      {
        "role": "assistant",
        "content": "Hello again! It's always a pleasure reconnecting with you.",
        "timestamp": "2025-10-21T15:58:14.129Z"
      }
    ],
    "createdAt": "2025-10-21T15:56:16.264Z",
    "updatedAt": "2025-10-21T15:58:14.129Z",
    "lastMessageTime": 1761062294129
  }
];

console.log('🔄 Restoring 2 conversations from all sources...');

// Save conversations to localStorage
localStorage.setItem('chatty-data', JSON.stringify({
  conversations: conversations,
  lastModified: new Date().toISOString()
}));

console.log('✅ 2 conversations restored to localStorage!');
console.log('🔄 Refreshing page to apply changes...');
window.location.reload();
