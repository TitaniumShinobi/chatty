import { load } from 'cheerio';
import crypto from 'crypto';

/**
 * Parse conversations from conversations.html file
 * Extracts individual conversations and converts them to the same format as JSON imports
 * 
 * @param {string} htmlContent - Raw HTML content from conversations.html
 * @param {string} source - Source provider ('chatgpt', 'gemini', etc.)
 * @returns {Array} - Array of conversation objects matching JSON import format
 */
export function parseHTMLConversations(htmlContent, source = 'chatgpt') {
  if (!htmlContent || typeof htmlContent !== 'string') {
    console.warn('⚠️ [parseHTMLConversations] Invalid HTML content');
    return [];
  }

  const $ = load(htmlContent);
  const conversations = [];

  try {
    // ChatGPT HTML structure patterns (may vary, so we try multiple strategies)
    // Strategy 1: Look for conversation containers (common patterns)
    let conversationElements = [];
    
    // Try common ChatGPT HTML patterns
    // Pattern 1: Conversations in sections with data attributes or IDs
    conversationElements = $('[data-conversation-id], [id*="conversation"], .conversation, section.conversation').toArray();
    
    // Pattern 2: If no specific containers, look for major sections/divs that might contain conversations
    if (conversationElements.length === 0) {
      // Look for sections with titles and message blocks
      conversationElements = $('section, article, .chat-container, .conversation-container').toArray();
    }
    
    // Pattern 3: Fallback - split by major headings (h1, h2) that might indicate conversation boundaries
    if (conversationElements.length === 0) {
      const headings = $('h1, h2').toArray();
      if (headings.length > 0) {
        // Group content between headings as potential conversations
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
            conversationElements.push({
              title,
              content,
              element: heading
            });
          }
        }
      }
    }

    // Process each conversation element
    for (const element of conversationElements) {
      try {
        const conversation = extractConversationFromElement($, element, source);
        if (conversation && conversation.messages && conversation.messages.length > 0) {
          conversations.push(conversation);
        }
      } catch (error) {
        console.warn(`⚠️ [parseHTMLConversations] Failed to extract conversation:`, error.message);
        continue;
      }
    }

    // If still no conversations found, try extracting from entire document structure
    if (conversations.length === 0) {
      console.log('🔄 [parseHTMLConversations] Trying fallback: extract from document structure');
      const fallbackConversation = extractConversationFromDocument($, source);
      if (fallbackConversation && fallbackConversation.messages && fallbackConversation.messages.length > 0) {
        conversations.push(fallbackConversation);
      }
    }

    console.log(`✅ [parseHTMLConversations] Extracted ${conversations.length} conversations from HTML`);
    return conversations;

  } catch (error) {
    console.error(`❌ [parseHTMLConversations] Failed to parse HTML:`, error);
    return [];
  }
}

/**
 * Extract conversation data from a single HTML element
 */
function extractConversationFromElement($, element, source) {
  const $element = typeof element === 'object' && element.element 
    ? $(element.element) 
    : $(element);
  
  // Extract conversation ID (from data attributes, ID, or generate)
  const conversationId = $element.attr('data-conversation-id') 
    || $element.attr('id') 
    || $element.find('[data-conversation-id]').first().attr('data-conversation-id')
    || crypto.randomUUID();

  // Extract title
  const title = element.title 
    || $element.find('h1, h2, h3, .title, [class*="title"]').first().text().trim()
    || $element.find('header').first().text().trim()
    || 'Untitled conversation';

  // Extract messages
  const messages = extractMessages($, $element);

  // Extract metadata (timestamps, model info, etc.)
  const metadata = extractMetadata($, $element, source);

  // Format conversation to match JSON import structure
  // convertConversationToTranscript() handles both mapping (tree) and messages (array) formats
  return {
    id: conversationId,
    conversation_id: conversationId,
    title: title || 'Untitled conversation',
    create_time: metadata.createTime || Date.now() / 1000,
    update_time: metadata.updateTime || Date.now() / 1000,
    mapping: null, // HTML doesn't have tree structure, so we'll use messages array
    messages: messages, // Array format - convertConversationToTranscript() handles this
    current_node: null,
    // Add extracted metadata for later use in conversion
    detectedModel: metadata.model || 'unknown',
    gptConfig: metadata.gptConfig || null
  };
}

/**
 * Extract messages from HTML element
 * Looks for message patterns (user/assistant messages)
 */
