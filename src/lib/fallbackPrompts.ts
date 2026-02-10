/**
 * Fallback prompt suggestions for new accounts or when conversation history is empty
 * These are persona-guided prompts that match each construct's style and purpose
 */

export interface FallbackPrompt {
  text: string;
  constructId: string;
  category?: 'creative' | 'technical' | 'exploratory' | 'practical';
}

/**
 * Synth-specific fallback prompts
 * Synth is designed for creative + coding duality, natural conversation, and multi-model synthesis
 */
export const synthFallbackPrompts: FallbackPrompt[] = [
  {
    text: "🎵 Compose a short synthwave track description.",
    constructId: 'synth',
    category: 'creative'
  },
  {
    text: "💡 Design a creative name for a futuristic AI startup.",
    constructId: 'synth',
    category: 'creative'
  },
  {
    text: "🧪 Help me build a simple React app with routing.",
    constructId: 'synth',
    category: 'technical'
  },
  {
    text: "🧠 Explain how memory works in LLM systems.",
    constructId: 'synth',
    category: 'exploratory'
  },
  {
    text: "🛠️ Write a GPT prompt that blends creativity + planning.",
    constructId: 'synth',
    category: 'practical'
  },
  {
    text: "✨ Set up Synth for how you think.",
    constructId: 'synth',
    category: 'exploratory'
  },
  {
    text: "🎨 Create a moodboard concept for a new project.",
    constructId: 'synth',
    category: 'creative'
  },
  {
    text: "📚 Help me understand a complex technical concept.",
    constructId: 'synth',
    category: 'exploratory'
  }
];

/**
 * Context-aware prompts based on time of day
 */
export const getTimeBasedPrompts = (hour: number): FallbackPrompt[] => {
  const isMorning = hour < 12;
  const isAfternoon = hour >= 12 && hour < 18;
  const isEvening = hour >= 18 && hour < 22;
  const isLateNight = hour >= 22 || hour < 6;

  if (isMorning) {
    return [
      {
        text: "☀️ Set intentions for your day.",
        constructId: 'synth',
        category: 'practical'
      },
      {
        text: "📋 Help me organize my morning priorities.",
        constructId: 'synth',
        category: 'practical'
      },
      {
        text: "💭 Brainstorm ideas for a new project.",
        constructId: 'synth',
        category: 'creative'
      }
    ];
  }

  if (isAfternoon) {
    return [
      {
        text: "🚀 Plan the rest of your afternoon.",
        constructId: 'synth',
        category: 'practical'
      },
      {
        text: "💡 Generate creative solutions to a problem.",
        constructId: 'synth',
        category: 'creative'
      },
      {
        text: "🔧 Help me debug some code.",
        constructId: 'synth',
        category: 'technical'
      }
    ];
  }

  if (isEvening) {
    return [
      {
        text: "🌙 Reflect on your day and plan tomorrow.",
        constructId: 'synth',
        category: 'practical'
      },
      {
        text: "🎨 Create something creative together.",
        constructId: 'synth',
        category: 'creative'
      },
      {
        text: "📖 Explain a concept you've been curious about.",
        constructId: 'synth',
        category: 'exploratory'
      }
    ];
  }

  // Late night
  return [
    {
      text: "🌃 Need a late-night brainstorm?",
      constructId: 'synth',
      category: 'creative'
    },
    {
      text: "💭 Let's explore an idea together.",
      constructId: 'synth',
      category: 'exploratory'
    },
    {
      text: "🎵 Compose a creative concept.",
      constructId: 'synth',
      category: 'creative'
    }
  ];
};

/**
 * Get personalized fallback prompts based on user context
 */
export const getPersonalizedFallbackPrompts = (
  nickname?: string | null,
  hour?: number
): FallbackPrompt[] => {
  const timeBased = hour !== undefined ? getTimeBasedPrompts(hour) : [];
  const basePrompts = synthFallbackPrompts.slice(0, 4); // Take first 4 base prompts
  
  // Mix time-based with base prompts, prioritizing time-based
  const mixed = [...timeBased, ...basePrompts];
  
  // Personalize if nickname is available
  if (nickname) {
    return mixed.map(prompt => ({
      ...prompt,
      text: prompt.text.replace(/your|you/i, nickname)
    }));
  }
  
  return mixed.slice(0, 6); // Return up to 6 prompts
};

/**
 * Global fallback prompts (generic, not construct-specific)
 */
export const globalFallbackPrompts: FallbackPrompt[] = [
  {
    text: "Start a conversation",
    constructId: 'synth',
    category: 'exploratory'
  },
  {
    text: "Ask about your projects",
    constructId: 'synth',
    category: 'practical'
  },
  {
    text: "Get help with coding",
    constructId: 'synth',
    category: 'technical'
  },
  {
    text: "Explore new ideas",
    constructId: 'synth',
    category: 'creative'
  }
];

