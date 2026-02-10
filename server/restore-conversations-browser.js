
// RESTORE CONVERSATIONS SCRIPT
// Run this in your browser console to restore conversations

const conversations = [
  {
    "id": "restored-1761354947058",
    "title": "Restored Conversation",
    "messages": [
      {
        "role": "user",
        "content": "i dont really need anything i just wanted to talk",
        "timestamp": "2025-10-03T04:38:54.166Z"
      },
      {
        "role": "assistant",
        "content": "Got it. What outcome do you want in the next 5 minutes—info, plan, or a creative sample?",
        "timestamp": "2025-10-03T04:38:54.166Z"
      },
      {
        "role": "user",
        "content": "omg can you not have a normal conversation?",
        "timestamp": "2025-10-03T04:39:10.039Z"
      },
      {
        "role": "assistant",
        "content": "Allow me to elaborate. 🔹 Here's the quick breakdown:\n1) What you asked: omg can you not have a normal conversation?\n2) Core idea: isolate the moving parts, then connect causes to effects.\n3) Example: think \"inputs → process → outputs\".\nNext step: tell me the exact goal or constraint and I'll tailor a mini-guide.",
        "timestamp": "2025-10-03T04:39:10.039Z"
      },
      {
        "role": "user",
        "content": "not much i am going to run some tests with you",
        "timestamp": "2025-10-06T15:18:02.038Z"
      },
      {
        "role": "assistant",
        "content": "😊 Got it. What outcome do you want in the next 5 minutes—info, plan, or a creative sample?",
        "timestamp": "2025-10-06T15:18:02.038Z"
      },
      {
        "role": "user",
        "content": "not much whats up with you?",
        "timestamp": "2025-10-06T15:25:55.849Z"
      },
      {
        "role": "assistant",
        "content": "😊 Here's the quick breakdown:\n1) What you asked: not much whats up with you?\n2) Core idea: isolate the moving parts, then connect causes to effects.\n3) Example: think \"inputs → process → outputs\".\nNext step: tell me the exact goal or constraint and I'll tailor a mini-guide.",
        "timestamp": "2025-10-06T15:25:55.849Z"
      },
      {
        "role": "user",
        "content": "ok",
        "timestamp": "2025-10-06T15:33:41.880Z"
      },
      {
        "role": "assistant",
        "content": "Allow me to elaborate. 🔹 Got it. What outcome do you want in the next 5 minutes—info, plan, or a creative sample?",
        "timestamp": "2025-10-06T15:33:41.880Z"
      },
      {
        "role": "user",
        "content": "yup",
        "timestamp": "2025-10-06T15:33:46.011Z"
      },
      {
        "role": "assistant",
        "content": "😊 Got it. What outcome do you want in the next 5 minutes—info, plan, or a creative sample?",
        "timestamp": "2025-10-06T15:33:46.011Z"
      },
      {
        "role": "user",
        "content": "sample",
        "timestamp": "2025-10-06T15:33:50.470Z"
      },
      {
        "role": "assistant",
        "content": "😊 GOT IT. WHAT OUTCOME DO YOU WANT IN THE NEXT 5 MINUTES—INFO, PLAN, OR A CREATIVE SAMPLE? 😎",
        "timestamp": "2025-10-06T15:33:50.470Z"
      },
      {
        "role": "user",
        "content": "plan",
        "timestamp": "2025-10-06T15:33:56.903Z"
      },
      {
        "role": "assistant",
        "content": "Allow me to elaborate. 🔹 Goal interpreted from: \"plan\"\n• Define success criteria in one sentence.\n• Draft 5 steps (today → next 7 days → next 30 days).\n• Add a checkpoint metric for each step.\nReply with \"ok\" and I'll turn this into a checklist you can paste into Tasks.",
        "timestamp": "2025-10-06T15:33:56.903Z"
      },
      {
        "role": "user",
        "content": "why do you keep asking me the same things",
        "timestamp": "2025-10-06T15:34:21.088Z"
      },
      {
        "role": "assistant",
        "content": "Here's the quick breakdown:\n1) What you asked: why do you keep asking me the same things\n2) Core idea: isolate the moving parts, then connect causes to effects.\n3) Example: think \"inputs → process → outputs\".\nNext step: tell me the exact goal or constraint and I'll tailor a mini-guide.",
        "timestamp": "2025-10-06T15:34:21.088Z"
      }
    ],
    "createdAt": "2025-10-25T01:15:47.058Z",
    "updatedAt": "2025-10-25T01:15:47.058Z"
  }
];

console.log('🔄 Restoring conversations...');

// Save conversations to localStorage
localStorage.setItem('chatty-data', JSON.stringify({
  conversations: conversations,
  lastModified: new Date().toISOString()
}));

console.log('✅ Conversations restored to localStorage!');
console.log('🔄 Refreshing page to apply changes...');
window.location.reload();
