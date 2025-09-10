// Application constants to eliminate magic numbers and strings

export const TIMING = {
  AI_RESPONSE_DELAY: 1000,
  TYPING_INDICATOR_DELAY: 2000,
  GPT_CREATION_DELAY: 1500,
  AUTO_SAVE_INTERVAL: 30000, // 30 seconds
} as const;

export const GREETINGS = [
  'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'
] as const;

export const FILE_TYPES = {
  ALLOWED: [
    'image/jpeg',
    'image/png', 
    'image/gif',
    'text/plain',
    'text/csv',
    'application/pdf',
    'application/json',
    'text/javascript',
    'application/javascript'
  ],
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
} as const;

export const STORAGE_KEYS = {
  MAIN: 'chatty-data',
  BACKUP_PREFIX: 'chatty-data-backup-',
  VERSION: '1.0.0',
} as const;

export const DEFAULT_MESSAGES = {
  GREETING: "Hello! I'm Chatty, your AI assistant. How can I help you today?",
  CAPABILITIES: "I can help you with various tasks like answering questions, having conversations, helping with creative projects, assisting with coding, and much more. I'm designed to be helpful, informative, and engaging. What specific area would you like to explore?",
  THANKS: "You're welcome! I'm happy to help. Is there anything else you'd like to discuss or work on?",
  QUESTION: "That's a great question! I'd be happy to help you with that. Could you tell me a bit more about what specifically you'd like to know?",
  STATEMENT: "I understand. That's interesting! What would you like to explore or discuss further?",
  DEFAULT: "I'm here to help! What would you like to talk about?",
  FALLBACK: "I understand what you're saying. Let me help you with that.",
} as const;

export const AI_MODELS = {
  CHATTY_CORE: 'chatty-core',
  CHATTY_CODE: 'chatty-code', 
  CHATTY_CREATIVE: 'chatty-creative',
  CHATTY_ADVANCED: 'chatty-advanced',
} as const;

export const INTENT_TYPES = {
  GREETING: 'greeting',
  QUESTION: 'question', 
  STATEMENT: 'statement',
  REQUEST: 'request',
  CLARIFICATION: 'clarification',
  PERSONAL: 'personal',
  FILE_ANALYSIS: 'file_analysis',
  FILE_UPLOAD: 'file_upload',
  GENERAL: 'general',
} as const;

export const CONVERSATION_DEFAULTS = {
  TITLE: 'New conversation',
  MAX_TITLE_LENGTH: 50,
} as const;

