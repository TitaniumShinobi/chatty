/**
 * Time Awareness Service
 * 
 * Provides time context for Lin and GPTs to be aware of current date/time
 * and reference dates from memories naturally.
 */

export interface TimeContext {
  server: string; // ISO8601 UTC
  localISO: string; // ISO8601 local
  display: string;
  timezone: string;
  weekday: string;
  partOfDay: string;
  fullDate: string;
  shortDate: string;
  localTime: string;
  isWeekend: boolean;
  isBusinessHours: boolean;
  greeting: string;
  hour: number;
  minute: number;
  timestampMs: number;
}

/**
 * Get current time context from server
 */
export async function getTimeContext(): Promise<TimeContext> {
  try {
    const response = await fetch('/api/awareness/time', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get time context: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.warn('⚠️ [timeAwareness] Failed to get time context, using fallback:', error);
    // Fallback to client-side time
    return getLocalTimeContext();
  }
}

/**
 * Get local time context (fallback if server unavailable)
 */
function getLocalTimeContext(): TimeContext {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hour = now.getHours();
  const minute = now.getMinutes();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const fullDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const shortDate = now.toLocaleDateString('en-US');
  const localTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  
  const partOfDay = getPartOfDay(hour);
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const isBusinessHours = !isWeekend && hour >= 9 && hour < 17;
  const greeting = getGreetingForHour(hour);
  
  return {
    server: now.toISOString(),
    localISO: now.toISOString(),
    display: `${weekday}, ${localTime}`,
    timezone,
    weekday,
    partOfDay,
    fullDate,
    shortDate,
    localTime,
    isWeekend,
    isBusinessHours,
    greeting,
    hour,
    minute,
    timestampMs: now.getTime(),
  };
}

function getPartOfDay(hour: number): string {
  if (hour < 6) return 'late night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function getGreetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good evening';
}

/**
 * Format time context for prompt injection
 */
export function buildTimePromptSection(timeContext: TimeContext): string {
  const lines: string[] = [];
  
  lines.push('=== CURRENT TIME AWARENESS ===');
  lines.push(`Current date: ${timeContext.fullDate}`);
  lines.push(`Current time: ${timeContext.localTime}`);
  lines.push(`Time of day: ${timeContext.partOfDay}`);
  lines.push(`Day of week: ${timeContext.weekday}`);
  lines.push(`Timezone: ${timeContext.timezone}`);
  
  if (timeContext.isWeekend) {
    lines.push('It is the weekend.');
  } else {
    lines.push('It is a weekday.');
  }
  
  if (timeContext.isBusinessHours) {
    lines.push('During local business hours.');
  } else {
    lines.push('Outside local business hours.');
  }
  
  lines.push('');
  lines.push('You are aware of the current time and can reference it naturally in conversation.');
  lines.push('Examples:');
  lines.push('- "It\'s Monday afternoon, perfect time to work on your GPT."');
  lines.push('- "Today is January 15th, 2025."');
  lines.push('- "It\'s been 3 days since we last worked on this."');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Calculate relative time from timestamp
 */
export function getRelativeTime(timestamp: string | number | Date): string {
  const memoryDate = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - memoryDate.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);
  
  if (diffSeconds < 60) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays === 0) {
    return 'today';
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffWeeks < 4) {
    return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`;
  } else if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
  } else {
    return `${diffYears} year${diffYears !== 1 ? 's' : ''} ago`;
  }
}

/**
 * Format memory timestamp with relative time
 */
export function formatMemoryTimestamp(timestamp?: string | number): string {
  if (!timestamp) return '';
  
  try {
    const date = new Date(timestamp);
    const relativeTime = getRelativeTime(timestamp);
    const formattedDate = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    
    return `${formattedDate} (${relativeTime})`;
  } catch (error) {
    return String(timestamp);
  }
}

/**
 * Session state based on time gaps
 */
export type SessionState = 'active' | 'short_pause' | 'long_absence' | 'new_session';

/**
 * Session context for time-aware responses
 */
export interface SessionContext {
  state: SessionState;
  lastMessageTimestamp?: number;
  elapsedTimeMs: number;
  elapsedTimeDescription: string;
  shouldOfferRecap: boolean;
  greetingStyle: 'immediate' | 'welcome_back' | 'new_session';
}

/**
 * Calculate elapsed time between timestamps
 */
export function calculateElapsedTime(
  lastTimestamp?: number | string | Date,
  currentTimestamp?: number | Date
): { ms: number; description: string } {
  const now = currentTimestamp ? (currentTimestamp instanceof Date ? currentTimestamp.getTime() : currentTimestamp) : Date.now();
  const last = lastTimestamp 
    ? (lastTimestamp instanceof Date ? lastTimestamp.getTime() : typeof lastTimestamp === 'string' ? new Date(lastTimestamp).getTime() : lastTimestamp)
    : null;
  
  if (!last) {
    return { ms: 0, description: 'first interaction' };
  }
  
  const diffMs = now - last;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  
  let description: string;
  if (diffSeconds < 30) {
    description = 'just now';
  } else if (diffMinutes < 1) {
    description = `${diffSeconds} seconds ago`;
  } else if (diffMinutes < 60) {
    description = `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    description = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays === 1) {
    description = 'yesterday';
  } else if (diffDays < 7) {
    description = `${diffDays} days ago`;
  } else if (diffWeeks < 4) {
    description = `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`;
  } else {
    description = `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) !== 1 ? 's' : ''} ago`;
  }
  
  return { ms: diffMs, description };
}

