export type ChatEventPayloads = {
  // Core events (from Small Chatty)
  "first_message": { conversationId: string };
  "idle_timeout": { conversationId: string; idleMs: number };
  "file_upload": { conversationId: string; file: { name: string; mime: string; size: number; url?: string } };
  "message_received": { conversationId: string; role: "user" | "assistant" | "system"; content: string };
  "response_ready": { conversationId: string; content: string };
  
  // Batty-specific events
  "memory_created": { memoryId: string; userId: string; content: string; type: string };
  "memory_retrieved": { memoryId: string; userId: string; query: string; relevance: number };
  "reasoning_started": { queryId: string; query: string; depth: number };
  "reasoning_completed": { queryId: string; result: any; steps: number; duration: number };
  "file_processing_started": { fileId: string; fileName: string; size: number };
  "file_processing_completed": { fileId: string; chunks: number; tokens: number; duration: number };
  "narrative_synthesis_started": { narrativeId: string; sourceType: string };
  "narrative_synthesis_completed": { narrativeId: string; wordCount: number; duration: number };
  "large_file_analysis_started": { fileId: string; fileName: string; size: number };
  "large_file_analysis_completed": { fileId: string; insights: string[]; duration: number };
  
  // System events
  "settings_updated": { key: string; value: any; previousValue: any };
  "mode_changed": { from: 'simple' | 'advanced'; to: 'simple' | 'advanced' };
  "error_occurred": { error: string; context: string; timestamp: number };
  "performance_metric": { metric: string; value: number; unit: string; timestamp: number };
  
  // Session lifecycle events
  "session_active": { sessionId: string; userId: string; threadId?: string; timestamp: number };
  "session_idle": { sessionId: string; userId: string; threadId?: string; idleMs: number; timestamp: number };
  "session_resumed": { sessionId: string; userId: string; threadId?: string; idleDuration: number; timestamp: number };
  "session_ended": { sessionId: string; userId: string; threadId?: string; reason: 'timeout' | 'explicit' | 'long_absence'; timestamp: number };
  
  // UI events
  "ui_state_changed": { component: string; state: any };
  "debug_panel_toggled": { visible: boolean };
  "theme_changed": { theme: 'dark' | 'light' };
};

export type ChatEventName = keyof ChatEventPayloads;
export type ChatEventHandler<N extends ChatEventName> = (payload: ChatEventPayloads[N]) => void | Promise<void>;

type AnyHandler = (payload: unknown) => void | Promise<void>;

export class EventBus {
  private listeners: Partial<Record<ChatEventName, Set<AnyHandler>>> = {};
  private eventHistory: Array<{ name: ChatEventName; payload: any; timestamp: number }> = [];
  private maxHistorySize = 100;

  on<N extends ChatEventName>(name: N, handler: ChatEventHandler<N>) {
    if (!this.listeners[name]) this.listeners[name] = new Set<AnyHandler>();
    (this.listeners[name] as Set<AnyHandler>).add(handler as AnyHandler);
    
    // Return unsubscribe function
    return () => this.off(name, handler);
  }

  off<N extends ChatEventName>(name: N, handler: ChatEventHandler<N>) {
    (this.listeners[name] as Set<AnyHandler> | undefined)?.delete(handler as AnyHandler);
  }

  async emit<N extends ChatEventName>(name: N, payload: ChatEventPayloads[N]) {
    // Add to history
    this.eventHistory.push({
      name,
      payload,
      timestamp: Date.now()
    });

    // Trim history if too large
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }

    // Execute handlers
    const handlers = Array.from((this.listeners[name] as Set<AnyHandler> | undefined) ?? []);
    
    // Execute all handlers in parallel
    const promises = handlers.map(async (handler) => {
      try {
        await handler(payload);
      } catch (error) {
        console.error(`Error in event handler for ${name}:`, error);
        // Emit error event
        this.emit('error_occurred', {
          error: error instanceof Error ? error.message : String(error),
          context: `Event handler for ${name}`,
          timestamp: Date.now()
        });
      }
    });

    await Promise.all(promises);
  }

  // Get event history for debugging
  getEventHistory(): Array<{ name: ChatEventName; payload: any; timestamp: number }> {
    return [...this.eventHistory];
  }

  // Clear event history
  clearEventHistory(): void {
    this.eventHistory = [];
  }

  // Get listener count for debugging
  getListenerCount(eventName?: ChatEventName): number | Record<ChatEventName, number> {
    if (eventName) {
      return this.listeners[eventName]?.size || 0;
    }
    
    const counts: Record<string, number> = {};
    for (const [name, handlers] of Object.entries(this.listeners)) {
      counts[name] = handlers.size;
    }
    return counts as Record<ChatEventName, number>;
  }

  // Remove all listeners
  removeAllListeners(): void {
    this.listeners = {};
  }

  // Remove all listeners for a specific event
  removeAllListenersForEvent<N extends ChatEventName>(eventName: N): void {
    delete this.listeners[eventName];
  }
}

// Create singleton instance
export const eventBus = new EventBus();

// Helper function to create typed event emitters
export function createEventEmitter<N extends ChatEventName>(eventName: N) {
  return (payload: ChatEventPayloads[N]) => eventBus.emit(eventName, payload);
}

// Helper function to create typed event listeners
export function createEventListener<N extends ChatEventName>(
  eventName: N, 
  handler: ChatEventHandler<N>
) {
  return eventBus.on(eventName, handler);
}

// Debug utilities
export function debugEventBus() {
  console.log('🔍 EventBus Debug Info:');
  console.log('📊 Listener counts:', eventBus.getListenerCount());
  console.log('📜 Event history:', eventBus.getEventHistory());
  console.log('🎯 Available events:', Object.keys(eventBus.getListenerCount()));
}
