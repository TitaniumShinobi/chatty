import type { AddressBookHydrationMode } from "./addressBookAuthority";

export type VvaultConversationHydrationSource =
  | "full"
  | "snapshot-replay"
  | "index"
  | "local-fallback"
  | "index-fallback"
  | "empty-fallback";

export interface VvaultConversationCollectionResponse<TConversation> {
  conversations: TConversation[];
  hydrationSource: VvaultConversationHydrationSource;
  hydrationComplete: boolean;
  generativeEligible?: boolean;
  continuityEligible?: boolean;
}

export interface VvaultConversationLookupRecord {
  sessionId?: string | null;
  id?: string | null;
  constructId?: string | null;
  title?: string | null;
}

export type ActiveConversationHydrationStatus =
  | "idle"
  | "loading"
  | "ready"
  | "partial"
  | "missing"
  | "error";

export interface ActiveConversationHydrationState {
  status: ActiveConversationHydrationStatus;
  threadId: string | null;
  hydrationSource: VvaultConversationHydrationSource | null;
  hydrationComplete: boolean;
  message?: string;
}

export interface ActiveConversationReloadTarget {
  messages?: Array<unknown> | null;
  isIndexHydrated?: boolean;
}

export interface ActiveRouteMessageLike {
  ts?: number | string | null;
  timestamp?: string | null;
  text?: string | null;
  content?: string | null;
  role?: string | null;
  isDateHeader?: boolean;
}

export interface ActiveRouteThreadLike {
  id?: string | null;
  messages?: Array<ActiveRouteMessageLike | null | undefined> | null;
  updatedAt?: number | null;
  createdAt?: number | null;
  isIndexHydrated?: boolean;
}

export interface RuntimeTurnStateLike {
  version?: number | null;
  sessionId?: string | null;
  constructId?: string | null;
  constructRevision?: string | null;
  continuitySeq?: number | null;
  assistantTurnId?: string | null;
  tailHash?: string | null;
  hydrationTruth?: string | null;
}

export interface RuntimeResumeAnchor {
  v: 1;
  sourceSeat: "chatty" | "codex";
  constructId: string;
  constructRevision: string;
  threadId: string;
  continuitySeq: number;
  assistantTurnId: string;
  tailHash: string;
  hydrationTruth: "full";
  issuedAt: string;
}

const ACTIVE_THREAD_TAIL_SAMPLE_SIZE = 10;
const MATERIAL_CHRONOLOGY_REGRESSION_MS = 12 * 60 * 60 * 1000;
const CANONICAL_ZEN_THREAD_ID = "zen-001_chat_with_zen-001";

function isCanonicalZenThreadId(threadId: string | null | undefined): boolean {
  return threadId === CANONICAL_ZEN_THREAD_ID;
}

function isHydrationSource(
  value: unknown,
): value is VvaultConversationHydrationSource {
  return (
    value === "full" ||
    value === "snapshot-replay" ||
    value === "index" ||
    value === "local-fallback" ||
    value === "index-fallback" ||
    value === "empty-fallback"
  );
}

function normalizeResumeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeResumeSeat(value: unknown): "chatty" | "codex" | null {
  return value === "codex" ? "codex" : value === "chatty" ? "chatty" : null;
}

function parseResumeJsonString(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function decodeBase64UrlJson(value: string): Record<string, unknown> | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const atobImpl =
      typeof globalThis !== "undefined" &&
      typeof (globalThis as { atob?: unknown }).atob === "function"
        ? ((globalThis as { atob: (input: string) => string }).atob)
        : typeof window !== "undefined" && typeof window.atob === "function"
          ? window.atob.bind(window)
          : null;
    const decoded = atobImpl ? atobImpl(padded) : "";
    return decoded ? parseResumeJsonString(decoded) : null;
  } catch {
    return null;
  }
}

