import { useEffect, useCallback } from 'react';
import { eventBus, ChatEventName, ChatEventPayloads, ChatEventHandler } from '../lib/eventBus';

/**
 * Hook for subscribing to events with automatic cleanup
 */
export function useEventBus<N extends ChatEventName>(
  eventName: N,
  handler: ChatEventHandler<N>,
  deps: React.DependencyList = []
) {
  useEffect(() => {
    const unsubscribe = eventBus.on(eventName, handler);
    return unsubscribe;
  }, [eventName, ...deps]);
}

/**
 * Hook for emitting events
 */
export function useEventEmitter() {
  const emit = useCallback(<N extends ChatEventName>(
    eventName: N,
    payload: ChatEventPayloads[N]
  ) => {
    eventBus.emit(eventName, payload);
  }, []);

  return { emit };
}

/**
 * Hook for multiple event subscriptions
 */
export function useEventSubscriptions(
  subscriptions: Array<{
    event: ChatEventName;
    handler: ChatEventHandler<ChatEventName>;
    deps?: React.DependencyList;
  }>
) {
  useEffect(() => {
    const unsubscribers = subscriptions.map(({ event, handler }) =>
      eventBus.on(event, handler)
    );

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, subscriptions.flatMap(sub => sub.deps || []));
}

/**
 * Hook for debugging event bus
 */
export function useEventBusDebug() {
  const getHistory = useCallback(() => eventBus.getEventHistory(), []);
  const getListenerCounts = useCallback(() => eventBus.getListenerCount(), []);
  const clearHistory = useCallback(() => eventBus.clearEventHistory(), []);

  return {
    getHistory,
    getListenerCounts,
    clearHistory,
    debug: () => {
      console.log('🔍 EventBus Debug Info:');
      console.log('📊 Listener counts:', getListenerCounts());
      console.log('📜 Event history:', getHistory());
    }
  };
}
