import React, { useEffect, useMemo, useRef, useState } from 'react'
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
import { AIService } from '../lib/aiService'
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
  constructId?: string | null;
  runtimeId?: string | null;
  isPrimary?: boolean;
  canonicalForRuntime?: string | null;
  importMetadata?: Record<string, any> | null;
  isFallback?: boolean;
}

const VVAULT_FILESYSTEM_ROOT = '/Users/devonwoodson/Documents/GitHub/vvault';
const DEFAULT_SYNTH_CANONICAL_SESSION_ID = 'synth-001_chat_with_synth-001';
const DEFAULT_SYNTH_CANONICAL_CONSTRUCT_ID = 'synth-001';
const DEFAULT_SYNTH_RUNTIME_ID = 'synth-001';

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
  const [storageFailureInfo, setStorageFailureInfo] = useState<{ reason: string; key?: string; sizeBytes?: number } | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isProjectsOpen, setIsProjectsOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [showRuntimeDashboard, setShowRuntimeDashboard] = useState(false)
  const [shareConversationId, setShareConversationId] = useState<string | null>(null)
  const [isBackendUnavailable, setIsBackendUnavailable] = useState(false)
  const pendingStarterRef = useRef<{ threadId: string; starter: string; files: File[] } | null>(null)
  const hasAuthenticatedRef = useRef(false)
  const initialPathRef = useRef(location.pathname)
  
  useEffect(() => {
    console.log('📚 [Layout.tsx] Threads updated (length):', threads.length);
  }, [threads])
  
  const activeId = useMemo(() => {
    const match = location.pathname.match(/^\/app\/chat\/(.+)$/)
    return match ? match[1] : null
  }, [location.pathname])
  const activeRuntimeId = (location.state as any)?.activeRuntimeId || null
  const shareConversation = useMemo(
    () => threads.find(thread => thread.id === shareConversationId) || null,
    [threads, shareConversationId]
  )
  const synthAddressBookThreads = useMemo(() => {
    const canonical =
      threads.find(t => t.id === DEFAULT_SYNTH_CANONICAL_SESSION_ID) ||
      threads.find(t => t.constructId === DEFAULT_SYNTH_CANONICAL_CONSTRUCT_ID) ||
      threads.find(t => t.runtimeId === DEFAULT_SYNTH_RUNTIME_ID && t.isPrimary);
    return canonical ? [canonical] : [];
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

  function extractRuntimeKeyFromThreadId(threadId?: string | null) {
    if (!threadId) return null
    const match = threadId.match(/^([a-zA-Z0-9-]+)_[0-9]{6,}$/)
    return match ? match[1] : null
  }

  function getCanonicalThreadForKeys(threadList: Thread[], keys: (string | null | undefined)[]) {
    const lookup = new Set((keys.filter(Boolean) as string[]).map(k => k.toLowerCase()))
    if (lookup.size === 0) return null

    return (
      threadList.find(thread => {
        if (!thread.isPrimary || !thread.constructId) return false
        const threadKeys = [thread.constructId, thread.runtimeId, thread.canonicalForRuntime]
          .filter(Boolean)
          .map(k => (k as string).toLowerCase())
        return threadKeys.some(key => lookup.has(key))
      }) || null
    )
  }

  function preferCanonicalThreadId(threadId: string | null | undefined, threadList: Thread[]) {
    if (!threadId) return null
    const target = threadList.find(t => t.id === threadId)
    const runtimeHint = extractRuntimeKeyFromThreadId(threadId)
    const canonical = getCanonicalThreadForKeys(threadList, [
      target?.constructId,
      target?.runtimeId,
      target?.canonicalForRuntime,
      runtimeHint
    ])
    if (!canonical) {
      if (runtimeHint === DEFAULT_SYNTH_RUNTIME_ID) {
        return DEFAULT_SYNTH_CANONICAL_SESSION_ID;
      }
      return threadId;
    }

    if (canonical.id === threadId) return threadId

    const isRuntimeLikeId = Boolean(runtimeHint)
    const isNonPrimaryThread = target ? !target.isPrimary : false

    return (isRuntimeLikeId || isNonPrimaryThread) ? canonical.id : threadId
  }

  function filterThreadsWithCanonicalPreference(threadList: Thread[]) {
    const canonicalKeys = new Set<string>()

    threadList.forEach(thread => {
      if (thread.isPrimary && thread.constructId) {
        [thread.constructId, thread.runtimeId, thread.canonicalForRuntime]
          .filter(Boolean)
          .forEach(key => canonicalKeys.add((key as string).toLowerCase()))
      }
    })

    return threadList.filter(thread => {
      if (thread.isPrimary && thread.constructId) return true
      const runtimeHint = extractRuntimeKeyFromThreadId(thread.id)
      const keys = [thread.constructId, thread.runtimeId, runtimeHint]
        .filter(Boolean)
        .map(k => (k as string).toLowerCase())
      const hasCanonical = keys.some(key => canonicalKeys.has(key))
      if (!hasCanonical) return true
      const isRuntimeTimestampThread = Boolean(runtimeHint)
      return !isRuntimeTimestampThread
    })
  }

  function filterByActiveRuntime(threadList: Thread[], activeRuntimeId?: string | null) {
    if (!activeRuntimeId) return threadList
    const target = activeRuntimeId.toLowerCase()
    return threadList.filter(thread => {
      const construct = (thread.constructId || '').toLowerCase()
      const runtime = (thread.runtimeId || '').toLowerCase()
      const idHint = extractRuntimeKeyFromThreadId(thread.id)?.toLowerCase()
      return construct === target || runtime === target || idHint === target
    })
  }

  function routeIdForThread(threadId: string, threadList: Thread[]) {
    const thread = threadList.find(t => t.id === threadId)
    if (thread && thread.isPrimary && thread.constructId) {
      return `${thread.constructId}_chat_with_${thread.constructId}`
    }
    return threadId
  }

  // Professional conversation saving with fail-safes
  useEffect(() => {
    if (user && user.sub && threads.length > 0) {
      const conversationManager = VVAULTConversationManager.getInstance();
      conversationManager.saveUserConversations(user, threads)
        .catch((error) => {
          console.error('❌ Failed to save conversations:', error)
        })
    }
  }, [threads, user])

  // Handle authentication - runs once per mount
  useEffect(() => {
    // Prevent multiple runs - check ref first
    if (hasAuthenticatedRef.current) {
      console.log('⏭️ [Layout.tsx] Auth effect skipped - already authenticated');
      return;
    }

    // Set ref immediately to prevent concurrent runs
    hasAuthenticatedRef.current = true;
    
    // Also check if user is already set (from previous run)
    if (user) {
      console.log('⏭️ [Layout.tsx] Auth effect skipped - user already set');
      hasAuthenticatedRef.current = false; // Reset so it can run if user changes
      return;
    }

    let cancelled = false;

    // Safety timeout: ensure loading state is cleared after 10 seconds max
    const safetyTimeout = setTimeout(() => {
      if (!cancelled) {
        console.warn('⚠️ [Layout.tsx] Auth effect timeout - forcing isLoading to false');
        setIsLoading(false);
      }
    }, 10000);

    (async () => {
      try {
        console.log('🔍 [Layout.tsx] Auth effect starting');
        setIsLoading(true);
        
        const me = await fetchMe();
        console.log('✅ [Layout.tsx] fetchMe() resolved:', me ? `user: ${me.email}` : 'null');
        
        if (cancelled || !me) {
          hasAuthenticatedRef.current = false;
          if (!cancelled) {
            console.log('🚪 [Layout.tsx] No user session - redirecting to /');
            navigate('/');
            setIsLoading(false);
          }
          return;
        }
        
        setUser(me);
        
        console.log('📚 [Layout.tsx] Loading conversations from VVAULT filesystem...');
        
        // Wait for backend to be ready before making VVAULT requests
        try {
          const { waitForBackendReady } = await import('../lib/backendReady');
          await waitForBackendReady(5, (attempt) => {
            if (attempt === 1) {
              console.log('⏳ [Layout.tsx] Waiting for backend to be ready before loading VVAULT...');
            }
          });
        } catch (error) {
          console.warn('⚠️ [Layout.tsx] Backend readiness check failed, continuing anyway:', error);
        }
        
        const conversationManager = VVAULTConversationManager.getInstance();
        const userId = me.sub || me.id || getUserId(me);
        // Use email for VVAULT lookup since user IDs might not match (Chatty uses MongoDB ObjectId, VVAULT uses LIFE format)
        const vvaultUserId = me.email || userId;
        const transcriptsPath = `${VVAULT_FILESYSTEM_ROOT}/users/shard_0000/${userId}/instances/`;
        console.log('📁 [Layout.tsx] VVAULT root:', VVAULT_FILESYSTEM_ROOT);
        console.log('📁 [Layout.tsx] User instances directory:', transcriptsPath);
        console.log('📁 [Layout.tsx] Using email for VVAULT lookup:', vvaultUserId);
        
        // Load VVAULT conversations with timeout protection (but don't race - wait for actual result)
        let vvaultConversations: any[] = [];
        let backendUnavailable = false;
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
        } catch (vvaultError) {
          console.error('❌ [Layout.tsx] VVAULT loading error:', vvaultError);
          vvaultConversations = []; // Use empty array on error
          const message = (vvaultError as any)?.message || '';
          backendUnavailable =
            message.includes('Failed to fetch') ||
            message.includes('Backend route not found') ||
            message.includes('404') ||
            message.includes('ENOENT');
        }
        setIsBackendUnavailable(backendUnavailable);
        console.log('📚 [Layout.tsx] VVAULT returned:', vvaultConversations);
        
        const loadedThreads: Thread[] = vvaultConversations.map(conv => {
          // Normalize title: strip "Chat with " prefix and callsigns for address book display
          let normalizedTitle = conv.title || 'Synth';
          // Remove "Chat with " prefix if present
          normalizedTitle = normalizedTitle.replace(/^Chat with /i, '');
          // Extract construct name (remove callsigns like "-001")
          normalizedTitle = normalizedTitle.replace(/-\d{3,}$/i, '');
          
          const constructId =
            conv.constructId ||
            conv.importMetadata?.constructId ||
            conv.importMetadata?.connectedConstructId ||
            conv.constructFolder ||
            null;
          const runtimeId =
            conv.runtimeId ||
            conv.importMetadata?.runtimeId ||
            (constructId ? constructId.replace(/-001$/, '') : null) ||
            null;
          const isPrimary =
            typeof conv.isPrimary === 'boolean'
              ? conv.isPrimary
              : typeof conv.importMetadata?.isPrimary === 'boolean'
                ? conv.importMetadata.isPrimary
                : typeof conv.importMetadata?.isPrimary === 'string'
                  ? conv.importMetadata.isPrimary.toLowerCase() === 'true'
                  : false;
          
          return {
          id: conv.sessionId,
            title: normalizedTitle,
          messages: conv.messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            text: msg.content,
            packets: msg.role === 'assistant' ? [{ op: 'answer.v1', payload: { content: msg.content } }] : undefined,
            ts: new Date(msg.timestamp).getTime(),
            metadata: msg.metadata || undefined,
            responseTimeMs: msg.metadata?.responseTimeMs,
            thinkingLog: msg.metadata?.thinkingLog
          })),
          createdAt: conv.messages.length > 0 ? new Date(conv.messages[0].timestamp).getTime() : Date.now(),
          updatedAt: conv.messages.length > 0 ? new Date(conv.messages[conv.messages.length - 1].timestamp).getTime() : Date.now(),
          archived: false,
          importMetadata: (conv as any).importMetadata || null,
          constructId,
          runtimeId,
          isPrimary,
          canonicalForRuntime: isPrimary && constructId ? runtimeId || constructId : null
          };
        });
        
        console.log(`✅ [Layout.tsx] Loaded ${loadedThreads.length} conversations from VVAULT`);
        
        // Check if there's a thread ID in the URL that we should preserve
        const urlThreadId = activeId;
        const preferredUrlThreadId = preferCanonicalThreadId(urlThreadId, loadedThreads);
        const hasUrlThread = preferredUrlThreadId && loadedThreads.some(t => t.id === preferredUrlThreadId);

        let filteredThreads = filterThreadsWithCanonicalPreference(loadedThreads);
        const synthCanonicalThread = getCanonicalThreadForKeys(loadedThreads, ['synth', 'synth-001']);
        const synthCanonicalHasMessages = Boolean(synthCanonicalThread && (synthCanonicalThread.messages?.length ?? 0) > 0);
        let runtimeScopedThreads = filterByActiveRuntime(filteredThreads, activeRuntimeId);
        const backendDown = backendUnavailable || isBackendUnavailable;
        let fallbackThread: Thread | null = null;
        
        // Guard clause: Skip thread creation if canonical Synth thread exists with messages
        if (synthCanonicalHasMessages) {
          console.log('✅ [Layout.tsx] Canonical Synth thread exists with messages - skipping thread creation');
        } else if (filteredThreads.length === 0 && !hasUrlThread) {
        // Only create a new welcome thread if:
        // 1. No conversations loaded from VVAULT
        // 2. AND no thread ID in URL (or URL thread doesn't exist in loaded conversations)
          // 3. AND canonical thread doesn't exist or is empty
          console.log('🎯 [Layout.tsx] No conversations and no URL thread - creating Synth-001');
          const urlRuntimeHint = extractRuntimeKeyFromThreadId(preferredUrlThreadId || urlThreadId);
          const shouldForceCanonicalSynth =
            !preferredUrlThreadId &&
            !synthCanonicalThread?.id &&
            urlRuntimeHint === DEFAULT_SYNTH_RUNTIME_ID;

          const defaultThreadId =
            preferredUrlThreadId ||
            synthCanonicalThread?.id ||
            (shouldForceCanonicalSynth ? DEFAULT_SYNTH_CANONICAL_SESSION_ID : `synth_${Date.now()}`);
          const synthConstructId =
            synthCanonicalThread?.constructId ||
            (defaultThreadId === DEFAULT_SYNTH_CANONICAL_SESSION_ID ? DEFAULT_SYNTH_CANONICAL_CONSTRUCT_ID : DEFAULT_SYNTH_CANONICAL_CONSTRUCT_ID);
          const welcomeTimestamp = Date.now();
          const localNow = new Date();
          const hour = localNow.getHours();
          let greeting = 'Hey';
          if (hour < 12) greeting = 'Good morning';
          else if (hour < 17) greeting = 'Good afternoon';
          else if (hour < 21) greeting = 'Good evening';
          const timeString = localNow.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          const weekday = localNow.toLocaleDateString('en-US', { weekday: 'long' });
          const welcomeText = `${greeting}! I'm Synth, your main AI companion in Chatty. It's ${timeString} on ${weekday}, so let me know what I can help you with today.`;
          const canonicalConstructId = synthCanonicalThread?.constructId || DEFAULT_SYNTH_CANONICAL_CONSTRUCT_ID;
          const finalConstructId = canonicalConstructId === 'synth' ? DEFAULT_SYNTH_CANONICAL_CONSTRUCT_ID : canonicalConstructId;
          
          const defaultThread: Thread = {
            id: defaultThreadId,
            title: 'Synth',
            messages: [],
            createdAt: welcomeTimestamp,
            updatedAt: welcomeTimestamp,
            archived: false,
            constructId: finalConstructId,
            runtimeId: DEFAULT_SYNTH_RUNTIME_ID,
            isPrimary: true,
            isFallback: backendDown
          };
          
          loadedThreads.push(defaultThread);
          filteredThreads = filterThreadsWithCanonicalPreference(loadedThreads);
          runtimeScopedThreads = filterByActiveRuntime(filteredThreads, activeRuntimeId);
          fallbackThread = defaultThread;
          
          // Guard clause: Skip createConversation if canonical thread exists with messages
          if (backendDown) {
            console.log('⚠️ [Layout.tsx] Backend unavailable; created local Synth fallback without VVAULT save');
          } else if (synthCanonicalHasMessages) {
            console.log('✅ [Layout.tsx] Canonical Synth thread exists with messages - skipping createConversation');
          } else {
          console.log('💾 [Layout.tsx] Creating Synth-001 in VVAULT...');
          try {
              await conversationManager.createConversation(userId, defaultThreadId, 'Synth', finalConstructId);
            console.log('✅ [Layout.tsx] Synth conversation structure created');
              console.log('🔍 [Layout.tsx] Verify at: /vvault/users/shard_0000/{userId}/instances/synth-001/chatty/chat_with_synth-001.md');
          } catch (error) {
            console.error('❌ [Layout.tsx] Failed to create Synth conversation in VVAULT:', error);
            }
          }
        } else if (hasUrlThread) {
          console.log(`✅ [Layout.tsx] Found existing thread in URL: ${urlThreadId} - continuing conversation`);
        } else if (loadedThreads.length > 0) {
          console.log(`✅ [Layout.tsx] Found ${loadedThreads.length} existing conversations - continuing`);
        }
        
        const canonicalThreads = runtimeScopedThreads.filter(thread => thread.isPrimary && thread.constructId)
        const nonCanonical = runtimeScopedThreads.filter(thread => !canonicalThreads.includes(thread))
        let sortedThreads = [
          ...canonicalThreads,
          ...nonCanonical.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        ]

        if (backendDown && fallbackThread) {
          sortedThreads = [fallbackThread];
        }
        
        console.log(`✅ [Layout.tsx] Prepared ${sortedThreads.length} conversations`);
        
        console.log('🔍 [Layout.tsx] Threads state after loading:', sortedThreads);
        console.log('🔍 [Layout.tsx] Number of threads:', sortedThreads.length);
        if (sortedThreads.length > 0) {
          console.log('🔍 [Layout.tsx] First thread details:', {
            id: sortedThreads[0].id,
            title: sortedThreads[0].title,
            messageCount: sortedThreads[0].messages.length,
            archived: sortedThreads[0].archived
          });
        }
        
        console.log('🔄 [Layout.tsx] Setting threads in state...');
        setThreads(sortedThreads);

        const urlRuntimeHint = extractRuntimeKeyFromThreadId(urlThreadId);
        const shouldRedirectToCanonical =
          Boolean(urlRuntimeHint && preferredUrlThreadId && preferredUrlThreadId !== urlThreadId);
        let didNavigateToCanonical = false;

        if (shouldRedirectToCanonical && urlThreadId && preferredUrlThreadId) {
          const requestedPath = `/app/chat/${urlThreadId}`;
          const canonicalPath = `/app/chat/${preferredUrlThreadId}`;
          if (location.pathname === requestedPath) {
            console.log('🎯 [Layout.tsx] URL points to runtime thread, redirecting to canonical:', {
              requested: urlThreadId,
              canonical: preferredUrlThreadId
            });
            navigate(canonicalPath);
            didNavigateToCanonical = true;
          }
        }
        
        // Only navigate to conversation if user is already on a specific chat route
        // If on /app or /app/, show home page instead
        const initialPath = initialPathRef.current
        const isAppRoot = initialPath === '/app' || initialPath === '/app/'
        const isChatRoute = initialPath.startsWith('/app/chat') && initialPath !== '/app/chat'
        const shouldFocusFirstConversation = isChatRoute && !isAppRoot

        if (!didNavigateToCanonical && sortedThreads.length > 0 && shouldFocusFirstConversation) {
          const firstThread = sortedThreads[0];
          const targetPath = `/app/chat/${routeIdForThread(firstThread.id, sortedThreads)}`;
          console.log(`🎯 [Layout.tsx] Preparing to show conversation: ${firstThread.title} (${firstThread.id})`);
          if (location.pathname !== targetPath) {
            console.log(`🎯 [Layout.tsx] Navigating to: ${targetPath}`);
            navigate(targetPath, { state: { activeRuntimeId } });
          } else {
            console.log(`📍 [Layout.tsx] Already on route: ${targetPath}`);
          }
        } else if (isAppRoot) {
          // Show home page when landing on /app
          if (location.pathname !== '/app') {
            console.log('🏠 [Layout.tsx] Navigating to home page');
            navigate('/app');
          } else {
            console.log('📍 [Layout.tsx] Already on home page');
          }
        } else if (sortedThreads.length === 0) {
          console.warn('⚠️ [Layout.tsx] No threads to navigate to - showing home page');
          if (location.pathname !== '/app') {
            navigate('/app');
          }
        } else {
          console.log('🧭 [Layout.tsx] Preserving current route (non-chat destination detected)');
        }
        
      } catch (error) {
        hasAuthenticatedRef.current = false;
        if (!cancelled) {
          console.error('❌ [Layout.tsx] Fatal error in auth effect:', error);
          if (error instanceof Error && error.stack) {
            console.error('❌ [Layout.tsx] Error stack:', error.stack);
          }
          
          // === EMERGENCY FALLBACK - CREATE SYNTH CONVERSATION WITH WELCOME MESSAGE ===
          console.log('🚨 [Layout.tsx] Creating emergency Synth conversation with welcome message');
          const emergencyThreadId = `synth_emergency_${Date.now()}`;
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
        if (!cancelled) {
          console.log('🛑 [Layout.tsx] Auth effect complete - isLoading → false');
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(safetyTimeout);
      hasAuthenticatedRef.current = false;
    };
  }, [navigate])

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

      // New conversations use 'lin' runtime (everything except synth uses lin)
      const newConversation = await conversationManager.createConversation(userId, initialTitle, undefined, 'lin');
      
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

      console.log(`✅ Created new conversation via VVAULT: ${thread.id}`);
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
    
    // 5. Query relevant identity/memories for prompt injection
    let relevantMemories: Array<{ context: string; response: string; timestamp: string; relevance: number }> = []
    try {
      const constructCallsign = thread.constructId || 'synth-001'
      console.log(`🧠 [Layout.tsx] Querying identity for construct: ${constructCallsign}`)
      relevantMemories = await conversationManager.loadMemoriesForConstruct(
        user.id || user.sub || '',
        constructCallsign,
        input, // Use user's message as query
        5 // Limit to 5 most relevant identity/memories
      )
      if (relevantMemories.length > 0) {
        console.log(`✅ [Layout.tsx] Found ${relevantMemories.length} relevant identity/memories`)
      }
    } catch (error) {
      console.warn('⚠️ [Layout.tsx] Failed to load identity (non-critical):', error)
      // Continue without identity - don't break conversation flow
    }

    // 6. Generate AI response with callbacks
    const { AIService } = await import('../lib/aiService')
    const aiService = AIService.getInstance()
    
    // Format identity/memories as seamless background context
    // Simple conversation pairs that inform responses naturally, without meta-commentary
    const memoryContext = relevantMemories.length > 0
      ? relevantMemories.slice(0, 5).map((m, idx) => 
          `[${idx + 1}] User: ${m.context}\nYou: ${m.response}`
        ).join('\n\n')
      : ''
    
    // Inject memories directly into instructions if we have a constructId and memories
    // Weave memories naturally into instructions as background context, not separate directives
    let enhancedInstructions = null
    if (thread.constructId && relevantMemories.length > 0 && memoryContext) {
      try {
        // Get AI config to access current instructions
        const aiId = `gpt-${thread.constructId}` // Format: gpt-katana-001
        const aiConfig = await aiService.getAI(aiId)
        
        // Get base instructions (should already include legal frameworks from AIManager)
        let baseInstructions = aiConfig.instructions || ''
        
        // Ensure legal frameworks are present (fallback if not already included)
        if (!baseInstructions.includes('LEGAL FRAMEWORKS (HARDCODED')) {
          const { buildLegalFrameworkSection } = await import('../lib/legalFrameworks')
          baseInstructions += buildLegalFrameworkSection()
        }
        
        // Inject memories seamlessly as background context that informs responses
        // Format: base instructions + natural memory context (no meta-directives)
        enhancedInstructions = `${baseInstructions}\n\n[Background context from past conversations:]\n${memoryContext}`
        console.log(`✅ [Layout.tsx] Injected ${relevantMemories.length} memories into instructions for ${thread.constructId}`)
      } catch (error) {
        console.warn(`⚠️ [Layout.tsx] Failed to get AI config for ${thread.constructId}, using memory context in UI context only:`, error)
      }
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
      // Pass memories as background context via UI context, not in user message
      // This prevents the AI from responding about the memories themselves
      // CRITICAL: Also pass constructId so the backend can inject memories into instructions
      const enhancedUiContext = memoryContext 
        ? { 
            ...mergedUiContext, 
            additionalNotes: [...(mergedUiContext.additionalNotes || []), memoryContext],
            constructId: thread.constructId, // Pass constructId so backend can fetch AI config and inject memories
            enhancedInstructions: enhancedInstructions // Pass enhanced instructions if we have them
          }
        : { 
            ...mergedUiContext,
            constructId: thread.constructId // Always pass constructId
          }
      
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
      }, enhancedUiContext)
      
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
    const targetId = preferCanonicalThreadId(threadId, threads) || threadId
    const routedId = routeIdForThread(targetId, threads)
    if (targetId !== threadId) {
      console.log(
        '🧭 [Layout.tsx] Routing to canonical thread instead of runtime thread:',
        { requested: threadId, canonical: targetId }
      )
    }
    navigate(`/app/chat/${routedId}`, { state: { activeRuntimeId } })
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

  function handleShowRuntimeDashboard() {
    setShowRuntimeDashboard(true)
  }

  function handleCloseRuntimeDashboard() {
    setShowRuntimeDashboard(false)
  }

  function handleSearchResultClick(threadId: string, messageId: string) {
    const targetId = preferCanonicalThreadId(threadId, threads) || threadId
    const routedId = routeIdForThread(targetId, threads)
    navigate(`/app/chat/${routedId}`, { state: { activeRuntimeId } })
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
        {/* Sidebar - hide when runtime dashboard is open */}
        {!showRuntimeDashboard && (
          <Sidebar
            conversations={synthAddressBookThreads as any}
            threads={threads as any}
            currentConversationId={activeId}
            onConversationSelect={(id: string) => {
              console.log('🖱️ [Layout.tsx] Sidebar thread selected:', id);
              handleThreadClick(id);
            }}
            onNewConversation={newThread}
            onNewConversationWithGPT={(gptId: string) => { navigate('/app/gpts/new') }}
            onDeleteConversation={deleteThread}
            onRenameConversation={renameThread}
            onArchiveConversation={archiveThread}
            onShareConversation={handleShareConversation}
            onOpenExplore={handleExploreClick}
            onOpenCodex={() => navigate('/app/codex')}
            onOpenLibrary={() => navigate('/app/library')}
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
          <Outlet context={{ threads, sendMessage, renameThread, newThread, toggleSidebar, activeThreadId: activeId, appendMessageToThread, navigate }} />
        </main>
        <StorageFailureFallback info={storageFailureInfo} onClose={closeStorageFailure} />

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
            runtimes={[]} // TODO: Load actual runtimes from imported data
            onSelect={(runtime) => {
              console.log('Selected runtime:', runtime)
              // TODO: Navigate to runtime or show details
              handleCloseRuntimeDashboard()
            }}
            onDismiss={handleCloseRuntimeDashboard}
          />
        )}
      </div>
    </ThemeProvider>
  )
}
