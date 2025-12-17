/**
 * Message Recovery Utility
 * 
 * Recovers messages that were displayed in UI but never saved to markdown file.
 * Can extract from:
 * 1. React state (if browser is still open)
 * 2. Console logs (if browser console history is available)
 * 3. localStorage (if messages were cached)
 * 4. Manual input (for copy-paste recovery)
 */

export interface RecoveredMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  source: 'react-state' | 'console-log' | 'localStorage' | 'manual';
  metadata?: {
    messageId?: string;
    threadId?: string;
    constructId?: string;
  };
}

export class MessageRecovery {
  /**
   * Extract messages from React state (if browser is still open)
   * Run this in browser console while the page is still loaded
   */
  static extractFromReactState(): RecoveredMessage[] {
    const messages: RecoveredMessage[] = [];
    
    try {
      // Check if threads are stored in window (exposed by Layout.tsx)
      const windowThreads = (window as any).__CHATTY_THREADS__;
      
      console.log('🔍 Checking window.__CHATTY_THREADS__:', {
        exists: !!windowThreads,
        isArray: Array.isArray(windowThreads),
        length: windowThreads?.length,
        threads: windowThreads
      });
      
      if (windowThreads && Array.isArray(windowThreads)) {
        windowThreads.forEach((thread: any) => {
          console.log(`📂 Checking thread ${thread.id}:`, {
            hasMessages: !!thread.messages,
            messageCount: thread.messages?.length,
            messages: thread.messages
          });
          
          if (thread.messages && Array.isArray(thread.messages)) {
            thread.messages.forEach((msg: any) => {
              // Use extractMessageContent to handle all formats (text, content, packets)
              const content = this.extractMessageContent(msg);
              
              if (content && msg.role) {
                console.log(`✅ Found ${msg.role} message:`, {
                  id: msg.id,
                  role: msg.role,
                  contentLength: content.length,
                  contentPreview: content.substring(0, 100)
                });
                
                messages.push({
                  role: msg.role as 'user' | 'assistant',
                  content,
                  timestamp: msg.timestamp || new Date(msg.ts || Date.now()).toISOString(),
                  source: 'react-state',
                  metadata: {
                    messageId: msg.id,
                    threadId: thread.id,
                    constructId: thread.constructId
                  }
                });
              } else {
                console.log(`⚠️ Skipping message (no content or role):`, {
                  id: msg.id,
                  role: msg.role,
                  hasContent: !!content,
                  msgKeys: Object.keys(msg)
                });
              }
            });
          }
        });
      } else {
        console.log('⚠️ window.__CHATTY_THREADS__ not found or not an array');
        console.log('💡 Try: Check if the page is still loaded and React state is active');
      }
      
      // Try React DevTools as fallback
      const reactRoot = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (reactRoot) {
        console.log('✅ React DevTools detected - but direct state access requires manual inspection');
        console.log('💡 Use React DevTools → Components → Layout → hooks → threads to view state');
      }
    } catch (error) {
      console.error('❌ Failed to extract from React state:', error);
    }
    
    console.log(`📊 Extracted ${messages.length} messages from React state`);
    return messages;
  }

  /**
   * Extract messages from localStorage
   */
  static extractFromLocalStorage(): RecoveredMessage[] {
    const messages: RecoveredMessage[] = [];
    
    try {
      // Check various localStorage keys
      const keys = [
        'chatty:threads',
        'chatty-data',
        'chatty:threads:backup'
      ];
      
      keys.forEach(key => {
        try {
          const data = localStorage.getItem(key);
          if (data) {
            const parsed = JSON.parse(data);
            
            // Handle different storage formats
            if (Array.isArray(parsed)) {
              // Format: [{ id, title, messages: [...] }]
              parsed.forEach((thread: any) => {
                if (thread.messages && Array.isArray(thread.messages)) {
                  thread.messages.forEach((msg: any) => {
                    const content = this.extractMessageContent(msg);
                    if (content) {
                      messages.push({
                        role: msg.role || 'user',
                        content,
                        timestamp: msg.timestamp || new Date(msg.ts || Date.now()).toISOString(),
                        source: 'localStorage',
                        metadata: {
                          messageId: msg.id,
                          threadId: thread.id,
                          constructId: thread.constructId
                        }
                      });
                    }
                  });
                }
              });
            } else if (parsed.conversations && Array.isArray(parsed.conversations)) {
              // Format: { conversations: [...] }
              parsed.conversations.forEach((conv: any) => {
                if (conv.messages && Array.isArray(conv.messages)) {
                  conv.messages.forEach((msg: any) => {
                    const content = this.extractMessageContent(msg);
                    if (content) {
                      messages.push({
                        role: msg.role || 'user',
                        content,
                        timestamp: msg.timestamp || new Date(msg.ts || Date.now()).toISOString(),
                        source: 'localStorage',
                        metadata: {
                          messageId: msg.id,
                          threadId: conv.id,
                          constructId: conv.constructId
                        }
                      });
                    }
                  });
                }
              });
            }
          }
        } catch (error) {
          console.warn(`Failed to parse localStorage key ${key}:`, error);
        }
      });
    } catch (error) {
      console.error('Failed to extract from localStorage:', error);
    }
    
    return messages;
  }