export function normalizeRuntimeResumeAnchor(
  payload: Record<string, unknown> | null | undefined,
): RuntimeResumeAnchor | null {
  if (!payload || typeof payload !== "object") return null;
  const threadId = normalizeResumeString(payload.threadId);
  const constructId = normalizeResumeString(payload.constructId);
  const constructRevision = normalizeResumeString(payload.constructRevision);
  const assistantTurnId = normalizeResumeString(payload.assistantTurnId);
  const tailHash = normalizeResumeString(payload.tailHash)?.toLowerCase() || null;
  const continuitySeq =
    typeof payload.continuitySeq === "number" && Number.isFinite(payload.continuitySeq)
      ? Math.floor(payload.continuitySeq)
      : typeof payload.continuitySeq === "string" && payload.continuitySeq.trim()
        ? Math.floor(Number(payload.continuitySeq))
        : NaN;

  if (
    !threadId ||
    !constructId ||
    !constructRevision ||
    !assistantTurnId ||
    !tailHash ||
    !Number.isFinite(continuitySeq) ||
    continuitySeq < 0
  ) {
    return null;
  }

  return {
    v: 1,
    sourceSeat: normalizeResumeSeat(payload.sourceSeat) || "chatty",
    constructId,
    constructRevision,
    threadId,
    continuitySeq,
    assistantTurnId,
    tailHash,
    hydrationTruth: "full",
    issuedAt:
      normalizeResumeString(payload.issuedAt) || new Date().toISOString(),
  };
}

export function decodeRuntimeResumeAnchorParam(
  encoded: string | null | undefined,
): RuntimeResumeAnchor | null {
  const trimmed = typeof encoded === "string" ? encoded.trim() : "";
  if (!trimmed) return null;

  const direct = parseResumeJsonString(trimmed);
  if (direct) return normalizeRuntimeResumeAnchor(direct);

  const uriDecoded =
    trimmed.includes("%") || trimmed.includes("{")
      ? (() => {
          try {
            return decodeURIComponent(trimmed);
          } catch {
            return trimmed;
          }
        })()
      : trimmed;
  const fromUriJson = parseResumeJsonString(uriDecoded);
  if (fromUriJson) return normalizeRuntimeResumeAnchor(fromUriJson);

  const decoded = decodeBase64UrlJson(trimmed);
  return normalizeRuntimeResumeAnchor(decoded);
}

export function buildRuntimeResumeAnchorFromTurnState({
  threadId,
  runtimeTurnState,
  sourceSeat = "chatty",
}: {
  threadId: string | null | undefined;
  runtimeTurnState?: RuntimeTurnStateLike | null;
  sourceSeat?: "chatty" | "codex";
}): RuntimeResumeAnchor | null {
  const normalizedThreadId = normalizeResumeString(threadId);
  const normalizedConstructId = normalizeResumeString(runtimeTurnState?.constructId);
  const normalizedConstructRevision = normalizeResumeString(
    runtimeTurnState?.constructRevision,
  );
  const normalizedAssistantTurnId = normalizeResumeString(
    runtimeTurnState?.assistantTurnId,
  );
  const normalizedTailHash =
    normalizeResumeString(runtimeTurnState?.tailHash)?.toLowerCase() || null;
  const continuitySeq =
    typeof runtimeTurnState?.continuitySeq === "number" &&
    Number.isFinite(runtimeTurnState.continuitySeq)
      ? Math.floor(runtimeTurnState.continuitySeq)
      : null;
  const hydrationTruth =
    normalizeResumeString(runtimeTurnState?.hydrationTruth) || "full";

  if (
    !normalizedThreadId ||
    hydrationTruth !== "full" ||
    !normalizedConstructId ||
    !normalizedConstructRevision ||
    !normalizedAssistantTurnId ||
    !normalizedTailHash ||
    continuitySeq == null
  ) {
    return null;
  }

  return {
    v: 1,
    sourceSeat,
    constructId: normalizedConstructId,
    constructRevision: normalizedConstructRevision,
    threadId: normalizedThreadId,
    continuitySeq,
    assistantTurnId: normalizedAssistantTurnId,
    tailHash: normalizedTailHash,
    hydrationTruth: "full",
    issuedAt: new Date().toISOString(),
  };
}

