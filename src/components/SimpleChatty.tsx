import React, { useState, useRef, useEffect } from 'react';
import { Send, Settings, FileText, Brain, Database } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import { useEventBus, useEventEmitter } from '../hooks/useEventBus';
import { createSimplePacket, SimpleOP } from '../proto/simpleOpcodes';
import { stripSpeakerPrefix } from '../lib/utils';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
  metadata?: Record<string, any>;
}

interface SimpleChattyProps {
  onToggleAdvanced?: () => void;
  onOpenSettings?: () => void;
}

export function SimpleChatty({ onToggleAdvanced, onOpenSettings }: SimpleChattyProps) {
  const { settings, update, isAdvancedMode } = useSettings();
  const { emit } = useEventEmitter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId] = useState(() => `conv_${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load messages from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(`batty_messages_${conversationId}`);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (error) {
        console.warn('Failed to load saved messages:', error);
      }
    }
  }, [conversationId]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(`batty_messages_${conversationId}`, JSON.stringify(messages));
  }, [messages, conversationId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen for responses
  useEventBus('response_ready', (payload) => {
    if (payload.conversationId === conversationId) {
      const newMessage: Message = {
        id: `msg_${Date.now()}`,
        content: payload.content,
        role: 'assistant',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, newMessage]);
      setIsLoading(false);
    }
  });

  // Listen for errors
  useEventBus('error_occurred', (payload) => {
    const errorMessage: Message = {
      id: `error_${Date.now()}`,
      content: `Error: ${payload.error}`,
      role: 'system',
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, errorMessage]);
    setIsLoading(false);
  });

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      content: input.trim(),
      role: 'user',
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Emit message event
    emit('message_received', {
      conversationId,
      role: 'user',
      content: userMessage.content
    });

    // Create simple packet for processing
    const packet = createSimplePacket(
      SimpleOP.MESSAGE,
      {
        content: userMessage.content,
        role: 'user',
        conversationId,
        metadata: {
          timestamp: userMessage.timestamp,
          settings: {
            enableMemory: settings.enableMemory,
            enableReasoning: settings.enableReasoning,
            enableFileProcessing: settings.enableFileProcessing
          }
        }
      }
    );

    // Process the message (this would connect to your existing AI systems)
    try {
      await processMessage(packet);
    } catch (error) {
      console.error('Error processing message:', error);
      emit('error_occurred', {
        error: error instanceof Error ? error.message : String(error),
        context: 'SimpleChatty.handleSend',
        timestamp: Date.now()
      });
    }
  };

  const processMessage = async (packet: any) => {
    // This is where you'd integrate with your existing AI systems
    // For now, we'll simulate a response
    
    // Emit memory retrieval if enabled
    if (settings.enableMemory) {
      emit('memory_retrieved', {
        memoryId: `mem_${Date.now()}`,
        userId: 'user',
        query: packet.payload,
        relevance: 0.8
      });
    }

    // Emit reasoning if enabled
    if (settings.enableReasoning) {
      emit('reasoning_started', {
        queryId: `reason_${Date.now()}`,
        query: packet.payload,
        depth: settings.reasoningDepth
      });
    }

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    // Generate response (this would use your AI systems)
    const response = generateResponse(packet);
    
    // Emit response ready
    emit('response_ready', {
      conversationId,
      content: response
    });
  };

  const generateResponse = (packet: any): string => {
    // This is a simple response generator
    // In the real implementation, this would use your AI systems
    const responses = [
      "I understand. Let me help you with that.",
      "That's an interesting question. Here's what I think...",
      "I can assist you with that. Let me provide some insights.",
      "Great question! Let me break that down for you.",
      "I see what you're asking. Here's my response..."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearConversation = () => {
    setMessages([]);
    emit('ui_state_changed', {
      component: 'SimpleChatty',
      state: { action: 'clear_conversation' }
    });
  };

  return (
    <div className="flex min-h-screen w-full bg-app-orange-900 text-white">
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-64 lg:w-72 xl:w-80 border-r border-app-orange-700 flex-col p-4 gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold">Batty</h1>
          <button
            onClick={() => setMessages([])}
            className="rounded-md border border-app-orange-600 px-2 py-1 text-xs hover:bg-app-orange-800 transition-colors"
          >
            New chat
          </button>
        </div>
        <p className="text-xs text-app-orange-400">Conversations are stored locally in your browser.</p>
        <button
          onClick={onOpenSettings}
          className="text-xs text-blue-400 hover:underline text-left"
        >
          Settings
        </button>
        {onToggleAdvanced && (
          <button
            onClick={onToggleAdvanced}
            className="text-xs text-green-400 hover:underline text-left"
          >
            Toggle Advanced Mode
          </button>
        )}
        {isAdvancedMode && (
          <div className="mt-4 p-3 bg-app-orange-800 rounded-lg">
            <p className="text-sm text-blue-400">
              Advanced features are enabled: Memory, Reasoning, File Processing
            </p>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <section className="flex-1 flex flex-col">

        {/* Messages */}
        <div ref={messagesEndRef} className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          {messages.length === 0 ? (
            <div className="h-full w-full flex items-center justify-center" style={{ color: 'var(--chatty-text)', opacity: 0.7 }}>
              <p className="text-sm">Start a conversation by typing a message below.</p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="rounded-lg border p-4 whitespace-pre-wrap leading-relaxed"
                  style={{
                    backgroundColor: message.role === "user" ? '#ADA587' : message.role === "system" ? '#fef2f2' : '#ffffd7',
                    borderColor: message.role === "system" ? '#fecaca' : '#ADA587',
                    color: message.role === "system" ? '#dc2626' : 'var(--chatty-text)'
                  }}
                >
                  {typeof message.content === 'string' ? stripSpeakerPrefix(message.content) : message.content}
                </div>
              ))}
              {isLoading && (
                <div className="rounded-lg border p-4" style={{ backgroundColor: 'var(--chatty-button)', borderColor: 'var(--chatty-line)', color: 'var(--chatty-text)', opacity: 0.7 }}>
                  Thinking...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="border-t border-app-orange-700 p-3 sm:p-4"
        >
          <div className="mx-auto max-w-3xl">
            <div className="relative">
              <textarea
                className="w-full resize-none rounded-md border border-app-orange-600 bg-app-orange-950 p-3 pr-24 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 min-h-[48px] max-h-40 text-white placeholder-app-orange-400"
                rows={1}
                placeholder="Message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={isLoading}
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="rounded-md bg-blue-600 text-white text-xs px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700"
                >
                  Send
                </button>
              </div>
            </div>
            
            {/* Status indicators */}
            <div className="flex items-center gap-4 mt-2 text-xs text-app-orange-400">
              {settings.enableMemory && (
                <div className="flex items-center gap-1">
                  <Database size={12} />
                  <span>Memory</span>
                </div>
              )}
              {settings.enableReasoning && (
                <div className="flex items-center gap-1">
                  <Brain size={12} />
                  <span>Reasoning</span>
                </div>
              )}
              {settings.enableFileProcessing && (
                <div className="flex items-center gap-1">
                  <FileText size={12} />
                  <span>Files</span>
                </div>
              )}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