  /**
   * Extract message content from various message formats
   */
  static extractMessageContent(msg: any): string | null {
    if (!msg) return null;
    
    // Skip typing indicators
    if (msg.typing === true) {
      return null;
    }
    
    // Direct content
    if (typeof msg.content === 'string' && msg.content.trim()) {
      return msg.content;
    }
    
    // Text field
    if (typeof msg.text === 'string' && msg.text.trim()) {
      return msg.text;
    }
    
    // Packets format (assistant messages)
    if (Array.isArray(msg.packets)) {
      const content = msg.packets
        .map((packet: any) => {
          if (!packet) return '';
          if (packet.op === 'answer.v1' && packet.payload?.content) {
            return packet.payload.content;
          }
          // Handle other packet types
          if (packet.payload?.content) {
            return packet.payload.content;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n\n');
      if (content) return content;
    }
    
    // Try to extract from any nested structure
    if (msg.payload?.content && typeof msg.payload.content === 'string') {
      return msg.payload.content;
    }
    
    return null;
  }

  /**
   * Extract messages from console log history
   * This requires the browser console to still be open with history
   */
  static extractFromConsoleLogs(): RecoveredMessage[] {
    const messages: RecoveredMessage[] = [];
    
    console.log(`
🔍 MESSAGE RECOVERY: Console Log Extraction
===========================================

To extract messages from console logs:

1. Open browser DevTools Console
2. Right-click in console → "Save as..." to export console history
3. Or manually search console for these patterns:
   - "💾 [Layout.tsx] Saving ASSISTANT message"
   - "📝 [Layout.tsx] Extracted assistant content"
   - "✅ [Layout.tsx] ASSISTANT message saved"
   - "onFinalUpdate: Extracted assistant content"

4. Look for logged message content in console output
5. Copy the content and use manual recovery below

Alternatively, check Network tab for API requests to:
   - /api/conversations/{threadId}/messages
   - Request payloads may contain message content
`);
    
    return messages;
  }

  /**
   * Manual recovery - allows user to paste message content
   */
  static async recoverManually(
    threadId: string,
    constructId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: string }>
  ): Promise<{ recovered: number; errors: string[] }> {
    const errors: string[] = [];
    let recovered = 0;
    
    try {
      const { VVAULTConversationManager } = await import('./vvaultConversationManager');
      const conversationManager = VVAULTConversationManager.getInstance();
      
      // Get current user from auth
      const authSession = localStorage.getItem('auth:session');
      if (!authSession) {
        throw new Error('No active user session found');
      }
      
      const session = JSON.parse(authSession);
      const user = session.user;
      
      if (!user) {
        throw new Error('User not found in session');
      }
      
      // Save each message
      for (const msg of messages) {
        try {
          await conversationManager.addMessageToConversation(user, threadId, {
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp || new Date().toISOString(),
            metadata: {
              constructId,
              recovered: true,
              recoverySource: 'manual'
            }
          });
          recovered++;
          console.log(`✅ Recovered ${msg.role} message (${msg.content.substring(0, 50)}...)`);
        } catch (error: any) {
          errors.push(`Failed to recover ${msg.role} message: ${error.message}`);
          console.error(`❌ Failed to recover message:`, error);
        }
      }
    } catch (error: any) {
      errors.push(`Recovery failed: ${error.message}`);
      console.error('❌ Manual recovery failed:', error);
    }
    
    return { recovered, errors };
  }

  /**
   * Comprehensive recovery - tries all methods
   */
  static async recoverAll(threadId: string, constructId: string): Promise<{
    recovered: number;
    sources: { [key: string]: number };
    errors: string[];
  }> {
    const sources: { [key: string]: number } = {};
    const errors: string[] = [];
    let totalRecovered = 0;
    
    console.log('🔍 Starting comprehensive message recovery...');
    
    // 1. Try React state
    try {
      const reactMessages = this.extractFromReactState();
      if (reactMessages.length > 0) {
        console.log(`📦 Found ${reactMessages.length} messages in React state`);
        const result = await this.recoverManually(threadId, constructId, reactMessages);
        totalRecovered += result.recovered;
        sources['react-state'] = result.recovered;
        errors.push(...result.errors);
      }
    } catch (error: any) {
      errors.push(`React state extraction failed: ${error.message}`);
    }
    
    // 2. Try localStorage
    try {
      const storageMessages = this.extractFromLocalStorage();
      if (storageMessages.length > 0) {
        console.log(`💾 Found ${storageMessages.length} messages in localStorage`);
        const result = await this.recoverManually(threadId, constructId, storageMessages);
        totalRecovered += result.recovered;
        sources['localStorage'] = result.recovered;
        errors.push(...result.errors);
      }
    } catch (error: any) {
      errors.push(`localStorage extraction failed: ${error.message}`);
    }
    
    // 3. Console log extraction (instructions only)
    this.extractFromConsoleLogs();
    
    console.log(`✅ Recovery complete: ${totalRecovered} messages recovered from ${Object.keys(sources).length} sources`);
    
    return { recovered: totalRecovered, sources, errors };
  }
}

/**
 * Helper to inspect current UI state
 */
(window as any).inspectChattyState = function() {
  console.log(`
🔍 CHATTY STATE INSPECTOR
=========================

Current Threads in Window:
`, (window as any).__CHATTY_THREADS__);

      const threads = (window as any).__CHATTY_THREADS__;
      if (threads && Array.isArray(threads)) {
        threads.forEach((thread: any) => {
          console.log(`\n📂 Thread: ${thread.id} (${thread.title})`);
          console.log(`   Messages: ${thread.messages?.length || 0}`);
          if (thread.messages && thread.messages.length > 0) {
            thread.messages.forEach((msg: any, idx: number) => {
              const content = MessageRecovery.extractMessageContent(msg);
              console.log(`   [${idx}] ${msg.role}: ${content ? content.substring(0, 50) + '...' : '(no content)'}`);
            });
          }
        });
      } else {
        console.log('⚠️ No threads found in window.__CHATTY_THREADS__');
      }
  
  console.log(`
💾 LocalStorage Keys:
`, Object.keys(localStorage).filter(k => k.includes('chatty') || k.includes('thread')));
};

/**
 * Browser console helper function
 * Run this in browser console to recover messages
 */
(window as any).recoverMessages = async function(threadId?: string, constructId?: string) {
  console.log(`
🔧 MESSAGE RECOVERY UTILITY
===========================

Usage:
  recoverMessages()                    - Auto-detect and recover all messages
  recoverMessages('zen-001_chat_with_zen-001', 'zen-001')  - Recover for specific thread

This will:
1. Extract messages from React state (if available)
2. Extract messages from localStorage
3. Save recovered messages to VVAULT markdown file
`);
  
  // Auto-detect thread if not provided
  if (!threadId) {
    const urlMatch = window.location.pathname.match(/\/app\/chat\/(.+)$/);
    if (urlMatch) {
      threadId = urlMatch[1];
      console.log(`📍 Auto-detected threadId: ${threadId}`);
    } else {
      console.error('❌ Could not auto-detect threadId. Please provide it manually.');
      return;
    }
  }
  
  if (!constructId) {
    const threadMatch = threadId.match(/^([a-z-]+)-\d+_/);
    if (threadMatch) {
      constructId = threadMatch[1] + '-001';
      console.log(`📍 Auto-detected constructId: ${constructId}`);
    } else {
      constructId = 'zen-001';
      console.log(`📍 Using default constructId: ${constructId}`);
    }
  }
  
  const result = await MessageRecovery.recoverAll(threadId, constructId);
  
  console.log(`
📊 RECOVERY RESULTS
===================
Recovered: ${result.recovered} messages
Sources: ${JSON.stringify(result.sources, null, 2)}
Errors: ${result.errors.length > 0 ? result.errors.join('\n') : 'None'}
`);
  
  if (result.recovered > 0) {
    console.log('✅ Messages recovered! Refresh the page to see them in the UI.');
  } else {
    console.log(`
⚠️ No messages found in browser storage.

🔍 DEBUGGING STEPS:
==================

1. Check if threads are in window:
   console.log(window.__CHATTY_THREADS__);

2. Check current UI state:
   // Look at the chat UI - are messages visible?
   // If yes, they're in React state but not saved yet

3. Check browser console history:
   - Search for: "💾 [Layout.tsx] Saving ASSISTANT message"
   - Search for: "📝 [Layout.tsx] Extracted assistant content"
   - Look for any logged message content

4. Check Network tab:
   - Look for POST requests to /api/conversations/{threadId}/messages
   - Check request payloads for message content

5. Manual recovery (if you found content):
   await MessageRecovery.recoverManually(
     '${threadId}',
     '${constructId}',
     [
       { role: 'assistant', content: 'Your message content here', timestamp: new Date().toISOString() }
     ]
   )

6. If messages are visible in UI but not saved:
   - They're in React state
   - Run this to see them:
     console.log('Current threads:', window.__CHATTY_THREADS__);
     // Then manually copy content and use step 5
`);
  }
  
  return result;
};