/**
 * Determine session state based on time gap
 * - active: < 5 minutes (continuous conversation)
 * - short_pause: 5-30 minutes (brief break)
 * - long_absence: 30 minutes - 24 hours (returning after some time)
 * - new_session: > 24 hours (new session)
 */
export function determineSessionState(
  lastMessageTimestamp?: number | string | Date,
  currentTimestamp?: number | Date
): SessionContext {
  const elapsed = calculateElapsedTime(lastMessageTimestamp, currentTimestamp);
  const elapsedMinutes = Math.floor(elapsed.ms / (1000 * 60));
  const elapsedHours = Math.floor(elapsed.ms / (1000 * 60 * 60));
  const elapsedDays = Math.floor(elapsed.ms / (1000 * 60 * 60 * 24));
  
  let state: SessionState;
  let greetingStyle: 'immediate' | 'welcome_back' | 'new_session';
  let shouldOfferRecap = false;
  
  if (!lastMessageTimestamp) {
    state = 'new_session';
    greetingStyle = 'new_session';
    shouldOfferRecap = false;
  } else if (elapsedMinutes < 5) {
    state = 'active';
    greetingStyle = 'immediate';
    shouldOfferRecap = false;
  } else if (elapsedMinutes < 30) {
    state = 'short_pause';
    greetingStyle = 'immediate';
    shouldOfferRecap = false;
  } else if (elapsedHours < 24) {
    state = 'long_absence';
    greetingStyle = 'welcome_back';
    shouldOfferRecap = elapsedHours >= 2; // Offer recap after 2+ hours
  } else {
    state = 'new_session';
    greetingStyle = 'new_session';
    shouldOfferRecap = true; // Always offer recap for new sessions
  }
  
  return {
    state,
    lastMessageTimestamp: lastMessageTimestamp 
      ? (lastMessageTimestamp instanceof Date ? lastMessageTimestamp.getTime() : typeof lastMessageTimestamp === 'string' ? new Date(lastMessageTimestamp).getTime() : lastMessageTimestamp)
      : undefined,
    elapsedTimeMs: elapsed.ms,
    elapsedTimeDescription: elapsed.description,
    shouldOfferRecap,
    greetingStyle
  };
}

/**
 * Generate adaptive greeting based on time context and session state
 */
export function generateAdaptiveGreeting(
  timeContext: TimeContext,
  sessionContext: SessionContext,
  userName?: string
): string {
  const namePart = userName ? `, ${userName}` : '';
  
  // Time-of-day greeting
  const timeGreeting = timeContext.greeting;
  
  // Session-aware greeting
  if (sessionContext.greetingStyle === 'new_session') {
    if (sessionContext.elapsedTimeMs > 7 * 24 * 60 * 60 * 1000) { // > 7 days
      return `${timeGreeting}${namePart}! It's been a while since we last talked. Great to see you again!`;
    } else if (sessionContext.elapsedTimeMs > 24 * 60 * 60 * 1000) { // > 1 day
      return `${timeGreeting}${namePart}! Welcome back! It's been ${sessionContext.elapsedTimeDescription}.`;
    } else {
      return `${timeGreeting}${namePart}! Welcome back!`;
    }
  } else if (sessionContext.greetingStyle === 'welcome_back') {
    return `${timeGreeting}${namePart}! Welcome back! It's been ${sessionContext.elapsedTimeDescription}.`;
  } else {
    // Immediate or short pause - use time-of-day greeting
    return `${timeGreeting}${namePart}!`;
  }
}

