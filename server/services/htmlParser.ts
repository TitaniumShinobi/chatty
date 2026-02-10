/**
 * HTML Parser for ChatGPT conversations.html exports
 * Extracts individual conversations from HTML and converts to structured format
 */

import { load, CheerioAPI, Element } from 'cheerio';
import { randomBytes } from 'crypto';

export interface ParsedMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp?: string;
}

export interface ParsedConversation {
  conversationId?: string;
  title?: string;
  messages: ParsedMessage[];
  metadata?: {
    originalId?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

/**
 * Parse conversations from ChatGPT conversations.html file
 * 
 * @param htmlContent - Raw HTML content from conversations.html
 * @returns Array of parsed conversations
 */
export async function parseHtmlConversations(htmlContent: string): Promise<ParsedConversation[]> {
  if (!htmlContent || typeof htmlContent !== 'string') {
    console.warn('⚠️ [htmlParser] Invalid HTML content provided');
    return [];
  }

  const $ = load(htmlContent);
  const conversations: ParsedConversation[] = [];

  try {
    // Strategy 1: Look for conversation containers with data attributes
    let conversationElements = $('[data-conversation-id], [id*="conversation"], .conversation, section.conversation').toArray();
    
    // Strategy 2: Look for major sections/articles that might contain conversations
    if (conversationElements.length === 0) {
      conversationElements = $('section, article, .chat-container, .conversation-container').toArray();
    }
    
    // Strategy 3: Split by major headings (h1, h2) as conversation boundaries
    if (conversationElements.length === 0) {
      const headings = $('h1, h2').toArray();
      if (headings.length > 0) {
        for (let i = 0; i < headings.length; i++) {
          const heading = headings[i];
          const $heading = $(heading);
          const title = $heading.text().trim();
          
          // Get content until next heading
          let content = '';
          let next = $heading.next();
          while (next.length && !next.is('h1, h2')) {
            content += next.html() || next.text();
            next = next.next();
          }
          
          if (title && content) {
            conversations.push(extractConversationFromElement($, {
              element: heading,
              title,
              content
            }));
          }
        }
      }
    } else {
      // Process found conversation elements
      for (const element of conversationElements) {
        try {
          const conversation = extractConversationFromElement($, element);
          if (conversation && conversation.messages && conversation.messages.length > 0) {
            conversations.push(conversation);
          }
        } catch (error) {
          console.warn(`⚠️ [htmlParser] Failed to extract conversation:`, error instanceof Error ? error.message : String(error));
          continue;
        }
      }
    }

    // Fallback: Extract from entire document if no conversations found
    if (conversations.length === 0) {
      console.log('🔄 [htmlParser] Trying fallback: extract from document structure');
      const fallbackConversation = extractConversationFromDocument($);
      if (fallbackConversation && fallbackConversation.messages && fallbackConversation.messages.length > 0) {
        conversations.push(fallbackConversation);
      }
    }

    // Ensure each conversation has an ID
    conversations.forEach((conv, index) => {
      if (!conv.conversationId) {
        conv.conversationId = generateConversationId();
      }
      if (!conv.title) {
        conv.title = `Conversation ${index + 1}`;
      }
    });

    console.log(`✅ [htmlParser] Extracted ${conversations.length} conversations from HTML`);
    return conversations;

  } catch (error) {
    console.error(`❌ [htmlParser] Failed to parse HTML:`, error);
    return [];
  }
}

/**
 * Extract conversation data from a single HTML element
 */
function extractConversationFromElement(
  $: CheerioAPI,
  element: Element | { element: Element; title?: string; content?: string }
): ParsedConversation {
  const $element = typeof element === 'object' && 'element' in element
    ? $(element.element)
    : $(element);

  // Extract conversation ID from data attributes or ID
  const conversationId = $element.attr('data-conversation-id') ||
                        $element.attr('id')?.replace(/[^a-zA-Z0-9-]/g, '') ||
                        undefined;

  // Extract title
  let title: string | undefined;
  if ('title' in element && element.title) {
    title = element.title;
  } else {
    // Try to find title in element
    const titleElement = $element.find('h1, h2, h3, .title, [class*="title"]').first();
    if (titleElement.length) {
      title = titleElement.text().trim();
    } else {
      // Use element's own text if it's a heading
      if ($element.is('h1, h2, h3')) {
        title = $element.text().trim();
      }
    }
  }

  // Extract messages
  const messages: ParsedMessage[] = [];
  
  // Look for message containers
  const messageElements = $element.find('[data-role], .message, .user-message, .assistant-message, p, div[class*="message"]').toArray();
  
  if (messageElements.length === 0) {
    // Try to extract from content if provided
    if ('content' in element && element.content) {
      const content = element.content;
      messages.push(...extractMessagesFromText(content));
    } else {
      // Extract from element's text content
      const text = $element.text();
      messages.push(...extractMessagesFromText(text));
    }
  } else {
    // Process structured message elements
    for (const msgEl of messageElements) {
      const $msg = $(msgEl);
      const role = normalizeRole(
        $msg.attr('data-role') ||
        $msg.attr('class')?.match(/user|assistant|system/i)?.[0] ||
        $msg.is('.user-message, [class*="user"]') ? 'user' :
        $msg.is('.assistant-message, [class*="assistant"]') ? 'assistant' :
        'user' // Default to user
      );
      
      const text = $msg.text().trim();
      const timestamp = $msg.attr('data-timestamp') || 
                       $msg.find('[data-timestamp], .timestamp, time').attr('datetime') ||
                       $msg.find('[data-timestamp], .timestamp, time').text().trim() ||
                       undefined;

      if (text) {
        messages.push({ role, text, timestamp });
      }
    }
  }

  // Extract metadata
  const metadata: ParsedConversation['metadata'] = {};
  const createdAt = $element.attr('data-created-at') || $element.find('[data-created-at]').attr('data-created-at');
  const updatedAt = $element.attr('data-updated-at') || $element.find('[data-updated-at]').attr('data-updated-at');
  
  if (createdAt) metadata.createdAt = createdAt;
  if (updatedAt) metadata.updatedAt = updatedAt;

  return {
    conversationId,
    title: title || 'Untitled Conversation',
    messages: messages.length > 0 ? messages : [{ role: 'user', text: $element.text().trim() }],
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined
  };
}

/**
 * Extract conversation from entire document (fallback)
 */
function extractConversationFromDocument($: CheerioAPI): ParsedConversation {
  const messages: ParsedMessage[] = [];
  
  // Look for all paragraphs or divs that might be messages
  const allElements = $('body p, body div, body section').toArray();
  
  for (const el of allElements) {
    const $el = $(el);
    const text = $el.text().trim();
    
    if (text && text.length > 10) { // Minimum message length
      // Try to infer role from context
      const role = inferRoleFromContext($el);
      messages.push({ role, text });
    }
  }

  return {
    conversationId: generateConversationId(),
    title: $('title').text() || 'Imported Conversation',
    messages: messages.length > 0 ? messages : [{ role: 'user', text: $('body').text().trim() }]
  };
}

/**
 * Generate conversation ID
 */
function generateConversationId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Extract messages from plain text content
 */
function extractMessagesFromText(text: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  
  // Try to split by common patterns
  // Pattern 1: "User:" / "Assistant:" prefixes
  const userPattern = /(?:^|\n)\s*(?:User|You):\s*(.+?)(?=\n\s*(?:Assistant|AI|ChatGPT):|$)/gis;
  const assistantPattern = /(?:^|\n)\s*(?:Assistant|AI|ChatGPT|Bot):\s*(.+?)(?=\n\s*(?:User|You):|$)/gis;
  
  const userMatches = [...text.matchAll(userPattern)];
  const assistantMatches = [...text.matchAll(assistantPattern)];
  
  // Combine and sort by position
  const allMatches: Array<{ role: 'user' | 'assistant'; text: string; index: number }> = [];
  
  userMatches.forEach(match => {
    if (match.index !== undefined) {
      allMatches.push({ role: 'user', text: match[1].trim(), index: match.index });
    }
  });
  
  assistantMatches.forEach(match => {
    if (match.index !== undefined) {
      allMatches.push({ role: 'assistant', text: match[1].trim(), index: match.index });
    }
  });
  
  allMatches.sort((a, b) => a.index - b.index);
  
  if (allMatches.length > 0) {
    return allMatches.map(m => ({ role: m.role, text: m.text }));
  }
  
  // Fallback: treat entire text as single user message
  return [{ role: 'user', text: text.trim() }];
}

/**
 * Normalize role to Chatty schema
 */
function normalizeRole(role: string | undefined): 'user' | 'assistant' | 'system' {
  if (!role) return 'user';
  
  const normalized = role.toLowerCase().trim();
  
  if (normalized.includes('user') || normalized.includes('human')) {
    return 'user';
  }
  if (normalized.includes('assistant') || normalized.includes('ai') || normalized.includes('chatgpt') || normalized.includes('bot')) {
    return 'assistant';
  }
  if (normalized.includes('system')) {
    return 'system';
  }
  
  return 'user'; // Default
}

/**
 * Infer role from element context
 */
function inferRoleFromContext($el: ReturnType<CheerioAPI>): 'user' | 'assistant' | 'system' {
  const classes = $el.attr('class') || '';
  const id = $el.attr('id') || '';
  const text = $el.text().toLowerCase();
  
  if (classes.includes('user') || id.includes('user') || text.includes('user:')) {
    return 'user';
  }
  if (classes.includes('assistant') || classes.includes('ai') || id.includes('assistant') || text.includes('assistant:')) {
    return 'assistant';
  }
  if (classes.includes('system') || id.includes('system')) {
    return 'system';
  }
  
  // Default: alternate between user and assistant based on position
  return 'user';
}

/**
 * Sanitize conversation title for filename
 */
export function sanitizeTitle(title: string): string {
  return title
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .toLowerCase()
    .substring(0, 100) // Limit length
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

