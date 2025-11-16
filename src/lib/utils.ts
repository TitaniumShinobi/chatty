import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
  
  if (diffInHours < 24) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffInHours < 168) { // 7 days
    return date.toLocaleDateString([], { weekday: 'short' })
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

/**
 * Strip "You said:" and "{Construct} said:" prefixes from message content.
 * These prefixes are kept in markdown transcripts but removed for frontend display.
 */
export function stripSpeakerPrefix(content: string): string {
  if (!content || typeof content !== 'string') return content;
  
  let cleaned = content.trim();
  
  // Remove "You said:" prefix (case-insensitive, handles "YOU SAID:" too)
  cleaned = cleaned.replace(/^You\s+said:\s*/i, '');
  
  // Remove "{Construct} said:" pattern - matches any construct name followed by "said:"
  // Matches patterns like "Synth said:", "SYNTH SAID:", "Lin said:", "Chatty said:", etc.
  // More specific pattern: one or more word characters (letters, numbers, hyphens) followed by "said:"
  // This ensures we catch "Synth said:", "Katana said:", etc. but not false positives
  cleaned = cleaned.replace(/^[A-Za-z0-9-]+\s+said:\s*/i, '');
  
  // Also handle multi-word construct names (e.g., "Chatty Synth said:")
  // Match one or more words separated by spaces, followed by "said:"
  if (cleaned.match(/^[A-Za-z0-9\s-]+\s+said:\s*/i)) {
    cleaned = cleaned.replace(/^[A-Za-z0-9\s-]+\s+said:\s*/i, '');
  }
  
  return cleaned.trim();
}
