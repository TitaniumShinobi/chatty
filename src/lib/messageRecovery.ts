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
      
      
      if (windowThreads && Array.isArray(windowThreads)) {
        windowThreads.forEach((thread: any) => {
          
          if (thread.messages && Array.isArray(thread.messages)) {
            thread.messages.forEach((msg: any) => {
              // Use extractMessageContent to handle all formats (text, content, packets)
              const content = this.extractMessageContent(msg);
              
              if (content && msg.role) {
                
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
              }
            });
          }
        });
      } else {
      }
      
      // Try React DevTools as fallback
      const reactRoot = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (reactRoot) {
      }
    } catch (error) {
      console.error('❌ Failed to extract from React state:', error);
    }
    
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
    
    
    // 1. Try React state
    try {
      const reactMessages = this.extractFromReactState();
      if (reactMessages.length > 0) {
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
    
    
    return { recovered: totalRecovered, sources, errors };
  }
}

/**
 * Helper to inspect current UI state
 */
(window as any).inspectChattyState = function() {

      const threads = (window as any).__CHATTY_THREADS__;
      if (threads && Array.isArray(threads)) {
        threads.forEach((thread: any) => {
          if (thread.messages && thread.messages.length > 0) {
            thread.messages.forEach((msg: any, idx: number) => {
              const content = MessageRecovery.extractMessageContent(msg);
            });
          }
        });
      } else {
      }
  
};

/**
 * Browser console helper function
 * Run this in browser console to recover messages
 */
(window as any).recoverMessages = async function(threadId?: string, constructId?: string) {
  
  // Auto-detect thread if not provided
  if (!threadId) {
    const urlMatch = window.location.pathname.match(/\/app\/chat\/(.+)$/);
    if (urlMatch) {
      threadId = urlMatch[1];
    } else {
      console.error('❌ Could not auto-detect threadId. Please provide it manually.');
      return;
    }
  }
  
  if (!constructId) {
    const threadMatch = threadId.match(/^([a-z-]+)-\d+_/);
    if (threadMatch) {
      constructId = threadMatch[1] + '-001';
    } else {
      constructId = 'zen-001';
    }
  }
  
  const result = await MessageRecovery.recoverAll(threadId, constructId);
  
  
  if (result.recovered > 0) {
  } else {
  }
  
  return result;
};

