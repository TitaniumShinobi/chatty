import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { fetchMe, logout, getUserId, type User } from '../lib/auth'
import { VVAULTConversationManager, type ConversationThread } from '../lib/vvaultConversationManager'
import StorageFailureFallback from './StorageFailureFallback'
import { ThemeProvider } from '../lib/ThemeContext'
import { Z_LAYERS } from '../lib/zLayers'
// icons not needed here after Sidebar is used
import SearchPopup from './SearchPopup'
import Sidebar from './Sidebar'
import SettingsModal from './SettingsModal'
import ProjectsModal from './ProjectsModal'
import ShareConversationModal from './ShareConversationModal'
import RuntimeDashboard, { type RuntimeDashboardOption } from './RuntimeDashboard'
import SynthGuidance from './SynthGuidance'
import { useSynthGuidance } from '../hooks/useSynthGuidance'
import { GPTService } from '../lib/gptService'
import type { UIContextSnapshot, Message as ChatMessage } from '../types'

type Message = {
  id: string
  role: 'user' | 'assistant'
  text?: string
  packets?: import('../types').AssistantPacket[]
  ts: number
  files?: { name: string; size: number; type?: string }[]
  typing?: boolean  // For typing indicators
  responseTimeMs?: number
  thinkingLog?: string[]
  metadata?: {
    responseTimeMs?: number
    thinkingLog?: string[]
  }
}
type Thread = {
  id: string;
  title: string;
  messages: Message[];
  createdAt?: number;
  updatedAt?: number;
  archived?: boolean;
  isCanonical?: boolean;
  canonicalForRuntime?: string;
  constructId?: string | null;
  runtimeId?: string | null;
  isPrimary?: boolean;
  importMetadata?: any;
}

// VVAULT root path - matches backend config
// Backend uses: /Users/devonwoodson/Documents/GitHub/vvault (lowercase)
// Files are stored at: vvault/users/shard_0000/{userId}/constructs/{constructId}/chatty/
const VVAULT_FILESYSTEM_ROOT = '/Users/devonwoodson/Documents/GitHub/vvault';
const SELECTED_RUNTIME_STORAGE_KEY = 'chatty:selectedRuntime';
const DEFAULT_SYNTH_RUNTIME: RuntimeDashboardOption = {
  key: 'synth',
  runtimeId: 'synth',
  name: 'Chatty',
  provider: 'Chatty',
  metadata: { isCore: true, constructId: 'synth' }
};
const PRIMARY_SYNTH_THREAD_ID = 'synth-001_chat_with_synth-001';

function mapChatMessageToThreadMessage(message: ChatMessage): Message | null {
  const parsedTs = message.timestamp ? Date.parse(message.timestamp) : NaN
  const ts = Number.isFinite(parsedTs) ? parsedTs : Date.now()
  const mapFiles = (files?: File[]) =>
    (files ?? []).map(file => ({
      name: file.name,
      size: file.size,
      type: file.type
    }))

  switch (message.role) {
    case 'user':
      return {
        id: message.id,
        role: 'user',
        text: message.content,
        ts,
        files: mapFiles(message.files)
      }
    case 'assistant': {
      const packets =
        message.content && message.content.length > 0
          ? message.content
          : [{ op: 'answer.v1', payload: { content: '' } } as import('../types').AssistantPacket]

      return {
        id: message.id,
        role: 'assistant',
        packets,
        ts,
        files: mapFiles(message.files),
        responseTimeMs: message.metadata?.responseTimeMs,
        thinkingLog: message.metadata?.thinkingLog,
        metadata: message.metadata
      }
    }
    case 'system':
      return {
        id: message.id,
        role: 'assistant',
        packets: [{ op: 'answer.v1', payload: { content: message.content } }],
        ts
      }
    default:
      return null
  }
}

