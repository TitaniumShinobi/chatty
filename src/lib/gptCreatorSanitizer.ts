export type CreateTabRole = "user" | "assistant";

export interface CreateTabMessageLike {
  role?: string | null;
  content?: string | null;
  timestamp?: number | string | null;
  responseTimeMs?: number;
}

export interface CreateTabMessage {
  role: CreateTabRole;
  content: string;
  timestamp?: number;
  responseTimeMs?: number;
}

const LIN_IDENTITY_DUMP_STRONG_SIGNALS = [
  "dual mode:",
  "memory continuity:",
  "lin is a tether, not a name",
  "continuity guardian and undertone stabilizer",
  "the chatty-side agent that works directly with vvault/supabase",
  "=== lin's core identity",
  "=== construct creation protocol",
  "mandatory output format for gpt details",
  "you are lin (construct id: lin-001)",
  "you are lin (lin-001)",
  "smart response behavior:",
  "automatic configuration extraction:",
];

const LIN_IDENTITY_DUMP_SECONDARY_SIGNALS = [
  "platform awareness",
  "behavioral rules",
  "identity enforcement",
  "instruction boundary",
  "tool transparency",
  "capability enforcement",
  "gpt capsule (read-only reference):",
  "gpt blueprint (read-only reference):",
  "gpt conversation history (read-only reference):",
  "current gpt configuration:",
  "response format (critical)",
];

export function isPromptDumpLikeAssistantContent(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;

  const strongHits = LIN_IDENTITY_DUMP_STRONG_SIGNALS.filter((signal) =>
    normalized.includes(signal),
  ).length;
  const secondaryHits = LIN_IDENTITY_DUMP_SECONDARY_SIGNALS.filter((signal) =>
    normalized.includes(signal),
  ).length;

  const hasHeadingBlocks = /(^|\n)\s*(===|##)\s+[a-z0-9]/i.test(normalized);
  const bulletCount = (normalized.match(/\n\s*[-*]\s+/g) || []).length;
  const numberedCount = (normalized.match(/\n\s*\d+\.\s+/g) || []).length;
  const hasStructuredList = bulletCount >= 4 || numberedCount >= 3;

  if (strongHits >= 2) return true;
  if (strongHits >= 1 && secondaryHits >= 2) return true;
  if (strongHits >= 1 && hasHeadingBlocks && hasStructuredList) return true;
  if (secondaryHits >= 3 && hasHeadingBlocks && hasStructuredList) return true;

  return false;
}

function normalizeTimestamp(
  timestamp: number | string | null | undefined,
): number | undefined {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    return timestamp;
  }
  if (typeof timestamp === "string" && timestamp.trim().length > 0) {
    const numeric = Number(timestamp);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(timestamp);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function sanitizeCreateTabHistory(
  messages: CreateTabMessageLike[],
  maxMessages = 12,
): CreateTabMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];

  const sanitized: CreateTabMessage[] = [];

  for (const message of messages) {
    const role =
      message?.role === "user" || message?.role === "assistant"
        ? message.role
        : null;
    if (!role) continue;

    const content = typeof message?.content === "string" ? message.content.trim() : "";
    if (!content) continue;

    if (role === "assistant" && isPromptDumpLikeAssistantContent(content)) {
      continue;
    }

    sanitized.push({
      role,
      content,
      timestamp: normalizeTimestamp(message?.timestamp),
      responseTimeMs:
        typeof message?.responseTimeMs === "number"
          ? message.responseTimeMs
          : undefined,
    });
  }

  if (sanitized.length <= maxMessages) return sanitized;
  return sanitized.slice(-maxMessages);
}

interface InitialAutoSendCheck {
  isVisible: boolean;
  initialCreateMessage?: string | null;
  initialConfig?: unknown;
  activeTab: "create" | "configure" | "forge";
  isCreateGenerating: boolean;
  createMessagesLength: number;
  lastSentMessage?: string | null;
}

export function shouldAutoSendInitialCreateMessage({
  isVisible,
  initialCreateMessage,
  initialConfig,
  activeTab,
  isCreateGenerating,
  createMessagesLength,
  lastSentMessage,
}: InitialAutoSendCheck): boolean {
  if (!isVisible) return false;
  if (typeof initialCreateMessage !== "string") return false;
  if (initialCreateMessage.trim().length === 0) return false;
  if (initialConfig) return false;
  if (activeTab !== "create") return false;
  if (isCreateGenerating) return false;
  if (createMessagesLength !== 0) return false;
  if (lastSentMessage === initialCreateMessage) return false;
  return true;
}