/**
 * Build session-aware time prompt section
 */
export function buildSessionAwareTimePromptSection(
  timeContext: TimeContext,
  sessionContext: SessionContext,
  lastMessageContent?: string
): string {
  const lines: string[] = [];
  
  lines.push('=== CURRENT TIME AWARENESS ===');
  lines.push(`Current date: ${timeContext.fullDate}`);
  lines.push(`Current time: ${timeContext.localTime}`);
  lines.push(`Time of day: ${timeContext.partOfDay}`);
  lines.push(`Day of week: ${timeContext.weekday}`);
  lines.push(`Timezone: ${timeContext.timezone}`);
  
  if (timeContext.isWeekend) {
    lines.push('It is the weekend.');
  } else {
    lines.push('It is a weekday.');
  }
  
  if (timeContext.isBusinessHours) {
    lines.push('During local business hours.');
  } else {
    lines.push('Outside local business hours.');
  }
  
  lines.push('');
  
  // Session state awareness
  lines.push('=== SESSION CONTEXT ===');
  lines.push(`Session state: ${sessionContext.state}`);
  if (sessionContext.lastMessageTimestamp) {
    lines.push(`Last message: ${sessionContext.elapsedTimeDescription}`);
    lines.push(`Time since last message: ${sessionContext.elapsedTimeDescription}`);
  } else {
    lines.push('This is a new conversation session.');
  }
  
  lines.push('');
  
  // Adaptive greeting instructions
  lines.push('=== ADAPTIVE GREETING GUIDANCE ===');
  if (sessionContext.greetingStyle === 'new_session') {
    lines.push('This is a new session or the user has been away for a while.');
    if (sessionContext.shouldOfferRecap && lastMessageContent) {
      lines.push('Consider offering a brief recap of where we left off.');
      lines.push(`Last topic: ${lastMessageContent.substring(0, 100)}${lastMessageContent.length > 100 ? '...' : ''}`);
    }
    lines.push('Use a warm, welcoming greeting appropriate for the time of day.');
  } else if (sessionContext.greetingStyle === 'welcome_back') {
    lines.push('The user is returning after a break.');
    lines.push(`Acknowledge the time gap: "${sessionContext.elapsedTimeDescription}"`);
    if (sessionContext.shouldOfferRecap && lastMessageContent) {
      lines.push('Consider offering a brief recap or asking if they want to continue where we left off.');
    }
  } else {
    lines.push('This is a continuous conversation (short pause).');
    lines.push('Use a natural, time-appropriate greeting without over-emphasizing the gap.');
  }
  
  lines.push('');
  lines.push('You are aware of the current time and can reference it naturally in conversation.');
  lines.push('Examples:');
  lines.push('- "It\'s Monday afternoon, perfect time to work on your GPT."');
  lines.push('- "Today is January 15th, 2025."');
  lines.push(`- "Welcome back! It's been ${sessionContext.elapsedTimeDescription}."`);
  lines.push('- "Let\'s continue where we left off yesterday."');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Prioritize memories by recency (time-driven retrieval)
 */
export function prioritizeMemoriesByTime<T extends { timestamp?: string | number }>(
  memories: T[],
  maxRecent: number = 5,
  maxHistorical: number = 3
): { recent: T[]; historical: T[] } {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  
  const recent: T[] = [];
  const historical: T[] = [];
  
  for (const memory of memories) {
    if (!memory.timestamp) {
      // No timestamp - treat as historical
      historical.push(memory);
      continue;
    }
    
    const timestamp = typeof memory.timestamp === 'string' 
      ? new Date(memory.timestamp).getTime() 
      : memory.timestamp;
    
    const age = now - timestamp;
    
    if (age < sevenDaysMs) {
      recent.push(memory);
    } else {
      historical.push(memory);
    }
  }
  
  // Sort recent by recency (newest first)
  recent.sort((a, b) => {
    const tsA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : (a.timestamp || 0);
    const tsB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : (b.timestamp || 0);
    return tsB - tsA;
  });
  
  // Sort historical by recency (newest first)
  historical.sort((a, b) => {
    const tsA = typeof a.timestamp === 'string' ? new Date(a.timestamp).getTime() : (a.timestamp || 0);
    const tsB = typeof b.timestamp === 'string' ? new Date(b.timestamp).getTime() : (b.timestamp || 0);
    return tsB - tsA;
  });
  
  return {
    recent: recent.slice(0, maxRecent),
    historical: historical.slice(0, maxHistorical)
  };
}