export function deriveRuntimeResumeAnchorFromTranscript({
  threadId,
  hydrationSource,
  hydrationComplete,
  transcriptMessages,
  sourceSeat = "chatty",
}: {
  threadId: string | null | undefined;
  hydrationSource?: VvaultConversationHydrationSource | null;
  hydrationComplete?: boolean;
  transcriptMessages?: Array<{
    role?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null | undefined> | null;
  sourceSeat?: "chatty" | "codex";
}): RuntimeResumeAnchor | null {
  if (hydrationSource !== "full" || hydrationComplete !== true) {
    return null;
  }
  const turns = Array.isArray(transcriptMessages) ? transcriptMessages : [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn || turn.role !== "assistant") continue;
    const runtimeTurnState =
      turn.metadata && typeof turn.metadata === "object"
        ? (turn.metadata.runtimeTurnState as RuntimeTurnStateLike | undefined)
        : null;
    const anchor = buildRuntimeResumeAnchorFromTurnState({
      threadId,
      runtimeTurnState,
      sourceSeat,
    });
    if (anchor) return anchor;
  }
  return null;
}

function addConstructCandidates(
  candidates: Set<string>,
  threadId: string | null | undefined,
) {
  if (!threadId) return;

  const normalizedThreadId = threadId.toLowerCase();
  if (threadId.includes("_chat_with_")) {
    candidates.add(threadId.split("_chat_with_")[0].toLowerCase());
  }

  const constructIdMatch = threadId.match(/([a-z]+-\d+)/i);
  if (constructIdMatch?.[1]) {
    candidates.add(constructIdMatch[1].toLowerCase());
  }

  if (normalizedThreadId.includes("zen")) {
    candidates.add("zen");
    candidates.add("zen-001");
  }
  if (normalizedThreadId.includes("lin")) {
    candidates.add("lin");
    candidates.add("lin-001");
  }
  if (normalizedThreadId.includes("val")) {
    candidates.add("val");
    candidates.add("val-001");
  }
}

export function normalizeConversationHydrationResponse<TConversation>(
  payload: Partial<VvaultConversationCollectionResponse<TConversation>> | null | undefined,
  fallbackSource: VvaultConversationHydrationSource = "full",
): VvaultConversationCollectionResponse<TConversation> {
  const explicitHydrationSource = payload?.hydrationSource;
  const hydrationSource: VvaultConversationHydrationSource = isHydrationSource(
    explicitHydrationSource,
  )
    ? explicitHydrationSource
    : fallbackSource === "index"
      ? "index"
      : "empty-fallback";

  return {
    conversations: Array.isArray(payload?.conversations)
      ? payload.conversations
      : [],
    hydrationSource,
    hydrationComplete:
      typeof payload?.hydrationComplete === "boolean"
        ? payload.hydrationComplete === true && hydrationSource === "full"
        : false,
  };
}

export function hasCanonicalFullConversationHydration<TConversation>(
  response:
    | VvaultConversationCollectionResponse<TConversation>
    | null
    | undefined,
): boolean {
  return Boolean(
    response &&
      response.hydrationSource === "full" &&
      response.hydrationComplete === true,
  );
}

export function getAddressBookHydrationModeFromResponse<TConversation>(
  response: VvaultConversationCollectionResponse<TConversation>,
): AddressBookHydrationMode {
  if (hasCanonicalFullConversationHydration(response)) {
    return "full";
  }

  if (
    (response.hydrationSource === "index" ||
      response.hydrationSource === "index-fallback") &&
    response.conversations.length > 0
  ) {
    return "index";
  }

  return "none";
}

export function shouldPreserveSnapshotAddressBookFromResponse<TConversation>(
  response: VvaultConversationCollectionResponse<TConversation>,
  {
    loadedConversationCount,
    cachedThreadCount,
    visibleContactCount = cachedThreadCount,
    }: {
    loadedConversationCount: number;
    cachedThreadCount: number;
    visibleContactCount?: number;
  },
): boolean {
  const lastKnownVisibleCount = Math.max(cachedThreadCount, visibleContactCount);

  return (
    response.hydrationComplete === false &&
    response.hydrationSource !== "index" &&
    lastKnownVisibleCount > 0 &&
    loadedConversationCount < lastKnownVisibleCount
  );
}

export function shouldShowAddressBookLoadErrorFromResponse<TConversation>(
  response: VvaultConversationCollectionResponse<TConversation>,
  {
    loadedConversationCount,
    cachedThreadCount,
    visibleContactCount = cachedThreadCount,
  }: {
    loadedConversationCount: number;
    cachedThreadCount: number;
    visibleContactCount?: number;
  },
): boolean {
  return (
    response.hydrationComplete === false &&
    response.hydrationSource !== "index" &&
    loadedConversationCount === 0 &&
    cachedThreadCount === 0 &&
    visibleContactCount === 0
  );
}

