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
import type { UIContextSnapshot, Message as ChatMessage } from "../types";
import { WorkspaceContextBuilder } from "../engine/context/WorkspaceContextBuilder";
import { safeMode, safeImport } from "../lib/safeMode";
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
  metadata?: {
    responseTimeMs?: number;
    thinkingLog?: string[];
    unsaved?: boolean;
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
};

const VVAULT_FILESYSTEM_ROOT = "/Users/devonwoodson/Documents/GitHub/vvault";
const DEFAULT_ZEN_CANONICAL_SESSION_ID = "zen-001_chat_with_zen-001";
const DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID = "zen-001";
const DEFAULT_ZEN_RUNTIME_ID = "zen-001";

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
      };
    case "assistant": {
      const packets =
        message.content && message.content.length > 0
          ? message.content
          : [
              {
                op: "answer.v1",
                payload: { content: "" },
              } as import("../types").AssistantPacket,
            ];

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

  const [threads, setThreads] = useState<Thread[]>([]);
  const [storageFailureInfo, setStorageFailureInfo] = useState<{
    reason: string;
    key?: string;
    sizeBytes?: number;
  } | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Manual runtime dashboard removed - using automatic orchestration
  const [shareConversationId, setShareConversationId] = useState<string | null>(
    null,
  );
  const [isBackendUnavailable, setIsBackendUnavailable] = useState(false);
  const [vvaultRetryCount, setVvaultRetryCount] = useState(0);
  const [isRetryingVVAULT, setIsRetryingVVAULT] = useState(false);
  const pendingStarterRef = useRef<{
    threadId: string;
    starter: string;
    files: File[];
  } | null>(null);
  const hasAuthenticatedRef = useRef(false);
  const initialPathRef = useRef(location.pathname);

  useEffect(() => {
    console.log("📚 [Layout.tsx] Threads updated (length):", threads.length);
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "Layout.tsx:137",
        message: "Layout: threads updated",
        data: {
          threadCount: threads.length,
          threadIds: threads.map((t) => t.id),
          threadTitles: threads.map((t) => t.title),
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "B",
      }),
    }).catch(() => {});
    // #endregion

    // Expose threads to window for message recovery (if browser is still open)
    // This allows recovery from React state if server restarts before messages are saved
    if (typeof window !== "undefined") {
      (window as any).__CHATTY_THREADS__ = threads;
    }
  }, [threads]);

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

  // #region agent log
  useEffect(() => {
    fetch("http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "Layout.tsx:147",
        message: "Layout: activeRuntimeId state",
        data: {
          activeRuntimeId,
          pathname: location.pathname,
          state: location.state,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run2",
        hypothesisId: "F",
      }),
    }).catch(() => {});
  }, [activeRuntimeId, location.pathname, location.state]);
  // #endregion
  const shareConversation = useMemo(
    () => threads.find((thread) => thread.id === shareConversationId) || null,
    [threads, shareConversationId],
  );
  const synthAddressBookThreads = useMemo(() => {
    // Address Book constructs: Zen (primary) + custom GPTs like Katana
    // Lin is excluded - she's the GPTCreator create tab agent/undertone stabilizer
    const ADDRESS_BOOK_CONSTRUCTS = ['zen-001', 'katana-001'];
    
    const addressBookThreads = threads.filter((t) => 
      t.constructId && ADDRESS_BOOK_CONSTRUCTS.includes(t.constructId)
    );
    
    console.log(`📖 [Layout] Address Book filter: ${addressBookThreads.length} threads from ${threads.length} total`, 
      addressBookThreads.map(t => ({ id: t.id, title: t.title, constructId: t.constructId })));
    
    // Ensure Zen appears first (primary construct)
    const zenThread = addressBookThreads.find(
      (t) => t.id === DEFAULT_ZEN_CANONICAL_SESSION_ID ||
             t.constructId === DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID
    );
    
    if (zenThread) {
      const otherThreads = addressBookThreads.filter(t => t.id !== zenThread.id);
      return [zenThread, ...otherThreads];
    }
    
    return addressBookThreads;
  }, [threads]);

  // Calculate hasBlockingOverlay early (before any early returns)
  const hasBlockingOverlay =
    isSearchOpen ||
    isProjectsOpen ||
    isSettingsOpen ||
    Boolean(shareConversation) ||
    Boolean(storageFailureInfo) ||
    location.pathname.includes("/gpts/new") ||
    location.pathname.includes("/gpts/edit/") ||
    location.pathname.includes("/ais/new") ||
    location.pathname.includes("/ais/edit/");

  // #region agent log
  useEffect(() => {
    fetch("http://127.0.0.1:7243/ingest/9aa5e079-2a3d-44e1-a152-645d01668332", {
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
    console.log("[Layout] hasBlockingOverlay:", hasBlockingOverlay, {
      isSearchOpen,
      isProjectsOpen,
      isSettingsOpen,
      shareConversation: Boolean(shareConversation),
      storageFailureInfo: Boolean(storageFailureInfo),
    });
  }, [
    hasBlockingOverlay,
    isSearchOpen,
    isProjectsOpen,
    isSettingsOpen,
    shareConversation,
    storageFailureInfo,
  ]);

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
  ) {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "Layout.tsx:286",
        message: "filterByActiveRuntime: entry",
        data: {
          activeRuntimeId,
          threadCount: threadList.length,
          threadIds: threadList.map((t) => t.id),
          threadConstructIds: threadList.map((t) => t.constructId),
          threadRuntimeIds: threadList.map((t) => t.runtimeId),
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run2",
        hypothesisId: "G",
      }),
    }).catch(() => {});
    // #endregion
    if (!activeRuntimeId) {
      // #region agent log
      fetch(
        "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "Layout.tsx:287",
            message: "filterByActiveRuntime: no activeRuntimeId, returning all",
            data: { threadCount: threadList.length },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "run2",
            hypothesisId: "G",
          }),
        },
      ).catch(() => {});
      // #endregion
      return threadList;
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
        idHint === target;
      // #region agent log
      fetch(
        "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "Layout.tsx:293",
            message: "filterByActiveRuntime: thread check",
            data: {
              threadId: thread.id,
              threadTitle: thread.title,
              construct,
              runtime,
              idHint,
              normalizedIdHint,
              target,
              normalizedTarget,
              matches,
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "run2",
            hypothesisId: "G",
          }),
        },
      ).catch(() => {});
      // #endregion
      return matches;
    });
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "Layout.tsx:295",
        message: "filterByActiveRuntime: result",
        data: {
          target,
          filteredCount: filtered.length,
          filteredIds: filtered.map((t) => t.id),
          originalCount: threadList.length,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "run2",
        hypothesisId: "G",
      }),
    }).catch(() => {});
    // #endregion
    return filtered;
  }

  function routeIdForThread(threadId: string, threadList: Thread[]) {
    const thread = threadList.find((t) => t.id === threadId);
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
      console.log(
        "⏭️ [Layout.tsx] Auth effect skipped - already authenticated",
      );
      return;
    }

    // Set ref immediately to prevent concurrent runs
    hasAuthenticatedRef.current = true;

    // Also check if user is already set (from previous run)
    if (user) {
      console.log("⏭️ [Layout.tsx] Auth effect skipped - user already set");
      hasAuthenticatedRef.current = false; // Reset so it can run if user changes
      return;
    }

    let cancelled = false;

    // Safety timeout: ensure loading state is cleared after 10 seconds max
    const safetyTimeout = setTimeout(() => {
      if (!cancelled) {
        console.warn(
          "⚠️ [Layout.tsx] Auth effect timeout - forcing isLoading to false",
        );
        setIsLoading(false);
      }
    }, 10000);

    (async () => {
      try {
        console.log("🔍 [Layout.tsx] Auth effect starting");
        setIsLoading(true);

        const me = await fetchMe();
        console.log(
          "✅ [Layout.tsx] fetchMe() resolved:",
          me ? `user: ${me.email}` : "null",
        );

        if (cancelled || !me) {
          hasAuthenticatedRef.current = false;
          if (!cancelled) {
            console.log("🚪 [Layout.tsx] No user session - redirecting to /");
            navigate("/");
            setIsLoading(false);
          }
          return;
        }

        setUser(me);

        console.log(
          "📚 [Layout.tsx] Loading conversations from VVAULT filesystem...",
        );

        // Wait for backend to be ready before making VVAULT requests
        try {
          const { waitForBackendReady } = await import("../lib/backendReady");
          await waitForBackendReady(5, (attempt) => {
            if (attempt === 1) {
              console.log(
                "⏳ [Layout.tsx] Waiting for backend to be ready before loading VVAULT...",
              );
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
        console.log("📁 [Layout.tsx] VVAULT root:", VVAULT_FILESYSTEM_ROOT);
        console.log(
          "📁 [Layout.tsx] User instances directory:",
          transcriptsPath,
        );
        console.log(
          "📁 [Layout.tsx] Using email for VVAULT lookup:",
          vvaultUserId,
        );

        // Load VVAULT conversations with timeout protection (but don't race - wait for actual result)
        let vvaultConversations: any[] = [];
        let backendUnavailable = false;
        try {
          // #region agent log
          fetch(
            "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                location: "Layout.tsx:413",
                message: "Layout: calling loadAllConversations",
                data: { vvaultUserId, userId: me.email || userId },
                timestamp: Date.now(),
                sessionId: "debug-session",
                runId: "run2",
                hypothesisId: "I",
              }),
            },
          ).catch(() => {});
          // #endregion
          const vvaultPromise =
            conversationManager.loadAllConversations(vvaultUserId);

          // Use Promise.race but track which one won
          let timeoutFired = false;
          const timeoutId = setTimeout(() => {
            timeoutFired = true;
            console.warn(
              "⚠️ [Layout.tsx] VVAULT loading timeout after 15s - this is just a warning, waiting for actual result...",
            );
          }, 15000); // Increased to 15s, but don't resolve with empty array

          try {
            vvaultConversations = await vvaultPromise;
            // #region agent log
            fetch(
              "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  location: "Layout.tsx:423",
                  message: "Layout: loadAllConversations completed",
                  data: {
                    count: vvaultConversations.length,
                    conversationIds: vvaultConversations.map(
                      (c) => c.sessionId,
                    ),
                    conversationTitles: vvaultConversations.map((c) => c.title),
                  },
                  timestamp: Date.now(),
                  sessionId: "debug-session",
                  runId: "run2",
                  hypothesisId: "I",
                }),
              },
            ).catch(() => {});
            // #endregion
            clearTimeout(timeoutId); // Cancel timeout if promise resolves first
            if (timeoutFired) {
              console.log(
                "✅ [Layout.tsx] VVAULT loading completed after timeout warning",
              );
            }
          } catch (promiseError) {
            clearTimeout(timeoutId);
            throw promiseError;
          }
        } catch (vvaultError) {
          console.error("❌ [Layout.tsx] VVAULT loading error:", vvaultError);
          vvaultConversations = []; // Use empty array on error
          const message = (vvaultError as any)?.message || "";
          backendUnavailable =
            message.includes("Failed to fetch") ||
            message.includes("Backend route not found") ||
            message.includes("404") ||
            message.includes("ENOENT");
        }
        setIsBackendUnavailable(backendUnavailable);
        console.log("📚 [Layout.tsx] VVAULT returned:", vvaultConversations);

        // Log detailed message information for each conversation
        vvaultConversations.forEach((conv, idx) => {
          console.log(`📋 [Layout] Conversation ${idx + 1}:`, {
            sessionId: conv.sessionId,
            title: conv.title,
            constructId: conv.constructId,
            messageCount: conv.messages?.length || 0,
            messages:
              conv.messages?.map((m: any, i: number) => ({
                index: i,
                id: m.id,
                role: m.role,
                contentLength: m.content?.length || 0,
                contentPreview: m.content?.substring(0, 50) || "no content",
                timestamp: m.timestamp,
              })) || [],
          });
        });

        // #region agent log
        fetch(
          "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "Layout.tsx:418",
              message: "Layout: VVAULT conversations received",
              data: {
                count: vvaultConversations.length,
                conversations: vvaultConversations.map((c) => ({
                  sessionId: c.sessionId,
                  title: c.title,
                  constructId: c.constructId,
                  messageCount: c.messages?.length || 0,
                })),
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run1",
              hypothesisId: "C",
            }),
          },
        ).catch(() => {});
        // #endregion

        const loadedThreads: Thread[] = vvaultConversations.map((conv) => {
          // Debug: Log raw conversation data before mapping
          console.log(`🔍 [Layout] Mapping conversation:`, {
            sessionId: conv.sessionId,
            title: conv.title,
            constructId: conv.constructId,
            rawMessageCount: conv.messages?.length || 0,
            rawMessages:
              conv.messages?.slice(0, 3).map((m: any) => ({
                id: m.id,
                role: m.role,
                contentLength: m.content?.length || 0,
                hasTimestamp: !!m.timestamp,
              })) || [],
          });

          // Normalize title: strip "Chat with " prefix and callsigns for address book display
          let normalizedTitle = conv.title || "Zen";
          // #region agent log
          fetch(
            "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                location: "Layout.tsx:422",
                message: "Layout: title before normalization",
                data: {
                  originalTitle: conv.title,
                  sessionId: conv.sessionId,
                  constructId: conv.constructId,
                },
                timestamp: Date.now(),
                sessionId: "debug-session",
                runId: "run1",
                hypothesisId: "C",
              }),
            },
          ).catch(() => {});
          // #endregion
          // Remove "Chat with " prefix if present
          normalizedTitle = normalizedTitle.replace(/^Chat with /i, "");
          // Extract construct name (remove callsigns like "-001")
          normalizedTitle = normalizedTitle.replace(/-\d{3,}$/i, "");
          // #region agent log
          fetch(
            "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                location: "Layout.tsx:426",
                message: "Layout: title after normalization",
                data: {
                  normalizedTitle,
                  originalTitle: conv.title,
                  sessionId: conv.sessionId,
                },
                timestamp: Date.now(),
                sessionId: "debug-session",
                runId: "run1",
                hypothesisId: "C",
              }),
            },
          ).catch(() => {});
          // #endregion

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

          // Map messages with validation
          const mappedMessages = (conv.messages || [])
            .map((msg: any) => {
              if (!msg || !msg.id) {
                console.warn("⚠️ [Layout] Invalid message found:", msg);
                return null;
              }
              return {
                id: msg.id,
                role: msg.role,
                text: msg.content,
                packets:
                  msg.role === "assistant"
                    ? [{ op: "answer.v1", payload: { content: msg.content } }]
                    : undefined,
                ts: new Date(msg.timestamp).getTime(),
                metadata: msg.metadata || undefined,
                responseTimeMs: msg.metadata?.responseTimeMs,
                thinkingLog: msg.metadata?.thinkingLog,
              };
            })
            .filter((msg): msg is NonNullable<typeof msg> => msg !== null);

          // Debug: Log after mapping
          console.log(`✅ [Layout] Mapped conversation "${normalizedTitle}":`, {
            sessionId: conv.sessionId,
            rawMessageCount: conv.messages?.length || 0,
            mappedMessageCount: mappedMessages.length,
            messageIds: mappedMessages.map((m) => m.id).slice(0, 5),
          });

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
          if (
            constructId === "zen-001" ||
            constructId === "zen" ||
            normalizedTitle.toLowerCase() === "zen"
          ) {
            // Use canonical ID format for Zen to match URL routing
            threadId = DEFAULT_ZEN_CANONICAL_SESSION_ID;
            console.log(
              `🔄 [Layout] Normalized Zen thread ID: ${conv.sessionId} → ${threadId}`,
            );
          }

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
            canonicalForRuntime:
              isPrimary && constructId ? runtimeId || constructId : null,
          };
        });

        console.log(
          `✅ [Layout.tsx] Loaded ${loadedThreads.length} conversations from VVAULT`,
        );

        // Log message counts for debugging
        loadedThreads.forEach((thread) => {
          console.log(
            `📊 [Layout] Thread "${thread.title}" (${thread.id}): ${thread.messages.length} messages`,
            {
              messageIds: thread.messages.map((m) => m.id).slice(0, 5),
              firstMessage: thread.messages[0]
                ? {
                    role: thread.messages[0].role,
                    textPreview: (thread.messages[0].text || "").substring(
                      0,
                      50,
                    ),
                  }
                : null,
              constructId: thread.constructId,
              isPrimary: thread.isPrimary,
            },
          );

          // Special check for Zen
          if (
            thread.constructId === "zen-001" ||
            thread.title.toLowerCase() === "zen"
          ) {
            console.log(`🔍 [Layout] ZEN THREAD FOUND:`, {
              id: thread.id,
              expectedId: DEFAULT_ZEN_CANONICAL_SESSION_ID,
              matches: thread.id === DEFAULT_ZEN_CANONICAL_SESSION_ID,
              messageCount: thread.messages.length,
              messages: thread.messages.slice(0, 3).map((m) => ({
                role: m.role,
                textPreview: (m.text || "").substring(0, 30),
              })),
            });
          }
        });

        // Check if there's a thread ID in the URL that we should preserve
        const urlThreadId = activeId;
        const preferredUrlThreadId = preferCanonicalThreadId(
          urlThreadId,
          loadedThreads,
        );
        const hasUrlThread =
          preferredUrlThreadId &&
          loadedThreads.some((t) => t.id === preferredUrlThreadId);

        let filteredThreads =
          filterThreadsWithCanonicalPreference(loadedThreads);
        // #region agent log
        fetch(
          "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "Layout.tsx:492",
              message: "Layout: after filterThreadsWithCanonicalPreference",
              data: {
                filteredCount: filteredThreads.length,
                filteredIds: filteredThreads.map((t) => t.id),
                filteredTitles: filteredThreads.map((t) => t.title),
                loadedCount: loadedThreads.length,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run2",
              hypothesisId: "G",
            }),
          },
        ).catch(() => {});
        // #endregion
        const zenCanonicalThread = getCanonicalThreadForKeys(loadedThreads, [
          "zen",
          "zen-001",
        ]);
        const zenCanonicalHasMessages = Boolean(
          zenCanonicalThread && (zenCanonicalThread.messages?.length ?? 0) > 0,
        );
        // #region agent log
        fetch(
          "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "Layout.tsx:494",
              message: "Layout: before filterByActiveRuntime",
              data: {
                activeRuntimeId,
                filteredCount: filteredThreads.length,
                zenCanonicalThread: zenCanonicalThread?.id,
                zenHasMessages: zenCanonicalHasMessages,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run2",
              hypothesisId: "G",
            }),
          },
        ).catch(() => {});
        // #endregion
        let runtimeScopedThreads = filterByActiveRuntime(
          filteredThreads,
          activeRuntimeId,
        );
        // #region agent log
        fetch(
          "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "Layout.tsx:495",
              message: "Layout: after filterByActiveRuntime",
              data: {
                runtimeScopedCount: runtimeScopedThreads.length,
                runtimeScopedIds: runtimeScopedThreads.map((t) => t.id),
                runtimeScopedTitles: runtimeScopedThreads.map((t) => t.title),
                activeRuntimeId,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run2",
              hypothesisId: "G",
            }),
          },
        ).catch(() => {});
        // #endregion
        const backendDown = backendUnavailable || isBackendUnavailable;

        // VVAULT-FIRST PATTERN: Never create local fallbacks when backend is down
        // This ensures single source of truth in Supabase/VVAULT
        if (backendDown) {
          console.log(
            "⚠️ [Layout.tsx] VVAULT unavailable - showing connection error (no local fallback)",
          );
          // Don't create any local threads - UI will show VVAULT connection error
          setThreads([]); // Empty threads = show connection status UI
          setIsLoading(false);
          clearTimeout(safetyTimeout);
          return; // Exit early - don't populate with local data
        }

        // Guard clause: Skip thread creation if canonical Zen thread exists with messages
        if (zenCanonicalHasMessages) {
          console.log(
            "✅ [Layout.tsx] Canonical Zen thread exists with messages - skipping thread creation",
          );
        } else if (filteredThreads.length === 0 && !hasUrlThread) {
          // Only create a new Zen thread if:
          // 1. VVAULT is connected (backendDown already handled above)
          // 2. No conversations loaded from VVAULT
          // 3. AND no thread ID in URL
          console.log(
            "🎯 [Layout.tsx] No conversations and no URL thread - creating Zen-001 in VVAULT",
          );
          const urlRuntimeHint = extractRuntimeKeyFromThreadId(
            preferredUrlThreadId || urlThreadId,
          );
          const shouldForceCanonicalZen =
            !preferredUrlThreadId &&
            !zenCanonicalThread?.id &&
            urlRuntimeHint === DEFAULT_ZEN_RUNTIME_ID;

          const defaultThreadId =
            preferredUrlThreadId ||
            zenCanonicalThread?.id ||
            (shouldForceCanonicalZen
              ? DEFAULT_ZEN_CANONICAL_SESSION_ID
              : `zen_${Date.now()}`);
          const zenConstructId =
            zenCanonicalThread?.constructId ||
            (defaultThreadId === DEFAULT_ZEN_CANONICAL_SESSION_ID
              ? DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID
              : DEFAULT_ZEN_CANONICAL_CONSTRUCT_ID);

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
            console.log("💾 [Layout.tsx] Creating Zen-001 in VVAULT...");
            try {
              await conversationManager.createConversation(
                userId,
                defaultThreadId,
                "Zen",
                finalConstructId,
              );
              console.log("✅ [Layout.tsx] Zen conversation created in VVAULT");
              // Only add to local state after successful VVAULT creation
              loadedThreads.push(defaultThread);
              filteredThreads = filterThreadsWithCanonicalPreference(loadedThreads);
              runtimeScopedThreads = filterByActiveRuntime(
                filteredThreads,
                activeRuntimeId,
              );
            } catch (error) {
              console.error(
                "❌ [Layout.tsx] Failed to create Zen in VVAULT:",
                error,
              );
              // Mark VVAULT as unavailable since write failed
              console.log("🔴 [Layout.tsx] Setting isBackendUnavailable = true (VVAULT write failed)");
              setIsBackendUnavailable(true);
              // Don't add to local state if VVAULT creation failed
            }
          }
        } else if (hasUrlThread) {
          console.log(
            `✅ [Layout.tsx] Found existing thread in URL: ${urlThreadId} - continuing conversation`,
          );
        } else if (loadedThreads.length > 0) {
          console.log(
            `✅ [Layout.tsx] Found ${loadedThreads.length} existing conversations - continuing`,
          );
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

        console.log(
          `✅ [Layout.tsx] Prepared ${sortedThreads.length} conversations`,
        );

        console.log(
          "🔍 [Layout.tsx] Threads state after loading:",
          sortedThreads,
        );
        console.log("🔍 [Layout.tsx] Number of threads:", sortedThreads.length);
        if (sortedThreads.length > 0) {
          console.log("🔍 [Layout.tsx] First thread details:", {
            id: sortedThreads[0].id,
            title: sortedThreads[0].title,
            messageCount: sortedThreads[0].messages.length,
            archived: sortedThreads[0].archived,
          });
        }

        console.log("🔄 [Layout.tsx] Setting threads in state...");
        // #region agent log
        fetch(
          "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "Layout.tsx:629",
              message: "Layout: setThreads called",
              data: {
                sortedThreadsCount: sortedThreads.length,
                sortedThreadsIds: sortedThreads.map((t) => t.id),
                sortedThreadsTitles: sortedThreads.map((t) => t.title),
                sortedThreadsConstructIds: sortedThreads.map(
                  (t) => t.constructId,
                ),
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run2",
              hypothesisId: "H",
            }),
          },
        ).catch(() => {});
        // #endregion
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
          if (location.pathname === requestedPath) {
            console.log(
              "🎯 [Layout.tsx] URL points to runtime thread, redirecting to canonical:",
              {
                requested: urlThreadId,
                canonical: preferredUrlThreadId,
              },
            );
            navigate(canonicalPath);
            didNavigateToCanonical = true;
          }
        }

        // Only navigate to conversation if user is already on a specific chat route
        // If on /app or /app/, show home page instead
        const initialPath = initialPathRef.current;
        const isAppRoot = initialPath === "/app" || initialPath === "/app/";
        const isChatRoute =
          initialPath.startsWith("/app/chat") && initialPath !== "/app/chat";
        const shouldFocusFirstConversation = isChatRoute && !isAppRoot;

        if (
          !didNavigateToCanonical &&
          sortedThreads.length > 0 &&
          shouldFocusFirstConversation
        ) {
          const firstThread = sortedThreads[0];
          const targetPath = `/app/chat/${routeIdForThread(firstThread.id, sortedThreads)}`;
          console.log(
            `🎯 [Layout.tsx] Preparing to show conversation: ${firstThread.title} (${firstThread.id})`,
          );
          if (location.pathname !== targetPath) {
            console.log(`🎯 [Layout.tsx] Navigating to: ${targetPath}`);
            navigate(targetPath, { state: { activeRuntimeId } });
          } else {
            console.log(`📍 [Layout.tsx] Already on route: ${targetPath}`);
          }
        } else if (isAppRoot) {
          // Show home page when landing on /app
          if (location.pathname !== "/app") {
            console.log("🏠 [Layout.tsx] Navigating to home page");
            navigate("/app");
          } else {
            console.log("📍 [Layout.tsx] Already on home page");
          }
        } else if (sortedThreads.length === 0) {
          console.warn(
            "⚠️ [Layout.tsx] No threads to navigate to - showing home page",
          );
          if (location.pathname !== "/app") {
            navigate("/app");
          }
        } else {
          console.log(
            "🧭 [Layout.tsx] Preserving current route (non-chat destination detected)",
          );
        }
      } catch (error) {
        hasAuthenticatedRef.current = false;
        if (!cancelled) {
          console.error("❌ [Layout.tsx] Fatal error in auth effect:", error);
          if (error instanceof Error && error.stack) {
            console.error("❌ [Layout.tsx] Error stack:", error.stack);
          }

          // === EMERGENCY FALLBACK - CREATE ZEN CONVERSATION WITH WELCOME MESSAGE ===
          console.log(
            "🚨 [Layout.tsx] Creating emergency Zen conversation with welcome message",
          );
          const emergencyThreadId = `zen_emergency_${Date.now()}`;
          const emergencyTimestamp = Date.now();
          const emergencyText =
            "Hey! I'm Zen. It looks like there was an issue loading conversations, but I'm here now. What can I help you with?";

          const emergencyWelcomeMessage: Message = {
            id: `msg_emergency_welcome_${emergencyTimestamp}`,
            role: "assistant",
            text: emergencyText,
            packets: [
              {
                op: "answer.v1",
                payload: { content: emergencyText },
              },
            ],
            ts: emergencyTimestamp,
          };

          const emergencyThread: Thread = {
            id: emergencyThreadId,
            title: "Zen",
            messages: [emergencyWelcomeMessage],
            createdAt: emergencyTimestamp,
            updatedAt: emergencyTimestamp,
            archived: false,
          };

          console.log("🔄 [Layout.tsx] Setting emergency thread in state");
          setThreads([emergencyThread]);
          console.log(
            `🎯 [Layout.tsx] Navigating to emergency conversation: /app/chat/${emergencyThreadId}`,
          );
          navigate(`/app/chat/${emergencyThreadId}`);
        }
      } finally {
        clearTimeout(safetyTimeout);
        if (!cancelled) {
          console.log(
            "🛑 [Layout.tsx] Auth effect complete - isLoading → false",
          );
          setIsLoading(false);
        }
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

    console.log(
      "🔄 [Layout.tsx] Force refreshing conversations from VVAULT...",
    );
    const conversationManager = VVAULTConversationManager.getInstance();
    const userId = getUserId(user);
    const vvaultUserId = user.email || userId;

    // Clear cache to force fresh load
    conversationManager.clearCacheForUser(vvaultUserId);

    // Reset auth ref to allow reload
    hasAuthenticatedRef.current = false;

    // Reload conversations
    try {
      const vvaultConversations =
        await conversationManager.loadAllConversations(vvaultUserId, true);
      console.log(
        `✅ [Layout.tsx] Force refreshed: ${vvaultConversations.length} conversations`,
      );

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
          canonicalForRuntime:
            isPrimary && constructId ? runtimeId || constructId : null,
        };
      });

      const filteredThreads =
        filterThreadsWithCanonicalPreference(loadedThreads);
      const runtimeScopedThreads = filterByActiveRuntime(
        filteredThreads,
        activeRuntimeId,
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
      console.log(
        `✅ [Layout.tsx] Force refresh complete: ${sortedThreads.length} threads`,
      );
    } catch (error) {
      console.error("❌ [Layout.tsx] Force refresh failed:", error);
    }
  }, [user, activeRuntimeId]);

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
    
    console.log("🔄 [Layout.tsx] Retrying VVAULT connection...");
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
        console.log("✅ [Layout.tsx] VVAULT connection restored!");
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

  type ThreadInitOptions = {
    title?: string;
    starter?: string;
    files?: File[];
  };

  async function newThread(options?: ThreadInitOptions) {
    const trimmedTitle = options?.title?.trim();
    const starterTrimmed = options?.starter?.trim();
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

      console.log(
        `[Layout.tsx] Auto-selected runtime: ${runtimeAssignment.constructId} (confidence: ${Math.round(runtimeAssignment.confidence * 100)}%) - ${runtimeAssignment.reasoning}`,
      );

      // Normalize synth → zen-001 (synth was renamed to zen)
      let normalizedConstructId = runtimeAssignment.constructId;
      if (
        normalizedConstructId === "synth" ||
        normalizedConstructId === "synth-001"
      ) {
        normalizedConstructId = "zen-001";
        console.log(
          `[Layout.tsx] Normalized constructId: ${runtimeAssignment.constructId} → ${normalizedConstructId}`,
        );
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
      navigate(`/app/chat/${thread.id}`);

      if (starterTrimmed && starterTrimmed.length > 0) {
        pendingStarterRef.current = {
          threadId: thread.id,
          starter: starterTrimmed,
          files: options?.files ?? [],
        };
      } else {
        pendingStarterRef.current = null;
      }

      console.log(`✅ Created new conversation via VVAULT: ${thread.id}`);
      return thread.id;
    } catch (error) {
      console.error("❌ Failed to create new conversation:", error);
      // Fallback to local creation if VVAULT fails
      const thread = createThread(initialTitle);
      setThreads((prev) => [thread, ...prev]);
      navigate(`/app/chat/${thread.id}`);
      return thread.id;
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

  async function sendMessage(
    threadId: string,
    input: string,
    files?: File[],
    uiOverrides?: UIContextSnapshot,
  ) {
    console.log("📤 [Layout.tsx] sendMessage called:", {
      threadId,
      inputLength: input.length,
    });

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

    // Dynamic persona detection + context lock
    // #region agent log
    const envValue = import.meta.env.VITE_PERSONA_DETECTION_ENABLED;
    fetch("http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "Layout.tsx:1061",
        message: "sendMessage: checking persona detection env var",
        data: {
          envValue,
          hasImportMeta: typeof import.meta !== "undefined",
          hasEnv: typeof import.meta.env !== "undefined",
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "verify-fix",
        hypothesisId: "A",
      }),
    }).catch(() => {});
    // #endregion
    const detectionEnabled = (envValue ?? "true") !== "false";
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "Layout.tsx:1065",
        message: "sendMessage: detectionEnabled calculated",
        data: { detectionEnabled, envValue },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "verify-fix",
        hypothesisId: "A",
      }),
    }).catch(() => {});
    // #endregion
    let detectedPersona:
      | import("../engine/character/PersonaDetectionEngine").PersonaSignal
      | undefined;
    let personaContextLock:
      | import("../engine/character/ContextLock").ContextLock
      | null = null;
    let personaSystemPrompt: string | null = null;
    let effectiveConstructId: string | null = thread.constructId || null;

    if (detectionEnabled) {
      try {
        // #region agent log
        fetch(
          "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "Layout.tsx:1088",
              message: "sendMessage: starting persona detection",
              data: {
                detectionEnabled,
                hasWorkspaceContextBuilder:
                  typeof WorkspaceContextBuilder !== "undefined",
                isClass: typeof WorkspaceContextBuilder === "function",
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "fix-workspace-builder",
              hypothesisId: "B",
            }),
          },
        ).catch(() => {});
        // #endregion
        const workspaceBuilder = new WorkspaceContextBuilder();
        // #region agent log
        fetch(
          "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "Layout.tsx:1091",
              message: "sendMessage: WorkspaceContextBuilder instantiated",
              data: {
                hasInstance: !!workspaceBuilder,
                hasBuildMethod:
                  typeof workspaceBuilder?.buildWorkspaceContext === "function",
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "fix-workspace-builder",
              hypothesisId: "B",
            }),
          },
        ).catch(() => {});
        // #endregion
        const workspaceContext = await workspaceBuilder.buildWorkspaceContext(
          user.id || user.sub || "",
          threadId,
          threads as any,
        );
        // #region agent log
        fetch(
          "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "Layout.tsx:1096",
              message: "sendMessage: workspaceContext built successfully",
              data: {
                hasContext: !!workspaceContext,
                hasCurrentThread: !!workspaceContext?.currentThread,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "fix-workspace-builder",
              hypothesisId: "B",
            }),
          },
        ).catch(() => {});
        // #endregion

        const conversationHistory = thread.messages.map((m) => {
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
              effectiveConstructId = thread.constructId || "synth";
            }
          } catch (error) {
            console.error(
              "❌ [Layout.tsx] Persona detection/lock failed:",
              error,
            );
            // Fall back to thread's constructId if detection fails
            effectiveConstructId = thread.constructId || "synth";
            console.warn(
              "⚠️ [Layout.tsx] Falling back to thread constructId:",
              effectiveConstructId,
            );
          }
        } else {
          console.warn(
            "⚠️ [Layout] DynamicPersonaOrchestrator not available, using thread constructId",
          );
          effectiveConstructId = thread.constructId || "synth";
        }
      } catch (error) {
        console.error("❌ [Layout.tsx] Persona detection failed:", error);
        // Fall back to thread's constructId if detection fails
        effectiveConstructId = thread.constructId || "synth";
        console.warn(
          "⚠️ [Layout.tsx] Falling back to thread constructId:",
          effectiveConstructId,
        );
      }
    }

    if (!effectiveConstructId) {
      // Final fallback to synth
      effectiveConstructId = "synth";
      console.warn(
        "⚠️ [Layout.tsx] No effective constructId, defaulting to synth",
      );
    }

    const conversationManager = VVAULTConversationManager.getInstance();
    const userTimestamp = Date.now();
    const userTimestampIso = new Date(userTimestamp).toISOString();

    // 1. Show user message immediately
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      text: input,
      ts: userTimestamp,
      timestamp: userTimestampIso,
      files: files
        ? files.map((f) => ({ name: f.name, size: f.size }))
        : undefined,
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
    console.log("💾 [Layout.tsx] Saving USER message to VVAULT...");
    try {
      await conversationManager.addMessageToConversation(user, threadId, {
        role: "user",
        content: input,
        packets: [{ content: input }],
        timestamp: userTimestampIso,
        metadata: {
          files: files
            ? files.map((f) => ({ name: f.name, size: f.size, type: f.type }))
            : undefined,
        },
      });
      console.log("✅ [Layout.tsx] USER message saved to VVAULT");
      console.log("💾 [Layout] Message saved to VVAULT:", {
        threadId,
        messageLength: input.length,
        timestamp: userTimestampIso,
        filePath: `instances/${thread.constructId || "unknown"}/chatty/chat_with_${thread.constructId || "unknown"}.md`,
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
      console.log(
        `🧠 [Layout.tsx] Querying identity for construct: ${constructCallsign}`,
      );
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
        console.log(
          `✅ [Layout.tsx] Found ${relevantMemories.length} relevant identity/memories`,
        );
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
      composer: { attachments: files ? files.length : 0 },
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
        console.error(
          "❌ [Layout.tsx] Persona lock active but system prompt missing; aborting send",
        );
        return;
      }

      // #region agent log
      fetch(
        "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "Layout.tsx:1322",
            message: "sendMessage: calling aiService.processMessage",
            data: {
              inputLength: input.length,
              hasFiles: !!files,
              filesCount: files?.length || 0,
              effectiveConstructId,
              hasPersonaSystemPrompt: !!personaSystemPrompt,
              threadId,
            },
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "fix-processmessage",
            hypothesisId: "D",
          }),
        },
      ).catch(() => {});
      // #endregion
      const raw = await aiService.processMessage(
        input,
        files,
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
          ) => {
            // #region agent log
            fetch(
              "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  location: "Layout.tsx:1373",
                  message: "sendMessage: onFinalUpdate called",
                  data: {
                    packetsCount: finalPackets.length,
                    firstPacketOp: finalPackets[0]?.op,
                  },
                  timestamp: Date.now(),
                  sessionId: "debug-session",
                  runId: "fix-processmessage",
                  hypothesisId: "D",
                }),
              },
            ).catch(() => {});
            // #endregion
            const responseTimeMs = Date.now() - responseStart;
            const filteredThinking: string[] = [];

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

            console.log(
              `📝 [Layout.tsx] onFinalUpdate: Extracted assistant content (length: ${assistantContent.length})`,
            );

            let assistantUnsaved = false;
            if (user && assistantContent) {
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
                console.log(
                  "💾 [Layout.tsx] onFinalUpdate: Saving ASSISTANT message to VVAULT BEFORE UI update...",
                );
                await conversationManager.addMessageToConversation(
                  user,
                  threadId,
                  savePayload,
                );
                console.log(
                  "✅ [Layout.tsx] onFinalUpdate: ASSISTANT message saved to VVAULT - safe to update UI",
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

            // Update UI even if save failed (unsaved flagged for debugging)
            const aiMsg: Message = {
              id: typingMsg.id, // Use same ID to replace
              role: "assistant",
              packets: finalPackets,
              ts: Date.now() + 2,
              timestamp: new Date(Date.now() + 2).toISOString(),
              responseTimeMs,
              thinkingLog: filteredThinking,
              metadata: {
                responseTimeMs,
                thinkingLog: filteredThinking,
                unsaved: assistantUnsaved,
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

        console.log(
          "💾 [Layout.tsx] Saving ASSISTANT fallback message to VVAULT...",
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
          console.log("✅ [Layout.tsx] ASSISTANT fallback saved to VVAULT");
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
      // #region agent log
      const errorDetails = {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        errorName: error instanceof Error ? error.name : typeof error,
        errorType: error?.constructor?.name,
      };
      fetch(
        "http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: "Layout.tsx:1460",
            message: "sendMessage: error caught in main catch block",
            data: errorDetails,
            timestamp: Date.now(),
            sessionId: "debug-session",
            runId: "fix-workspace-builder",
            hypothesisId: "C",
          }),
        },
      ).catch(() => {});
      // #endregion
      console.error("❌ [Layout.tsx] Error in sendMessage:", error);
      // Handle error by replacing typing message with error
      const errorMsg: Message = {
        id: typingMsg.id,
        role: "assistant",
        packets: [
          {
            op: "error.v1",
            payload: {
              message: "Sorry, I encountered an error. Please try again.",
            },
          },
        ],
        ts: Date.now() + 2,
        thinkingLog: thinkingLog.filter((step) => step.trim()),
        metadata: {
          thinkingLog: thinkingLog.filter((step) => step.trim()),
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
    console.log("🔄 [Layout] Reloading messages for thread:", threadId);

    if (!user) {
      console.error("❌ [Layout] Cannot reload messages: no user session");
      return;
    }

    try {
      const vvaultUserId = getUserId(user as any) || user?.email;
      if (!vvaultUserId) {
        console.error("❌ [Layout] Cannot reload messages: no user ID");
        return;
      }

      const conversationManager = VVAULTConversationManager.getInstance();
      const conversations = await conversationManager.loadAllConversations(
        vvaultUserId,
        true,
      );

      console.log(
        `📥 [Layout] Reloaded ${conversations.length} conversations from VVAULT`,
      );
      console.log(`🔍 [Layout] Searching for threadId: ${threadId}`);
      console.log(
        `📋 [Layout] Available conversations:`,
        conversations.map((c) => ({
          sessionId: c.sessionId,
          title: c.title,
          constructId: c.constructId,
          messageCount: c.messages?.length || 0,
        })),
      );

      // Find the specific conversation - try multiple matching strategies
      let conv = conversations.find((c) => c.sessionId === threadId);

      if (!conv) {
        // Try matching by transformed ID pattern (zen-001_chat_with_zen-001)
        conv = conversations.find((c) => {
          if (c.constructId && threadId.includes(c.constructId)) {
            const transformedId = `${c.constructId}_chat_with_${c.constructId}`;
            return transformedId === threadId;
          }
          return false;
        });
      }

      if (!conv) {
        // Try matching by constructId for Zen (zen-001)
        if (threadId.includes("zen-001") || threadId.includes("zen_")) {
          conv = conversations.find(
            (c) =>
              c.constructId === "zen-001" ||
              c.constructId === "zen" ||
              (c.title && c.title.toLowerCase().includes("zen")),
          );
        }
      }

      if (!conv) {
        // Last resort: find any conversation with matching constructId pattern
        const constructIdMatch = threadId.match(/([a-z]+-\d+)/i);
        if (constructIdMatch) {
          const extractedConstructId = constructIdMatch[1];
          conv = conversations.find(
            (c) => c.constructId === extractedConstructId,
          );
        }
      }

      if (!conv) {
        console.error(
          `❌ [Layout] Conversation not found for threadId: ${threadId}`,
        );
        console.error(
          `📋 [Layout] Available sessionIds:`,
          conversations.map((c) => c.sessionId),
        );

        // Last resort: If this is a Zen conversation, try to find ANY Zen conversation
        if (threadId.includes("zen")) {
          console.log(
            `🔄 [Layout] Attempting fallback: finding any Zen conversation...`,
          );
          conv = conversations.find(
            (c) =>
              c.constructId === "zen-001" ||
              c.constructId === "zen" ||
              (c.title && c.title.toLowerCase().includes("zen")) ||
              (c.sessionId && c.sessionId.toLowerCase().includes("zen")),
          );

          if (conv) {
            console.log(
              `✅ [Layout] Found fallback Zen conversation: ${conv.sessionId} with ${conv.messages.length} messages`,
            );
          } else {
            console.error(
              `❌ [Layout] No Zen conversation found at all. Total conversations: ${conversations.length}`,
            );
            return;
          }
        } else {
          return;
        }
      }

      console.log(
        `📋 [Layout] Found conversation: ${conv.title} (${conv.sessionId}) with ${conv.messages.length} messages`,
      );

      if (conv.messages.length === 0) {
        console.warn(
          `⚠️ [Layout] Conversation found but has NO messages! This might indicate a parsing issue.`,
        );
        console.warn(
          `📄 [Layout] Check VVAULT file: instances/${conv.constructId || "unknown"}/chatty/chat_with_${conv.constructId || "unknown"}.md`,
        );
      }

      // Map conversation to thread format
      const normalizedTitle = (conv.title || "Zen")
        .replace(/^Chat with /i, "")
        .replace(/-\d{3,}$/i, "");

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

      // Normalize thread ID for Zen conversations to match URL pattern
      let normalizedThreadId = conv.sessionId;
      if (
        constructId === "zen-001" ||
        constructId === "zen" ||
        normalizedTitle.toLowerCase() === "zen"
      ) {
        normalizedThreadId = DEFAULT_ZEN_CANONICAL_SESSION_ID;
      }

      // Use threadId from URL if it matches the pattern, otherwise use normalized ID
      const finalThreadId =
        threadId === DEFAULT_ZEN_CANONICAL_SESSION_ID ||
        (threadId.includes("zen-001") &&
          normalizedThreadId === DEFAULT_ZEN_CANONICAL_SESSION_ID)
          ? threadId
          : normalizedThreadId;

      const updatedThread: Thread = {
        id: finalThreadId,
        title: normalizedTitle,
        messages: conv.messages
          .map((msg: any) => {
            if (!msg || !msg.id || !msg.timestamp) {
              console.warn("⚠️ [Layout] Invalid message in reload:", msg);
              return null;
            }
            return {
              id: msg.id,
              role: msg.role,
              text: msg.content,
              packets:
                msg.role === "assistant"
                  ? [{ op: "answer.v1", payload: { content: msg.content } }]
                  : undefined,
              ts: new Date(msg.timestamp).getTime(),
              metadata: msg.metadata || undefined,
              responseTimeMs: msg.metadata?.responseTimeMs,
              thinkingLog: msg.metadata?.thinkingLog,
            };
          })
          .filter((msg): msg is NonNullable<typeof msg> => msg !== null),
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
        canonicalForRuntime:
          isPrimary && constructId ? runtimeId || constructId : null,
      };

      console.log(`🔄 [Layout] Updating thread state:`, {
        threadId,
        finalThreadId,
        messageCount: updatedThread.messages.length,
        sessionId: conv.sessionId,
      });

      // Update thread in state - find by threadId from URL or by matching patterns
      setThreads((prevThreads) => {
        // Find existing thread by threadId (from URL) or by matching constructId
        const existingIndex = prevThreads.findIndex(
          (t) =>
            t.id === threadId ||
            t.id === finalThreadId ||
            (t.constructId && threadId.includes(t.constructId)) ||
            (t.isPrimary &&
              t.constructId &&
              `${t.constructId}_chat_with_${t.constructId}` === threadId) ||
            (constructId === "zen-001" &&
              t.constructId === "zen-001" &&
              t.isPrimary),
        );

        if (existingIndex >= 0) {
          // Update existing thread
          const updated = [...prevThreads];
          updated[existingIndex] = updatedThread;
          console.log(
            `✅ [Layout] Updated thread "${updatedThread.title}" (${updatedThread.id}) with ${updatedThread.messages.length} messages`,
          );
          return updated;
        } else {
          // Add new thread if not found
          console.log(
            `✅ [Layout] Added new thread "${updatedThread.title}" (${updatedThread.id}) with ${updatedThread.messages.length} messages`,
          );
          return [...prevThreads, updatedThread];
        }
      });
    } catch (error) {
      console.error("❌ [Layout] Failed to reload thread messages:", error);
      throw error;
    }
  }

  function handleThreadClick(threadId: string) {
    console.log("🟡 [Layout] handleThreadClick START:", {
      threadId,
      threadsCount: threads.length,
      threadIds: threads.map((t) => ({
        id: t.id,
        title: t.title,
        constructId: t.constructId,
        isPrimary: t.isPrimary,
      })),
    });

    const targetId = preferCanonicalThreadId(threadId, threads) || threadId;
    const routedId = routeIdForThread(targetId, threads);
    const targetPath = `/app/chat/${routedId}`;

    // Check if selected thread has messages
    const selectedThread = threads.find(
      (t) => t.id === targetId || t.id === routedId,
    );
    if (selectedThread) {
      console.log(
        `📊 [Layout] Selected thread "${selectedThread.title}": ${selectedThread.messages.length} messages`,
      );
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

    console.log("🟡 [Layout] Navigation:", {
      original: threadId,
      targetId,
      routedId,
      targetPath,
      currentPath: location.pathname,
    });

    if (targetId !== threadId) {
      console.log(
        "🧭 [Layout.tsx] Routing to canonical thread instead of runtime thread:",
        { requested: threadId, canonical: targetId },
      );
    }

    navigate(targetPath, { state: { activeRuntimeId } });
    console.log("✅ [Layout] Navigation called");
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

  if (!user) {
    return null; // Will redirect to login
  }

  function toggleSidebar() {
    setCollapsed((s) => !s);
  }

  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/ec2d9602-9db8-40be-8c6f-4790712d2073", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "Layout.tsx:1796",
      message: "Layout render - checking provider structure",
      data: { hasUser: !!user, pathname: location.pathname },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "run1",
      hypothesisId: "H2",
    }),
  }).catch(() => {});
  // #endregion
  return (
    <SettingsProvider>
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
                console.log("🖱️ [Layout.tsx] Sidebar thread selected:", id);
                handleThreadClick(id);
              }}
              onNewConversation={newThread}
              onNewConversationWithGPT={(gptId: string) => {
                navigate("/app/gpts/new");
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
            <Outlet
              context={{
                threads,
                sendMessage,
                renameThread,
                newThread,
                toggleSidebar,
                activeThreadId: activeId,
                appendMessageToThread,
                navigate,
                reloadThreadMessages,
                user,
              }}
            />
          </main>
          <StorageFailureFallback
            info={storageFailureInfo}
            onClose={closeStorageFailure}
          />

          {/* VVAULT Connection Status - Single Source of Truth Pattern */}
          {isBackendUnavailable && threads.length === 0 && !isLoading && (
            <div 
              className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
              style={{ zIndex: Z_LAYERS.modal }}
            >
              <div className="bg-[var(--chatty-bg-main)] border border-[var(--chatty-border)] rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold text-[var(--chatty-text)] mb-2">
                    Connecting to VVAULT
                  </h2>
                  <p className="text-[var(--chatty-text-secondary)] mb-6">
                    Unable to reach the VVAULT server. Your conversations are stored in Supabase and will be available once the connection is restored.
                  </p>
                  <button
                    onClick={retryVVAULTConnection}
                    disabled={isRetryingVVAULT}
                    className="w-full py-3 px-6 bg-[var(--chatty-accent)] hover:bg-[var(--chatty-accent-hover)] text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isRetryingVVAULT ? (
                      <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Connecting...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Retry Connection
                      </>
                    )}
                  </button>
                  {vvaultRetryCount > 0 && (
                    <p className="text-sm text-[var(--chatty-text-secondary)] mt-3">
                      Retry attempts: {vvaultRetryCount}
                    </p>
                  )}
                </div>
              </div>
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
