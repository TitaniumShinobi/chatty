// useThread: React hook for thread management and memory access
// Provides STM/LTM access and thread state management

import { useState, useEffect, useCallback, useRef } from 'react';
import { threadManager, ThreadInfo } from '../core/thread/SingletonThreadManager';
import { constructRegistry } from '../state/constructs';
import { stmBuffer, MessagePacket } from '../core/memory/STMBuffer';
import { VaultStore } from '../core/vault/VaultStore';
import { fingerprintDetector } from '../utils/fingerprint';
// Browser-compatible fallbacks
import { browserStmBuffer, MessagePacket as BrowserMessagePacket } from '../core/memory/BrowserSTMBuffer';
import { browserConstructRegistry } from '../state/BrowserConstructs';

export interface ThreadState {
  constructId: string;
  threadId: string | null;
  leaseToken: string | null;
  isActive: boolean;
  lastActivity: number;
  stmMessages: MessagePacket[];
  ltmAvailable: boolean;
  driftDetected: boolean;
  lastDriftScore: number;
}

export interface UseThreadOptions {
  constructId: string;
  autoAcquireLease?: boolean;
  leaseDuration?: number;
  stmWindowSize?: number;
  enableDriftDetection?: boolean;
}

export function useThread(options: UseThreadOptions) {
  const {
    constructId,
    autoAcquireLease = true,
    leaseDuration = 300000, // 5 minutes
    stmWindowSize = 50,
    enableDriftDetection = true
  } = options;

  const [threadState, setThreadState] = useState<ThreadState>({
    constructId,
    threadId: null,
    leaseToken: null,
    isActive: false,
    lastActivity: 0,
    stmMessages: [],
    ltmAvailable: false,
    driftDetected: false,
    lastDriftScore: 0
  });

  const vaultStoreRef = useRef<VaultStore | null>(null);
  const driftCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize construct and vault store
  useEffect(() => {
    const initializeConstruct = async () => {
      try {
        const construct = await constructRegistry.getConstruct(constructId);
        if (construct) {
          vaultStoreRef.current = construct.vaultStore;
          setThreadState(prev => ({
            ...prev,
            ltmAvailable: true
          }));
        }
      } catch (error) {
        console.error('Failed to initialize construct:', error);
      }
    };

    initializeConstruct();
  }, [constructId]);

  // Auto-acquire lease if enabled
  useEffect(() => {
    if (autoAcquireLease && constructId) {
      acquireLease();
    }
  }, [constructId, autoAcquireLease]);

  // Set up drift detection
  useEffect(() => {
    if (enableDriftDetection && constructId) {
      driftCheckIntervalRef.current = setInterval(async () => {
        await checkForDrift();
      }, 60000); // Check every minute

      return () => {
        if (driftCheckIntervalRef.current) {
          clearInterval(driftCheckIntervalRef.current);
        }
      };
    }
  }, [constructId, enableDriftDetection]);

  // Acquire lease for a thread
  const acquireLease = useCallback(async (threadId?: string) => {
    try {
      let targetThreadId = threadId;
      
      if (!targetThreadId) {
        // Get or create a thread
        const activeThread = threadManager.getActiveThread(constructId);
        if (activeThread) {
          targetThreadId = activeThread.id;
        } else {
          const newThread = await threadManager.createThread(constructId);
          targetThreadId = newThread.id;
        }
      }

      const leaseToken = await threadManager.acquireLease(constructId, targetThreadId, leaseDuration);
      
      setThreadState(prev => ({
        ...prev,
        threadId: targetThreadId,
        leaseToken,
        isActive: true,
        lastActivity: Date.now()
      }));

      // Load STM messages
      await loadSTMMessages(targetThreadId);
      
      console.log(`🔐 Acquired lease for thread: ${targetThreadId}`);
      return leaseToken;
    } catch (error) {
      console.error('Failed to acquire lease:', error);
      throw error;
    }
  }, [constructId, leaseDuration]);

  // Release lease
  const releaseLease = useCallback(async () => {
    try {
      if (threadState.leaseToken) {
        await threadManager.releaseLease(constructId, threadState.leaseToken);
      }
      
      setThreadState(prev => ({
        ...prev,
        threadId: null,
        leaseToken: null,
        isActive: false,
        stmMessages: []
      }));
      
      console.log(`🔓 Released lease for construct: ${constructId}`);
    } catch (error) {
      console.error('Failed to release lease:', error);
    }
  }, [constructId, threadState.leaseToken]);

  // Add message to STM
  const addMessage = useCallback(async (message: MessagePacket) => {
    if (!threadState.threadId) {
      throw new Error('No active thread');
    }

    try {
      // Add to STM buffer
      stmBuffer.addMessage(constructId, threadState.threadId, message);
      
      // Save to LTM vault
      if (vaultStoreRef.current) {
        await vaultStoreRef.current.saveMessage(threadState.threadId, message);
      }
      
      // Update STM messages
      await loadSTMMessages(threadState.threadId);
      
      setThreadState(prev => ({
        ...prev,
        lastActivity: Date.now()
      }));
    } catch (error) {
      console.error('Failed to add message:', error);
      throw error;
    }
  }, [constructId, threadState.threadId]);

  // Load STM messages
  const loadSTMMessages = useCallback(async (threadId: string) => {
    try {
      const messages = stmBuffer.getWindow(constructId, threadId, stmWindowSize);
      setThreadState(prev => ({
        ...prev,
        stmMessages: messages
      }));
    } catch (error) {
      console.error('Failed to load STM messages:', error);
    }
  }, [constructId, stmWindowSize]);

  // Search LTM
  const searchLTM = useCallback(async (query: string, options: any = {}) => {
    if (!vaultStoreRef.current) {
      throw new Error('Vault store not available');
    }

    try {
      return await vaultStoreRef.current.search({
        constructId,
        threadId: threadState.threadId,
        ...options
      });
    } catch (error) {
      console.error('Failed to search LTM:', error);
      throw error;
    }
  }, [constructId, threadState.threadId]);

  // Check for drift
  const checkForDrift = useCallback(async () => {
    try {
      const drift = await fingerprintDetector.detectDrift(constructId);
      if (drift) {
        setThreadState(prev => ({
          ...prev,
          driftDetected: true,
          lastDriftScore: drift.driftScore
        }));
        
        console.warn(`🚨 Drift detected for construct ${constructId}:`, drift);
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
    
    return threadManager.getActiveThread(constructId);
  }, [constructId, threadState.threadId]);

  // Get all threads for construct
  const getAllThreads = useCallback(async (): Promise<ThreadInfo[]> => {
    return await threadManager.getThreads(constructId);
  }, [constructId]);

  // Update thread title
  const updateThreadTitle = useCallback(async (title: string) => {
    if (!threadState.threadId) {
      throw new Error('No active thread');
    }
    
    await threadManager.updateThreadTitle(threadState.threadId, title);
  }, [threadState.threadId]);

  // Get STM statistics
  const getSTMStats = useCallback(() => {
    if (!threadState.threadId) {
      return null;
    }
    
    return stmBuffer.getStats(constructId, threadState.threadId);
  }, [constructId, threadState.threadId]);

  // Get LTM statistics
  const getLTMStats = useCallback(async () => {
    if (!vaultStoreRef.current) {
      return null;
    }
    
    return await vaultStoreRef.current.getStats();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (threadState.leaseToken) {
        threadManager.releaseLease(constructId, threadState.leaseToken);
      }
      if (driftCheckIntervalRef.current) {
        clearInterval(driftCheckIntervalRef.current);
      }
    };
  }, [constructId, threadState.leaseToken]);

  return {
    threadState,
    acquireLease,
    releaseLease,
    addMessage,
    searchLTM,
    checkForDrift,
    getThreadInfo,
    getAllThreads,
    updateThreadTitle,
    getSTMStats,
    getLTMStats,
    loadSTMMessages
  };
}