export function canBootstrapCanonicalThreadFromResponse<TConversation>(
  response:
    | VvaultConversationCollectionResponse<TConversation>
    | null
    | undefined,
): boolean {
  return hasCanonicalFullConversationHydration(response);
}

export function findConversationForThreadId<
  TConversation extends VvaultConversationLookupRecord,
>(
  conversations: TConversation[],
  threadId: string | null | undefined,
): TConversation | null {
  if (!Array.isArray(conversations) || !threadId) {
    return null;
  }

  const bySessionId =
    conversations.find(
      (conversation) =>
        conversation?.sessionId === threadId || conversation?.id === threadId,
    ) || null;
  if (bySessionId) {
    return bySessionId;
  }

  const constructCandidates = new Set<string>();
  addConstructCandidates(constructCandidates, threadId);

  if (constructCandidates.size === 0) {
    return null;
  }

  const byConstructId =
    conversations.find((conversation) => {
      const constructId = conversation?.constructId?.toLowerCase();
      return constructId ? constructCandidates.has(constructId) : false;
    }) || null;
  if (byConstructId) {
    return byConstructId;
  }

  if (constructCandidates.has("zen") || constructCandidates.has("zen-001")) {
    return (
      conversations.find((conversation) =>
        String(conversation?.title || "")
          .toLowerCase()
          .includes("zen"),
      ) || null
    );
  }

  return null;
}

export function findConversationByExactThreadId<
  TConversation extends VvaultConversationLookupRecord,
>(
  conversations: TConversation[],
  threadId: string | null | undefined,
): TConversation | null {
  if (!Array.isArray(conversations) || !threadId) {
    return null;
  }

  return (
    conversations.find(
      (conversation) =>
        conversation?.sessionId === threadId || conversation?.id === threadId,
    ) || null
  );
}

function isCountableConversationMessage(
  message: ActiveRouteMessageLike | null | undefined,
): boolean {
  if (!message || message.isDateHeader) {
    return false;
  }

  if (typeof message.text === "string" && message.text.trim().length > 0) {
    return true;
  }

  if (typeof message.content === "string" && message.content.trim().length > 0) {
    return true;
  }

  return typeof message.role === "string" && message.role.length > 0;
}

function parseMessageTimestamp(
  message: ActiveRouteMessageLike | null | undefined,
): number | null {
  if (!message) {
    return null;
  }

  if (typeof message.ts === "number" && Number.isFinite(message.ts)) {
    return message.ts;
  }

  if (typeof message.ts === "string" && message.ts.trim().length > 0) {
    const parsedTs = Number(message.ts);
    if (Number.isFinite(parsedTs)) {
      return parsedTs;
    }
    const parsedDate = Date.parse(message.ts);
    if (Number.isFinite(parsedDate)) {
      return parsedDate;
    }
  }

  if (typeof message.timestamp === "string" && message.timestamp.trim().length > 0) {
    const parsedTimestamp = Date.parse(message.timestamp);
    if (Number.isFinite(parsedTimestamp)) {
      return parsedTimestamp;
    }
  }

  return null;
}

function getValidHistoryLength(
  messages: Array<ActiveRouteMessageLike | null | undefined> | null | undefined,
): number {
  if (!Array.isArray(messages)) {
    return 0;
  }

  return messages.filter((message) => isCountableConversationMessage(message)).length;
}

function getLastValidMessageTimestamp(
  messages: Array<ActiveRouteMessageLike | null | undefined> | null | undefined,
): number | null {
  if (!Array.isArray(messages)) {
    return null;
  }

  for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
    const message = messages[idx];
    if (!isCountableConversationMessage(message)) {
      continue;
    }
    const parsedTimestamp = parseMessageTimestamp(message);
    if (parsedTimestamp !== null) {
      return parsedTimestamp;
    }
  }

  return null;
}

