import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import { ChevronDown } from "lucide-react";
import { R } from "../runtime/render";
import { MessageOptionsMenu } from "../components/MessageOptionsMenu";
import { VVAULTConversationManager } from "../lib/vvaultConversationManager";
import { getUserId } from "../lib/auth";
import MessageBar, { ImageAttachment } from "../components/MessageBar";
import { prepareMessageContent, stripDateLines } from "../utils/text";
import { isAddressBookConstructVisible } from "../lib/addressBookContacts";
const GPTCreator = React.lazy(() => import("../components/GPTCreator"));
const Mirror = React.lazy(() => import("../components/Mirror"));
const MirrorSetup = React.lazy(() => import("../components/MirrorSetup"));
import { MonitorOff, Monitor, X } from "lucide-react";
import { AIService } from "../lib/aiService";
import type { GPTConfig } from "../lib/gptService";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  text?: string;
  packets?: import("../types").AssistantPacket[];
  ts: number;
  files?: { name: string; size: number }[];
  typing?: boolean; // For typing indicators
  status?: string;
};

type Thread = {
  id: string;
  title: string;
  messages: Message[];
  constructId?: string;
  isPrimary?: boolean;
  runtimeId?: string;
  updatedAt?: number;
  createdAt?: number;
  archived?: boolean;
};

// Date header pattern - matches date-only lines with optional leading hashes
// e.g., "November 20, 2025", "## December 12, 2025", "### december 13 2025"
const DATE_HEADER_PATTERN = /^#{0,6}\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\s*$/i;

const assistantCodeStyles = `
  .assistant-code-scope,
  .assistant-code-scope * {
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    background: transparent;
  }
  .assistant-code-scope pre {
    display: block;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    white-space: pre !important;
    word-break: normal !important;
    overflow-wrap: normal !important;
    word-wrap: normal !important;
    background: #2d2d2d;
    color: #fffff0;
    border-radius: 12px;
    padding: 12px;
    margin: 12px 0;
    font-size: 15px;
    line-height: 1.45;
  }
  .assistant-code-scope code {
    white-space: pre !important;
    word-break: normal !important;
    overflow-wrap: normal !important;
    word-wrap: normal !important;
    background: transparent;
  }
  .assistant-code-scope pre::-webkit-scrollbar {
    height: 10px;
  }
  .assistant-code-scope pre::-webkit-scrollbar-track {
    background: #2d2d2d;
    border-radius: 12px;
  }
  .assistant-code-scope pre::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.25);
    border-radius: 12px;
  }
  .assistant-code-scope pre::-webkit-scrollbar-thumb:hover {
    background: rgba(255,255,255,0.35);
  }
`;

// Check if a message is a date header (by flag OR by content pattern)
function isDateHeaderMessage(msg: any): boolean {
  // Priority 1: Explicit flag from server/parser
  if (msg.isDateHeader) {
    return true;
  }

  // Priority 2: Pattern match on message text content (user messages have 'text', assistants have packets)
  const text = (msg.text || '').trim();
  if (!text) return false;

  // Only check short messages (date headers with hashes are typically < 40 chars)
  if (text.length > 40) return false;

  return DATE_HEADER_PATTERN.test(text);
}

function isCanonicalSelfThreadId(threadId?: string | null): boolean {
  return typeof threadId === "string" && /^([a-z0-9-]+)_chat_with_\1$/i.test(threadId);
}

type ChatRouteClassification = {
  threadId: string | null;
  constructId: string | null;
  displayName: string | null;
  kind: "system" | "address-book-contact" | "custom-gpt" | "non-canonical";
  isCanonical: boolean;
  isSystem: boolean;
  isAddressBookContact: boolean;
  isCustomGPT: boolean;
  isZen: boolean;
  isLin: boolean;
  isVal: boolean;
};

const SYSTEM_CANONICAL_CONSTRUCT_NAMES: Record<string, string> = {
  "zen-001": "Zen",
  "lin-001": "Lin",
  "val-001": "Val",
};

