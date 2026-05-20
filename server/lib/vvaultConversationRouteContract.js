import crypto from "node:crypto";
import {
  buildRuntimeTailHash,
  normalizeRuntimeTurnState,
  validateRuntimeTurnStatePacket,
} from './runtimeTurnState.js';

export function buildConversationHydrationPayload({
  fullLookup,
  indexLookup,
  mapIndexRowsToHydrationRecords,
}) {
  if (fullLookup?.status === "ok") {
    const hydrationSource =
      fullLookup.hydrationSource === "local-fallback"
        ? "local-fallback"
        : "full";

    return {
      conversations: Array.isArray(fullLookup.value) ? fullLookup.value : [],
      hydrationSource,
      hydrationComplete: hydrationSource === "full",
      generativeEligible: hydrationSource === "full",
      continuityEligible: hydrationSource === "full",
    };
  }

  if (indexLookup?.status === "ok") {
    const indexRows = Array.isArray(indexLookup.value) ? indexLookup.value : [];
    if (indexRows.length > 0) {
      return {
        conversations: mapIndexRowsToHydrationRecords(indexRows),
        hydrationSource: "index-fallback",
        hydrationComplete: false,
        generativeEligible: false,
        continuityEligible: false,
      };
    }
  }

  return {
    conversations: [],
    hydrationSource: "empty-fallback",
    hydrationComplete: false,
    generativeEligible: false,
    continuityEligible: false,
  };
}

export function buildConversationIndexHydrationPayload({
  conversations,
  usedLocalFallback = false,
  hadLookupFailures = false,
}) {
  const rows = Array.isArray(conversations) ? conversations : [];
  let hydrationSource = "index";

  if (rows.length === 0 && (usedLocalFallback || hadLookupFailures)) {
    hydrationSource = "empty-fallback";
  } else if (usedLocalFallback || hadLookupFailures) {
    hydrationSource = "index-fallback";
  }

  return {
    conversations: rows,
    hydrationSource,
    hydrationComplete: false,
    generativeEligible: false,
    continuityEligible: false,
  };
}

function computeLastMessageTs(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const last = messages[messages.length - 1];
  const ts = last?.timestamp || last?.createdAt || last?.ts;
  return ts ? new Date(ts).toISOString() : null;
}

function makeConversationIndexEtag(conversation = {}) {
  const base = [
    conversation.sessionId || conversation.id || "unknown",
    conversation.messageCount || (conversation.messages || []).length,
    conversation.updatedAt ||
      conversation.lastMessageAt ||
      computeLastMessageTs(conversation.messages) ||
      "",
  ].join(":");
  return crypto.createHash("sha1").update(base).digest("hex");
}

function normalizeAvatarField(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeConversationIndexRecord(record = {}) {
  const id = record.id || record.sessionId || null;
  const updatedAt = record.updatedAt || record.updated_at || record.createdAt || record.created_at || Date.now();
  const messageCount = Number(record.messageCount ?? record.message_count ?? (Array.isArray(record.messages) ? record.messages.length : 0)) || 0;
  const messages = Array.isArray(record.messages)
    ? record.messages.slice(-5).map((m, idx) => ({
        id: m.id || `${id || "session"}_m_${idx}`,
        role: m.role || "assistant",
        content: m.content || m.text || "",
        timestamp: m.timestamp || m.createdAt || updatedAt,
      }))
    : [];
  const lastMessageAt = record.lastMessageAt || computeLastMessageTs(messages) || updatedAt || null;
  const constructId = record.constructId || record.construct_id || record.constructFolder || null;
  const avatar = normalizeAvatarField(record.avatar);
  const avatarUrl = normalizeAvatarField(record.avatarUrl || record.avatar_url);
  const backendAvatarUrl = constructId
    ? `/api/ais/${encodeURIComponent(constructId)}/avatar`
    : null;

  return {
    id,
    title: record.title || record.constructName || "Conversation",
    constructId,
    updatedAt,
    lastMessageAt,
    messageCount,
    etag: makeConversationIndexEtag({
      sessionId: id,
      messageCount,
      updatedAt: updatedAt || lastMessageAt,
    }),
    messages,
    ...(avatar ? { avatar } : {}),
    ...(avatarUrl || backendAvatarUrl ? { avatarUrl: avatarUrl || backendAvatarUrl } : {}),
  };
}

export function mergeConversationIndexRecords(records = []) {
  const mergedById = new Map();
  for (const record of records) {
    const normalized = normalizeConversationIndexRecord(record);
    if (!normalized.id) continue;
    const existing = mergedById.get(normalized.id);
    if (!existing) {
      mergedById.set(normalized.id, normalized);
      continue;
    }
    const existingTs = new Date(existing.updatedAt || 0).getTime();
    const nextTs = new Date(normalized.updatedAt || 0).getTime();
    if (Number.isFinite(nextTs) && (!Number.isFinite(existingTs) || nextTs > existingTs)) {
      mergedById.set(normalized.id, { ...existing, ...normalized });
      continue;
    }
    mergedById.set(normalized.id, {
      ...normalized,
      ...existing,
      messages: existing.messages?.length ? existing.messages : normalized.messages,
    });
  }
  return Array.from(mergedById.values()).sort((a, b) => {
    const aTs = new Date(a.updatedAt || 0).getTime();
    const bTs = new Date(b.updatedAt || 0).getTime();
    return (Number.isFinite(bTs) ? bTs : 0) - (Number.isFinite(aTs) ? aTs : 0);
  });
}

function isCanonicalTranscriptMessage(message) {
  return (
    message &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0
  );
}

function normalizeCanonicalTranscriptMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .filter(isCanonicalTranscriptMessage)
    .map((message) => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || null,
      metadata: message.metadata || null,
    }));
}