function getFirstValidMessageTimestamp(
  messages: Array<ActiveRouteMessageLike | null | undefined> | null | undefined,
): number | null {
  if (!Array.isArray(messages)) {
    return null;
  }

  for (let idx = 0; idx < messages.length; idx += 1) {
    const message = messages[idx];
    if (!isCountableConversationMessage(message)) {
      continue;
    }
    const parsedTimestamp = parseMessageTimestamp(message);
    if (parsedTimestamp !== null) {
      return parsedTimestamp;
    }
  }

  return null;
}

function buildMessageDeduplicationKey(
  message: ActiveRouteMessageLike | null | undefined,
): string | null {
  if (!message || !isCountableConversationMessage(message)) {
    return null;
  }

  const parsedTimestamp = parseMessageTimestamp(message);
  const textValue =
    typeof message.text === "string"
      ? message.text
      : typeof message.content === "string"
        ? message.content
        : "";

  return [
    message.role || "",
    parsedTimestamp ?? "",
    textValue.trim(),
  ].join("|");
}

function mergeSafeOlderHistoryIntoActiveThread<
  TThread extends ActiveRouteThreadLike,
>(
  currentThread: TThread | null | undefined,
  incomingThread: TThread | null | undefined,
  incomingHydrationSource?: VvaultConversationHydrationSource | null,
  incomingHydrationComplete?: boolean,
): TThread | null {
  if (
    !currentThread ||
    !incomingThread ||
    incomingHydrationSource !== "full" ||
    incomingHydrationComplete !== true
  ) {
    return currentThread ?? null;
  }

  const currentMessages = Array.isArray(currentThread.messages)
    ? currentThread.messages
    : [];
  const incomingMessages = Array.isArray(incomingThread.messages)
    ? incomingThread.messages
    : [];

  if (incomingMessages.length <= currentMessages.length) {
    return currentThread;
  }

  const currentOldestTimestamp = getFirstValidMessageTimestamp(currentMessages);
  if (currentOldestTimestamp === null) {
    return currentThread;
  }

  const existingKeys = new Set(
    currentMessages
      .map((message) => buildMessageDeduplicationKey(message))
      .filter((value): value is string => Boolean(value)),
  );

  const safeOlderMessages = incomingMessages.filter((message) => {
    if (!isCountableConversationMessage(message)) {
      return false;
    }

    const parsedTimestamp = parseMessageTimestamp(message);
    if (parsedTimestamp === null || parsedTimestamp >= currentOldestTimestamp) {
      return false;
    }

    const dedupeKey = buildMessageDeduplicationKey(message);
    if (!dedupeKey || existingKeys.has(dedupeKey)) {
      return false;
    }

    existingKeys.add(dedupeKey);
    return true;
  });

  if (safeOlderMessages.length === 0) {
    return currentThread;
  }

  return {
    ...currentThread,
    messages: [...safeOlderMessages, ...currentMessages],
    createdAt:
      parseMessageTimestamp(safeOlderMessages[0]) ??
      currentThread.createdAt ??
      incomingThread.createdAt ??
      null,
  };
}

function getThreadTrustRank(
  thread: ActiveRouteThreadLike | null | undefined,
  hydrationSource?: VvaultConversationHydrationSource | null,
  hydrationComplete?: boolean,
): number {
  if (!thread) {
    return -1;
  }

  if (hydrationSource === "full" && hydrationComplete === true) {
    return 4;
  }

  if (hydrationSource === "full") {
    return 3;
  }

  if (hydrationSource === "index") {
    return 1;
  }

  if (
    hydrationSource === "index-fallback" ||
    hydrationSource === "local-fallback"
  ) {
    return 0;
  }

  if (hydrationSource === "empty-fallback") {
    return -1;
  }

  return thread.isIndexHydrated === true ? 1 : 3;
}

