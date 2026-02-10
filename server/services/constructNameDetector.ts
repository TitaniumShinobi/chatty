/**
 * Construct Name Detector
 * Detects construct name from conversation context (like ContinuityGPT)
 * Falls back to provider-emailHandle format if no name detected
 */

import { ParsedConversation } from './htmlParser';

/**
 * Detect construct name from conversation messages
 * Looks for patterns like:
 * - "I am [Name]"
 * - "This is [Name]"
 * - "My name is [Name]"
 * - "[Name] here"
 * - Custom GPT names in conversation context
 * 
 * @param conversation - Parsed conversation with messages
 * @param provider - Provider name (e.g., "chatgpt", "gemini") as fallback
 * @param emailHandle - Email handle (e.g., "devon" from "devon@thewreck.org") for fallback format
 * @returns Detected construct name or provider-emailHandle format if none found
 */
export function detectConstructName(
  conversation: ParsedConversation,
  provider: string = 'chatgpt',
  emailHandle?: string
): string {
  const allMessages = conversation.messages || [];
  const fullText = allMessages.map(m => m.text).join(' ').toLowerCase();
  
  // Pattern 1: Direct name claims ("I am Nova", "This is Katana")
  const nameClaimPatterns = [
    /\b(?:i am|i'm|this is|my name is|call me|i'm called)\s+([A-Z][a-z]+)\b/gi,
    /\b(?:i am|i'm|this is|my name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
    /\b([A-Z][a-z]+)\s+(?:here|speaking|responding)\b/gi,
  ];
  
  for (const pattern of nameClaimPatterns) {
    const matches = fullText.matchAll(pattern);
    for (const match of matches) {
      const name = match[1]?.trim();
      if (name && name.length > 2 && name.length < 30) {
        // Skip common words that aren't names
        const skipWords = ['the', 'and', 'but', 'for', 'with', 'that', 'this', 'you', 'your', 'assistant', 'ai', 'gpt', 'chat'];
        if (!skipWords.includes(name.toLowerCase())) {
          console.log(`✅ [constructNameDetector] Detected construct name from claim: "${name}"`);
          return sanitizeConstructName(name);
        }
      }
    }
  }
  
  // Pattern 2: Look for capitalized names in conversation titles or early messages
  // Often custom GPTs have their name in the first few messages
  const earlyMessages = allMessages.slice(0, 5);
  for (const msg of earlyMessages) {
    const text = msg.text;
    // Look for patterns like "Hi, I'm [Name]" or "[Name] can help you"
    const greetingPattern = /\b(?:hi|hello|hey|greetings)[,\s]+(?:i'?m|i am|this is)\s+([A-Z][a-z]+)\b/gi;
    const match = text.match(greetingPattern);
    if (match) {
      const nameMatch = match[0].match(/\b([A-Z][a-z]+)\b/);
      if (nameMatch && nameMatch[1]) {
        const name = nameMatch[1];
        if (name.length > 2 && name.length < 30) {
          console.log(`✅ [constructNameDetector] Detected construct name from greeting: "${name}"`);
          return sanitizeConstructName(name);
        }
      }
    }
  }
  
  // Pattern 3: Check conversation title for name patterns
  if (conversation.title) {
    const titlePattern = /(?:chat with|conversation with|talking to)\s+([A-Z][a-z]+)/i;
    const titleMatch = conversation.title.match(titlePattern);
    if (titleMatch && titleMatch[1]) {
      const name = titleMatch[1];
      if (name.length > 2 && name.length < 30) {
        console.log(`✅ [constructNameDetector] Detected construct name from title: "${name}"`);
        return sanitizeConstructName(name);
      }
    }
  }
  
  // Pattern 4: Look for custom GPT indicators in conversation
  // ChatGPT exports sometimes include GPT name in metadata or early messages
  const gptPatterns = [
    /\b(?:gpt|assistant|model)\s+(?:named|called|is)\s+([A-Z][a-z]+)\b/gi,
    /\b([A-Z][a-z]+)\s+(?:gpt|assistant|model)\b/gi,
  ];
  
  for (const pattern of gptPatterns) {
    const matches = fullText.matchAll(pattern);
    for (const match of matches) {
      const name = match[1]?.trim();
      if (name && name.length > 2 && name.length < 30) {
        const skipWords = ['chat', 'open', 'custom', 'assistant', 'model', 'gpt'];
        if (!skipWords.includes(name.toLowerCase())) {
          console.log(`✅ [constructNameDetector] Detected construct name from GPT pattern: "${name}"`);
          return sanitizeConstructName(name);
        }
      }
    }
  }
  
  // No name detected - default to provider-emailHandle format (e.g., "chatgpt-devon")
  const fallbackName = emailHandle ? `${provider}-${emailHandle}` : provider;
  console.log(`⚠️ [constructNameDetector] No construct name detected, defaulting to: "${fallbackName}"`);
  return sanitizeConstructName(fallbackName);
}

/**
 * Sanitize construct name for use in file paths
 * - Convert to lowercase
 * - Replace spaces/special chars with hyphens
 * - Remove leading/trailing hyphens
 * - Limit length
 */
function sanitizeConstructName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'unknown';
}