function maybeParseMetadata(metadata = null) {
  if (!metadata) return null;
  if (typeof metadata === "object") return metadata;
  try {
    const parsed = JSON.parse(String(metadata));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeTailRuntimeState(message = null, { sessionId = null, constructId = null } = {}) {
  const metadata = maybeParseMetadata(message?.metadata);
  if (!metadata?.runtimeTurnState || typeof metadata.runtimeTurnState !== "object") {
    return null;
  }
  return normalizeRuntimeTurnState(metadata.runtimeTurnState, {
    sessionId,
    constructId,
    hydrationTruth: "full",
    updatedAt: message?.timestamp || null,
    assistantTailContent: message?.content,
  });
}

function runtimeStateIdentity(state = null) {
  if (!state || typeof state !== "object") return null;
  return [
    state.canonicalThreadId || state.sessionId || "",
    state.constructId || "",
    state.constructRevision || "",
    Number.isFinite(state.continuitySeq) ? String(state.continuitySeq) : "",
    state.assistantTurnId || "",
    state.tailHash || "",
    state.hydrationTruth || "",
  ].join("|");
}

export function buildTranscriptTruthPreflight({
  readPathAvailable = true,
  conversations = [],
  sessionId = null,
  constructId = null,
  runtimeTurnState = null,
  requireRuntimeTurnState = true,
} = {}) {
  const exactThreadId = typeof sessionId === "string" ? sessionId.trim() : "";
  const exactConstructId = typeof constructId === "string" ? constructId.trim() : "";

  if (!readPathAvailable) {
    return {
      eligible: false,
      status: 503,
      code: "CANONICAL_TRANSCRIPT_READ_UNAVAILABLE",
      reason: "canonical_read_path_unavailable",
      hydrationSource: "read-unavailable",
      hydrationComplete: false,
      exactThreadId,
      exactThreadFound: false,
      assistantTailFound: false,
      runtimeStateFound: Boolean(runtimeTurnState),
      runtimeStateHydrationTruth: runtimeTurnState?.hydrationTruth || null,
      latestAssistantRuntimeStateFound: false,
      latestAssistantRuntimeStateMatches: false,
      runtimePacketValid: false,
      runtimePacketFailureReason: "hydration_not_full",
      runtimePacket: null,
      expectedTailHash: null,
      latestAssistantContentHash: null,
      tailHashMatches: false,
      exactConversation: null,
      exactMessages: [],
      latestAssistantTurn: null,
      evidenceCount: 0,
      evidenceSources: [],
      fallbackRejected: false,
      generativeEligible: false,
      continuityEligible: false,
    };
  }

  const rows = Array.isArray(conversations) ? conversations : [];
  const exactConversation =
    rows.find(
      (conversation) =>
        conversation?.sessionId === exactThreadId || conversation?.id === exactThreadId,
    ) || null;
  const hydrationSource = !exactConversation
    ? rows.length > 0
      ? "index-fallback"
      : "empty-fallback"
    : exactConversation.localFallback === true
      ? "local-fallback"
      : "full";
  const hydrationComplete = hydrationSource === "full";
  const exactMessages = normalizeCanonicalTranscriptMessages(exactConversation?.messages || []);
  const latestAssistantTurn =
    exactMessages.findLast?.((message) => message.role === "assistant") ||
    [...exactMessages].reverse().find((message) => message.role === "assistant") ||
    null;
  const latestAssistantRuntimeTurnState = normalizeTailRuntimeState(latestAssistantTurn, {
    sessionId: exactThreadId,
    constructId: exactConstructId,
  });
  const normalizedRouteRuntimeTurnState = runtimeTurnState && typeof runtimeTurnState === "object"
    ? normalizeRuntimeTurnState(runtimeTurnState, {
        sessionId: exactThreadId,
        constructId: exactConstructId,
        hydrationTruth: "full",
        assistantTailContent: latestAssistantTurn?.content,
      })
    : null;
  const runtimeTurnStateAuthority = latestAssistantRuntimeTurnState || normalizedRouteRuntimeTurnState;
  const expectedTailHash = runtimeTurnStateAuthority
    ? buildRuntimeTailHash({
        canonicalThreadId:
          runtimeTurnStateAuthority.canonicalThreadId || runtimeTurnStateAuthority.sessionId,
        constructId: runtimeTurnStateAuthority.constructId,
        constructRevision: runtimeTurnStateAuthority.constructRevision,
        continuitySeq: runtimeTurnStateAuthority.continuitySeq,
        assistantTurnId: runtimeTurnStateAuthority.assistantTurnId,
        assistantTailContent: latestAssistantTurn?.content,
      })
    : null;
  const packetValidation = validateRuntimeTurnStatePacket({
    runtimeTurnState: runtimeTurnStateAuthority,
    sessionId: exactThreadId,
    constructId: exactConstructId,
    hydration: hydrationSource,
    hydrationComplete,
    latestAssistantTurn,
  });
  const runtimeStateFound = Boolean(runtimeTurnStateAuthority);
  const runtimeStateHydrationTruth = runtimeTurnStateAuthority?.hydrationTruth || null;
  const latestAssistantRuntimeStateFound = Boolean(latestAssistantRuntimeTurnState);
  const latestAssistantRuntimeStateMatches =
    Boolean(latestAssistantRuntimeTurnState) &&
    (
      !normalizedRouteRuntimeTurnState ||
      runtimeStateIdentity(latestAssistantRuntimeTurnState) ===
        runtimeStateIdentity(normalizedRouteRuntimeTurnState)
    );
  const runtimeStateMatches =
    runtimeStateFound &&
    (runtimeTurnStateAuthority?.canonicalThreadId || runtimeTurnStateAuthority?.sessionId) === exactThreadId &&
    runtimeTurnStateAuthority?.constructId === exactConstructId;
  const runtimeStateEligible =
    runtimeStateMatches &&
    runtimeStateHydrationTruth === "full" &&
    latestAssistantRuntimeStateFound &&
    latestAssistantRuntimeStateMatches &&
    packetValidation.valid === true;
  const fallbackRejected =
    hydrationSource === "local-fallback" ||
    hydrationSource === "index-fallback" ||
    hydrationSource === "empty-fallback";
  const generativeEligible =
    hydrationComplete &&
    Boolean(exactConversation) &&
    !fallbackRejected;
  const continuityEligible =
    generativeEligible &&
    Boolean(latestAssistantTurn) &&
    runtimeStateEligible;
  const eligible = requireRuntimeTurnState ? continuityEligible : generativeEligible;

  let reason = null;
  if (!exactConversation) {
    reason = rows.length > 0 ? "exact_thread_missing" : "thread_missing";
  } else if (fallbackRejected) {
    reason = hydrationSource;
  } else if (requireRuntimeTurnState && !latestAssistantTurn) {
    reason = "assistant_tail_missing";
  } else if (requireRuntimeTurnState && !runtimeStateFound) {
    reason = "runtime_turn_state_missing";
  } else if (requireRuntimeTurnState && !latestAssistantRuntimeStateFound) {
    reason = "assistant_tail_runtime_turn_state_missing";
  } else if (requireRuntimeTurnState && !latestAssistantRuntimeStateMatches) {
    reason = "assistant_tail_runtime_turn_state_mismatch";
  } else if (requireRuntimeTurnState && !runtimeStateMatches) {
    reason = "runtime_turn_state_thread_mismatch";
  } else if (requireRuntimeTurnState && packetValidation.failureReason === "tail_hash_mismatch") {
    reason = "runtime_turn_state_tail_hash_mismatch";
  } else if (requireRuntimeTurnState && packetValidation.failureReason) {
    reason = `runtime_turn_state_${packetValidation.failureReason}`;
  } else if (requireRuntimeTurnState && !runtimeStateEligible) {
    reason = "runtime_turn_state_hydration_unproven";
  }

  return {
    eligible,
    status: eligible ? 200 : 409,
    code: eligible ? null : "TRANSCRIPT_HYDRATION_REQUIRED",
    reason,
    hydrationSource,
    hydrationComplete,
    exactThreadId,
    exactThreadFound: Boolean(exactConversation),
    assistantTailFound: Boolean(latestAssistantTurn),
    runtimeStateFound,
    runtimeStateHydrationTruth,
    latestAssistantRuntimeStateFound,
    latestAssistantRuntimeStateMatches,
    runtimePacketValid: packetValidation.valid,
    runtimePacketFailureReason: packetValidation.failureReason,
    runtimePacket: packetValidation.normalizedRuntimeTurnState,
    expectedTailHash,
    latestAssistantContentHash: packetValidation.latestAssistantContentHash,
    tailHashMatches: packetValidation.tailHashMatch,
    runtimeTurnState: runtimeTurnStateAuthority,
    exactConversation,
    exactMessages,
    latestAssistantTurn,
    evidenceCount: exactMessages.length,
    evidenceSources: Array.from(
      new Set(
        [
          exactConversation?.persistenceSource || null,
          exactConversation?.localFallback === true ? "local-fallback" : null,
        ].filter(Boolean),
      ),
    ),
    fallbackRejected,
    generativeEligible,
    continuityEligible,
  };
}

function buildChatTranscriptContent(messages = []) {
  return (messages || [])
    .map((message) => `**${message.role === "user" ? "You" : "Zen"}:** ${message.content || message.text || ""}`)
    .join("\n\n");
}

export function buildPreferredChatTranscriptPayload({
  canonicalTranscript = null,
  canonicalConversation = null,
  localDeferredConversation = null,
}) {
  const transcriptContent =
    typeof canonicalTranscript?.content === "string"
      ? canonicalTranscript.content
      : "";
  const transcriptMessages = Array.isArray(canonicalTranscript?.messages)
    ? canonicalTranscript.messages
    : [];

  if (transcriptContent.trim() || transcriptMessages.length > 0) {
    return {
      ok: true,
      content: transcriptContent,
      messages: transcriptMessages,
      source: "canonical-transcript",
    };
  }

  if (canonicalConversation) {
    return {
      ok: true,
      content: buildChatTranscriptContent(canonicalConversation.messages || []),
      messages: canonicalConversation.messages || [],
      source: "canonical-conversation",
    };
  }

  if (localDeferredConversation) {
    return {
      ok: true,
      content: buildChatTranscriptContent(localDeferredConversation.messages || []),
      messages: localDeferredConversation.messages || [],
      source: "local-deferred",
    };
  }

  return {
    ok: true,
    content: "",
    messages: [],
    source: "empty",
  };
}

export function buildTranscriptWriteFailurePayload(outcome) {
  const persistenceStatus = outcome?.status === "timeout" ? "timeout" : "error";
  const code =
    persistenceStatus === "timeout"
      ? "TRANSCRIPT_PERSISTENCE_DEFERRED"
      : "TRANSCRIPT_PERSISTENCE_FAILED";

  return {
    status: 503,
    body: {
      ok: false,
      error: "VVAULT conversation persistence did not complete.",
      code,
      persistenceStatus,
      details: outcome?.error || null,
    },
  };
}

export function isConversationVisibleToReadPath(conversations, sessionId) {
  if (!Array.isArray(conversations) || !sessionId) {
    return false;
  }

  return conversations.some(
    (conversation) =>
      conversation?.sessionId === sessionId || conversation?.id === sessionId,
  );
}

export function buildContinuityProofReceipt({
  hydration = 'none',
  hydrationComplete = false,
  resumeValidation = null,
  assistantResetDetected = false,
} = {}) {
  const validation = resumeValidation && typeof resumeValidation === 'object'
    ? resumeValidation
    : {};
  const continuityExpected = validation.continuityExpected === true;
  const continuityRestored = validation.continuityRestored === true;
  return {
    hydration,
    hydrationComplete: hydrationComplete === true,
    continuityExpected,
    continuityRestored,
    continuitySource: continuityRestored
      ? validation.continuitySource || 'runtimeTurnState'
      : 'none',
    continuedFromTurnId: validation.continuedFromTurnId || null,
    continuitySeq:
      typeof validation.continuitySeq === 'number' ? validation.continuitySeq : null,
    constructMatch: validation.constructMatch === true,
    threadMatch: validation.threadMatch === true,
    staleSeatRejected: validation.staleSeatRejected === true,
    assistantResetDetected:
      assistantResetDetected === true ||
      validation.assistantResetDetected === true,
    continuityFailureReason: continuityRestored
      ? null
      : validation.failureReason || null,
    resumeSourceSeat: validation.resumeSourceSeat || null,
  };
}
