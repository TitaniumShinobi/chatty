// @ts-nocheck
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { fetchMe, logout, getUserId, type User } from "../lib/auth";
import {
  VVAULTConversationManager,
  type ConversationThread,
} from "../lib/vvaultConversationManager";
// Import message recovery utility (exposes window.recoverMessages)
import "../lib/messageRecovery";
import StorageFailureFallback from "./StorageFailureFallback";
import { ThemeProvider } from "../lib/ThemeContext";
import { SettingsProvider, useSettings } from "../context/SettingsContext";
import { useIdleTimeout } from "../hooks/useIdleTimeout";
import { Z_LAYERS } from "../lib/zLayers";
// icons not needed here after Sidebar is used
import SearchPopup from "./SearchPopup";
import Sidebar from "./Sidebar";
import SettingsModal from "./SettingsModal";
import ProjectsModal from "./ProjectsModal";
import ShareConversationModal from "./ShareConversationModal";
// RuntimeDashboard removed - using automatic runtime orchestration
import ZenGuidance from "./ZenGuidance";
import { useZenGuidance } from "../hooks/useZenGuidance";
import { AIService } from "../lib/aiService";
import {
  deduplicateThreadsById as deduplicateThreadsByIdUtil,
  isGPTConstruct,
  getCanonicalIdForGPT,
} from "../lib/threadUtils";
import {
  createErrorActiveConversationHydrationState,
  createIdleActiveConversationHydrationState,
  createLoadingActiveConversationHydrationState,
  createSnapshotReplayActiveConversationHydrationState,
  decodeRuntimeResumeAnchorParam,
  deriveActiveConversationHydrationState,
  deriveActiveConversationHydrationStateFromTranscript,
  reconcileIncomingThreadsForActiveRoute,
} from "../lib/vvaultConversationHydration";
import {
  classifyVvaultFailure,
  deriveVvaultUiStatus,
  getVvaultUiStatusCopy,
  shouldHonorAsyncChatNavigation,
  type VvaultFailureClassification,
} from "../lib/pageSwitchStability";
import { bootstrapConstructs } from "../lib/masterScripts";
import { GPTService, type GPTConfig } from "../lib/gptService";
import type { AIConfig } from "../lib/aiService";
import type { UIContextSnapshot, Message as ChatMessage, Attachment } from "../types";
import { WorkspaceContextBuilder } from "../engine/context/WorkspaceContextBuilder";
import { resolveAddressBookAvatar } from "../lib/addressBookAvatarPolicy";
import { resolveAvatarFields } from "../lib/avatarUrl";
import { safeMode, safeImport } from "../lib/safeMode";
import { uploadAttachments, imageAttachmentsToAttachments } from "../lib/attachmentService";
import {
  BrowserRuntimeOrchestrator,
  BrowserRuntimeContextManager,
} from "../lib/browserStubs";

// Add timestamps to console output for easier traceability
const patchConsoleWithTimestamp = () => {
  const anyConsole = console as any;
  if (anyConsole.__tsPatched) return;
  const withTs =
    (fn: (...args: any[]) => void) =>
    (...args: any[]) =>
      fn(new Date().toISOString(), ...args);
  console.log = withTs(console.log.bind(console));
  console.error = withTs(console.error.bind(console));
  console.warn = withTs(console.warn.bind(console));
  anyConsole.__tsPatched = true;
};
patchConsoleWithTimestamp();

// Lazy load orchestration modules with safe mode fallbacks
const loadOrchestrationModules = async () => {
  const [
    DynamicPersonaOrchestratorModule,
    AutomaticRuntimeOrchestratorModule,
    RuntimeContextManagerModule,
  ] = await Promise.all([
    safeImport(
      "DynamicPersonaOrchestrator",
      async () => {
        const mod = await import(
          "../engine/orchestration/DynamicPersonaOrchestrator"
        );
        return mod.DynamicPersonaOrchestrator;
      },
      null,
    ),
    safeImport(
      "AutomaticRuntimeOrchestrator",
      async () => {
        const mod = await import("../lib/automaticRuntimeOrchestrator");
        return mod.AutomaticRuntimeOrchestrator;
      },
      BrowserRuntimeOrchestrator,
    ),
    safeImport(
      "RuntimeContextManager",
      async () => {
        const mod = await import("../lib/runtimeContextManager");
        return mod.RuntimeContextManager;
      },
      BrowserRuntimeContextManager,
    ),
  ]);

  return {
    DynamicPersonaOrchestrator: DynamicPersonaOrchestratorModule,
    AutomaticRuntimeOrchestrator:
      AutomaticRuntimeOrchestratorModule?.getInstance
        ? AutomaticRuntimeOrchestratorModule.getInstance()
        : AutomaticRuntimeOrchestratorModule ||
          BrowserRuntimeOrchestrator.getInstance(),
    RuntimeContextManager: RuntimeContextManagerModule?.getInstance
      ? RuntimeContextManagerModule.getInstance()
      : RuntimeContextManagerModule ||
        BrowserRuntimeContextManager.getInstance(),
  };
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text?: string;
  packets?: import("../types").AssistantPacket[];
  ts: number;
  timestamp?: string;
  files?: { name: string; size: number; type?: string }[];
  typing?: boolean; // For typing indicators
  responseTimeMs?: number;
  thinkingLog?: string[];
  isDateHeader?: boolean; // True for date separator messages (hidden from UI, preserved in transcript)
  metadata?: {
    responseTimeMs?: number;
    thinkingLog?: string[];
    unsaved?: boolean;
    tool_trace?: Array<{
      tool: string;
      provider: string;
      input: string;
      ts: string;
      success: boolean;
      result_ref?: string;
    }>;
  };
};
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
  isIndexHydrated?: boolean;
  avatar?: string | null;
  avatarUrl?: string | null;
};

const VVAULT_FILESYSTEM_ROOT = import.meta.env.VITE_VVAULT_ROOT_PATH || "";
const DEFAULT_ZEN_CANONICAL_SESSION_ID = "zen-001_chat_with_zen-001";
const DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID = "zen-001";
const DEFAULT_ZEN_RUNTIME_ID = "zen-001";

function isCanonicalZenThreadId(threadId: string | null | undefined): boolean {
  return threadId === DEFAULT_ZEN_CANONICAL_SESSION_ID;
}

function mapChatMessageToThreadMessage(message: ChatMessage): Message | null {
  const parsedTs = message.timestamp ? Date.parse(message.timestamp) : NaN;
  const ts = Number.isFinite(parsedTs) ? parsedTs : Date.now();
  const timestampIso = message.timestamp || new Date(ts).toISOString();
  const mapFiles = (files?: File[]) =>
    (files ?? []).map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
    }));

  switch (message.role) {
    case "user":
      return {
        id: message.id,
        role: "user",
        text: message.content,
        ts,
        timestamp: timestampIso,
        files: mapFiles(message.files),
        isDateHeader: (message as any).isDateHeader || false,
      };
    case "assistant": {
      // Handle both string content (from VVAULT) and packet arrays (from live chat)
      let packets: import("../types").AssistantPacket[];
      if (Array.isArray(message.content)) {
        // Already in packet format
        packets = message.content;
      } else if (typeof message.content === "string" && message.content.length > 0) {
        // String content from VVAULT - wrap in proper packet structure
        packets = [{ op: "answer.v1", payload: { content: message.content } }];
      } else {
        // Fallback for empty content
        packets = [{ op: "answer.v1", payload: { content: "" } }];
      }

      return {
        id: message.id,
        role: "assistant",
        packets,
        ts,
        timestamp: timestampIso,
        files: mapFiles(message.files),
        responseTimeMs: message.metadata?.responseTimeMs,
        thinkingLog: message.metadata?.thinkingLog,
        metadata: message.metadata,
      };
    }
    case "system":
      return {
        id: message.id,
        role: "assistant",
        packets: [{ op: "answer.v1", payload: { content: message.content } }],
        ts,
        timestamp: timestampIso,
      };
    default:
      return null;
  }
}