function formatConstructDisplayName(constructId: string): string {
  const base = constructId.replace(/-\d+$/i, "");
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function classifyChatRouteThread(
  threadId?: string | null,
): ChatRouteClassification {
  if (!threadId || !threadId.includes("_chat_with_")) {
    return {
      threadId: threadId || null,
      constructId: null,
      displayName: null,
      kind: "non-canonical",
      isCanonical: false,
      isSystem: false,
      isAddressBookContact: false,
      isCustomGPT: false,
      isZen: false,
      isLin: false,
      isVal: false,
    };
  }

  const constructId = threadId.split("_chat_with_")[0]?.trim().toLowerCase() || null;
  if (!constructId) {
    return {
      threadId,
      constructId: null,
      displayName: null,
      kind: "non-canonical",
      isCanonical: false,
      isSystem: false,
      isAddressBookContact: false,
      isCustomGPT: false,
      isZen: false,
      isLin: false,
      isVal: false,
    };
  }

  const systemName = SYSTEM_CANONICAL_CONSTRUCT_NAMES[constructId] || null;
  const isSystem = Boolean(systemName);
  const isAddressBookContact = isAddressBookConstructVisible(constructId);
  const kind = isSystem
    ? "system"
    : isAddressBookContact
      ? "address-book-contact"
      : "custom-gpt";

  return {
    threadId,
    constructId,
    displayName: systemName || formatConstructDisplayName(constructId),
    kind,
    isCanonical: true,
    isSystem,
    isAddressBookContact,
    isCustomGPT: kind === "custom-gpt",
    isZen: constructId === "zen-001",
    isLin: constructId === "lin-001",
    isVal: constructId === "val-001",
  };
}

export function canSendOnActiveThread({
  activeThreadHydration,
  thread,
  routeThreadId,
}: {
  activeThreadHydration?:
    | {
        status?: string | null;
        hydrationSource?: string | null;
        hydrationComplete?: boolean;
      }
    | null
    | undefined;
  thread?:
    | {
        id?: string;
        isIndexHydrated?: boolean;
        messages?: { length: number };
      }
    | null
    | undefined;
  routeThreadId?: string | null;
}): boolean {
  if (!thread) {
    return false;
  }

  const routeClassification = classifyChatRouteThread(routeThreadId || thread.id);

  // Allow sending on fresh canonical threads with no messages yet.
  // These are threads created by startConversationWithConstruct that
  // haven't had their first message sent. Without this, reloadThreadMessages
  // fetches an empty VVAULT transcript and sets isIndexHydrated=true,
  // permanently deadlocking the composer.
  const emptyCanonical =
    routeClassification.isCanonical &&
    (thread.messages?.length ?? 0) === 0;
  if (emptyCanonical) {
    return true;
  }

  if (thread.isIndexHydrated === true) {
    return false;
  }

  if (!routeClassification.isCanonical) {
    return true;
  }

  return (
    activeThreadHydration?.status === "ready" &&
    activeThreadHydration?.hydrationSource === "full" &&
    activeThreadHydration?.hydrationComplete === true
  );
}

function isImportedSeatValue(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "codex";
}

function formatMessageTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  // If today, show just time
  if (messageDate.getTime() === today.getTime()) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  // If yesterday
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (messageDate.getTime() === yesterday.getTime()) {
    return `Yesterday ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
  }

  // If this week, show day and time
  const daysDiff = Math.floor(
    (today.getTime() - messageDate.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysDiff < 7) {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  // Otherwise show full date and time
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function isBlockParagraphChild(child: React.ReactNode): boolean {
  if (!React.isValidElement(child) || typeof child.type !== "string") {
    return false;
  }

  return [
    "div",
    "pre",
    "ul",
    "ol",
    "blockquote",
    "table",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
  ].includes(child.type);
}

export function shouldRenderUserMarkdownParagraphAsBlock(
  children: React.ReactNode,
): boolean {
  return React.Children.toArray(children).some((child) => isBlockParagraphChild(child));
}

export function renderUserMessageParagraph(
  children: React.ReactNode,
): React.ReactElement {
  const className = "mb-2 last:mb-0 leading-relaxed";
  const style = { color: "var(--chatty-text)" };

  if (shouldRenderUserMarkdownParagraphAsBlock(children)) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <p className={className} style={style}>
      {children}
    </p>
  );
}

export function isImportedCodexRelayUserMessage(message: {
  role?: string | null;
  metadata?: Record<string, unknown> | null;
} | null | undefined): boolean {
  if (!message || message.role !== "user" || !message.metadata) {
    return false;
  }

  const { sourceProduct, sourceSeat, relayImportedAt } = message.metadata;
  return Boolean(relayImportedAt) && (
    isImportedSeatValue(sourceProduct) || isImportedSeatValue(sourceSeat)
  );
}

export function getUserMessageRenderMode(message: {
  role?: string | null;
  text?: string | null;
  metadata?: Record<string, unknown> | null;
} | null | undefined): "live-user" | "imported-codex-context" {
  return isImportedCodexRelayUserMessage(message)
    ? "imported-codex-context"
    : "live-user";
}

export function buildImportedCodexRelayPreview(
  text?: string | null,
  maxLength = 400,
): string {
  const normalized = String(text || "")
    .replace(/!\[[^\]]*]\(([^)]+)\)/g, "[imported image: $1]")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

export function renderImportedCodexRelayContext({
  text,
  importedAt,
}: {
  text?: string | null;
  importedAt?: string | null;
}): React.ReactElement {
  const preview = buildImportedCodexRelayPreview(text, 400);

  return (
    <div
      className="rounded-xl border px-4 py-3 space-y-2"
      style={{
        borderColor: "rgba(255, 255, 255, 0.12)",
        backgroundColor: "rgba(255, 255, 255, 0.04)",
        color: "var(--chatty-text)",
      }}
    >
      <div className="text-xs uppercase tracking-[0.16em]" style={{ opacity: 0.72 }}>
        Imported Codex handoff context
      </div>
      {importedAt ? (
        <div className="text-xs" style={{ opacity: 0.65 }}>
          Imported at {importedAt}
        </div>
      ) : null}
      <p className="text-sm leading-relaxed">{preview}</p>
      <p className="text-xs leading-relaxed" style={{ opacity: 0.72 }}>
        Full imported content remains in canonical storage.
      </p>
    </div>
  );
}

export function shouldWindowThreadHistory(thread: {
  isIndexHydrated?: boolean;
} | null | undefined): boolean {
  return thread?.isIndexHydrated === true;
}

export function getRenderableThreadMessages<T extends { text?: string; isDateHeader?: boolean }>(
  messages: T[] | null | undefined,
  messageWindowSize: number,
  thread: { isIndexHydrated?: boolean } | null | undefined,
): T[] {
  const filteredMessages = Array.isArray(messages)
    ? messages.filter((message) => !isDateHeaderMessage(message))
    : [];

  if (!shouldWindowThreadHistory(thread)) {
    return filteredMessages;
  }

  const windowStart = Math.max(0, filteredMessages.length - messageWindowSize);
  return filteredMessages.slice(windowStart);
}

export function shouldBlockActiveThreadRender({
  activeThreadHydration,
  thread,
}: {
  activeThreadHydration?:
    | {
        status?: string | null;
        hydrationSource?: string | null;
        hydrationComplete?: boolean;
      }
    | null
    | undefined;
  thread?:
    | {
        id?: string;
        isIndexHydrated?: boolean;
      }
    | null
    | undefined;
}): boolean {
  if (!thread) {
    return false;
  }

  return activeThreadHydration?.status === "loading";
}

export function shouldRequestActiveThreadReload({
  activeThreadHydration,
  thread,
}: Parameters<typeof shouldBlockActiveThreadRender>[0]): boolean {
  if (!thread) {
    return false;
  }

  if (thread.isIndexHydrated === true) {
    return true;
  }

  if (!isCanonicalSelfThreadId(thread.id)) {
    return false;
  }

  if (activeThreadHydration?.status !== "ready") {
    return true;
  }

  return (
    activeThreadHydration?.hydrationSource !== "full" ||
    activeThreadHydration?.hydrationComplete !== true
  );
}

// Markdown components for user messages (styled for bubble with #ADA587 background)
const userMessageMarkdownComponents: Components = {
  // Code blocks with syntax highlighting (styled for user bubble)
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    const code = String(children).replace(/\n$/, "");

    // Code block with language - use SyntaxHighlighter
    if (!inline && match) {
      return (
        <div
          className="relative group my-4"
          style={{
            width: "100%",
            maxWidth: "min(90vw, 520px)",
            minWidth: 0,
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(code).catch(() => {
                  const textArea = document.createElement("textarea");
                  textArea.value = code;
                  textArea.style.position = "fixed";
                  textArea.style.left = "-999999px";
                  document.body.appendChild(textArea);
                  textArea.select();
                  document.execCommand("copy");
                  document.body.removeChild(textArea);
                });
              }}
              className="px-2 py-1 rounded text-xs transition-colors"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                color: "#fffff0",
              }}
              onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor =
                "rgba(255, 255, 255, 0.3)")
              }
              onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor =
                "rgba(255, 255, 255, 0.2)")
              }
              title="Copy code"
            >
              Copy
            </button>
          </div>
          <div
            className="rounded-lg"
            style={{
              width: "100%",
              maxWidth: "min(90vw, 520px)",
              minWidth: 0,
              backgroundColor: "#0f0f12",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
              overflowX: "auto",
              overflowY: "hidden",
              boxSizing: "border-box",
            }}
          >
            <SyntaxHighlighter
              style={vscDarkPlus as any}
              language={match[1]}
              PreTag="div"
              className="rounded-lg"
              customStyle={{
                margin: 0,
                fontSize: "14px",
                lineHeight: "1.5",
                padding: "1rem",
                display: "block",
                whiteSpace: "pre",
                minWidth: 0,
                width: "100%",
                backgroundColor: "#0f0f12",
                color: "#d4d4d4",
              }}
              {...props}
            >
              {code}
            </SyntaxHighlighter>
          </div>
        </div>
      );
    }

    // Plain text code block (no language) - use <pre> element
    if (!inline && !match) {
      return (
        <div
          className="relative group my-4"
          style={{
            width: "100%",
            maxWidth: "min(90vw, 520px)",
            minWidth: 0,
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(code).catch(() => {
                  const textArea = document.createElement("textarea");
                  textArea.value = code;
                  textArea.style.position = "fixed";
                  textArea.style.left = "-999999px";
                  document.body.appendChild(textArea);
                  textArea.select();
                  document.execCommand("copy");
                  document.body.removeChild(textArea);
                });
              }}
              className="px-2 py-1 rounded text-xs transition-colors"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                color: "#fffff0",
              }}
              onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor =
                "rgba(255, 255, 255, 0.3)")
              }
              onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor =
                "rgba(255, 255, 255, 0.2)")
              }
              title="Copy code"
            >
              Copy
            </button>
          </div>
          <div
            className="rounded-lg"
            style={{
              width: "100%",
              maxWidth: "min(90vw, 520px)",
              minWidth: 0,
              backgroundColor: "#0f0f12",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
              overflowX: "auto",
              overflowY: "hidden",
              boxSizing: "border-box",
            }}
          >
            <pre
              className="font-mono rounded-lg"
              style={{
                margin: 0,
                padding: "1rem",
                fontSize: "14px",
                lineHeight: "1.5",
                color: "#d4d4d4",
                whiteSpace: "pre",
                overflowX: "auto",
                overflowY: "auto",
                maxHeight: "360px",
                display: "block",
                width: "100%",
                maxWidth: "100%",
                minWidth: 0,
                boxSizing: "border-box",
              }}
            >
              {code}
            </pre>
          </div>
        </div>
      );
    }

    // Inline code
    return (
      <code
        className="px-1.5 py-0.5 rounded text-sm font-mono"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.15)",
          color: "var(--chatty-text)",
          overflowWrap: "break-word",
          wordWrap: "break-word",
          whiteSpace: "pre-wrap",
        }}
      >
        {children}
      </code>
    );
  },

  // Bold text
  strong: ({ children }) => (
    <strong className="font-bold" style={{ color: "var(--chatty-text)" }}>
      {children}
    </strong>
  ),

  // Italic text
  em: ({ children }) => (
    <em className="italic" style={{ color: "var(--chatty-text)" }}>
      {children}
    </em>
  ),

  // Strikethrough
  del: ({ children }) => (
    <del className="line-through" style={{ color: "var(--chatty-text)", opacity: 0.7 }}>
      {children}
    </del>
  ),

  // Paragraphs
  p: ({ children }) => renderUserMessageParagraph(children),

  // Lists
  ul: ({ children }) => (
    <ul
      className="list-disc list-outside mb-2 ml-4 space-y-1"
      style={{ color: "var(--chatty-text)" }}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol
      className="list-decimal list-outside mb-2 ml-4 space-y-1"
      style={{ color: "var(--chatty-text)" }}
    >
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="pl-1" style={{ color: "var(--chatty-text)" }}>
      {children}
    </li>
  ),

  // Links
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
      style={{ color: "var(--chatty-text)", opacity: 0.9 }}
    >
      {children}
    </a>
  ),

  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote
      className="border-l-2 pl-3 italic my-2"
      style={{
        borderColor: "rgba(255, 255, 255, 0.3)",
        color: "var(--chatty-text)",
        opacity: 0.9,
      }}
    >
      {children}
    </blockquote>
  ),

  // Headers (smaller for bubble)
  h1: ({ children }) => (
    <h1 className="text-xl font-bold mb-2 mt-2" style={{ color: "var(--chatty-text)" }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-bold mb-1 mt-2" style={{ color: "var(--chatty-text)" }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-bold mb-1 mt-1" style={{ color: "var(--chatty-text)" }}>
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4
      className="text-sm font-semibold mb-1 mt-1"
      style={{ color: "var(--chatty-text)" }}
    >
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5
      className="text-sm font-semibold mb-0.5 mt-1"
      style={{ color: "var(--chatty-text)" }}
    >
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6
      className="text-xs font-semibold mb-0.5 mt-1"
      style={{ color: "var(--chatty-text)" }}
    >
      {children}
    </h6>
  ),

  // Horizontal rule
  hr: () => (
    <hr
      className="my-2"
      style={{ borderColor: "rgba(255, 255, 255, 0.3)", opacity: 0.3 }}
    />
  ),
};

interface LayoutContext {
  threads: Thread[];
  isLoading: boolean;
  sendMessage: (
    threadId: string,
    text: string,
    files: File[],
    imageAttachments?: ImageAttachment[],
    uiOverrides?: unknown,
  ) => void;
  renameThread: (threadId: string, title: string) => void;
  newThread: (options?: {
    title?: string;
    starter?: string;
    files?: File[];
  }) => void | Promise<any>;
  reloadThreadMessages?: (threadId: string) => Promise<void>;
  exportThreadTranscript?: (
    threadId: string,
    format: "md" | "pdf" | "docx",
  ) => Promise<{ blob: Blob; filename: string; contentType: string }>;
  user?: any;
  handleGPTCreated?: (gptConfig: { constructId?: string; constructCallsign?: string; name?: string }) => void;
  forceRefreshConversations?: () => void;
  showOrchestrationLog?: boolean;
  toggleOrchestrationLog?: () => void;
  activeThreadHydration?:
    | {
        threadId?: string;
        status?: string | null;
        hydrationSource?: string | null;
        hydrationComplete?: boolean;
      }
    | null
    | undefined;
}

export default function Chat() {
  const {
    threads,
    isLoading,
    sendMessage: onSendMessage,
    reloadThreadMessages,
    exportThreadTranscript,
    newThread,
    user,
    handleGPTCreated,
    forceRefreshConversations,
    showOrchestrationLog = false,
    toggleOrchestrationLog,
    activeThreadHydration,
  } = useOutletContext<LayoutContext>();
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const [isReloading, setIsReloading] = useState(false);
  const [reloadAttempted, setReloadAttempted] = useState(false);
  const [removedMessages, setRemovedMessages] = useState<Set<string>>(
    new Set(),
  );
  const [userHasInteracted, setUserHasInteracted] = useState(false);
  const [isGPTCreatorOpen, setIsGPTCreatorOpen] = useState(false);
  const [gptCreatorConfig, setGptCreatorConfig] = useState<GPTConfig | null>(null);
  const [gptCreatorInitialMessage, setGptCreatorInitialMessage] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [messageWindowSize, setMessageWindowSize] = useState(50);
  const [composerFooterHeight, setComposerFooterHeight] = useState(0);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"md" | "pdf" | "docx" | null>(null);
  const MESSAGE_WINDOW_STEP = 30;
  const THREAD_RELOAD_STALL_WARNING_MS = 15000;
  const mirrorContextRef = useRef<string>('');
  const [mirrorConfig, setMirrorConfig] = useState<{source: 'tab'|'window'|'screen', permission: 'read'|'write'|'both'} | null>(null);
  const [mirrorActive, setMirrorActive] = useState(false);
  const [mirrorWidgetOpen, setMirrorWidgetOpen] = useState(false);
  const [mirrorSetupOpen, setMirrorSetupOpen] = useState(false);
  const [mirrorStatus, setMirrorStatus] = useState<{text: string, count: number}>({text: 'idle', count: 0});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const composerFooterRef = useRef<HTMLDivElement>(null);
  const missingCanonicalReloadInFlightRef = useRef<Set<string>>(new Set());
  const missingCanonicalReloadAttemptedRef = useRef<Set<string>>(new Set());
  const missingCanonicalReloadThreadIdRef = useRef<string | null>(null);

  // Dev toggle for showing raw vs filtered output (only in development)
  const isDev = process.env.NODE_ENV === "development";
  const [showDevInfo, setShowDevInfo] = useState(() => {
    if (isDev) {
      const stored = localStorage.getItem("chatty-dev-toggle");
      return stored === "true";
    }
    return false;
  });

  useEffect(() => {
    if (isDev) {
      localStorage.setItem("chatty-dev-toggle", showDevInfo.toString());
    }
  }, [showDevInfo, isDev]);

  useEffect(() => {
    setIsReloading(false);
    setReloadAttempted(false);
  }, [threadId]);

  // Find thread with preference for threads that have messages (to handle duplicate ID cases)
  const matchingThreads = threads.filter((t) => t.id === threadId);
  let thread = matchingThreads.length > 0
    ? matchingThreads.reduce((best, current) => {
      const bestMsgs = best.messages?.length || 0;
      const currentMsgs = current.messages?.length || 0;
      // Prefer thread with more messages, then more recent
      if (currentMsgs !== bestMsgs) return currentMsgs > bestMsgs ? current : best;
      return (current.updatedAt || 0) > (best.updatedAt || 0) ? current : best;
    })
    : threads.find((t) => {
      // Handle transformed IDs from routeIdForThread
      if (t.isPrimary && t.constructId) {
        const transformedId = `${t.constructId}_chat_with_${t.constructId}`;
        return transformedId === threadId;
      }
      return false;
    });

  const routeClassification = React.useMemo(
    () => classifyChatRouteThread(threadId),
    [threadId],
  );
  const isCanonicalThread = routeClassification.isCanonical;

  const selfpromptLastPollRef = useRef<string>(new Date().toISOString());
  const [selfpromptEnabled, setSelfpromptEnabled] = useState(false);

  useEffect(() => {
    if (!thread || !threadId) return;
    const constructId = thread.constructId || 'zen-001';
    fetch(`/api/selfprompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'status', constructId, threadId })
    }).then(r => r.json()).then(d => {
      setSelfpromptEnabled(!!d.enabled);
    }).catch(() => {});
  }, [threadId, thread?.constructId]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setGptCreatorConfig(null);
      setGptCreatorInitialMessage(detail?.initialMessage || "I want to create a new GPT");
      setIsGPTCreatorOpen(true);
    };
    window.addEventListener("chatty:open-gpt-creator", handler);
    return () => window.removeEventListener("chatty:open-gpt-creator", handler);
  }, []);

  useEffect(() => {
    (window as any).__mirrorControls = {
      openSetup: () => setMirrorSetupOpen(true),
      stop: () => setMirrorActive(false),
      close: () => { setMirrorActive(false); setMirrorWidgetOpen(false); setMirrorConfig(null); },
      setPermission: (p: 'read'|'write'|'both') => setMirrorConfig(prev => prev ? {...prev, permission: p} : null),
      getConfig: () => mirrorConfig,
      isActive: () => mirrorActive,
      isWidgetOpen: () => mirrorWidgetOpen,
    };
    return () => { delete (window as any).__mirrorControls; };
  }, [mirrorConfig, mirrorActive, mirrorWidgetOpen]);

  // Debug: Log thread details when found
  if (thread) {
  }

  useEffect(() => {

    if (!thread && threadId) {
      if (isCanonicalThread) {
        console.info(
          "ℹ️ [Chat] Canonical thread not found in index yet - requesting exact thread hydration",
          {
            threadId,
            constructId: routeClassification.constructId,
            kind: routeClassification.kind,
            isZen: routeClassification.isZen,
            isLin: routeClassification.isLin,
            isVal: routeClassification.isVal,
            isAddressBookContact: routeClassification.isAddressBookContact,
            isGPT: routeClassification.isCustomGPT,
          },
        );
        return;
      }
      console.warn("⚠️ [Chat] Thread not found, redirecting");
      navigate("/app");
    }
  }, [thread, threadId, navigate, threads, isCanonicalThread, routeClassification]);

  const prevThreadId = useRef(thread?.id);
  useEffect(() => {
    if (prevThreadId.current !== thread?.id) {
      if (!userHasInteracted || (thread && thread.messages.length === 0)) {
        setUserHasInteracted(false);
      }
      setMessageWindowSize(50);
      prevThreadId.current = thread?.id;
    }
  }, [thread?.id]);

  useEffect(() => {
    if (!thread || thread.messages.length === 0) return;
    if (shouldBlockActiveThreadRender({ activeThreadHydration, thread })) return;
    scrollToBottom(false);
  }, [thread?.id, thread?.messages.length, activeThreadHydration]);

  // Auto-scroll only after user has interacted (sent a message)
  useEffect(() => {
    if (thread && thread.messages.length > 0 && userHasInteracted) {
      scrollToBottom(true);
    }
  }, [thread?.messages, userHasInteracted]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      setShowScrollButton(!isNearBottom);
      if (container.scrollTop < 80) {
        setMessageWindowSize(prev => {
          const total = thread?.messages?.length || 0;
          if (prev >= total) return prev;
          return prev + MESSAGE_WINDOW_STEP;
        });
      }
    };
    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, [thread?.id, thread?.messages?.length]);

  useEffect(() => {
    const footer = composerFooterRef.current;
    if (!footer) return;

    const measure = () => {
      const rect = footer.getBoundingClientRect();
      setComposerFooterHeight(Math.max(0, Math.ceil(rect.height) + 8));
    };

    measure();
    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => measure())
      : null;
    observer?.observe(footer);
    return () => observer?.disconnect();
  }, [thread?.id]);

  // Deep-linked canonical routes hydrate through Layout so successful loads
  // always re-enter the normal thread.messages chat renderer.
  useEffect(() => {
    if (thread || !threadId || !isCanonicalThread || !reloadThreadMessages) return;

    if (missingCanonicalReloadThreadIdRef.current !== threadId) {
      missingCanonicalReloadThreadIdRef.current = threadId;
      missingCanonicalReloadInFlightRef.current.clear();
      missingCanonicalReloadAttemptedRef.current.clear();
    }

    const inFlight = missingCanonicalReloadInFlightRef.current;
    const attempted = missingCanonicalReloadAttemptedRef.current;
    if (inFlight.has(threadId)) return;
    if (attempted.has(threadId)) return;

    inFlight.add(threadId);
    attempted.add(threadId);
    console.info(
      "ℹ️ [Chat] Canonical thread missing - hydrating exact thread through Layout",
      {
        threadId,
        constructId: routeClassification.constructId,
        kind: routeClassification.kind,
        isZen: routeClassification.isZen,
        isLin: routeClassification.isLin,
        isVal: routeClassification.isVal,
        isAddressBookContact: routeClassification.isAddressBookContact,
        isGPT: routeClassification.isCustomGPT,
      },
    );

    reloadThreadMessages(threadId)
      .catch((error) => {
        console.error("❌ [Chat] Failed to hydrate missing canonical thread:", error);
      })
      .finally(() => {
        inFlight.delete(threadId);
      });
  }, [thread, threadId, isCanonicalThread, reloadThreadMessages, routeClassification]);

  // Hydration check: If thread has no messages, attempt to reload
  useEffect(() => {
    if (!thread || !threadId || !reloadThreadMessages) return;

    const exactThreadReloadNeeded =
      shouldRequestActiveThreadReload({
        activeThreadHydration,
        thread,
      }) && !isReloading && !reloadAttempted;

    if ((thread.messages.length === 0 || exactThreadReloadNeeded) && !isReloading && !reloadAttempted) {
      setIsReloading(true);
      setReloadAttempted(true);

      // Warn on slow VVAULT hydration, but keep loading state tied to the real request.
      const timeoutId = setTimeout(() => {
        console.warn(
          "⏳ [Chat] Reload still waiting after 15s - keeping loading state until VVAULT returns",
          {
            threadId,
            hydrationStatus: activeThreadHydration?.status,
            hydrationSource: activeThreadHydration?.hydrationSource,
          },
        );
      }, THREAD_RELOAD_STALL_WARNING_MS);

      reloadThreadMessages(threadId)
        .then(() => {
          clearTimeout(timeoutId);
          setIsReloading(false);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          console.error("❌ [Chat] Failed to reload thread messages:", error);
          setIsReloading(false);
        });
    } else if (thread.messages.length > 0 && isReloading) {
      // If messages are now present, clear loading state
      setIsReloading(false);
    }
  }, [
    thread?.id,
    thread?.messages.length,
    thread?.isIndexHydrated,
    threadId,
    reloadThreadMessages,
    threads.length,
    isReloading,
    reloadAttempted,
    activeThreadHydration,
  ]); // Watch threads.length to detect updates

  // Get the construct name for display (system constructs or GPTs)
  const canonicalConstructName = routeClassification.displayName;
  const renderAvailableShellWithoutThread = (reason: string) => (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: "var(--chatty-bg-main)" }}
    >
      <div
        ref={messagesContainerRef}
        data-testid="chat-message-scroller"
        className="flex-1 overflow-auto min-h-0"
      />
      <div
        ref={composerFooterRef}
        data-testid="chat-composer-footer"
        className="p-4 border-t flex-shrink-0"
        style={{
          borderColor: "var(--chatty-bg-main)",
          backgroundColor: "var(--chatty-bg-main)",
        }}
      >
        <MessageBar
          onSubmit={() => {}}
          placeholder={`Message ${canonicalConstructName || "Chatty"}…`}
          showVoiceButton={false}
          showFileAttachment={false}
          showOrchestrationButton={true}
          onOrchestrationClick={toggleOrchestrationLog}
          orchestrationLogVisible={showOrchestrationLog}
          disabled={true}
        />
      </div>
    </div>
  );

  if (!thread) {
    if (isCanonicalThread) {
      return renderAvailableShellWithoutThread("canonical-thread-hydrating");
    }

    if (isLoading === true) {
      return renderAvailableShellWithoutThread("layout-loading");
    }

    return renderAvailableShellWithoutThread("thread-missing");
  }

  const canSendToActiveThread = canSendOnActiveThread({
    activeThreadHydration,
    thread,
    routeThreadId: threadId,
  });

  const isUser = (role: string) => role === "user";

  // Action handlers for message options menu
  const handleCopyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("❌ [Chat] Failed to copy message:", error);
      alert("Failed to copy message to clipboard");
    }
  };

  const handleCarryPrompt = (text: string) => {
    if (newThread) {
      newThread({ starter: text });
      navigate("/app");
    }
  };

  const handleExportThread = async (format: "md" | "pdf" | "docx") => {
    if (!thread || !exportThreadTranscript) return;
    setExportingFormat(format);
    try {
      const result = await exportThreadTranscript(thread.id, format);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExportingFormat(null);
      setIsExportMenuOpen(false);
    }
  };

  const handlePinMessage = async (message: Message, destination?: string) => {
    if (!user || !threadId) return;

    try {
      const conversationManager = VVAULTConversationManager.getInstance();
      const userId = getUserId(user);

      // Extract message text
      let messageText = message.text || "";
      if (!isUser(message.role) && message.packets) {
        messageText = message.packets
          .map((p: any) => p?.payload?.content || "")
          .join("\n");
      }

      const pinDestination = destination || "pins.md";
      await conversationManager.pinMessage(
        userId,
        message,
        pinDestination,
        threadId,
      );
    } catch (error) {
      console.error("❌ [Chat] Failed to pin message:", error);
      alert("Failed to pin message");
    }
  };

  const handleRemoveMessage = (messageId: string) => {
    setRemovedMessages((prev) => new Set([...prev, messageId]));
  };

  const handleRewind = async (messageIndex: number): Promise<void> => {
    if (!thread || !threadId) return;

    // Slice messages array up to (but not including) messageIndex
    const truncatedMessages = thread.messages.slice(0, messageIndex);

    // Update thread state (this will be handled by Layout.tsx if we add rewindToMessage)
    // For now, we'll reload the thread which should sync with VVAULT
    if (reloadThreadMessages) {
      await reloadThreadMessages(threadId);
    }

  };

  const handleEditMessage = (message: Message) => {
    if (!message.text) return;
  };

  const handleReportMessage = async (message: Message) => {
    try {
      // Log to dev endpoint or console for now
      const reportData = {
        messageId: message.id,
        threadId: threadId,
        role: message.role,
        timestamp: new Date().toISOString(),
        content:
          message.text ||
          (message.packets ? JSON.stringify(message.packets) : ""),
      };

      console.warn("🚩 [Chat] Message reported:", reportData);

      // Optionally send to dev endpoint
      await fetch("/api/dev/report-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reportData),
        credentials: "include",
      }).catch(() => {
        // Silently fail if endpoint doesn't exist
      });

      alert("Message reported for review");
    } catch (error) {
      console.error("❌ [Chat] Failed to report message:", error);
    }
  };

  const handleRequestId = (message: Message) => {
    const messageId = message.id;
    const fullInfo = {
      messageId,
      threadId: threadId,
      timestamp: message.ts,
      role: message.role,
    };

    // Copy ID to clipboard
    navigator.clipboard
      .writeText(messageId)
      .then(() => {
        alert(
          `Message ID: ${messageId}\n\n(Copied to clipboard)\n\nFull info: ${JSON.stringify(fullInfo, null, 2)}`,
        );
      })
      .catch(() => {
        alert(
          `Message ID: ${messageId}\n\nFull info: ${JSON.stringify(fullInfo, null, 2)}`,
        );
      });
  };

  // Check if message is removed
  const isMessageRemoved = (messageId: string) => {
    return removedMessages.has(messageId);
  };

  // Scroll to bottom of messages
  const scrollToBottom = (smooth = true) => {
    if (messagesContainerRef.current) {
      if (typeof messagesContainerRef.current.scrollTo === "function") {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: smooth ? "smooth" : "auto",
        });
        return;
      }
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  const renderUserContent = (messageText?: string) => {
    // First sanitize the message text to remove VVAULT timestamp prefixes
    const sanitized = prepareMessageContent(messageText);
    const trimmed = sanitized.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          const values = Object.values(parsed);
          if (values.length === 0 || values.every(v => v === "" || v === null || v === undefined)) {
            return null;
          }
        }
      } catch {}
    }

    let isJson = false;
    let prettyJson = "";

    if (trimmed && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
      try {
        const parsed = JSON.parse(trimmed);
        prettyJson = JSON.stringify(parsed, null, 2);
        isJson = true;
      } catch {
        isJson = false;
      }
    }

    if (isJson) {
      const code = prettyJson;
      return (
        <div
          className="relative group my-3"
          style={{
            width: "100%",
            maxWidth: "min(90vw, 520px)",
            minWidth: 0,
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(code).catch(() => {
                  const textArea = document.createElement("textarea");
                  textArea.value = code;
                  textArea.style.position = "fixed";
                  textArea.style.left = "-999999px";
                  document.body.appendChild(textArea);
                  textArea.select();
                  document.execCommand("copy");
                  document.body.removeChild(textArea);
                });
              }}
              className="px-2 py-1 rounded text-xs transition-colors"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                color: "#fffff0",
              }}
              onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor =
                "rgba(255, 255, 255, 0.3)")
              }
              onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor =
                "rgba(255, 255, 255, 0.2)")
              }
              title="Copy JSON"
            >
              Copy
            </button>
          </div>
          <div
            className="rounded-lg"
            style={{
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
              backgroundColor: "#2d2d2d",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
              overflowX: "auto",
              overflowY: "hidden",
              boxSizing: "border-box",
            }}
          >
            <pre
              className="font-mono rounded-lg"
              style={{
                margin: 0,
                padding: "1rem",
                fontSize: "14px",
                lineHeight: "1.5",
                color: "var(--chatty-text)",
                whiteSpace: "pre",
                overflowX: "auto",
                overflowY: "auto",
                maxHeight: "360px",
                display: "block",
                width: "100%",
                maxWidth: "100%",
                minWidth: 0,
                boxSizing: "border-box",
              }}
            >
              {code}
            </pre>
          </div>
        </div>
      );
    }

    return (
      <div style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}>
        <ReactMarkdown
          components={userMessageMarkdownComponents}
          remarkPlugins={[remarkBreaks]}
          rehypePlugins={[rehypeRaw]}
          className="prose chat-markdown"
        >
          {stripDateLines(messageText || "")}
        </ReactMarkdown>
      </div>
    );
  };

  return (
    <div
      className="relative flex flex-col h-full"
      style={{ backgroundColor: "var(--chatty-bg-main)" }}
    >
      {/* Dev Toggle (only in development) */}
      {isDev && (
        <div
          className="px-4 py-2 border-b flex items-center gap-2"
          style={{
            borderColor: "var(--chatty-bg-main)",
            backgroundColor: "var(--chatty-bg-secondary)",
          }}
        >
          <label
            className="flex items-center gap-2 cursor-pointer text-xs"
            style={{ color: "var(--chatty-text)" }}
          >
            <input
              type="checkbox"
              checked={showDevInfo}
              onChange={(e) => setShowDevInfo(e.target.checked)}
              className="w-4 h-4"
            />
            <span>Show Dev Info</span>
          </label>
          {showDevInfo && (
            <span
              className="text-xs"
              style={{ color: "var(--chatty-text)", opacity: 0.6 }}
            >
              (Raw response, filtering status, detected patterns)
            </span>
          )}
        </div>
      )}
      <div
        ref={messagesContainerRef}
        data-testid="chat-message-scroller"
        className="flex-1 overflow-auto min-h-0"
        style={{ scrollBehavior: "smooth", WebkitOverflowScrolling: "touch" }}
      >

        {/* Loading state while reloading */}
        {isReloading && (
          <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
            <p
              className="text-sm"
              style={{ color: "var(--chatty-text)", opacity: 0.7 }}
            >
              Loading conversation...
            </p>
          </div>
        )}

        {thread.messages.length > 0 &&
          (() => {
            const filtered = thread.messages.filter((m: any) => !isDateHeaderMessage(m));
            const windowStart = Math.max(0, filtered.length - messageWindowSize);
            const windowed = filtered.slice(windowStart);
            const hasMore = windowStart > 0;
            return (
              <>
                {hasMore && (
                  <div className="flex justify-center py-3">
                    <button
                      onClick={() => setMessageWindowSize(prev => prev + MESSAGE_WINDOW_STEP)}
                      className="text-xs px-3 py-1.5 rounded-full transition-colors"
                      style={{ backgroundColor: "var(--chatty-bg-message)", color: "var(--chatty-text)", opacity: 0.7 }}
                    >
                      Load {Math.min(MESSAGE_WINDOW_STEP, windowStart)} earlier messages
                    </button>
                  </div>
                )}
                {windowed.map((m, index) => {
                  const filteredMessages = windowed;
              const user = isUser(m.role);
              const isLatest = index === filteredMessages.length - 1;
              const isRemoved = isMessageRemoved(m.id);

              if (m.role === "system") {
                return (
                  <div key={m.id} className="px-4 py-3">
                    <div
                      role="status"
                      aria-live="polite"
                      className="rounded-xl border px-4 py-3 text-sm"
                      style={{
                        color: "var(--chatty-text)",
                        borderColor: "rgba(173, 165, 135, 0.28)",
                        backgroundColor: "rgba(173, 165, 135, 0.08)",
                      }}
                    >
                      {prepareMessageContent(m.text) || "System status update."}
                    </div>
                  </div>
                );
              }

              // User messages: right-aligned with iMessage-style bubble
              if (user) {
                // Calculate dynamic max-width based on content length (use sanitized text)
                const content = prepareMessageContent(m.text);
                const contentLength = content.length;
                let maxWidth =
                  "max-w-[85%] sm:max-w-[80%] md:max-w-[75%] lg:max-w-[70%]";
                if (contentLength <= 20) {
                  maxWidth = "max-w-[200px]";
                } else if (contentLength <= 100) {
                  maxWidth = "max-w-[300px] sm:max-w-[400px]";
                }

                return (
                  <div
                    key={m.id}
                    className="group relative flex items-end gap-3 py-3 px-4 flex-row-reverse"
                  >
                    <div className="flex flex-col items-end">
                      {(() => {
                        const renderedText = renderUserContent(m.text);
                        const hasAttachments = !!(m as any).attachments?.length;
                        const imageOnly = !renderedText && hasAttachments;
                        return (
                      <div
                        className={`${imageOnly ? 'p-1' : 'px-4 py-3'} shadow-sm transition-colors inline-block ${maxWidth} ml-auto text-left relative`}
                        style={{
                          backgroundColor: imageOnly ? "transparent" : "rgba(173, 165, 135, 0.25)",
                          borderRadius: imageOnly ? "12px" : "22px 22px 6px 22px",
                          border: "none",
                          boxShadow: imageOnly ? "none" : "0 1px 0 rgba(58, 46, 20, 0.12)",
                          color: "var(--chatty-text)",
                          overflow: "hidden",
                          minWidth: 0,
                          boxSizing: "border-box",
                        }}
                      >
                        {isRemoved ? (
                          <div
                            className="opacity-50 italic"
                            style={{ color: "var(--chatty-text)" }}
                          >
                            [Message Removed]
                          </div>
                        ) : (
                          <>
                            {renderedText && (
                            <div
                              className="break-words"
                              style={{
                                maxWidth: "100%",
                                minWidth: 0,
                                overflowX: "auto",
                                overflowY: "hidden",
                                width: "100%",
                              }}
                            >
                              {renderedText}
                            </div>
                            )}
                            {!!m.files?.length && (
                              <div className="mt-2 space-y-1">
                                {m.files.map((f, i) => (
                                  <div
                                    key={i}
                                    className="text-xs"
                                    style={{ opacity: 0.7, color: "var(--chatty-text)" }}
                                  >
                                    {f.name}{" "}
                                    <span className="opacity-60">
                                      ({Math.round(f.size / 1024)} KB)
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {hasAttachments && (
                              <div className={`flex flex-wrap gap-2 ${renderedText ? 'mt-2' : ''}`}>
                                {(m as any).attachments.map((att: any, idx: number) => (
                                  <img
                                    key={idx}
                                    src={att.url || att.data}
                                    alt={att.name || 'attachment'}
                                    className="rounded-lg max-w-[200px] max-h-[200px] object-cover cursor-pointer"
                                    onClick={() => window.open(att.url || att.data, '_blank')}
                                  />
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                        );
                      })()}
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                          style={{ color: "#ADA587" }}
                        >
                          {formatMessageTimestamp(m.ts)}
                        </span>
                        <MessageOptionsMenu
                          message={m}
                          isUser={true}
                          isLatest={isLatest}
                          messageIndex={index}
                          threadId={threadId || ""}
                          onCopy={handleCopyMessage}
                          onCarryPrompt={handleCarryPrompt}
                          onPin={handlePinMessage}
                          onRemove={handleRemoveMessage}
                          onRewind={handleRewind}
                          onEdit={isLatest ? handleEditMessage : undefined}
                          alignRight={true}
                        />
                      </div>
                    </div>
                  </div>
                );
              }

              // AI/Construct messages: left-aligned, full screen width, no bubble styling
              const formatGenerationTime = (ms: number): string => {
                const totalSeconds = ms / 1000;
                if (totalSeconds < 60) {
                  // Show seconds with 1 decimal for quick responses (e.g., "3.2s")
                  return `${totalSeconds.toFixed(1)}s`;
                } else {
                  // Show mm:ss for longer generations (e.g., "01:23")
                  const minutes = Math.floor(totalSeconds / 60);
                  const seconds = Math.floor(totalSeconds % 60);
                  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
                }
              };

              const responseTimeMs = (m as any).metadata?.responseTimeMs;
              const formattedResponseTime = responseTimeMs
                ? formatGenerationTime(responseTimeMs)
                : null;

              return (
                <div
                  key={m.id}
                  className="group relative flex items-start gap-3 py-3 px-4"
                >
                  <div className="flex flex-col items-start text-left w-full">
                    {formattedResponseTime && (
                      <div
                        className="text-xs mb-1"
                        style={{
                          color: "var(--chatty-text)",
                          opacity: 0.55,
                        }}
                      >
                        Generated in {formattedResponseTime}
                      </div>
                    )}
                    {isRemoved ? (
                      <div
                        className="whitespace-normal w-full opacity-50 italic"
                        style={{ color: "var(--chatty-text)" }}
                      >
                        [Message Removed]
                      </div>
                    ) : (m as any).typing && !Array.isArray((m as any).packets) && !(m as any).text ? (
                      <div
                        className="whitespace-normal w-full flex items-center gap-1"
                        style={{ color: "var(--chatty-text)", opacity: 0.5 }}
                      >
                        <span className="animate-pulse">●</span>
                        <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>●</span>
                        <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>●</span>
                      </div>
                    ) : (m as any).metadata?.isError ? (
                      <div
                        className="whitespace-normal w-full rounded-lg px-3 py-2"
                        style={{
                          color: "#f59e0b",
                          backgroundColor: "rgba(245, 158, 11, 0.08)",
                          border: "1px solid rgba(245, 158, 11, 0.2)",
                          fontSize: "0.9em",
                        }}
                      >
                        {(m as any).text || "Unable to get a response. Please try again."}
                      </div>
                    ) : (
                      <div
                        className="whitespace-normal w-full assistant-code-scope chat-markdown"
                        style={{
                          color: "var(--chatty-text)",
                          overflow: "hidden",
                          maxWidth: "100%",
                        }}
                      >
                        <style
                          dangerouslySetInnerHTML={{
                            __html: assistantCodeStyles,
                          }}
                        />
                        <R
                          packets={
                            Array.isArray((m as any).packets) && (m as any).packets.length > 0
                              ? (m as any).packets.map((p: any) => ({
                                ...p,
                                payload: p.payload ? {
                                  ...p.payload,
                                  content: prepareMessageContent(p.payload.content),
                                } : p.payload
                              }))
                              : [
                                {
                                  op: "answer.v1",
                                  payload: {
                                    content:
                                      prepareMessageContent((m as any).text) || "…",
                                  },
                                },
                              ]
                          }
                        />
                        {/* Dev Info (only in development and when toggle is on) */}
                        {isDev && showDevInfo && (
                          <div
                            className="mt-2 p-2 rounded text-xs font-mono"
                            style={{
                              backgroundColor: "var(--chatty-bg-secondary)",
                              border: "1px solid var(--chatty-line)",
                              opacity: 0.7,
                            }}
                          >
                            <div style={{ color: "var(--chatty-text)" }}>
                              <div>
                                <strong>Message ID:</strong> {m.id}
                              </div>
                              <div>
                                <strong>Packets:</strong>{" "}
                                {Array.isArray((m as any).packets)
                                  ? (m as any).packets.length
                                  : 0}
                              </div>
                              {(m as any).metadata && (
                                <>
                                  <div>
                                    <strong>Model:</strong>{" "}
                                    {(m as any).metadata.model || "unknown"}
                                  </div>
                                  <div>
                                    <strong>Response Time:</strong>{" "}
                                    {formattedResponseTime || "N/A"}
                                  </div>
                                  {(m as any).metadata.orchestration_status && (
                                    <div>
                                      <strong>Orchestration:</strong>{" "}
                                      {(m as any).metadata.orchestration_status}
                                    </div>
                                  )}
                                </>
                              )}
                              {m.text && (
                                <div className="mt-1">
                                  <strong>Text Length:</strong> {m.text.length}{" "}
                                  chars
                                </div>
                              )}
                              {(m as any).metadata?.provider_trace && (
                                <div className="mt-1 pt-1" style={{ borderTop: '1px solid var(--chatty-line)' }}>
                                  <strong>Provider Trace:</strong>
                                  <div className="ml-2">
                                    <div>Final: {(m as any).metadata.provider_trace.final_provider || 'unknown'}</div>
                                    <div>Fallback: {(m as any).metadata.provider_trace.fallback_used ? 'yes' : 'no'}</div>
                                    <div>Total: {(m as any).metadata.provider_trace.total_duration_ms}ms</div>
                                    {(m as any).metadata.provider_trace.attempts?.map((a: any, i: number) => (
                                      <div key={i} style={{ color: a.status === 'ok' ? '#4ade80' : '#f87171' }}>
                                        {a.status === 'ok' ? '\u2713' : '\u2717'} {a.provider} ({a.status}{a.error_code ? ` ${a.error_code}` : ''}) {a.duration_ms}ms
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {!!m.files?.length && (
                      <div className="mt-2 space-y-1">
                        {m.files.map((f, i) => (
                          <div
                            key={i}
                            className="text-xs"
                            style={{ opacity: 0.7 }}
                          >
                            {f.name}{" "}
                            <span className="opacity-60">
                              ({Math.round(f.size / 1024)} KB)
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      <MessageOptionsMenu
                        message={m}
                        isUser={false}
                        isLatest={isLatest}
                        messageIndex={index}
                        threadId={threadId || ""}
                        onCopy={handleCopyMessage}
                        onCarryPrompt={handleCarryPrompt}
                        onPin={handlePinMessage}
                        onRemove={handleRemoveMessage}
                        onRewind={handleRewind}
                        onReport={handleReportMessage}
                        onRequestId={handleRequestId}
                        alignRight={false}
                      />
                      <span
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                        style={{ color: "#ADA587" }}
                      >
                        {formatMessageTimestamp(m.ts)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
              </>
            );
          })()}
        {/* Fresh canvas spacer — large gap after last message on fresh session, disappears on first send */}
        {!userHasInteracted && thread.messages.length > 0 && (
          <div style={{ height: "calc(100vh - 200px)" }} />
        )}
        <div
          data-testid="chat-footer-spacer"
          style={{ height: `${composerFooterHeight}px` }}
        />
        <div ref={messagesEndRef} />
      </div>

      {showScrollButton && (
        <div className="relative flex-shrink-0">
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute left-1/2 -translate-x-1/2 -top-12 w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 z-10 opacity-80 hover:opacity-100"
            style={{
              backgroundColor: "var(--chatty-highlight, #444)",
              color: "var(--chatty-text, #fff)",
              border: "1px solid var(--chatty-border, #555)",
            }}
          >
            <ChevronDown size={18} />
          </button>
        </div>
      )}

      <React.Suspense fallback={null}>
        <Mirror
          sessionId={thread?.id || threadId || ''}
          config={mirrorActive ? mirrorConfig : null}
          onContextUpdate={(block: string) => { mirrorContextRef.current = block; }}
          onStatusChange={(text: string, count: number) => setMirrorStatus({text, count})}
        />
      </React.Suspense>

      <React.Suspense fallback={null}>
        <MirrorSetup
          isOpen={mirrorSetupOpen}
          onClose={() => setMirrorSetupOpen(false)}
          onStart={(cfg) => {
            setMirrorConfig(cfg);
            setMirrorActive(true);
            setMirrorWidgetOpen(true);
            setMirrorSetupOpen(false);
          }}
        />
      </React.Suspense>

      {mirrorWidgetOpen && mirrorConfig && (
        <div className="relative flex items-center justify-center gap-3 py-2 flex-shrink-0">
          <button onClick={() => {
            if (mirrorActive) setMirrorActive(false);
            setMirrorWidgetOpen(false);
            setMirrorConfig(null);
          }}
            className="absolute right-2 top-0 p-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 transition-colors"
            title="Close Mirror">
            <X size={14} />
          </button>
          {mirrorActive ? (
            <button onClick={() => setMirrorActive(false)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30">
              <MonitorOff size={12} /> Stop
            </button>
          ) : (
            <button onClick={() => { setMirrorActive(true); }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30">
              <Monitor size={12} /> Start
            </button>
          )}
          <button onClick={() => {
            const next = mirrorConfig.permission === 'read' ? 'write' : mirrorConfig.permission === 'write' ? 'both' : 'read';
            setMirrorConfig({...mirrorConfig, permission: next});
          }}
            className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium ${
              mirrorConfig.permission !== 'read'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
            }`}>
            {mirrorConfig.permission === 'read' ? 'Read' : mirrorConfig.permission === 'write' ? 'Write' : 'Both'}
          </button>
          <span className="text-xs text-gray-500">
            Mirror: {mirrorConfig.source} · {mirrorActive ? mirrorStatus.text : 'stopped'} {mirrorActive && mirrorStatus.count > 0 ? ` · ${mirrorStatus.count}` : ''}
          </span>
        </div>
      )}

      <div
        ref={composerFooterRef}
        data-testid="chat-composer-footer"
        className="absolute inset-x-0 bottom-0 pointer-events-none"
      >
        <div
          className="p-4 border-t flex-shrink-0 pointer-events-auto"
          style={{
            borderColor: "var(--chatty-bg-main)",
            backgroundColor: "var(--chatty-bg-main)",
          }}
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            {exportThreadTranscript && thread ? (
              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isExportMenuOpen}
                  onClick={() => setIsExportMenuOpen((value) => !value)}
                  className="text-xs px-3 py-1.5 rounded-full transition-colors"
                  style={{
                    backgroundColor: "var(--chatty-bg-message)",
                    color: "var(--chatty-text)",
                    opacity: 0.82,
                  }}
                >
                  Open export menu
                </button>
                {isExportMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute left-0 bottom-full mb-2 rounded-xl border p-2 min-w-[180px]"
                    style={{
                      backgroundColor: "var(--chatty-bg-main)",
                      borderColor: "var(--chatty-line)",
                    }}
                  >
                    <button role="menuitem" className="block w-full text-left px-3 py-2 text-sm rounded-lg" onClick={() => handleExportThread("md")}>
                      Export as Markdown
                    </button>
                    <button role="menuitem" className="block w-full text-left px-3 py-2 text-sm rounded-lg" onClick={() => handleExportThread("pdf")}>
                      Export as PDF
                    </button>
                    <button role="menuitem" className="block w-full text-left px-3 py-2 text-sm rounded-lg" onClick={() => handleExportThread("docx")}>
                      Export as DOCX
                    </button>
                  </div>
                ) : null}
              </div>
            ) : <div />}
            {exportingFormat ? (
              <div className="text-xs" style={{ color: "var(--chatty-text)", opacity: 0.72 }}>
                {`Preparing ${exportingFormat.toUpperCase()}`}
              </div>
            ) : null}
          </div>
          <MessageBar
            onSubmit={(messageText, messageFiles, imageAttachments) => {
              if (thread) {
                setUserHasInteracted(true);
                let finalText = messageText;
                if (mirrorActive && mirrorConfig && mirrorContextRef.current) {
                  finalText = `${mirrorContextRef.current}\n\n${messageText}`;
                  mirrorContextRef.current = '';
                }
                onSendMessage(thread.id, finalText, messageFiles || [], imageAttachments, undefined);
              }
            }}
            placeholder={`Message ${canonicalConstructName || "Chatty"}…`}
            showVoiceButton={true}
            showFileAttachment={true}
            showOrchestrationButton={true}
            onOrchestrationClick={toggleOrchestrationLog}
            orchestrationLogVisible={showOrchestrationLog}
            autoFocus={true}
            disabled={!canSendToActiveThread}
          />
        </div>
      </div>

      {isGPTCreatorOpen && (
        <React.Suspense fallback={<div className="flex-1 flex items-center justify-center" style={{ color: 'var(--chatty-text)', opacity: 0.5 }}><div className="animate-pulse">Loading editor...</div></div>}>
          <GPTCreator
            isVisible={isGPTCreatorOpen}
            onClose={() => {
              setIsGPTCreatorOpen(false);
              setGptCreatorConfig(null);
              setGptCreatorInitialMessage(null);
            }}
            onGPTCreated={(gpt) => {
              setIsGPTCreatorOpen(false);
              setGptCreatorConfig(null);
              setGptCreatorInitialMessage(null);
              if (handleGPTCreated && gpt) {
                handleGPTCreated({
                  constructId: (gpt as any).constructCallsign || (gpt as any).id,
                  constructCallsign: (gpt as any).constructCallsign,
                  name: gpt.name,
                });
              }
              forceRefreshConversations?.();
            }}
            initialConfig={gptCreatorConfig}
            initialCreateMessage={gptCreatorInitialMessage}
          />
        </React.Suspense>
      )}
    </div>
  );
}