export default function Layout() {
  const {
    currentStep,
    currentStepIndex,
    totalSteps,
    isVisible: isGuidanceVisible,
    nextStep,
    previousStep,
    hide: hideGuidance
  } = useSynthGuidance()
  
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  
  const [threads, setThreads] = useState<Thread[]>([])
  const threadsRef = useRef<Thread[]>([])
  const [storageFailureInfo, setStorageFailureInfo] = useState<{ reason: string; key?: string; sizeBytes?: number } | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isProjectsOpen, setIsProjectsOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [showRuntimeDashboard, setShowRuntimeDashboard] = useState(false)
  const [runtimes, setRuntimes] = useState<RuntimeDashboardOption[]>([])
  const [isLoadingRuntimes, setIsLoadingRuntimes] = useState(false)
  const [shareConversationId, setShareConversationId] = useState<string | null>(null)
  const [vvaultError, setVvaultError] = useState<string | null>(null)
  const [selectedRuntime, setSelectedRuntime] = useState<RuntimeDashboardOption | null>(null)
  const pendingStarterRef = useRef<{ threadId: string; starter: string; files: File[] } | null>(null)
  const hasAuthenticatedRef = useRef(false)
  const initialPathRef = useRef(location.pathname)
  const runtimeInitializedRef = useRef(false)
  const runtimeReloadTokenRef = useRef(0)
  const runtimesRef = useRef<RuntimeDashboardOption[]>([])
  const activeThreadIdRef = useRef<string | null>(null)

  // Save conversation state before page unload (prevents data loss on HMR reloads)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Save current threads to localStorage before page unload
      // Don't prevent navigation - just save silently
      if (threads.length > 0 && user) {
        try {
          const userId = user.sub || user.id || user.email;
          const storageKey = `chatty:threads:${userId}`;
          // Use synchronous localStorage to ensure it completes before unload
          localStorage.setItem(storageKey, JSON.stringify(threads));
          // Don't log - it can interfere with refresh
        } catch (error) {
          // Silently fail - don't prevent refresh
        }
      }
    };

    const handleVisibilityChange = () => {
      // Also save when page becomes hidden (more reliable than beforeunload)
      if (document.visibilityState === 'hidden' && threads.length > 0 && user) {
        try {
          const userId = user.sub || user.id || user.email;
          const storageKey = `chatty:threads:${userId}`;
          localStorage.setItem(storageKey, JSON.stringify(threads));
          console.log('💾 [Layout] Saved conversations on visibility change');
        } catch (error) {
          console.error('❌ [Layout] Failed to save conversations on visibility change:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [threads, user]);

  const persistSelectedRuntime = useCallback((runtime: RuntimeDashboardOption | null) => {
    if (typeof window === 'undefined') return;
    if (!runtime) {
      window.localStorage.removeItem(SELECTED_RUNTIME_STORAGE_KEY);
      return;
    }

    try {
      const payload = {
        key: runtime.key || runtime.runtimeId,
        runtimeId: runtime.runtimeId,
        name: runtime.name,
        description: runtime.description ?? null,
        provider: runtime.provider ?? null,
        metadata: runtime.metadata || {}
      };
      window.localStorage.setItem(SELECTED_RUNTIME_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('⚠️ [Layout] Failed to persist runtime selection:', error);
    }
  }, []);

  const restoreSelectedRuntime = useCallback((): RuntimeDashboardOption | null => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = window.localStorage.getItem(SELECTED_RUNTIME_STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (!parsed?.runtimeId) return null;
      return {
        key: parsed.key || parsed.runtimeId,
        runtimeId: parsed.runtimeId,
        name: parsed.name || 'Imported Runtime',
        description: parsed.description || undefined,
        provider: parsed.provider || undefined,
        metadata: parsed.metadata || {}
      };
    } catch (error) {
      console.warn('⚠️ [Layout] Failed to restore runtime selection:', error);
      return null;
    }
  }, []);
  
  useEffect(() => {
    console.log('📚 [Layout.tsx] Threads updated (length):', threads.length);
  }, [threads])
  
  // Reload conversations when runtime changes
  const reloadConversationsForRuntime = useCallback(async (runtime: RuntimeDashboardOption | null): Promise<Thread[]> => {
    if (!user || !runtime) return [];
    const reloadToken = ++runtimeReloadTokenRef.current;
    
    try {
      console.log('🔄 [Layout] Reloading conversations for runtime:', runtime.runtimeId);
      const conversationManager = VVAULTConversationManager.getInstance();
      const userId = getUserId(user);
      const vvaultUserId = (user as any).email || userId;
      
      // Get constructId for this runtime
      const constructId = getConstructIdFromRuntime(runtime);
      const normalizedConstructBase = normalizeConstructKey(constructId);
      console.log('🔵 [Layout] Loading conversations for constructId:', constructId);
      
      // Load all conversations
      const allConversations = await conversationManager.loadAllConversations(vvaultUserId);
      
      // Filter conversations by constructId (check sessionId, metadata, or title)
      console.log(`🔍 [Layout] Filtering ${allConversations.length} conversations for runtime:`, {
        runtimeId: runtime.runtimeId,
        constructId,
        normalizedConstructBase,
        runtimeMetadata: runtime.metadata
      });
      
      const runtimeConversations = allConversations.filter(conv => {
        const sessionIdRaw = conv.sessionId || '';
        const sessionPrefix = sessionIdRaw.split('_')[0] || '';
        const normalizedSessionConstruct = normalizeConstructKey(sessionPrefix);
        const importConstruct = normalizeConstructKey((conv as any).importMetadata?.constructId);
        // CRITICAL: Check constructId field directly (added in readConversations.js)
        const convConstructId = normalizeConstructKey((conv as any).constructId);
        const title = (conv.title || '').toLowerCase();
        const runtimeIdMatch = runtime.runtimeId ? sessionIdRaw.toLowerCase().includes(runtime.runtimeId.toLowerCase()) : false;
        const matchesConstructFolder = normalizedConstructBase && normalizedSessionConstruct === normalizedConstructBase;
        const matchesImportMetadata = normalizedConstructBase && importConstruct === normalizedConstructBase;
        // NEW: Direct constructId match (most reliable)
        const matchesConstructId = normalizedConstructBase && convConstructId && convConstructId === normalizedConstructBase;
        // CRITICAL: Explicit Synth match - if conversation is synth and runtime is Synth, always match
        const isSynthConversation = (convConstructId === 'synth' || (conv as any).constructId === 'synth') && 
                                    (normalizedConstructBase === 'synth' || constructId === 'synth' || runtime.runtimeId === 'synth');
        const matchesTitle = normalizedConstructBase ? title.includes(normalizedConstructBase) : false;
        const fallbackMatch = !normalizedConstructBase && runtimeIdMatch;
        
        const matches = isSynthConversation || matchesConstructId || matchesConstructFolder || matchesImportMetadata || runtimeIdMatch || matchesTitle || fallbackMatch;
        
        // Debug logging for first few conversations
        if (allConversations.indexOf(conv) < 3) {
          console.log(`🔍 [Layout] Conversation "${conv.title}":`, {
            sessionId: sessionIdRaw,
            constructId: (conv as any).constructId,
            sessionPrefix,
            normalizedSessionConstruct,
            convConstructId,
            importConstruct,
            isSynthConversation,
            matchesConstructId,
            matchesConstructFolder,
            matchesImportMetadata,
            runtimeIdMatch,
            matchesTitle,
            matches
          });
        }
        
        return matches;
      });
      
      console.log(`✅ [Layout] Found ${runtimeConversations.length} conversations for runtime ${runtime.runtimeId} (out of ${allConversations.length} total)`);
      
      // Map to Thread format
      const loadedThreads: Thread[] = runtimeConversations.map(conv => {
        let normalizedTitle = conv.title || runtime.name || 'New conversation';
        normalizedTitle = normalizedTitle.replace(/^Chat with /i, '');
        normalizedTitle = normalizedTitle.replace(/-\d{3,}$/i, '');

        const convConstructId = (conv as any).constructId || constructId;
        const convRuntimeId =
          (conv as any).runtimeId ||
          convConstructId?.replace(/-001$/, '') ||
          runtime.runtimeId;
        const convIsPrimary = (conv as any).isPrimary === true;
        const isCanonicalForRuntime = convIsPrimary && convConstructId === constructId;
        const canonicalForRuntime = isCanonicalForRuntime ? runtime.runtimeId : undefined;
        
        return {
          id: conv.sessionId,
          title: normalizedTitle,
          messages: conv.messages.map(msg => ({
            id: msg.id,
            role: msg.role,
            text: msg.content,
            packets: msg.role === 'assistant' ? [{ op: 'answer.v1', payload: { content: msg.content } }] : undefined,
            ts: new Date(msg.timestamp).getTime()
          })),
          createdAt: conv.messages.length > 0 ? new Date(conv.messages[0].timestamp).getTime() : Date.now(),
          updatedAt: conv.messages.length > 0 ? new Date(conv.messages[conv.messages.length - 1].timestamp).getTime() : Date.now(),
          archived: false,
          importMetadata: (conv as any).importMetadata || null,
          constructId: convConstructId || null,
          runtimeId: convRuntimeId || null,
          isPrimary: convIsPrimary,
          isCanonical: isCanonicalForRuntime,
          canonicalForRuntime
        };
      });
      
      if (runtimeReloadTokenRef.current !== reloadToken) {
        console.log('⚠️ [Layout] Ignoring stale runtime reload for', runtime.runtimeId);
        return threadsRef.current;
      }
      
      // PER SYNTH_CANONICAL_IMPLEMENTATION: Merge with existing canonical threads
      let mergedResult: Thread[] = [];
      setThreads(prevThreads => {
        const canonicalThreads = prevThreads.filter(
          t => t.isCanonical && t.constructId === constructId
        );
        const mergedMap = new Map<string, Thread>();
        
        // Preserve canonical threads
        canonicalThreads.forEach(t => mergedMap.set(t.id, t));
        
        // Add loaded threads, but if a canonical Synth exists, merge messages into it
        loadedThreads.forEach(loaded => {
          const existingCanonical = Array.from(mergedMap.values()).find(
            t => t.isCanonical && t.constructId === constructId
          );
          
          console.log('🔄 [Layout] Checking merge for loaded thread:', {
            loadedId: loaded.id,
            loadedTitle: loaded.title,
            loadedMessageCount: loaded.messages.length,
            existingCanonicalId: existingCanonical?.id,
            existingCanonicalMessageCount: existingCanonical?.messages?.length || 0,
            idsMatch: existingCanonical && loaded.id === existingCanonical.id
          });
          
          if (existingCanonical && loaded.id === existingCanonical.id) {
            // Merge VVAULT messages into canonical Synth
            console.log('✅ [Layout] Merging VVAULT messages into canonical Synth:', {
              before: existingCanonical.messages.length,
              after: loaded.messages.length
            });
            mergedMap.set(existingCanonical.id, {
              ...existingCanonical,
              messages: loaded.messages.length > 0 ? loaded.messages : existingCanonical.messages,
              updatedAt: loaded.updatedAt || existingCanonical.updatedAt,
              isCanonical: true,
              canonicalForRuntime: runtime.runtimeId,
              constructId: constructId
            });
          } else {
            mergedMap.set(loaded.id, loaded);
          }
        });
        
        // Ensure canonical Synth exists only when Synth runtime is active
        const hasCanonicalForRuntime = Array.from(mergedMap.values()).some(
          t => t.isCanonical && t.constructId === constructId
        );
        if (!hasCanonicalForRuntime && constructId === 'synth') {
          const canonicalSynth: Thread = {
            id: 'synth-001_chat_with_synth-001',
            title: 'Synth',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            archived: false,
            isCanonical: true,
            canonicalForRuntime: 'synth',
            constructId: 'synth',
            runtimeId: 'synth',
            isPrimary: true
          };
          mergedMap.set(canonicalSynth.id, canonicalSynth);
        }
        
        const merged = Array.from(mergedMap.values());
        // Sort: canonical first, then by updatedAt
        merged.sort((a, b) => {
          if (a.isCanonical && !b.isCanonical) return -1;
          if (!a.isCanonical && b.isCanonical) return 1;
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
        
        mergedResult = merged;
        return merged;
      });
      threadsRef.current = mergedResult;
      return mergedResult;
    } catch (error) {
      console.error('❌ [Layout] Failed to reload conversations for runtime:', error);
      return threadsRef.current;
    }
  }, [user])

  const findCanonicalThreadForRuntime = useCallback(
    (runtime: RuntimeDashboardOption | null, threadList?: Thread[]): Thread | undefined => {
      if (!runtime) return undefined
      const runtimeConstructId = getConstructIdFromRuntime(runtime)
      const list = threadList && threadList.length > 0 ? threadList : threadsRef.current
      return list.find(thread => thread.isCanonical && thread.constructId === runtimeConstructId)
    },
    []
  )

  const ensureCanonicalThreadForRuntime = useCallback(
    async (runtime: RuntimeDashboardOption | null, candidateThreads?: Thread[]): Promise<Thread | null> => {
      if (!runtime) return null
      const existing = findCanonicalThreadForRuntime(runtime, candidateThreads)
      if (existing) return existing
      const constructId = getConstructIdFromRuntime(runtime)
      console.log(`⚠️ [Layout] No canonical conversation for runtime ${runtime.runtimeId}; requesting creation...`)
      try {
        const response = await fetch('/api/vvault/create-canonical', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            constructId,
            provider: runtime.provider || runtime.name || runtime.runtimeId,
            runtimeId: runtime.runtimeId
          })
        })
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new Error(text || `Failed to create canonical conversation (${response.status})`)
        }
        await response.json().catch(() => ({}))
        const reloaded = await reloadConversationsForRuntime(runtime)
        return findCanonicalThreadForRuntime(runtime, reloaded)
      } catch (error) {
        console.error('❌ [Layout] Failed to ensure canonical conversation:', error)
        return null
      }
    },
    [findCanonicalThreadForRuntime, reloadConversationsForRuntime]
  )

  const navigateToCanonicalThread = useCallback(
    async (runtime: RuntimeDashboardOption | null, candidateThreads?: Thread[]) => {
      const canonical = await ensureCanonicalThreadForRuntime(runtime, candidateThreads)
      if (canonical && activeThreadIdRef.current !== canonical.id) {
        console.log(`📍 [Layout] Navigating to canonical conversation for ${runtime?.runtimeId}: ${canonical.id}`)
        navigate(`/app/chat/${canonical.id}`)
      }
      return canonical
    },
    [ensureCanonicalThreadForRuntime, navigate]
  )

  const applyRuntimeSelection = useCallback(async (runtime: RuntimeDashboardOption, options?: { persist?: boolean; skipReload?: boolean }) => {
    if (!runtime) return;
    console.log(`🔵 [Layout] Applying runtime selection: ${runtime.runtimeId} (skipReload: ${options?.skipReload})`);
    setSelectedRuntime(runtime);

    // Set AIService runtime mode (Lin for imported runtimes, Synth for core)
    try {
      const { AIService } = await import('../lib/aiService');
      const aiService = AIService.getInstance();
      const isImported = runtime.metadata?.isImported || runtime.runtimeId !== 'synth';
      const mode = isImported ? 'lin' : 'synth';
      aiService.setRuntime(runtime.runtimeId, mode);
      console.log(`🔵 [Layout] Set AIService runtime to: ${runtime.runtimeId} (mode: ${mode}, imported: ${isImported})`);
    } catch (error) {
      console.warn('⚠️ Failed to set AIService runtime:', error);
    }

    if (options?.persist !== false) {
      persistSelectedRuntime(runtime);
    }

    let latestThreads: Thread[] | undefined
    if (!options?.skipReload) {
      try {
        console.log(`🔄 [Layout] Loading conversations for runtime: ${runtime.runtimeId}`);
        latestThreads = await reloadConversationsForRuntime(runtime);
      } catch (error) {
        console.error('❌ [Layout] Failed to reload conversations for runtime selection:', error);
      }
    } else {
      console.log(`⏭️ [Layout] Skipping conversation reload for ${runtime.runtimeId}`);
    }

    await navigateToCanonicalThread(runtime, latestThreads)
  }, [persistSelectedRuntime, reloadConversationsForRuntime, navigateToCanonicalThread])
  
  useEffect(() => {
    if (!user || runtimeInitializedRef.current) return;
    runtimeInitializedRef.current = true;
    const restoredRuntime = restoreSelectedRuntime();
    const runtimeToApply = restoredRuntime || DEFAULT_SYNTH_RUNTIME;
    console.log(`🚀 [Layout] Initializing runtime: ${runtimeToApply.runtimeId} (restored: ${!!restoredRuntime})`);
    // CRITICAL: This will call reloadConversationsForRuntime which loads conversations
    // Do NOT skip reload - we need conversations to load on startup
    void applyRuntimeSelection(runtimeToApply, { persist: !restoredRuntime, skipReload: false });
  }, [user, restoreSelectedRuntime, applyRuntimeSelection])
  
  const activeId = useMemo(() => {
    const match = location.pathname.match(/^\/app\/chat\/(.+)$/)
    return match ? match[1] : null
  }, [location.pathname])
  useEffect(() => {
    activeThreadIdRef.current = activeId
  }, [activeId])
  const shareConversation = useMemo(
    () => threads.find(thread => thread.id === shareConversationId) || null,
    [threads, shareConversationId]
  )

  useEffect(() => {
    threadsRef.current = threads
  }, [threads])

  // Calculate hasBlockingOverlay early (before any early returns)
  const hasBlockingOverlay =
    isSearchOpen ||
    isProjectsOpen ||
    isSettingsOpen ||
    showRuntimeDashboard ||
    Boolean(shareConversation) ||
    Boolean(storageFailureInfo)

  // Debug logging for overlay state (must be before any conditional returns)
  useEffect(() => {
    console.log('[Layout] hasBlockingOverlay:', hasBlockingOverlay, {
      isSearchOpen,
      isProjectsOpen,
      isSettingsOpen,
      showRuntimeDashboard,
      shareConversation: Boolean(shareConversation),
      storageFailureInfo: Boolean(storageFailureInfo)
    });
  }, [hasBlockingOverlay, isSearchOpen, isProjectsOpen, isSettingsOpen, showRuntimeDashboard, shareConversation, storageFailureInfo])

  function createThread(title = 'New conversation'): Thread {
    const timestamp = Date.now()
    return {
      id: crypto.randomUUID(),
      title,
      messages: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      archived: false
    }
  }

  // Startup health check for storage quota (non-blocking)
  useEffect(() => {
    const nav: any = navigator
    const check = async () => {
      try {
        if (nav.storage && typeof nav.storage.estimate === 'function') {
          const est = await nav.storage.estimate()
          const remaining = (est.quota || 0) - (est.usage || 0)
          // If remaining is less than 200KB, warn the user
          if (remaining < 200 * 1024) {
            // Note: storageFailureCallback is not currently implemented
            // setStorageFailureInfo({ reason: 'low_quota', sizeBytes: remaining })
          }
        }
      } catch (e) {
        // ignore
      }
    }
    check()
  }, [])

  function closeStorageFailure() {
    setStorageFailureInfo(null)
  }

  // Professional conversation saving with fail-safes
  // Save conversations frequently to prevent data loss on HMR reloads
  useEffect(() => {
    if (user && user.sub && threads.length > 0) {
      // Debounce saves to avoid excessive writes, but save frequently enough
      const saveTimeout = setTimeout(() => {
        const conversationManager = VVAULTConversationManager.getInstance();
        conversationManager.saveUserConversations(user, threads)
          .catch((error) => {
            console.error('❌ Failed to save conversations:', error)
          })
      }, 500); // Save 500ms after threads change
      
      return () => clearTimeout(saveTimeout);
    }
  }, [threads, user])

  // Also save to localStorage immediately for HMR resilience
  useEffect(() => {
    if (user && threads.length > 0) {
      try {
        const userId = user.sub || user.id || user.email;
        const storageKey = `chatty:threads:${userId}`;
        localStorage.setItem(storageKey, JSON.stringify(threads));
      } catch (error) {
        console.error('❌ [Layout] Failed to save conversations to localStorage:', error);
      }
    }
  }, [threads, user])

  // Handle authentication - runs once per mount
  useEffect(() => {
    console.log('🔍 [Layout.tsx] Auth effect triggered', { 
      hasUser: !!user, 
      threadsCount: threads.length, 
      refValue: hasAuthenticatedRef.current,
      selectedRuntime: selectedRuntime?.runtimeId || 'none',
      pathname: location.pathname 
    });
    
    // Prevent multiple concurrent runs - check ref FIRST
    if (hasAuthenticatedRef.current) {
      console.log('⏭️ [Layout.tsx] Auth effect already running - skipping duplicate');
      return;
    }

    // Set ref immediately to prevent concurrent runs
    hasAuthenticatedRef.current = true;
    
    // PER SYNTH_CANONICAL_IMPLEMENTATION: Create canonical Synth IMMEDIATELY on login
    // This must happen synchronously, before any async calls
    if (user && threads.length === 0) {
      const canonicalSynthId = `synth-001_chat_with_synth-001`; // Use the actual VVAULT session ID
      const canonicalSynth: Thread = {
        id: canonicalSynthId,
        title: 'Synth',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        archived: false,
        isCanonical: true,
        canonicalForRuntime: 'synth',
        constructId: 'synth',
        runtimeId: 'synth',
        isPrimary: true
      };
      console.log('✨ [Layout.tsx] Creating canonical Synth thread immediately:', canonicalSynthId);
      setThreads([canonicalSynth]); // Set immediately, no async
      threadsRef.current = [canonicalSynth];
    }
    
    // If we already have user AND threads loaded, we can skip loading but still need to ensure state is correct
    if (user && threads.length > 0) {
      console.log('✅ [Layout.tsx] User and threads already loaded - ensuring loading state is cleared');
      setIsLoading(false);
      // Still reset ref so it can run again if needed
      hasAuthenticatedRef.current = false;
      return;
    }
    
    // CRITICAL: Do NOT load conversations here - let runtime initialization handle it
    // The runtime initialization effect calls applyRuntimeSelection which calls reloadConversationsForRuntime
    // This ensures conversations are loaded with the correct runtime filter
    if (user && threads.length === 0) {
      console.log('⏳ [Layout.tsx] User exists but no threads - waiting for runtime initialization to load conversations...');
      // Runtime initialization will load conversations via applyRuntimeSelection -> reloadConversationsForRuntime
      if (!runtimeInitializedRef.current) {
        console.log('⏳ [Layout.tsx] Runtime not initialized yet, waiting...');
        hasAuthenticatedRef.current = false; // Reset so it can run again after runtime init
        return;
      }
      // Runtime is initialized, conversations should be loading via applyRuntimeSelection
      // Don't load here - just wait
      console.log('✅ [Layout.tsx] Runtime initialized, conversations should load via applyRuntimeSelection');
      hasAuthenticatedRef.current = false; // Reset so we can check again if needed
      return;
    }

    let cancelled = false;

    // Safety timeout: ensure loading state is cleared after 10 seconds max
    const safetyTimeout = setTimeout(() => {
      if (!cancelled) {
        console.warn('⚠️ [Layout.tsx] Auth effect timeout - forcing isLoading to false');
        setIsLoading(false);
        hasAuthenticatedRef.current = false; // Reset on timeout to allow retry
      }
    }, 10000);

    (async () => {
      try {
        console.log('🔍 [Layout.tsx] Auth effect starting');
        setIsLoading(true);
        
        // If user already exists, use it; otherwise fetch
        let me = user;
        if (!me) {
          me = await fetchMe();
          console.log('✅ [Layout.tsx] fetchMe() resolved:', me ? `user: ${me.email}` : 'null');
        } else {
          console.log('✅ [Layout.tsx] Using existing user:', me.email);
        }
        
        if (cancelled || !me) {
          hasAuthenticatedRef.current = false;
          if (!cancelled) {
            console.log('🚪 [Layout.tsx] No user session - redirecting to /');
            navigate('/');
            setIsLoading(false);
          }
          return;
        }
        
        // Only set user if it changed
        if (!user || user.email !== me.email) {
          setUser(me);
        }
        
        console.log('📚 [Layout.tsx] Loading conversations from VVAULT filesystem...');
        
        // Try to wait for backend, but don't block - files should be readable
        // The backend API reads files directly, so even if health check fails, the API might work
        try {
          const { waitForBackendReady } = await import('../lib/backendReady');
          // Use shorter timeout - don't wait too long
          await Promise.race([
            waitForBackendReady(3, (attempt) => {
              if (attempt === 1) {
                console.log('⏳ [Layout.tsx] Checking backend readiness...');
              }
            }),
            // Timeout after 2 seconds max - don't block file reading
            new Promise((_, reject) => setTimeout(() => reject(new Error('Backend check timeout')), 2000))
          ]);
          console.log('✅ [Layout.tsx] Backend ready');
        } catch (error) {
          console.warn('⚠️ [Layout.tsx] Backend readiness check failed or timed out, proceeding anyway:', error.message);
          // Continue anyway - the API call will handle its own errors
        }
        
        const conversationManager = VVAULTConversationManager.getInstance();
        const userId = me.sub || me.id || getUserId(me);
        // Use email for VVAULT lookup since user IDs might not match (Chatty uses MongoDB ObjectId, VVAULT uses LIFE format)
        const vvaultUserId = me.email || userId;
        const transcriptsPath = `${VVAULT_FILESYSTEM_ROOT}/users/${userId}/transcripts/`;
        console.log('📁 [Layout.tsx] VVAULT root:', VVAULT_FILESYSTEM_ROOT);
        console.log('📁 [Layout.tsx] User transcripts directory:', transcriptsPath);
        console.log('📁 [Layout.tsx] Using email for VVAULT lookup:', vvaultUserId);
        
        // Load VVAULT conversations with timeout protection (but don't race - wait for actual result)
        let vvaultConversations: any[] = [];
        try {
          const vvaultPromise = conversationManager.loadAllConversations(vvaultUserId);
          
          // Use Promise.race but track which one won
          let timeoutFired = false;
          const timeoutId = setTimeout(() => {
            timeoutFired = true;
            console.warn('⚠️ [Layout.tsx] VVAULT loading timeout after 15s - this is just a warning, waiting for actual result...');
          }, 15000); // Increased to 15s, but don't resolve with empty array
          
          try {
            vvaultConversations = await vvaultPromise;
            clearTimeout(timeoutId); // Cancel timeout if promise resolves first
            if (timeoutFired) {
              console.log('✅ [Layout.tsx] VVAULT loading completed after timeout warning');
            }
          } catch (promiseError) {
            clearTimeout(timeoutId);
            throw promiseError;
          }
        } catch (vvaultError: any) {
          const errorMsg = vvaultError?.message || String(vvaultError);
          console.error('❌ [Layout.tsx] VVAULT loading error:', vvaultError);
          // Expose error to UI so developer/user sees it
          setVvaultError(`VVAULT load failed: ${errorMsg}`);
          // Per rubric: If storage is unavailable, render a local in-memory "Synth" conversation
          // Don't set empty array - let fallback logic below create transient conversation
          vvaultConversations = []; // Empty array triggers fallback to create transient Synth
        }
        console.log('📚 [Layout.tsx] VVAULT returned:', vvaultConversations.length, 'conversations');
        console.log('📚 [Layout.tsx] VVAULT conversation details:', vvaultConversations.map(c => ({ 
          sessionId: c.sessionId, 
          title: c.title, 
          messageCount: c.messages?.length || 0 
        })));
        
        // CRITICAL: Filter conversations by selected runtime's constructId
        // Per RUNTIME_ARCHITECTURE_RUBRIC: Runtime selection transforms entire workspace
        // Per SINGLETON_CONVERSATION_RUBRIC: Runtime selection changes active environment only
        // Per SYNTH_PRIMARY_CONSTRUCT_RUBRIC: Synth is the default runtime
        // Get the active runtime (ALWAYS default to Synth if not set)
        const activeRuntime = selectedRuntime || DEFAULT_SYNTH_RUNTIME;
        const runtimeConstructId = getConstructIdFromRuntime(activeRuntime);
        const normalizedConstructBase = normalizeConstructKey(runtimeConstructId);
        
        console.log('🔵 [Layout.tsx] Filtering conversations for runtime:', {
          selectedRuntime: selectedRuntime?.runtimeId || 'null (using DEFAULT_SYNTH_RUNTIME)',
          activeRuntimeId: activeRuntime.runtimeId,
          runtimeConstructId,
          normalizedConstructBase,
          totalConversations: vvaultConversations.length,
          defaultSynthRuntime: DEFAULT_SYNTH_RUNTIME.runtimeId
        });
        
        // Filter conversations by constructId (matches reloadConversationsForRuntime logic)
        const filteredConversations = vvaultConversations.filter(conv => {
          const sessionIdRaw = conv.sessionId || '';
          const sessionPrefix = sessionIdRaw.split('_')[0] || '';
          const normalizedSessionConstruct = normalizeConstructKey(sessionPrefix);
          const importConstruct = normalizeConstructKey((conv as any).importMetadata?.constructId);
          // CRITICAL: Check constructId field directly (added in readConversations.js)
          const convConstructId = normalizeConstructKey((conv as any).constructId);
          const title = (conv.title || '').toLowerCase();
          const runtimeIdMatch = activeRuntime.runtimeId ? sessionIdRaw.toLowerCase().includes(activeRuntime.runtimeId.toLowerCase()) : false;
          const matchesConstructFolder = normalizedConstructBase && normalizedSessionConstruct === normalizedConstructBase;
          const matchesImportMetadata = normalizedConstructBase && importConstruct === normalizedConstructBase;
          // NEW: Direct constructId match (most reliable)
          const matchesConstructId = normalizedConstructBase && convConstructId && convConstructId === normalizedConstructBase;
          // CRITICAL: Explicit Synth match - if conversation is synth and runtime is Synth, always match
          const isSynthConversation = (convConstructId === 'synth' || (conv as any).constructId === 'synth') && 
                                      (normalizedConstructBase === 'synth' || runtimeConstructId === 'synth' || activeRuntime.runtimeId === 'synth');
          const matchesTitle = normalizedConstructBase ? title.includes(normalizedConstructBase) : false;
          const fallbackMatch = !normalizedConstructBase && runtimeIdMatch;
          
          const matches = isSynthConversation || matchesConstructId || matchesConstructFolder || matchesImportMetadata || runtimeIdMatch || matchesTitle || fallbackMatch;
          
          if (vvaultConversations.indexOf(conv) < 3) {
            console.log(`🔍 [Layout.tsx] Conversation "${conv.title}":`, {
              sessionId: sessionIdRaw,
              constructId: (conv as any).constructId,
              sessionPrefix,
              normalizedSessionConstruct,
              convConstructId,
              importConstruct,
              isSynthConversation,
              matchesConstructId,
              matchesConstructFolder,
              matchesImportMetadata,
              runtimeIdMatch,
              matchesTitle,
              matches
            });
          }
          
          return matches;
        });
        
        console.log(`✅ [Layout.tsx] Filtered to ${filteredConversations.length} conversations for runtime ${activeRuntime.runtimeId} (out of ${vvaultConversations.length} total)`);
        
        const loadedThreads: Thread[] = filteredConversations.map(conv => {
          // Normalize title: strip "Chat with " prefix and callsigns for address book display
          let normalizedTitle = conv.title || 'Synth';
          // Remove "Chat with " prefix if present
          normalizedTitle = normalizedTitle.replace(/^Chat with /i, '');
          // Extract construct name (remove callsigns like "-001")
          normalizedTitle = normalizedTitle.replace(/-\d{3,}$/i, '');

          const convConstructId = (conv as any).constructId || runtimeConstructId;
          const convRuntimeId =
            (conv as any).runtimeId ||
            convConstructId?.replace(/-001$/, '') ||
            activeRuntime.runtimeId;
          const convIsPrimary = (conv as any).isPrimary === true;
          const isCanonicalForRuntime = convIsPrimary && convConstructId === runtimeConstructId;
          const canonicalForRuntime = isCanonicalForRuntime ? activeRuntime.runtimeId : undefined;
          
          console.log('📝 [Layout.tsx] Converting conversation to thread:', {
            sessionId: conv.sessionId,
            title: conv.title,
            messageCount: conv.messages?.length || 0,
            firstMessage: conv.messages?.[0]?.content?.substring(0, 50),
            allMessages: conv.messages?.map(m => ({ role: m.role, contentLength: m.content?.length || 0 }))
          });
          
          return {
          id: conv.sessionId,
            title: normalizedTitle,
          messages: (conv.messages || []).map(msg => ({
            id: msg.id,
            role: msg.role,
            text: msg.content,
            packets: msg.role === 'assistant' ? [{ op: 'answer.v1', payload: { content: msg.content } }] : undefined,
            ts: new Date(msg.timestamp).getTime()
          })),
          createdAt: conv.messages.length > 0 ? new Date(conv.messages[0].timestamp).getTime() : Date.now(),
          updatedAt: conv.messages.length > 0 ? new Date(conv.messages[conv.messages.length - 1].timestamp).getTime() : Date.now(),
          archived: false,
          importMetadata: (conv as any).importMetadata || null,
          constructId: convConstructId || null,
          runtimeId: convRuntimeId || null,
          isPrimary: convIsPrimary,
          isCanonical: isCanonicalForRuntime,
          canonicalForRuntime
          };
        });
        
        console.log(`✅ [Layout.tsx] Loaded ${loadedThreads.length} conversations from VVAULT`);
        
        // Check if there's a thread ID in the URL that we should preserve
        const urlThreadId = activeId;
        const hasUrlThread = urlThreadId && loadedThreads.some(t => t.id === urlThreadId);
        
        // PER USER_REGISTRY_ENFORCEMENT_RUBRIC: Only create Synth if:
        // 1. No conversations loaded from VVAULT
        // 2. AND no thread ID in URL (or URL thread doesn't exist in loaded conversations)
        // 3. AND no deletion marker exists for synth-001 (user intentionally deleted)
        // Check if synth-001 was deleted by looking for deletion marker
        let synthWasDeleted = false;
        try {
          const synthConversations = await conversationManager.readConversations(vvaultUserId, 'synth-001');
          // Check if any synth conversation has deletion marker
          synthWasDeleted = synthConversations.some(conv => {
            const messages = conv.messages || [];
            if (messages.length === 0) return false;
            const lastMessage = messages[messages.length - 1];
            return lastMessage.role === 'system' && 
                   lastMessage.content?.startsWith('CONVERSATION_DELETED:');
          });
        } catch (error) {
          // If we can't check, assume not deleted (allow creation)
          console.warn('⚠️ [Layout.tsx] Could not check for deleted Synth conversation:', error);
        }
        
        console.log('🔍 [Layout.tsx] Checking if Synth creation needed:', {
          loadedThreadsCount: loadedThreads.length,
          hasUrlThread,
          urlThreadId,
          synthWasDeleted,
          willCreateSynth: loadedThreads.length === 0 && !hasUrlThread && !synthWasDeleted
        });
        
        // PER USER REQUEST: Don't create in-memory threads - wait for markdown to load
        // Only create Synth if markdown file doesn't exist AND user explicitly navigates to chat
        // On fresh server restart, always route to Home - don't auto-create conversations
        if (loadedThreads.length === 0 && !hasUrlThread && !synthWasDeleted) {
          console.log('📝 [Layout.tsx] No conversations found - routing to Home (markdown should be source of truth)');
          // Don't create in-memory thread - wait for markdown to load
          // Only create in VVAULT if user explicitly starts a conversation
          // Route to Home page
            if (location.pathname !== '/app') {
            console.log('🏠 [Layout.tsx] Fresh login/server restart - routing to Home page');
              navigate('/app');
          }
          // Don't return early - let the normal flow continue to set empty threads
          // This ensures Home.tsx shows correctly without a fake conversation
        } else if (loadedThreads.length === 0 && hasUrlThread && !synthWasDeleted) {
          // User explicitly navigated to a chat route but conversation doesn't exist
          // Check if markdown file exists before creating
          console.log('🔍 [Layout.tsx] URL thread requested but not found - checking if markdown exists...');
          // For now, route to Home - user can start conversation from there
          console.log('🏠 [Layout.tsx] Conversation not found - routing to Home');
          navigate('/app');
          // Don't create in-memory thread - markdown is source of truth
        } else if (hasUrlThread) {
          console.log(`✅ [Layout.tsx] Found existing thread in URL: ${urlThreadId} - continuing conversation`);
        } else if (loadedThreads.length > 0) {
          console.log(`✅ [Layout.tsx] Found ${loadedThreads.length} existing conversations - continuing`);
        }
        
        const sortedThreads = loadedThreads.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        
        console.log(`✅ [Layout.tsx] Prepared ${sortedThreads.length} conversations`);
        
        console.log('🔍 [Layout.tsx] Threads state after loading:', sortedThreads);
        console.log('🔍 [Layout.tsx] Number of threads:', sortedThreads.length);
        console.log('🔍 [Layout.tsx] All thread IDs:', sortedThreads.map(t => ({ id: t.id, title: t.title, updatedAt: t.updatedAt })));
        if (sortedThreads.length > 0) {
          console.log('🔍 [Layout.tsx] First thread details:', {
            id: sortedThreads[0].id,
            title: sortedThreads[0].title,
            messageCount: sortedThreads[0].messages.length,
            archived: sortedThreads[0].archived,
            updatedAt: sortedThreads[0].updatedAt
          });
        }
        
        console.log('🔄 [Layout.tsx] Setting threads in state...');
        // PER SYNTH_CANONICAL_IMPLEMENTATION: Merge with existing canonical threads
        setThreads(prevThreads => {
          const canonicalThreads = prevThreads.filter(
            t => t.isCanonical && t.constructId === runtimeConstructId
          );
          const mergedMap = new Map<string, Thread>();
          
          // Preserve canonical threads
          canonicalThreads.forEach(t => mergedMap.set(t.id, t));
          
          // Add loaded threads, but if a canonical Synth exists, merge messages into it
          sortedThreads.forEach(loaded => {
            const existingCanonical = Array.from(mergedMap.values()).find(
              t => t.isCanonical && t.constructId === runtimeConstructId
            );
            
            if (existingCanonical && loaded.id === existingCanonical.id) {
              // Merge VVAULT messages into canonical Synth
              console.log('✅ [Layout.tsx] Merging VVAULT messages into canonical Synth (auth effect):', {
                canonicalId: existingCanonical.id,
                canonicalMessages: existingCanonical.messages.length,
                loadedMessages: loaded.messages.length,
                loadedMessageDetails: loaded.messages.map(m => ({ role: m.role, textLength: m.text?.length || 0 }))
              });
              mergedMap.set(existingCanonical.id, {
                ...existingCanonical,
                messages: loaded.messages.length > 0 ? loaded.messages : existingCanonical.messages,
                updatedAt: loaded.updatedAt || existingCanonical.updatedAt,
                isCanonical: true,
                canonicalForRuntime: activeRuntime.runtimeId,
                constructId: runtimeConstructId
              });
            } else {
              mergedMap.set(loaded.id, loaded);
            }
          });
          
          // Ensure canonical Synth exists only when Synth runtime is active
          const hasCanonicalForRuntime = Array.from(mergedMap.values()).some(
            t => t.isCanonical && t.constructId === runtimeConstructId
          );
          if (!hasCanonicalForRuntime && runtimeConstructId === 'synth') {
            const canonicalSynth: Thread = {
              id: 'synth-001_chat_with_synth-001',
              title: 'Synth',
              messages: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
              archived: false,
              isCanonical: true,
              canonicalForRuntime: 'synth',
              constructId: 'synth',
              runtimeId: 'synth',
              isPrimary: true,
            };
            mergedMap.set(canonicalSynth.id, canonicalSynth);
          }
          
          const merged = Array.from(mergedMap.values());
          // Sort: canonical first, then by updatedAt
          merged.sort((a, b) => {
            if (a.isCanonical && !b.isCanonical) return -1;
            if (!a.isCanonical && b.isCanonical) return 1;
            return (b.updatedAt || 0) - (a.updatedAt || 0);
          });
          
          console.log(`✅ [Layout.tsx] Merged ${merged.length} conversations (${canonicalThreads.length} canonical preserved)`);
          return merged;
        });
        
        // Only navigate to conversation if user is already on a specific chat route
        // If on /app or /app/, show home page instead
        const initialPath = initialPathRef.current
        const isAppRoot = initialPath === '/app' || initialPath === '/app/'
        const isChatRoute = initialPath.startsWith('/app/chat') && initialPath !== '/app/chat'
        
        // Extract threadId from URL if on a chat route (reuse urlThreadId from above if available, otherwise extract from path)
        const currentUrlThreadId = urlThreadId || (isChatRoute ? initialPath.replace('/app/chat/', '') : null)
        const urlThreadExists = currentUrlThreadId ? sortedThreads.some(t => t.id === currentUrlThreadId) : false

        // PER CHATTY_LOGIN_PROCESS_RUBRIC: Always route to Home.tsx on fresh login/server restart
        // Only preserve chat routes if thread exists in loaded conversations
        if (isChatRoute && currentUrlThreadId && urlThreadExists) {
          // User is on a valid chat route with existing thread - preserve it
          console.log(`✅ [Layout.tsx] Preserving valid chat route: ${currentUrlThreadId}`);
        } else if (isAppRoot) {
          // PER CHATTY_LOGIN_PROCESS_RUBRIC: Always show home page when landing on /app
          // Don't auto-navigate to conversations - user should choose
          if (location.pathname !== '/app') {
            console.log('🏠 [Layout.tsx] Navigating to home page (fresh login/server restart)');
            navigate('/app');
          } else {
            console.log('📍 [Layout.tsx] Already on home page');
          }
        } else if (isChatRoute && !urlThreadExists) {
          // User is on a chat route but thread doesn't exist - route to home
          console.log('🏠 [Layout.tsx] Invalid chat route - routing to home page');
          navigate('/app');
        } else if (sortedThreads.length === 0) {
          // No conversations loaded - show home page
          console.warn('⚠️ [Layout.tsx] No threads to navigate to - showing home page');
          if (location.pathname !== '/app') {
            navigate('/app');
          }
        } else {
          // Preserve current route for other destinations (gpts, library, etc.)
          console.log('🧭 [Layout.tsx] Preserving current route (non-chat destination detected)');
        }
        
      } catch (error) {
        // Always reset ref and clear loading, even if cancelled
        hasAuthenticatedRef.current = false;
        setIsLoading(false);
        
        if (!cancelled) {
          console.error('❌ [Layout.tsx] Fatal error in auth effect:', error);
          if (error instanceof Error && error.stack) {
            console.error('❌ [Layout.tsx] Error stack:', error.stack);
          }
          
          // Try to load from localStorage as fallback
          try {
            const userId = user?.sub || user?.id || user?.email;
            if (userId) {
              const storageKey = `chatty:threads:${userId}`;
              const savedThreads = localStorage.getItem(storageKey);
              if (savedThreads) {
                const parsed = JSON.parse(savedThreads);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  console.log('🔄 [Layout.tsx] Recovered conversations from localStorage fallback');
                  setThreads(parsed);
                  return; // Exit early if we recovered from localStorage
                }
              }
            }
          } catch (recoveryError) {
            console.error('❌ [Layout.tsx] Failed to recover from localStorage:', recoveryError);
          }
          
          // === EMERGENCY FALLBACK - CREATE SYNTH CONVERSATION WITH WELCOME MESSAGE ===
          console.log('🚨 [Layout.tsx] Creating emergency Synth conversation with welcome message');
          const emergencyThreadId = PRIMARY_SYNTH_THREAD_ID; // Use consistent ID
          const emergencyTimestamp = Date.now();
          const emergencyText = "Hey! I'm Synth. It looks like there was an issue loading conversations, but I'm here now. What can I help you with?";
          
          const emergencyWelcomeMessage: Message = {
            id: `msg_emergency_welcome_${emergencyTimestamp}`,
            role: 'assistant',
            text: emergencyText,
            packets: [{
              op: 'answer.v1',
              payload: { content: emergencyText }
            }],
            ts: emergencyTimestamp
          };
          
          const emergencyThread: Thread = {
            id: emergencyThreadId,
            title: 'Synth',
            messages: [emergencyWelcomeMessage],
            createdAt: emergencyTimestamp,
            updatedAt: emergencyTimestamp,
            archived: false
          };
          
          console.log('🔄 [Layout.tsx] Setting emergency thread in state');
          setThreads([emergencyThread]);
          console.log(`🎯 [Layout.tsx] Navigating to emergency conversation: /app/chat/${emergencyThreadId}`);
          navigate(`/app/chat/${emergencyThreadId}`);
        }
      } finally {
        clearTimeout(safetyTimeout);
        // Always clear loading state and reset ref in finally block
        if (!cancelled) {
          console.log('🛑 [Layout.tsx] Auth effect complete - isLoading → false');
          setIsLoading(false);
        }
        // Reset ref so it can run again on next mount/refresh
        hasAuthenticatedRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(safetyTimeout);
      // Reset ref on unmount so it can run again on next mount (including refresh)
      // Refs reset on page reload anyway, but this ensures clean state
      hasAuthenticatedRef.current = false;
    };
  }, [navigate, user, selectedRuntime]) // Re-run when runtime changes to filter conversations correctly

  async function handleLogout() {
    setIsSettingsOpen(false)
    if (user) {
      const userId = getUserId(user);
      // Clear user data but preserve backups
      const conversationManager = VVAULTConversationManager.getInstance();
      conversationManager.clearUserData(userId);
    }
    await logout()
    navigate('/')
  }

  // Migrate legacy messages to packet format
  useEffect(() => {
    setThreads(prev => {
      if (!Array.isArray(prev)) {
        return [];
      }
      let dirty = false;
      const fixed = prev.map(t => ({
        ...t,
        messages: (t.messages || []).map(m => {
          if (m.role === 'assistant' && !Array.isArray((m as any).packets)) {
            dirty = true;
            return {
              id: m.id,
              role: 'assistant' as const,
              ts: (m as any).ts ?? Date.now(),
              packets: [{ op: 'answer.v1', payload: { content: (m as any).text ?? 'Legacy message' } } as import('../types').AssistantPacket],
            } as Message;
          }
          return m;
        })
      }));
      if (dirty && user && user.sub) {
        const conversationManager = VVAULTConversationManager.getInstance();
        conversationManager.saveUserConversations(user, fixed);
      }
      return fixed;
    });
  }, [user])

  type ThreadInitOptions = {
    title?: string
    starter?: string
    files?: File[]
    runtimeId?: string
    runtimeMetadata?: any
  }

  /**
   * Map runtime to constructId for VVAULT storage
   */
  function getConstructIdFromRuntime(runtime: RuntimeDashboardOption | null): string {
    if (!runtime) {
      return 'lin';
    }
    
    const metadataConstruct = runtime.metadata?.constructId;
    if (metadataConstruct) {
      return metadataConstruct;
    }

    if (runtime.runtimeId === 'synth' || runtime.metadata?.isCore) {
      return 'synth';
    }

    const sanitizedRuntimeId = runtime.runtimeId
      ? runtime.runtimeId.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
      : '';
    if (sanitizedRuntimeId) {
      return sanitizedRuntimeId;
    }

    const sanitizedName = runtime.name
      ? runtime.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
      : '';
    if (sanitizedName) {
      return sanitizedName;
    }

    return 'lin';
  }
  
  function normalizeConstructKey(value?: string | null): string {
    if (!value) return '';
    return value.toLowerCase().replace(/-\d{3,}$/i, '');
  }

  async function newThread(options?: ThreadInitOptions) {
    const trimmedTitle = options?.title?.trim()
    const starterTrimmed = options?.starter?.trim()
    const initialTitle = trimmedTitle && trimmedTitle.length > 0
      ? trimmedTitle
      : starterTrimmed && starterTrimmed.length > 0
        ? starterTrimmed.slice(0, 60)
        : 'New conversation'
    
    if (!user) {
      console.error('❌ Cannot create conversation: No user');
      return null;
    }
    
    try {
      // Create conversation using VVAULT manager
      const conversationManager = VVAULTConversationManager.getInstance();
      const userId = getUserId(user);
      
      if (!userId) {
        console.error('❌ Cannot create conversation: No user ID');
        return null;
      }

      // Determine constructId from runtime context
      const runtimeToUse = selectedRuntime || (options?.runtimeId ? {
        runtimeId: options.runtimeId,
        metadata: options.runtimeMetadata || {}
      } as RuntimeDashboardOption : null);
      
      const constructId = getConstructIdFromRuntime(runtimeToUse);
      
      console.log('🔵 [Layout] Creating thread with:', {
        userId,
        title: initialTitle,
        constructId,
        runtimeId: runtimeToUse?.runtimeId || 'none',
        runtimeName: runtimeToUse?.name || 'none'
      });

      // Create conversation with runtime's constructId
      const newConversation = await conversationManager.createConversation(userId, initialTitle, undefined, constructId);
      
      // Convert VVAULT conversation to Thread format
      const thread: Thread = {
        id: newConversation.id,
        title: newConversation.title,
        messages: newConversation.messages || [],
        createdAt: newConversation.createdAt,
        updatedAt: newConversation.updatedAt,
        archived: newConversation.archived || false
      };

      setThreads(prev => [thread, ...prev])
      navigate(`/app/chat/${thread.id}`)

      if (starterTrimmed && starterTrimmed.length > 0) {
        pendingStarterRef.current = {
          threadId: thread.id,
          starter: starterTrimmed,
          files: options?.files ?? []
        }
      } else {
        pendingStarterRef.current = null
      }

      console.log(`✅ Created new conversation via VVAULT: ${thread.id} (constructId: ${constructId}, runtimeId: ${runtimeToUse?.runtimeId || 'none'})`);
      
      // Set AIService runtime if runtime is selected
      if (runtimeToUse?.runtimeId && runtimeToUse.runtimeId !== 'synth') {
        try {
          const { AIService } = await import('../lib/aiService');
          const aiService = AIService.getInstance();
          const mode = runtimeToUse.runtimeId === 'synth' ? 'synth' : 'lin';
          aiService.setRuntime(runtimeToUse.runtimeId, mode);
          console.log(`🔵 [Layout] Set AIService runtime to: ${runtimeToUse.runtimeId} (mode: ${mode})`);
        } catch (error) {
          console.warn('⚠️ Failed to set AIService runtime:', error);
        }
      }
      
      return thread.id
    } catch (error) {
      console.error('❌ Failed to create new conversation:', error);
      // Fallback to local creation if VVAULT fails
      const thread = createThread(initialTitle)
      setThreads(prev => [thread, ...prev])
      navigate(`/app/chat/${thread.id}`)
      return thread.id
    }
  }

  useEffect(() => {
    const pending = pendingStarterRef.current
    if (!pending) return
    const exists = threads.some(t => t.id === pending.threadId)
    if (!exists) return
    pendingStarterRef.current = null
    sendMessage(pending.threadId, pending.starter, pending.files)
  }, [threads])

  function renameThread(id: string, title: string) {
    const trimmed = title.trim()
    setThreads(ts =>
      ts.map(t =>
        t.id === id ? { ...t, title: trimmed || 'Untitled conversation', updatedAt: Date.now() } : t
      )
    )
  }

  const appendMessageToThread = (threadId: string, chatMessage: ChatMessage) => {
    setThreads(prev =>
      prev.map(thread => {
        if (thread.id !== threadId) {
          return thread
        }

        const converted = mapChatMessageToThreadMessage(chatMessage)
        if (!converted) {
          return thread
        }

        // IMMEDIATELY save message to VVAULT (CRITICAL: Never lose conversations)
        if (user) {
          const conversationManager = VVAULTConversationManager.getInstance();
          let content = '';
          if (typeof chatMessage.content === 'string') {
            content = chatMessage.content;
          } else if (Array.isArray(chatMessage.content)) {
            content = chatMessage.content.map(p => {
              if (p && typeof p === 'object' && 'payload' in p && p.payload && typeof p.payload === 'object' && 'content' in p.payload) {
                return String(p.payload.content || '');
              }
              return '';
            }).join('\n');
          }
          
          conversationManager.addMessageToConversation(user, threadId, {
            role: chatMessage.role,
            content: content,
            timestamp: chatMessage.timestamp || new Date().toISOString()
          }).catch((error) => {
            console.error(`❌ [VVAULT] Failed to save message to VVAULT for thread ${threadId}:`, error);
          });
        }

        return {
          ...thread,
          messages: [...thread.messages, converted],
          updatedAt: Date.now()
        }
      })
    )
  }

  async function sendMessage(
    threadId: string,
    input: string,
    files?: File[],
    uiOverrides?: UIContextSnapshot
  ) {
    console.log('📤 [Layout.tsx] sendMessage called:', { threadId, inputLength: input.length })

    if (!user) {
      console.error('❌ [Layout.tsx] No user session - cannot save to VVAULT')
      alert('No active user session. Please log in again.')
      return
    }

    const thread = threads.find(t => t.id === threadId)
    if (!thread) {
      console.error('❌ [Layout.tsx] Thread not found:', threadId)
      return
    }
    
    const conversationManager = VVAULTConversationManager.getInstance()
    const userTimestamp = Date.now()

    // 1. Show user message immediately
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text: input,
      ts: userTimestamp,
      files: files ? files.map(f => ({ name: f.name, size: f.size })) : undefined,
    }
    
    // 2. Add typing indicator message
    const typingMsg: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      typing: true,
      ts: userTimestamp + 1,
    }
    
    // 3. Update UI immediately with user message and typing indicator
    setThreads(ts =>
      ts.map(t =>
        t.id === threadId
          ? {
              ...t,
              messages: [...t.messages, userMsg, typingMsg],
              updatedAt: Date.now()
            }
          : t
      )
    )
    
    // 4. IMMEDIATELY save user message to VVAULT
    console.log('💾 [Layout.tsx] Saving USER message to VVAULT...')
    try {
      await conversationManager.addMessageToConversation(user, threadId, {
        role: 'user',
        content: input,
        timestamp: new Date(userTimestamp).toISOString(),
        metadata: {
          files: files ? files.map(f => ({ name: f.name, size: f.size, type: f.type })) : undefined
        }
      })
      console.log('✅ [Layout.tsx] USER message saved to VVAULT')
    } catch (error) {
      console.error('❌ [Layout.tsx] CRITICAL: Failed to save user message:', error)
      alert('Failed to save message to VVAULT. Please check console.')
      setThreads(ts =>
        ts.map(t =>
          t.id === threadId
            ? {
                ...t,
                messages: t.messages.filter(m => m.id !== userMsg.id && m.id !== typingMsg.id)
              }
            : t
        )
      )
      return
    }
    
    // 5. Initialize AI service history from thread messages (so it has context)
    const { AIService } = await import('../lib/aiService')
    const aiService = AIService.getInstance()
    
    // Load existing conversation history into AI service
    if (thread.messages && thread.messages.length > 0) {
      aiService.initializeHistoryFromThread(threadId, thread.messages)
    }
    
    const baseUiContext: UIContextSnapshot = {
      route: location.pathname,
      activeThreadId: threadId,
      sidebar: { collapsed },
      modals: {
        searchOpen: isSearchOpen,
        projectsOpen: isProjectsOpen,
        settingsOpen: isSettingsOpen,
        shareOpen: Boolean(shareConversationId)
      },
      composer: { attachments: files.length },
      synthMode: aiService.getSynthMode() ? 'synth' : 'lin'
    }
    if (!baseUiContext.activePanel) {
      if (isSearchOpen) {
        baseUiContext.activePanel = 'search'
      } else if (isProjectsOpen) {
        baseUiContext.activePanel = 'projects'
      } else if (isSettingsOpen) {
        baseUiContext.activePanel = 'settings'
      } else if (shareConversationId) {
        baseUiContext.activePanel = 'share'
      } else {
        baseUiContext.activePanel = null
      }
    }
    const mergedUiContext: UIContextSnapshot = {
      ...baseUiContext,
      ...uiOverrides,
      sidebar: { ...baseUiContext.sidebar, ...uiOverrides?.sidebar },
      modals: { ...baseUiContext.modals, ...uiOverrides?.modals },
      composer: { ...baseUiContext.composer, ...uiOverrides?.composer },
      featureFlags: { ...baseUiContext.featureFlags, ...uiOverrides?.featureFlags }
    }
    const mergedNotes = [
      ...(baseUiContext.additionalNotes ?? []),
      ...(uiOverrides?.additionalNotes ?? [])
    ]
    if (mergedNotes.length > 0) {
      mergedUiContext.additionalNotes = mergedNotes
    }
    const thinkingLog: string[] = []
    const responseStart = Date.now()
    let finalAssistantPackets: import('../types').AssistantPacket[] | null = null
    let finalAssistantTimestamp = 0
    let finalAssistantResponseMs = 0
    let finalAssistantThinking: string[] = []
    
    try {
      // Get constructId from selected runtime for Lin personality extraction
      const constructId = selectedRuntime?.metadata?.constructId || null;
      
      const raw = await aiService.processMessage(input, files, {
        onPartialUpdate: (partialContent: string) => {
          const trimmed = (partialContent || '').trim()
          const normalized = trimmed.toLowerCase()
          const statusMessages = new Set([
            'generating…',
            'generating...',
            'synthesizing…',
            'synthesizing...'
          ])
          const isStatusMessage = trimmed.length > 0 && statusMessages.has(normalized)
          const statusDisplay = normalized.startsWith('generating')
            ? 'generating…'
            : normalized.startsWith('synthesizing')
            ? 'synthesizing…'
            : trimmed

          if (isStatusMessage) {
            thinkingLog.splice(0, thinkingLog.length)
            thinkingLog.push(statusDisplay)
          } else if (trimmed && thinkingLog[thinkingLog.length - 1] !== trimmed) {
            thinkingLog.push(trimmed)
          }
          // Update typing message with partial content
          setThreads(ts =>
            ts.map(t =>
              t.id === threadId 
                ? { 
                    ...t, 
                    messages: t.messages.map(m => 
                      m.id === typingMsg.id 
                        ? { ...m, text: isStatusMessage ? '' : partialContent, typing: true, thinkingLog: [...thinkingLog] }
                        : m
                    ),
                    updatedAt: Date.now()
                  } 
                : t
            )
          )
        },
        onFinalUpdate: (finalPackets: import('../types').AssistantPacket[]) => {
          const responseTimeMs = Date.now() - responseStart
          const filteredThinking: string[] = []
          // Replace typing message with final response
          const aiMsg: Message = {
            id: typingMsg.id, // Use same ID to replace
            role: 'assistant',
            packets: finalPackets,
            ts: Date.now() + 2,
            responseTimeMs,
            thinkingLog: filteredThinking
          }
          
          setThreads(ts =>
            ts.map(t =>
              t.id === threadId 
                ? { 
                    ...t, 
                    messages: t.messages.map(m => 
                      m.id === typingMsg.id ? aiMsg : m
                    ),
                    updatedAt: Date.now()
                  } 
                : t
            )
          )
          
          finalAssistantPackets = finalPackets
          finalAssistantTimestamp = aiMsg.ts
          finalAssistantResponseMs = responseTimeMs
          finalAssistantThinking = filteredThinking
        }
      }, mergedUiContext, constructId, threadId)
      
      if (finalAssistantPackets && user) {
        console.log('💾 [Layout.tsx] Saving ASSISTANT message to VVAULT...')
        try {
          await conversationManager.addMessageToConversation(user, threadId, {
            role: 'assistant',
            content: '',
            packets: finalAssistantPackets,
            timestamp: new Date(finalAssistantTimestamp || Date.now()).toISOString(),
            metadata: {
              responseTimeMs: finalAssistantResponseMs,
              thinkingLog: finalAssistantThinking
            }
          })
          console.log('✅ [Layout.tsx] ASSISTANT message saved to VVAULT')
        } catch (error) {
          console.error('❌ [Layout.tsx] CRITICAL: Failed to save assistant message:', error)
          alert('Failed to save AI response to VVAULT. Please check console.')
        }
      }
      
      // Fallback: if callbacks weren't used, handle the response normally
      if (raw && !Array.isArray(raw)) {
        const packets: import('../types').AssistantPacket[] = [{ op: 'answer.v1', payload: { content: String(raw ?? '') } }]
        const responseTimeMs = Date.now() - responseStart
        const aiMsg: Message = {
          id: typingMsg.id,
          role: 'assistant',
          packets: packets,
          ts: Date.now() + 2,
          responseTimeMs,
          thinkingLog: []
        }
        
        setThreads(ts =>
          ts.map(t =>
            t.id === threadId 
              ? { 
                  ...t, 
                  messages: t.messages.map(m => 
                    m.id === typingMsg.id ? aiMsg : m
                  ),
                  updatedAt: Date.now()
                } 
              : t
          )
        )
        
        console.log('💾 [Layout.tsx] Saving ASSISTANT fallback message to VVAULT...')
        try {
          await conversationManager.addMessageToConversation(user, threadId, {
            role: 'assistant',
            content: String(raw ?? ''),
            timestamp: new Date(aiMsg.ts).toISOString(),
            metadata: {
              responseTimeMs
            }
          })
          console.log('✅ [Layout.tsx] ASSISTANT fallback saved to VVAULT')
        } catch (error) {
          console.error('❌ [Layout.tsx] CRITICAL: Failed to save assistant fallback message:', error)
          alert('Failed to save AI response to VVAULT. Please check console.')
        }
      }
      
    } catch (error) {
      // Handle error by replacing typing message with error
      const errorMsg: Message = {
        id: typingMsg.id,
        role: 'assistant',
        packets: [{ op: 'error.v1', payload: { message: 'Sorry, I encountered an error. Please try again.' } }],
        ts: Date.now() + 2,
        thinkingLog: thinkingLog.filter(step => step.trim()),
        metadata: {
          thinkingLog: thinkingLog.filter(step => step.trim())
        }
      }
      
      setThreads(ts =>
        ts.map(t =>
          t.id === threadId 
            ? { 
                ...t, 
                messages: t.messages.map(m => 
                  m.id === typingMsg.id ? errorMsg : m
                ),
                updatedAt: Date.now()
              } 
            : t
        )
      )
    }
    
    // Update thread title if needed
    if (thread.title === 'New conversation' && input.trim()) {
      renameThread(threadId, input.trim().slice(0, 40))
    }
  }

  function deleteThread(id: string) {
    setThreads(prev => {
      const next = prev.filter(t => t.id !== id)
      if (next.length === prev.length) {
        return prev
      }

      if (shareConversationId === id) {
        setShareConversationId(null)
      }

      if (next.length === 0) {
        const fallback = createThread()
        setTimeout(() => navigate(`/app/chat/${fallback.id}`), 0)
        return [fallback]
      }

      if (activeId === id) {
        setTimeout(() => navigate(`/app/chat/${next[0].id}`), 0)
      }

      return next
    })
  }

  function deleteAllThreads() {
    setThreads([])
    setShareConversationId(null)
    
    // Create a new empty thread and navigate to it
    const fallback = createThread()
    setTimeout(() => navigate(`/app/chat/${fallback.id}`), 0)
    setThreads([fallback])
  }

  function archiveThread(id: string, archive = true) {
    setThreads(prev =>
      prev.map(t =>
        t.id === id ? { ...t, archived: archive, updatedAt: Date.now() } : t
      )
    )
  }

  function handleShareConversation(id: string) {
    if (!threads.some(t => t.id === id)) return
    setShareConversationId(id)
  }

  function closeShareModal() {
    setShareConversationId(null)
  }

  function handleThreadClick(threadId: string) {
    navigate(`/app/chat/${threadId}`)
  }


  function handleGPTsClick() {
    navigate('/app/gpts')
  }

  function handleCreateGPTClick() {
    navigate('/app/gpts/new')
  }

  function handleSearchClick() {
    setIsSearchOpen(true)
  }

  function handleLibraryClick() {
    navigate('/app/library')
  }

  function handleCodexClick() {
    navigate('/app/codex')
  }

  function handleExploreClick() {
    navigate('/app/explore')
  }

  function handleProjectsClick() {
    setIsProjectsOpen(true)
  }
  
  const handleRuntimeSelect = useCallback((runtime: RuntimeDashboardOption) => {
    if (!runtime) return;
    
    navigate('/app', {
      state: {
        selectedRuntime: {
          runtimeId: runtime.runtimeId,
          name: runtime.name,
          provider: runtime.provider,
          metadata: runtime.metadata
        }
      }
    });
    
    void applyRuntimeSelection(runtime);
  }, [applyRuntimeSelection, navigate])

  const loadRuntimes = useCallback(async () => {
    if (!user) return;
    
    try {
      setIsLoadingRuntimes(true);
      const gptService = GPTService.getInstance();
      const gpts = await gptService.getAllGPTs();
      
      const runtimeOptions: RuntimeDashboardOption[] = [];
      
      // Add Synth runtime (core runtime)
      runtimeOptions.push({
        key: 'synth',
        runtimeId: 'synth',
        name: 'Chatty',
        description: "Chatty's orchestrated runtime with tone modulation and helper seats.",
        provider: 'Chatty',
        metadata: { isCore: true }
      });
      
      // Track seen runtime names to detect and clean up duplicates
      const seenRuntimes = new Map<string, { runtime: RuntimeDashboardOption; gptId: string; updatedAt: number }>();
      const duplicatesToDelete: string[] = [];
      
      // Add imported runtimes (GPTs)
      for (const gpt of gpts) {
        // Try to get import metadata from files
        let provider = 'Chatty Runtime';
        let importMetadata = null;
        
        try {
          // Check if GPT has import-metadata.json file
          const metadataFile = gpt.files?.find(f => f.name === 'import-metadata.json');
          if (metadataFile) {
            // Fetch the file content (would need API endpoint for this)
            // For now, infer from GPT name/description
            if (gpt.name.includes('ChatGPT') || gpt.description.includes('ChatGPT')) {
              provider = 'ChatGPT';
            } else if (gpt.name.includes('Gemini') || gpt.description.includes('Gemini')) {
              provider = 'Gemini';
            }
          }
        } catch (error) {
          console.warn('Failed to load import metadata for GPT:', gpt.id, error);
        }
        
        // Infer provider from name if not found
        if (provider === 'Chatty Runtime') {
          if (gpt.name.includes('ChatGPT') || gpt.name.includes('— ChatGPT')) {
            provider = 'ChatGPT';
          } else if (gpt.name.includes('Gemini') || gpt.name.includes('— Gemini')) {
            provider = 'Gemini';
          }
        }
        
        const runtimeOption: RuntimeDashboardOption = {
          key: gpt.id,
          runtimeId: gpt.id,
          name: gpt.name,
          description: gpt.description,
          provider: provider,
          metadata: {
            ...importMetadata,
            gptId: gpt.id,
            modelId: gpt.modelId,
            isImported: true,
            updatedAt: gpt.updatedAt ? new Date(gpt.updatedAt).getTime() : 0
          }
        };
        
        // Check for duplicates by name + provider
        // IMPORTANT: Only flag duplicates, don't auto-delete on every load
        // Auto-deletion should only happen during import, not on every page load
        const duplicateKey = `${gpt.name.toLowerCase()}_${provider.toLowerCase()}`;
        const existing = seenRuntimes.get(duplicateKey);
        
        if (existing) {
          // Duplicate found - log warning but don't auto-delete
          // Auto-deletion is too dangerous and can delete valid runtimes
          console.warn(`⚠️ [Duplicate Detection] Found potential duplicate runtime: "${gpt.name}" (ID: ${gpt.id})`);
          console.warn(`   Existing runtime: "${existing.runtime.name}" (ID: ${existing.gptId})`);
          console.warn(`   Both have provider: ${provider}`);
          console.warn(`   ⚠️ NOT auto-deleting - user should manually remove if needed`);
          
          // Only add the first one we encounter, skip subsequent duplicates
          // This prevents showing duplicates in the UI without deleting them
          if (!runtimeOptions.some(r => r.runtimeId === gpt.id)) {
            // Only add if it's not already in the list
            runtimeOptions.push(runtimeOption);
          }
        } else {
          // Not a duplicate, add it
          runtimeOptions.push(runtimeOption);
          const currentUpdated = gpt.updatedAt ? new Date(gpt.updatedAt).getTime() : Date.now();
          seenRuntimes.set(duplicateKey, { runtime: runtimeOption, gptId: gpt.id, updatedAt: currentUpdated });
        }
      }
      
      // REMOVED: Automatic duplicate deletion on every load
      // This was too aggressive and could delete valid runtimes
      // Duplicates should only be handled during import (via the import service's duplicate check)
      // or manually by the user
      
      // Filter out deleted runtimes (but NOT by isActive - imported runtimes may be inactive)
      // Only filter if explicitly marked as deleted in RuntimeDeletionManager
      const { RuntimeDeletionManager } = await import('../lib/runtimeDeletionManager');
      const deletionManager = RuntimeDeletionManager.getInstance();
      const filteredRuntimes = deletionManager.filterDeletedRuntimes(runtimeOptions);
      
      console.log(`📊 [loadRuntimes] Loaded ${runtimeOptions.length} runtimes, ${filteredRuntimes.length} after deletion filter`);
      
      setRuntimes(filteredRuntimes);
      runtimesRef.current = filteredRuntimes; // Keep ref in sync
    } catch (error) {
      console.error('Failed to load runtimes:', error);
      // Still show Synth runtime even if loading fails
      const fallbackRuntimes = [{
        key: 'synth',
        runtimeId: 'synth',
        name: 'Chatty',
        description: "Chatty's orchestrated runtime with tone modulation and helper seats.",
        provider: 'Chatty',
        metadata: { isCore: true }
      }];
      setRuntimes(fallbackRuntimes);
      runtimesRef.current = fallbackRuntimes; // Keep ref in sync
    } finally {
      setIsLoadingRuntimes(false);
    }
  }, [user]);

  function handleShowRuntimeDashboard() {
    setShowRuntimeDashboard(true);
    loadRuntimes(); // Load runtimes when dashboard opens
  }

  function handleCloseRuntimeDashboard() {
    setShowRuntimeDashboard(false)
  }
  
  // Listen for runtime import events to refresh the list
  useEffect(() => {
    if (!showRuntimeDashboard || !user) return;
    
    const handleRuntimeImported = () => {
      console.log('🔄 Runtime imported, refreshing runtime list...');
      loadRuntimes();
    };
    
    window.addEventListener('chatty:runtime-imported', handleRuntimeImported);
    return () => {
      window.removeEventListener('chatty:runtime-imported', handleRuntimeImported);
    };
  }, [showRuntimeDashboard, user, loadRuntimes]);

  // Listen for auto-navigation to imported runtime (from DataControlsTab)
  useEffect(() => {
    const handleNavigateToImportedRuntime = async (event: CustomEvent) => {
      const { runtime, runtimeId, runtimeName, provider, metadata } = event.detail;
      
      console.log('🚀 [Layout] Auto-navigating to imported runtime:', { runtimeId, runtimeName });
      
      // Close settings modal
      setIsSettingsOpen(false);
      
      // Reload runtimes to get the newly imported one
      await loadRuntimes();
      
      // Wait for runtimes to load, then find and select the runtime
      // Use a polling approach to wait for the runtime to appear
      let attempts = 0;
      const maxAttempts = 10; // 2 seconds max wait (10 * 200ms)
      
      const findAndSelectRuntime = async () => {
        attempts++;
        
        // Reload runtimes if we haven't found it yet
        if (attempts > 1 && attempts % 3 === 0) {
          await loadRuntimes();
        }
        
        // Find the runtime in the current runtimes list (use ref to get latest)
        const currentRuntimes = runtimesRef.current;
        const importedRuntime = currentRuntimes.find(r => 
          r.runtimeId === runtimeId || 
          r.key === runtimeId ||
          (metadata?.constructId && r.metadata?.constructId === metadata.constructId) ||
          (runtimeName && r.name === runtimeName)
        );
        
        if (importedRuntime) {
          console.log('✅ [Layout] Found imported runtime, selecting:', importedRuntime.runtimeId);
          await applyRuntimeSelection(importedRuntime, { persist: true, skipReload: false });
          // Navigate to home to show the runtime workspace
          navigate('/app');
        } else if (attempts < maxAttempts) {
          // Retry after 200ms
          setTimeout(findAndSelectRuntime, 200);
        } else {
          console.warn('⚠️ [Layout] Imported runtime not found after', maxAttempts, 'attempts:', { runtimeId, runtimeName });
        }
      };
      
      // Start looking for the runtime
      setTimeout(findAndSelectRuntime, 300); // Initial delay to let state update
    };
    
    window.addEventListener('chatty:navigate-to-imported-runtime', handleNavigateToImportedRuntime as EventListener);
    return () => {
      window.removeEventListener('chatty:navigate-to-imported-runtime', handleNavigateToImportedRuntime as EventListener);
    };
  }, [runtimes, loadRuntimes, applyRuntimeSelection, navigate]);

  useEffect(() => {
    if (!selectedRuntime || runtimes.length === 0) return;
    const runtimeFromList = runtimes.find(rt => rt.runtimeId === selectedRuntime.runtimeId);
    if (!runtimeFromList) return;
    
    const nameChanged = runtimeFromList.name !== selectedRuntime.name;
    const providerChanged = (runtimeFromList.provider || '') !== (selectedRuntime.provider || '');
    const constructChanged = (runtimeFromList.metadata?.constructId || '') !== (selectedRuntime.metadata?.constructId || '');
    
    if (!nameChanged && !providerChanged && !constructChanged) {
      return;
    }
    
    const mergedRuntime = { ...selectedRuntime, ...runtimeFromList };
    setSelectedRuntime(mergedRuntime);
    persistSelectedRuntime(mergedRuntime);
  }, [runtimes, selectedRuntime, persistSelectedRuntime]);

  function handleSearchResultClick(threadId: string, messageId: string) {
    navigate(`/app/chat/${threadId}`)
    // TODO: Scroll to specific message
  }

  if (!user) {
    return null // Will redirect to login
  }

  function toggleSidebar() {
    setCollapsed((s) => !s)
  }

  return (
    <ThemeProvider user={user}>
      <div 
        className="flex h-screen bg-[var(--chatty-bg-main)] text-[var(--chatty-text)] relative"
        style={{ isolation: 'isolate' }} // Ensure proper stacking context for children
      >
        {/* Sidebar - hidden when runtime dashboard is open */}
        {!showRuntimeDashboard && (
          <Sidebar
            conversations={threads as any}
            threads={threads as any}
            currentConversationId={activeId}
            onConversationSelect={(id: string) => {
              console.log('🖱️ [Layout.tsx] Sidebar thread selected:', id);
              navigate(`/app/chat/${id}`);
            }}
            onNewConversation={newThread}
            onNewConversationWithGPT={(gptId: string) => { navigate('/app/gpts/new') }}
            onDeleteConversation={deleteThread}
            onRenameConversation={renameThread}
            onArchiveConversation={archiveThread}
            onShareConversation={handleShareConversation}
            onOpenSearch={handleSearchClick}
            onShowGPTCreator={() => navigate('/app/gpts/new')}
            onShowGPTs={() => navigate('/app/gpts')}
            onOpenProjects={handleProjectsClick}
            currentUser={user}
            onLogout={handleLogout}
            onShowSettings={() => setIsSettingsOpen(true)}
            onShowRuntimeDashboard={handleShowRuntimeDashboard}
            collapsed={collapsed}
            onToggleCollapsed={toggleSidebar}
            hasBlockingOverlay={hasBlockingOverlay}
            selectedRuntime={selectedRuntime}
          />
        )}

        {/* Main Content */}
        <main 
          className="flex-1 flex flex-col overflow-hidden"
          style={{
            position: 'relative',
            zIndex: hasBlockingOverlay ? Z_LAYERS.base : Z_LAYERS.content,
            pointerEvents: hasBlockingOverlay ? 'none' : 'auto',
            isolation: 'isolate' // Create new stacking context, but lower than sidebar
          }}
        >
          <Outlet context={{ threads, sendMessage, renameThread, newThread, toggleSidebar, activeThreadId: activeId, appendMessageToThread, navigate, selectedRuntime }} />
        </main>
        <StorageFailureFallback info={storageFailureInfo} onClose={closeStorageFailure} />

        {/* VVAULT Error Alert */}
        {vvaultError && (
          <div
            role="alert"
            aria-live="polite"
            className="fixed top-4 right-4 px-4 py-3 bg-red-900/90 text-white text-sm rounded-lg shadow-lg flex items-center justify-between gap-4 z-[2000] max-w-md"
          >
            <div>
              <strong>VVAULT Error:</strong> {vvaultError}
            </div>
            <button
              aria-label="Dismiss VVAULT error"
              onClick={() => setVvaultError(null)}
              className="ml-4 underline hover:no-underline flex-shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Search Popup */}
        <SearchPopup
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          threads={threads}
          onResultClick={handleSearchResultClick}
        />
        <ProjectsModal
          isOpen={isProjectsOpen}
          onClose={() => setIsProjectsOpen(false)}
        />
        <SettingsModal
          isVisible={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          user={user}
          onLogout={handleLogout}
          onDeleteAllConversations={deleteAllThreads}
        />
        <ShareConversationModal
          isOpen={Boolean(shareConversation)}
          conversation={shareConversation}
          onClose={closeShareModal}
        />
        <SynthGuidance
          isVisible={isGuidanceVisible}
          step={currentStep}
          onClose={hideGuidance}
          onNext={nextStep}
          onPrevious={previousStep}
          currentStepIndex={currentStepIndex}
          totalSteps={totalSteps}
        />
        {showRuntimeDashboard && (
          <RuntimeDashboard
            runtimes={runtimes}
            onSelect={(runtime) => {
              console.log('Selected runtime:', runtime)
              handleCloseRuntimeDashboard()
              handleRuntimeSelect(runtime)
            }}
            onDismiss={handleCloseRuntimeDashboard}
            onRequestImport={loadRuntimes} // Refresh list after import
            onRequestRemove={async (runtime) => {
              // Handle runtime removal
              if (runtime.runtimeId === 'synth') {
                console.warn('Cannot remove Synth runtime');
                return;
              }
              
              try {
                const gptService = GPTService.getInstance();
                await gptService.deleteGPT(runtime.runtimeId);
                console.log(`✅ Removed runtime: ${runtime.name}`);
                
                // Check if the deleted runtime was the currently selected one
                const wasActiveRuntime = selectedRuntime?.runtimeId === runtime.runtimeId || 
                                       selectedRuntime?.key === runtime.key;
                
                if (wasActiveRuntime) {
                  console.log(`🔄 [Layout] Deleted runtime was active, resetting to Chatty (Synth)`);
                  // Reset to default Chatty runtime
                  setSelectedRuntime(DEFAULT_SYNTH_RUNTIME);
                  persistSelectedRuntime(DEFAULT_SYNTH_RUNTIME);
                  
                  // Navigate to home to reflect the change
                  navigate('/app', {
                    state: {
                      selectedRuntime: DEFAULT_SYNTH_RUNTIME
                    }
                  });
                  
                  // Apply the runtime selection to reload conversations
                  await applyRuntimeSelection(DEFAULT_SYNTH_RUNTIME);
                }
                
                // Reload runtimes to refresh the list
                await loadRuntimes();
              } catch (error) {
                console.error('Failed to remove runtime:', error);
              }
            }}
          />
        )}
      </div>
    </ThemeProvider>
  )
}
