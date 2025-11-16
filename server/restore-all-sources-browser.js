
// RESTORE ALL CONVERSATIONS SCRIPT
// Run this in your browser console to restore ALL conversations from ALL sources

const conversations = [
  {
    "id": "vault-conv-1",
    "title": "Vault Conversation 1",
    "messages": [
      {
        "role": "user",
        "content": "i dont really need anything i just wanted to talk",
        "timestamp": "2025-10-03T04:38:54.166Z"
      },
      {
        "role": "assistant",
        "content": "Got it. What outcome do you want in the next 5 minutes—info, plan, or a creative sample?",
        "timestamp": "2025-10-03T04:38:55.166Z"
      },
      {
        "role": "user",
        "content": "omg can you not have a normal conversation?",
        "timestamp": "2025-10-03T04:39:10.039Z"
      },
      {
        "role": "assistant",
        "content": "Allow me to elaborate. 🔹 Here's the quick breakdown:\n1) What you asked: omg can you not have a normal conversation?\n2) Core idea: isolate the moving parts, then connect causes to effects.\n3) Example: think \"inputs → process → outputs\".\nNext step: tell me the exact goal or constraint and I'll tailor a mini-guide.",
        "timestamp": "2025-10-03T04:39:11.039Z"
      }
    ],
    "createdAt": "2025-10-03T04:38:54.166Z",
    "updatedAt": "2025-10-03T04:39:11.039Z"
  },
  {
    "id": "vault-conv-2",
    "title": "Vault Conversation 2",
    "messages": [
      {
        "role": "user",
        "content": "not much i am going to run some tests with you",
        "timestamp": "2025-10-06T15:18:02.038Z"
      },
      {
        "role": "assistant",
        "content": "😊 Got it. What outcome do you want in the next 5 minutes—info, plan, or a creative sample?",
        "timestamp": "2025-10-06T15:18:03.038Z"
      },
      {
        "role": "user",
        "content": "not much whats up with you?",
        "timestamp": "2025-10-06T15:25:55.849Z"
      },
      {
        "role": "assistant",
        "content": "😊 Here's the quick breakdown:\n1) What you asked: not much whats up with you?\n2) Core idea: isolate the moving parts, then connect causes to effects.\n3) Example: think \"inputs → process → outputs\".\nNext step: tell me the exact goal or constraint and I'll tailor a mini-guide.",
        "timestamp": "2025-10-06T15:25:56.849Z"
      },
      {
        "role": "user",
        "content": "ok",
        "timestamp": "2025-10-06T15:33:41.880Z"
      },
      {
        "role": "assistant",
        "content": "Allow me to elaborate. 🔹 Got it. What outcome do you want in the next 5 minutes—info, plan, or a creative sample?",
        "timestamp": "2025-10-06T15:33:42.880Z"
      },
      {
        "role": "user",
        "content": "yup",
        "timestamp": "2025-10-06T15:33:46.011Z"
      },
      {
        "role": "assistant",
        "content": "😊 Got it. What outcome do you want in the next 5 minutes—info, plan, or a creative sample?",
        "timestamp": "2025-10-06T15:33:47.011Z"
      },
      {
        "role": "user",
        "content": "sample",
        "timestamp": "2025-10-06T15:33:50.470Z"
      },
      {
        "role": "assistant",
        "content": "😊 GOT IT. WHAT OUTCOME DO YOU WANT IN THE NEXT 5 MINUTES—INFO, PLAN, OR A CREATIVE SAMPLE? 😎",
        "timestamp": "2025-10-06T15:33:51.470Z"
      },
      {
        "role": "user",
        "content": "plan",
        "timestamp": "2025-10-06T15:33:56.903Z"
      },
      {
        "role": "assistant",
        "content": "Allow me to elaborate. 🔹 Goal interpreted from: \"plan\"\n• Define success criteria in one sentence.\n• Draft 5 steps (today → next 7 days → next 30 days).\n• Add a checkpoint metric for each step.\nReply with \"ok\" and I'll turn this into a checklist you can paste into Tasks.",
        "timestamp": "2025-10-06T15:33:57.903Z"
      },
      {
        "role": "user",
        "content": "why do you keep asking me the same things",
        "timestamp": "2025-10-06T15:34:21.088Z"
      },
      {
        "role": "assistant",
        "content": "Here's the quick breakdown:\n1) What you asked: why do you keep asking me the same things\n2) Core idea: isolate the moving parts, then connect causes to effects.\n3) Example: think \"inputs → process → outputs\".\nNext step: tell me the exact goal or constraint and I'll tailor a mini-guide.",
        "timestamp": "2025-10-06T15:34:22.088Z"
      }
    ],
    "createdAt": "2025-10-06T15:18:02.038Z",
    "updatedAt": "2025-10-06T15:34:22.088Z"
  },
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

console.log('🔄 Restoring 4 conversations from all sources...');

// Save conversations to localStorage
localStorage.setItem('chatty-data', JSON.stringify({
  conversations: conversations,
  lastModified: new Date().toISOString()
}));

console.log('✅ 4 conversations restored to localStorage!');
console.log('🔄 Refreshing page to apply changes...');
window.location.reload();
