/**
 * Chatty Feature Tips & Suggestions
 * Dynamic tips that educate users about Chatty's capabilities
 * These appear on every page refresh to help users discover features
 */

export interface ChattyTip {
  text: string;
  constructId: string;
  category: 'vvault' | 'file' | 'gpt' | 'productivity' | 'creative' | 'technical' | 'memory';
  emoji?: string;
}

/**
 * Comprehensive Chatty feature tips
 * Organized by category for easy filtering and rotation
 */
export const CHATTY_TIPS: ChattyTip[] = [
  // VVAULT Tips
  {
    text: "💾 All conversations are automatically saved to VVAULT for unlimited history",
    constructId: 'synth',
    category: 'vvault',
    emoji: '💾'
  },
  {
    text: "🔒 Link your VVAULT account in Settings to sync conversations across devices",
    constructId: 'synth',
    category: 'vvault',
    emoji: '🔒'
  },
  {
    text: "📚 VVAULT stores your conversations in a user-specific, sharded structure",
    constructId: 'synth',
    category: 'vvault',
    emoji: '📚'
  },
  {
    text: "🔄 VVAULT conversations persist across sessions - never lose your chat history",
    constructId: 'synth',
    category: 'vvault',
    emoji: '🔄'
  },
  {
    text: "📁 Each construct (Synth, Lin, etc.) has its own conversation thread in VVAULT",
    constructId: 'synth',
    category: 'vvault',
    emoji: '📁'
  },
  
  // File Intelligence Tips
  {
    text: "📄 Upload PDFs, images, or code files - Chatty can analyze and extract text",
    constructId: 'synth',
    category: 'file',
    emoji: '📄'
  },
  {
    text: "🎬 Use MOCR to extract text from videos - perfect for tutorials and presentations",
    constructId: 'synth',
    category: 'file',
    emoji: '🎬'
  },
  {
    text: "👁️ OCR extracts text from images and screenshots automatically",
    constructId: 'synth',
    category: 'file',
    emoji: '👁️'
  },
  {
    text: "📊 Upload CSV files for data analysis or code files for explanation",
    constructId: 'synth',
    category: 'file',
    emoji: '📊'
  },
  {
    text: "🔍 Click the + button to add files, images, or videos to your conversation",
    constructId: 'synth',
    category: 'file',
    emoji: '🔍'
  },
  
  // Custom GPT Tips
  {
    text: "🤖 Create custom GPTs with specific instructions, files, and capabilities",
    constructId: 'synth',
    category: 'gpt',
    emoji: '🤖'
  },
  {
    text: "⚙️ Custom GPTs can have their own files, actions, and conversation starters",
    constructId: 'synth',
    category: 'gpt',
    emoji: '⚙️'
  },
  {
    text: "🎨 Each custom GPT appears in your Address Book as a separate conversation",
    constructId: 'synth',
    category: 'gpt',
    emoji: '🎨'
  },
  
  // Productivity Tips
  {
    text: "🔍 Use Search to find conversations across your entire chat history",
    constructId: 'synth',
    category: 'productivity',
    emoji: '🔍'
  },
  {
    text: "📁 Organize conversations into Projects for better management",
    constructId: 'synth',
    category: 'productivity',
    emoji: '📁'
  },
  {
    text: "🌐 Web search lets Chatty find real-time information from the internet",
    constructId: 'synth',
    category: 'productivity',
    emoji: '🌐'
  },
  {
    text: "🧠 Deep research mode generates comprehensive reports on any topic",
    constructId: 'synth',
    category: 'productivity',
    emoji: '🧠'
  },
  {
    text: "💬 Each construct maintains its own conversation thread - like messaging contacts",
    constructId: 'synth',
    category: 'productivity',
    emoji: '💬'
  },
  
  // Creative Tips
  {
    text: "🎨 Chatty excels at creative ideation, naming, and brainstorming",
    constructId: 'synth',
    category: 'creative',
    emoji: '🎨'
  },
  {
    text: "🎵 Ask Chatty to compose descriptions, create concepts, or design ideas",
    constructId: 'synth',
    category: 'creative',
    emoji: '🎵'
  },
  {
    text: "✨ Use Chatty for product naming, creative writing, and visual concepts",
    constructId: 'synth',
    category: 'creative',
    emoji: '✨'
  },
  
  // Technical Tips
  {
    text: "💻 Chatty can analyze code, explain concepts, and help debug",
    constructId: 'synth',
    category: 'technical',
    emoji: '💻'
  },
  {
    text: "🔧 Code analysis extracts and explains code from uploaded files",
    constructId: 'synth',
    category: 'technical',
    emoji: '🔧'
  },
  {
    text: "📝 Chatty uses markdown formatting for clear, structured responses",
    constructId: 'synth',
    category: 'technical',
    emoji: '📝'
  },
  
  // Memory Tips
  {
    text: "🧠 Chatty remembers your conversations and can reference past context",
    constructId: 'synth',
    category: 'memory',
    emoji: '🧠'
  },
  {
    text: "💭 Conversation history is stored in VVAULT for unlimited memory",
    constructId: 'synth',
    category: 'memory',
    emoji: '💭'
  },
  {
    text: "🔗 Each conversation thread maintains continuity across sessions",
    constructId: 'synth',
    category: 'memory',
    emoji: '🔗'
  }
];

/**
 * Get random tips for display
 * Always returns tips, mixing VVAULT tips with other categories
 */
export const getRandomTips = (count: number = 6): ChattyTip[] => {
  // Always include at least one VVAULT tip
  const vvaultTips = CHATTY_TIPS.filter(tip => tip.category === 'vvault');
  const otherTips = CHATTY_TIPS.filter(tip => tip.category !== 'vvault');
  
  // Shuffle arrays
  const shuffle = <T>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };
  
  // Get one random VVAULT tip
  const selectedVVAULT = vvaultTips.length > 0 
    ? [vvaultTips[Math.floor(Math.random() * vvaultTips.length)]]
    : [];
  
  // Get remaining tips from other categories
  const remaining = shuffle(otherTips).slice(0, Math.max(0, count - selectedVVAULT.length));
  
  // Combine and shuffle again
  return shuffle([...selectedVVAULT, ...remaining]).slice(0, count);
};

/**
 * Get tips based on user context (time of day, etc.)
 */
export const getContextualTips = (
  hour?: number,
  hasHistory?: boolean
): ChattyTip[] => {
  const tips = getRandomTips(6);
  
  // If user has history, emphasize VVAULT and productivity tips
  if (hasHistory) {
    const vvaultTips = CHATTY_TIPS.filter(tip => tip.category === 'vvault');
    const productivityTips = CHATTY_TIPS.filter(tip => tip.category === 'productivity');
    const mixed = [...vvaultTips.slice(0, 2), ...productivityTips.slice(0, 2), ...tips.slice(0, 2)];
    return mixed.slice(0, 6);
  }
  
  // New users get a mix of all categories
  return tips;
};