function extractMessages($, $container) {
  const messages = [];
  
  // Common message patterns in ChatGPT HTML exports
  // Pattern 1: Messages in specific containers
  const messageSelectors = [
    '.message',
    '.chat-message',
    '[data-role]',
    '.user-message, .assistant-message',
    '.message-user, .message-assistant',
    'div[class*="message"]',
    'div[class*="chat"]'
  ];

  let $messages = $();
  for (const selector of messageSelectors) {
    $messages = $container.find(selector);
    if ($messages.length > 0) break;
  }

  // If no specific message containers, look for alternating patterns (user/assistant)
  if ($messages.length === 0) {
    // Try to find paragraphs or divs that might be messages
    $messages = $container.find('p, div, li').filter((i, el) => {
      const text = $(el).text().trim();
      return text.length > 20; // Likely a message if substantial text
    });
  }

  $messages.each((i, element) => {
    const $msg = $(element);
    const text = $msg.text().trim();
    
    if (!text || text.length < 5) return; // Skip empty or very short elements

    // Determine role (user vs assistant)
    // Check for role indicators
    let role = 'assistant'; // Default
    const roleIndicators = {
      user: ['user', 'you', 'human', 'me'],
      assistant: ['assistant', 'chatgpt', 'gpt', 'ai', 'model', 'bot']
    };

    const elementText = text.toLowerCase();
    const elementClasses = ($msg.attr('class') || '').toLowerCase();
    const elementId = ($msg.attr('id') || '').toLowerCase();
    const dataRole = ($msg.attr('data-role') || '').toLowerCase();

    // Check for user indicators
    if (roleIndicators.user.some(indicator => 
      elementText.includes(indicator) || 
      elementClasses.includes(indicator) || 
      elementId.includes(indicator) ||
      dataRole.includes(indicator)
    )) {
      role = 'user';
    } else if (roleIndicators.assistant.some(indicator => 
      elementClasses.includes(indicator) || 
      elementId.includes(indicator) ||
      dataRole.includes(indicator)
    )) {
      role = 'assistant';
    } else {
      // Heuristic: alternate between user and assistant if we can't determine
      role = messages.length % 2 === 0 ? 'user' : 'assistant';
    }

    // Convert HTML content to markdown-like text
    const content = htmlToMarkdown($msg);

    // Format message to match convertConversationToTranscript() expectations
    // It handles both mapping (tree) and messages (array) formats
    messages.push({
      role, // Direct role field
      content: {
        text: content.trim(), // Wrap in content.text for compatibility
        parts: [content.trim()] // Also provide parts array
      },
      create_time: Date.now() / 1000 - (messages.length * 60), // Use create_time to match expected format
      timestamp: Date.now() / 1000 - (messages.length * 60) // Keep timestamp for fallback
    });
  });

  return messages;
}

/**
 * Convert HTML element content to markdown
 * Handles common HTML elements: code blocks, lists, links, etc.
 */
function htmlToMarkdown($element) {
  let markdown = '';

  // Handle code blocks
  $element.find('pre, code').each((i, el) => {
    const $code = $(el);
    const code = $code.text();
    if ($code.is('pre')) {
      markdown += '\n```\n' + code + '\n```\n';
    } else {
      markdown += '`' + code + '`';
    }
    $code.remove(); // Remove from further processing
  });

  // Handle lists
  $element.find('ul, ol').each((i, el) => {
    const $list = $(el);
    const isOrdered = $list.is('ol');
    $list.find('li').each((j, li) => {
      const text = $(li).text().trim();
      markdown += (isOrdered ? `${j + 1}. ` : '- ') + text + '\n';
    });
    $list.remove();
  });

  // Handle links
  $element.find('a').each((i, el) => {
    const $link = $(el);
    const href = $link.attr('href') || '';
    const text = $link.text();
    markdown += `[${text}](${href})`;
    $link.replaceWith(text); // Replace with text for further processing
  });

  // Handle images
  $element.find('img').each((i, el) => {
    const $img = $(el);
    const src = $img.attr('src') || '';
    const alt = $img.attr('alt') || '';
    markdown += `![${alt}](${src})\n`;
    $img.remove();
  });

  // Handle blockquotes
  $element.find('blockquote').each((i, el) => {
    const $quote = $(el);
    const text = $quote.text().trim();
    markdown += '> ' + text.split('\n').join('\n> ') + '\n';
    $quote.remove();
  });

  // Get remaining text content
  const remainingText = $element.text().trim();
  if (remainingText) {
    markdown += remainingText;
  }

  return markdown || $element.text().trim();
}

/**
 * Extract metadata from HTML element
 */
function extractMetadata($, $element, source) {
  const metadata = {
    createTime: null,
    updateTime: null,
    model: 'unknown',
    gptConfig: null
  };

  // Try to extract timestamps
  const timeText = $element.find('[datetime], [data-time], time').first().attr('datetime') 
    || $element.find('[datetime], [data-time], time').first().text();
  if (timeText) {
    const timestamp = new Date(timeText).getTime() / 1000;
    if (!isNaN(timestamp)) {
      metadata.createTime = timestamp;
      metadata.updateTime = timestamp;
    }
  }

  // Try to extract model info
  const modelText = $element.find('[data-model], .model, [class*="model"]').first().text();
  if (modelText) {
    metadata.model = modelText.trim();
  }

  return metadata;
}

/**
 * Fallback: Extract conversation from entire document if no containers found
 */
function extractConversationFromDocument($, source) {
  const title = $('title').text().trim() || 'Imported conversation';
  
  // Extract all messages from document body
  const $body = $('body');
  const messages = extractMessages($, $body);

  const conversationId = crypto.randomUUID();

  return {
    id: conversationId,
    conversation_id: conversationId,
    title,
    create_time: Date.now() / 1000,
    update_time: Date.now() / 1000,
    mapping: null,
    messages: messages,
    current_node: null,
    detectedModel: 'unknown',
    gptConfig: null
  };
}

