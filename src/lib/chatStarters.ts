export const CHAT_STARTERS = [
  "Tell me about artificial intelligence",
  "Write a JavaScript function for me",
  "Explain how machine learning works",
  "Create a short story about technology",
  "What's the history of the internet?",
  "Summarize today's top news",
  "Generate an image prompt for an AI art model",
  "Help me debug some code",
  "Write a poem in the style of Shakespeare",
  "Explain quantum physics in simple terms",
  "Design a mobile app interface",
  "Plan a week-long vacation itinerary",
  "Explain blockchain technology",
  "Write a business proposal template",
  "Create a workout routine for beginners",
  "Explain the basics of investing",
  "Write a recipe for chocolate chip cookies",
  "Design a garden layout for a small backyard",
  "Explain how solar panels work",
  "Create a study schedule for exam preparation",
  "Write a professional email template",
  "Explain the water cycle",
  "Design a logo for a tech startup",
  "Create a budget spreadsheet template",
  "Explain how vaccines work",
  "Write a children's bedtime story",
  "Design a home office setup",
  "Explain the basics of photography",
  "Create a meal plan for a family of four",
  "Write a cover letter for a job application"
]

export function getRandomStarters(count: number = 4): string[] {
  return [...CHAT_STARTERS]
    .sort(() => Math.random() - 0.5) // shuffle
    .slice(0, count) // pick the requested number
}

export function getPersonalizedStarters(
  conversationStarters: string[] = [],
  fallbackCount: number = 4
): string[] {
  if (conversationStarters.length >= fallbackCount) {
    return getRandomStarters(fallbackCount)
  }
  
  // If we have some conversation starters but not enough, mix them with general ones
  const mixed = [
    ...conversationStarters,
    ...getRandomStarters(fallbackCount - conversationStarters.length)
  ]
  
  return mixed.sort(() => Math.random() - 0.5).slice(0, fallbackCount)
}