function assessThreadChronology(
  messages: Array<ActiveRouteMessageLike | null | undefined> | null | undefined,
): { regressionCount: number; maxBackwardMs: number; hasClearRegression: boolean } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      regressionCount: 0,
      maxBackwardMs: 0,
      hasClearRegression: false,
    };
  }

  const timestampedTail = messages
    .filter((message) => isCountableConversationMessage(message))
    .map((message) => parseMessageTimestamp(message))
    .filter((value): value is number => value !== null)
    .slice(-ACTIVE_THREAD_TAIL_SAMPLE_SIZE);

  if (timestampedTail.length < 3) {
    return {
      regressionCount: 0,
      maxBackwardMs: 0,
      hasClearRegression: false,
    };
  }

  let regressionCount = 0;
  let maxBackwardMs = 0;
  let previousTimestamp = timestampedTail[0];

  for (let idx = 1; idx < timestampedTail.length; idx += 1) {
    const currentTimestamp = timestampedTail[idx];
    const backwardDelta = previousTimestamp - currentTimestamp;
    if (backwardDelta > MATERIAL_CHRONOLOGY_REGRESSION_MS) {
      regressionCount += 1;
      maxBackwardMs = Math.max(maxBackwardMs, backwardDelta);
    }
    previousTimestamp = currentTimestamp;
  }

  return {
    regressionCount,
    maxBackwardMs,
    hasClearRegression: regressionCount > 0,
  };
}

function isIncomingChronologyClearlyWorse(
  currentThread: ActiveRouteThreadLike | null | undefined,
  incomingThread: ActiveRouteThreadLike | null | undefined,
): boolean {
  const currentChronology = assessThreadChronology(currentThread?.messages);
  const incomingChronology = assessThreadChronology(incomingThread?.messages);

  if (!incomingChronology.hasClearRegression) {
    return false;
  }

  if (!currentChronology.hasClearRegression) {
    return true;
  }

  if (incomingChronology.regressionCount !== currentChronology.regressionCount) {
    return incomingChronology.regressionCount > currentChronology.regressionCount;
  }

  return incomingChronology.maxBackwardMs > currentChronology.maxBackwardMs;
}

export function isIncomingActiveThreadStrictlyBetter<
  TThread extends ActiveRouteThreadLike,
>({
  currentThread,
  incomingThread,
  incomingHydrationSource,
  incomingHydrationComplete,
}: {
  currentThread: TThread | null | undefined;
  incomingThread: TThread | null | undefined;
  incomingHydrationSource?: VvaultConversationHydrationSource | null;
  incomingHydrationComplete?: boolean;
}): boolean {
  if (!incomingThread) {
    return false;
  }

  if (!currentThread) {
    return true;
  }

  if (isIncomingChronologyClearlyWorse(currentThread, incomingThread)) {
    return false;
  }

  const currentTrustRank = getThreadTrustRank(currentThread);
  const incomingTrustRank = getThreadTrustRank(
    incomingThread,
    incomingHydrationSource,
    incomingHydrationComplete,
  );

  if (incomingTrustRank < currentTrustRank) {
    return false;
  }

  const currentHistoryLength = getValidHistoryLength(currentThread.messages);
  const incomingHistoryLength = getValidHistoryLength(incomingThread.messages);

  if (incomingHistoryLength < currentHistoryLength) {
    return false;
  }

  const currentTailTimestamp = getLastValidMessageTimestamp(currentThread.messages);
  const incomingTailTimestamp = getLastValidMessageTimestamp(incomingThread.messages);

  if (
    currentTailTimestamp !== null &&
    incomingTailTimestamp !== null &&
    incomingTailTimestamp < currentTailTimestamp
  ) {
    return false;
  }

  const trustImproved = incomingTrustRank > currentTrustRank;
  const historyLengthImproved = incomingHistoryLength > currentHistoryLength;
  const tailImproved =
    incomingTailTimestamp !== null &&
    (currentTailTimestamp === null || incomingTailTimestamp > currentTailTimestamp);
  const historyQualityImproved =
    currentThread.isIndexHydrated === true && incomingThread.isIndexHydrated !== true;

  return (
    trustImproved ||
    historyQualityImproved ||
    tailImproved ||
    historyLengthImproved
  );
}

export function reconcileIncomingThreadsForActiveRoute<
  TThread extends ActiveRouteThreadLike,
