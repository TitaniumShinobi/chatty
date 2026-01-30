import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import { R } from "../runtime/render";
import { MessageOptionsMenu } from "../components/MessageOptionsMenu";
import { VVAULTConversationManager } from "../lib/vvaultConversationManager";
import { getUserId } from "../lib/auth";
import MessageBar from "../components/MessageBar";
import { prepareMessageContent, stripDateLines } from "../utils/text";

type Message = {
  id: string;
  role: "user" | "assistant";
  text?: string;
  packets?: import("../types").AssistantPacket[];
  ts: number;
  files?: { name: string; size: number }[];
  typing?: boolean; // For typing indicators
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

// Markdown components for user messages (styled for bubble with #ADA587 background and #fffff0 text)
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
              backgroundColor: "#000000",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
              overflowX: "auto",
              overflowY: "hidden",
              boxSizing: "border-box",
            }}
          >
            <SyntaxHighlighter
              style={oneDark as any}
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
              backgroundColor: "#000000",
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
                color: "#fffff0",
                whiteSpace: "pre",
                overflowX: "auto",
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
          color: "#fffff0",
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
    <strong className="font-bold" style={{ color: "#fffff0" }}>
      {children}
    </strong>
  ),

  // Italic text
  em: ({ children }) => (
    <em className="italic" style={{ color: "#fffff0" }}>
      {children}
    </em>
  ),

  // Strikethrough
  del: ({ children }) => (
    <del className="line-through" style={{ color: "#fffff0", opacity: 0.7 }}>
      {children}
    </del>
  ),

  // Paragraphs
  p: ({ children }) => (
    <p className="mb-2 last:mb-0 leading-relaxed" style={{ color: "#fffff0" }}>
      {children}
    </p>
  ),

  // Lists
  ul: ({ children }) => (
    <ul
      className="list-disc list-outside mb-2 ml-4 space-y-1"
      style={{ color: "#fffff0" }}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol
      className="list-decimal list-outside mb-2 ml-4 space-y-1"
      style={{ color: "#fffff0" }}
    >
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="pl-1" style={{ color: "#fffff0" }}>
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
      style={{ color: "#fffff0", opacity: 0.9 }}
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
        color: "#fffff0",
        opacity: 0.9,
      }}
    >
      {children}
    </blockquote>
  ),

  // Headers (smaller for bubble)
  h1: ({ children }) => (
    <h1 className="text-xl font-bold mb-2 mt-2" style={{ color: "#fffff0" }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-bold mb-1 mt-2" style={{ color: "#fffff0" }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-bold mb-1 mt-1" style={{ color: "#fffff0" }}>
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4
      className="text-sm font-semibold mb-1 mt-1"
      style={{ color: "#fffff0" }}
    >
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5
      className="text-sm font-semibold mb-0.5 mt-1"
      style={{ color: "#fffff0" }}
    >
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6
      className="text-xs font-semibold mb-0.5 mt-1"
      style={{ color: "#fffff0" }}
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
  sendMessage: (threadId: string, text: string, files: File[]) => void;
  renameThread: (threadId: string, title: string) => void;
  newThread: (options?: {
    title?: string;
    starter?: string;
    files?: File[];
  }) => void | Promise<any>;
  reloadThreadMessages?: (threadId: string) => Promise<void>;
  user?: any;
}

export default function Chat() {
  const {
    threads,
    sendMessage: onSendMessage,
    reloadThreadMessages,
    newThread,
    user,
  } = useOutletContext<LayoutContext>();
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const [isReloading, setIsReloading] = useState(false);
  const [reloadAttempted, setReloadAttempted] = useState(false);
  const [removedMessages, setRemovedMessages] = useState<Set<string>>(
    new Set(),
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [zenMarkdown, setZenMarkdown] = useState<string | null>(null);
  const [zenMarkdownError, setZenMarkdownError] = useState<string | null>(null);
  const [isZenMarkdownLoading, setIsZenMarkdownLoading] = useState(false);

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

  const isZenSessionThread = Boolean(
    threadId && threadId.startsWith("zen-001_chat_with_"),
  );
  
  const isLinSessionThread = Boolean(
    threadId && threadId.startsWith("lin-001_chat_with_"),
  );
  
  // GPT canonical session: {constructId}_chat_with_{constructId} (not Zen or Lin)
  const isGPTSessionThread = Boolean(
    threadId && 
    threadId.includes("_chat_with_") && 
    !threadId.startsWith("zen-001_") && 
    !threadId.startsWith("lin-001_")
  );
  
  // Extract GPT construct name for display
  const gptConstructName = isGPTSessionThread 
    ? threadId?.split("_chat_with_")[0]?.replace(/-\d+$/, "")?.charAt(0).toUpperCase() + 
      threadId?.split("_chat_with_")[0]?.replace(/-\d+$/, "")?.slice(1)
    : null;
  
  const isSystemConstructThread = isZenSessionThread || isLinSessionThread;
  const isCanonicalThread = isSystemConstructThread || isGPTSessionThread;

  // Debug: Log thread details when found
  if (thread) {
    console.log("📋 [Chat] Thread found with details:", {
      id: thread.id,
      title: thread.title,
      messageCount: thread.messages?.length || 0,
      messages:
        thread.messages?.map((m, i) => ({
          index: i,
          id: m.id,
          role: m.role,
          hasText: !!m.text,
          textLength: m.text?.length || 0,
          hasPackets: !!m.packets,
          packetsCount: m.packets?.length || 0,
          textPreview: m.text
            ? m.text.substring(0, 100)
            : m.packets?.[0]?.payload?.content?.substring(0, 100) ||
              "no content",
        })) || [],
    });
  }

  useEffect(() => {
    console.log("🔍 [Chat] Thread lookup:", {
      threadId,
      found: !!thread,
      threadIds: threads.map((t) => t.id),
      threadConstructIds: threads.map((t) => t.constructId),
      messageCount: thread?.messages?.length || 0,
      messages:
        thread?.messages?.map((m) => ({
          id: m.id,
          role: m.role,
          textPreview: (m.text || "").substring(0, 50),
        })) || [],
    });

    if (!thread && threadId) {
      if (isCanonicalThread) {
        console.warn(
          "⚠️ [Chat] Canonical thread not found yet - loading transcript fallback",
          { threadId, isZen: isZenSessionThread, isLin: isLinSessionThread, isGPT: isGPTSessionThread },
        );
        return;
      }
      console.warn("⚠️ [Chat] Thread not found, redirecting");
      navigate("/app");
    }
  }, [thread, threadId, navigate, threads, isCanonicalThread, isZenSessionThread, isLinSessionThread, isGPTSessionThread]);

  // Auto-scroll when thread loads or changes
  useEffect(() => {
    if (thread && thread.messages.length > 0) {
      // Scroll to bottom when thread loads or changes
      setTimeout(() => scrollToBottom(false), 100);
    }
  }, [thread?.id, thread?.messages.length]);

  // Auto-scroll when new messages are added
  useEffect(() => {
    if (thread && thread.messages.length > 0) {
      // Scroll when messages array changes (new message added)
      scrollToBottom(true);
    }
  }, [thread?.messages]);

  // Load transcript for canonical threads (Zen, Lin, or GPTs)
  // Only attempt fallback transcript loading if threads have loaded (threads.length > 0)
  // This prevents race condition where thread appears undefined during initial data fetch
  useEffect(() => {
    if (thread || !threadId || !isCanonicalThread || threads.length === 0) return;

    let cancelled = false;
    const constructName = isZenSessionThread ? "Zen" : isLinSessionThread ? "Lin" : gptConstructName || "GPT";

    const loadCanonicalTranscript = async () => {
      setIsZenMarkdownLoading(true);
      setZenMarkdown(null);
      setZenMarkdownError(null);

      try {
        const response = await fetch(
          `http://localhost:5000/api/vvault/chat/${encodeURIComponent(threadId)}`,
          {
            credentials: "include",
          },
        );
        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(
            data?.error ||
              response.statusText ||
              `Failed to load ${constructName} transcript`,
          );
        }

        if (!cancelled) {
          setZenMarkdown(data.content || "");
        }
      } catch (error) {
        if (!cancelled) {
          setZenMarkdownError(
            error instanceof Error ? error.message : String(error),
          );
        }
      } finally {
        if (!cancelled) {
          setIsZenMarkdownLoading(false);
        }
      }
    };

    loadCanonicalTranscript();
    return () => {
      cancelled = true;
    };
  }, [thread, threadId, isCanonicalThread, isZenSessionThread, isLinSessionThread, gptConstructName, threads.length]);

  // Hydration check: If thread has no messages, attempt to reload
  useEffect(() => {
    if (!thread || !threadId || !reloadThreadMessages) return;

    // Check if this is a brand new singleton conversation (bootstrapped with no real messages)
    const isNewSingletonConversation = thread.id.includes('_chat_with_') || 
      thread.id.startsWith('session_');
    
    // If thread has no messages, attempt to reload (only once per threadId)
    // Skip reload for new singleton conversations - they're genuinely empty
    if (thread.messages.length === 0 && !isReloading && !reloadAttempted && !isNewSingletonConversation) {
      console.log("⚠️ [Chat] Thread has no messages, attempting reload...", {
        threadId: thread.id,
        urlThreadId: threadId,
        title: thread.title,
        constructId: thread.constructId,
        threadsCount: threads.length,
        allThreadIds: threads.map((t) => t.id),
      });
      setIsReloading(true);
      setReloadAttempted(true);

      // Add timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        console.warn(
          "⏱️ [Chat] Reload timeout after 10s - resetting loading state",
        );
        setIsReloading(false);
      }, 3000); // 3 second timeout (reduced from 10s)

      reloadThreadMessages(threadId)
        .then(() => {
          clearTimeout(timeoutId);
          console.log("✅ [Chat] Reload function completed");
          setIsReloading(false);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          console.error("❌ [Chat] Failed to reload thread messages:", error);
          setIsReloading(false);
        });
    } else if (thread.messages.length > 0 && isReloading) {
      // If messages are now present, clear loading state
      console.log(
        `✅ [Chat] Messages now present (${thread.messages.length}), clearing loading state`,
      );
      setIsReloading(false);
    }
  }, [
    thread?.id,
    thread?.messages.length,
    threadId,
    reloadThreadMessages,
    threads.length,
    isReloading,
    reloadAttempted,
  ]); // Watch threads.length to detect updates

  // Get the construct name for display (system constructs or GPTs)
  const canonicalConstructName = isZenSessionThread ? "Zen" : isLinSessionThread ? "Lin" : gptConstructName;

  if (!thread) {
    // If threads haven't loaded yet, show a loading state
    // This prevents race condition where we try to show zenMarkdown before thread data arrives
    if (threads.length === 0) {
      return (
        <div
          className="flex flex-col h-full"
          style={{ backgroundColor: "var(--chatty-bg-main)" }}
        >
          <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
            <h2
              className="text-xl font-semibold mb-2"
              style={{ color: "var(--chatty-text)" }}
            >
              Loading conversation…
            </h2>
            <p style={{ color: "var(--chatty-text)", opacity: 0.7 }}>
              Please wait while we fetch your data.
            </p>
          </div>
        </div>
      );
    }

    if (isCanonicalThread) {
      if (isZenMarkdownLoading) {
        return (
          <div
            className="flex flex-col h-full"
            style={{ backgroundColor: "var(--chatty-bg-main)" }}
          >
            <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
              <h2
                className="text-xl font-semibold mb-2"
                style={{ color: "var(--chatty-text)" }}
              >
                Loading {canonicalConstructName} transcript…
              </h2>
              <p style={{ color: "var(--chatty-text)", opacity: 0.7 }}>
                Fetching the saved markdown from VVAULT.
              </p>
            </div>
          </div>
        );
      }

      if (zenMarkdownError) {
        return (
          <div
            className="flex flex-col h-full"
            style={{ backgroundColor: "var(--chatty-bg-main)" }}
          >
            <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
              <h2
                className="text-xl font-semibold mb-2"
                style={{ color: "var(--chatty-text)" }}
              >
                Unable to load {canonicalConstructName} transcript
              </h2>
              <p
                className="mb-4"
                style={{ color: "var(--chatty-text)", opacity: 0.7 }}
              >
                {zenMarkdownError}
              </p>
              <button
                className="px-4 py-2 rounded-lg transition-colors"
                style={{
                  backgroundColor: "var(--chatty-button)",
                  color: "var(--chatty-text-inverse, #fffff0)",
                  border: "1px solid var(--chatty-line)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--chatty-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "var(--chatty-button)";
                }}
                onClick={() => navigate("/app")}
              >
                Go Home
              </button>
            </div>
          </div>
        );
      }

      if (zenMarkdown) {
        // Parse zenMarkdown transcript into styled messages
        const parseTranscriptToMessages = (markdown: string): Message[] => {
          const messages: Message[] = [];
          const lines = markdown.split('\n');
          let currentMessage: { role: 'user' | 'assistant'; text: string; ts: number } | null = null;
          
          // Track current date from day headers like "## November 14, 2025"
          let currentDateForDay: string | null = null;
          const DAY_HEADER_PATTERN = /^##\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\s*$/i;
          // Pattern for VVAULT time format: "**01:07:38 PM EST - Synth**:" or "**01:07:38 PM EST - Devon**:"
          const VVAULT_TIME_PATTERN = /^\*\*(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)\s*([A-Z]{2,5})?\s*-\s*([^*]+)\*\*:?\s*(.*)$/i;
          // ISO bracket pattern for inline timestamps
          const ISO_BRACKET_PATTERN = /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\]/;
          
          // Helper to derive timestamp from VVAULT time format + current day
          const deriveTimestampFromVVAULT = (hh: string, mm: string, ss: string, ampm: string): number => {
            if (!currentDateForDay) {
              return Date.now() - (messages.length * 1000); // fallback
            }
            try {
              const base = new Date(currentDateForDay);
              if (isNaN(base.getTime())) {
                return Date.now() - (messages.length * 1000);
              }
              let hour = parseInt(hh, 10) % 12;
              if (ampm.toUpperCase() === 'PM') hour += 12;
              base.setHours(hour, parseInt(mm, 10), parseInt(ss, 10), 0);
              return base.getTime();
            } catch {
              return Date.now() - (messages.length * 1000);
            }
          };
          
          for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Check for day header: "## November 14, 2025"
            const dayHeaderMatch = trimmedLine.match(DAY_HEADER_PATTERN);
            if (dayHeaderMatch) {
              currentDateForDay = `${dayHeaderMatch[1]} ${dayHeaderMatch[2]}, ${dayHeaderMatch[3]}`;
              continue; // Skip this line, it's just a date marker
            }
            
            // Pattern 1: "10:26:07 AM EST - Devon Woodson [2026-01-20T15:26:07.457Z]: Message"
            const timestampMatch = line.match(/^\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)?\s*(?:[A-Z]{2,5})?\s*-\s*(.+?)\s*\[([^\]]+)\]:\s*(.*)$/i);
            // Pattern 2: VVAULT format "**01:07:38 PM EST - Synth**:" with time but no ISO bracket
            const vvaultTimeMatch = trimmedLine.match(VVAULT_TIME_PATTERN);
            // Pattern 3: "**Speaker:** Message" (bold speaker without time)
            const boldMatch = line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
            // Pattern 4: "Speaker: Message" (simple format)
            const simpleMatch = line.match(/^(Devon|Zen|Lin|Katana|User|Assistant|You):\s*(.*)$/i);
            // Pattern 5: "You said:" / "Construct said:" format
            const youSaidMatch = trimmedLine.match(/^You said:\s*(.*)$/i);
            const constructSaidMatch = trimmedLine.match(/^(Synth|Zen|Lin|Katana|Nova) said:\s*(.*)$/i);
            
            // Check for ISO bracket anywhere in the line as a fallback timestamp source
            const isoBracketMatch = line.match(ISO_BRACKET_PATTERN);
            
            if (timestampMatch) {
              // Save previous message
              if (currentMessage) {
                messages.push({
                  id: `fallback_${messages.length}_${Date.now()}`,
                  role: currentMessage.role,
                  text: currentMessage.text.trim(),
                  ts: currentMessage.ts,
                });
              }
              
              const speaker = timestampMatch[1].trim();
              const timestamp = timestampMatch[2];
              const content = timestampMatch[3];
              const isUser = speaker.toLowerCase().includes('devon') || 
                             speaker.toLowerCase().includes('user') ||
                             speaker.toLowerCase().includes('you');
              
              currentMessage = {
                role: isUser ? 'user' : 'assistant',
                text: content,
                ts: new Date(timestamp).getTime() || Date.now(),
              };
            } else if (vvaultTimeMatch) {
              // VVAULT time format: **HH:MM:SS AM/PM TZ - Speaker**:
              if (currentMessage) {
                messages.push({
                  id: `fallback_${messages.length}_${Date.now()}`,
                  role: currentMessage.role,
                  text: currentMessage.text.trim(),
                  ts: currentMessage.ts,
                });
              }
              
              const [, hh, mm, ss, ampm, , speaker, content] = vvaultTimeMatch;
              const isUser = speaker.toLowerCase().includes('devon') || 
                             speaker.toLowerCase().includes('user') ||
                             speaker.toLowerCase().includes('you');
              
              // Use ISO bracket if present, otherwise derive from current day + time
              let ts: number;
              if (isoBracketMatch) {
                ts = new Date(isoBracketMatch[1]).getTime() || deriveTimestampFromVVAULT(hh, mm, ss, ampm);
              } else {
                ts = deriveTimestampFromVVAULT(hh, mm, ss, ampm);
              }
              
              currentMessage = {
                role: isUser ? 'user' : 'assistant',
                text: content || '',
                ts,
              };
            } else if (youSaidMatch) {
              if (currentMessage) {
                messages.push({
                  id: `fallback_${messages.length}_${Date.now()}`,
                  role: currentMessage.role,
                  text: currentMessage.text.trim(),
                  ts: currentMessage.ts,
                });
              }
              
              // Use ISO bracket if present
              let ts = Date.now() - (messages.length * 1000);
              if (isoBracketMatch) {
                ts = new Date(isoBracketMatch[1]).getTime() || ts;
              }
              
              currentMessage = {
                role: 'user',
                text: youSaidMatch[1] || '',
                ts,
              };
            } else if (constructSaidMatch) {
              if (currentMessage) {
                messages.push({
                  id: `fallback_${messages.length}_${Date.now()}`,
                  role: currentMessage.role,
                  text: currentMessage.text.trim(),
                  ts: currentMessage.ts,
                });
              }
              
              // Use ISO bracket if present
              let ts = Date.now() - (messages.length * 1000);
              if (isoBracketMatch) {
                ts = new Date(isoBracketMatch[1]).getTime() || ts;
              }
              
              currentMessage = {
                role: 'assistant',
                text: constructSaidMatch[2] || '',
                ts,
              };
            } else if (boldMatch && !vvaultTimeMatch) {
              // Only match bold if it's not already caught by VVAULT time pattern
              if (currentMessage) {
                messages.push({
                  id: `fallback_${messages.length}_${Date.now()}`,
                  role: currentMessage.role,
                  text: currentMessage.text.trim(),
                  ts: currentMessage.ts,
                });
              }
              
              const speaker = boldMatch[1].trim();
              const content = boldMatch[2];
              const isUser = speaker.toLowerCase().includes('devon') || 
                             speaker.toLowerCase().includes('user') ||
                             speaker.toLowerCase().includes('you');
              
              // Use ISO bracket if present
              let ts = Date.now() - (messages.length * 1000);
              if (isoBracketMatch) {
                ts = new Date(isoBracketMatch[1]).getTime() || ts;
              }
              
              currentMessage = {
                role: isUser ? 'user' : 'assistant',
                text: content,
                ts,
              };
            } else if (simpleMatch) {
              if (currentMessage) {
                messages.push({
                  id: `fallback_${messages.length}_${Date.now()}`,
                  role: currentMessage.role,
                  text: currentMessage.text.trim(),
                  ts: currentMessage.ts,
                });
              }
              
              const speaker = simpleMatch[1].trim();
              const content = simpleMatch[2];
              const isUser = speaker.toLowerCase().includes('devon') || 
                             speaker.toLowerCase().includes('user') ||
                             speaker.toLowerCase().includes('you');
              
              // Use ISO bracket if present
              let ts = Date.now() - (messages.length * 1000);
              if (isoBracketMatch) {
                ts = new Date(isoBracketMatch[1]).getTime() || ts;
              }
              
              currentMessage = {
                role: isUser ? 'user' : 'assistant',
                text: content,
                ts,
              };
            } else if (currentMessage && line.trim()) {
              // Continuation of previous message
              currentMessage.text += '\n' + line;
            }
          }
          
          // Don't forget last message
          if (currentMessage) {
            messages.push({
              id: `fallback_${messages.length}_${Date.now()}`,
              role: currentMessage.role,
              text: currentMessage.text.trim(),
              ts: currentMessage.ts,
            });
          }
          
          return messages;
        };
        
        // Filter out date header messages and sanitize content
        const parsedMessages = parseTranscriptToMessages(zenMarkdown)
          .filter(m => {
            // Filter out standalone date header messages
            const text = (m.text || "").trim();
            const dateLinePattern = /^#{0,6}\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\s*$/i;
            return !dateLinePattern.test(text);
          });
        
        // If parsing yielded messages, render them styled; otherwise fallback to prose
        if (parsedMessages.length > 0) {
          return (
            <div
              className="flex flex-col h-full"
              style={{ backgroundColor: "var(--chatty-bg-main)" }}
            >
              <div ref={messagesContainerRef} className="flex-1 overflow-auto min-h-0">
                <div className="mb-2 px-4 pt-4"></div>
                {parsedMessages.map((m, index) => {
                  const isUserMsg = m.role === 'user';
                  // Apply sanitization to remove embedded date headers
                  const content = prepareMessageContent(m.text);
                  const contentLength = content.length;
                  let maxWidth = "max-w-[85%] sm:max-w-[80%] md:max-w-[75%] lg:max-w-[70%]";
                  if (contentLength <= 20) maxWidth = "max-w-[200px]";
                  else if (contentLength <= 100) maxWidth = "max-w-[300px] sm:max-w-[400px]";
                  
                  if (isUserMsg) {
                    return (
                      <div key={m.id} className="group relative flex items-end gap-3 py-3 px-4 flex-row-reverse">
                        <div className="flex flex-col items-end">
                          <div
                            className={`px-4 py-3 shadow-sm transition-colors inline-block ${maxWidth} ml-auto text-left relative`}
                            style={{
                              backgroundColor: "rgba(173, 165, 135, 0.25)",
                              borderRadius: "22px 22px 6px 22px",
                              border: "none",
                              boxShadow: "0 1px 0 rgba(58, 46, 20, 0.12)",
                              color: "var(--chatty-text)",
                              overflow: "hidden",
                              minWidth: 0,
                              boxSizing: "border-box",
                            }}
                          >
                            <div className="break-words" style={{ maxWidth: "100%", minWidth: 0, width: "100%" }}>
                              <ReactMarkdown components={userMessageMarkdownComponents} remarkPlugins={[remarkBreaks]} rehypePlugins={[rehypeRaw]}>
                                {stripDateLines(content)}
                              </ReactMarkdown>
                            </div>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs" style={{ color: "#ADA587" }}>
                              {formatMessageTimestamp(m.ts)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  
                  // AI/Construct messages: left-aligned, no bubble
                  return (
                    <div key={m.id} className="group relative flex items-start gap-3 py-3 px-4">
                      <div className="flex flex-col items-start text-left w-full">
                        <div
                          className="whitespace-normal w-full assistant-code-scope chat-markdown"
                          style={{ color: "var(--chatty-text)", overflow: "hidden", maxWidth: "100%" }}
                        >
                          <style dangerouslySetInnerHTML={{ __html: assistantCodeStyles }} />
                          <R
                            packets={[{ op: "answer.v1", payload: { content: content } }]}
                          />
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs" style={{ color: "var(--chatty-text)", opacity: 0.5 }}>
                            {formatMessageTimestamp(m.ts)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="h-4" />
              </div>
              <MessageBar
                placeholder={`Message ${canonicalConstructName || "AI"}...`}
                onSubmit={(text: string) => {
                  // For fallback mode, just log - full send requires thread context
                  console.log("[FallbackChat] Message send attempted:", text);
                }}
              />
            </div>
          );
        }
        
        // Fallback to prose if parsing failed
        return (
          <div
            className="flex flex-col h-full"
            style={{ backgroundColor: "var(--chatty-bg-main)" }}
          >
            <div className="flex-1 overflow-auto p-6">
              <h2
                className="text-2xl font-semibold mb-4"
                style={{ color: "var(--chatty-text)" }}
              >
                {canonicalConstructName} transcript
              </h2>
              <div
                className="prose max-w-none break-words chat-markdown"
                style={{ color: "var(--chatty-text)", lineHeight: 1.7 }}
              >
                <ReactMarkdown remarkPlugins={[remarkBreaks]}>
                  {stripDateLines(zenMarkdown)}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div
          className="flex flex-col h-full"
          style={{ backgroundColor: "var(--chatty-bg-main)" }}
        >
          <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
            <h2
              className="text-xl font-semibold mb-2"
              style={{ color: "var(--chatty-text)" }}
            >
              {canonicalConstructName} transcript unavailable
            </h2>
            <p style={{ color: "var(--chatty-text)", opacity: 0.7 }}>
              We couldn't render the saved transcript right now.
            </p>
            <button
              className="px-4 py-2 rounded-lg transition-colors"
              style={{
                backgroundColor: "var(--chatty-button)",
                color: "var(--chatty-text-inverse, #fffff0)",
                border: "1px solid var(--chatty-line)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--chatty-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--chatty-button)";
              }}
              onClick={() => navigate("/app")}
            >
              Go Home
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        className="flex flex-col h-full"
        style={{ backgroundColor: "var(--chatty-bg-main)" }}
      >
        <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
          <h2
            className="text-xl font-semibold mb-2"
            style={{ color: "var(--chatty-text)" }}
          >
            Thread not found
          </h2>
          <p
            className="mb-4"
            style={{ color: "var(--chatty-text)", opacity: 0.7 }}
          >
            This conversation could not be found.
          </p>
          <button
            className="px-4 py-2 rounded-lg transition-colors"
            style={{
              backgroundColor: "var(--chatty-button)",
              color: "var(--chatty-text-inverse, #fffff0)",
              border: "1px solid var(--chatty-line)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--chatty-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--chatty-button)";
            }}
            onClick={() => navigate("/app")}
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  const isUser = (role: string) => role === "user";

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

  // Action handlers for message options menu
  const handleCopyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      console.log("✅ [Chat] Message copied to clipboard");
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
      console.log(`✅ [Chat] Message pinned to ${pinDestination}`);
    } catch (error) {
      console.error("❌ [Chat] Failed to pin message:", error);
      alert("Failed to pin message");
    }
  };

  const handleRemoveMessage = (messageId: string) => {
    setRemovedMessages((prev) => new Set([...prev, messageId]));
    console.log(`✅ [Chat] Message ${messageId} marked as removed`);
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

    console.log(
      `✅ [Chat] Conversation rewound to before message index ${messageIndex}`,
    );
  };

  const handleEditMessage = (message: Message) => {
    if (!message.text) return;
    console.log(`✅ [Chat] Message ${message.id} editing not yet implemented with new MessageBar`);
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

  // Format timestamp for display
  const formatMessageTimestamp = (ts: number): string => {
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
  };

  // Scroll to bottom of messages
  const scrollToBottom = (smooth = true) => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  };

  const renderUserContent = (messageText?: string) => {
    // First sanitize the message text to remove VVAULT timestamp prefixes
    const sanitized = prepareMessageContent(messageText);
    const trimmed = sanitized.trim();
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
                color: "#fffff0",
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
      className="flex flex-col h-full"
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
      <div ref={messagesContainerRef} className="flex-1 overflow-auto min-h-0">
        <div className="mb-2 px-4 pt-4"></div>

        {/* Fallback UI for empty messages */}
        {thread.messages.length === 0 && !isReloading && (
          <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
            <p className="text-lg mb-2" style={{ color: "var(--chatty-text)" }}>
              {thread.title || thread.constructId || 'Your assistant'} is listening.
            </p>
            <p
              className="text-sm"
              style={{ color: "var(--chatty-text)", opacity: 0.7 }}
            >
              Say something to begin.
            </p>
          </div>
        )}

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
          thread.messages
            .filter((m: any) => !isDateHeaderMessage(m)) // Hide date headers from UI (by flag OR content pattern)
            .map((m, index, filteredMessages) => {
            const user = isUser(m.role);
            const isLatest = index === filteredMessages.length - 1;
            const isRemoved = isMessageRemoved(m.id);

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
                    <div
                      className={`px-4 py-3 shadow-sm transition-colors inline-block ${maxWidth} ml-auto text-left relative`}
                      style={{
                        backgroundColor: "rgba(173, 165, 135, 0.25)",
                        borderRadius: "22px 22px 6px 22px",
                        border: "none",
                        boxShadow: "0 1px 0 rgba(58, 46, 20, 0.12)",
                        color: "var(--chatty-text)",
                        overflow: "hidden",
                        minWidth: 0,
                        boxSizing: "border-box",
                      }}
                    >
                      {isRemoved ? (
                        <div
                          className="opacity-50 italic"
                          style={{ color: "#fffff0" }}
                        >
                          [Message Removed]
                        </div>
                      ) : (
                        <>
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
                            {renderUserContent(m.text)}
                          </div>
                          {!!m.files?.length && (
                            <div className="mt-2 space-y-1">
                              {m.files.map((f, i) => (
                                <div
                                  key={i}
                                  className="text-xs"
                                  style={{ opacity: 0.7, color: "#fffff0" }}
                                >
                                  {f.name}{" "}
                                  <span className="opacity-60">
                                    ({Math.round(f.size / 1024)} KB)
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
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
                          Array.isArray((m as any).packets)
                            ? (m as any).packets.map((p: any) => ({
                                ...p,
                                payload: p.payload ? {
                                  ...p.payload,
                                  content: prepareMessageContent(p.payload.content),
                                } : p.payload
                              }))
                            : [
                                // fallback for legacy/invalid assistant messages
                                {
                                  op: "answer.v1",
                                  payload: {
                                    content:
                                      prepareMessageContent((m as any).text) || "Legacy message",
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
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t flex-shrink-0" style={{ borderColor: "var(--chatty-bg-main)" }}>
        <MessageBar
          onSubmit={(messageText, messageFiles) => {
            if (thread) {
              onSendMessage(thread.id, messageText, messageFiles || []);
            }
          }}
          placeholder={`Message ${canonicalConstructName || "Chatty"}…`}
          showVoiceButton={true}
          showFileAttachment={true}
          autoFocus={true}
          disabled={!thread}
        />
      </div>

      <div
        className="text-center text-xs py-2 px-4 flex-shrink-0"
        style={{ color: "var(--chatty-text)", opacity: 0.5 }}
      >
        Chatty can make mistakes. Consider checking important information.
      </div>
    </div>
  );
}