function IdleTimeoutWatcher({ onTimeout }: { onTimeout: () => void }) {
  const { settings } = useSettings();
  const timeoutMinutes = settings.security.screenTimeout || 0;

  const handleTimeout = useCallback(async () => {
    try {
      await fetch('/api/family/step-up/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
    } catch {}
    onTimeout();
  }, [onTimeout]);

  useIdleTimeout({
    timeoutMinutes,
    onTimeout: handleTimeout,
    enabled: timeoutMinutes > 0,
  });

  return null;
}

export default function Layout() {
  const {
    currentStep,
    currentStepIndex,
    totalSteps,
    isVisible: isGuidanceVisible,
    nextStep,
    previousStep,
    hide: hideGuidance,
  } = useZenGuidance();

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Debug: Log URL on every render

  const [threads, setThreads] = useState<Thread[]>([]);
  const [userGPTs, setUserGPTs] = useState<AIConfig[]>([]);
  const [storageFailureInfo, setStorageFailureInfo] = useState<{
    reason: string;
    key?: string;
    sizeBytes?: number;
  } | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [routeOverlayActive, setRouteOverlayActive] = useState(false);
  // Manual runtime dashboard removed - using automatic orchestration
  const [shareConversationId, setShareConversationId] = useState<string | null>(
    null,
  );
  const [isBackendUnavailable, setIsBackendUnavailable] = useState(false);
  const [vvaultFailureClassification, setVvaultFailureClassification] =
    useState<VvaultFailureClassification>(null);
  const [activeThreadHydration, setActiveThreadHydration] = useState(
    createIdleActiveConversationHydrationState(),
  );
  const [vvaultRetryCount, setVvaultRetryCount] = useState(0);
  const [isRetryingVVAULT, setIsRetryingVVAULT] = useState(false);
  const pendingStarterRef = useRef<{
    threadId: string;
    starter: string;
    files: File[];
  } | null>(null);
  const hasAuthenticatedRef = useRef(false);
  // Use window.location.pathname for initial path since React Router's location may be stale on first render
  const initialPathRef = useRef(typeof window !== 'undefined' ? window.location.pathname : location.pathname);

  useEffect(() => {
    // This allows recovery from React state if server restarts before messages are saved
    if (typeof window !== "undefined") {
      (window as any).__CHATTY_THREADS__ = threads;
    }
  }, [threads]);

  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const reconcileActiveRouteThreadOverwrite = useCallback(
    (
      prevThreads: Thread[],
      nextThreads: Thread[],
      {
        activeThreadId,
        hydrationSource = null,
        hydrationComplete = false,
      }: {
        activeThreadId?: string | null;
        hydrationSource?: string | null;
        hydrationComplete?: boolean;
      } = {},
    ) =>
      reconcileIncomingThreadsForActiveRoute({
        currentThreads: prevThreads,
        incomingThreads: nextThreads,
        activeThreadId: activeThreadId || null,
        incomingHydrationSource: hydrationSource as any,
        incomingHydrationComplete: hydrationComplete,
      }),
    [],
  );

  useEffect(() => {
    const selfpromptLastPoll = { ts: new Date().toISOString() };
    const pollTimer = setInterval(async () => {
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const match = currentPath.match(/\/app\/chat\/(.+)/);
      if (!match) return;
      const activeThreadId = decodeURIComponent(match[1]);
      const activeThread = threadsRef.current.find(t => t.id === activeThreadId);
      if (!activeThread) return;
      const constructId = activeThread.constructId || 'zen-001';
      try {
        const resp = await fetch(`/api/selfprompt/pending?constructId=${encodeURIComponent(constructId)}&threadId=${encodeURIComponent(activeThreadId)}&since=${encodeURIComponent(selfpromptLastPoll.ts)}`, {
          credentials: 'include'
        });
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.ok && data.messages && data.messages.length > 0) {
          selfpromptLastPoll.ts = new Date().toISOString();
          const existingIds = new Set((activeThread.messages || []).map((m: any) => m.id));
          const newMsgs = data.messages.filter((m: any) => !existingIds.has(m.id));
          if (newMsgs.length > 0) {
            setThreads(prev => prev.map(t => {
              if (t.id !== activeThreadId) return t;
              return { ...t, messages: [...t.messages, ...newMsgs] };
            }));
          }
        }
      } catch (_) {}
    }, 10000);
    return () => clearInterval(pollTimer);
  }, []);

  // Listen for custom event to open settings modal
  useEffect(() => {
    const handleOpenSettings = (event: CustomEvent) => {
      setIsSettingsOpen(true);
      // Optionally set active tab if provided in event detail
      // This would require modifying SettingsModal to accept initialTab prop
    };

    window.addEventListener(
      "chatty:open-settings",
      handleOpenSettings as EventListener,
    );

    return () => {
      window.removeEventListener(
        "chatty:open-settings",
        handleOpenSettings as EventListener,
      );
    };
  }, []);

  const activeId = useMemo(() => {
    const match = location.pathname.match(/^\/app\/chat\/(.+)$/);
    return match ? match[1] : null;
  }, [location.pathname]);
  const activeRuntimeId = (location.state as any)?.activeRuntimeId || null;

  useEffect(() => {
    setIsSearchOpen(false);
    setIsProjectsOpen(false);
    setIsSettingsOpen(false);
    setShareConversationId(null);
    setRouteOverlayActive(false);
  }, [location.pathname]);

  const shareConversation = useMemo(
    () => threads.find((thread) => thread.id === shareConversationId) || null,
    [threads, shareConversationId],
  );
  const synthAddressBookThreads = useMemo(() => {
    const EXCLUDED_CONSTRUCTS = ['lin-001', 'zen-001', 'zen', 'lin', 'synth-001', 'synth'];
    
    // Get threads that have a constructId (excluding system constructs)
    // Also filter out legacy files (those with .md in the title - raw filenames)
    // Enhance with avatar from matching GPT
    const conversationThreads = threads
      .filter((t) => 
        t.constructId && 
        !EXCLUDED_CONSTRUCTS.includes(t.constructId) &&
        !t.title?.endsWith('.md')
      )
      .map(t => {
        const matchingGPT = userGPTs.find(gpt => gpt.constructCallsign === t.constructId);
        const threadAvatar = resolveAvatarFields(t as any);
        const gptAvatar = resolveAvatarFields(matchingGPT as any);
        const resolvedAvatar = resolveAddressBookAvatar({
          ...t,
          avatar: threadAvatar.avatar,
          avatarUrl: threadAvatar.avatarUrl,
          allowBackendAvatarRoute: true,
          gptAvatarByConstructId:
            matchingGPT?.constructCallsign && gptAvatar.avatar
              ? { [matchingGPT.constructCallsign]: gptAvatar.avatar }
              : null,
        });
        return {
          ...t,
          avatar: resolvedAvatar.avatarSrc,
          avatarUrl: resolvedAvatar.avatarSrc,
        };
      });
    
    // Create contact cards for GPTs that don't have a conversation thread yet
    // Also exclude system constructs (Zen, Lin, Synth) - they're nav items, not address book contacts
    const existingConstructIds = new Set(conversationThreads.map(t => t.constructId));
    const gptContactCards: Thread[] = [];
    for (const gpt of userGPTs) {
      if (!gpt.constructCallsign) {
        continue;
      }
      if (EXCLUDED_CONSTRUCTS.includes(gpt.constructCallsign)) {
        continue;
      }
      if (existingConstructIds.has(gpt.constructCallsign)) {
        continue;
      }
      const gptAvatar = resolveAvatarFields(gpt as any);
      const resolvedAvatar = resolveAddressBookAvatar({
        constructId: gpt.constructCallsign || gpt.id,
        avatar: gptAvatar.avatar,
        avatarUrl: gptAvatar.avatarUrl,
        allowBackendAvatarRoute: true,
        gptAvatarByConstructId:
          gpt.constructCallsign && gptAvatar.avatar
            ? { [gpt.constructCallsign]: gptAvatar.avatar }
            : null,
      });
      gptContactCards.push({
        id: `${gpt.constructCallsign}_contact`,
        title: gpt.name,
        messages: [],
        createdAt: new Date(gpt.createdAt).getTime(),
        updatedAt: new Date(gpt.updatedAt).getTime(),
        archived: false,
        constructId: gpt.constructCallsign || gpt.id,
        runtimeId: gpt.constructCallsign || gpt.id,
        isPrimary: false,
        avatar: resolvedAvatar.avatarSrc,
        avatarUrl: resolvedAvatar.avatarSrc,
      });
    }
    
    const allContacts = [...conversationThreads, ...gptContactCards];
    
    // Deduplicate by constructId - keep only the most recent thread per construct
    const seenConstructIds = new Set<string>();
    const deduplicatedContacts = allContacts
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) // Most recent first
      .filter(t => {
        if (!t.constructId || seenConstructIds.has(t.constructId)) return false;
        seenConstructIds.add(t.constructId);
        return true;
      });
    
    
    return deduplicatedContacts;
  }, [threads, userGPTs]);

  // Calculate hasBlockingOverlay early (before any early returns)
  const hasBlockingOverlay =
    isSearchOpen ||
    isProjectsOpen ||
    isSettingsOpen ||
    Boolean(shareConversation) ||
    Boolean(storageFailureInfo) ||
    routeOverlayActive;

  // #region agent log
  useEffect(() => {
    const devEndpoint = () => {
      const loc = (globalThis as any).location as Location | undefined;
      if (!loc?.origin) return "";
      const u = new URL(loc.origin);
      u.protocol = "http:";
      u.port = "7243";
      u.pathname = "/ingest/9aa5e079-2a3d-44e1-a152-645d01668332";
      u.search = "";
      u.hash = "";
      return u.toString();
    };
    const endpoint =
      import.meta.env.VITE_AGENT_LOG_URL ||
      (import.meta.env.DEV ? devEndpoint() : "");

    if (!endpoint) return;

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "Layout.tsx:211",
        message: "hasBlockingOverlay calculation",
        data: {
          hasBlockingOverlay,
          pathname: location.pathname,
          isSearchOpen,
          isProjectsOpen,
          isSettingsOpen,
          shareConversation: Boolean(shareConversation),
          storageFailureInfo: Boolean(storageFailureInfo),
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "C",
      }),
    }).catch(() => {});
  }, [
    hasBlockingOverlay,
    location.pathname,
    isSearchOpen,
    isProjectsOpen,
    isSettingsOpen,
    shareConversation,
    storageFailureInfo,
  ]);
  // #endregion

  // Verify that a message persisted to VVAULT; dev-only safeguard to catch drops early
  const verifyMessagePersisted = useCallback(
    async (
      threadId: string,
      role: "user" | "assistant",
      content?: string,
      isoTimestamp?: string,
    ) => {
      // Retry in case the write is still flushing
      const attempts = 5;
      const delayMs = 500;
      const vvaultUserId = getUserId(user as any) || user?.email;
      if (!vvaultUserId) return;

      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          const conversations =
            await VVAULTConversationManager.getInstance().loadAllConversations(
              vvaultUserId,
              true,
            );
          let convo = conversations.find((c) => c.sessionId === threadId);

          // Fallback: Zen sessions often normalize to canonical file-based IDs (zen-001_chat_with_zen-001)
          // even if the UI threadId differs. Try to locate by constructId/name to avoid false negatives.
          if (!convo) {
            const zenCandidate = conversations.find(
              (c) =>
                (c.constructId && c.constructId.toLowerCase() === "zen-001") ||
                (c.title && c.title.toLowerCase().includes("zen")),
            );
            if (zenCandidate) {
              convo = zenCandidate;
            }
          }

          if (!convo || !Array.isArray(convo.messages)) {
            console.error(
              "❌ [Layout.tsx] Persistence check failed: conversation missing",
              {
                threadId,
              },
            );
            return;
          }

          const found = convo.messages.some((m) => {
            if (m.role !== role) return false;
            if (isoTimestamp && m.timestamp) {
              return m.timestamp === isoTimestamp;
            }
            if (content) {
              return (m.content || "").trim() === content.trim();
            }
            return true;
          });

          if (found) return;
        } catch (err) {
          console.warn(
            "⚠️ [Layout.tsx] Persistence check errored (non-blocking):",
            err,
          );
          return;
        }

        // wait before next attempt
        await new Promise((res) => setTimeout(res, delayMs));
      }

      console.error(
        "❌ [Layout.tsx] Persistence check failed: message not found in VVAULT",
        {
          threadId,
          role,
          isoTimestamp,
          contentPreview: content?.slice(0, 100),
        },
      );
    },
    [user],
  );

  // Debug logging for overlay state (must be before any conditional returns)
  useEffect(() => {
  }, [
    hasBlockingOverlay,
    isSearchOpen,
    isProjectsOpen,
    isSettingsOpen,
    shareConversation,
    storageFailureInfo,
  ]);

  useEffect(() => {
    if (!activeId) {
      setActiveThreadHydration(createIdleActiveConversationHydrationState());
      return;
    }

    if (isLoading) {
      setActiveThreadHydration(createLoadingActiveConversationHydrationState(activeId));
      return;
    }

    const activeThread = threads.find((thread) => thread.id === activeId) || null;
    if (!activeThread) {
      setActiveThreadHydration(
        deriveActiveConversationHydrationStateFromTranscript({
          threadId: activeId,
          transcriptMessages: [],
          transcriptContent: "",
        }),
      );
      return;
    }

    if (activeThread.isIndexHydrated) {
      setActiveThreadHydration({
        status: "partial",
        threadId: activeId,
        hydrationSource: "index",
        hydrationComplete: false,
        message:
          "Conversation index loaded, but full VVAULT hydration did not complete for this thread.",
      });
      return;
    }

    setActiveThreadHydration(
      deriveActiveConversationHydrationStateFromTranscript({
        threadId: activeId,
        transcriptSource:
          activeThread.importMetadata?.persistenceSource === "local-deferred"
            ? "local-deferred"
            : "full",
        transcriptMessages: activeThread.messages || [],
      }),
    );
  }, [activeId, isLoading, threads]);

  function createThread(title = "New conversation"): Thread {
    const timestamp = Date.now();
    return {
      id: crypto.randomUUID(),
      title,
      messages: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      archived: false,
    };
  }

  // Startup health check for storage quota (non-blocking)
  useEffect(() => {
    const nav: any = navigator;
    const check = async () => {
      try {
        if (nav.storage && typeof nav.storage.estimate === "function") {
          const est = await nav.storage.estimate();
          const remaining = (est.quota || 0) - (est.usage || 0);
          // If remaining is less than 200KB, warn the user
          if (remaining < 200 * 1024) {
            // Note: storageFailureCallback is not currently implemented
            // setStorageFailureInfo({ reason: 'low_quota', sizeBytes: remaining })
          }
        }
      } catch (e) {
        // ignore
      }
    };
    check();
  }, []);

  function closeStorageFailure() {
    setStorageFailureInfo(null);
  }

  function extractRuntimeKeyFromThreadId(threadId?: string | null) {
    if (!threadId) return null;
    const match = threadId.match(/^([a-zA-Z0-9-]+)_[0-9]{6,}$/);
    return match ? match[1] : null;
  }

  function getCanonicalThreadForKeys(
    threadList: Thread[],
    keys: (string | null | undefined)[],
  ) {
    const lookup = new Set(
      (keys.filter(Boolean) as string[]).map((k) => k.toLowerCase()),
    );
    if (lookup.size === 0) return null;

    return (
      threadList.find((thread) => {
        if (!thread.isPrimary || !thread.constructId) return false;
        const threadKeys = [
          thread.constructId,
          thread.runtimeId,
          thread.canonicalForRuntime,
        ]
          .filter(Boolean)
          .map((k) => (k as string).toLowerCase());
        return threadKeys.some((key) => lookup.has(key));
      }) || null
    );
  }

  function preferCanonicalThreadId(
    threadId: string | null | undefined,
    threadList: Thread[],
  ) {
    if (!threadId) return null;
    const target = threadList.find((t) => t.id === threadId);
    const runtimeHint = extractRuntimeKeyFromThreadId(threadId);
    const canonical = getCanonicalThreadForKeys(threadList, [
      target?.constructId,
      target?.runtimeId,
      target?.canonicalForRuntime,
      runtimeHint,
    ]);
    if (!canonical) {
      if (runtimeHint === DEFAULT_ZEN_RUNTIME_ID) {
        return DEFAULT_ZEN_CANONICAL_SESSION_ID;
      }
      return threadId;
    }

    if (canonical.id === threadId) return threadId;

    const isRuntimeLikeId = Boolean(runtimeHint);
    const isNonPrimaryThread = target ? !target.isPrimary : false;

    return isRuntimeLikeId || isNonPrimaryThread ? canonical.id : threadId;
  }

  function filterThreadsWithCanonicalPreference(threadList: Thread[]) {
    const canonicalKeys = new Set<string>();

    threadList.forEach((thread) => {
      if (thread.isPrimary && thread.constructId) {
        [thread.constructId, thread.runtimeId, thread.canonicalForRuntime]
          .filter(Boolean)
          .forEach((key) => canonicalKeys.add((key as string).toLowerCase()));
      }
    });

    return threadList.filter((thread) => {
      if (thread.isPrimary && thread.constructId) return true;
      const runtimeHint = extractRuntimeKeyFromThreadId(thread.id);
      const keys = [thread.constructId, thread.runtimeId, runtimeHint]
        .filter(Boolean)
        .map((k) => (k as string).toLowerCase());
      const hasCanonical = keys.some((key) => canonicalKeys.has(key));
      if (!hasCanonical) return true;
      const isRuntimeTimestampThread = Boolean(runtimeHint);
      return !isRuntimeTimestampThread;
    });
  }

  // Normalize constructId by removing -001 suffix for matching
  function normalizeConstructId(id: string | null | undefined): string {
    if (!id) return "";
    return id
      .toLowerCase()
      .replace(/-001$/, "")
      .replace(/[-_]\d+$/, "");
  }

  function filterByActiveRuntime(
    threadList: Thread[],
    activeRuntimeId?: string | null,
  ) {if (!activeRuntimeId) {return threadList;
    }
    const target = activeRuntimeId.toLowerCase();
    const normalizedTarget = normalizeConstructId(target);
    const filtered = threadList.filter((thread) => {
      const construct = normalizeConstructId(thread.constructId);
      const runtime = (thread.runtimeId || "").toLowerCase();
      const idHint = extractRuntimeKeyFromThreadId(thread.id)?.toLowerCase();
      const normalizedIdHint = normalizeConstructId(idHint || "");
      const matches =
        construct === normalizedTarget ||
        runtime === target ||
        normalizedIdHint === normalizedTarget ||
        idHint === target;return matches;
    });return filtered;
  }

  function preserveActiveRouteThread(
    filteredThreads: Thread[],
    runtimeScopedThreads: Thread[],
    activeThreadId: string | null | undefined,
  ) {
    if (!activeThreadId) return runtimeScopedThreads;
    if (runtimeScopedThreads.some((thread) => thread.id === activeThreadId)) {
      return runtimeScopedThreads;
    }
    const activeRouteThread =
      filteredThreads.find((thread) => thread.id === activeThreadId) || null;
    if (!activeRouteThread) {
      return runtimeScopedThreads;
    }
    return [activeRouteThread, ...runtimeScopedThreads];
  }

  function routeIdForThread(threadId: string, threadList: Thread[]) {
    const thread = threadList.find((t) => t.id === threadId);
    // Route GPT threads (non-Zen, non-Lin) to canonical format
    if (thread?.constructId && 
        thread.constructId !== 'zen-001' && 
        thread.constructId !== 'lin-001' &&
        thread.constructId !== 'zen' &&
        thread.constructId !== 'lin' &&
        !threadId.includes('_chat_with_')) {
      return `${thread.constructId}_chat_with_${thread.constructId}`;
    }
    if (thread && thread.isPrimary && thread.constructId) {
      return `${thread.constructId}_chat_with_${thread.constructId}`;
    }
    return threadId;
  }

  // Professional conversation saving with fail-safes
  useEffect(() => {
    if (user && user.sub && threads.length > 0) {
      const conversationManager = VVAULTConversationManager.getInstance();
      conversationManager
        .saveUserConversations(user, threads)
        .catch((error) => {
          console.error("❌ Failed to save conversations:", error);
        });
    }
  }, [threads, user]);

  // Handle authentication - runs once per mount
  useEffect(() => {
    // Prevent multiple runs - check ref first
    if (hasAuthenticatedRef.current) {
      return;
    }

    // Set ref immediately to prevent concurrent runs
    hasAuthenticatedRef.current = true;

    // Also check if user is already set (from previous run)
    if (user) {
      hasAuthenticatedRef.current = false; // Reset so it can run if user changes
      return;
    }

    let cancelled = false;

    // Safety timeout: ensure loading state is cleared after 30 seconds max
    // (VVAULT + Supabase avatar resolution can take 15-20s under load)
    const safetyTimeout = setTimeout(() => {
      if (!cancelled) {
        console.warn(
          "⚠️ [Layout.tsx] Auth effect timeout - forcing isLoading to false",
        );
        setIsLoading(false);
      }
    }, 30000);

    (async () => {
      try {
        setIsLoading(true);

        const me = await fetchMe();

        if (cancelled || !me) {
          hasAuthenticatedRef.current = false;
          if (!cancelled) {
            navigate("/");
            setIsLoading(false);
          }
          return;
        }

        setUser(me);

        // Load user's custom GPTs for Address Book (decoupled - updates UI independently)
        let gpts: AIConfig[] = [];
        const gptsPromise = (async () => {
          try {
            const aiService = AIService.getInstance();
            const loaded = await aiService.getAllAIs();
            if (!cancelled) {
              setUserGPTs(loaded);
            }
            return loaded;
          } catch (gptError) {
            console.warn("⚠️ [Layout.tsx] Failed to load GPTs (non-fatal):", gptError);
            return [];
          }
        })();

        // Bootstrap constructs with master scripts (autonomy stack)
        try {
          gpts = await gptsPromise;
          const constructIds = ["zen-001", "lin-001", ...gpts.map((g: AIConfig) => g.constructCallsign || `${g.name.toLowerCase()}-001`)];
          const bootstrapResult = await bootstrapConstructs(constructIds);
          if (bootstrapResult.success) {
          } else {
            console.warn("⚠️ [Layout.tsx] Some constructs failed to bootstrap:", bootstrapResult.errors);
          }
        } catch (bootstrapError) {
          console.warn("⚠️ [Layout.tsx] Master scripts bootstrap failed (non-fatal):", bootstrapError);
        }


        // Wait for backend to be ready before making VVAULT requests
        try {
          const { waitForBackendReady } = await import("../lib/backendReady");
          await waitForBackendReady(5, (attempt) => {
            if (attempt === 1) {
            }
          });
        } catch (error) {
          console.warn(
            "⚠️ [Layout.tsx] Backend readiness check failed, continuing anyway:",
            error,
          );
        }

        const conversationManager = VVAULTConversationManager.getInstance();
        const userId = me.sub || me.id || getUserId(me);
        // Use email for VVAULT lookup since user IDs might not match (Chatty uses MongoDB ObjectId, VVAULT uses LIFE format)
        const vvaultUserId = me.email || userId;
        const transcriptsPath = `${VVAULT_FILESYSTEM_ROOT}/users/shard_0000/${userId}/instances/`;

        // Load VVAULT conversations with timeout protection (but don't race - wait for actual result)
        let vvaultConversations: any[] = [];
        let backendUnavailable = false;
        let nextFailureClassification: VvaultFailureClassification = null;
        let startupCreationBlocked = false;
        try {const vvaultPromise =
            conversationManager.loadAllConversationsResponse(vvaultUserId);

          // Use Promise.race but track which one won
          let timeoutFired = false;
          const timeoutId = setTimeout(() => {
            timeoutFired = true;
            console.warn(
              "⚠️ [Layout.tsx] VVAULT loading timeout after 15s - this is just a warning, waiting for actual result...",
            );
          }, 15000); // Increased to 15s, but don't resolve with empty array

          try {
            const vvaultResponse = await vvaultPromise;clearTimeout(timeoutId); // Cancel timeout if promise resolves first
            vvaultConversations = vvaultResponse.conversations;
            if (!cancelled) {
              setActiveThreadHydration(
                deriveActiveConversationHydrationState(vvaultResponse, activeId),
              );
            }
            if (timeoutFired) {
            }
          } catch (promiseError) {
            clearTimeout(timeoutId);
            throw promiseError;
          }
        } catch (vvaultError) {
          console.error("❌ [Layout.tsx] VVAULT loading error:", vvaultError);
          vvaultConversations = []; // Use empty array on error
          const message = (vvaultError as any)?.message || "";
          const classifiedFailure = classifyVvaultFailure(message);
          backendUnavailable = classifiedFailure.backendUnavailable || Boolean(message);
          nextFailureClassification = classifiedFailure.classification;
          if (!cancelled && activeId) {
            setActiveThreadHydration(
              createErrorActiveConversationHydrationState(
                activeId,
                message || "VVAULT conversation load failed.",
              ),
            );
          }
        }
        setIsBackendUnavailable(backendUnavailable);
        setVvaultFailureClassification(nextFailureClassification);

        vvaultConversations = vvaultConversations.filter(
          (conv) => conv.constructId !== "synth-001" && conv.constructId !== "synth"
        );

        vvaultConversations.forEach((conv, idx) => {
        });const loadedThreads: Thread[] = vvaultConversations.map((conv) => {
          // Debug: Log raw conversation data before mapping

          const constructId =
            conv.constructId ||
            conv.importMetadata?.constructId ||
            conv.importMetadata?.connectedConstructId ||
            conv.constructFolder ||
            null;

          // Normalize title: strip "Chat with " prefix and callsigns for address book display
          let normalizedTitle =
            conv.title || constructId || conv.sessionId || "Conversation";
          normalizedTitle = normalizedTitle.replace(/^Chat with /i, "");
          // Extract construct name (remove callsigns like "-001")
          normalizedTitle = normalizedTitle.replace(/-\d{3,}$/i, "");
          if (normalizedTitle) {
            normalizedTitle =
              normalizedTitle.charAt(0).toUpperCase() + normalizedTitle.slice(1);
          }
          const runtimeId =
            conv.runtimeId ||
            conv.importMetadata?.runtimeId ||
            (constructId ? constructId.replace(/-001$/, "") : null) ||
            null;
          const isPrimary =
            typeof conv.isPrimary === "boolean"
              ? conv.isPrimary
              : typeof conv.importMetadata?.isPrimary === "boolean"
                ? conv.importMetadata.isPrimary
                : typeof conv.importMetadata?.isPrimary === "string"
                  ? conv.importMetadata.isPrimary.toLowerCase() === "true"
                  : false;

          // Map messages with validation - preserve original order from parsed transcript
          // Use a stable session-level timestamp to avoid React key duplicates across re-renders
          const sessionStableTs = conv.createdAt ? new Date(conv.createdAt).getTime() : 0;
          const mappedMessages = (conv.messages || [])
            .map((msg: any, idx: number) => {
              const hasAttachmentData = Array.isArray(msg.attachments) && msg.attachments.length > 0;
              if (!msg || (!msg.content && !msg.text && !hasAttachmentData)) {
                console.warn("⚠️ [Layout] Invalid message found (no content):", msg);
                return null;
              }
              // Generate STABLE ID - use session ID + index only (no Date.now() to avoid key collisions)
              const messageId = msg.id || `${conv.sessionId}_msg_${idx}`;
              const messageContent = msg.content || msg.text || "";
              // Track if message has an ORIGINAL timestamp from VVAULT metadata (not generated)
              const hasOriginalTimestamp = !!(msg.timestamp && typeof msg.timestamp === 'string' && msg.timestamp.includes('T'));
              // Use original timestamp if available, otherwise use index-based ordering to preserve parse order
              const messageTimestamp = msg.timestamp || msg.ts || null;
              // Calculate stable ts: use parsed timestamp or index-based offset to maintain order
              const ts = messageTimestamp 
                ? (typeof messageTimestamp === 'number' ? messageTimestamp : new Date(messageTimestamp).getTime())
                : sessionStableTs + idx; // Index-based fallback preserves parse order
              
              return {
                id: messageId,
                role: msg.role,
                text: messageContent,
                packets:
                  msg.role === "assistant"
                    ? [{ op: "answer.v1", payload: { content: messageContent } }]
                    : undefined,
                ts,
                parseIndex: idx,
                hasOriginalTimestamp,
                metadata: msg.metadata || undefined,
                attachments: msg.attachments || undefined,
                responseTimeMs: msg.metadata?.responseTimeMs,
                thinkingLog: msg.metadata?.thinkingLog,
                isDateHeader: msg.isDateHeader || false,
              };
            })
            .filter((msg): msg is NonNullable<typeof msg> => msg !== null);

          // Debug: Log after mapping

          if (mappedMessages.length === 0 && (conv.messages?.length || 0) > 0) {
            console.error(
              "❌ [Layout] Message mapping failed - messages were lost!",
              {
                sessionId: conv.sessionId,
                rawCount: conv.messages?.length || 0,
                mappedCount: mappedMessages.length,
                sampleRawMessage: conv.messages?.[0],
              },
            );
          }

          // Normalize thread ID for Zen conversations to match URL pattern
          let threadId = conv.sessionId;
          const isZenConversation =
            constructId === "zen-001" ||
            constructId === "zen" ||
            conv.sessionId === DEFAULT_ZEN_CANONICAL_SESSION_ID ||
            conv.sessionId?.startsWith("zen-001_chat_with_");
          if (isZenConversation) {
            // Use canonical ID format for Zen to match URL routing
            threadId = DEFAULT_ZEN_CANONICAL_SESSION_ID;
          }
          const convAvatar = resolveAvatarFields(conv as any);

          return {
            id: threadId,
            title: normalizedTitle,
            messages: mappedMessages,
            createdAt:
              mappedMessages.length > 0 ? mappedMessages[0].ts : Date.now(),
            updatedAt:
              mappedMessages.length > 0
                ? mappedMessages[mappedMessages.length - 1].ts
                : Date.now(),
            archived: false,
            importMetadata: (conv as any).importMetadata || null,
            constructId,
            runtimeId,
            isPrimary,
            avatar: convAvatar.avatar,
            avatarUrl: convAvatar.avatarUrl,
            canonicalForRuntime:
              isPrimary && constructId ? runtimeId || constructId : null,
          };
        });


        // Log message counts for debugging
        loadedThreads.forEach((thread) => {

          // Special check for Zen
          if (
            thread.constructId === "zen-001" ||
            thread.title.toLowerCase() === "zen"
          ) {
          }
        });

        // Deduplicate threads by ID, using quality scoring (prefers original timestamps over message count)
        const deduplicatedThreads = deduplicateThreadsByIdUtil(loadedThreads);

        // Check if there's a thread ID in the URL that we should preserve
        const urlThreadId = activeId;
        const preferredUrlThreadId = preferCanonicalThreadId(
          urlThreadId,
          deduplicatedThreads,
        );
        const hasUrlThread =
          preferredUrlThreadId &&
          deduplicatedThreads.some((t) => t.id === preferredUrlThreadId);

        let filteredThreads =
          filterThreadsWithCanonicalPreference(deduplicatedThreads);
        const zenCanonicalThread = getCanonicalThreadForKeys(deduplicatedThreads, [
          "zen",
          "zen-001",
        ]);
        const zenCanonicalHasMessages = Boolean(
          zenCanonicalThread && (zenCanonicalThread.messages?.length ?? 0) > 0,
        );let runtimeScopedThreads = filterByActiveRuntime(
          filteredThreads,
          activeRuntimeId,
        );
        runtimeScopedThreads = preserveActiveRouteThread(
          filteredThreads,
          runtimeScopedThreads,
          activeId,
        );
        const backendDown = backendUnavailable || isBackendUnavailable;

        // VVAULT-FIRST PATTERN: Never create local fallbacks when backend is down
        // This ensures single source of truth in Supabase/VVAULT
        if (backendDown) {
          // Do not create local fallback threads or clear the visible shell.
          setIsLoading(false);
          clearTimeout(safetyTimeout);
          return;
        }

        // Guard clause: Skip thread creation if canonical Zen thread exists with messages
        if (zenCanonicalHasMessages) {
        } else if (filteredThreads.length === 0 && !hasUrlThread) {
          // Only create a new Zen thread if:
          // 1. VVAULT is connected (backendDown already handled above)
          // 2. No conversations loaded from VVAULT
          // 3. AND no thread ID in URL
          const defaultThreadId =
            preferredUrlThreadId ||
            zenCanonicalThread?.id ||
            DEFAULT_ZEN_CANONICAL_SESSION_ID;
          const zenConstructId =
            zenCanonicalThread?.constructId ||
            DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID;

          const canonicalConstructId =
            zenCanonicalThread?.constructId ||
            DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID;
          const finalConstructId =
            canonicalConstructId === "zen"
              ? DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID
              : zenConstructId;

          const welcomeTimestamp = Date.now();
          const defaultThread: Thread = {
            id: defaultThreadId,
            title: "Zen",
            messages: [],
            createdAt: welcomeTimestamp,
            updatedAt: welcomeTimestamp,
            archived: false,
            constructId: finalConstructId,
            runtimeId: DEFAULT_ZEN_RUNTIME_ID,
            isPrimary: true,
          };

          // Create in VVAULT first (single source of truth)
          if (!zenCanonicalHasMessages) {
            try {
              await conversationManager.createConversation(
                userId,
                defaultThreadId,
                "Zen",
                finalConstructId,
              );
              // Only add to local state after successful VVAULT creation
              deduplicatedThreads.push(defaultThread);
              filteredThreads = filterThreadsWithCanonicalPreference(deduplicatedThreads);
              runtimeScopedThreads = filterByActiveRuntime(
                filteredThreads,
                activeRuntimeId,
              );
            } catch (error) {
              console.error(
                "❌ [Layout.tsx] Failed to create Zen in VVAULT:",
                error,
              );
              const classifiedFailure = classifyVvaultFailure(
                (error as any)?.message || "",
              );
              // Mark VVAULT as unavailable since write failed
              setIsBackendUnavailable(true);
              setVvaultFailureClassification(classifiedFailure.classification);
              startupCreationBlocked = true;
              // Don't add local state if VVAULT creation failed.
            }
          }
        } else if (hasUrlThread) {
        } else if (deduplicatedThreads.length > 0) {
        }

        const canonicalThreads = runtimeScopedThreads.filter(
          (thread) => thread.isPrimary && thread.constructId,
        );
        const nonCanonical = runtimeScopedThreads.filter(
          (thread) => !canonicalThreads.includes(thread),
        );
        const sortedThreads = [
          ...canonicalThreads,
          ...nonCanonical.sort(
            (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
          ),
        ];

        if (startupCreationBlocked && sortedThreads.length === 0) {
          return;
        }

        if (sortedThreads.length > 0) {
        }

        setThreads(sortedThreads);

        const urlRuntimeHint = extractRuntimeKeyFromThreadId(urlThreadId);
        const shouldRedirectToCanonical = Boolean(
          urlRuntimeHint &&
            preferredUrlThreadId &&
            preferredUrlThreadId !== urlThreadId,
        );
        let didNavigateToCanonical = false;

        if (shouldRedirectToCanonical && urlThreadId && preferredUrlThreadId) {
          const requestedPath = `/app/chat/${urlThreadId}`;
          const canonicalPath = `/app/chat/${preferredUrlThreadId}`;
          if (window.location.pathname === requestedPath) {
            navigate(canonicalPath);
            didNavigateToCanonical = true;
          }
        }

        // Navigation logic - respect non-chat routes like /app/vvault, /app/gpts, /app/explore
        // Use window.location.pathname for current URL since React location may be stale in async callback
        const currentPath = window.location.pathname;
        const initialPath = initialPathRef.current;
        
        
        // Check if current path is a non-chat page that should NOT be navigated away from
        const isNonChatRoute = currentPath.startsWith('/app/') && 
          !currentPath.startsWith('/app/chat') && 
          currentPath !== '/app' && 
          currentPath !== '/app/';
        
        
        if (isNonChatRoute) {
          // User is on a specific page like /app/vvault, /app/gpts - do NOT navigate away
        } else {
          // Navigation decisions must be based on the *current* URL, not the
          // initial path at mount. Users can navigate (e.g. click a thread or the
          // star home button) before the async thread load completes.
          const isAppRoot = currentPath === "/app" || currentPath === "/app/";
          const isChatRoot = currentPath === "/app/chat" || currentPath === "/app/chat/";
          const isSpecificChatRoute = currentPath.startsWith("/app/chat/") && !isChatRoot;
          const shouldFocusFirstConversation = isChatRoot;

          if (
            !didNavigateToCanonical &&
            sortedThreads.length > 0 &&
            shouldFocusFirstConversation
          ) {
            const firstThread = sortedThreads[0];
            const targetPath = `/app/chat/${routeIdForThread(firstThread.id, sortedThreads)}`;
            if (currentPath !== targetPath) {
              navigate(targetPath, { state: { activeRuntimeId } });
            } else {
            }
          } else if (isSpecificChatRoute) {
          } else if (isAppRoot) {
            // Show home page when landing on /app
            if (currentPath !== "/app") {
              navigate("/app");
            } else {
            }
          } else if (sortedThreads.length === 0) {
            console.warn(
              "⚠️ [Layout.tsx] No threads to navigate to - showing home page",
            );
            if (currentPath !== "/app") {
              navigate("/app");
            }
          } else {
          }
        }
      } catch (error) {
        hasAuthenticatedRef.current = false;
        if (!cancelled) {
          console.error("❌ [Layout.tsx] Fatal error in auth effect:", error);
          if (error instanceof Error && error.stack) {
            console.error("❌ [Layout.tsx] Error stack:", error.stack);
          }
          setIsBackendUnavailable(true);
        }
      } finally {
        clearTimeout(safetyTimeout);
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(safetyTimeout);
      hasAuthenticatedRef.current = false;
    };
  }, [navigate]);

  async function handleLogout() {
    setIsSettingsOpen(false);
    if (user) {
      const userId = getUserId(user);
      // Clear user data but preserve backups
      const conversationManager = VVAULTConversationManager.getInstance();
      conversationManager.clearUserData(userId);
    }
    await logout();
    navigate("/");
  }

  // Migrate legacy messages to packet format
  useEffect(() => {
    setThreads((prev) => {
      if (!Array.isArray(prev)) {
        return [];
      }
      let dirty = false;
      const fixed = prev.map((t) => ({
        ...t,
        messages: (t.messages || []).map((m) => {
          if (m.role === "assistant" && !Array.isArray((m as any).packets)) {
            dirty = true;
            return {
              id: m.id,
              role: "assistant" as const,
              ts: (m as any).ts ?? Date.now(),
              packets: [
                {
                  op: "answer.v1",
                  payload: { content: (m as any).text ?? "Legacy message" },
                } as import("../types").AssistantPacket,
              ],
            } as Message;
          }
          return m;
        }),
      }));
      if (dirty && user && user.sub) {
        const conversationManager = VVAULTConversationManager.getInstance();
        conversationManager.saveUserConversations(user, fixed);
      }
      return fixed;
    });
  }, [user]);

  // Force refresh conversations from VVAULT (bypasses cache)
  const forceRefreshConversations = useCallback(async () => {
    if (!user) return;

    const conversationManager = VVAULTConversationManager.getInstance();
    const userId = getUserId(user);
    const vvaultUserId = user.email || userId;

    // Clear cache to force fresh load
    conversationManager.clearCacheForUser(vvaultUserId);

    // Reset auth ref to allow reload
    hasAuthenticatedRef.current = false;

    // Reload conversations
    try {
      const vvaultResponse =
        await conversationManager.loadAllConversationsResponse(vvaultUserId, true);
      const vvaultConversations = vvaultResponse.conversations;
      setIsBackendUnavailable(false);
      setVvaultFailureClassification(null);
      if (activeId) {
        setActiveThreadHydration(
          deriveActiveConversationHydrationState(vvaultResponse, activeId),
        );
      }

      // Convert and set threads (same logic as auth effect)
      const loadedThreads: Thread[] = vvaultConversations.map((conv) => {
        let normalizedTitle = conv.title || "Zen";
        normalizedTitle = normalizedTitle.replace(/^Chat with /i, "");
        normalizedTitle = normalizedTitle.replace(/-\d{3,}$/i, "");

        const constructId =
          conv.constructId ||
          conv.importMetadata?.constructId ||
          conv.importMetadata?.connectedConstructId ||
          conv.constructFolder ||
          null;
        const runtimeId =
          conv.runtimeId ||
          conv.importMetadata?.runtimeId ||
          (constructId ? constructId.replace(/-001$/, "") : null) ||
          null;
        const isPrimary =
          typeof conv.isPrimary === "boolean"
            ? conv.isPrimary
            : typeof conv.importMetadata?.isPrimary === "boolean"
              ? conv.importMetadata.isPrimary
              : typeof conv.importMetadata?.isPrimary === "string"
                ? conv.importMetadata.isPrimary.toLowerCase() === "true"
                : false;
        const convAvatar = resolveAvatarFields(conv as any);

        return {
          id: conv.sessionId,
          title: normalizedTitle,
          messages: conv.messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            text: msg.content,
            packets:
              msg.role === "assistant"
                ? [{ op: "answer.v1", payload: { content: msg.content } }]
                : undefined,
            ts: new Date(msg.timestamp).getTime(),
            timestamp: msg.timestamp,
            metadata: msg.metadata || undefined,
            responseTimeMs: msg.metadata?.responseTimeMs,
            thinkingLog: msg.metadata?.thinkingLog,
            isDateHeader: msg.isDateHeader || false,
          })),
          createdAt:
            conv.messages.length > 0
              ? new Date(conv.messages[0].timestamp).getTime()
              : Date.now(),
          updatedAt:
            conv.messages.length > 0
              ? new Date(
                  conv.messages[conv.messages.length - 1].timestamp,
                ).getTime()
              : Date.now(),
          archived: false,
          importMetadata: (conv as any).importMetadata || null,
          constructId,
          runtimeId,
          isPrimary,
          avatar: convAvatar.avatar,
          avatarUrl: convAvatar.avatarUrl,
          canonicalForRuntime:
            isPrimary && constructId ? runtimeId || constructId : null,
        };
      });

      const filteredThreads =
        filterThreadsWithCanonicalPreference(loadedThreads);
      const runtimeScopedThreads = preserveActiveRouteThread(
        filteredThreads,
        filterByActiveRuntime(
          filteredThreads,
          activeRuntimeId,
        ),
        activeId,
      );
      const canonicalThreads = runtimeScopedThreads.filter(
        (thread) => thread.isPrimary && thread.constructId,
      );
      const nonCanonical = runtimeScopedThreads.filter(
        (thread) => !canonicalThreads.includes(thread),
      );
      const sortedThreads = [
        ...canonicalThreads,
        ...nonCanonical.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
      ];

      setThreads(sortedThreads);
    } catch (error) {
      console.error("❌ [Layout.tsx] Force refresh failed:", error);
      const classifiedFailure = classifyVvaultFailure((error as any)?.message || "");
      setIsBackendUnavailable(true);
      setVvaultFailureClassification(classifiedFailure.classification);
    }
  }, [user, activeId, activeRuntimeId]);

  // Keyboard shortcut: Cmd/Ctrl + Shift + R to force refresh conversations
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "R") {
        e.preventDefault();
        forceRefreshConversations();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [forceRefreshConversations]);

  // VVAULT Connection Retry Handler
  const retryVVAULTConnection = useCallback(async () => {
    if (!user || isRetryingVVAULT) return;
    
    setIsRetryingVVAULT(true);
    setVvaultRetryCount((prev) => prev + 1);
    
    try {
      // Reset auth ref to allow re-running the auth effect
      hasAuthenticatedRef.current = false;
      setIsBackendUnavailable(false);
      setIsLoading(true);
      
      // Force refresh conversations from VVAULT
      await forceRefreshConversations();
      
      // Check if we got any threads
      if (threads.length > 0) {
        setIsBackendUnavailable(false);
      }
    } catch (error) {
      console.error("❌ [Layout.tsx] VVAULT retry failed:", error);
      setIsBackendUnavailable(true);
    } finally {
      setIsRetryingVVAULT(false);
      setIsLoading(false);
    }
  }, [user, isRetryingVVAULT, forceRefreshConversations, threads.length]);

  // Handler for when a new GPT is created - adds thread to sidebar immediately
  const handleGPTCreated = useCallback((gptConfig: { 
    constructId?: string; 
    constructCallsign?: string; 
    name?: string; 
  }) => {
    const constructId = gptConfig.constructId || gptConfig.constructCallsign;
    if (!constructId) {
      console.warn("⚠️ [Layout] handleGPTCreated called without constructId");
      forceRefreshConversations();
      return;
    }

    const sessionId = `${constructId}_chat_with_${constructId}`;
    const now = Date.now();
    
    // Check if thread already exists
    const existingThread = threads.find(
      (t) => t.id === sessionId || t.constructId === constructId
    );
    
    if (existingThread) {
      return;
    }

    // Create new thread for this GPT
    const newGPTThread: Thread = {
      id: sessionId,
      title: gptConfig.name || constructId,
      messages: [],
      createdAt: now,
      updatedAt: now,
      archived: false,
      importMetadata: null,
      constructId,
      runtimeId: constructId,
      isPrimary: false,
      canonicalForRuntime: null,
    };

    setThreads((prev) => {
      // Add new thread, but keep Zen first
      const zenThread = prev.find(
        (t) => t.id === DEFAULT_ZEN_CANONICAL_SESSION_ID ||
               t.constructId === DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID
      );
      const otherThreads = prev.filter(
        (t) => t.id !== DEFAULT_ZEN_CANONICAL_SESSION_ID &&
               t.constructId !== DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID
      );
      
      if (zenThread) {
        return [zenThread, newGPTThread, ...otherThreads];
      }
      return [newGPTThread, ...prev];
    });
  }, [threads, forceRefreshConversations]);

  type ThreadInitOptions = {
    title?: string;
    starter?: string;
    files?: File[];
  };

  async function newThread(options?: ThreadInitOptions) {
    const navigationStartPath = window.location.pathname;
    const trimmedTitle = options?.title?.trim();
    const starterTrimmed = options?.starter?.trim();
    const requestedBlankThread =
      (!trimmedTitle || trimmedTitle.length === 0) &&
      (!starterTrimmed || starterTrimmed.length === 0);
    const initialTitle =
      trimmedTitle && trimmedTitle.length > 0
        ? trimmedTitle
        : starterTrimmed && starterTrimmed.length > 0
          ? starterTrimmed.slice(0, 60)
          : "New conversation";

    if (!user) {
      console.error("❌ Cannot create conversation: No user");
      return null;
    }

    if (requestedBlankThread) {
      return startConversationWithConstruct(
        DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID,
        "Zen",
      );
    }

    try {
      // Create conversation using VVAULT manager
      const conversationManager = VVAULTConversationManager.getInstance();
      const userId = getUserId(user);

      if (!userId) {
        console.error("❌ Cannot create conversation: No user ID");
        return null;
      }

      // Automatically determine optimal runtime for new conversation
      const modules = await loadOrchestrationModules();
      const automaticRuntimeOrchestrator = modules.AutomaticRuntimeOrchestrator;
      const runtimeContextManager = modules.RuntimeContextManager;

      // Analyze conversation context to determine optimal runtime
      const runtimeAssignment =
        await automaticRuntimeOrchestrator.determineOptimalRuntime({
          conversationContent: starterTrimmed || initialTitle,
          userMessage: starterTrimmed,
          userId,
          threadId: "", // Will be set after conversation creation
        });


      // Normalize synth → zen-001 (synth was renamed to zen)
      let normalizedConstructId = runtimeAssignment.constructId;
      if (
        normalizedConstructId === "synth" ||
        normalizedConstructId === "synth-001"
      ) {
        normalizedConstructId = "zen-001";
      }

      const newConversation = await conversationManager.createConversation(
        userId,
        initialTitle,
        undefined,
        normalizedConstructId,
      );

      // Convert VVAULT conversation to Thread format
      const thread: Thread = {
        id: newConversation.id,
        title: newConversation.title,
        messages: newConversation.messages || [],
        createdAt: newConversation.createdAt,
        updatedAt: newConversation.updatedAt,
        archived: newConversation.archived || false,
      };

      // Assign runtime to the newly created thread
      await runtimeContextManager.assignRuntimeToThread(
        thread.id,
        {
          ...runtimeAssignment,
          runtimeId: `${runtimeAssignment.constructId}-${thread.id}`,
        },
        userId,
      );

      setThreads((prev) => [thread, ...prev]);
      if (
        shouldHonorAsyncChatNavigation({
          startPath: navigationStartPath,
          currentPath: window.location.pathname,
        })
      ) {
        navigate(`/app/chat/${thread.id}`);
      }

      if (starterTrimmed && starterTrimmed.length > 0) {
        pendingStarterRef.current = {
          threadId: thread.id,
          starter: starterTrimmed,
          files: options?.files ?? [],
        };
      } else {
        pendingStarterRef.current = null;
      }

      return thread.id;
    } catch (error) {
      console.error("❌ Failed to create new conversation:", error);
      const classifiedFailure = classifyVvaultFailure((error as any)?.message || "");
      setIsBackendUnavailable(true);
      setVvaultFailureClassification(classifiedFailure.classification);
      return null;
    }
  }

  useEffect(() => {
    const pending = pendingStarterRef.current;
    if (!pending) return;
    const exists = threads.some((t) => t.id === pending.threadId);
    if (!exists) return;
    pendingStarterRef.current = null;
    sendMessage(pending.threadId, pending.starter, pending.files);
  }, [threads]);

  function renameThread(id: string, title: string) {
    const trimmed = title.trim();
    setThreads((ts) =>
      ts.map((t) =>
        t.id === id
          ? {
              ...t,
              title: trimmed || "Untitled conversation",
              updatedAt: Date.now(),
            }
          : t,
      ),
    );
  }

  const appendMessageToThread = (
    threadId: string,
    chatMessage: ChatMessage,
  ) => {
    setThreads((prev) =>
      prev.map((thread) => {
        if (thread.id !== threadId) {
          return thread;
        }

        const converted = mapChatMessageToThreadMessage(chatMessage);
        if (!converted) {
          return thread;
        }

        // IMMEDIATELY save message to VVAULT (CRITICAL: Never lose conversations)
        if (user) {
          const conversationManager = VVAULTConversationManager.getInstance();
          let content = "";
          if (typeof chatMessage.content === "string") {
            content = chatMessage.content;
          } else if (Array.isArray(chatMessage.content)) {
            content = chatMessage.content
              .map((p) => {
                if (
                  p &&
                  typeof p === "object" &&
                  "payload" in p &&
                  p.payload &&
                  typeof p.payload === "object" &&
                  "content" in p.payload
                ) {
                  return String(p.payload.content || "");
                }
                return "";
              })
              .join("\n");
          }

          conversationManager
            .addMessageToConversation(user, threadId, {
              role: chatMessage.role,
              content: content,
              timestamp: chatMessage.timestamp || new Date().toISOString(),
            })
            .catch((error) => {
              console.error(
                `❌ [VVAULT] Failed to save message to VVAULT for thread ${threadId}:`,
                error,
              );
              console.error("❌ [VVAULT] Error details:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status,
                stack: error.stack,
              });
            });
        }

        return {
          ...thread,
          messages: [...thread.messages, converted],
          updatedAt: Date.now(),
        };
      }),
    );
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const isImageFile = (file: File): boolean => {
    return file.type.startsWith('image/');
  };

  async function sendMessage(
    threadId: string,
    input: string,
    files?: File[],
    passedImageAttachments?: Array<{ name: string; type: string; data: string }>,
    uiOverrides?: UIContextSnapshot,
  ) {

    // Use passed imageAttachments if provided, otherwise convert from files
    let imageAttachments: Array<{ name: string; type: string; data: string }>;
    let docFiles: File[];
    
    if (passedImageAttachments && passedImageAttachments.length > 0) {
      // Images already converted by MessageBar
      imageAttachments = passedImageAttachments;
      docFiles = files || [];
    } else {
      // Legacy path: convert files to imageAttachments
      const imageFiles = (files || []).filter(f => isImageFile(f));
      docFiles = (files || []).filter(f => !isImageFile(f));
      
      imageAttachments = await Promise.all(
        imageFiles.map(async (file) => ({
          name: file.name,
          type: file.type,
          data: await fileToBase64(file)
        }))
      );
      
      if (imageAttachments.length > 0) {
      }
    }

    if (!user) {
      console.error("❌ [Layout.tsx] No user session - cannot save to VVAULT");
      alert("No active user session. Please log in again.");
      return;
    }

    const thread = threads.find((t) => t.id === threadId);
    if (!thread) {
      console.error("❌ [Layout.tsx] Thread not found:", threadId);
      return;
    }

    if (input.trim().startsWith('/mirror')) {
      const parts = input.trim().split(/\s+/);
      const subCmd = parts[1] || '';
      const mc = (window as any).__mirrorControls;

      if (subCmd === 'stop') {
        mc?.stop?.();
        const stopMsg = 'Mirror capture stopped. Widget remains visible for quick restart.';
        setThreads(prev => prev.map(t => {
          if (t.id !== threadId) return t;
          return {
            ...t,
            messages: [...t.messages, {
              id: `mirror-${Date.now()}`,
              role: 'assistant' as const,
              text: stopMsg,
              timestamp: new Date().toISOString(),
              packets: [{ type: 'text', payload: { content: stopMsg } }],
              tool_trace: [{ tool: 'mirror', detail: 'action=stop' }]
            }]
          };
        }));
      } else if (subCmd === 'close') {
        mc?.close?.();
        const closeMsg = 'Mirror closed. Widget hidden, capture ended.';
        setThreads(prev => prev.map(t => {
          if (t.id !== threadId) return t;
          return {
            ...t,
            messages: [...t.messages, {
              id: `mirror-${Date.now()}`,
              role: 'assistant' as const,
              text: closeMsg,
              timestamp: new Date().toISOString(),
              packets: [{ type: 'text', payload: { content: closeMsg } }],
              tool_trace: [{ tool: 'mirror', detail: 'action=close' }]
            }]
          };
        }));
      } else if (['read', 'write', 'both'].includes(subCmd)) {
        mc?.setPermission?.(subCmd as 'read' | 'write' | 'both');
        const modeMsg = `Mirror mode set to: ${subCmd}`;
        setThreads(prev => prev.map(t => {
          if (t.id !== threadId) return t;
          return {
            ...t,
            messages: [...t.messages, {
              id: `mirror-${Date.now()}`,
              role: 'assistant' as const,
              text: modeMsg,
              timestamp: new Date().toISOString(),
              packets: [{ type: 'text', payload: { content: modeMsg } }],
              tool_trace: [{ tool: 'mirror', detail: `action=setMode mode=${subCmd}` }]
            }]
          };
        }));
      } else {
        mc?.openSetup?.();
      }
      return;
    }

    if (input.trim().startsWith('/capabilities')) {
      const constructId = thread.constructId || 'zen-001';
      try {
        const resp = await fetch(`/api/capabilities/${encodeURIComponent(constructId)}/${encodeURIComponent(threadId)}`, {
          credentials: 'include',
        });
        const data = await resp.json();
        let capMsg = 'Unable to retrieve capabilities.';
        if (data.ok && data.manifest) {
          const m = data.manifest;
          const enabled = Object.entries(m.enabled).filter(([, v]) => v).map(([k]) => k);
          const disabled = Object.entries(m.enabled).filter(([, v]) => !v).map(([k]) => k);
          const lines = [`**Capabilities for ${constructId}**`];
          if (enabled.length) lines.push(`Enabled: ${enabled.join(', ')}`);
          if (disabled.length) lines.push(`Disabled: ${disabled.join(', ')}`);
          if (m.state.mirrorActive) lines.push(`Mirror: active (${m.state.mirrorPermission || 'n/a'})`);
          if (m.state.selfpromptOn) lines.push(`Selfprompt: on (${m.state.selfpromptInterval || 60}s)`);
          if (m.hard_blocked?.length) lines.push(`Blocked: ${m.hard_blocked.join(', ')}`);
          capMsg = lines.join('\n');
        }
        setThreads(prev => prev.map(t => {
          if (t.id !== threadId) return t;
          return {
            ...t,
            messages: [...t.messages, {
              id: `capabilities-${Date.now()}`,
              role: 'assistant' as const,
              text: capMsg,
              timestamp: new Date().toISOString(),
              packets: [{ type: 'text', payload: { content: capMsg } }],
              tool_trace: [{ tool: 'capabilities', detail: 'query' }]
            }]
          };
        }));
      } catch (err: any) {
        console.error('[Layout] capabilities error:', err);
      }
      return;
    }

    if (input.trim().startsWith('/selfprompt')) {
      const parts = input.trim().split(/\s+/);
      const subCmd = parts[1] || 'status';
      const constructId = thread.constructId || 'zen-001';
      let action = 'status';
      let interval: number | undefined;

      if (subCmd === 'on') action = 'on';
      else if (subCmd === 'off') action = 'off';
      else if (subCmd === 'interval') {
        action = 'interval';
        interval = parseInt(parts[2], 10) || 60;
      }

      try {
        const resp = await fetch('/api/selfprompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action, constructId, threadId, interval })
        });
        const data = await resp.json();
        const statusMsg = data.message || `selfprompt: ${data.status || 'unknown'}`;

        setThreads(prev => prev.map(t => {
          if (t.id !== threadId) return t;
          return {
            ...t,
            messages: [...t.messages, {
              id: `selfprompt-${Date.now()}`,
              role: 'assistant' as const,
              text: statusMsg,
              timestamp: new Date().toISOString(),
              packets: [{ type: 'text', payload: { content: statusMsg } }],
              tool_trace: [{ tool: 'selfprompt', detail: `action=${action}` }]
            }]
          };
        }));
      } catch (err: any) {
        console.error('[Layout] selfprompt error:', err);
      }
      return;
    }

    const canonicalZenThread = isCanonicalZenThreadId(threadId);

    // Dynamic persona detection + context lock
    const envValue = import.meta.env.VITE_PERSONA_DETECTION_ENABLED;
    const detectionEnabled =
      !canonicalZenThread && (envValue ?? "true") !== "false";let detectedPersona:
      | import("../engine/character/PersonaDetectionEngine").PersonaSignal
      | undefined;
    let personaContextLock:
      | import("../engine/character/ContextLock").ContextLock
      | null = null;
    let personaSystemPrompt: string | null = null;
    let effectiveConstructId: string | null = canonicalZenThread
      ? DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID
      : thread.constructId || null;

    if (detectionEnabled) {
      try {const workspaceBuilder = new WorkspaceContextBuilder();const workspaceContext = await workspaceBuilder.buildWorkspaceContext(
          user.id || user.sub || "",
          threadId,
          threads as any,
        );const conversationHistory = thread.messages.map((m) => {
          if (m.role === "assistant") {
            const payload = (m.packets || [])
              .map((p) => p?.payload?.content || "")
              .filter(Boolean)
              .join("\n");
            return {
              role: "assistant" as const,
              content: payload || m.text || "",
            };
          }
          return { role: m.role, content: m.text || "" };
        });
        // Load user personalization from profile
        let userPersonalization:
          | {
              nickname?: string;
              occupation?: string;
              tags?: string[];
              aboutYou?: string;
            }
          | undefined = undefined;

        try {
          const profileResponse = await fetch("/api/vvault/profile", {
            credentials: "include",
          }).catch(() => null);

          if (profileResponse?.ok) {
            const profileData = await profileResponse.json();
            if (profileData?.ok && profileData.profile) {
              const profile = profileData.profile;
              if (
                profile.nickname ||
                profile.occupation ||
                (profile.tags && profile.tags.length > 0) ||
                profile.aboutYou
              ) {
                userPersonalization = {
                  nickname: profile.nickname || undefined,
                  occupation: profile.occupation || undefined,
                  tags:
                    profile.tags && profile.tags.length > 0
                      ? profile.tags
                      : undefined,
                  aboutYou: profile.aboutYou || undefined,
                };
              }
            }
          }
        } catch (error) {
          console.warn("[Layout] Failed to load user personalization:", error);
        }

        // Try to use DynamicPersonaOrchestrator if available
        const modules = await loadOrchestrationModules();
        const DynamicPersonaOrchestratorClass =
          modules.DynamicPersonaOrchestrator;
        if (DynamicPersonaOrchestratorClass) {
          try {
            const dynamicOrchestrator = new DynamicPersonaOrchestratorClass();
            const orchestration =
              await dynamicOrchestrator.orchestrateWithDynamicPersona(
                input,
                user.id || user.sub || "",
                workspaceContext,
                conversationHistory,
                threadId,
                undefined, // memoryContext
                userPersonalization, // userProfile with personalization
              );
            detectedPersona = orchestration.detectedPersona;
            personaContextLock = orchestration.contextLock || null;
            personaSystemPrompt = orchestration.systemPrompt || null;
            const lockedConstructId =
              personaContextLock?.personaSignal?.constructId ||
              detectedPersona?.constructId;
            // Use detected persona if confidence is high enough, otherwise fall back to thread's constructId
            if (
              lockedConstructId &&
              (detectedPersona?.confidence || 0) >= 0.7
            ) {
              effectiveConstructId = lockedConstructId;
            } else {
              // Fall back to thread's constructId if detection confidence is low
              effectiveConstructId = thread.constructId || "zen-001";
            }
          } catch (error) {
            console.error(
              "❌ [Layout.tsx] Persona detection/lock failed:",
              error,
            );
            effectiveConstructId = thread.constructId || "zen-001";
            console.warn(
              "⚠️ [Layout.tsx] Falling back to thread constructId:",
              effectiveConstructId,
            );
          }
        } else {
          console.warn(
            "⚠️ [Layout] DynamicPersonaOrchestrator not available, using thread constructId",
          );
          effectiveConstructId = thread.constructId || "zen-001";
        }
      } catch (error) {
        console.error("❌ [Layout.tsx] Persona detection failed:", error);
        effectiveConstructId = thread.constructId || "zen-001";
        console.warn(
          "⚠️ [Layout.tsx] Falling back to thread constructId:",
          effectiveConstructId,
        );
      }
    }

    if (canonicalZenThread) {
      effectiveConstructId = DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID;
    }

    if (!effectiveConstructId) {
      effectiveConstructId = "zen-001";
      console.warn(
        "⚠️ [Layout.tsx] No effective constructId, defaulting to zen-001",
      );
    }

    const conversationManager = VVAULTConversationManager.getInstance();
    const userTimestamp = Date.now();
    const userTimestampIso = new Date(userTimestamp).toISOString();

    // Upload attachments to storage and get permanent URLs
    let persistedAttachments: Attachment[] = [];
    if (imageAttachments.length > 0) {
      const uploadResult = await uploadAttachments({
        userId: user.email || getUserId(user) || user.id || user.sub,
        constructId: thread.constructId || 'unknown',
        conversationId: threadId,
        attachments: imageAttachments
      });
      if (uploadResult.success && uploadResult.attachments.length > 0) {
        persistedAttachments = uploadResult.attachments;
      } else {
        console.warn('⚠️ [Layout.tsx] Attachment upload failed, using base64 fallback');
        persistedAttachments = imageAttachmentsToAttachments(imageAttachments);
      }
    }

    // 1. Show user message immediately
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: input,
      ts: userTimestamp,
      timestamp: userTimestampIso,
      files: docFiles && docFiles.length > 0
        ? docFiles.map((f) => ({ name: f.name, size: f.size }))
        : undefined,
      attachments: persistedAttachments.length > 0 ? persistedAttachments : undefined,
    };

    // 2. Add typing indicator message
    const typingMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      typing: true,
      ts: userTimestamp + 1,
      timestamp: new Date(userTimestamp + 1).toISOString(),
    };

    // 3. Update UI immediately with user message and typing indicator
    setThreads((ts) =>
      ts.map((t) =>
        t.id === threadId
          ? {
              ...t,
              messages: [...t.messages, userMsg, typingMsg],
              updatedAt: Date.now(),
            }
          : t,
      ),
    );

    // 4. IMMEDIATELY save user message to VVAULT
    // CRITICAL: Save happens BEFORE continuing to AI response
    // This ensures user message is persisted even if server restarts during AI processing
    try {
      await conversationManager.addMessageToConversation(user, threadId, {
        role: "user",
        content: input,
        packets: [{ content: input }],
        timestamp: userTimestampIso,
        metadata: {
          files: docFiles && docFiles.length > 0
            ? docFiles.map((f) => ({ name: f.name, size: f.size, type: f.type }))
            : undefined,
          attachments: persistedAttachments.length > 0 
            ? persistedAttachments.map(a => ({
                id: a.id,
                name: a.name,
                mimeType: a.mimeType,
                size: a.size,
                url: a.url,
                role: a.role
              }))
            : undefined,
        },
      });
      verifyMessagePersisted(threadId, "user", input, userTimestampIso);
    } catch (error) {
      console.error(
        "❌ [Layout.tsx] CRITICAL: Failed to save user message:",
        error,
      );
      alert("Failed to save message to VVAULT. Please check console.");
      setThreads((ts) =>
        ts.map((t) =>
          t.id === threadId
            ? {
                ...t,
                messages: t.messages.filter(
                  (m) => m.id !== userMsg.id && m.id !== typingMsg.id,
                ),
              }
            : t,
        ),
      );
      return;
    }

    // 5. Query relevant identity/memories for prompt injection
    let relevantMemories: Array<{
      context: string;
      response: string;
      timestamp: string;
      relevance: number;
    }> = [];
    try {
      const constructCallsign = effectiveConstructId;
      // Get settings from localStorage for memory permission check
      const settings =
        typeof window !== "undefined"
          ? (() => {
              try {
                const stored = localStorage.getItem("chatty_settings_v2");
                return stored ? JSON.parse(stored) : undefined;
              } catch {
                return undefined;
              }
            })()
          : undefined;
      relevantMemories = await conversationManager.loadMemoriesForConstruct(
        user.id || user.sub || "",
        constructCallsign,
        input, // Use user's message as query
        5, // Limit to 5 most relevant identity/memories
        settings,
      );
      if (relevantMemories.length > 0) {
      }
    } catch (error) {
      console.warn(
        "⚠️ [Layout.tsx] Failed to load identity (non-critical):",
        error,
      );
      // Continue without identity - don't break conversation flow
    }

    // 6. Generate AI response with callbacks
    const { AIService } = await import("../lib/aiService");
    const aiService = AIService.getInstance();

    // Format identity/memories as seamless background context
    // Simple conversation pairs that inform responses naturally, without meta-commentary
    const memoryContext =
      relevantMemories.length > 0
        ? relevantMemories
            .slice(0, 5)
            .map(
              (m, idx) => `[${idx + 1}] User: ${m.context}\nYou: ${m.response}`,
            )
            .join("\n\n")
        : "";

    // We no longer inject or mutate AI instructions; keep memory context only in UI notes.
    const enhancedInstructions = null;

    const baseUiContext: UIContextSnapshot = {
      route: location.pathname,
      activeThreadId: threadId,
      sidebar: { collapsed },
      modals: {
        searchOpen: isSearchOpen,
        projectsOpen: isProjectsOpen,
        settingsOpen: isSettingsOpen,
        shareOpen: Boolean(shareConversationId),
      },
      composer: { attachments: (docFiles?.length || 0) + (imageAttachments?.length || 0) },
      zenMode: "zen",
    };
    if (!baseUiContext.activePanel) {
      if (isSearchOpen) {
        baseUiContext.activePanel = "search";
      } else if (isProjectsOpen) {
        baseUiContext.activePanel = "projects";
      } else if (isSettingsOpen) {
        baseUiContext.activePanel = "settings";
      } else if (shareConversationId) {
        baseUiContext.activePanel = "share";
      } else {
        baseUiContext.activePanel = null;
      }
    }
    const mergedUiContext: UIContextSnapshot = {
      ...baseUiContext,
      ...uiOverrides,
      sidebar: { ...baseUiContext.sidebar, ...uiOverrides?.sidebar },
      modals: { ...baseUiContext.modals, ...uiOverrides?.modals },
      composer: { ...baseUiContext.composer, ...uiOverrides?.composer },
      featureFlags: {
        ...baseUiContext.featureFlags,
        ...uiOverrides?.featureFlags,
      },
    };
    const mergedNotes = [
      ...(baseUiContext.additionalNotes ?? []),
      ...(uiOverrides?.additionalNotes ?? []),
    ];
    if (detectedPersona) {
      mergedNotes.push(
        `Persona: ${detectedPersona.constructId}-${detectedPersona.callsign} (confidence ${detectedPersona.confidence.toFixed(
          2,
        )})`,
      );
      detectedPersona.evidence.slice(0, 3).forEach((evidence) => {
        mergedNotes.push(`Persona evidence: ${evidence}`);
      });
    }
    if (mergedNotes.length > 0) {
      mergedUiContext.additionalNotes = mergedNotes;
    }
    const thinkingLog: string[] = [];
    const responseStart = Date.now();
    let finalAssistantPackets: import("../types").AssistantPacket[] | null =
      null;
    let finalAssistantTimestamp = 0;
    let finalAssistantResponseMs = 0;
    let finalAssistantThinking: string[] = [];

    try {
      // Pass memories as background context via UI context, not in user message
      // This prevents the AI from responding about the memories themselves
      // CRITICAL: Also pass constructId so the backend can inject memories into instructions
      // STEP 1: Pass personaSystemPrompt and personaLock to enforce single prompt source
      const enhancedUiContext = memoryContext
        ? {
            ...mergedUiContext,
            additionalNotes: [
              ...(mergedUiContext.additionalNotes || []),
              memoryContext,
            ],
            constructId: effectiveConstructId, // Pass constructId so backend can fetch AI config and inject memories
            personaLock: personaContextLock
              ? {
                  remaining: personaContextLock.remainingMessages,
                  constructId: effectiveConstructId,
                }
              : undefined,
            personaSystemPrompt: personaSystemPrompt || undefined, // STEP 1: Pass orchestrator system prompt
          }
        : {
            ...mergedUiContext,
            constructId: effectiveConstructId, // Always pass constructId
            personaLock: personaContextLock
              ? {
                  remaining: personaContextLock.remainingMessages,
                  constructId: effectiveConstructId,
                }
              : undefined,
            personaSystemPrompt: personaSystemPrompt || undefined, // STEP 1: Pass orchestrator system prompt
          };

      if (personaContextLock && !personaSystemPrompt) {
        console.warn(
          "⚠️ [Layout.tsx] Persona lock active but system prompt missing; proceeding without persona prompt",
        );
      }

      const raw = await aiService.processMessage(
        input,
        docFiles, // Only pass document files for parsing
        {
          onPartialUpdate: (partialContent: string) => {
            const trimmed = (partialContent || "").trim();
            const normalized = trimmed.toLowerCase();
            const statusMessages = new Set([
              "generating…",
              "generating...",
              "synthesizing…",
              "synthesizing...",
            ]);
            const isStatusMessage =
              trimmed.length > 0 && statusMessages.has(normalized);
            const statusDisplay = normalized.startsWith("generating")
              ? "generating…"
              : normalized.startsWith("synthesizing")
                ? "synthesizing…"
                : trimmed;

            if (isStatusMessage) {
              thinkingLog.splice(0, thinkingLog.length);
              thinkingLog.push(statusDisplay);
            } else if (
              trimmed &&
              thinkingLog[thinkingLog.length - 1] !== trimmed
            ) {
              thinkingLog.push(trimmed);
            }
            // Update typing message with partial content
            setThreads((ts) =>
              ts.map((t) =>
                t.id === threadId
                  ? {
                      ...t,
                      messages: t.messages.map((m) =>
                        m.id === typingMsg.id
                          ? {
                              ...m,
                              text: isStatusMessage ? "" : partialContent,
                              typing: true,
                              thinkingLog: [...thinkingLog],
                            }
                          : m,
                      ),
                      updatedAt: Date.now(),
                    }
                  : t,
              ),
            );
          },
          onFinalUpdate: async (
            finalPackets: import("../types").AssistantPacket[],
          ) => {const responseTimeMs = Date.now() - responseStart;
            const filteredThinking: string[] = [];

            // Extract tool_trace from packets (server-authored)
            const toolTrace = finalPackets
              .map((p: any) => p?.payload?.tool_trace)
              .filter(Boolean)
              .flat();

            const providerTrace = finalPackets
              .map((p: any) => p?.payload?.provider_trace)
              .filter(Boolean)[0] || null;
            const hasDoNotPersistFailure = finalPackets.some(
              (packet: any) =>
                packet?.payload?.do_not_persist === true ||
                packet?.payload?.non_canonical_failure === true,
            );

            // Extract content from packets before saving
            const assistantContent = finalPackets
              .map((packet) => {
                if (!packet) return "";
                if (packet.op === "answer.v1" && packet.payload?.content) {
                  return packet.payload.content;
                }
                return "";
              })
              .filter(Boolean)
              .join("\n\n");


            let assistantUnsaved = hasDoNotPersistFailure;
            if (hasDoNotPersistFailure) {
              console.warn(
                "⚠️ [Layout.tsx] Skipping assistant transcript persistence because backend marked the response as non-canonical",
                { threadId },
              );
            } else if (user && assistantContent) {
              const assistantTimestampIso = new Date(
                Date.now() + 2,
              ).toISOString();
              const savePayload = {
                role: "assistant" as const,
                content: assistantContent,
                packets: finalPackets,
                timestamp: assistantTimestampIso,
                metadata: {
                  responseTimeMs,
                  thinkingLog: filteredThinking,
                },
              };
              try {
                await conversationManager.addMessageToConversation(
                  user,
                  threadId,
                  savePayload,
                );
                verifyMessagePersisted(
                  threadId,
                  "assistant",
                  assistantContent,
                  assistantTimestampIso,
                );
              } catch (error) {
                assistantUnsaved = true;
                console.error(
                  "[VVAULT_WRITE_FAIL] onFinalUpdate: Failed to save assistant message",
                  {
                    error,
                    threadId,
                    requestBody: savePayload,
                  },
                );
                // Continue to render UI with unsaved marker for debugging
              }
            } else {
              console.warn(
                "⚠️ [Layout.tsx] onFinalUpdate: Cannot save - missing user or content",
              );
              if (!assistantContent) {
                console.warn(
                  "⚠️ [Layout.tsx] onFinalUpdate: Empty content extracted from packets",
                );
              }
            }

            if (assistantContent.includes("[OPEN_GPT_CREATOR]") && threadId.startsWith("lin-001")) {
              const currentThread = threads.find(t => t.id === threadId);
              const userMessages = currentThread?.messages?.filter(m => m.role === "user") || [];
              const lastUserMsg = userMessages[userMessages.length - 1];
              const gptIdea = lastUserMsg?.text?.replace(/^\/gpt\s*/i, "").trim() || null;
              window.dispatchEvent(new CustomEvent("chatty:open-gpt-creator", {
                detail: { initialMessage: gptIdea || "I want to create a new GPT" }
              }));
            }

            const aiMsg: Message = {
              id: typingMsg.id,
              role: "assistant",
              text: assistantContent,
              packets: finalPackets,
              ts: Date.now() + 2,
              timestamp: new Date(Date.now() + 2).toISOString(),
              responseTimeMs,
              thinkingLog: filteredThinking,
              metadata: {
                responseTimeMs,
                thinkingLog: filteredThinking,
                unsaved: assistantUnsaved,
                tool_trace: toolTrace.length > 0 ? toolTrace : [],
                ...(providerTrace ? { provider_trace: providerTrace } : {}),
              },
            };

            // Expose threads to window for recovery (if browser is still open)
            // This allows recovery from React state if server restarts
            if (typeof window !== "undefined") {
              (window as any).__CHATTY_THREADS__ = threads.map((t) =>
                t.id === threadId
                  ? {
                      ...t,
                      messages: t.messages.map((m) =>
                        m.id === typingMsg.id ? aiMsg : m,
                      ),
                    }
                  : t,
              );
            }

            setThreads((ts) =>
              ts.map((t) =>
                t.id === threadId
                  ? {
                      ...t,
                      messages: t.messages.map((m) =>
                        m.id === typingMsg.id ? aiMsg : m,
                      ),
                      updatedAt: Date.now(),
                    }
                  : t,
              ),
            );

            finalAssistantPackets = finalPackets;
            finalAssistantTimestamp = aiMsg.ts;
            finalAssistantResponseMs = responseTimeMs;
            finalAssistantThinking = filteredThinking;
          },
        },
        {
          threadId,
          constructId: effectiveConstructId,
          uiContext: enhancedUiContext,
          attachments: imageAttachments,
        },
      );

      // Note: Assistant message is now saved INSIDE onFinalUpdate callback
      // This ensures the message is persisted before UI update, preventing loss on server restart
      // The save happens synchronously before setThreads() is called in onFinalUpdate

      // Fallback: if callbacks weren't used, handle the response normally
      if (raw && !Array.isArray(raw)) {
        const packets: import("../types").AssistantPacket[] = [
          { op: "answer.v1", payload: { content: String(raw ?? "") } },
        ];
        const responseTimeMs = Date.now() - responseStart;
        const aiMsg: Message = {
          id: typingMsg.id,
          role: "assistant",
          packets: packets,
          ts: Date.now() + 2,
          timestamp: new Date(Date.now() + 2).toISOString(),
          responseTimeMs,
          thinkingLog: [],
        };

        setThreads((ts) =>
          ts.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id === typingMsg.id ? aiMsg : m,
                  ),
                  updatedAt: Date.now(),
                }
              : t,
          ),
        );

        const assistantIso = new Date(aiMsg.ts).toISOString();
        const savePayload = {
          role: "assistant" as const,
          content: String(raw ?? ""),
          timestamp: assistantIso,
          metadata: {
            responseTimeMs,
          },
        };
        try {
          await conversationManager.addMessageToConversation(
            user,
            threadId,
            savePayload,
          );
          verifyMessagePersisted(
            threadId,
            "assistant",
            String(raw ?? ""),
            assistantIso,
          );
        } catch (error) {
          aiMsg.metadata = { ...(aiMsg.metadata || {}), unsaved: true };
          console.error(
            "[VVAULT_WRITE_FAIL] Fallback: Failed to save assistant message",
            {
              error,
              threadId,
              requestBody: savePayload,
            },
          );
          // keep UI message for debugging
        }
      }
    } catch (error) {
      console.error("❌ [Layout.tsx] Error in sendMessage:", error);
      const errorDetail = error instanceof Error ? error.message : "Unknown error";
      const errorText = `⚠️ Unable to get a response. ${errorDetail !== "Unknown error" ? errorDetail : "Please try again."}`;
      const errorMsg: Message = {
        id: typingMsg.id,
        role: "assistant",
        text: errorText,
        packets: [
          {
            op: "answer.v1",
            payload: {
              content: errorText,
            },
          },
        ],
        ts: Date.now() + 2,
        thinkingLog: thinkingLog.filter((step) => step.trim()),
        metadata: {
          thinkingLog: thinkingLog.filter((step) => step.trim()),
          isError: true,
        },
      };

      setThreads((ts) =>
        ts.map((t) =>
          t.id === threadId
            ? {
                ...t,
                messages: t.messages.map((m) =>
                  m.id === typingMsg.id ? errorMsg : m,
                ),
                updatedAt: Date.now(),
              }
            : t,
        ),
      );
    }

    // Update thread title if needed
    if (thread.title === "New conversation" && input.trim()) {
      renameThread(threadId, input.trim().slice(0, 40));
    }
  }

  function deleteThread(id: string) {
    setThreads((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === prev.length) {
        return prev;
      }

      if (shareConversationId === id) {
        setShareConversationId(null);
      }

      if (next.length === 0) {
        const fallback = createThread();
        setTimeout(() => navigate(`/app/chat/${fallback.id}`), 0);
        return [fallback];
      }

      if (activeId === id) {
        setTimeout(() => navigate(`/app/chat/${next[0].id}`), 0);
      }

      return next;
    });
  }

  function deleteAllThreads() {
    setThreads([]);
    setShareConversationId(null);

    // Create a new empty thread and navigate to it
    const fallback = createThread();
    setTimeout(() => navigate(`/app/chat/${fallback.id}`), 0);
    setThreads([fallback]);
  }

  function archiveThread(id: string, archive = true) {
    setThreads((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, archived: archive, updatedAt: Date.now() } : t,
      ),
    );
  }

  function handleShareConversation(id: string) {
    if (!threads.some((t) => t.id === id)) return;
    setShareConversationId(id);
  }

  function closeShareModal() {
    setShareConversationId(null);
  }

  async function reloadThreadMessages(threadId: string): Promise<void> {

    if (!user) {
      console.error("❌ [Layout] Cannot reload messages: no user session");
      return;
    }

    try {
      setActiveThreadHydration(createLoadingActiveConversationHydrationState(threadId));
      const conversationManager = VVAULTConversationManager.getInstance();
      const transcriptPayload =
        await conversationManager.loadConversationTranscript(threadId);
      const activeThreadHydration =
        transcriptPayload?.source === "snapshot-replay"
          ? createSnapshotReplayActiveConversationHydrationState(threadId)
          : deriveActiveConversationHydrationStateFromTranscript({
              threadId,
              transcriptSource: transcriptPayload?.source || null,
              transcriptContent: transcriptPayload?.content || "",
              transcriptMessages: transcriptPayload?.messages || [],
            });
      const existingThread =
        threadsRef.current.find((thread) => thread.id === threadId) || null;
      const constructId =
        existingThread?.constructId ||
        (isCanonicalZenThreadId(threadId)
          ? DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID
          : threadId.match(/([a-z]+-\d+)/i)?.[1] || null);
      const runtimeId =
        existingThread?.runtimeId ||
        (constructId ? constructId.replace(/-001$/, "") : null) ||
        null;
      const normalizedTitle =
        existingThread?.title ||
        (constructId
          ? constructId.replace(/-\d{3,}$/i, "").replace(/^./, (c) => c.toUpperCase())
          : "Conversation");
      const transcriptMessages = Array.isArray(transcriptPayload?.messages)
        ? transcriptPayload.messages
        : [];
      const updatedThread: Thread = {
        id: threadId,
        title: normalizedTitle,
        messages: transcriptMessages
          .map((msg: any, idx: number) => {
            if (!msg || (!msg.content && !msg.text)) {
              return null;
            }
            const timestamp = msg.timestamp || null;
            return {
              id: msg.id || `${threadId}_msg_${idx}`,
              role: msg.role,
              text: msg.content || msg.text,
              packets:
                msg.role === "assistant"
                  ? [{ op: "answer.v1", payload: { content: msg.content || msg.text } }]
                  : undefined,
              ts: timestamp ? new Date(timestamp).getTime() : idx,
              timestamp: timestamp || undefined,
              metadata: msg.metadata || undefined,
              responseTimeMs: msg.metadata?.responseTimeMs,
              thinkingLog: msg.metadata?.thinkingLog,
              isDateHeader: msg.isDateHeader || false,
            };
          })
          .filter((msg): msg is NonNullable<typeof msg> => msg !== null),
        createdAt:
          transcriptMessages.length > 0
            ? new Date(transcriptMessages[0]?.timestamp || Date.now()).getTime()
            : Date.now(),
        updatedAt:
          transcriptMessages.length > 0
            ? new Date(
                transcriptMessages[transcriptMessages.length - 1]?.timestamp ||
                  Date.now(),
              ).getTime()
            : Date.now(),
        archived: false,
        importMetadata: {
          ...(existingThread?.importMetadata || {}),
          persistenceSource:
            transcriptPayload?.source === "local-deferred"
              ? "local-deferred"
              : existingThread?.importMetadata?.persistenceSource || null,
        },
        constructId,
        runtimeId,
        isPrimary:
          typeof existingThread?.isPrimary === "boolean"
            ? existingThread.isPrimary
            : isCanonicalZenThreadId(threadId),
        canonicalForRuntime: constructId ? runtimeId || constructId : null,
        isIndexHydrated: activeThreadHydration.hydrationComplete !== true,
      };

      setThreads((prevThreads) => {
        const nextThreads = prevThreads.some((thread) => thread.id === threadId)
          ? prevThreads.map((thread) => (thread.id === threadId ? updatedThread : thread))
          : [...prevThreads, updatedThread];
        return reconcileActiveRouteThreadOverwrite(prevThreads, nextThreads, {
          activeThreadId: threadId,
          hydrationSource: activeThreadHydration.hydrationSource,
          hydrationComplete: activeThreadHydration.hydrationComplete,
        });
      });
      setActiveThreadHydration(activeThreadHydration);
    } catch (error) {
      console.error("❌ [Layout] Failed to reload thread messages:", error);
      setActiveThreadHydration(
        createErrorActiveConversationHydrationState(
          threadId,
          (error as any)?.message || "Thread reload failed.",
        ),
      );
      throw error;
    }
  }

  async function startConversationWithConstruct(constructId: string, constructName?: string) {
    const navigationStartPath = window.location.pathname;
    
    if (!user) {
      console.error("❌ Cannot create conversation: No user");
      return null;
    }

    // CRITICAL: Wait for threads to load before creating to prevent race condition duplicates
    if (isLoading) {
      // Navigate to canonical path - once threads load, Chat.tsx will find the right one
      const canonicalSessionId = `${constructId}_chat_with_${constructId}`;
      navigate(`/app/chat/${canonicalSessionId}`);
      return canonicalSessionId;
    }

    // CRITICAL: Check if a thread for this construct already exists
    // This prevents creating duplicate empty threads that hide existing conversations with messages
    const canonicalSessionId = `${constructId}_chat_with_${constructId}`;
    
    // Find all threads for this construct, then pick the best one (prefer threads with messages)
    const matchingThreads = threads.filter(
      (t) => t.id === canonicalSessionId || t.constructId === constructId
    );
    
    if (matchingThreads.length > 0) {
      // Sort: threads with messages first, then by most recent
      const sortedThreads = [...matchingThreads].sort((a, b) => {
        const aMessages = a.messages?.length || 0;
        const bMessages = b.messages?.length || 0;
        if (aMessages !== bMessages) return bMessages - aMessages; // More messages first
        return (b.updatedAt || 0) - (a.updatedAt || 0); // More recent first
      });
      
      const bestThread = sortedThreads[0];
      navigate(`/app/chat/${bestThread.id}`);
      return bestThread.id;
    }

    try {
      const conversationManager = VVAULTConversationManager.getInstance();
      const userId = getUserId(user);

      if (!userId) {
        console.error("❌ Cannot create conversation: No user ID");
        return null;
      }

      // Create a new conversation with canonical session ID format
      const newConversation = await conversationManager.createConversation(
        userId,
        canonicalSessionId,
        constructName || constructId,
        constructId,
      );

      // Convert VVAULT conversation to Thread format
      const thread: Thread = {
        id: newConversation.id,
        title: newConversation.title,
        messages: newConversation.messages || [],
        createdAt: newConversation.createdAt,
        updatedAt: newConversation.updatedAt,
        archived: newConversation.archived || false,
        constructId: constructId,
      };

      setThreads((prev) => [thread, ...prev]);
      if (
        shouldHonorAsyncChatNavigation({
          startPath: navigationStartPath,
          currentPath: window.location.pathname,
        })
      ) {
        navigate(`/app/chat/${thread.id}`);
      }

      return thread.id;
    } catch (error) {
      console.error(`❌ Failed to create conversation with ${constructId}:`, error);
      const classifiedFailure = classifyVvaultFailure((error as any)?.message || "");
      setIsBackendUnavailable(true);
      setVvaultFailureClassification(classifiedFailure.classification);
      return null;
    }
  }

  function handleThreadClick(threadId: string) {

    // Handle GPT contact cards (IDs ending with _contact)
    if (threadId.endsWith('_contact')) {
      const constructId = threadId.replace('_contact', '');
      // Find the GPT name from userGPTs
      const gpt = userGPTs.find(g => g.constructCallsign === constructId);
      
      // Always use canonical format for GPT conversations
      const canonicalId = `${constructId}_chat_with_${constructId}`;
      navigate(`/app/chat/${canonicalId}`);
      return;
    }

    // Check if this is a GPT thread that should use canonical routing
    const clickedThread = threads.find((t: any) => t.id === threadId);
    
    // Always route Lin to canonical format
    if (clickedThread?.constructId === 'lin-001' || clickedThread?.constructId === 'lin' ||
        threadId.toLowerCase().includes('lin')) {
      const canonicalId = 'lin-001_chat_with_lin-001';
      if (threadId !== canonicalId) {
        navigate(`/app/chat/${canonicalId}`);
        return;
      }
    }
    
    if (clickedThread?.constructId && 
        clickedThread.constructId !== 'zen-001' && 
        clickedThread.constructId !== 'lin-001' &&
        clickedThread.constructId !== 'zen' &&
        clickedThread.constructId !== 'lin' &&
        !threadId.includes('_chat_with_')) {
      // Route GPT threads to canonical format
      const canonicalId = `${clickedThread.constructId}_chat_with_${clickedThread.constructId}`;
      navigate(`/app/chat/${canonicalId}`);
      return;
    }

    const targetId = preferCanonicalThreadId(threadId, threads) || threadId;
    const routedId = routeIdForThread(targetId, threads);
    const targetPath = `/app/chat/${routedId}`;

    // Check if selected thread has messages
    const selectedThread = threads.find(
      (t) => t.id === targetId || t.id === routedId,
    );
    if (selectedThread) {
      if (selectedThread.messages.length === 0) {
        console.warn(
          `⚠️ [Layout] Thread "${selectedThread.title}" has no messages - Chat.tsx will trigger reload`,
        );
      }
    } else {
      console.warn(
        `⚠️ [Layout] Thread not found in current threads list: ${targetId}`,
      );
    }


    if (targetId !== threadId) {
    }

    navigate(targetPath, { state: { activeRuntimeId } });
  }

  function handleGPTsClick() {
    navigate("/app/gpts");
  }

  function handleCreateGPTClick() {
    navigate("/app/gpts/new");
  }

  function handleSearchClick() {
    setIsSearchOpen(true);
  }

  function handleLibraryClick() {
    navigate("/app/library");
  }

  function handleCodexClick() {
    navigate("/app/codex");
  }

  function handleExploreClick() {
    navigate("/app/explore");
  }

  function handleProjectsClick() {
    setIsProjectsOpen(true);
  }

  // Manual runtime dashboard functions removed - using automatic orchestration

  function handleSearchResultClick(threadId: string, messageId: string) {
    const targetId = preferCanonicalThreadId(threadId, threads) || threadId;
    const routedId = routeIdForThread(targetId, threads);
    navigate(`/app/chat/${routedId}`, { state: { activeRuntimeId } });
    // TODO: Scroll to specific message
  }

  // Check if we're on a non-chat route that should render even during auth loading
  const isNonChatRouteRender = ["/app/explore", "/app/vvault", "/app/library", "/app/search", "/app/simforge"].some(
    (r) => window.location.pathname.startsWith(r)
  );
  const vvaultUiStatus = deriveVvaultUiStatus({
    backendUnavailable: isBackendUnavailable,
    classification: vvaultFailureClassification,
  });
  const vvaultStatusCopy = getVvaultUiStatusCopy(vvaultUiStatus);
  const showVvaultStatus = Boolean(vvaultStatusCopy) && !isLoading;

  // For chat routes, require user authentication
  // For non-chat routes (VVAULT, GPTs, etc.), show loading state while auth completes
  if (!user) {
    if (isNonChatRouteRender) {
        // Show minimal loading state for non-chat routes while auth completes
      return (
        <div style={{ 
          display: 'flex', 
          height: '100vh', 
          width: '100vw',
          alignItems: 'center', 
          justifyContent: 'center',
          backgroundColor: 'var(--chatty-bg-main, #000110)',
          color: 'var(--chatty-text, #ADA587)'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '14px', opacity: 0.7 }}>Loading...</div>
          </div>
        </div>
      );
    }
    return null; // Will redirect to login for chat routes only
  }

  function toggleSidebar() {
    setCollapsed((s) => !s);
  }return (
    <SettingsProvider>
      <IdleTimeoutWatcher onTimeout={handleLogout} />
      <ThemeProvider user={user}>
        <div
          className="flex h-screen bg-[var(--chatty-bg-main)] text-[var(--chatty-text)] relative"
          style={{ isolation: "isolate" }} // Ensure proper stacking context for children
        >
          {/* Sidebar */}
          {
            <Sidebar
              conversations={synthAddressBookThreads as any}
              threads={threads as any}
              currentConversationId={activeId}
              onConversationSelect={(id: string) => {
                handleThreadClick(id);
              }}
              onNewConversation={newThread}
              onNewConversationWithGPT={(constructId: string) => {
                // Start a new conversation with this specific construct
                startConversationWithConstruct(constructId);
              }}
              onDeleteConversation={deleteThread}
              onRenameConversation={renameThread}
              onArchiveConversation={archiveThread}
              onShareConversation={handleShareConversation}
              onOpenExplore={handleExploreClick}
              onOpenCodex={() => navigate("/app/codex")}
              onOpenLibrary={() => navigate("/app/library")}
              onOpenSearch={handleSearchClick}
              onShowGPTCreator={() => navigate("/app/gpts/new")}
              onShowGPTs={() => navigate("/app/gpts")}
              onOpenProjects={handleProjectsClick}
              collapsed={collapsed}
              onToggleCollapsed={() => setCollapsed(!collapsed)}
              currentUser={user}
              onLogout={handleLogout}
              onShowSettings={() => setIsSettingsOpen(true)}
              hasBlockingOverlay={hasBlockingOverlay}
              isVVAULTConnected={!isBackendUnavailable}
            />
          }

          {/* Main Content */}
          <main
            className="flex-1 flex flex-col"
            style={{
              position: "relative",
              zIndex: hasBlockingOverlay ? Z_LAYERS.base : Z_LAYERS.content,
              pointerEvents: hasBlockingOverlay ? "none" : "auto",
              isolation: "isolate", // Create new stacking context, but lower than sidebar
              overflow: hasBlockingOverlay ? "hidden" : "auto",
            }}
          >
            {showVvaultStatus && vvaultStatusCopy && (
              <div
                role="status"
                aria-live="polite"
                className="mx-4 mt-4 mb-2 flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-sm"
                style={{
                  borderColor: "var(--chatty-border)",
                  backgroundColor: "var(--chatty-bg-secondary)",
                  color: "var(--chatty-text)",
                }}
              >
                <div className="min-w-0">
                  <div className="font-medium">{vvaultStatusCopy.title}</div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--chatty-text-secondary)" }}
                  >
                    {vvaultStatusCopy.message}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={retryVVAULTConnection}
                  disabled={isRetryingVVAULT}
                  className="px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: "var(--chatty-button)",
                    color: "var(--chatty-text-inverse, #fffff0)",
                    border: "1px solid var(--chatty-line)",
                  }}
                >
                  {isRetryingVVAULT ? "Checking..." : "Retry"}
                </button>
              </div>
            )}
            <Outlet
              context={{
                threads,
                isLoading,
                sendMessage,
                renameThread,
                newThread,
                toggleSidebar,
                activeThreadId: activeId,
                appendMessageToThread,
                navigate,
                reloadThreadMessages,
                user,
                handleGPTCreated,
                forceRefreshConversations,
                activeThreadHydration,
                setRouteOverlayActive,
                addressBookContacts: synthAddressBookThreads,
              }}
            />
          </main>
          <StorageFailureFallback
            info={storageFailureInfo}
            onClose={closeStorageFailure}
          />

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
          <ZenGuidance
            isVisible={isGuidanceVisible}
            step={currentStep}
            onClose={hideGuidance}
            onNext={nextStep}
            onPrevious={previousStep}
            currentStepIndex={currentStepIndex}
            totalSteps={totalSteps}
          />
          {/* Manual runtime dashboard removed - using automatic runtime orchestration */}
        </div>
      </ThemeProvider>
    </SettingsProvider>
  );
}