>({
  currentThreads,
  incomingThreads,
  activeThreadId,
  incomingHydrationSource,
  incomingHydrationComplete,
}: {
  currentThreads: TThread[];
  incomingThreads: TThread[];
  activeThreadId: string | null | undefined;
  incomingHydrationSource?: VvaultConversationHydrationSource | null;
  incomingHydrationComplete?: boolean;
}): TThread[] {
  const currentList = Array.isArray(currentThreads) ? currentThreads : [];
  const incomingList = Array.isArray(incomingThreads) ? incomingThreads : [];

  if (!activeThreadId) {
    return incomingList;
  }

  const currentActiveIndex = currentList.findIndex(
    (thread) => thread?.id === activeThreadId,
  );
  const incomingActiveIndex = incomingList.findIndex(
    (thread) => thread?.id === activeThreadId,
  );

  if (currentActiveIndex < 0) {
    return incomingList;
  }

  const currentActiveThread = currentList[currentActiveIndex] || null;

  if (incomingActiveIndex < 0) {
    const mergedWithoutActive = incomingList.filter(
      (thread) => thread?.id !== activeThreadId,
    );
    const insertIndex = Math.min(currentActiveIndex, mergedWithoutActive.length);
    mergedWithoutActive.splice(insertIndex, 0, currentActiveThread);
    return mergedWithoutActive;
  }

  const incomingActiveThread = incomingList[incomingActiveIndex] || null;
  if (
    isCanonicalZenThreadId(activeThreadId) &&
    incomingActiveThread &&
    incomingHydrationSource === "full" &&
    incomingHydrationComplete === true
  ) {
    return incomingList;
  }

  if (
    !isIncomingActiveThreadStrictlyBetter({
      currentThread: currentActiveThread,
      incomingThread: incomingActiveThread,
      incomingHydrationSource,
      incomingHydrationComplete,
    })
  ) {
    const reconciledThreads = [...incomingList];
    reconciledThreads[incomingActiveIndex] =
      mergeSafeOlderHistoryIntoActiveThread(
        currentActiveThread,
        incomingActiveThread,
        incomingHydrationSource,
        incomingHydrationComplete,
      ) || currentActiveThread;
    return reconciledThreads;
  }

  return incomingList;
}

export function createIdleActiveConversationHydrationState(): ActiveConversationHydrationState {
  return {
    status: "idle",
    threadId: null,
    hydrationSource: null,
    hydrationComplete: false,
  };
}

export function createLoadingActiveConversationHydrationState(
  threadId: string | null | undefined,
): ActiveConversationHydrationState {
  return {
    status: "loading",
    threadId: threadId || null,
    hydrationSource: null,
    hydrationComplete: false,
  };
}

export function createErrorActiveConversationHydrationState(
  threadId: string | null | undefined,
  message: string,
): ActiveConversationHydrationState {
  return {
    status: "error",
    threadId: threadId || null,
    hydrationSource: null,
    hydrationComplete: false,
    message,
  };
}

export function createSnapshotReplayActiveConversationHydrationState(
  threadId: string | null | undefined,
): ActiveConversationHydrationState {
  return {
    status: "partial",
    threadId: threadId || null,
    hydrationSource: "snapshot-replay",
    hydrationComplete: false,
    message:
      "Conversation replay loaded from the durable Zen live snapshot; exact canonical transcript hydration is still in progress.",
  };
}

export function deriveActiveConversationHydrationStateFromTranscript({
  threadId,
  transcriptSource,
  transcriptContent,
  transcriptMessages,
}: {
  threadId: string | null | undefined;
  transcriptSource?: string | null;
  transcriptContent?: string | null;
  transcriptMessages?: Array<unknown> | null;
}): ActiveConversationHydrationState {
  if (!threadId) {
    return createIdleActiveConversationHydrationState();
  }

  const hasTranscriptData =
    (Array.isArray(transcriptMessages) && transcriptMessages.length > 0) ||
    (typeof transcriptContent === "string" && transcriptContent.trim().length > 0);

  if (hasTranscriptData) {
    if (transcriptSource === "local-deferred") {
      return {
        status: "ready",
        threadId,
        hydrationSource: "local-fallback",
        hydrationComplete: false,
        message:
          "Conversation loaded from a local deferred VVAULT fallback while remote persistence catches up.",
      };
    }

    return {
      status: "ready",
      threadId,
      hydrationSource: "full",
      hydrationComplete: true,
    };
  }

  if (transcriptSource === "local-deferred") {
    return {
      status: "partial",
      threadId,
      hydrationSource: "local-fallback",
      hydrationComplete: false,
      message:
        "Conversation loaded from a local deferred VVAULT fallback while remote persistence catches up.",
    };
  }

  return {
    status: "missing",
    threadId,
    hydrationSource: "empty-fallback",
    hydrationComplete: false,
    message: "Canonical transcript route returned no data for this thread.",
  };
}

