// useBrowserThread: Simplified React hook for browser environment
// Provides basic STM/LTM access without full database setup

import { useState, useEffect, useCallback, useRef } from 'react';
import { browserStmBuffer, MessagePacket } from '../core/memory/BrowserSTMBuffer';
import { browserConstructRegistry } from '../state/BrowserConstructs';

export interface ThreadInfo {
  id: string;
  constructId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
}

export interface ReadinessState {
  constructReady: boolean;
  bufferReady: boolean;
  threadReady: boolean;
  initializationError: string | null;
}

export interface ThreadState {
  constructId: string;
  threadId: string | null;
  isActive: boolean;
  lastActivity: number;
  stmMessages: MessagePacket[];
  ltmAvailable: boolean;
  driftDetected: boolean;
  lastDriftScore: number;
  readiness: ReadinessState;
}

export interface UseBrowserThreadOptions {
  constructId: string;
  autoAcquireLease?: boolean;
  stmWindowSize?: number;
  enableDriftDetection?: boolean;
}

export function useBrowserThread(options: UseBrowserThreadOptions) {
  const {
    constructId,
    autoAcquireLease = true,
    stmWindowSize = 50,
    enableDriftDetection = true
  } = options;

  // Early return if no constructId provided
  if (!constructId) {
    console.warn('useBrowserThread: No constructId provided');
    return {
      threadState: {
        constructId: '',
        threadId: null,
        isActive: false,
        lastActivity: 0,
        stmMessages: [],
        ltmAvailable: false,
        driftDetected: false,
        lastDriftScore: 0
      },
      acquireThread: async () => null,
      releaseThread: async () => {},
      addMessage: async () => {},
      getSTMStats: () => null,
      getLTMStats: async () => null,
      checkForDrift: async () => false,
      searchLTM: async () => [],
      getThreadInfo: async () => null,
      getAllThreads: async () => [],
      updateThreadTitle: async () => {},
      loadSTMMessages: async () => {}
    };
  }

  const [threadState, setThreadState] = useState<ThreadState>({
    constructId,
    threadId: null,
    isActive: false,
    lastActivity: 0,
    stmMessages: [],
    ltmAvailable: false,
    driftDetected: false,
    lastDriftScore: 0,
    readiness: {
      constructReady: false,
      bufferReady: false,
      threadReady: false,
      initializationError: null
    }
  });

  const driftCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initializationRef = useRef<boolean>(false);

  // Readiness guards - prevent operations until system is stable
  const isConstructReady = threadState.readiness.constructReady;
  const isBufferReady = threadState.readiness.bufferReady;
  const isSystemReady = isConstructReady && isBufferReady;

  // Debug logger for tracking initialization phases
  const logPhase = (phase: string, details?: any) => {
    console.log(`🧵 [${constructId}] ${phase}:`, details || '');
  };

  // Phase 1: Initialize construct and validate environment
  useEffect(() => {
    if (!constructId || initializationRef.current) return;
    
    initializationRef.current = true;
    logPhase('BOOTSTRAP_START', { constructId });
    
    const initializeConstruct = async () => {
      try {
        // Check browser environment first
        if (typeof window === 'undefined' || !window.localStorage) {
          const error = 'localStorage not available, cannot initialize memory system';
          logPhase('BOOTSTRAP_FAILED', { error });
          setThreadState(prev => ({
            ...prev,
            readiness: {
              ...prev.readiness,
              initializationError: error
            }
          }));
          return;
        }

        // Mark buffer as ready (browser storage available)
        setThreadState(prev => ({
          ...prev,
          readiness: {
            ...prev.readiness,
            bufferReady: true
          }
        }));
        logPhase('BUFFER_READY');

        // Try to get or create construct
        let construct;
        try {
          construct = await browserConstructRegistry.getConstruct(constructId);
          logPhase('CONSTRUCT_FOUND', { constructId });
        } catch (getError) {
          logPhase('CONSTRUCT_NOT_FOUND', { error: getError });
          construct = null;
        }

        if (construct) {
          setThreadState(prev => ({
            ...prev,
            ltmAvailable: true,
            readiness: {
              ...prev.readiness,
              constructReady: true
            }
          }));
          logPhase('CONSTRUCT_READY');
        } else {
          // Create default construct with comprehensive error handling
          try {
            await browserConstructRegistry.registerConstruct({
              id: constructId,
              name: 'Default Chatty Construct',
              description: 'Default construct for Chatty conversations',
              roleLock: {
                allowedRoles: ['assistant', 'helper', 'companion'],
                prohibitedRoles: ['admin', 'system'],
                contextBoundaries: ['conversational', 'helpful'],
                behaviorConstraints: ['be helpful', 'be respectful', 'maintain context']
              },
              legalDocSha256: 'default-legal-doc-hash',
              fingerprint: 'default-fingerprint'
            });
            
            setThreadState(prev => ({
              ...prev,
              ltmAvailable: true,
              readiness: {
                ...prev.readiness,
                constructReady: true
              }
            }));
            logPhase('CONSTRUCT_CREATED');
          } catch (registerError) {
            const error = `Failed to register construct: ${registerError}`;
            logPhase('CONSTRUCT_CREATION_FAILED', { error });
            setThreadState(prev => ({
              ...prev,
              ltmAvailable: false,
              readiness: {
                ...prev.readiness,
                constructReady: false,
                initializationError: error
              }
            }));
          }
        }
      } catch (error) {
        const errorMessage = `System initialization failed: ${error}`;
        logPhase('BOOTSTRAP_CRITICAL_FAILURE', { error });
        setThreadState(prev => ({
          ...prev,
          ltmAvailable: false,
          readiness: {
            ...prev.readiness,
            constructReady: false,
            bufferReady: false,
            initializationError: errorMessage
          }
        }));
      }
    };

    // Wrap initialization in additional safety
    try {
      initializeConstruct();
    } catch (error) {
      logPhase('BOOTSTRAP_WRAPPER_FAILURE', { error });
      setThreadState(prev => ({
        ...prev,
        readiness: {
          ...prev.readiness,
          initializationError: `Critical failure during initialization: ${error}`
        }
      }));
    }
  }, [constructId]);

  // Phase 2: Auto-acquire thread only when system is ready
  useEffect(() => {
    const systemReady = isConstructReady && isBufferReady;
    const threadReady = threadState.readiness.threadReady;
    
    if (autoAcquireLease && constructId && systemReady && !threadReady) {
      logPhase('AUTO_ACQUIRE_START', { 
        constructReady: isConstructReady, 
        bufferReady: isBufferReady 
      });
      
      acquireThread().catch(error => {
        logPhase('AUTO_ACQUIRE_FAILED', { error });
      });
    }
  }, [constructId, autoAcquireLease, isConstructReady, isBufferReady, threadState.readiness.threadReady]);

  // Phase 3: Set up drift detection only when system is ready
  useEffect(() => {
    const systemReady = isConstructReady && isBufferReady;
    
    if (enableDriftDetection && constructId && systemReady) {
      logPhase('DRIFT_DETECTION_START');
      
      driftCheckIntervalRef.current = setInterval(async () => {
        try {
          await checkForDrift();
        } catch (error) {
          logPhase('DRIFT_CHECK_ERROR', { error });
        }
      }, 60000); // Check every minute

      return () => {
        if (driftCheckIntervalRef.current) {
          clearInterval(driftCheckIntervalRef.current);
          logPhase('DRIFT_DETECTION_STOP');
        }
      };
    }
  }, [constructId, enableDriftDetection, isConstructReady, isBufferReady]);

  // Acquire thread
  const acquireThread = useCallback(async () => {
    if (!isConstructReady || !isBufferReady) {
      const error = 'Cannot acquire thread: system not ready';
      logPhase('ACQUIRE_BLOCKED', { 
        constructReady: isConstructReady, 
        bufferReady: isBufferReady 
      });
      throw new Error(error);
    }

    try {
      const threadId = `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      setThreadState(prev => ({
        ...prev,
        threadId,
        isActive: true,
        lastActivity: Date.now(),
        readiness: {
          ...prev.readiness,
          threadReady: true
        }
      }));

      // Load STM messages
      await loadSTMMessages(threadId);
      
      logPhase('THREAD_ACQUIRED', { threadId });
      return threadId;
    } catch (error) {
      logPhase('THREAD_ACQUIRE_FAILED', { error });
      setThreadState(prev => ({
        ...prev,
        readiness: {
          ...prev.readiness,
          threadReady: false
        }
      }));
      throw error;
    }
  }, [constructId, isConstructReady, isBufferReady]);

  // Release thread
  const releaseThread = useCallback(async () => {
    try {
      setThreadState(prev => ({
        ...prev,
        threadId: null,
        isActive: false,
        stmMessages: [],
        readiness: {
          ...prev.readiness,
          threadReady: false
        }
      }));
      
      logPhase('THREAD_RELEASED');
    } catch (error) {
      logPhase('THREAD_RELEASE_FAILED', { error });
    }
  }, [constructId]);

  // Add message to STM
  const addMessage = useCallback(async (message: MessagePacket) => {
    if (!threadState.threadId || !threadState.readiness.threadReady) {
      const error = 'Cannot add message: no active thread or thread not ready';
      logPhase('ADD_MESSAGE_BLOCKED', { 
        hasThreadId: !!threadState.threadId,
        threadReady: threadState.readiness.threadReady
      });
      throw new Error(error);
    }

    if (!isSystemReady) {
      const error = 'Cannot add message: system not ready';
      logPhase('ADD_MESSAGE_SYSTEM_NOT_READY', { 
        constructReady: isConstructReady,
        bufferReady: isBufferReady
      });
      throw new Error(error);
    }

    try {
      // Add to STM buffer
      browserStmBuffer.addMessage(constructId, threadState.threadId, message);
      
      // Update STM messages
      await loadSTMMessages(threadState.threadId);
      
      setThreadState(prev => ({
        ...prev,
        lastActivity: Date.now()
      }));

      logPhase('MESSAGE_ADDED', { messageId: message.id });
    } catch (error) {
      logPhase('ADD_MESSAGE_FAILED', { error, messageId: message.id });
      throw error;
    }
  }, [constructId, threadState.threadId, threadState.readiness.threadReady, isSystemReady]);

  // Load STM messages
  const loadSTMMessages = useCallback(async (threadId: string) => {
    if (!isSystemReady) {
      logPhase('LOAD_STM_BLOCKED', { 
        threadId: threadId.slice(0, 8),
        systemReady: isSystemReady 
      });
      return; // Graceful degradation
    }

    try {
      const messages = browserStmBuffer.getWindow(constructId, threadId, stmWindowSize);
      setThreadState(prev => ({
        ...prev,
        stmMessages: messages
      }));
      logPhase('STM_LOADED', { 
        threadId: threadId.slice(0, 8),
        messageCount: messages.length 
      });
    } catch (error) {
      logPhase('STM_LOAD_FAILED', { error, threadId: threadId.slice(0, 8) });
    }
  }, [constructId, stmWindowSize, isSystemReady]);

  // Search LTM (simplified - just search STM for now)
  const searchLTM = useCallback(async (query: string, _options: any = {}) => {
    try {
      // For now, just search through STM messages
      const messages = threadState.stmMessages.filter(msg => 
        msg.content.toLowerCase().includes(query.toLowerCase())
      );
      
      return messages.map(msg => ({
        id: msg.id,
        constructId,
        threadId: threadState.threadId,
        kind: 'LTM',
        payload: msg,
        timestamp: msg.timestamp,
        relevanceScore: 1.0
      }));
    } catch (error) {
      console.error('Failed to search LTM:', error);
      throw error;
    }
  }, [constructId, threadState.threadId, threadState.stmMessages]);

  // Check for drift (simplified)
  const checkForDrift = useCallback(async () => {
    try {
      // Simplified drift detection - just check if construct exists
      const construct = await browserConstructRegistry.getConstruct(constructId);
      if (!construct) {
        setThreadState(prev => ({
          ...prev,
          driftDetected: true,
          lastDriftScore: 1.0
        }));
        
        console.warn(`🚨 Drift detected for construct ${constructId}: construct not found`);
      }
    } catch (error) {
      console.error('Failed to check for drift:', error);
    }
  }, [constructId]);

  // Get thread info
  const getThreadInfo = useCallback(async (): Promise<ThreadInfo | null> => {
    if (!threadState.threadId) {
      return null;
    }
    
    return {
      id: threadState.threadId,
      constructId,
      title: `Thread ${threadState.threadId.slice(0, 8)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isActive: threadState.isActive
    };
  }, [constructId, threadState.threadId, threadState.isActive]);

  // Get all threads for construct
  const getAllThreads = useCallback(async (): Promise<ThreadInfo[]> => {
    try {
      // For browser version, just return current thread
      if (threadState.threadId) {
        const threadInfo = await getThreadInfo();
        return threadInfo ? [threadInfo] : [];
      }
      return [];
    } catch (error) {
      console.error('Failed to get threads:', error);
      return [];
    }
  }, [constructId, threadState.threadId, getThreadInfo]);

  // Update thread title
  const updateThreadTitle = useCallback(async (title: string) => {
    if (!threadState.threadId) {
      throw new Error('No active thread');
    }
    
    console.log(`📝 Updated thread title: ${threadState.threadId} -> ${title}`);
  }, [threadState.threadId]);

  // Get STM statistics
  const getSTMStats = useCallback(() => {
    if (!threadState.threadId || !isSystemReady) {
      logPhase('STM_STATS_UNAVAILABLE', { 
        hasThread: !!threadState.threadId,
        systemReady: isSystemReady 
      });
      return null;
    }
    
    return browserStmBuffer.getStats(constructId, threadState.threadId);
  }, [constructId, threadState.threadId, isSystemReady]);

  // Get LTM statistics (simplified)
  const getLTMStats = useCallback(async () => {
    try {
      return {
        totalEntries: threadState.stmMessages.length,
        entriesByKind: { 'LTM': threadState.stmMessages.length },
        totalSummaries: 0,
        oldestEntry: threadState.stmMessages[0]?.timestamp,
        newestEntry: threadState.stmMessages[threadState.stmMessages.length - 1]?.timestamp
      };
    } catch (error) {
      console.error('Failed to get LTM stats:', error);
      return null;
    }
  }, [threadState.stmMessages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (driftCheckIntervalRef.current) {
        clearInterval(driftCheckIntervalRef.current);
      }
    };
  }, []);

  return {
    threadState,
    // Core thread management
    acquireThread,
    releaseThread,
    addMessage,
    
    // Memory operations
    searchLTM,
    loadSTMMessages,
    
    // Monitoring and diagnostics
    checkForDrift,
    getSTMStats,
    getLTMStats,
    
    // Thread metadata
    getThreadInfo,
    getAllThreads,
    updateThreadTitle,
    
    // System readiness indicators
    isReady: isSystemReady,
    readinessState: threadState.readiness,
    
    // Debug utilities
    logPhase
  };
}
