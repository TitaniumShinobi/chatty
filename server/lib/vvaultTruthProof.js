import crypto from "node:crypto";

import * as vvaultApi from "../../vvaultConnector/vvaultApiClient.js";
import { readConversations } from "../../vvaultConnector/readConversations.js";

export const ZEN_TRUTH_THREAD_ID = "zen-001_chat_with_zen-001";
export const ZEN_TRUTH_CONSTRUCT_ID = "zen-001";

function sha256(value = "") {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function toEpochMs(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : null;
}

function normalizeMessage(message = {}, index = 0) {
  return {
    index,
    role: message.role || null,
    timestamp: message.timestamp || message.createdAt || message.ts || null,
    content: typeof message.content === "string" ? message.content : String(message.text || ""),
  };
}

export function fingerprintMessages(messages = []) {
  return (Array.isArray(messages) ? messages : []).map((message, index) => {
    const normalized = normalizeMessage(message, index);
    return {
      index,
      role: normalized.role,
      timestamp: normalized.timestamp,
      sha256: sha256(normalized.content),
    };
  });
}

export function summarizeTail(messages = [], tailSize = 5) {
  const normalized = (Array.isArray(messages) ? messages : []).map(normalizeMessage);
  const fingerprints = fingerprintMessages(normalized);
  return {
    messageCount: normalized.length,
    latestTimestamp: normalized.at(-1)?.timestamp || null,
    latestRole: normalized.at(-1)?.role || null,
    latestSha256: fingerprints.at(-1)?.sha256 || null,
    tail: fingerprints.slice(-tailSize),
  };
}

export function findDivergencePoint(canonicalMessages = [], backendMessages = []) {
  const canonical = fingerprintMessages(canonicalMessages);
  const backend = fingerprintMessages(backendMessages);
  const max = Math.max(canonical.length, backend.length);
  for (let index = 0; index < max; index += 1) {
    const left = canonical[index] || null;
    const right = backend[index] || null;
    if (
      !left ||
      !right ||
      left.role !== right.role ||
      left.timestamp !== right.timestamp ||
      left.sha256 !== right.sha256
    ) {
      return {
        index,
        vvault: left,
        backend: right,
      };
    }
  }
  return null;
}

export function compareTruthTails({
  canonicalMessages = [],
  backendMessages = [],
} = {}) {
  const divergencePoint = findDivergencePoint(canonicalMessages, backendMessages);
  return {
    vvaultCanonicalTail: summarizeTail(canonicalMessages),
    backendReadTail: summarizeTail(backendMessages),
    messageCountComparison: {
      vvault: Array.isArray(canonicalMessages) ? canonicalMessages.length : 0,
      backend: Array.isArray(backendMessages) ? backendMessages.length : 0,
      match:
        (Array.isArray(canonicalMessages) ? canonicalMessages.length : 0) ===
        (Array.isArray(backendMessages) ? backendMessages.length : 0),
    },
    divergencePoint,
    match: divergencePoint === null,
  };
}

function selectFreshestTranscriptMessages(transcript = {}) {
  const apiMessages = Array.isArray(transcript.messages) ? transcript.messages : [];
  const parsedMessages = vvaultApi.parseMarkdownToMessages(transcript.content || "");
  if (apiMessages.length === 0) return parsedMessages;
  if (parsedMessages.length === 0) return apiMessages;
  if (parsedMessages.length > apiMessages.length) return parsedMessages;

  const apiLast = toEpochMs(apiMessages.at(-1)?.timestamp);
  const parsedLast = toEpochMs(parsedMessages.at(-1)?.timestamp);
  if (parsedLast !== null && (apiLast === null || parsedLast > apiLast)) {
    return parsedMessages;
  }
  return apiMessages;
}

export function buildAuthorityEnvStatus(env = process.env) {
  const hasVvaultBaseUrl = Boolean(
    env.VVAULT_API_BASE_URL || env.VVAULT_URL || env.VVAULT_BASE_URL,
  );
  const userEmail = env.CHATTY_USER_EMAIL || env.TEST_USER_EMAIL || env.CANONICAL_PROBE_REQUEST_USER_EMAIL || "";
  const supabaseUserId =
    env.CHATTY_SUPABASE_USER_ID ||
    env.TEST_SUPABASE_USER_ID ||
    env.CANONICAL_PROBE_SUPABASE_USER_ID ||
    "";
  const hasServiceToken = Boolean(env.VVAULT_SERVICE_TOKEN || env.VVAULT_SESSION_OR_SERVICE_TOKEN);
  const missing = [];
  if (!hasVvaultBaseUrl) missing.push("VVAULT_API_BASE_URL");
  if (!userEmail) missing.push("CHATTY_USER_EMAIL");
  if (!hasServiceToken && !userEmail && !supabaseUserId) {
    missing.push("VVAULT_SERVICE_TOKEN_OR_AUTH_CONTEXT");
  }
  return {
    ok: missing.length === 0,
    missing,
    userEmail,
    supabaseUserId,
    hasServiceToken,
  };
}

export function buildBlockedAuthorityReport({
  threadId = ZEN_TRUTH_THREAD_ID,
  missing = [],
} = {}) {
  return {
    STATUS: "BLOCKED_AUTHORITY_ENV",
    THREAD_ID: threadId,
    VVAULT_CANONICAL_TAIL: null,
    BACKEND_READ_TAIL: null,
    MESSAGE_COUNT_COMPARISON: null,
    DIVERGENCE_POINT: null,
    ROOT_CAUSE: `Missing VVAULT authority environment: ${missing.join(", ") || "unknown"}`,
    CORRECTIVE_ACTIONS: [],
    FILES_CHANGED: [],
    VALIDATION_COMMANDS: [],
    FINAL_VERDICT: "Blocked before truth comparison; no local fallback or Supabase truth was used.",
  };
}

export async function readCanonicalVvaultMessages({
  constructId = ZEN_TRUTH_CONSTRUCT_ID,
  userEmail,
  supabaseUserId = null,
  getTranscript = vvaultApi.getTranscript,
} = {}) {
  const transcript = await getTranscript(constructId, { userEmail, supabaseUserId });
  if (!transcript?.success) {
    throw new Error("canonical_vvault_read_failed");
  }
  return selectFreshestTranscriptMessages(transcript);
}

export async function readBackendVvaultMessages({
  constructId = ZEN_TRUTH_CONSTRUCT_ID,
  threadId = ZEN_TRUTH_THREAD_ID,
  userEmail,
  supabaseUserId = null,
  backendReadConversations = readConversations,
} = {}) {
  const rows = await backendReadConversations(
    { userEmail, supabaseUserId, userId: supabaseUserId || userEmail },
    constructId,
    { allowLocalFallback: false },
  );
  const conversation = (Array.isArray(rows) ? rows : []).find(
    (row) => row?.sessionId === threadId || row?.id === threadId,
  );
  if (!conversation) {
    throw new Error("backend_exact_thread_missing");
  }
  return Array.isArray(conversation.messages) ? conversation.messages : [];
}

export async function runZenVvaultTruthProof({
  env = process.env,
  getTranscript,
  backendReadConversations,
} = {}) {
  const authorityEnv = buildAuthorityEnvStatus(env);
  if (!authorityEnv.ok) {
    return buildBlockedAuthorityReport({ missing: authorityEnv.missing });
  }

  const canonicalMessages = await readCanonicalVvaultMessages({
    userEmail: authorityEnv.userEmail,
    supabaseUserId: authorityEnv.supabaseUserId,
    getTranscript,
  });
  const backendMessages = await readBackendVvaultMessages({
    userEmail: authorityEnv.userEmail,
    supabaseUserId: authorityEnv.supabaseUserId,
    backendReadConversations,
  });
  const comparison = compareTruthTails({ canonicalMessages, backendMessages });

  return {
    STATUS: comparison.match ? "TRUTH_RESTORED" : "DIVERGED",
    THREAD_ID: ZEN_TRUTH_THREAD_ID,
    VVAULT_CANONICAL_TAIL: comparison.vvaultCanonicalTail,
    BACKEND_READ_TAIL: comparison.backendReadTail,
    MESSAGE_COUNT_COMPARISON: comparison.messageCountComparison,
    DIVERGENCE_POINT: comparison.divergencePoint,
    ROOT_CAUSE: comparison.match ? "none" : "backend_read_tail_does_not_match_vvault_canonical_tail",
    CORRECTIVE_ACTIONS: comparison.match
      ? ["No transcript mutation required."]
      : ["Inspect backend read path for stale cache, index supplement, or fallback merge."],
    FILES_CHANGED: [],
    VALIDATION_COMMANDS: [],
    FINAL_VERDICT: comparison.match
      ? "Backend readback matches direct VVAULT canonical readback."
      : "Backend truth is not restored; do not infer or reconstruct missing turns.",
  };
}