export function shouldReloadSparseActiveConversation({
  thread,
  activeThreadHydration,
  isReloading,
  reloadAttempted,
}: {
  thread: ActiveConversationReloadTarget | null | undefined;
  activeThreadHydration:
    | Pick<ActiveConversationHydrationState, "status">
    | null
    | undefined;
  isReloading: boolean;
  reloadAttempted: boolean;
}): boolean {
  if (!thread) {
    return false;
  }

  if (activeThreadHydration?.status === "loading") {
    return false;
  }

  if (isReloading || reloadAttempted) {
    return false;
  }

  const messageCount = Array.isArray(thread.messages) ? thread.messages.length : 0;
  return messageCount === 0 || thread.isIndexHydrated === true;
}

export function shouldBackfillActiveConversationFromTranscript({
  activeThreadHydration,
  transcriptContent,
  transcriptMessages,
}: {
  activeThreadHydration:
    | Pick<ActiveConversationHydrationState, "status">
    | null
    | undefined;
  transcriptContent?: string | null;
  transcriptMessages?: Array<unknown> | null;
}): boolean {
  if (activeThreadHydration?.status !== "partial") {
    return false;
  }

  if (Array.isArray(transcriptMessages) && transcriptMessages.length > 0) {
    return true;
  }

  return (
    typeof transcriptContent === "string" && transcriptContent.trim().length > 0
  );
}

export function shouldAutoRefreshActiveConversation({
  pathname,
  activeId,
  conversationHydrationMode,
  activeThreadHydration,
  forceRefreshInFlight,
  vvaultFailureClassification,
}: {
  pathname: string | null | undefined;
  activeId: string | null | undefined;
  conversationHydrationMode: AddressBookHydrationMode;
  activeThreadHydration:
    | Pick<ActiveConversationHydrationState, "status">
    | null
    | undefined;
  forceRefreshInFlight: boolean;
  vvaultFailureClassification?: string | null;
}): boolean {
  const normalizedPathname = typeof pathname === "string" ? pathname : "";

  if (!activeId) {
    return false;
  }

  if (!/^\/app\/chat\/.+$/.test(normalizedPathname)) {
    return false;
  }

  if (conversationHydrationMode === "full") {
    return false;
  }

  if (forceRefreshInFlight) {
    return false;
  }

  if (activeThreadHydration?.status === "loading") {
    return false;
  }

  if (
    vvaultFailureClassification &&
    vvaultFailureClassification !== "unreachable"
  ) {
    return false;
  }

  return true;
}

export function deriveActiveConversationHydrationState<
  TConversation extends VvaultConversationLookupRecord,
>(
  response: VvaultConversationCollectionResponse<TConversation>,
  threadId: string | null | undefined,
): ActiveConversationHydrationState {
  if (!threadId) {
    return createIdleActiveConversationHydrationState();
  }

  const matchedConversation = findConversationByExactThreadId(
    response.conversations,
    threadId,
  );

  if (hasCanonicalFullConversationHydration(response) && matchedConversation) {
    return {
      status: "ready",
      threadId,
      hydrationSource: response.hydrationSource,
      hydrationComplete: true,
    };
  }

  if (!hasCanonicalFullConversationHydration(response)) {
    return {
      status: "partial",
      threadId,
      hydrationSource: response.hydrationSource,
      hydrationComplete: false,
      message:
        response.hydrationSource === "index" ||
        response.hydrationSource === "index-fallback"
          ? "Conversation index loaded, but full VVAULT hydration did not complete for this thread."
          : response.hydrationSource === "local-fallback"
            ? "Conversation loaded from a local deferred VVAULT fallback while remote persistence catches up."
          : "Chatty could not hydrate a full VVAULT conversation for this thread yet.",
    };
  }

  return {
    status: "missing",
    threadId,
    hydrationSource: response.hydrationSource,
    hydrationComplete: true,
    message:
      response.hydrationSource === "local-fallback"
        ? "Local deferred VVAULT hydration is available, but the requested canonical thread is not present yet."
        : "Full conversation hydration completed, but the requested canonical thread was not present.",
  };
}
