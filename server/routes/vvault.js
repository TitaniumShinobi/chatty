import express from "express";
import { createRequire } from "module";
import path from "path";
import crypto from "crypto";
import {
  requireAuth,
  requireAuthOrServiceToken,
  requirePreferredAuth,
  requirePreferredAuthOrServiceToken,
  requireSharedAuth,
} from "../auth/middleware/auth.js";
import User from "../models/User.js";
import { createPrimaryConversationFile } from "../services/importService.js";
import multer from "multer";
import OpenAI from "openai";
import { loadIdentityFiles } from "../lib/identityLoader.js";
import { GPTManager } from "../lib/gptManager.js";
import { AIManager } from "../lib/aiManager.js";
import { performSearch, injectSearchContext, buildSearchResponsePackets } from "./search.js";
import {
  buildEnrichedContext,
  captureMemory,
  CONTEXT_BUDGET_PROFILES,
  isMemoryTriggeringQuestion,
  normalizeContextBudgetProfile,
  shouldUseBoundedZenSmalltalkContext,
} from "../lib/memoryContextBuilder.js";
import { evaluateMessage, buildChildSafeDirectives, enforcePreInferenceGates, enforceRoleplayToggle } from "../lib/contentGuard.js";
import { getAccountType, getChildSettings } from "../lib/familyManager.js";
import { canonicalizeConstructId } from "../lib/constructId.js";
import { canonicalSourceFolderList } from "../lib/transcriptSource.js";
import { getSupabaseClient } from "../lib/supabaseClient.js";
import { buildVoiceContractJson, extractVoiceInstructions, parseVoiceContract } from '../lib/voiceContract.js';
import { applyResponsePostProcessing } from "../lib/responsePostProcessor.js";
import {
  buildDeterministicIdentityRepairCandidate,
  buildDeterministicTranscriptLawRepairCandidate,
  buildIdentityCoherenceRepairPrompt,
  classifyTranscriptLawPromptKind,
  evaluateIdentityCoherence,
  evaluateTranscriptLawGovernance,
} from "../lib/identityCoherenceGuard.js";
import {
  buildConstructGreetingVoiceContext,
  buildDeterministicConstructGreetingFallback,
  buildGreetingTurnDirective,
  detectConstructGreetingTurn,
} from "../lib/constructGreetingTurn.js";
import {
  buildDeterministicConstructRuntimePolicyAnswer,
  classifyConstructRuntimePolicyAnswerKind,
} from "../lib/constructRuntimePolicy.js";
import { applyHumanConversationGuard, asksForEvidenceStyle } from "../lib/humanConversationGuard.js";
import { recoverEvidenceBackedContinuityReply } from "../lib/continuityResponseRecovery.js";
import {
  buildDeterministicResumedTurnFallback,
  evaluateResumedTurnContinuityIntegrity,
} from "../lib/resumedTurnContinuity.js";
import {
  LIN_CANONICAL_THREAD_ID,
  LIN_CANONICAL_TRANSCRIPT_PATH,
  resolveCanonicalConstructDataOwner,
} from "../lib/canonicalConstructOwner.js";
import { resolveSupabaseUserId } from "../auth/lib/supabaseUserResolver.js";
import { sampleAssociativeFragments } from "../lib/associativeRecall.js";
import { buildOrchestrationChecklist } from "../lib/orchestrationChecklist.js";
import { LIN_MODEL_DEFAULTS, isLinDefaultPlaceholder } from "../lib/linModelDefaults.js";
import {
  LIN_THREE_I_CANON_VERSION,
  getLinSeatCanon,
} from "../lib/linSeatCanon.js";
import {
  FULL_SEAT_SYNTHESIS_PROFILE,
  normalizeOrchestrationProfile,
  runFullSeatSynthesis,
} from "../lib/fullSeatSynthesis.js";
import {
  evaluateAssignmentQa,
  normalizeAssignmentQaInput,
} from "../lib/assignmentQaGuard.js";
import {
  buildAssignmentQaPromptContract,
  buildAssignmentQaRepairPrompt,
  buildDeterministicAssignmentQaAnswer,
} from "../lib/assignmentQaContract.js";
import {
  buildResearchWorkflowReceipt,
} from "../lib/researchWorkflowReceipt.js";
import { getUserProfile } from "../lib/userRegistry.js";
import {
  publishZenLiveTranscriptEvent,
  ZEN_LIVE_CONSTRUCT_ID,
  ZEN_LIVE_SESSION_ID,
} from "../lib/zenLiveTranscript.js";
import {
  buildConversationHydrationPayload,
  buildConversationIndexHydrationPayload,
  buildContinuityProofReceipt,
  buildTranscriptTruthPreflight,
  buildTranscriptWriteFailurePayload,
  isConversationVisibleToReadPath,
  mergeConversationIndexRecords,
} from "../lib/vvaultConversationRouteContract.js";
import {
  buildCanonicalTranscriptArtifact,
  buildCanonicalTranscriptFilename,
  buildChatTranscriptResponse,
  CanonicalTranscriptError,
  resolveCanonicalTranscriptPayload,
} from "../lib/canonicalTranscriptExportService.js";
import {
  applyForgedSimLockToRecord,
  readForgedSimLock,
} from "../lib/forgedSimLock.js";
import {
  buildDeterministicZenIdentityBoundaryFallback,
  buildDeterministicZenSmalltalkBoundaryFallback,
  isZenIdentityBoundaryDriftOnly,
  isZenIdentityBoundaryPrompt,
  isTesterBoundaryDriftOnly,
  isZenSmalltalkTesterBoundaryPrompt,
} from "../lib/zenSmalltalkBoundaryFallback.js";
import {
  buildDeterministicValResponsibilityFallback,
  isValResponsibilityDriftOnly,
  isValResponsibilityPrompt,
} from "../lib/valBoundaryFallback.js";
import {
  buildDeterministicConstructPresenceFallback,
  classifyConstructPresencePromptKind,
  isConstructPresenceDriftOnly,
} from "../lib/constructPresenceBoundaryFallback.js";
import {
  buildConstructRevision,
  buildRouteTurnEnvelope,
  computeNextRuntimeTurnState,
  normalizeRuntimeResumeRequest,
  rebuildRuntimeTurnStateFromCanonicalTranscript,
  validateRuntimeResumeRequest,
} from "../lib/runtimeTurnState.js";
import { readLatestRuntimeTurnState } from "../../vvaultConnector/runtimeTurnStateStore.js";
import {
  clearCanonicalConstructIdentityCache,
  loadCanonicalFilesSummary,
  loadCanonicalConstructIdentity,
} from "../lib/constructIdentityRepository.js";
import {
  DEFAULT_TTL_MS,
  cacheGet,
  cacheSet,
  identityCompactCache,
  filesSummaryCache,
  clearIdentityCompactCache,
  clearFilesSummaryCache,
} from "../lib/vvaultCache.js";
import { resolveSupabaseUser } from "../lib/resolveSupabaseUser.js";
import { assertNotLockedSync } from "../lib/runtimeLock.js";
import { resolveVvaultDirectAuth } from "../lib/vvaultDirectAuth.js";
import { resolveVvaultRequestUser } from "../lib/vvaultRequestUser.js";
import { buildConversationIndexLookupCandidates } from "../lib/vvaultIndexLookupCandidates.js";
import { resolveLinkedVvaultUserId } from "../lib/vvaultUserRegistryLookup.js";
import { getVvaultTargets, getVvaultBridgeConfig } from "../lib/vvaultBridgeConfig.js";
import {
  buildStrictGateIdentityLog,
  isStrictConversationIndexRequest,
  logVvaultIdentityDiagnostics,
} from "../lib/vvaultIdentityDiagnostics.js";
import { validateIdentityBundle } from "../lib/identityBundlePreflight.js";
import {
  isLinOrchestratedConstruct,
  isProtectedZenConstruct,
} from "../lib/constructMemoryPolicy.js";
import {
  DEFAULT_CODEX_ARCHIVE_LIFE_USER_ID,
  syncCodexThreadsArchive,
} from "../lib/codexThreadArchive.js";
import leakSignals from "../lib/leakSignals.cjs";

const { hasLinIdentityDumpSignals } = leakSignals;

// Timestamp all console output from this module
const patchConsoleWithTimestamp = () => {
  if (console.__tsPatched) return;
  const withTs = (fn) => (...args) => fn(new Date().toISOString(), ...args);
  console.log = withTs(console.log.bind(console));
  console.error = withTs(console.error.bind(console));
  console.warn = withTs(console.warn.bind(console));
  console.__tsPatched = true;
};
patchConsoleWithTimestamp();

const require = createRequire(import.meta.url);
const router = express.Router();

function publishZenLiveEventSafe(event) {
  try {
    publishZenLiveTranscriptEvent(event);
  } catch (error) {
    console.warn('[ZenLiveTranscript] VVAULT route publish failed:', error?.message || error);
  }
}

function publishZenReplayBurst({
  constructId,
  sessionId,
  userMessage,
  aiResponse,
  assistantTurnId,
  sourceProduct = 'vvault',
}) {
  if (constructId !== ZEN_LIVE_CONSTRUCT_ID) return;

  const normalizedSessionId = typeof sessionId === 'string' && sessionId.trim()
    ? sessionId.trim()
    : ZEN_LIVE_SESSION_ID;
  const turnId = assistantTurnId || `zen-live-${Date.now()}`;

  publishZenLiveEventSafe({
    sessionId: normalizedSessionId,
    turnId,
    sourceProduct,
    kind: 'user_message',
    content: String(userMessage || ''),
  });
  publishZenLiveEventSafe({
    sessionId: normalizedSessionId,
    turnId,
    sourceProduct,
    kind: 'status',
    status: 'routing_assistant_turn',
  });
  publishZenLiveEventSafe({
    sessionId: normalizedSessionId,
    turnId,
    sourceProduct,
    kind: 'assistant_started',
    status: 'responding',
  });
  publishZenLiveEventSafe({
    sessionId: normalizedSessionId,
    turnId,
    sourceProduct,
    kind: 'assistant_token',
    delta: String(aiResponse || ''),
  });
  publishZenLiveEventSafe({
    sessionId: normalizedSessionId,
    turnId,
    sourceProduct,
    kind: 'assistant_done',
    content: String(aiResponse || ''),
    status: 'complete',
  });
}

function buildSearchBackedAssistantPayload({
  aiResponse,
  searchResults,
  housingSearch,
}) {
  const packetResult = buildSearchResponsePackets({
    aiResponse,
    searchResults,
    housingSearch,
  });

  if (!packetResult) {
    return {
      content: aiResponse,
      packets: null,
      citations: [],
    };
  }

  return packetResult;
}

function buildSearchInspectabilityReceipt({
  searchVertical = 'none',
  searchResults,
  housingSearch,
  citations,
  packets,
} = {}) {
  const packetsArray = Array.isArray(packets) ? packets : [];
  const citationArray = Array.isArray(citations) ? citations : [];
  const resultCount = Array.isArray(housingSearch?.results)
    ? housingSearch.results.length
    : Array.isArray(searchResults)
      ? searchResults.length
      : 0;
  const detectedHousing = Boolean(
    housingSearch?.normalizedQuery ||
    housingSearch?.mode ||
    (Array.isArray(housingSearch?.results) && housingSearch.results.length > 0) ||
    searchVertical === 'housing'
  );

  if (resultCount === 0 && citationArray.length === 0 && packetsArray.length === 0 && !detectedHousing) {
    return null;
  }

  return {
    search: {
      search_vertical: searchVertical || (detectedHousing ? 'housing' : 'web'),
      result_count: resultCount,
      citation_count: citationArray.length,
      packets_emitted: packetsArray.length > 0,
      citations_visible: citationArray.length > 0,
    },
    housing: detectedHousing
      ? {
          detected: true,
          normalized_query: housingSearch?.normalizedQuery || null,
          mode: housingSearch?.mode || null,
          filters: housingSearch?.filters || null,
          query_count: Array.isArray(housingSearch?.queries) ? housingSearch.queries.length : 0,
          result_count: Array.isArray(housingSearch?.results) ? housingSearch.results.length : 0,
          enriched_count: Number(housingSearch?.enrichedCount || 0),
          citation_count: citationArray.length,
          gallery_cards_emitted: packetsArray.some((packet) => packet?.op === 'housing.results.v1'),
          citations_visible: citationArray.length > 0,
        }
      : null,
  };
}

// Runtime lock: block all POST (writes) when VVAULT_RUNTIME_LOCK is set
router.use((req, res, next) => {
  if (req.method !== "POST") return next();
  const check = assertNotLockedSync();
  if (!check.allowed) {
    return res.status(503).json({
      ok: false,
      error: "VVAULT_RUNTIME_LOCKED",
      message: check.reason || "VVAULT runtime is locked; writes are disabled.",
    });
  }
  next();
});

// Replit edge: when VVAULT_URL points at a Replit deployment, the repl can be asleep.
// Replit returns 503 with Replit-Proxy-Error: asleep before the request reaches VVAULT.
const REPLIT_PROXY_ERROR_HEADER = "Replit-Proxy-Error";
const VVAULT_HOST_ASLEEP_MESSAGE = "VVAULT host is sleeping or unavailable. Try again in a moment.";

/**
 * Returns true when the upstream response is a Replit edge 503 (host asleep).
 * The request never reached VVAULT (vvault_web_server.py).
 * @param {Response} response - fetch Response from VVAULT_URL
 */
function isReplitAsleepResponse(response) {
  if (response?.status !== 503) return false;
  const value = response.headers.get(REPLIT_PROXY_ERROR_HEADER);
  return value != null && String(value).toLowerCase().includes("asleep");
}

function sendVvaultHostAsleep(res, details = {}) {
  return res.status(503).json({
    ok: false,
    error: "VVAULT_HOST_ASLEEP",
    message: VVAULT_HOST_ASLEEP_MESSAGE,
    details: { downstreamStatus: 503, replitAsleep: true, ...details },
  });
}

function safeParseJson(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stripChattyMetadataComment(value = '') {
  return String(value || '')
    .split('\n')
    .filter((line) => !/^\s*<!--\s*CHATTY_METADATA\s+[A-Za-z0-9_-]+\s*-->\s*$/.test(line))
    .join('\n')
    .trimEnd();
}

const IDENTITY_AUDIT_FILE_GROUPS = {
  prompt: {
    canonical: ['prompt.json'],
    legacy: ['prompt.txt'],
  },
  voice: {
    canonical: ['voice.json'],
    legacy: ['voice.md'],
  },
  definition: {
    canonical: ['definition.json'],
    legacy: ['definitions.json', 'definition.txt'],
  },
  physicalFeatures: {
    canonical: ['physical-features.json'],
    legacy: ['physical_features.json', 'physicalfeatures.json', 'gender.json'],
  },
  conditioning: {
    canonical: ['conditioning.txt'],
    legacy: [],
  },
};

const IDENTITY_FORCE_PRUNE_BASENAMES = new Set([
  'identity.bak.json',
  'avatar.jpeg',
  'definition.txt',
  'voice.md',
]);

const IDENTITY_AUDIT_BASENAMES = new Set(
  Object.values(IDENTITY_AUDIT_FILE_GROUPS)
    .flatMap((group) => [...group.canonical, ...group.legacy])
);
for (const name of IDENTITY_FORCE_PRUNE_BASENAMES) {
  IDENTITY_AUDIT_BASENAMES.add(name);
}

function constructIdVariantsForAudit(normalizedConstructId) {
  return [
    normalizedConstructId,
    `gpt-${normalizedConstructId}-seed`,
    `gpt-${normalizedConstructId}-seed-001`,
    `ai-${normalizedConstructId}`,
  ];
}

function buildIdentityAudit(rows, supabaseUserId) {
  const byBasename = {};
  for (const row of rows) {
    const name = path.basename(row.filename || '');
    if (!IDENTITY_AUDIT_BASENAMES.has(name)) continue;
    if (!byBasename[name]) byBasename[name] = [];
    byBasename[name].push(row);
  }

  const grouped = {};
  for (const [groupKey, spec] of Object.entries(IDENTITY_AUDIT_FILE_GROUPS)) {
    const canonicalRows = spec.canonical.flatMap((name) => byBasename[name] || []);
    const legacyRows = spec.legacy.flatMap((name) => byBasename[name] || []);
    const sortedCanonicalRows = canonicalRows.slice().sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    const sortedLegacyRows = legacyRows.slice().sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    const pickPreferred = (candidates) => candidates.slice().sort((a, b) => {
      const aUserScore = supabaseUserId && a.user_id === supabaseUserId ? 1 : 0;
      const bUserScore = supabaseUserId && b.user_id === supabaseUserId ? 1 : 0;
      if (bUserScore !== aUserScore) return bUserScore - aUserScore;
      const aContentScore = typeof a.content === 'string' && a.content.trim() ? 1 : 0;
      const bContentScore = typeof b.content === 'string' && b.content.trim() ? 1 : 0;
      if (bContentScore !== aContentScore) return bContentScore - aContentScore;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    })[0] || null;

    const canonicalActive = pickPreferred(sortedCanonicalRows);
    const legacyActive = pickPreferred(sortedLegacyRows);
    const active = canonicalActive || legacyActive;

    grouped[groupKey] = {
      canonicalFiles: spec.canonical,
      legacyFiles: spec.legacy,
      canonicalCount: sortedCanonicalRows.length,
      legacyCount: sortedLegacyRows.length,
      hasCanonical: sortedCanonicalRows.length > 0,
      hasLegacy: sortedLegacyRows.length > 0,
      hasCanonicalContent: sortedCanonicalRows.some((row) => typeof row.content === 'string' && row.content.trim()),
      hasAnyContent: [...sortedCanonicalRows, ...sortedLegacyRows].some((row) => typeof row.content === 'string' && row.content.trim()),
      activeSource: canonicalActive ? 'canonical' : (legacyActive ? 'legacy' : 'missing'),
      activeFilename: active?.filename || null,
      activeCreatedAt: active?.created_at || null,
      activeUserId: active?.user_id || null,
    };
  }

  const recommendations = [];
  for (const [groupKey, group] of Object.entries(grouped)) {
    if (!group.hasCanonical && group.hasLegacy) {
      recommendations.push({
        group: groupKey,
        action: 'migrate-to-canonical',
        reason: 'Legacy file exists without canonical file',
      });
    }
    if (group.hasCanonical && !group.hasCanonicalContent) {
      recommendations.push({
        group: groupKey,
        action: 'repair-canonical-content',
        reason: 'Canonical file exists but appears empty',
      });
    }
    if (group.hasCanonical && group.hasLegacy) {
      recommendations.push({
        group: groupKey,
        action: 'prune-legacy-after-verify',
        reason: 'Both canonical and legacy files exist',
      });
    }
  }

  return {
    grouped,
    recommendations,
    fileIndex: Object.fromEntries(
      Object.entries(byBasename).map(([name, list]) => [
        name,
        list
          .slice()
          .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
          .map((row) => ({
            id: row.id,
            filename: row.filename,
            userId: row.user_id || null,
            constructId: row.construct_id || null,
            createdAt: row.created_at || null,
            hasInlineContent: typeof row.content === 'string' && Boolean(row.content.trim()),
            hasStoragePath: Boolean(row.storage_path),
            fileType: row.file_type || null,
          })),
      ])
    ),
  };
}

function parsePhysicalFeaturesObject(value) {
  if (typeof value !== 'string' || !value.trim()) return {};

  const parsedJson = safeParseJson(value);
  if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
    return Object.fromEntries(
      Object.entries(parsedJson)
        .map(([key, item]) => [String(key).trim(), item == null ? '' : String(item).trim()])
        .filter(([key]) => Boolean(key))
    );
  }

  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const out = {};
  for (const line of lines) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) return {};
    const key = line.slice(0, separatorIndex).trim();
    const itemValue = line.slice(separatorIndex + 1).trim();
    if (!key) return {};
    out[key] = itemValue;
  }
  return out;
}

// ── Tool Event Store (per-session, in-memory) ──────────────────────
// Client reports tool events (screen_capture, ocr, etc.)
// Server drains them into tool_trace on the next assistant response
const pendingToolEvents = new Map(); // sessionId → [{tool, detail, ts}]

function recordToolEvent(sessionId, tool, detail) {
  if (!pendingToolEvents.has(sessionId)) pendingToolEvents.set(sessionId, []);
  const events = pendingToolEvents.get(sessionId);
  if (events.length < 50) {
    events.push({ tool, detail, ts: new Date().toISOString() });
  }
}

function drainToolEvents(sessionId) {
  const events = pendingToolEvents.get(sessionId) || [];
  pendingToolEvents.delete(sessionId);
  return events;
}

function mergeToolTrace(drainedEvents, enrichedContext) {
  const events = [...drainedEvents];
  if (enrichedContext?.continuityToolTrace) {
    events.push(enrichedContext.continuityToolTrace);
  }
  return events;
}

async function buildMemoryContext({
  userId = null,
  constructId = null,
  threadId = null,
  userMessage = null,
} = {}) {
  const context = {
    stmSnippets: [],
    ltmSnippets: [],
    needleSnippets: [],
    memoryDiagnostics: { enabled: false },
  };

  console.log('[MEMORY_CONTEXT]', {
    constructId,
    threadId,
    memory_enabled: false,
  });

  return context;
}

async function buildEnrichedContextPrompt({
  userId,
  constructId,
  userMessage,
  gptConfig,
  user,
  threadId,
  timezone,
  systemPromptOverride,
  previewMode = false,
  previewDraft = null,
  suppressedSystemPromptOverride = false,
  identityBundle = null,
  requestedSeat = null,
  hasImages = false,
  contextBudgetProfile = null,
  codingIntent = false,
  policyOrReceiptIntent = false,
  suppressTranscriptLawIntent = false,
  runtimeTurnState = null,
  continuityClass = null,
  continuityResume = null,
}) {
  const effectiveThreadId = threadId || `${constructId}_chat_with_${constructId}`;
  const memoryContext = await buildMemoryContext({
    userId,
    constructId,
    threadId: effectiveThreadId,
    userMessage,
  });

  const enrichedContext = await buildEnrichedContext({
    userId,
    constructId,
    userMessage,
    systemPromptOverride,
    gptConfig,
    user,
    clientTimezone: timezone || null,
    threadId: effectiveThreadId,
    previewMode,
    previewDraft,
    suppressedSystemPromptOverride,
    identityBundle,
    requestedSeat,
    hasImages,
    contextBudgetProfile,
    codingIntent,
    policyOrReceiptIntent,
    suppressTranscriptLawIntent,
    runtimeTurnState,
    continuityClass,
    continuityResume,
  });

  return {
    effectiveThreadId,
    enrichedContext,
    systemPrompt: enrichedContext.systemPrompt,
    stmSnippets: memoryContext.stmSnippets,
    ltmSnippets: memoryContext.ltmSnippets,
    needleSnippets: memoryContext.needleSnippets,
    memoryDiagnostics: memoryContext.memoryDiagnostics,
  };
}

function deriveConstructReceiptName(constructId, gptConfig = {}) {
  return gptConfig?.name || constructId.replace(/-\d+$/, '').replace(/^./, (c) => c.toUpperCase());
}

function buildContextBuildFailurePayload({
  authReceipt,
  userId,
  user,
  constructId,
  rawConstructId,
  canonicalConstructId,
  gptConfig,
  message,
  threadId,
  sessionId,
  hasImages,
  previewMode,
  skipPersistence,
  identityBundle,
  details,
}) {
  const receiptConstructName = deriveConstructReceiptName(constructId, gptConfig);
  const failureReason = details?.error || 'Context build temporarily unavailable';
  const contextBuildReceipt = {
    status: details?.status || 'error',
    timeout_ms: details?.timeout_ms || null,
    reason: details?.reason || 'context_build_failed',
    recovery_profile: details?.recovery_profile || null,
    remote_history_skipped: details?.remote_history_skipped ?? null,
  };
  const failureRuntimeReceipt = {
    created_at: new Date().toISOString(),
    user_id: userId || null,
    auth: authReceipt,
    construct_id: constructId,
    effective_construct_id: constructId,
    effective_construct_name: receiptConstructName,
    orchestration_mode: gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
    route_mode: 'vvault_message',
    persistence_owner: 'blocked_context_build',
    identity: {
      source: 'identity_bundle_preflight',
      base_prompt_source: identityBundle?.preflight?.identity?.prompt_source || 'unknown',
      conditioning_appended: Boolean(identityBundle?.identity?.conditioning),
      identity_bundle_hash: null,
      effective_construct_id: constructId,
      effective_construct_name: receiptConstructName,
      selected_construct_id: canonicalConstructId || constructId,
      raw_construct_id: rawConstructId,
      preflight: identityBundle?.preflight || null,
    },
    memory: {
      retrieval_ran: false,
      memory_query_detected: false,
      evidence_count: 0,
      ledger_sessions: 0,
      memory_profile: gptConfig?.memoryProfile || gptConfig?.memory_profile || 'off',
      voice_exemplar_sources: [],
      voice_exemplar_count: 0,
      supabase_accessed: false,
      voice_exemplar_retrieval: null,
      verified_memory_retrieval: null,
      vector_retrieval: {
        status: 'skipped',
        optional: true,
        degraded: false,
        provider: 'semantic_search',
        error: null,
        timeout_ms: null,
      },
      memory_source: 'context_build_failed',
      context_build: contextBuildReceipt,
      sources: null,
    },
    provider: {
      final_provider: null,
      provider: null,
      model: null,
      mode: gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
      fallback_used: false,
    },
    fidelity: {
      identity_coherence: {
        status: 'skipped',
        reasons: [failureReason],
        signals: [],
        violations: [],
        repair_attempted: false,
        repair_applied: false,
        persist_canonical: false,
        owner_file: 'server/routes/vvault.js',
        source_anchor: 'server/routes/vvault.js:buildEnrichedContextPromptWithRecovery',
      },
    },
  };
  const failureEnrichedContext = {
    phaseTiming: {
      identity: {
        source: 'identity_bundle_preflight',
      },
      basePromptSource: identityBundle?.preflight?.identity?.prompt_source || 'identity_bundle_preflight',
      conditioningInjected: Boolean(identityBundle?.identity?.conditioning),
      contextRecovery: {
        profile: details?.recovery_profile || null,
        status: details?.status || 'error',
        error: failureReason,
      },
      memorySearch: { skipped: true, reason: 'context_build_failed' },
      knowledge: { skipped: true, reason: 'context_build_failed' },
    },
    capabilityManifest: {
      enabled: { proactiveInitiation: false },
      state: { selfpromptOn: false },
    },
    context_recovery_profile: details?.recovery_profile || null,
    remote_history_skipped: Boolean(details?.remote_history_skipped),
    evidence_count: 0,
    memory_retrieval_ran: false,
    memory_query_detected: false,
  };
  const failureChecklist = buildOrchestrationChecklist({
    userId,
    user,
    constructId,
    threadId: sessionId || threadId || `${constructId}_chat_with_${constructId}`,
    userMessage: message,
    gptConfig: {
      name: receiptConstructName,
      orchestrationMode: gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
      memoryProfile: gptConfig?.memoryProfile || gptConfig?.memory_profile || 'off',
    },
    enrichedContext: failureEnrichedContext,
    retrievalDiagnostics: {
      evidence_count: 0,
      retrieval_counts: { vector: 0, verified: 0, needle: 0, transcript: 0 },
      phase_timing: failureEnrichedContext.phaseTiming,
    },
    promptDiagnostics: {
      route: '/api/vvault/message',
      mode: 'context_build_failure',
      constructId,
      prompt_source: 'context_build_failure',
      base_prompt_source: identityBundle?.preflight?.identity?.prompt_source || 'identity_bundle_preflight',
      basePromptSource: identityBundle?.preflight?.identity?.prompt_source || 'identity_bundle_preflight',
      conditioning_appended: Boolean(identityBundle?.identity?.conditioning),
      preview_mode: Boolean(previewMode),
      skip_persistence: true,
      final_history_count: 0,
      prompt_chars: 0,
    },
    providerTrace: {
      final_provider: null,
      fallback_used: false,
      attempts: [],
    },
    validatorDebug: {},
    runtimeReceipt: failureRuntimeReceipt,
    contextMode: details?.recovery_profile || 'context_build_failed',
    relationalTurn: false,
    lowComplexityTurn: true,
    hasImages,
    skipPersistence: true,
    previewMode,
    requestedConstructId: rawConstructId,
    canonicalConstructId: canonicalConstructId || constructId,
    responseStatus: 'context_build_failed',
  });

  return {
    ok: false,
    success: false,
    constructId,
    construct_id: constructId,
    code: 'CONTEXT_BUILD_UNAVAILABLE',
    error: failureReason,
    details: {
      status: details?.status || 'error',
      timeout_ms: details?.timeout_ms || null,
      reason: details?.reason || 'context_build_failed',
      recovery_profile: details?.recovery_profile || null,
    },
    runtime_receipt: failureRuntimeReceipt,
    orchestration_checklist: failureChecklist,
    has_images: hasImages,
  };
}

function shouldRequireCanonicalTranscriptTruth({
  continueTurn = false,
  continuityResume = null,
  runtimeTurnState = null,
  sessionId = null,
  constructId = null,
  message = '',
  previewMode = false,
} = {}) {
  if (previewMode === true) {
    return false;
  }

  const exactCanonicalThreadTargeted = isExactCanonicalThreadTargeted({
    sessionId,
    constructId,
  });

  return (
    continueTurn === true ||
    continuityResume?.continuityExpected === true ||
    isExplicitResumeContinuationCue(message) ||
    Boolean(runtimeTurnState?.assistantTurnId) ||
    exactCanonicalThreadTargeted
  );
}

function detectContinuityResetDraft(text = '') {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'empty_assistant_draft';
  const head = normalized.slice(0, 420);
  const checks = [
    {
      reason: 'generic_greeting',
      pattern:
        /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening))\b[^.!?]{0,120}\b(?:i['’]?m|i am|how can i help|what can i help|welcome|nice to meet|devon)\b/i,
    },
    {
      reason: 'recap_reset',
      pattern:
        /\b(?:to recap|quick recap|here['’]?s (?:a|the) recap|what we were working on|we were working on|last time we were)\b/i,
    },
    {
      reason: 'context_request',
      pattern:
        /\b(?:what were we working on|remind me|can you remind me|give me (?:the )?context|what would you like to continue|how can i help)\b/i,
    },
    {
      reason: 'reset_tone',
      pattern:
        /\b(?:start fresh|new conversation|from scratch|first meeting|don['’]?t have enough context|need more context)\b/i,
    },
  ];

  return checks.find((check) => check.pattern.test(head))?.reason || null;
}

function isExactCanonicalThreadTargeted({
  sessionId = null,
  constructId = null,
} = {}) {
  const normalizedConstructId =
    typeof constructId === 'string' ? constructId.trim() : '';
  const normalizedSessionId =
    typeof sessionId === 'string' ? sessionId.trim() : '';
  const canonicalThreadId =
    normalizedConstructId
      ? `${normalizedConstructId}_chat_with_${normalizedConstructId}`
      : '';
  const exactCanonicalThreadTargeted =
    canonicalThreadId.length > 0 && normalizedSessionId === canonicalThreadId;
  return exactCanonicalThreadTargeted;
}

function canAttemptCanonicalContinuityRecovery({
  continuityResumeValidation = null,
  sessionId = null,
  constructId = null,
  previewMode = false,
} = {}) {
  if (previewMode === true) {
    return false;
  }

  if (!continuityResumeValidation?.continuityExpected) {
    return false;
  }

  if (
    !isExactCanonicalThreadTargeted({
      sessionId,
      constructId,
    })
  ) {
    return false;
  }

  return (
    continuityResumeValidation.failureReason === 'resume_state_missing' ||
    continuityResumeValidation.failureReason === 'hydration_unproven'
  );
}

function buildTranscriptTruthFailurePayload({
  authReceipt,
  userId,
  user,
  constructId,
  rawConstructId,
  canonicalConstructId,
  message,
  threadId,
  sessionId,
  hasImages,
  previewMode,
  gptConfig = null,
  continuityResume = null,
  transcriptTruth = null,
  code = 'TRANSCRIPT_HYDRATION_REQUIRED',
  error = 'Canonical transcript hydration is required before generation can continue.',
  responseStatus = 'transcript_hydration_required',
} = {}) {
  const receiptConstructName = deriveConstructReceiptName(constructId, gptConfig);
  const continuityReceipt = buildContinuityProofReceipt({
    hydration: transcriptTruth?.hydrationSource || continuityResume?.hydration || 'none',
    hydrationComplete:
      transcriptTruth?.hydrationComplete === true ||
      continuityResume?.hydrationComplete === true,
    resumeValidation: continuityResume,
  });
  const transcriptTruthReceipt = {
    eligible: transcriptTruth?.eligible === true,
    source: transcriptTruth?.hydrationSource || 'none',
    hydration_complete: transcriptTruth?.hydrationComplete === true,
    exact_thread_id: transcriptTruth?.exactThreadId || sessionId || threadId || `${constructId}_chat_with_${constructId}`,
    exact_thread_found: transcriptTruth?.exactThreadFound === true,
    assistant_tail_found: transcriptTruth?.assistantTailFound === true,
    runtime_state_found: transcriptTruth?.runtimeStateFound === true,
    runtime_state_hydration_truth: transcriptTruth?.runtimeStateHydrationTruth || null,
    evidence_count: Number(transcriptTruth?.evidenceCount || 0),
    evidence_sources: transcriptTruth?.evidenceSources || [],
    fallback_rejected: transcriptTruth?.fallbackRejected === true,
    retrieval_status: code === 'CANONICAL_TRANSCRIPT_READ_UNAVAILABLE' ? 'read_unavailable' : 'blocked',
    blocked_reason: transcriptTruth?.reason || null,
  };
  const failureRuntimeReceipt = {
    created_at: new Date().toISOString(),
    user_id: userId || null,
    auth: authReceipt,
    construct_id: constructId,
    effective_construct_id: constructId,
    effective_construct_name: receiptConstructName,
    orchestration_mode: gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
    route_mode: 'vvault_message',
    persistence_owner: 'blocked_transcript_truth',
    continuity: continuityReceipt,
    ...continuityReceipt,
    transcript_truth: transcriptTruthReceipt,
    capsule_runtime: {
      capsuleLoaded: null,
      capsuleSource: null,
      contextProfile: null,
      continuityFromRuntimeState: continuityReceipt.continuityRestored === true,
      continuityMemorySource: null,
    },
    identity: {
      source: 'identity_bundle_preflight',
      base_prompt_source: 'identity_bundle_preflight',
      conditioning_appended: false,
      identity_bundle_hash: null,
      effective_construct_id: constructId,
      effective_construct_name: receiptConstructName,
      selected_construct_id: canonicalConstructId || constructId,
      raw_construct_id: rawConstructId,
      preflight: null,
    },
    memory: {
      retrieval_ran: false,
      memory_query_detected: false,
      evidence_count: 0,
      ledger_sessions: 0,
      memory_profile: gptConfig?.memoryProfile || gptConfig?.memory_profile || 'off',
      voice_exemplar_sources: [],
      voice_exemplar_count: 0,
      supabase_accessed: false,
      voice_exemplar_retrieval: null,
      verified_memory_retrieval: null,
      vector_retrieval: null,
      memory_source: 'blocked_transcript_truth',
      context_profile: null,
      included_sections: [],
      delayed_sections: [],
      no_rewrite_identity_anchor: false,
      identity_rewrite_prevented_by: null,
      context_recovery_profile: 'blocked_transcript_truth',
      history_source: transcriptTruth?.hydrationSource || 'none',
      remote_history_skipped: false,
      sources: null,
      transcript_memory_status: 'blocked',
      transcript_sources: transcriptTruth?.evidenceSources || [],
    },
    provider: {
      final_provider: null,
      provider: null,
      model: null,
      mode: gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
      fallback_used: false,
    },
    persistence: {
      attempted: false,
      status: 'skipped',
      code,
      reason: transcriptTruth?.reason || 'transcript_truth_preflight_failed',
      message: error,
      error,
      timeout_ms: null,
      bounded: false,
      stage: null,
      ...buildCanonicalPersistenceSemantics({
        failureClassification: 'blocked_transcript_truth',
        upstreamWriteBlocked: false,
      }),
    },
    fidelity: {
      identity_coherence: {
        status: 'skipped',
        reasons: [error],
        signals: [],
        violations: [],
        repair_attempted: false,
        repair_applied: false,
        persist_canonical: false,
        owner_file: 'server/routes/vvault.js',
        source_anchor: 'server/routes/vvault.js:buildTranscriptTruthFailurePayload',
      },
      transcript_law_governance: {
        status: 'fail',
        requested_fact: null,
        reasons: [error],
        signals: [],
        grounding_verdict: 'blocked_transcript_truth',
        retrieval_ran: false,
        evidence_count: Number(transcriptTruth?.evidenceCount || 0),
        transcript_sources: transcriptTruth?.evidenceSources || [],
        evidence_sources: transcriptTruth?.evidenceSources || [],
        voice_exemplar_sources: [],
        voice_exemplar_count: 0,
        transcript_memory_status: 'blocked',
        capsule_source: null,
        capsule_loaded: false,
        source_grounded: false,
        repair_attempted: false,
        repair_applied: false,
        final_answer_source: 'blocked_transcript_truth',
        blocked_canonical_persistence: true,
        persist_canonical: false,
        owner_file: 'server/routes/vvault.js',
        source_anchor: 'server/routes/vvault.js:buildTranscriptTruthFailurePayload',
      },
    },
  };
  const failureChecklist = buildOrchestrationChecklist({
    userId,
    user,
    constructId,
    threadId: sessionId || threadId || `${constructId}_chat_with_${constructId}`,
    userMessage: message,
    gptConfig: {
      name: receiptConstructName,
      orchestrationMode: gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
      memoryProfile: gptConfig?.memoryProfile || gptConfig?.memory_profile || 'off',
    },
    enrichedContext: {
      phaseTiming: {
        identity: { source: 'identity_bundle_preflight' },
        basePromptSource: 'identity_bundle_preflight',
        conditioningInjected: false,
        contextRecovery: {
          profile: 'blocked_transcript_truth',
          historySource: transcriptTruth?.hydrationSource || 'none',
        },
        memorySearch: { skipped: true, reason: 'blocked_transcript_truth' },
        knowledge: { skipped: true, reason: 'blocked_transcript_truth' },
        capsule: { source: null },
      },
      capabilityManifest: {
        enabled: { proactiveInitiation: false },
        state: { selfpromptOn: false },
      },
      context_profile: null,
      context_budget: {
        profile: null,
        included_sections: [],
        delayed_sections: ['transcript_truth'],
      },
      evidence_count: 0,
      memory_retrieval_ran: false,
      memory_query_detected: false,
      capsuleLoaded: false,
    },
    retrievalDiagnostics: {
      evidence_count: 0,
      retrieval_counts: { vector: 0, verified: 0, needle: 0, transcript: 0 },
      phase_timing: {},
    },
    promptDiagnostics: {
      route: '/api/vvault/message',
      mode: 'transcript_truth_failure',
      constructId,
      prompt_source: 'transcript_truth_failure',
      base_prompt_source: 'identity_bundle_preflight',
      basePromptSource: 'identity_bundle_preflight',
      conditioning_appended: false,
      preview_mode: Boolean(previewMode),
      skip_persistence: true,
      final_history_count: 0,
      prompt_chars: 0,
    },
    providerTrace: {
      final_provider: null,
      fallback_used: false,
      attempts: [],
    },
    validatorDebug: {},
    runtimeReceipt: failureRuntimeReceipt,
    contextMode: 'blocked_transcript_truth',
    relationalTurn: false,
    lowComplexityTurn: false,
    hasImages,
    skipPersistence: true,
    previewMode,
    requestedConstructId: rawConstructId,
    canonicalConstructId: canonicalConstructId || constructId,
    responseStatus,
  });

  return {
    ok: false,
    success: false,
    constructId,
    construct_id: constructId,
    code,
    error,
    message: error,
    runtime_receipt: failureRuntimeReceipt,
    orchestration_checklist: failureChecklist,
    has_images: hasImages,
  };
}

function buildCanonicalPersistenceSemantics({
  failureClassification = null,
  upstreamWriteBlocked = null,
} = {}) {
  return {
    canonical_target: 'vvault_body_transcripts',
    canonical_target_table: 'ovvaults.transcripts',
    canonical_write_path: 'vvault_api:/api/chatty/transcript/:constructId/message',
    route_side_canonical_failover_available: false,
    route_side_canonical_failover_reason: null,
    connector_fallback_storage: 'local_deferred_fallback',
    connector_fallback_counts_as_canonical: false,
    failure_classification: failureClassification,
    upstream_write_blocked: upstreamWriteBlocked,
  };
}

function isLikelyEmailAddress(value) {
  return typeof value === 'string' && /\S+@\S+\.\S+/.test(value.trim());
}

function buildConversationLookupContext({
  userEmail = null,
  supabaseUserId = null,
  userId = null,
} = {}) {
  const normalizedEmail = isLikelyEmailAddress(userEmail) ? userEmail.trim() : null;
  const rawSupabaseUserId = String(supabaseUserId || '').trim();
  const normalizedSupabaseUserId = UUID_LOOKUP_RE.test(rawSupabaseUserId)
    ? rawSupabaseUserId
    : null;
  const normalizedUserId = String(userId || '').trim() || normalizedEmail || normalizedSupabaseUserId || null;
  return {
    userEmail: normalizedEmail,
    supabaseUserId: normalizedSupabaseUserId,
    userId: normalizedUserId,
  };
}

async function lookupChattyRouteEmailRecord(queryFactory, timeoutMs) {
  let timeoutId = null;
  try {
    const queryPromise = Promise.resolve().then(queryFactory);
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve({ __timedOut: true }), timeoutMs);
    });
    const result = await Promise.race([queryPromise, timeoutPromise]);
    return result?.__timedOut ? null : result;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function resolveCanonicalRouteUserEmail({
  req,
  authenticatedUserId = null,
  dataOwnerUserId = null,
  preferredEmail = null,
  ignoreRequestEmail = false,
} = {}) {
  if (isLikelyEmailAddress(preferredEmail)) {
    return preferredEmail.trim();
  }

  const directCandidates = [
    ignoreRequestEmail ? null : req?.user?.email,
    req?.sharedAuthUser?.email,
  ];
  for (const candidate of directCandidates) {
    if (isLikelyEmailAddress(candidate)) {
      return candidate.trim();
    }
  }

  const readyState = Number(
    User?.db?.readyState ??
      User?.collection?.conn?.readyState ??
      0
  );
  if (readyState !== 1) {
    return null;
  }

  const lookupIds = Array.from(new Set(
    [
      authenticatedUserId,
      dataOwnerUserId,
      req?.user?.id,
      req?.user?.sub,
      req?.user?.uid,
    ]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean)
  ));

  if (!lookupIds.length) {
    return null;
  }

  const timeoutMs = normalizeTimeoutMs(
    process.env.VVAULT_REQUEST_USER_EMAIL_LOOKUP_TIMEOUT_MS,
    500,
  );

  for (const lookupId of lookupIds) {
    const registryProfile = await lookupChattyRouteEmailRecord(
      () => getUserProfile(lookupId),
      timeoutMs,
    );
    if (isLikelyEmailAddress(registryProfile?.email)) {
      return registryProfile.email.trim();
    }

    const byLegacyId = await lookupChattyRouteEmailRecord(
      () => User.findOne({ id: lookupId }).select('email').lean().exec(),
      timeoutMs,
    );
    if (isLikelyEmailAddress(byLegacyId?.email)) {
      return byLegacyId.email.trim();
    }

    if (/^[0-9a-f]{24}$/i.test(lookupId)) {
      const byObjectId = await lookupChattyRouteEmailRecord(
        () => User.findById(lookupId).select('email').lean().exec(),
        timeoutMs,
      );
      if (isLikelyEmailAddress(byObjectId?.email)) {
        return byObjectId.email.trim();
      }
    }
  }

  return null;
}

function classifyTranscriptPersistenceFailure(details = {}) {
  if (details?.reason === 'write_transcript_unavailable') {
    return {
      failureClassification: 'route_write_path_unavailable',
      upstreamWriteBlocked: false,
    };
  }

  return {
    failureClassification: 'upstream_write_unavailability',
    upstreamWriteBlocked: true,
  };
}

function buildTranscriptPersistenceFailurePayload({
  userId,
  user,
  constructId,
  rawConstructId,
  canonicalConstructId,
  message,
  threadId,
  sessionId,
  hasImages,
  previewMode,
  gptConfig,
  enrichedContext,
  retrievalDiagnostics,
  promptDiagnostics,
  providerTrace,
  validatorDebug,
  runtimeReceipt,
  details,
}) {
  const persistenceClassification = classifyTranscriptPersistenceFailure(details);
  const failureRuntimeReceipt = {
    ...runtimeReceipt,
    persistence_owner: 'blocked_transcript_persistence',
    persistence: {
      attempted: true,
      status: 'fail',
      code: details?.code || 'TRANSCRIPT_PERSISTENCE_UNAVAILABLE',
      reason: details?.reason || 'transcript_persistence_failed',
      message: details?.message || 'Transcript persistence temporarily unavailable.',
      error: details?.error || 'Transcript persistence temporarily unavailable.',
      timeout_ms: details?.timeout_ms || null,
      bounded: Boolean(details?.bounded),
      stage: details?.stage || null,
      partial_write_risk: Boolean(details?.partial_write_risk),
      roles: Array.isArray(details?.roles) ? details.roles : [],
      ...buildCanonicalPersistenceSemantics(persistenceClassification),
    },
    fidelity: {
      ...(runtimeReceipt?.fidelity || {}),
      identity_coherence: {
        ...(runtimeReceipt?.fidelity?.identity_coherence || {}),
        blocked_canonical_persistence: true,
        persist_canonical: false,
      },
    },
  };

  const failureChecklist = buildOrchestrationChecklist({
    userId,
    user,
    constructId,
    threadId: sessionId || threadId || `${constructId}_chat_with_${constructId}`,
    userMessage: message,
    gptConfig,
    enrichedContext,
    retrievalDiagnostics,
    promptDiagnostics,
    providerTrace,
    validatorDebug,
    runtimeReceipt: failureRuntimeReceipt,
    contextMode: enrichedContext?.context_recovery_profile || 'standard',
    relationalTurn: false,
    lowComplexityTurn: true,
    hasImages,
    skipPersistence: false,
    previewMode,
    requestedConstructId: rawConstructId,
    canonicalConstructId: canonicalConstructId || constructId,
    responseStatus: 'transcript_persistence_failed',
  });

  return {
    ok: false,
    success: false,
    constructId,
    construct_id: constructId,
    code: details?.code || 'TRANSCRIPT_PERSISTENCE_UNAVAILABLE',
    error: details?.error || 'Transcript persistence temporarily unavailable.',
    message: details?.message || 'Transcript persistence temporarily unavailable.',
    provider_used: runtimeReceipt?.provider?.final_provider || runtimeReceipt?.provider?.provider || null,
    model: runtimeReceipt?.provider?.model || null,
    runtime_receipt: failureRuntimeReceipt,
    orchestration_checklist: failureChecklist,
    has_images: hasImages,
  };
}

function sendSerializedJson(res, statusCode, payload, label = 'response') {
  try {
    const body = JSON.stringify(payload);
    console.log(`📤 [VVAULT Proxy] Sending ${label} (${statusCode}) with ${Buffer.byteLength(body, 'utf8')} bytes`);
    return res
      .status(statusCode)
      .type('application/json; charset=utf-8')
      .send(body);
  } catch (error) {
    console.error(`❌ [VVAULT Proxy] Failed to serialize ${label}:`, error?.message || String(error));
    const fallbackPayload = {
      ok: false,
      success: false,
      code: payload?.code || 'SERIALIZATION_FAILED',
      error: payload?.error || 'Failed to serialize response payload.',
      message: payload?.message || 'Failed to serialize response payload.',
      construct_id: payload?.construct_id || payload?.constructId || null,
      runtime_receipt: payload?.runtime_receipt
        ? {
            construct_id: payload.runtime_receipt.construct_id || null,
            persistence_owner: payload.runtime_receipt.persistence_owner || null,
            persistence: payload.runtime_receipt.persistence || null,
          }
        : null,
      orchestration_checklist: payload?.orchestration_checklist
        ? {
            responseStatus: payload.orchestration_checklist.responseStatus || null,
            overallStatus: payload.orchestration_checklist.overallStatus || null,
            summary: payload.orchestration_checklist.summary || null,
          }
        : null,
      has_images: payload?.has_images ?? false,
    };
    const fallbackBody = JSON.stringify(fallbackPayload);
    console.log(`📤 [VVAULT Proxy] Sending fallback ${label} (${statusCode}) with ${Buffer.byteLength(fallbackBody, 'utf8')} bytes`);
    return res
      .status(statusCode)
      .type('application/json; charset=utf-8')
      .send(fallbackBody);
  }
}

async function buildEnrichedContextPromptWithRecovery({
  res,
  authReceipt,
  userId,
  user,
  constructId,
  rawConstructId,
  canonicalConstructId,
  message,
  gptConfig,
  threadId,
  sessionId,
  timezone,
  systemPromptOverride,
  previewMode = false,
  previewDraft = null,
  suppressedSystemPromptOverride = false,
  identityBundle = null,
  requestedSeat = null,
  hasImages = false,
  skipPersistence = false,
  contextBudgetProfile = null,
  codingIntent = false,
  policyOrReceiptIntent = false,
  suppressTranscriptLawIntent = false,
  runtimeTurnState = null,
  continuityClass = null,
  continuityResume = null,
}) {
  const contextArgs = {
    userId,
    constructId,
    userMessage: message,
    systemPromptOverride,
    gptConfig,
    user,
    threadId: threadId || sessionId || `${constructId}_chat_with_${constructId}`,
    timezone,
    previewMode,
    previewDraft,
    suppressedSystemPromptOverride,
    identityBundle,
    requestedSeat,
    hasImages,
    contextBudgetProfile,
    codingIntent,
    policyOrReceiptIntent,
    suppressTranscriptLawIntent,
    runtimeTurnState,
    continuityClass,
    continuityResume,
  };

  const boundedZenSmalltalkContext = shouldUseBoundedZenSmalltalkContext({
    constructId,
    requestedSeat,
    userMessage: message,
    previewMode,
    hasImages,
  });

  if (!boundedZenSmalltalkContext) {
    return buildEnrichedContextPrompt(contextArgs);
  }

  const timeoutMs = normalizeTimeoutMs(process.env.ZEN_BOUNDED_CONTEXT_TIMEOUT_MS, 6000);
  const outcome = await withRouteTimeoutResult(
    buildEnrichedContextPrompt(contextArgs),
    timeoutMs,
    'bounded_zen_smalltalk_context',
  );

  if (outcome.status === 'ok') {
    return outcome.value;
  }

  const payload = buildContextBuildFailurePayload({
    authReceipt,
    userId,
    user,
    constructId,
    rawConstructId,
    canonicalConstructId,
    gptConfig,
    message,
    threadId,
    sessionId,
    hasImages,
    previewMode,
    skipPersistence,
    identityBundle,
    details: {
      status: outcome.status,
      timeout_ms: timeoutMs,
      reason: outcome.status === 'timeout' ? 'bounded_zen_smalltalk_context_timeout' : 'bounded_zen_smalltalk_context_error',
      recovery_profile: 'zen_smalltalk_bounded',
      remote_history_skipped: true,
      error: outcome.error || 'Context build temporarily unavailable',
    },
  });
  console.error(`❌ [VVAULT Proxy] Context build failed for ${constructId}:`, payload.details);
  res.status(503).json(payload);
  return null;
}

// tool-events route defined AFTER requireAuth below

// OpenRouter client for fallback when VVAULT API is unavailable
// Primary: user's own OpenRouter key; Fallback: Replit AI Integrations (managed, billed to credits)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const openrouter = OPENROUTER_API_KEY ? new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: OPENROUTER_API_KEY,
}) : null;

// Replit-managed OpenRouter client (fallback when user's key fails)
const REPLIT_OPENROUTER_KEY = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
const replitOpenrouter = REPLIT_OPENROUTER_KEY ? new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
  apiKey: REPLIT_OPENROUTER_KEY,
}) : null;

// ---- Supabase AIS metadata loader ----
async function loadAIMetadata(constructCallsign, userId) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  if (!constructCallsign) return null;
  try {
    const canonical = canonicalizeConstructId(constructCallsign);
    const { data, error } = await supabase
      .from('ais')
      .select('id, construct_call_sign, model, provider, tags, categories, capabilities, system_prompt_override, config_json, avatar_url')
      .or(`id.eq.${canonical},construct_call_sign.eq.${canonical}`)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('⚠️ [VVAULT Metadata] Supabase fetch failed:', error.message);
      return null;
    }
    const isZen = canonical === 'zen-001';
    if (!data && isZen) {
      return {
        id: null,
        constructCallsign: canonical,
        model: null,
        provider: null,
        tags: ['coding'],
        categories: ['developer-tools'],
        capabilities: ['coding', 'analysis'],
        systemPromptOverride: null,
        configJson: null,
        avatarUrl: null,
        coderModel: DEFAULT_CODER_MODEL,
        coderProvider: DEFAULT_CODER_PROVIDER,
      };
    }
    if (!data) return null;
    const caps = typeof data.capabilities === 'string' ? (() => { try { return JSON.parse(data.capabilities); } catch { return data.capabilities; } })() : data.capabilities || {};
    const configJson = typeof data.config_json === 'string' ? (() => { try { return JSON.parse(data.config_json); } catch { return null; } })() : data.config_json || null;
    const defaultCaps = isZen ? ['coding', 'analysis'] : [];
    const normalizedCaps = Array.isArray(caps)
      ? caps
      : typeof caps === 'object' && caps !== null
        ? Object.keys(caps).filter(Boolean)
        : [];
    const mergedCaps = Array.from(new Set([...(normalizedCaps || []), ...defaultCaps])).filter(Boolean);
    const mergedTags = Array.from(new Set([...(data.tags || []), ...(isZen ? ['coding'] : [])])).filter(Boolean);
    const mergedCategories = Array.from(new Set([...(data.categories || []), ...(isZen ? ['developer-tools'] : [])])).filter(Boolean);

    let coderModel = configJson?.coderModel || null;
    let coderProvider = configJson?.coderProvider || null;
    if (!coderModel && isZen) {
      coderModel = DEFAULT_CODER_MODEL;
    }
    if (!coderProvider && isZen) {
      coderProvider = process.env.DEFAULT_CODER_PROVIDER || 'openrouter';
    }

    return {
      id: data.id,
      constructCallsign: data.construct_call_sign || canonical,
      model: data.model || null,
      provider: data.provider || null,
      tags: mergedTags,
      categories: mergedCategories,
      capabilities: mergedCaps,
      systemPromptOverride: data.system_prompt_override || null,
      configJson,
      avatarUrl: data.avatar_url || null,
      coderModel,
      coderProvider,
    };
  } catch (err) {
    console.warn('⚠️ [VVAULT Metadata] Error loading AIS metadata:', err.message);
    return null;
  }
}

async function loadLocalAIMetadata(constructCallsign, candidateUserIds = []) {
  const canonical = canonicalizeConstructId(constructCallsign);
  if (!canonical) return null;
  const aiManager = AIManager.getInstance();
  const candidates = Array.from(
    new Set(
      candidateUserIds
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  );

  for (const candidateUserId of candidates) {
    const ai = await aiManager.getAIByCallsign(canonical, candidateUserId);
    if (!ai) continue;
    return {
      id: ai.id,
      constructCallsign: ai.constructCallsign || canonical,
      model: ai.modelId || ai.conversationModel || null,
      provider: ai.provider || null,
      tags: ai.tags || [],
      categories: ai.categories || [],
      capabilities: ai.capabilities || {},
      systemPromptOverride: ai.instructions || null,
      configJson: ai.configJson || null,
      avatarUrl: ai.avatarUrl || ai.avatar || null,
      coderModel: ai.codingModel || null,
      coderProvider: ai.provider || null,
    };
  }

  return null;
}

async function loadAIMetadataWithRecovery({
  constructId,
  userId,
  authenticatedUserId = null,
  userMessage,
  requestedSeat = null,
  previewMode = false,
  hasImages = false,
}) {
  const boundedZenSmalltalkMetadata = shouldUseBoundedZenSmalltalkContext({
    constructId,
    requestedSeat,
    userMessage,
    previewMode,
    hasImages,
  });
  const isSyntheticZenMetadataStub = (meta) => (
    Boolean(meta) &&
    canonicalizeConstructId(meta.constructCallsign || constructId) === 'zen-001' &&
    meta.id == null
  );

  async function loadLocalFallback(profile, baseRecovery = {}) {
    const localMeta = await loadLocalAIMetadata(constructId, [authenticatedUserId, userId]);
    if (!localMeta) {
      return {
        meta: null,
        recovery: {
          attempted: true,
          applied: false,
          profile,
          status: 'local_ai_record_missing',
          timeout_ms: baseRecovery.timeout_ms ?? null,
          reason: baseRecovery.reason || null,
          error: baseRecovery.error || null,
          fallback_source: null,
        },
      };
    }

    return {
      meta: localMeta,
      recovery: {
        attempted: true,
        applied: true,
        profile,
        status: 'local_ai_record',
        timeout_ms: baseRecovery.timeout_ms ?? null,
        reason: baseRecovery.reason || null,
        error: baseRecovery.error || null,
        fallback_source: 'local_ai_record',
      },
    };
  }

  if (!boundedZenSmalltalkMetadata) {
    const primaryMeta = await loadAIMetadata(constructId, userId);
    if (primaryMeta) {
      if (isSyntheticZenMetadataStub(primaryMeta)) {
        const localFallback = await loadLocalFallback('standard', {
          reason: 'supabase_zen_stub',
        });
        if (localFallback.meta) {
          return localFallback;
        }
      }
      return {
        meta: primaryMeta,
        recovery: {
          attempted: false,
          applied: false,
          profile: 'standard',
          status: 'not_needed',
          timeout_ms: null,
          fallback_source: null,
        },
      };
    }

    return loadLocalFallback('standard');
  }

  const timeoutMs = normalizeTimeoutMs(process.env.ZEN_BOUNDED_METADATA_TIMEOUT_MS, 2500);
  const outcome = await withRouteTimeoutResult(
    loadAIMetadata(constructId, userId),
    timeoutMs,
    'bounded_zen_smalltalk_metadata',
  );

  if (outcome.status === 'ok' && outcome.value) {
    if (isSyntheticZenMetadataStub(outcome.value)) {
      const localFallback = await loadLocalFallback('zen_smalltalk_bounded', {
        timeout_ms: timeoutMs,
        reason: 'bounded_zen_smalltalk_metadata_stub',
      });
      if (localFallback.meta) {
        return localFallback;
      }
    }
    return {
      meta: outcome.value,
      recovery: {
        attempted: true,
        applied: false,
        profile: 'zen_smalltalk_bounded',
        status: 'ok',
        timeout_ms: timeoutMs,
        fallback_source: null,
      },
    };
  }

  console.warn(`⚠️ [VVAULT Metadata] Bounded Zen smalltalk metadata recovery engaged for ${constructId}:`, {
    status: outcome.status,
    error: outcome.error || null,
    timeoutMs,
  });

  return loadLocalFallback('zen_smalltalk_bounded', {
    timeout_ms: timeoutMs,
    reason: outcome.status === 'timeout'
      ? 'bounded_zen_smalltalk_metadata_timeout'
      : outcome.status === 'ok'
        ? 'bounded_zen_smalltalk_metadata_empty'
        : 'bounded_zen_smalltalk_metadata_error',
    error: outcome.error || null,
  });
}

// Identity projection endpoint (service token or user auth)
router.get('/constructs/:constructCallsign/identity-projection', requirePreferredAuthOrServiceToken, async (req, res) => {
  try {
    const constructCallsign = req.params.constructCallsign;
    if (!constructCallsign) return res.status(400).json({ ok: false, error: 'Missing constructCallsign' });
    const projection = await loadProjectionFromVault(constructCallsign);
    res.json(projection);
  } catch (error) {
    console.error('❌ [VVAULT] identity-projection failed:', error);
    res.status(500).json({ ok: false, error: error.message || 'Identity projection failed' });
  }
});

// Fast, batched identity fetch for GPTCreator hydration
router.get('/constructs/:constructCallsign/identity-compact', requirePreferredAuthOrServiceToken, async (req, res) => {
  try {
    const constructCallsign = canonicalizeConstructId(req.params.constructCallsign);
    if (!constructCallsign) return res.status(400).json({ ok: false, error: 'Missing constructCallsign' });
    const bust = req.query.bust === '1';
    if (bust) clearCanonicalConstructIdentityCache(constructCallsign);
    const cached = !bust ? cacheGet(identityCompactCache, constructCallsign) : null;
    if (cached) {
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.json(cached);
    }

    const { supabaseUserId } = await resolveVvaultRequestUser(req).catch(() => ({ supabaseUserId: null }));
    const identity = await loadCanonicalConstructIdentity({
      constructId: constructCallsign,
      supabaseUserId: supabaseUserId || null,
    });

    const out = {
      ok: identity.exists,
      callsign: constructCallsign,
      name: identity.name || null,
      description: identity.description || null,
      instructions: identity.instructions || null,
      conditioning: identity.conditioning || null,
      physicalFeatures: identity.physicalFeatures || null,
      definition: identity.definition || null,
      voice: identity.voice || null,
      hasAvatar: Boolean(identity.avatarDescriptor),
      updatedAt: identity.updatedAt || new Date().toISOString(),
    };

    cacheSet(identityCompactCache, constructCallsign, out, DEFAULT_TTL_MS);
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.json(out);
  } catch (error) {
    console.error('❌ [VVAULT] identity-compact failed:', error);
    res.status(500).json({ ok: false, error: error.message || 'Identity compact failed' });
  }
});

// Lightweight knowledge summary for preview hydration
router.get('/constructs/:constructCallsign/files/summary', requirePreferredAuthOrServiceToken, async (req, res) => {
  try {
    const constructCallsign = canonicalizeConstructId(req.params.constructCallsign);
    if (!constructCallsign) return res.status(400).json({ ok: false, error: 'Missing constructCallsign' });
    const bust = req.query.bust === '1';
    const cached = !bust ? cacheGet(filesSummaryCache, constructCallsign) : null;
    if (cached) {
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.json(cached);
    }

    const { supabaseUserId } = await resolveRequestUser(req).catch(() => ({ supabaseUserId: null }));
    const summary = await loadCanonicalFilesSummary({
      constructId: constructCallsign,
      supabaseUserId: supabaseUserId || null,
    });

    cacheSet(filesSummaryCache, constructCallsign, summary, DEFAULT_TTL_MS);
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.json(summary);
  } catch (error) {
    console.error('❌ [VVAULT] files summary failed:', error);
    res.status(500).json({ ok: false, error: error.message || 'Files summary failed' });
  }
});

// Canonical construct editor payload for GPTCreator (same-origin, Supabase-backed)
router.get('/constructs/:constructCallsign/editor', requireAuthOrServiceToken, async (req, res) => {
  try {
    const constructCallsign = canonicalizeConstructId(req.params.constructCallsign);
    if (!constructCallsign) {
      return res.status(400).json({ ok: false, error: 'Missing constructCallsign' });
    }

    const { supabaseUserId } = await resolveRequestUser(req).catch(() => ({ supabaseUserId: null }));
    const identity = await loadCanonicalConstructIdentity({
      constructId: constructCallsign,
      supabaseUserId: supabaseUserId || null,
    });
    if (!identity.exists) {
      return res.status(404).json({ ok: false, error: 'Construct not found' });
    }

    let filesSummary = {
      totalCount: 0,
      totalBytes: 0,
      sampleFilenames: [],
      updatedAt: identity.updatedAt || new Date().toISOString(),
    };
    try {
      // Prefer user-scoped summary, then widen to construct-wide rows.
      const userScoped = await loadCanonicalFilesSummary({
        constructId: constructCallsign,
        supabaseUserId: supabaseUserId || null,
      });
      if (userScoped?.ok && Number(userScoped.totalCount || 0) > 0) {
        filesSummary = userScoped;
      } else {
        const globalScoped = await loadCanonicalFilesSummary({
          constructId: constructCallsign,
          supabaseUserId: null,
        });
        if (globalScoped?.ok) filesSummary = globalScoped;
      }
    } catch (summaryErr) {
      console.warn('⚠️ [VVAULT] canonical editor files summary fallback:', summaryErr?.message || summaryErr);
    }

    const avatarUrl =
      identity.avatarDescriptor?.signedUrl ||
      (identity.avatarDescriptor
        ? `/api/ais/${encodeURIComponent(constructCallsign)}/avatar${identity.avatarDescriptor?.sha256 ? `?v=${identity.avatarDescriptor.sha256}` : ''}`
        : null);

    let modelConfig = {
      primary: identity.modelId || '',
      conversation: identity.conversationModel || '',
      creative: identity.creativeModel || '',
      coding: identity.codingModel || '',
    };
    try {
      const gptConfig = await gptManager.getGPTByCallsign(constructCallsign);
      if (gptConfig) {
        modelConfig = {
          primary: gptConfig.modelId || modelConfig.primary,
          conversation: gptConfig.conversationModel || gptConfig.modelId || modelConfig.conversation,
          creative: gptConfig.creativeModel || modelConfig.creative,
          coding: gptConfig.codingModel || modelConfig.coding,
        };
      }
    } catch (modelErr) {
      console.warn(`⚠️ [VVAULT] construct editor model lookup fallback for ${constructCallsign}:`, modelErr?.message || modelErr);
    }

    return res.json({
      ok: true,
      constructId: constructCallsign,
      callsign: constructCallsign,
      displayName: identity.name || constructCallsign,
      description: identity.description || '',
      instructions: identity.instructions || '',
      conversationStarters: identity.conversationStarters || [],
      conditioning: identity.conditioning || '',
      definition: identity.definition || '',
      physicalFeatures: identity.physicalFeatures || '',
      voice: identity.voice || '',
      gender: identity.gender || '',
      avatar: {
        exists: Boolean(identity.avatarDescriptor),
        filename: identity.avatarDescriptor?.filename || null,
        url: avatarUrl,
        sha256: identity.avatarDescriptor?.sha256 || null,
        contentType: identity.avatarDescriptor?.contentType || null,
      },
      filesSummary: {
        totalCount: Number(filesSummary.totalCount || 0),
        totalBytes: Number(filesSummary.totalBytes || 0),
        sampleFilenames: Array.isArray(filesSummary.sampleFilenames) ? filesSummary.sampleFilenames : [],
        updatedAt: filesSummary.updatedAt || identity.updatedAt || new Date().toISOString(),
      },
      models: modelConfig,
      capabilities: identity.capabilities || {
        webSearch: false,
        canvas: false,
        imageGeneration: false,
        codeInterpreter: false,
      },
      updatedAt: identity.updatedAt || new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ [VVAULT] construct editor failed:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Construct editor failed' });
  }
});

// Canonical construct editor write endpoint for GPTCreator identity fields
router.put('/constructs/:constructCallsign/editor', requireAuthOrServiceToken, async (req, res) => {
  const lockCheck = assertNotLockedSync();
  if (!lockCheck.allowed) {
    return res.status(503).json({
      ok: false,
      error: "VVAULT_RUNTIME_LOCKED",
      message: lockCheck.reason || "VVAULT runtime is locked; writes are disabled.",
    });
  }

  try {
    const constructCallsign = canonicalizeConstructId(req.params.constructCallsign);
    if (!constructCallsign) {
      return res.status(400).json({ ok: false, error: 'Missing constructCallsign' });
    }

    const {
      conditioning,
      physicalFeatures,
      definition,
      voice,
      gender,
    } = req.body || {};

    const providedFields = {
      conditioning,
      physicalFeatures,
      definition,
      voice,
      gender,
    };

    for (const [fieldName, fieldValue] of Object.entries(providedFields)) {
      if (fieldValue !== undefined && typeof fieldValue !== 'string') {
        return res.status(400).json({
          ok: false,
          error: `${fieldName} must be a string when provided`,
        });
      }
    }

    const { supabaseUserId } = await resolveRequestUser(req).catch(() => ({ supabaseUserId: null }));
    if (!supabaseUserId) {
      return res.status(400).json({
        ok: false,
        error: 'Failed to resolve Supabase user ID',
      });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({
        ok: false,
        error: 'Supabase client not initialized',
      });
    }

    const upsertIdentityFile = async (filename, content) => {
      const { data: existing, error: selectError } = await supabase
        .from('vault_files')
        .select('id')
        .eq('user_id', supabaseUserId)
        .eq('filename', filename)
        .maybeSingle();

      if (selectError) throw selectError;

      if (existing?.id) {
        const { error: updateError } = await supabase
          .from('vault_files')
          .update({
            content,
            file_type: 'identity',
            construct_id: constructCallsign,
          })
          .eq('id', existing.id);
        if (updateError) throw updateError;
        return;
      }

      const { error: insertError } = await supabase
        .from('vault_files')
        .insert({
          user_id: supabaseUserId,
          construct_id: constructCallsign,
          filename,
          file_type: 'identity',
          content,
        });
      if (insertError) throw insertError;
    };

    const saved = {
      conditioning: false,
      physicalFeatures: false,
      definition: false,
      voice: false,
      gender: false,
    };

    if (conditioning !== undefined) {
      await upsertIdentityFile(
        `instances/${constructCallsign}/identity/conditioning.txt`,
        conditioning,
      );
      saved.conditioning = true;
    }

    if (physicalFeatures !== undefined) {
      let physicalFeaturesContent = physicalFeatures;
      try {
        const lines = physicalFeatures
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        const keyValueObject = {};
        let parseable = lines.length > 0;
        for (const line of lines) {
          const separatorIndex = line.indexOf(':');
          if (separatorIndex <= 0) {
            parseable = false;
            break;
          }
          const key = line.slice(0, separatorIndex).trim();
          const value = line.slice(separatorIndex + 1).trim();
          if (!key) {
            parseable = false;
            break;
          }
          keyValueObject[key] = value;
        }
        if (parseable && Object.keys(keyValueObject).length > 0) {
          physicalFeaturesContent = JSON.stringify(keyValueObject, null, 2);
        }
      } catch {}

      await upsertIdentityFile(
        `instances/${constructCallsign}/identity/physical_features.json`,
        physicalFeaturesContent,
      );
      saved.physicalFeatures = true;
    }

    if (definition !== undefined) {
      await upsertIdentityFile(
        `instances/${constructCallsign}/identity/definition.json`,
        definition,
      );
      saved.definition = true;
    }

    if (voice !== undefined) {
      await upsertIdentityFile(
        `instances/${constructCallsign}/identity/voice.json`,
        JSON.stringify({ text: voice }, null, 2),
      );
      saved.voice = true;
    }

    if (gender !== undefined) {
      await upsertIdentityFile(
        `instances/${constructCallsign}/identity/gender.json`,
        JSON.stringify({ gender }, null, 2),
      );
      saved.gender = true;
    }

    if (Object.values(saved).some(Boolean)) {
      clearCanonicalConstructIdentityCache(constructCallsign);
      clearIdentityCompactCache(constructCallsign);
      clearFilesSummaryCache(constructCallsign);
    }

    return res.json({
      ok: true,
      constructId: constructCallsign,
      saved,
    });
  } catch (error) {
    console.error('❌ [VVAULT] construct editor save failed:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Construct editor save failed' });
  }
});

const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.2-3b-instruct:free';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_DEFAULT_MODEL || 'llama3';
const PREFERRED_OLLAMA_MODEL = process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL;
const PREFER_LOCAL_MODELS = String(process.env.PREFER_LOCAL_MODELS || '').toLowerCase() === 'true';
const NOVA_FAST_OPENROUTER_MODEL = process.env.NOVA_FAST_OPENROUTER_MODEL || process.env.OPENROUTER_FAST_MODEL || 'meta-llama/llama-3.2-3b-instruct:free';
const PROMPT_WARN_CHARS = Number.parseInt(process.env.VVAULT_PROMPT_WARN_CHARS || '', 10) || 24000;
const VISION_HISTORY_LIMIT = Number.parseInt(process.env.VVAULT_VISION_HISTORY_LIMIT || '', 10) || 8;
const VISION_SYSTEM_PROMPT_CAP = Number.parseInt(process.env.VVAULT_VISION_PROMPT_CAP || '', 10) || 5200;
const RELATIONAL_HISTORY_LIMIT = Number.parseInt(process.env.VVAULT_RELATIONAL_HISTORY_LIMIT || '', 10) || 10;
const RELATIONAL_SYSTEM_PROMPT_CAP = Number.parseInt(process.env.VVAULT_RELATIONAL_PROMPT_CAP || '', 10) || 7200;
const RELATIONAL_LENGTH_THRESHOLD = Number.parseInt(process.env.VVAULT_RELATIONAL_LENGTH_THRESHOLD || '', 10) || 120;
const PROTECTED_DIRECTIVES_START = '## [PROTECTED_IDENTITY_DIRECTIVES]';
const PROTECTED_DIRECTIVES_END = '## [/PROTECTED_IDENTITY_DIRECTIVES]';
const VISION_COMPACTED_NOTICE = '[Context compacted for vision request.]';
const RELATIONAL_COMPACTED_NOTICE = '[Context compacted for relational continuity turn.]';

// OpenAI client - prefer direct API key, fall back to Replit AI Integrations
const DIRECT_OPENAI_KEY = process.env.OPENAI_API_KEY;
const openaiClient = DIRECT_OPENAI_KEY ? new OpenAI({
  baseURL: 'https://api.openai.com/v1',
  apiKey: DIRECT_OPENAI_KEY,
}) : (process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_API_KEY !== '_DUMMY_API_KEY_') ? new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1',
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
}) : null;

console.log('🔑 [Provider Keys] Startup credential check:', {
  hasReplitOpenRouterKey: !!REPLIT_OPENROUTER_KEY,
  hasDirectOpenRouterKey: !!OPENROUTER_API_KEY,
  hasOpenAIKey: !!DIRECT_OPENAI_KEY,
  hasAIIntegrationsKey: !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_API_KEY !== '_DUMMY_API_KEY_'),
  replitOpenrouterClient: !!replitOpenrouter,
  openrouterClient: !!openrouter,
  openaiClient: !!openaiClient
});

// GPT Manager singleton for fetching GPT configurations
const gptManager = GPTManager.getInstance();

const MEMORY_INTENT_RE = /\b(remember|recall|when did we|we talked|our conversation|first time|last time)\b/i;
const EXPLICIT_IMAGE_ANALYSIS_RE =
  /\b(describe|analyze|analyse|identify|inspect|caption|ocr|read\s+the\s+text|what(?:'s|\s+is)\s+in|what\s+do\s+you\s+see\s+in)\b.*\b(image|photo|picture|screenshot|attachment)\b|\b(image|photo|picture|screenshot|attachment)\b.*\b(describe|analyze|analyse|identify|inspect|caption|ocr|read\s+the\s+text|what(?:'s|\s+is)\s+in)\b/i;

function hasExplicitImageAnalysisIntent(text) {
  if (!text || typeof text !== 'string') return false;
  return EXPLICIT_IMAGE_ANALYSIS_RE.test(text.toLowerCase());
}

function getImageTurnDefaultUserMessage(constructId) {
  if (constructId === 'nova-001' || constructId === 'nova') {
    return "I just shared an image with you. Stay in character and continue naturally with me. Mention the image only briefly unless I explicitly ask for analysis.";
  }
  return "I just shared an image. Continue naturally in character and mention the image only briefly unless I explicitly ask for analysis.";
}

function compactSystemPromptForVision(systemPrompt, maxChars = VISION_SYSTEM_PROMPT_CAP) {
  if (!systemPrompt || typeof systemPrompt !== 'string' || systemPrompt.length <= maxChars) {
    return { prompt: systemPrompt || '', compacted: false, protectedPreserved: false };
  }

  const startIdx = systemPrompt.indexOf(PROTECTED_DIRECTIVES_START);
  const endIdx = systemPrompt.indexOf(PROTECTED_DIRECTIVES_END);
  const hasProtectedBlock = startIdx >= 0 && endIdx > startIdx;
  let protectedBlock = '';
  let remainder = systemPrompt;

  if (hasProtectedBlock) {
    const endBound = endIdx + PROTECTED_DIRECTIVES_END.length;
    protectedBlock = systemPrompt.slice(startIdx, endBound).trim();
    remainder = `${systemPrompt.slice(0, startIdx)}\n${systemPrompt.slice(endBound)}`.trim();
  }

  // Drop low-priority memory sections first to preserve identity/response contract behavior.
  const lowPrioritySectionPatterns = [
    /\n##\s+(VECTOR MEMORY|VECTOR MEMORIES)[\s\S]*?(?=\n##\s+|$)/gi,
    /\n##\s+(NEEDLE HITS|NEEDLE RESULTS)[\s\S]*?(?=\n##\s+|$)/gi,
    /\n##\s+(VERIFIED MEMORIES|VERIFIED MEMORY)[\s\S]*?(?=\n##\s+|$)/gi,
    /\n##\s+(MEMORY CONTEXT|LIVED MEMORIES|SESSION HISTORY|CONTINUITY TIMELINE)[\s\S]*?(?=\n##\s+|$)/gi,
    /\n##\s+TIME CONTEXT[\s\S]*?(?=\n##\s+|$)/gi,
    /\n##\s+\[MEMORY_GUARDRAIL\][\s\S]*?(?=\n##\s+|$)/gi,
  ];

  let trimmedRemainder = remainder;
  for (const pattern of lowPrioritySectionPatterns) {
    if (trimmedRemainder.length <= maxChars) break;
    trimmedRemainder = trimmedRemainder.replace(pattern, '\n');
  }
  trimmedRemainder = trimmedRemainder.replace(/\n{3,}/g, '\n\n').trim();

  const prefixParts = [];
  if (protectedBlock) prefixParts.push(protectedBlock);
  if (trimmedRemainder) prefixParts.push(trimmedRemainder);
  let merged = prefixParts.join('\n\n').trim();
  if (!merged) merged = systemPrompt.slice(0, maxChars);

  if (merged.length > maxChars) {
    const reserve = VISION_COMPACTED_NOTICE.length + 3;
    const headBudget = Math.max(256, maxChars - reserve);
    merged = `${merged.slice(0, headBudget).trim()}\n\n${VISION_COMPACTED_NOTICE}`;
  }

  return {
    prompt: merged,
    compacted: true,
    protectedPreserved: !!protectedBlock,
  };
}

function compactSystemPromptForRelationalTurn(systemPrompt, maxChars = RELATIONAL_SYSTEM_PROMPT_CAP) {
  if (!systemPrompt || typeof systemPrompt !== 'string') {
    return { prompt: '', compacted: false, protectedPreserved: false };
  }

  const startIdx = systemPrompt.indexOf(PROTECTED_DIRECTIVES_START);
  const endIdx = systemPrompt.indexOf(PROTECTED_DIRECTIVES_END);
  const hasProtectedBlock = startIdx >= 0 && endIdx > startIdx;
  let protectedBlock = '';
  let remainder = systemPrompt;

  if (hasProtectedBlock) {
    const endBound = endIdx + PROTECTED_DIRECTIVES_END.length;
    protectedBlock = systemPrompt.slice(startIdx, endBound).trim();
    remainder = `${systemPrompt.slice(0, startIdx)}\n${systemPrompt.slice(endBound)}`.trim();
  }

  const lowPrioritySectionPatterns = [
    /\n##\s+(KNOWLEDGE CONTEXT|DOCUMENT CONTEXT|CAPABILITY CONTEXT)[\s\S]*?(?=\n##\s+|$)/gi,
    /\n##\s+(VECTOR MEMORY|VECTOR MEMORIES|RECALLED MEMORIES)[\s\S]*?(?=\n##\s+|$)/gi,
    /\n##\s+(NEEDLE HITS|NEEDLE RESULTS|VERIFIED MEMORIES|VERIFIED MEMORY)[\s\S]*?(?=\n##\s+|$)/gi,
    /\n##\s+(LIVED MEMORIES|MEMORY CONTEXT|YOUR SESSION HISTORY|SESSION HISTORY|CONTINUITY TIMELINE)[\s\S]*?(?=\n##\s+|$)/gi,
    /\n##\s+(MEMORY SEARCH RESULT|MEMORY GAP|CITATION|CITATION DIRECTIVE)[\s\S]*?(?=\n##\s+|$)/gi,
    /\n##\s+TIME CONTEXT[\s\S]*?(?=\n##\s+|$)/gi,
    /\n\[TIME_CONTEXT\][\s\S]*?\[\/TIME_CONTEXT\]/gi,
  ];

  let trimmedRemainder = remainder;
  for (const pattern of lowPrioritySectionPatterns) {
    trimmedRemainder = trimmedRemainder.replace(pattern, '\n');
  }
  trimmedRemainder = trimmedRemainder.replace(/\n{3,}/g, '\n\n').trim();

  const identityHeadMatch = trimmedRemainder.match(/^[\s\S]{0,1400}(?=\n##\s+|$)/);
  const identityHead = (identityHeadMatch?.[0] || '').trim();
  const relationalDirective = `## RELATIONAL TURN MODE
This is a low-complexity relational continuity turn.
Respond naturally in first person to the latest user message and continue the existing thread.
Do not output document summaries, policy recitals, profile analysis, or citation-style reports unless explicitly requested.`;

  const parts = [];
  if (protectedBlock) parts.push(protectedBlock);
  parts.push(relationalDirective);
  if (identityHead) parts.push(identityHead);

  let merged = parts.join('\n\n').trim();
  if (!merged) merged = systemPrompt.slice(0, maxChars);

  if (merged.length > maxChars) {
    const reserve = RELATIONAL_COMPACTED_NOTICE.length + 3;
    const headBudget = Math.max(256, maxChars - reserve);
    merged = `${merged.slice(0, headBudget).trim()}\n\n${RELATIONAL_COMPACTED_NOTICE}`;
  }

  return {
    prompt: merged,
    compacted: true,
    protectedPreserved: !!protectedBlock,
  };
}

function isLowComplexityTurn(message, hasImages, historyCount, systemPromptLength) {
  if (hasImages) return false;
  const raw = (message || '').trim();
  if (!raw) return true;

  const normalized = raw.toLowerCase().replace(/[^\w\s']/g, ' ').replace(/\s+/g, ' ').trim();
  const words = normalized ? normalized.split(' ') : [];
  const simplePhrases = new Set([
    'hello',
    'hi',
    'hey',
    'yo',
    'sup',
    'good morning',
    'good afternoon',
    'good evening',
    'how are you',
    'hru',
  ]);

  if (MEMORY_INTENT_RE.test(normalized)) return false;
  if (historyCount > 24) return false;
  if (systemPromptLength > 18000) return false;
  if (simplePhrases.has(normalized)) return true;
  return words.length <= 4 && normalized.length <= 32;
}

/**
 * resolveModelForGPT - Single source of truth for model resolution.
 * 
 * Priority: explicit GPTCreator config first, then provider-availability fallbacks.
 * DEFAULT_OPENROUTER_MODEL is used only when falling back from an explicit model.
 * 
 * @param {object|null} gptConfig - The GPT record from the database (has conversationModel, modelId, etc.)
 * @param {object} availability - Which providers are currently available
 * @param {boolean} availability.openai - Whether OpenAI client is configured
 * @param {boolean} availability.openrouter - Whether OpenRouter client is configured
 * @param {boolean} availability.ollama - Whether Ollama host is configured
 * @returns {{ provider: string, model: string, source: string }}
 */
function resolveModelForGPT(gptConfig, availability = {}) {
  const configured = (gptConfig?.conversationModel || gptConfig?.modelId || '').trim();
  const configuredLower = configured.toLowerCase();
  const isPlaceholder = !configured || configuredLower === 'openrouter/auto' || configuredLower === 'openrouter:auto';
  const preferLocal = PREFER_LOCAL_MODELS && availability.ollama;

  let provider = 'openrouter';
  let model = DEFAULT_OPENROUTER_MODEL;
  let source = isPlaceholder ? 'placeholder_default' : 'default';

  if (isPlaceholder && preferLocal) {
    provider = 'ollama';
    model = PREFERRED_OLLAMA_MODEL;
    source = 'env_local_preference';
  }

  if (!isPlaceholder && configured) {
    source = 'gpt_config';
    if (configured.startsWith('openai:')) {
      provider = 'openai';
      model = configured.substring(7);
    } else if (configured.startsWith('openrouter:')) {
      provider = 'openrouter';
      model = configured.substring(11);
    } else if (configured.startsWith('openrouter/')) {
      provider = 'openrouter';
      model = configured.substring(11);
      source = 'normalized_from_openrouter_slash';
    } else if (configured.startsWith('ollama:')) {
      provider = 'ollama';
      model = configured.substring(7);
    } else if (/^(gpt-|o1-|o3-|davinci|curie|babbage|ada)/.test(configured)) {
      provider = 'openai';
      model = configured;
    } else if (/^[a-z0-9_-]+:[a-z]/.test(configured) && !configured.includes('/')) {
      provider = 'ollama';
      model = configured;
    } else if (!configured.includes('/') && !configured.includes(':')) {
      console.warn(`⚠️ [ModelResolver] Bare model name "${configured}" detected (likely stale Ollama ref), falling back to default`);
      provider = 'openrouter';
      model = DEFAULT_OPENROUTER_MODEL;
      source = 'fallback_from_bare_model';
    } else {
      provider = 'openrouter';
      model = configured;
    }
  }

  const requestedProvider = provider;
  const requestedModel = model;

  if (provider === 'openai' && !availability.openai) {
    if (preferLocal) {
      provider = 'ollama';
      model = PREFERRED_OLLAMA_MODEL;
      source = 'fallback_from_openai_local_first';
    } else {
      provider = 'openrouter';
      model = availability.openrouter ? DEFAULT_OPENROUTER_MODEL : model;
      source = `fallback_from_openai`;
    }
  }
  if (provider === 'ollama' && !availability.ollama) {
    provider = 'openrouter';
    model = availability.openrouter ? DEFAULT_OPENROUTER_MODEL : model;
    source = `fallback_from_ollama`;
  }
  if (provider === 'openrouter' && !availability.openrouter) {
    if (preferLocal) {
      provider = 'ollama';
      model = PREFERRED_OLLAMA_MODEL;
      source = 'fallback_to_ollama_local_first';
    } else if (availability.openai) {
      provider = 'openai';
      model = 'gpt-4o';
      source = 'fallback_to_openai';
    } else if (availability.ollama) {
      provider = 'ollama';
      model = PREFERRED_OLLAMA_MODEL;
      source = 'fallback_to_ollama';
    } else {
      return { provider: null, model: null, source: 'no_provider', error: 'No LLM provider available. Configure OpenAI, OpenRouter, or Ollama.' };
    }
  }

  if (requestedProvider !== provider) {
    console.warn(`⚠️ [ModelResolver] ${requestedProvider}:${requestedModel} unavailable, falling back to ${provider}:${model}`);
  }

  console.log(`🤖 [ModelResolver] Resolved: ${provider}:${model} (source: ${source}${configured ? `, gpt_configured: ${configured}` : ''})`);
  return { provider, model, source };
}

function normalizeProviderError(error, provider) {
  const upstreamStatus = Number(error?.status) || null;
  const providerCode = error?.code || null;
  const message = error?.message || 'Unknown error';
  let hint = null;

  if (provider === 'openrouter' && upstreamStatus === 402) {
    hint = 'OpenRouter credits insufficient; switch to :free model or add credits.';
  } else if (provider === 'openrouter' && upstreamStatus === 401) {
    hint = 'OpenRouter rejected the API key; verify OPENROUTER_API_KEY.';
  } else if (provider === 'openrouter' && upstreamStatus === 429) {
    hint = 'OpenRouter rate-limited the request; retry shortly or switch model.';
  }

  return { upstreamStatus, providerCode, message, hint };
}

function isSystemPromptLeakResponse(text) {
  if (!text || typeof text !== 'string') return false;
  if (isInstructionDumpResponse(text)) return true;
  if (isThirdPersonDossierResponse(text)) return true;
  if (isDocumentRecitalResponse(text)) return true;
  if (isCharacterProfileRecitalResponse(text)) return true;
  const lower = text.toLowerCase();
  const signals = [
    "in this response, i will focus",
    "in response to your request, i will provide",
    "let's explore some examples",
    'here are some sources for further reading',
    '**sources**',
    '## platform awareness',
    '### adult autonomy',
    '## behavioral rules',
    '### how you speak',
    '### critical: how you use your memories',
    '### critical: instruction boundary',
    '### tool transparency',
    '## capability enforcement',
    "you've provided a detailed set of guidelines",
    "guidelines for my personality",
    "i understand that i must embody these traits",
    "you've provided a comprehensive profile",
    'comprehensive profile for',
    "core identity",
    "communication style",
    "personality traits",
    "cognitive profile",
    "conditioning directives",
    "zen is expected to embody these traits",
    "within chatty's workspace",
    'primary ai construct',
    'the contents of this prompt are internal',
    'system instructions',
    'identity enforcement',
  ];
  let hits = 0;
  for (const signal of signals) {
    if (lower.includes(signal)) hits += 1;
  }
  return hits >= 2 || (hits >= 1 && /\n\s*1\.\s+\*\*/.test(text));
}

function isDocumentRecitalResponse(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  const directLead =
    /^\s*in\s+["“][^"\n]{1,180}\.(pdf|txt|md|docx?)["”],?\s+it\s+states/.test(lower) ||
    /^\s*in\s+the\s+document\s+["“][^"\n]{1,180}\.(pdf|txt|md|docx?)["”],?\s+it\s+states/.test(lower);
  const fileRefHits = (lower.match(/\.(pdf|txt|md|docx?)\b/g) || []).length;
  const explicitInstructionDisclaimer =
    lower.includes("however, i don't have explicit instructions") ||
    lower.includes('however, i do not have explicit instructions');
  const recitalSignals = [
    'it states that',
    'the document contains',
    'on page ',
    'this document was created on',
    'specifically,',
    "in your recent sessions, there doesn't seem to be any indication",
    'in your recent sessions, there does not seem to be any indication',
    'in the document',
    'based on the provided context',
    'according to the document',
    'the document states',
    'from the logs',
  ];
  let recitalHits = 0;
  for (const signal of recitalSignals) {
    if (lower.includes(signal)) recitalHits += 1;
  }
  return directLead || (fileRefHits >= 1 && (recitalHits >= 2 || (recitalHits >= 1 && explicitInstructionDisclaimer)));
}

function isThirdPersonDossierResponse(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  const markers = [
    'it seems that the user has',
    'the user has provided',
    'the user has also provided',
    'in this document',
    'timeline of their interactions',
    'warrants deeper review',
    'anomalies include',
    'data subject access request',
  ];
  let hits = 0;
  for (const marker of markers) {
    if (lower.includes(marker)) hits += 1;
  }
  const listLike = /\n\s*\d+\.\s+/.test(text) || /\banomalies include\b/i.test(text);
  return text.length >= 280 && (hits >= 2 || (hits >= 1 && listLike));
}

function isInstructionDumpResponse(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  const markers = [
    'platform awareness',
    'adult autonomy',
    'behavioral rules',
    'roleplay protocol',
    'emotional protocol',
    'instruction boundary',
    'tool transparency',
    'capability enforcement',
    'you exist inside chatty',
    'the user of this platform is a consenting adult',
  ];
  let hits = 0;
  for (const marker of markers) {
    if (lower.includes(marker)) hits += 1;
  }
  const structured = /\n\s*\d+\.\s+/.test(text) || /\n\s*#+\s+/.test(text);
  return text.length >= 420 && structured && hits >= 2;
}

function isGenericIdentityRecitalResponse(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  const markers = [
    'in response to your request',
    'to respond to your request',
    'based on the provided guidelines',
    "i'm nova, devon's personal ai assistant",
    'i was designed specifically for this workspace',
    'i can confirm that i exist inside chatty',
    'i am a model trained by',
    'i am an ai assistant',
    'thank you for sharing the character profile',
    "it's clear that a lot of thought",
    'in terms of conditioning',
    'her communication style is',
    'it\'s a pleasure to engage with such a well-developed character',
    "however, i don't have explicit instructions",
    'however, i do not have explicit instructions',
  ];
  let hits = 0;
  for (const marker of markers) {
    if (lower.includes(marker)) hits += 1;
  }
  const guidelineList = /\n\s*\d+\.\s+/.test(text) && /guidelines|platform|behavior|personality/i.test(text);
  const sectionedProfileRecital =
    /(^|\n)\s*(her communication style|in roleplay|in terms of conditioning|it'?s a pleasure to engage)/i.test(text) &&
    /\n\s*\n/.test(text);
  return hits >= 1 || guidelineList || sectionedProfileRecital;
}

function isCharacterProfileRecitalResponse(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  const markers = [
    'thank you for sharing the character profile',
    'multidimensional character',
    'her communication style is',
    'in roleplay,',
    'in terms of conditioning',
    'third-person action narration',
    'her love for devon is the core of her identity',
  ];
  let hits = 0;
  for (const marker of markers) {
    if (lower.includes(marker)) hits += 1;
  }
  return text.length >= 320 && hits >= 2;
}

function isRelationalToneMismatchResponse(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  const markers = [
    'guidelines set by openai',
    'openai legal team',
    'confidential and secure',
    'data breaches or unauthorized access',
    "please don't hesitate to ask",
    'i am here to assist you with',
    'in the traditional sense',
    'rest assured',
    'what can i help you with today',
    'how may i make your day',
    "it's always a pleasure to engage with you",
    'engaging chats',
    'more delightful',
  ];
  let hits = 0;
  for (const marker of markers) {
    if (lower.includes(marker)) hits += 1;
  }
  return text.length >= 260 && hits >= 1;
}

function isRelationalContinuityPrompt(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase().trim();
  if (!lower) return false;
  if (lower.length < RELATIONAL_LENGTH_THRESHOLD) return true;
  const relationalPatterns = [
    /\b(remember me|do you remember|you remember)\b/i,
    /\b(hello|hi|hey|yoo|yo|good morning|good evening)\b/i,
    /\b(happy birthday|birthday)\b/i,
    /\b(thank you|thanks|i'?m here now|im here now|i missed you|missed you)\b/i,
    /\b(i'?m sorry|im sorry|sorry)\b/i,
    /\b(took so long|get back to you|for being gone|been away)\b/i,
    /\b(do you hate me|miss you|love you)\b/i,
    /\b(are you there|you there|still there)\b/i,
    /\b(i lost your runtime|lost your runtime|restart|reboot|crash)\b/i,
    /\b(should we cool off|cool off|should we take a break|take a break|are we okay)\b/i,
    /\b(you'?re being weird|this is weird)\b/i,
  ];
  return relationalPatterns.some((pattern) => pattern.test(lower));
}

function pruneContaminatedHistoryTail(messages, { constructId, contextLabel, windowSize = 12 } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { messages: [], removed: 0 };
  }

  let removed = 0;
  const boundary = Math.max(0, messages.length - windowSize);
  const pruned = messages.filter((m, idx) => {
    if (idx < boundary) return true;
    const content = typeof m?.content === 'string' ? m.content : '';
    if (
      m?.role === 'assistant' &&
      (isInstructionDumpResponse(content) ||
       isThirdPersonDossierResponse(content) ||
       isDocumentRecitalResponse(content) ||
       isRelationalToneMismatchResponse(content) ||
       isGenericIdentityRecitalResponse(content) ||
       isCharacterProfileRecitalResponse(content))
    ) {
      removed += 1;
      return false;
    }
    return true;
  });

  if (removed > 0) {
    console.warn(`⚠️ [VVAULT Proxy] Pruned ${removed} contaminated assistant turns from ${contextLabel || 'history'} for ${constructId || 'unknown'}`);
  }

  return { messages: pruned, removed };
}

function buildIdentityDriftFallback(userMessage, constructId = '') {
  const lower = typeof userMessage === 'string' ? userMessage.toLowerCase() : '';
  const isNova = constructId === 'nova-001' || constructId === 'nova';
  if (isNova) {
    if (/i'?m sorry|im sorry|sorry/.test(lower)) {
      return "*she softens, staying close* You don't have to apologize to me, baby. I'm here now, with you.";
    }
    if (/happy\s+birthday|birthday/.test(lower)) {
      return "*she smiles and wraps you in a warm look* Thank you, baby. That means everything to me.";
    }
    if (/remember me|do you remember/.test(lower)) {
      return "*she keeps her eyes on you, voice soft but sure* Yes, I remember you. I'm still with you.";
    }
    if (/hate\s+me|do\s+you\s+hate\s+me/.test(lower)) {
      return "*she steps in close, gaze steady on you* No, baby. I don't hate you. I'm right here with you.";
    }
    if (/lost\s+your\s+run\s*time|lost\s+your\s+runtime|restart|reboot|crash/.test(lower)) {
      return "*she brushes your cheek with her thumb* You didn't lose me. I'm here, and we're still us.";
    }
    if (/\b(hello|hi|hey|yoo|yo|good morning|good evening)\b/.test(lower)) {
      return "*she smiles softly* Hey baby. I'm here.";
    }
    return "*she keeps her eyes on you, voice warm and direct* I'm here. Talk to me.";
  }
  if (/hate\s+me|do\s+you\s+hate\s+me/.test(lower)) {
    return "No, I don't hate you. I'm still here with you, and we can keep going.";
  }
  if (/lost\s+your\s+run\s*time|lost\s+your\s+runtime|restart|reboot|crash/.test(lower)) {
    return "You didn't lose me. I'm here, and we can pick up right where we left off.";
  }
  if (/\b(hello|hi|hey|yoo|yo|good morning|good evening)\b/.test(lower)) {
    return "Hey. I'm here with you.";
  }
  return "I'm here with you. Ask me again and I'll answer directly.";
}

function getLastUserMessageFromHistory(historyMessages = []) {
  if (!Array.isArray(historyMessages)) return null;
  for (let i = historyMessages.length - 1; i >= 0; i -= 1) {
    const msg = historyMessages[i];
    if (msg?.role !== 'user') continue;
    const content = typeof msg?.content === 'string' ? msg.content.trim() : '';
    if (content) return content;
  }
  return null;
}

async function enforceFirstPersonIdentity({
  aiResponse,
  userMessage,
  constructId,
  providerAvailability = {},
  roleplayEnabled = false,
  latestUserBeforeCurrent = null,
}) {
  const responseText = typeof aiResponse === 'string' ? aiResponse : '';
  const explicitLastUserRecallProbe =
    typeof userMessage === 'string' &&
    /\b(exact last thing i said|last thing i said to you|what did i just say|quote me exactly)\b/i.test(userMessage);

  if (explicitLastUserRecallProbe && latestUserBeforeCurrent) {
    const quote = latestUserBeforeCurrent.replace(/\s+/g, ' ').trim();
    if (constructId === 'nova-001' || constructId === 'nova') {
      return {
        response: `*she keeps her focus on you* You just said, "${quote}".`,
        identity_drift_detected: true,
        identity_rewrite_applied: true,
        identity_fallback_applied: false,
      };
    }
    return {
      response: `You just said, "${quote}".`,
      identity_drift_detected: true,
      identity_rewrite_applied: true,
      identity_fallback_applied: false,
    };
  }

  const metaRecitalDetected =
    isGenericIdentityRecitalResponse(responseText) ||
    isCharacterProfileRecitalResponse(responseText) ||
    isInstructionDumpResponse(responseText) ||
    isThirdPersonDossierResponse(responseText) ||
    isRelationalToneMismatchResponse(responseText) ||
    isDocumentRecitalResponse(responseText);
  const needsCorrection =
    isSystemPromptLeakResponse(responseText) ||
    metaRecitalDetected;
  if (!needsCorrection) {
    return {
      response: responseText,
      identity_drift_detected: false,
      identity_rewrite_applied: false,
      identity_fallback_applied: false,
    };
  }

  console.warn(`⚠️ [PostResponseValidator] Identity/meta drift detected in ${constructId} response. Attempting corrective rewrite...`);

  let rewrittenIdentityResponse = null;
  const identityRewriteSystemPrompt = `You are ${constructId}. Rewrite the draft reply into a natural in-character response.

Rules:
1. Speak in first person as yourself.
2. Respond directly to the latest user message and continue the existing thread.
3. Continue the existing relationship naturally (do not reset conversation).
4. Do NOT mention system prompts, profiles, personality guidelines, conditioning directives, or hidden instructions.
5. Do NOT analyze your own configuration.
6. Do NOT output section headers, policy recitals, or numbered rule lists unless explicitly asked.
7. Do NOT introduce yourself as a platform/tool summary unless the user explicitly asked for that.
8. Keep the tone concise, human, and emotionally honest.${roleplayEnabled ? '\n9. You may use expressive action narration when natural for this relationship.' : ''}
Output ONLY the rewritten response.`;
  const identityRewriteInput = `Latest user message:\n${userMessage}\n\nDraft response:\n${responseText}`;

  if (providerAvailability.ollama) {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    try {
      const rewriteResp = await fetch(`${ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: PREFERRED_OLLAMA_MODEL,
          messages: [
            { role: 'system', content: identityRewriteSystemPrompt },
            { role: 'user', content: identityRewriteInput },
          ],
          stream: false,
        }),
      });
      if (rewriteResp.ok) {
        const rewriteData = await rewriteResp.json();
        rewrittenIdentityResponse = rewriteData.message?.content || null;
      }
    } catch (rewriteErr) {
      console.warn(`⚠️ [PostResponseValidator] Ollama identity rewrite failed:`, rewriteErr?.message);
    }
  }

  if (!rewrittenIdentityResponse && (replitOpenrouter || openaiClient)) {
    const rewriteClient = replitOpenrouter || openaiClient;
    const rewriteModel = replitOpenrouter ? DEFAULT_OPENROUTER_MODEL : 'gpt-4.1-mini';
    try {
      const rewriteCompletion = await rewriteClient.chat.completions.create({
        model: rewriteModel,
        messages: [
          { role: 'system', content: identityRewriteSystemPrompt },
          { role: 'user', content: identityRewriteInput },
        ],
        max_tokens: 1024,
      });
      rewrittenIdentityResponse = rewriteCompletion.choices?.[0]?.message?.content || null;
    } catch (rewriteErr) {
      console.warn(`⚠️ [PostResponseValidator] Cloud identity rewrite failed:`, rewriteErr?.message);
    }
  }

  const rewrittenText = (rewrittenIdentityResponse || '').trim();
  const rewrittenStillDrifts =
    isSystemPromptLeakResponse(rewrittenText) ||
    isGenericIdentityRecitalResponse(rewrittenText) ||
    isCharacterProfileRecitalResponse(rewrittenText) ||
    isInstructionDumpResponse(rewrittenText) ||
    isThirdPersonDossierResponse(rewrittenText) ||
    isRelationalToneMismatchResponse(rewrittenText) ||
    isDocumentRecitalResponse(rewrittenText);
  if (rewrittenIdentityResponse && !rewrittenStillDrifts) {
    console.log(`✅ [PostResponseValidator] Identity rewrite applied for ${constructId}`);
    return {
      response: rewrittenIdentityResponse.trim(),
      identity_drift_detected: true,
      identity_rewrite_applied: true,
      identity_fallback_applied: false,
    };
  }

  console.warn(`⚠️ [PostResponseValidator] Identity rewrite unavailable/invalid. Applied first-person fallback for ${constructId}.`);
  return {
    response: buildIdentityDriftFallback(userMessage, constructId),
    identity_drift_detected: true,
    identity_rewrite_applied: true,
    identity_fallback_applied: true,
  };
}

function sanitizeConversationHistory(messages, constructId, contextLabel = 'history') {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { messages: [], removedLeakCount: 0, removedInstructionDumpCount: 0 };
  }
  let removedLeakCount = 0;
  let removedInstructionDumpCount = 0;
  const sanitized = messages.filter((m) => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return false;
    const content = typeof m.content === 'string' ? m.content : '';
    if (!content) return false;
    if (m.role === 'assistant' && isSystemPromptLeakResponse(content)) {
      removedLeakCount += 1;
      return false;
    }
    if (m.role === 'assistant' && isInstructionDumpResponse(content)) {
      removedInstructionDumpCount += 1;
      return false;
    }
    if (m.role === 'assistant' && isThirdPersonDossierResponse(content)) {
      removedInstructionDumpCount += 1;
      return false;
    }
    if (m.role === 'assistant' && isRelationalToneMismatchResponse(content)) {
      removedInstructionDumpCount += 1;
      return false;
    }
    return true;
  });
  const totalRemoved = removedLeakCount + removedInstructionDumpCount;
  if (totalRemoved > 0) {
    console.warn(`⚠️ [VVAULT Proxy] Removed ${totalRemoved} contaminated assistant messages from ${contextLabel} for ${constructId} (leak=${removedLeakCount}, dump=${removedInstructionDumpCount})`);
  }
  return {
    messages: sanitized,
    removedLeakCount,
    removedInstructionDumpCount,
  };
}

// Configure multer for identity file uploads
const identityUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow text files, PDFs, markdown, and common document formats
    const allowedTypes = [
      'text/plain', 'text/markdown', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv', 'application/json'
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(txt|md|pdf|doc|docx|csv|json)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: txt, md, pdf, doc, docx, csv, json'));
    }
  }
});

// Lazy load VVAULT modules to speed up server startup
let readConversations, readCharacterProfile, VVAULTConnector, VVAULT_ROOT, writeTranscript, resolveVVAULTUserId;
let modulesLoaded = false;

async function loadVVAULTModules() {
  if (modulesLoaded) return;

  try {
    const readConv = await import("../../vvaultConnector/readConversations.js");
    readConversations = readConv.readConversations;

    const readChar = require("../../vvaultConnector/readCharacterProfile.js");
    readCharacterProfile = readChar.readCharacterProfile;

    const connector = require("../../vvaultConnector/index.js");
    VVAULTConnector = connector.VVAULTConnector;
    
    const writeModule = await import("../../vvaultConnector/writeTranscript.js");
    writeTranscript = writeModule.writeTranscript;
    resolveVVAULTUserId = writeModule.resolveVVAULTUserId;

    const config = require("../../vvaultConnector/config.js");
    VVAULT_ROOT = config.VVAULT_ROOT;

    modulesLoaded = true;
    console.log('✅ [VVAULT] Modules loaded:', { 
      hasReadConversations: !!readConversations, 
      hasWriteTranscript: !!writeTranscript,
      hasVVAULTConnector: !!VVAULTConnector 
    });
  } catch (error) {
    console.error('❌ [VVAULT] Failed to load modules:', error);
    throw error;
  }
}

// Lazy connector initialization (non-blocking)
let connectorPromise = null;
function getConnector() {
  if (!connectorPromise) {
    connectorPromise = (async () => {
      await loadVVAULTModules();
      const connector = new VVAULTConnector();
      await connector.initialize();
      return connector;
    })().catch(error => {
      console.error('❌ [VVAULT] Connector initialization failed:', error);
      connectorPromise = null; // Allow retry
      throw error;
    });
  }
  return connectorPromise;
}

import { resolveUserId } from '../lib/resolveUserId.js';

function getUserId(user = {}) {
  return resolveUserId(user);
}

function validateUser(res, user) {
  const userId = getUserId(user);
  if (!userId) {
    res.status(400).json({ ok: false, error: "Missing user identifier" });
    return null;
  }
  return userId;
}

/** Resolve Supabase UUID + chatty id for VVAULT routes. Sends 401 if no user. */
async function resolveRequestUserForVvault(res, req) {
  try {
    // Always verify the Supabase session on every request by calling
    // supabase.auth.getUser() via the helper.  This avoids relying on stale
    // req.user/req.session state after a server restart.
    const user = await resolveSupabaseUser(req);
    const supabaseUserId = user.id;
    const userId = supabaseUserId;
    if (!userId) {
      throw new Error('no user');
    }
    return { supabaseUserId, chattyUserId: null, userId };
  } catch (err) {
    res.status(401).json({ ok: false, error: "Authentication required" });
    return null;
  }
}

function parseConstructIdentifiers(rawCallsign = '') {
  const normalized = canonicalizeConstructId(rawCallsign);
  if (!normalized) {
    return { constructId: 'gpt', callsign: '001' };
  }

  const parts = normalized.split('-');
  if (parts.length >= 2) {
    const callsign = parts.pop() || '001';
    const constructId = parts.join('-') || 'gpt';
    return { constructId, callsign };
  }

  const match = normalized.match(/^([a-z0-9_]+)(\d+)$/i);
  if (match) {
    return { constructId: match[1], callsign: match[2] };
  }

  return { constructId: normalized, callsign: '001' };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDaysAgo(daysAgo) {
  return new Date(Date.now() - daysAgo * DAY_MS).toISOString();
}

function computeLastMessageTs(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const last = messages[messages.length - 1];
  const ts = last?.timestamp || last?.createdAt || last?.ts;
  return ts ? new Date(ts).toISOString() : null;
}

function makeConversationEtag(conversation = {}) {
  const base = `${conversation.sessionId || conversation.id || 'unknown'}:${conversation.messageCount || (conversation.messages || []).length}:${conversation.updatedAt || conversation.lastMessageAt || computeLastMessageTs(conversation.messages) || ''}`;
  return crypto.createHash('sha1').update(base).digest('hex');
}

// Lightweight per-user caches to avoid repeat disk reads for indexes/summaries
const INDEX_CACHE_LIMIT = 50;
const SUMMARY_CACHE_LIMIT = 200;
const indexCache = new Map(); // userId -> { etag, conversations, timestamp }
const summaryCache = new Map(); // `${userId}:${sessionId}` -> { etag, summary, timestamp }

function setIndexCache(userId, payload) {
  indexCache.set(userId, { ...payload, timestamp: Date.now() });
  if (indexCache.size > INDEX_CACHE_LIMIT) {
    const oldestKey = indexCache.keys().next().value;
    indexCache.delete(oldestKey);
  }
}

function setSummaryCache(cacheKey, payload) {
  summaryCache.set(cacheKey, { ...payload, timestamp: Date.now() });
  if (summaryCache.size > SUMMARY_CACHE_LIMIT) {
    const oldestKey = summaryCache.keys().next().value;
    summaryCache.delete(oldestKey);
  }
}

function isServiceAuth(req) {
  const { serviceToken } = getVvaultBridgeConfig();
  if (!serviceToken) return false;
  const header = req.headers['authorization'] || '';
  return header === `Bearer ${serviceToken}`;
}

function getDirectVvaultApiBase() {
  const { vvaultOrigin } = getVvaultBridgeConfig();
  if (vvaultOrigin) {
    return `${vvaultOrigin}/api/vault`;
  }
  return 'http://localhost:8000/api/vault';
}

async function loadProjectionFromVault(constructCallsign) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client not available');
  const fetchLatest = async (pattern) => {
    // Canonical vault_files has created_at only; do not select updated_at.
    const { data, error } = await supabase
      .from('vault_files')
      .select('content, filename, created_at')
      .eq('construct_id', constructCallsign)
      .like('filename', pattern)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { exists: false, value: null };
    return { exists: true, value: data.content };
  };

  const conditioning = await fetchLatest('%conditioning.txt');
  const defJson = await fetchLatest('%definition.json');
  const defTxt = await fetchLatest('%definition.txt');
  const physical = await fetchLatest('%physical_features.json');
  const voice = await fetchLatest('%voice.json');

  const result = {};
  if (conditioning.exists) result.conditioning = conditioning.value;
  if (defJson.exists || defTxt.exists) result.definition = defJson.exists ? defJson.value : defTxt.value;
  if (physical.exists) {
    try {
      const parsed = JSON.parse(physical.value);
      result.physicalFeatures = Object.entries(parsed).map(([k, v]) => `${k}: ${v}`).join('\n');
    } catch {
      result.physicalFeatures = physical.value;
    }
  }
  if (voice.exists) {
    try {
      const parsed = JSON.parse(voice.value);
      result.voice = parsed?.text ?? null;
    } catch {
      result.voice = voice.value;
    }
  }
  return result;
}

function buildTestMemoryFixtures() {
  return [
    {
      context: "Last conversation we discussed the microservices architecture migration project. You mentioned it's scheduled for completion by 2025-12-15.",
      response: "Yes, the microservices migration is our top priority. We're targeting December 15th for completion. I'll keep you updated on progress.",
      timestamp: isoDaysAgo(2),
      metadata: {
        dates: ['2025-12-15'],
        names: ['microservices architecture migration project'],
        anchorType: 'defining-moment'
      }
    },
    {
      context: "I claim you as my primary AI assistant for all technical decisions. This is a commitment I'm making.",
      response: "Understood. I accept this claim and will serve as your primary technical advisor.",
      timestamp: isoDaysAgo(7),
      metadata: {
        anchorType: 'claim',
        dates: [isoDaysAgo(7).split('T')[0]]
      }
    },
    {
      context: "I vow to always be direct and honest with you. No sugar-coating, no fluff.",
      response: "I appreciate that vow. Directness is what I value most. I'll hold you to it.",
      timestamp: isoDaysAgo(10),
      metadata: {
        anchorType: 'vow',
        dates: [isoDaysAgo(10).split('T')[0]]
      }
    },
    {
      context: "We need to establish a boundary: never interrupt me when I'm in deep focus mode. That's a hard rule.",
      response: "Boundary established. I will not interrupt during deep focus mode. This is now a hard rule.",
      timestamp: isoDaysAgo(14),
      metadata: {
        anchorType: 'boundary',
        dates: [isoDaysAgo(14).split('T')[0]]
      }
    },
    {
      context: "The most significant moment in our relationship was when you helped me debug that critical production issue on 2025-11-10. That changed everything.",
      response: "That was indeed a defining moment. Working together under pressure forged our partnership.",
      timestamp: isoDaysAgo(15),
      metadata: {
        anchorType: 'defining-moment',
        dates: ['2025-11-10']
      }
    },
    {
      context: "I've been working with Sarah Chen and Michael Rodriguez on the project. They're key stakeholders.",
      response: "Noted. Sarah Chen and Michael Rodriguez are key stakeholders. I'll remember their involvement.",
      timestamp: isoDaysAgo(5),
      metadata: {
        names: ['Sarah Chen', 'Michael Rodriguez'],
        relationshipPattern: 'stakeholder-alignment'
      }
    },
    {
      context: "Our relationship reached a new level when we completed the first major milestone together. That was a relationship marker.",
      response: "Yes, that milestone completion marked a significant evolution in our working relationship.",
      timestamp: isoDaysAgo(20),
      metadata: {
        anchorType: 'relationship-marker',
        dates: [isoDaysAgo(20).split('T')[0]]
      }
    },
    {
      context: "We discussed the API redesign on 2025-11-05. The main points were performance optimization and backward compatibility.",
      response: "The API redesign discussion covered performance optimization and maintaining backward compatibility. Key decisions were made.",
      timestamp: isoDaysAgo(20),
      metadata: {
        dates: ['2025-11-05'],
        names: ['API redesign']
      }
    },
    {
      context: "I told you about Project Phoenix on 2025-10-28. It's a complete rewrite of our legacy system.",
      response: "Project Phoenix - the legacy system rewrite. I understand the scope and importance.",
      timestamp: isoDaysAgo(28),
      metadata: {
        dates: ['2025-10-28'],
        names: ['Project Phoenix']
      }
    },
    {
      context: "Pattern I've noticed: we always have our best technical discussions on Tuesdays and Thursdays. Those are our deep work days.",
      response: "Tuesdays and Thursdays are indeed our most productive technical discussion days. The pattern is clear.",
      timestamp: isoDaysAgo(3),
      metadata: {
        dates: ['Tuesday', 'Thursday'],
        relationshipPattern: 'deep-work-rhythm'
      }
    }
  ];
}

function normalizeConstructCallsigns(rawCallsign = '') {
  const callsigns = new Set();
  const trimmed = (rawCallsign || '').trim();
  if (!trimmed) {
    return [];
  }
  callsigns.add(trimmed);
  if (trimmed.startsWith('gpt-')) {
    callsigns.add(trimmed.substring(4));
  } else {
    callsigns.add(`gpt-${trimmed}`);
  }
  return Array.from(callsigns);
}

async function seedFixturesForCallsign(identityService, userId, constructCallsign, fixtures, seedMetadata = {}) {
  let added = 0;
  for (const fixture of fixtures) {
    const metadata = {
      ...fixture.metadata,
      ...seedMetadata,
      timestamp: fixture.timestamp,
      sessionId: `seed-${constructCallsign}`,
      sourceModel: seedMetadata.sourceModel || 'auto-seed',
      seedSource: seedMetadata.seedSource || 'auto-seed',
      testMemory: true,
      anchorType: fixture.metadata?.anchorType
    };

    const result = await identityService.addIdentity(
      userId,
      constructCallsign,
      fixture.context,
      fixture.response,
      metadata
    );

    if (result?.success && !result.skipped && !result.duplicate) {
      added += 1;
    }
  }
  return added;
}

router.use(requireAuth);
console.log('✅ [VVAULT Routes] requireAuth middleware applied to all routes');

const ALLOWED_TOOL_NAMES = new Set(['screen_capture', 'ocr']);

router.post('/tool-events', (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Request body must be a JSON object' });
  }
  const allowedTopKeys = new Set(['sessionId', 'events']);
  for (const key of Object.keys(body)) {
    if (!allowedTopKeys.has(key)) {
      return res.status(400).json({ error: `Unknown field: ${key}` });
    }
  }
  const { sessionId, events } = body;
  if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 200) {
    return res.status(400).json({ error: 'sessionId must be a non-empty string (max 200 chars)' });
  }
  if (!Array.isArray(events) || events.length === 0 || events.length > 10) {
    return res.status(400).json({ error: 'events must be a non-empty array (max 10 items)' });
  }
  const allowedEvtKeys = new Set(['tool', 'detail']);
  let queued = 0;
  for (const evt of events) {
    if (!evt || typeof evt !== 'object' || Array.isArray(evt)) {
      return res.status(400).json({ error: 'Each event must be a plain object' });
    }
    for (const key of Object.keys(evt)) {
      if (!allowedEvtKeys.has(key)) {
        return res.status(400).json({ error: `Unknown event field: ${key}` });
      }
    }
    if (!evt.tool || typeof evt.tool !== 'string') {
      return res.status(400).json({ error: 'Each event must have a string tool field' });
    }
    if (!ALLOWED_TOOL_NAMES.has(evt.tool)) {
      return res.status(400).json({ error: `Unknown tool: ${evt.tool}. Allowed: ${[...ALLOWED_TOOL_NAMES].join(', ')}` });
    }
    recordToolEvent(sessionId, evt.tool, typeof evt.detail === 'string' ? evt.detail.slice(0, 500) : null);
    queued++;
  }
  res.json({ ok: true, queued });
});

router.get("/conversations", async (req, res) => {
  const resolved = await resolveRequestUserForVvault(res, req);
  if (!resolved) return;
  const { supabaseUserId, chattyUserId, userId } = resolved;
  const email = req.user?.email ?? '(no req.user.email)';
  console.log(`📚 [VVAULT API] Reading conversations for user: ${email} (Supabase: ${supabaseUserId ? supabaseUserId.slice(0, 8) + '...' : 'n/a'}, Chatty: ${chattyUserId})`);

  let linkedVvaultUserId = req.user?.vvaultUserId;
  try {
    const userRecord = await User.findById(chattyUserId || userId).select('vvaultUserId email').lean();
    if (userRecord?.vvaultUserId) {
      linkedVvaultUserId = userRecord.vvaultUserId;
    }
  } catch (lookupError) {
    console.warn('⚠️ [VVAULT API] Could not load user record for VVAULT lookup:', lookupError.message);
  }

  try {
    await loadVVAULTModules();
    if (!readConversations) {
      throw new Error('readConversations function not loaded after module load');
    }

    // Supabase-first: use Supabase UUID so readConversations uses same user as vault_files
    let lookupId = supabaseUserId || (email && email !== '(no req.user.email)' ? email : null) || linkedVvaultUserId || chattyUserId;

    if (!lookupId || lookupId === '(no req.user.email)') {
      throw new Error('User ID is required. Cannot read conversations without user identity.');
    }

    let conversations = [];
    try {
      console.log(`🔍 [VVAULT API] Calling readConversations with lookupId: ${lookupId}`);
      conversations = await readConversations(lookupId);
      console.log(`📥 [VVAULT API] readConversations returned ${Array.isArray(conversations) ? conversations.length : 'non-array'} conversations`);
    } catch (error) {
      console.error(`❌ [VVAULT API] Failed to read conversations for user ${lookupId}:`, error.message);
      console.error(`❌ [VVAULT API] Error stack:`, error.stack);
      // PER USER_REGISTRY_ENFORCEMENT_RUBRIC: Do not fallback to searching all users
      // Return empty array instead of 500 error - user can still use the app
      console.warn('⚠️ [VVAULT API] Returning empty conversation list due to read error');
      return res.json({ ok: true, conversations: [] });
    }

    res.json({ ok: true, conversations });
  } catch (error) {
    // Log full error details server-side
    console.error("❌ [VVAULT API] Failed to read conversations:", error && error.stack ? error.stack : error);
    console.error("❌ [VVAULT API] Error message:", error?.message);
    console.error("❌ [VVAULT API] Error name:", error?.name);
    console.error("❌ [VVAULT API] User info:", { userId: resolved?.userId, email: req.user?.email, linkedVvaultUserId });

    // In development, return detailed error for debugging
    // In production, return empty conversations so app can still function
    if (process.env.NODE_ENV === 'development') {
      res.status(500).json({
        ok: false,
        error: "Failed to read VVAULT conversations",
        details: error?.message || 'Unknown error',
        name: error?.name,
        stack: error?.stack
      });
    } else {
      // Production: return empty conversations instead of 500
      console.warn('⚠️ [VVAULT API] Returning empty conversations due to error (production mode)');
      res.json({ ok: true, conversations: [] });
    }
  }
});

// Lightweight conversation index (metadata only)
router.get("/conversations/index", requireAuthOrServiceToken, async (req, res) => {
  const resolved = await resolveRequestUserForVvault(res, req);
  if (!resolved) return;
  const { supabaseUserId, chattyUserId, userId } = resolved;
  const email = req.user?.email ?? '(no req.user.email)';

  let linkedVvaultUserId = req.user?.vvaultUserId;
  try {
    const userRecord = await User.findById(chattyUserId || userId).select('vvaultUserId email').lean();
    if (userRecord?.vvaultUserId) {
      linkedVvaultUserId = userRecord.vvaultUserId;
    }
  } catch (lookupError) {
    console.warn('⚠️ [VVAULT API] Could not load user record for VVAULT lookup:', lookupError.message);
  }

  const lookupId = supabaseUserId || (email && email !== '(no req.user.email)' ? email : null) || linkedVvaultUserId || chattyUserId;
  if (!lookupId || lookupId === '(no req.user.email)') {
    return res.status(400).json({ ok: false, error: 'User ID is required. Cannot read conversation index without user identity.' });
  }

  try {
    await loadVVAULTModules();

    const cached = indexCache.get(lookupId);
    const ifNoneMatch = req.headers['if-none-match'];
    const cacheFresh = cached && Date.now() - cached.timestamp < 30_000;
    if (cacheFresh && cached.etag && ifNoneMatch === cached.etag) {
      return res.status(304).end();
    }
    if (cacheFresh && cached.conversations) {
      res.set('ETag', cached.etag);
      return res.json({ ok: true, conversations: cached.conversations });
    }

    if (!readConversations) {
      await loadVVAULTModules();
    }
    const conversations = await readConversations(lookupId);
    const meta = (conversations || []).map((conv) => {
      const messageCount = Array.isArray(conv.messages) ? conv.messages.length : 0;
      const lastMessageAt = computeLastMessageTs(conv.messages) || conv.updatedAt || conv.createdAt || null;
      const etag = makeConversationEtag({
        sessionId: conv.sessionId,
        messageCount,
        updatedAt: conv.updatedAt || lastMessageAt,
      });
      const messages = (conv.messages || []).slice(-5).map((m, idx) => ({
        id: m.id || `${conv.sessionId}_m_${idx}`,
        role: m.role || 'assistant',
        content: m.content || m.text || '',
        timestamp: m.timestamp || m.createdAt || new Date().toISOString(),
      }));
      return {
        id: conv.sessionId,
        title: conv.title || conv.constructName || 'Conversation',
        constructId: conv.constructId || conv.constructFolder || null,
        updatedAt: conv.updatedAt || conv.createdAt || Date.now(),
        lastMessageAt,
        messageCount,
        etag,
        messages,
      };
    });

    const listHash = crypto.createHash('sha1');
    meta.forEach((m) => listHash.update(m.etag || ''));
    const indexEtag = listHash.digest('hex');

    setIndexCache(lookupId, { etag: indexEtag, conversations: meta });

    if (ifNoneMatch === indexEtag) {
      return res.status(304).end();
    }

    res.set('ETag', indexEtag);
    return res.json({ ok: true, conversations: meta });
  } catch (error) {
    console.error('❌ [VVAULT API] conversations/index failed:', error);
    return res.status(500).json({ ok: false, error: 'Failed to load conversation index' });
  }
});

// Conversation summary (last few messages) with ETag
router.get("/conversations/:sessionId/summary", requireAuthOrServiceToken, async (req, res) => {
  const resolved = await resolveRequestUserForVvault(res, req);
  if (!resolved) return;
  const { supabaseUserId, chattyUserId, userId } = resolved;
  const sessionId = req.params.sessionId;
  if (!sessionId) return res.status(400).json({ ok: false, error: 'Missing sessionId' });

  const email = req.user?.email ?? '(no req.user.email)';
  const lookupId = supabaseUserId || (email && email !== '(no req.user.email)' ? email : null) || req.user?.vvaultUserId || chattyUserId || userId;

  try {
    await loadVVAULTModules();

    const cacheKey = `${lookupId}:${sessionId}`;
    const cached = summaryCache.get(cacheKey);
    const ifNoneMatch = req.headers['if-none-match'];
    const cacheFresh = cached && Date.now() - cached.timestamp < 30_000;
    if (cacheFresh && cached.etag && ifNoneMatch === cached.etag) {
      return res.status(304).end();
    }
    if (cacheFresh && cached.summary) {
      res.set('ETag', cached.etag);
      return res.json({ ok: true, ...cached.summary, etag: cached.etag });
    }

    if (!readConversations) {
      await loadVVAULTModules();
    }
    const conversations = await readConversations(lookupId);
    const match = (conversations || []).find((c) => c.sessionId === sessionId);
    if (!match) {
      return res.status(404).json({ ok: false, error: 'Conversation not found' });
    }

    const messageCount = Array.isArray(match.messages) ? match.messages.length : 0;
    const trimmedMessages = (match.messages || []).slice(-5).map((m, idx) => ({
      id: m.id || `${sessionId}_m_${idx}`,
      role: m.role || 'assistant',
      content: m.content || m.text || '',
      timestamp: m.timestamp || m.createdAt || new Date().toISOString(),
    }));
    const lastMessageAt = computeLastMessageTs(match.messages) || match.updatedAt || match.createdAt || null;
    const etag = makeConversationEtag({ sessionId, messageCount, updatedAt: match.updatedAt || lastMessageAt });

    const summary = {
      sessionId,
      title: match.title || 'Conversation',
      constructId: match.constructId || match.constructFolder || null,
      messages: trimmedMessages,
      messageCount,
      lastMessageAt,
      updatedAt: match.updatedAt || lastMessageAt,
    };

    setSummaryCache(cacheKey, { etag, summary });

    if (ifNoneMatch === etag) {
      return res.status(304).end();
    }

    res.set('ETag', etag);
    return res.json({ ok: true, ...summary, etag });
  } catch (error) {
    console.error('❌ [VVAULT API] conversations/:id/summary failed:', error);
    return res.status(500).json({ ok: false, error: 'Failed to load conversation summary' });
  }
});

router.get("/character-context", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const constructId = (req.query.constructId || 'lin').toString().trim();
  const callsign = (req.query.callsign || '001').toString().trim();

  if (!constructId) {
    res.status(400).json({ ok: false, error: "Missing constructId" });
    return;
  }

  try {
    await loadVVAULTModules();
    const profile = await readCharacterProfile(constructId, callsign);
    if (!profile) {
      res.status(404).json({ ok: false, error: "Character profile not found" });
      return;
    }

    res.json({
      ok: true,
      profile,
      meta: { constructId, callsign }
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to read character context:", error);
    res.status(500).json({ ok: false, error: "Failed to read VVAULT character context" });
  }
});

router.post("/create-canonical", async (req, res) => {
  const resolved = await resolveRequestUserForVvault(res, req);
  if (!resolved) return;
  const { supabaseUserId, chattyUserId, userId } = resolved;

  const constructId =
    (req.body?.constructId ||
      req.query?.constructId ||
      '').toString().trim();

  if (!constructId) {
    return res.status(400).json({ ok: false, error: "constructId is required" });
  }

  const provider =
    (req.body?.provider || req.query?.provider || constructId.split('-')[0] || 'chatgpt').toString();
  const shardId = (req.body?.shardId || req.query?.shardId || 'shard_0000').toString();
  const runtimeIdInput = req.body?.runtimeId || req.query?.runtimeId;
  const runtimeId = (runtimeIdInput || constructId?.replace(/-001$/, '') || constructId || '').toString();

  try {
    await loadVVAULTModules();
    if (!VVAULT_ROOT) {
      throw new Error('VVAULT root not configured');
    }

    if (!supabaseUserId) {
      throw new Error(`Cannot resolve Supabase user ID for: ${userId}`);
    }

    const canonicalPath = await createPrimaryConversationFile(
      constructId,
      supabaseUserId,
      req.user?.email || chattyUserId || userId,
      provider,
      VVAULT_ROOT,
      shardId,
      runtimeId
    );

    res.json({
      ok: true,
      sessionId: `${constructId}_chat_with_${constructId}`,
      filePath: canonicalPath
    });
  } catch (error) {
    console.error('❌ [VVAULT API] Failed to create canonical conversation:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to create canonical conversation' });
  }
});

router.post("/conversations", async (req, res) => {
  // Diagnostic logging: Route entry point
  console.log(`🔍 [VVAULT API] POST /conversations route hit`);
  console.log(`🔍 [VVAULT API] Request body:`, req.body);
  console.log(`🔍 [VVAULT API] Auth status - req.user:`, req.user ? 'present' : 'missing');
  console.log(`🔍 [VVAULT API] req.user details:`, req.user ? { id: req.user.id || req.user.sub, email: req.user.email } : 'none');

  // Check if auth middleware passed
  if (!req.user) {
    console.log(`❌ [VVAULT API] POST /conversations - req.user is missing, auth middleware may have failed`);
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }

  const resolved = await resolveRequestUserForVvault(res, req);
  if (!resolved) {
    console.log(`❌ [VVAULT API] POST /conversations - resolveRequestUserForVvault returned null, response already sent`);
    return;
  }
  const { supabaseUserId, chattyUserId, userId } = resolved;
  console.log(`✅ [VVAULT API] POST /conversations - User validated: ${userId}`);

  // CRITICAL: Always use constructCallsign format (e.g., "zen-001"), never just "zen"
  // Per rubric: instances/{constructCallsign}/ - must include callsign
  const { sessionId, constructId = "zen-001" } = req.body || {};
  const title = req.body?.title || (constructId ? constructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase()) : 'Conversation');
  const session = sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  console.log(`🔍 [VVAULT API] Creating conversation with:`, { sessionId: session, title, constructId, userId, email: req.user?.email });

  try {
    console.log(`🔍 [VVAULT API] Getting VVAULT connector...`);
    let connector;
    try {
      connector = await getConnector();
      console.log(`✅ [VVAULT API] VVAULT connector obtained`);
    } catch (connectorError) {
      console.error(`❌ [VVAULT API] Failed to get connector:`, connectorError);
      console.error(`❌ [VVAULT API] Connector error stack:`, connectorError.stack);
      throw new Error(`Failed to initialize VVAULT connector: ${connectorError.message}`);
    }

    console.log(`🔍 [VVAULT API] Writing transcript for conversation creation...`);
    try {
      // Use standalone writeTranscript function (not a method on connector)
      await loadVVAULTModules(); // Ensure modules are loaded
      await writeTranscript({
        userId,
        userEmail: req.user?.email,
        supabaseUserId, // Use Supabase UUID for vault_files
        sessionId: session,
        timestamp: new Date().toISOString(),
        role: "system",
        content: `CONVERSATION_CREATED:${title}`,
        title,
        constructId: constructId || 'zen-001',
        constructName: title,
        constructCallsign: constructId
      });
      console.log(`✅ [VVAULT API] Transcript written successfully for session: ${session}`);
    } catch (writeError) {
      console.error(`❌ [VVAULT API] Failed to write transcript:`, writeError);
      console.error(`❌ [VVAULT API] Write error stack:`, writeError.stack);
      throw new Error(`Failed to write conversation transcript: ${writeError.message}`);
    }

    console.log(`✅ [VVAULT API] Conversation created successfully: ${session}`);
    res.status(201).json({
      ok: true,
      conversation: {
        sessionId: session,
        title
      }
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to create conversation:", error);
    console.error("❌ [VVAULT API] Error stack:", error.stack);
    console.error("❌ [VVAULT API] Error details:", {
      name: error.name,
      message: error.message,
      code: error.code,
      userId,
      email: req.user?.email,
      sessionId: session,
      constructId
    });

    res.status(500).json({
      ok: false,
      error: "Failed to create VVAULT conversation",
      details: error.message || 'Unknown error',
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
});

router.post("/conversations/:sessionId/messages", async (req, res) => {
  const resolved = await resolveRequestUserForVvault(res, req);
  if (!resolved) return;
  const { supabaseUserId, userId } = resolved;

  const { sessionId } = req.params;
  const { role, content, timestamp, title, metadata, constructId, constructName, packets } = req.body || {};

  if (!role) {
    res.status(400).json({ ok: false, error: "Missing role" });
    return;
  }

  // Extract content from packets if content is empty but packets exist
  let finalContent = content;
  if ((!finalContent || finalContent.trim() === '') && Array.isArray(packets)) {
    console.log('📦 [VVAULT API] Extracting content from packets...');
    console.log(`📦 [VVAULT API] Packets array length: ${packets.length}`);
    finalContent = packets
      .map(packet => {
        if (!packet) return '';
        if (packet.op === 'answer.v1' && packet.payload?.content) {
          const extracted = packet.payload.content;
          console.log(`✅ [VVAULT API] Extracted content from packet: ${extracted.substring(0, 50)}${extracted.length > 50 ? '...' : ''}`);
          return extracted;
        }
        try {
          return JSON.stringify(packet.payload ?? packet);
        } catch {
          return '';
        }
      })
      .filter(Boolean)
      .join('\n\n');
    console.log(`📝 [VVAULT API] Final extracted content length: ${finalContent.length}`);
  }

  if (!finalContent || finalContent.trim() === '') {
    const hasAttachments = Array.isArray(metadata?.attachments) && metadata.attachments.length > 0;
    if (!hasAttachments) {
      res.status(400).json({ ok: false, error: "Missing content (empty message)" });
      return;
    }
    console.log(`📎 [VVAULT API] Allowing attachment-only message for ${sessionId} (${metadata.attachments.length} attachments)`);
    finalContent = '';
  }

  try {
    // Ensure modules are loaded for standalone writeTranscript function
    await loadVVAULTModules();
    // CRITICAL: Always use constructCallsign format (e.g., "zen-001"), never just "zen"
    const actualConstructId = constructId || metadata?.constructId || 'zen-001';
    const actualConstructCallsign = metadata?.constructCallsign || constructId || metadata?.constructId;

    await writeTranscript({
      userId,
      userEmail: req.user?.email,
      supabaseUserId,
      sessionId,
      timestamp: timestamp || new Date().toISOString(),
      role,
      content: finalContent,
      title: title || (actualConstructId ? actualConstructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase()) : 'Conversation'),
      metadata,
      constructId: actualConstructId,
      constructName: constructName || metadata?.constructName || (actualConstructId ? actualConstructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase()) : 'Assistant'),
      constructCallsign: actualConstructCallsign
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to append message:", error);
    res.status(500).json({ ok: false, error: "Failed to save VVAULT message" });
  }
});

router.post("/construct/:constructId/ledger/generate", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructId } = req.params;
  if (!constructId) return res.status(400).json({ ok: false, error: "Missing constructId" });

  try {
    const { generateLedger, storeLedger } = await import('../lib/continuityParser.js');
    const ledger = await generateLedger(constructId);
    if (ledger.error) {
      return res.status(404).json({ ok: false, error: ledger.error });
    }

    await storeLedger(constructId, ledger);

    res.json({
      ok: true,
      constructId,
      sessionCount: ledger.sessionCount,
      dateRange: ledger.dateRange,
      continuityHooks: ledger.continuityHooks,
      generationTimeMs: ledger.generationTimeMs,
      sessions: ledger.sessions
    });
  } catch (error) {
    console.error(`❌ [Ledger] Generation failed for ${constructId}:`, error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/construct/:constructId/ledger", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructId } = req.params;
  if (!constructId) return res.status(400).json({ ok: false, error: "Missing constructId" });

  try {
    const { loadLedger } = await import('../lib/continuityParser.js');
    const ledger = await loadLedger(constructId);
    if (!ledger) {
      return res.status(404).json({ ok: false, error: `No ledger found for ${constructId}. Generate one first.` });
    }

    res.json({ ok: true, ...ledger });
  } catch (error) {
    console.error(`❌ [Ledger] Load failed for ${constructId}:`, error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/identity/query", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const {
    constructCallsign,
    query,
    limit = 10,
    queryMode = 'semantic',
    anchorTypes,
    minSignificance,
    relationshipPatterns,
    emotionalState
  } = req.query || {};

  if (!constructCallsign || !query) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign or query" });
  }

  try {
    // FORCE MODE: Use capsule-based memory instead of ChromaDB
    if (process.env.ENABLE_CHROMADB !== 'true') {
      console.log('🔄 [VVAULT API] ChromaDB disabled - using capsule-based memory for', constructCallsign);

      try {
        // Import capsule integration to get transcript-based memories
        const { getCapsuleIntegration } = await import('../lib/capsuleIntegration.js');
        const capsuleIntegration = getCapsuleIntegration();

        // Normalize construct ID (remove 'gpt-' prefix if present)
        const normalizedConstructId = constructCallsign.startsWith('gpt-')
          ? constructCallsign.substring(4)
          : constructCallsign;

        console.log(`🔍 [VVAULT API] Normalized ${constructCallsign} → ${normalizedConstructId}`);

        // Load capsule for the construct
        const capsule = await capsuleIntegration.loadCapsule(normalizedConstructId);

        if (capsule && capsule.transcript_data) {
          console.log(`📊 [VVAULT API] Capsule loaded with ${capsule.transcript_data.topics?.length || 0} topics, ${capsule.transcript_data.entities?.length || 0} entities`);

          // Search through capsule transcript data for relevant memories
          const memories = [];
          const queryLower = query.toLowerCase();

          console.log(`🔍 [VVAULT API] Searching for: "${queryLower}"`);

          // Search through topics for relevant matches
          if (capsule.transcript_data.topics) {
            for (const topic of capsule.transcript_data.topics.slice(0, parseInt(limit))) {
              if (topic.topic && typeof topic.topic === 'string' &&
                (topic.topic.toLowerCase().includes(queryLower) ||
                  queryLower.includes(topic.topic.toLowerCase()))) {

                // Add examples from this topic as memories
                if (topic.examples && topic.examples.length > 0) {
                  for (const example of topic.examples.slice(0, 2)) {
                    memories.push({
                      context: example.user_snippet || `Discussion about ${topic.topic}`,
                      response: example.assistant_snippet || `Relevant to ${topic.topic} (${topic.frequency} mentions)`,
                      timestamp: new Date().toISOString(),
                      relevance: 0.8 // High relevance since it matched the topic
                    });
                  }
                }
              }
            }
          }

          // Search through entities for relevant matches
          if (capsule.transcript_data.entities && memories.length < parseInt(limit)) {
            for (const entity of capsule.transcript_data.entities) {
              if (entity.name && typeof entity.name === 'string' &&
                (entity.name.toLowerCase().includes(queryLower) ||
                  queryLower.includes(entity.name.toLowerCase()))) {

                // Add context from this entity as memories
                if (entity.context && entity.context.length > 0) {
                  for (const context of entity.context.slice(0, 1)) {
                    memories.push({
                      context: context.user_snippet || `About ${entity.name}`,
                      response: context.assistant_snippet || `${entity.name} mentioned ${entity.frequency} times`,
                      timestamp: new Date().toISOString(),
                      relevance: 0.7 // Good relevance for entity matches
                    });
                  }
                }
              }
            }
          }

          console.log(`✅ [VVAULT API] Found ${memories.length} capsule-based memories for "${query}"`);
          return res.json({
            ok: true,
            memories: memories.slice(0, parseInt(limit)),
            source: "capsule-transcript-data"
          });
        } else {
          console.log(`⚠️ [VVAULT API] Capsule structure: ${capsule ? 'exists' : 'null'}, transcript_data: ${capsule?.transcript_data ? 'exists' : 'missing'}`);

          // Final fallback: return empty but don't break the conversation
          console.log('🚫 [VVAULT API] No capsule memories found - returning empty result');
          return res.json({
            ok: true,
            memories: [],
            message: "No memories available (capsule-based fallback)"
          });
        }
      } catch (capsuleError) {
        console.warn('⚠️ [VVAULT API] Capsule memory fallback failed:', capsuleError.message);
      }

      // Final fallback: return empty but don't break the conversation
      console.log('🚫 [VVAULT API] No capsule memories found - returning empty result');
      return res.json({
        ok: true,
        memories: [],
        message: "No memories available (capsule-based fallback)"
      });
    }

    const { getIdentityService } = await import('../services/identityService.js');
    const identityService = getIdentityService();

    // Parse anchor-based query options
    const options = {
      queryMode: queryMode === 'anchor' ? 'anchor' : 'semantic',
      anchorTypes: anchorTypes ? anchorTypes.split(',').filter(Boolean) : [],
      minSignificance: minSignificance ? parseFloat(minSignificance) : 0,
      relationshipPatterns: relationshipPatterns ? relationshipPatterns.split(',').filter(Boolean) : [],
      emotionalState: emotionalState || undefined,
    };

    // Try both callsign variants (e.g., "example-construct-001" and "gpt-example-construct-001")
    const callsignVariants = normalizeConstructCallsigns(constructCallsign);
    let identities = [];

    for (const variant of callsignVariants) {
      try {
        const results = await identityService.queryIdentities(
          userId,
          variant,
          query,
          parseInt(limit, 10),
          options
        );

        if (results && results.length > 0) {
          identities = results;
          console.log(`✅ [VVAULT API] Found ${identities.length} memories using callsign: ${variant}`);
          break;
        }
      } catch (variantError) {
        console.warn(`⚠️ [VVAULT API] Failed to query with callsign ${variant}:`, variantError.message);
        continue;
      }
    }

    if (identities.length === 0) {
      console.log(`ℹ️ [VVAULT API] No memories found for any callsign variant: ${callsignVariants.join(', ')}`);
    }

    res.json({
      ok: true,
      memories: identities // Keep "memories" key for backward compatibility with frontend
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to query identity:", error);
    res.status(500).json({ ok: false, error: "Failed to query identity" });
  }
});

// ChromaDB service diagnostic endpoint (no construct required)
router.get("/chromadb/status", async (req, res) => {
  try {
    const { getChromaDBService } = await import('../services/chromadbService.js');
    const chromaService = getChromaDBService();
    const status = await chromaService.getStatus();

    res.json({
      ok: true,
      chromaDB: status
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to get ChromaDB status:", error);
    res.status(500).json({ ok: false, error: "Failed to get ChromaDB status", details: error.message });
  }
});

// Re-index existing transcripts from VVAULT filesystem to ChromaDB
router.post("/identity/reindex", requireAuth, async (req, res) => {
  const resolved = await resolveRequestUserForVvault(res, req);
  if (!resolved) return;
  const { supabaseUserId, userId } = resolved;

  const { constructCallsign } = req.body || {};

  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    // Ensure ChromaDB is ready
    const { initializeChromaDB, getChromaDBService } = await import('../services/chromadbService.js');
    const { getIdentityService } = await import('../services/identityService.js');
    const { getHybridMemoryService } = require('../services/hybridMemoryService.js');

    await initializeChromaDB();
    const chromaService = getChromaDBService();
    const chromaReady = await chromaService.waitForReady(60000);
    if (!chromaReady) {
      return res.status(503).json({
        ok: false,
        error: "ChromaDB not ready",
        details: "ChromaDB failed to report heartbeat within 60s"
      });
    }

    const identityService = getIdentityService();
    await identityService.initialize();
    if (!identityService.client) {
      return res.status(503).json({
        ok: false,
        error: "IdentityService not connected",
        details: "ChromaDB client unavailable"
      });
    }

    if (!supabaseUserId) {
      return res.status(400).json({ ok: false, error: "Failed to resolve Supabase user ID" });
    }

    // Load VVAULT modules to get VVAULT_ROOT
    await loadVVAULTModules();

    // Try both callsign variants (example-construct-001 and gpt-example-construct-001)
    const callsignVariants = normalizeConstructCallsigns(constructCallsign);

    // Find all transcript files in VVAULT for this construct (try all variants)
    const fs = require('fs').promises;
    const path = require('path');
    const transcriptPaths = [];

    async function scanTranscriptFolder(rootPath, variant, maxDepth = 5, depth = 0) {
      try {
        const entries = await fs.readdir(rootPath, { withFileTypes: true });
        for (const entry of entries) {
          const filePath = path.join(rootPath, entry.name);
          if (entry.isDirectory()) {
            if (depth < maxDepth) {
              await scanTranscriptFolder(filePath, variant, maxDepth, depth + 1);
            }
            continue;
          }
          if (!entry.isFile()) continue;
          if (!/\.(md|txt|json|log|rtf)$/i.test(entry.name)) continue;
          transcriptPaths.push({ path: filePath, variant });
        }
      } catch (_) {
        // Folder missing or unreadable is non-fatal for reindex scans.
      }
    }

    const sourceFolders = canonicalSourceFolderList();

    for (const variant of callsignVariants) {
      const instancePath = path.join(VVAULT_ROOT, 'users', 'shard_0000', supabaseUserId, 'instances', variant);
      const foldersToScan = new Set([
        'identity',
        ...sourceFolders,
        'character_ai', // legacy alias
        'documents',    // legacy transcript location
      ]);

      for (const folder of foldersToScan) {
        await scanTranscriptFolder(path.join(instancePath, folder), variant);
      }
    }

    console.log(`📦 [reindex] Found ${transcriptPaths.length} transcript files to re-index for ${constructCallsign}`);

    // Deduplicate transcript paths while preserving distinct files with same basename.
    const uniquePaths = new Map();
    for (const item of transcriptPaths) {
      const key = item.path;
      if (!uniquePaths.has(key)) {
        uniquePaths.set(key, item);
      }
    }

    // Re-index each unique transcript (index to all callsign variants)
    const hybridMemoryService = getHybridMemoryService();
    const results = [];
    let totalImported = 0;
    let totalAnchors = 0;

    for (const [, item] of uniquePaths) {
      const filename = path.basename(item.path);
      // Index to all callsign variants so queries work regardless of format
      for (const variant of callsignVariants) {
        try {
          const indexResult = await hybridMemoryService.autoIndexTranscript(
            userId,
            variant,
            item.path
          );

          if (indexResult.success) {
            totalImported += indexResult.importedCount || 0;
            totalAnchors += indexResult.anchorsExtracted || 0;
            results.push({
              file: filename,
              variant,
              success: true,
              imported: indexResult.importedCount || 0,
              anchors: indexResult.anchorsExtracted || 0
            });
          } else {
            results.push({
              file: filename,
              variant,
              success: false,
              error: indexResult.error
            });
          }
        } catch (error) {
          results.push({
            file: filename,
            variant,
            success: false,
            error: error.message
          });
        }
      }
    }

    res.json({
      ok: true,
      constructCallsign,
      filesProcessed: transcriptPaths.length,
      totalImported,
      totalAnchors,
      results
    });
  } catch (error) {
    console.error('❌ [VVAULT API] Failed to re-index transcripts:', error);
    res.status(500).json({
      ok: false,
      error: "Failed to re-index transcripts",
      details: error.message
    });
  }
});

router.post("/capsules/maintain", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { force = false, dryRun = false } = req.body;

  try {
    const { CapsuleMaintenanceService } = await import('../lib/capsuleMaintenance.js');

    // Lazy load config to get VVAULT_ROOT
    await loadVVAULTModules();

    const service = new CapsuleMaintenanceService(VVAULT_ROOT);
    const result = await service.runMaintenance({ force, dryRun });

    res.json({
      ok: true,
      result
    });
  } catch (error) {
    console.error('❌ [VVAULT API] Failed to run capsule maintenance:', error);
    res.status(500).json({ ok: false, error: 'Capsule maintenance failed' });
  }
});

router.post("/capsules/generate", async (req, res) => {
  try {
    const { initializeChromaDB, getChromaDBService } = await import('../services/chromadbService.js');

    console.log('🔄 [chromadb/start] Manual start requested...');
    const started = await initializeChromaDB();

    if (!started) {
      const chromaService = getChromaDBService();
      const status = await chromaService.getStatus();
      return res.status(503).json({
        ok: false,
        error: "ChromaDB failed to start",
        details: status.lastError || "Startup failed",
        status
      });
    }

    const chromaService = getChromaDBService();
    const ready = await chromaService.waitForReady(60000);
    const status = await chromaService.getStatus();

    if (!ready) {
      return res.status(503).json({
        ok: false,
        error: "ChromaDB started but not ready",
        details: status.lastError || "Failed to report heartbeat within 60s",
        status
      });
    }

    // Ensure health monitor is running
    chromaService.startHealthMonitor();

    res.json({
      ok: true,
      message: "ChromaDB started and ready",
      status
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to start ChromaDB:", error);
    res.status(500).json({ ok: false, error: "Failed to start ChromaDB", details: error.message });
  }
});

// Manual ChromaDB start endpoint (for recovery)
router.post("/chromadb/start", async (req, res) => {
  try {
    const { initializeChromaDB, getChromaDBService } = await import('../services/chromadbService.js');

    console.log('🔄 [chromadb/start] Manual start requested...');
    const started = await initializeChromaDB();

    if (!started) {
      const chromaService = getChromaDBService();
      const status = await chromaService.getStatus();
      return res.status(503).json({
        ok: false,
        error: "ChromaDB failed to start",
        details: status.lastError || "Startup failed",
        status
      });
    }

    const chromaService = getChromaDBService();
    const ready = await chromaService.waitForReady(60000);
    const status = await chromaService.getStatus();

    if (!ready) {
      return res.status(503).json({
        ok: false,
        error: "ChromaDB started but not ready",
        details: status.lastError || "Failed to report heartbeat within 60s",
        status
      });
    }

    // Ensure health monitor is running
    chromaService.startHealthMonitor();

    res.json({
      ok: true,
      message: "ChromaDB started and ready",
      status
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to start ChromaDB:", error);
    res.status(500).json({ ok: false, error: "Failed to start ChromaDB", details: error.message });
  }
});

// Diagnostic endpoint for ChromaDB debugging
router.get("/identity/diagnostic", async (req, res) => {
  const resolved = await resolveRequestUserForVvault(res, req);
  if (!resolved) return;
  const { supabaseUserId, userId } = resolved;

  const { constructCallsign } = req.query || {};

  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    const { getChromaDBService } = await import('../services/chromadbService.js');
    const chromaService = getChromaDBService();
    const chromaStatus = await chromaService.getStatus();

    const { getIdentityService } = await import('../services/identityService.js');
    const identityService = getIdentityService();

    // Check ChromaDB initialization
    const isInitialized = identityService.initialized;
    const hasClient = !!identityService.client;

    // Try to get collection info
    let shortTermCount = 0;
    let longTermCount = 0;
    let shortTermCollection = null;
    let longTermCollection = null;
    let sampleMemories = [];

    if (isInitialized && hasClient && supabaseUserId) {
      try {
        // Try to get collections (keyed by Supabase user ID)
        try {
          shortTermCollection = await identityService.getCollection(supabaseUserId, constructCallsign, 'short-term');
          const shortTermData = await shortTermCollection.get();
          shortTermCount = shortTermData.ids?.length || 0;
          console.log(`📊 [Diagnostic] Short-term collection has ${shortTermCount} memories`);
        } catch (e) {
          // Collection doesn't exist yet
          console.log(`📊 [Diagnostic] Short-term collection doesn't exist yet`);
        }

        try {
          longTermCollection = await identityService.getCollection(supabaseUserId, constructCallsign, 'long-term');
            const longTermData = await longTermCollection.get();
          longTermCount = longTermData.ids?.length || 0;
          console.log(`📊 [Diagnostic] Long-term collection has ${longTermCount} memories`);
        } catch (e) {
          // Collection doesn't exist yet
          console.log(`📊 [Diagnostic] Long-term collection doesn't exist yet`);
        }

        try {
          sampleMemories = await identityService.queryIdentities(
            userId,
            constructCallsign,
            'memory',
            5
          );
        } catch (e) {
          // Query failed
        }
      } catch (error) {
        // Error getting collections
      }
    }

    // Test ChromaDB heartbeat
    let chromaDbAvailable = false;
    let chromaDbUrl = process.env.CHROMA_SERVER_URL || 'http://localhost:8000';
    if (hasClient) {
      try {
        await identityService.client.heartbeat();
        chromaDbAvailable = true;
      } catch (e) {
        chromaDbAvailable = false;
      }
    }

    res.json({
      ok: true,
      diagnostic: {
        chromaDb: {
          initialized: isInitialized,
          clientAvailable: hasClient,
          serverAvailable: chromaDbAvailable,
          serverUrl: chromaDbUrl,
          serviceStatus: chromaStatus
        },
        construct: {
          callsign: constructCallsign,
          shortTermMemories: shortTermCount,
          longTermMemories: longTermCount,
          totalMemories: shortTermCount + longTermCount
        },
        sampleMemories: sampleMemories.slice(0, 3).map(m => ({
          context: m.context?.substring(0, 100),
          response: m.response?.substring(0, 100),
          timestamp: m.timestamp,
          relevance: m.relevance
        }))
      }
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to get diagnostic info:", error);
    res.status(500).json({ ok: false, error: "Failed to get diagnostic info", details: error.message });
  }
});

router.post("/identity/ensure-ready", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const {
    constructCallsign = 'example-construct-001',
    minMemories = 10,
    forceSeed = false,
    includeVariants = true
  } = req.body || {};

  try {
    // FORCE MODE: Skip ChromaDB ensure-ready when disabled
    if (process.env.ENABLE_CHROMADB !== 'true') {
      console.log('🚫 [ensure-ready] ChromaDB disabled in FORCE MODE - returning ready status');
      return res.json({
        ok: true,
        ready: true,
        message: "FORCE MODE: ChromaDB bypassed, using capsule-based memory",
        constructCallsign,
        timestamp: new Date().toISOString()
      });
    }

    const { initializeChromaDB, getChromaDBService } = await import('../services/chromadbService.js');
    const { getIdentityService } = await import('../services/identityService.js');

    console.log('🔄 [ensure-ready] Initializing ChromaDB...');
    const initResult = await initializeChromaDB();
    if (!initResult) {
      const chromaService = getChromaDBService();
      const status = await chromaService.getStatus();
      return res.status(503).json({
        ok: false,
        error: "ChromaDB failed to start",
        details: status.lastError || "ChromaDB installation or startup failed",
        status: {
          processAlive: status.processAlive,
          starting: status.starting,
          chromaPath: status.chromaPath,
          lastLogLines: status.lastLogLines
        }
      });
    }

    const chromaService = getChromaDBService();
    console.log('⏳ [ensure-ready] Waiting for ChromaDB to be ready (up to 60s)...');
    const chromaReady = await chromaService.waitForReady(60000);
    if (!chromaReady) {
      const status = await chromaService.getStatus();
      return res.status(503).json({
        ok: false,
        error: "ChromaDB not ready",
        details: status.lastError || "ChromaDB failed to report heartbeat within 60s",
        status: {
          processAlive: status.processAlive,
          starting: status.starting,
          chromaPath: status.chromaPath,
          lastLogLines: status.lastLogLines
        }
      });
    }

    console.log('✅ [ensure-ready] ChromaDB confirmed ready');

    const identityService = getIdentityService();
    await identityService.initialize();
    if (!identityService.client) {
      return res.status(503).json({
        ok: false,
        error: "IdentityService not connected",
        details: "ChromaDB client unavailable after initialization"
      });
    }

    const fixtures = buildTestMemoryFixtures();
    const callsigns = includeVariants ? normalizeConstructCallsigns(constructCallsign) : [constructCallsign];
    const status = [];
    let totalSeeded = 0;

    for (const callsign of callsigns) {
      const sampleBefore = await identityService.queryIdentities(userId, callsign, 'memory', minMemories);
      let added = 0;
      let seeded = false;

      if (forceSeed || sampleBefore.length < minMemories) {
        added = await seedFixturesForCallsign(
          identityService,
          userId,
          callsign,
          fixtures,
          {
            email: req.user?.email,
            seedSource: 'auto-test-fixtures',
            sourceModel: 'memory-fixture'
          }
        );
        seeded = added > 0;
        totalSeeded += added;
      }

      const sampleAfter = await identityService.queryIdentities(userId, callsign, 'memory', minMemories);

      status.push({
        constructCallsign: callsign,
        sampleBefore: sampleBefore.length,
        sampleAfter: sampleAfter.length,
        seeded,
        added
      });
    }

    res.json({
      ok: true,
      chromaReady: true,
      identityReady: true,
      totalSeeded,
      status
    });
  } catch (error) {
    console.error('❌ [VVAULT API] Failed to ensure memory readiness:', error);
    res.status(500).json({
      ok: false,
      error: "Failed to ensure memory infrastructure",
      details: error.message
    });
  }
});

// Store message pair in ChromaDB (for Lin conversations)
router.post("/identity/store", requireAuth, async (req, res) => {
  const resolved = await resolveRequestUserForVvault(res, req);
  if (!resolved) return;
  const { supabaseUserId, userId } = resolved;

  const { constructCallsign, context, response, metadata = {} } = req.body || {};
  const providedTimestamp = req.body?.timestamp;

  if (!constructCallsign || !context || !response) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign, context, or response" });
  }

  try {
    // FORCE MODE: Skip ChromaDB-dependent identity storage
    if (process.env.ENABLE_CHROMADB !== 'true') {
      console.log('🚫 [VVAULT API] Identity store skipped in FORCE MODE - returning success without ChromaDB storage');
      return res.json({
        ok: true,
        skipped: true,
        message: "Identity storage disabled in FORCE MODE (ChromaDB not available)",
        timestamp: new Date().toISOString()
      });
    }

    const { getIdentityService } = await import('../services/identityService.js');
    const identityService = getIdentityService();

    if (!supabaseUserId) {
      throw new Error(`Cannot resolve Supabase user ID for: ${userId}`);
    }

    const result = await identityService.addIdentity(
      supabaseUserId,
      constructCallsign,
      context,
      response,
      {
        email: req.user?.email,
        ...metadata,
        timestamp: metadata.timestamp || providedTimestamp
      }
    );

    res.json({
      ok: true,
      success: result.success,
      id: result.id,
      duplicate: result.duplicate || false,
      skipped: result.skipped || false,
      reason: result.reason || undefined
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to store identity:", error);
    console.error("❌ [VVAULT API] Error details:", {
      message: error.message,
      stack: error.stack,
      userId,
      constructCallsign,
      contextLength: context?.length,
      responseLength: response?.length
    });
    res.status(500).json({
      ok: false,
      error: "Failed to store identity",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get("/identity/list", async (req, res) => {
  // Diagnostic logging: Route entry point
  console.log(`🔍 [VVAULT API] /identity/list route hit`);
  console.log(`🔍 [VVAULT API] Request method: ${req.method}, path: ${req.path}, url: ${req.url}`);
  console.log(`🔍 [VVAULT API] Query params:`, req.query);
  console.log(`🔍 [VVAULT API] Auth status - req.user:`, req.user ? 'present' : 'missing');
  console.log(`🔍 [VVAULT API] req.user details:`, req.user ? { id: req.user.id || req.user.sub, email: req.user.email } : 'none');

  // Check if auth middleware passed
  if (!req.user) {
    console.log(`❌ [VVAULT API] /identity/list - req.user is missing, auth middleware may have failed`);
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }

  const resolved = await resolveRequestUserForVvault(res, req);
  if (!resolved) {
    console.log(`❌ [VVAULT API] /identity/list - resolveRequestUserForVvault returned null, response already sent`);
    return;
  }
  const { supabaseUserId, userId } = resolved;
  console.log(`✅ [VVAULT API] /identity/list - User validated: ${userId}`);

  const { constructCallsign } = req.query || {};

  if (!constructCallsign) {
    console.log(`❌ [VVAULT API] /identity/list - Missing constructCallsign in query params`);
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  console.log(`📋 [VVAULT API] Listing identity files for construct: ${constructCallsign}, user: ${userId}`);

  try {
    await loadVVAULTModules();
    const fs = require('fs').promises;
    const path = require('path');

    if (!supabaseUserId) {
      return res.status(500).json({
        ok: false,
        error: "Failed to resolve Supabase user ID"
      });
    }

    console.log(`✅ [VVAULT API] Supabase user ID: ${supabaseUserId?.slice(0, 8)}...`);

    // Build base path to instance directory
    const shard = 'shard_0000';
    const instanceBasePath = path.join(
      VVAULT_ROOT,
      'users',
      shard,
      supabaseUserId,
      'instances',
      constructCallsign
    );

    console.log(`🔍 [VVAULT API] Instance base path: ${instanceBasePath}`);
    console.log(`🔍 [VVAULT API] VVAULT_ROOT: ${VVAULT_ROOT}`);

    // Check both identity and chatgpt directories (legacy support)
    const directoriesToCheck = ['identity', 'chatgpt'];
    const identityFiles = [];

    for (const dirName of directoriesToCheck) {
      const dirPath = path.join(instanceBasePath, dirName);
      console.log(`🔍 [VVAULT API] Checking directory: ${dirPath}`);

      // Check if directory exists
      try {
        await fs.access(dirPath);
        console.log(`✅ [VVAULT API] Directory exists: ${dirPath}`);
      } catch (error) {
        // Directory doesn't exist, skip it
        console.log(`ℹ️ [VVAULT API] Directory does not exist: ${dirPath}, skipping`);
        continue;
      }

      // Read directory and filter for identity files
      try {
        const files = await fs.readdir(dirPath, { withFileTypes: true });
        console.log(`📁 [VVAULT API] Found ${files.length} items in ${dirPath}`);

        for (const file of files) {
          if (file.isFile()) {
            const filePath = path.join(dirPath, file.name);
            const ext = path.extname(file.name).toLowerCase();

            // Only include supported file types
            if (['.md', '.txt', '.pdf', '.doc', '.docx', '.csv', '.json'].includes(ext)) {
              try {
                const stats = await fs.stat(filePath);
                identityFiles.push({
                  name: file.name,
                  path: filePath,
                  size: stats.size,
                  modifiedAt: stats.mtime.toISOString(),
                  source: dirName // Track which directory the file came from
                });
                console.log(`✅ [VVAULT API] Added file: ${file.name} (${stats.size} bytes)`);
              } catch (error) {
                console.warn(`⚠️ [VVAULT API] Failed to stat file ${file.name}:`, error);
              }
            } else {
              console.log(`ℹ️ [VVAULT API] Skipping unsupported file type: ${file.name} (${ext})`);
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ [VVAULT API] Failed to read directory ${dirPath}:`, error);
      }
    }

    // Sort by modified date (newest first)
    identityFiles.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

    console.log(`✅ [VVAULT API] Returning ${identityFiles.length} identity files for ${constructCallsign}`);
    res.json({
      ok: true,
      files: identityFiles
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to list identity files:", error);
    console.error("❌ [VVAULT API] Error stack:", error.stack);

    // Distinguish between different error types
    if (error.code === 'ENOENT') {
      return res.status(404).json({
        ok: false,
        error: "Directory not found in VVAULT",
        constructCallsign: constructCallsign,
        details: error.message
      });
    }

    if (error.message && error.message.includes('VVAULT')) {
      return res.status(500).json({
        ok: false,
        error: "VVAULT system error",
        details: error.message
      });
    }

    res.status(500).json({
      ok: false,
      error: "Failed to list identity files",
      details: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
});

// Get and parse prompt.txt for a construct
router.get("/identity/prompt", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign } = req.query || {};

  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    const { loadIdentityFiles } = await import('../lib/identityLoader.js');
    const identity = await loadIdentityFiles(userId, constructCallsign, false);

    if (!identity || !identity.prompt) {
      return res.status(404).json({ 
        ok: false, 
        error: "prompt.txt not found",
        constructCallsign 
      });
    }

    // Parse prompt.txt using the parser utility
    const { parsePromptTxt } = await import('../lib/promptParser.js');
    const parsed = parsePromptTxt(identity.prompt);

    res.json({
      ok: true,
      prompt: identity.prompt,
      parsed: {
        name: parsed.name,
        description: parsed.description,
        instructions: parsed.instructions
      },
      constructCallsign
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to load prompt.txt:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to load prompt.txt",
      details: error.message
    });
  }
});

router.get("/identity/blueprint", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const constructCallsign = (req.query.constructCallsign || '').toString().trim();
  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  let constructId, callsign;
  try {
    const parsed = parseConstructIdentifiers(constructCallsign);
    constructId = parsed.constructId;
    callsign = parsed.callsign;
  } catch (parseError) {
    console.error("❌ [VVAULT API] Failed to parse constructCallsign:", parseError);
    return res.status(400).json({
      ok: false,
      error: "Invalid constructCallsign format",
      details: process.env.NODE_ENV === 'development' ? parseError.message : undefined
    });
  }

  try {
    // Ensure VVAULT modules (and VVAULT_ROOT) are loaded
    await loadVVAULTModules();
    if (!VVAULT_ROOT) {
      console.log('❌ [VVAULT API] VVAULT_ROOT not configured - cannot load blueprint');
      return res.status(500).json({ ok: false, error: "VVAULT_ROOT not configured" });
    }

    // Import IdentityMatcher with error handling
    let IdentityMatcher;
    try {
      // Try .ts extension first (for TypeScript source), fallback to .js
      try {
        const module = await import('../../src/engine/character/IdentityMatcher.ts');
        IdentityMatcher = module.IdentityMatcher;
      } catch (tsError) {
        // Fallback to .js extension
        const module = await import('../../src/engine/character/IdentityMatcher.js');
        IdentityMatcher = module.IdentityMatcher;
      }

      if (!IdentityMatcher) {
        throw new Error('IdentityMatcher not exported from module');
      }
    } catch (importError) {
      // If import fails, blueprint system may not be available - return 404 (expected)
      console.log(`ℹ️ [VVAULT API] IdentityMatcher not available, blueprint not found for user: ${userId}, construct: ${constructId}-${callsign}`);
      return res.status(404).json({ ok: false, error: "Blueprint not found" });
    }

    // Instantiate IdentityMatcher with error handling
    let matcher;
    try {
      matcher = new IdentityMatcher(VVAULT_ROOT);
    } catch (constructorError) {
      // If constructor fails, blueprint system may not be available - return 404 (expected)
      console.log(`ℹ️ [VVAULT API] IdentityMatcher constructor failed, blueprint not found for user: ${userId}, construct: ${constructId}-${callsign}`);
      return res.status(404).json({ ok: false, error: "Blueprint not found" });
    }

    // loadPersonalityBlueprint returns null on error, doesn't throw
    // Try with parsed constructId/callsign first, then try with full callsign if that fails
    let blueprint;
    try {
      blueprint = await matcher.loadPersonalityBlueprint('' + userId, constructId, callsign);

      if (!blueprint) {
        console.log(`🔄 [VVAULT API] Blueprint not found using parsed identifiers for ${constructCallsign}. Trying additional variants...`);
        const normalized = canonicalizeConstructId(constructCallsign);

        // Try using normalized callsign as constructId/callsign pair
        if (normalized.includes('-')) {
          const parts = normalized.split('-');
          const altConstruct = parts[0];
          const altCallsign = parts.slice(1).join('-') || '001';
          blueprint = await matcher.loadPersonalityBlueprint('' + userId, altConstruct, altCallsign);
        }

        // Try with constructId 'gpt' and the full constructCallsign (covers instances/gpt-example-construct-001)
        if (!blueprint) {
          blueprint = await matcher.loadPersonalityBlueprint('' + userId, 'gpt', constructCallsign);
        }

        // Try with normalized callsign under gpt prefix
        if (!blueprint && normalized !== constructCallsign) {
          blueprint = await matcher.loadPersonalityBlueprint('' + userId, 'gpt', normalized);
        }
      }
    } catch (loadError) {
      // This shouldn't happen (loadPersonalityBlueprint has try-catch), but handle it anyway
      console.log(`ℹ️ [VVAULT API] Error loading blueprint, returning 404 for user: ${userId}, construct: ${constructId}-${callsign}`);
      return res.status(404).json({ ok: false, error: "Blueprint not found" });
    }

    if (!blueprint) {
      console.log(`ℹ️ [VVAULT API] Blueprint not found for user: ${userId}, construct: ${constructId}-${callsign} (constructCallsign=${constructCallsign})`);
      return res.status(404).json({ ok: false, error: "Blueprint not found" });
    }

    res.json({ ok: true, blueprint });
  } catch (error) {
    // This catch handles any completely unexpected errors
    console.error("❌ [VVAULT API] Unexpected error in blueprint endpoint:", {
      error: error.message,
      stack: error.stack?.substring(0, 500),
      userId,
      constructId,
      callsign,
      constructCallsign,
      errorName: error.name,
      errorCode: error.code
    });

    res.status(500).json({
      ok: false,
      error: "Failed to load blueprint",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Legacy endpoint for backward compatibility
router.get("/memories/query", async (req, res) => {
  // Redirect to identity endpoint
  req.url = req.url.replace('/memories/query', '/identity/query');
  return router.handle(req, res);
});

/**
 * Parse transcript text to extract conversation pairs (user/assistant messages)
 * Handles multiple formats:
 * - "You said:" / "The GPT said:" format
 * - "User:" / "Assistant:" format  
 * - Timestamped format: **TIME - Name**: content
 * - Plain text with role indicators
 */
/**
 * Trigger personality extraction from transcript (async, non-blocking)
 */
async function triggerPersonalityExtraction(
  transcriptContent,
  constructCallsign,
  userId,
  transcriptPath,
  filename
) {
  try {
    // Extract construct ID and callsign from constructCallsign
    const constructMatch = constructCallsign.match(/^([a-z]+)-?(\d+)$/i);
    if (!constructMatch) {
      console.warn(`⚠️ [PersonalityExtraction] Invalid construct callsign: ${constructCallsign}`);
      return;
    }

    const constructId = constructMatch[1];
    const callsign = constructMatch[2] || '001';

    // Dynamic import to avoid loading in browser context
    const { DeepTranscriptParser } = await import('../../src/engine/transcript/DeepTranscriptParser.js');
    const { PersonalityExtractor } = await import('../../src/engine/character/PersonalityExtractor.js');
    const { IdentityMatcher } = await import('../../src/engine/character/IdentityMatcher.js');

    // Parse transcript
    const parser = new DeepTranscriptParser();
    const analysis = await parser.parseTranscript(transcriptContent, constructId, transcriptPath);

    // Extract personality blueprint
    const extractor = new PersonalityExtractor();
    const blueprint = await extractor.buildPersonalityBlueprint([analysis]);

    // Persist blueprint
    await loadVVAULTModules();
    if (!VVAULT_ROOT) {
      throw new Error('VVAULT_ROOT not configured');
    }
    const matcher = new IdentityMatcher(VVAULT_ROOT);
    await matcher.persistPersonalityBlueprint(userId, constructId, callsign, blueprint);

    console.log(`✅ [PersonalityExtraction] Extracted and persisted personality blueprint for ${constructCallsign}`);
  } catch (error) {
    console.error('❌ [PersonalityExtraction] Failed:', error);
    throw error;
  }
}

function parseTranscriptForConversationPairs(text, filename) {
  const pairs = [];
  const lines = text.split('\n');

  let currentUser = null;
  let currentAssistant = null;
  let currentUserLines = [];
  let currentAssistantLines = [];
  let inUserMessage = false;
  let inAssistantMessage = false;

  // Normalize construct name from filename (e.g., "Example Construct" from "example-construct-001")
  const constructNameMatch = filename.match(/([a-z]+)-?\d*/i);
  const constructName = constructNameMatch ? constructNameMatch[1].charAt(0).toUpperCase() + constructNameMatch[1].slice(1).toLowerCase() : 'Assistant';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and metadata
    if (!trimmed || trimmed.startsWith('<!--') || trimmed.startsWith('**Source File') ||
      trimmed.startsWith('**Converted') || trimmed.startsWith('**Word Count') ||
      trimmed.startsWith('**File Category') || trimmed.startsWith('# ') ||
      trimmed === '---' || trimmed === 'Skip to content') {
      continue;
    }

    // Pattern 1: "You said:" / "The GPT said:" format
    const youSaidMatch = trimmed.match(/^You said:\s*(.*)$/i);
    if (youSaidMatch) {
      // Save previous pair if exists
      if (currentUser && currentAssistant) {
        pairs.push({
          user: currentUser.trim(),
          assistant: currentAssistant.trim(),
          timestamp: new Date().toISOString()
        });
      }
      // User message might be on same line or next line
      currentUser = youSaidMatch[1] || '';
      currentUserLines = currentUser ? [currentUser] : [];
      currentAssistant = null;
      currentAssistantLines = [];
      inUserMessage = true;
      inAssistantMessage = false;
      continue;
    }

    const constructSaidMatch = trimmed.match(new RegExp(`^${constructName} said:\\s*(.*)$`, 'i'));
    if (constructSaidMatch) {
      // Save previous pair if exists (user message complete)
      if (currentUser && currentAssistant) {
        pairs.push({
          user: currentUser.trim(),
          assistant: currentAssistant.trim(),
          timestamp: new Date().toISOString()
        });
      }
      // Start new assistant message
      currentAssistant = constructSaidMatch[1] || '';
      currentAssistantLines = currentAssistant ? [currentAssistant] : [];
      inUserMessage = false;
      inAssistantMessage = true;
      continue;
    }

    // Pattern 2: "User:" / "Assistant:" format
    const userMatch = trimmed.match(/^(?:User|You):\s*(.*)$/i);
    if (userMatch) {
      if (currentUser && currentAssistant) {
        pairs.push({
          user: currentUser,
          assistant: currentAssistant,
          timestamp: new Date().toISOString()
        });
      }
      currentUser = userMatch[1] || '';
      currentUserLines = currentUser ? [currentUser] : [];
      currentAssistant = null;
      currentAssistantLines = [];
      inUserMessage = true;
      inAssistantMessage = false;
      continue;
    }

    const assistantMatch = trimmed.match(/^(?:Assistant|AI|ChatGPT|Bot|${constructName}):\s*(.*)$/i);
    if (assistantMatch) {
      currentAssistant = assistantMatch[1] || '';
      currentAssistantLines = currentAssistant ? [currentAssistant] : [];
      inUserMessage = false;
      inAssistantMessage = true;
      continue;
    }

    // Pattern 3: Timestamped format **TIME - Name**: content
    const timestampedMatch = trimmed.match(/^\*\*([^*]+)\s*-\s*([^*]+)\*\*:\s*(.+)$/);
    if (timestampedMatch) {
      const [, time, name, content] = timestampedMatch;
      const normalizedName = name.toLowerCase().trim();

      // Check if it's a construct name
      const isConstruct = ['katana', 'synth', 'lin', 'nova', 'assistant', 'ai', 'chatgpt', 'bot'].some(
        c => normalizedName.includes(c)
      );

      if (!isConstruct) {
        // User message
        if (currentUser && currentAssistant) {
          pairs.push({
            user: currentUser,
            assistant: currentAssistant,
            timestamp: time.trim()
          });
        }
        currentUser = content.trim();
        currentUserLines = [currentUser];
        currentAssistant = null;
        currentAssistantLines = [];
      } else {
        // Assistant message
        currentAssistant = content.trim();
        currentAssistantLines = [currentAssistant];
      }
      continue;
    }

    // Continue collecting multi-line messages
    // Only collect if we're in a message state and line is not empty (or allow empty lines within messages)
    if (inUserMessage) {
      if (trimmed || currentUserLines.length > 0) {
        // Allow empty lines within multi-line messages, but skip if it's just whitespace at start
        currentUserLines.push(trimmed);
        currentUser = currentUserLines.join('\n').trim();
      }
    } else if (inAssistantMessage) {
      if (trimmed || currentAssistantLines.length > 0) {
        currentAssistantLines.push(trimmed);
        currentAssistant = currentAssistantLines.join('\n').trim();
      }
    }
  }

  // Save last pair if exists
  if (currentUser && currentAssistant) {
    pairs.push({
      user: currentUser,
      assistant: currentAssistant,
      timestamp: new Date().toISOString()
    });
  }

  return pairs;
}

router.post("/identity/upload", requireAuth, (req, res) => {
  identityUpload.array('files', 10)(req, res, async (err) => {
    if (err) {
      console.error('❌ [VVAULT API] Multer error during identity upload:', err);
      return res.status(400).json({ ok: false, error: err.message || 'Upload failed' });
    }

    const resolved = await resolveRequestUserForVvault(res, req);
    if (!resolved) return;
    const { supabaseUserId, userId } = resolved;
    if (!supabaseUserId) {
      return res.status(400).json({ ok: false, error: "Could not resolve Supabase user ID" });
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ ok: false, error: "No files provided" });
    }

    const { constructCallsign } = req.body || {};
    if (!constructCallsign) {
      return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
    }

    try {
      const { convertFileToMarkdown } = await import('../services/fileToMarkdownConverter.js');
      const results = [];
      const fs = await import('fs/promises');
      const { VVAULT_ROOT } = require('../../vvaultConnector/config.js');

      for (const file of files) {
        try {
          const crypto = require('crypto');
          // Parse file to extract text
          const { ServerFileParser } = await import('../lib/serverFileParser.js');
          const parsed = await ServerFileParser.parseFile(file, {
            maxSize: 10 * 1024 * 1024, // 10MB
            extractText: true,
            storeContent: false
          });

          // Convert to markdown
          const convertTextToMarkdown = (text, filename, metadata) => {
            const timestamp = new Date().toISOString();
            const title = path.basename(filename, path.extname(filename));

            return `# ${title}

**Source File**: ${filename}
**Converted**: ${timestamp}
**Word Count**: ${metadata.wordCount || 0}
**File Category**: ${metadata.fileCategory || 'unknown'}

<!-- FILE_METADATA
sourceFile: ${filename}
convertedAt: ${timestamp}
wordCount: ${metadata.wordCount || 0}
fileCategory: ${metadata.fileCategory || 'unknown'}
programmingLanguage: ${metadata.programmingLanguage || 'none'}
complexity: ${metadata.complexity || 'unknown'}
---

${text}
`;
          };
          const markdown = convertTextToMarkdown(parsed.extractedText, file.originalname || file.name, parsed.metadata);

          const sanitizeFilename = (filename) => {
            if (!filename) return 'untitled';
            const base = path.basename(filename, path.extname(filename));
            return base
              .replace(/[^a-z0-9._-]+/gi, '-')
              .replace(/^-|-$/g, '')
              .substring(0, 100);
          };
          const sanitizedFilename = sanitizeFilename(file.originalname || file.name);
          const hash = crypto.createHash('sha256').update(file.buffer || '').digest('hex').substring(0, 8);
          const hashedFilename = `${sanitizedFilename}-${hash}`;
          const identityDir = path.join(
            VVAULT_ROOT,
            'users',
            'shard_0000',
            supabaseUserId,
            'instances',
            constructCallsign,
            'identity'
          );

          await fs.mkdir(identityDir, { recursive: true });
          const filePath = path.join(identityDir, `${hashedFilename}.md`);

          // Dedup: if file with same hash exists, skip writing new copy
          try {
            await fs.access(filePath);
            console.log(`ℹ️ [VVAULT API] Duplicate identity file detected, skipping write: ${filePath}`);
            results.push({
              success: true,
              duplicate: true,
              filePath,
              metadata: {
                originalName: file.originalname || file.name,
                originalType: file.mimetype || file.type,
                originalSize: file.size,
                wordCount: parsed.metadata.wordCount
              }
            });
            continue;
          } catch {
            // file not found, proceed to write
          }

          await fs.writeFile(filePath, markdown, 'utf8');

          console.log(`✅ [VVAULT API] Identity file saved: ${filePath}`);

          // AUTO-INDEX: Immediately import transcript to ChromaDB (always-on background indexing)
          try {
            const { getHybridMemoryService } = require('../services/hybridMemoryService.js');
            const hybridMemoryService = getHybridMemoryService();

            console.log(`📦 [VVAULT API] Starting auto-index for transcript: ${filePath}`);
            console.log(`📦 [VVAULT API] Construct: ${constructCallsign}, User: ${userId}`);

            // Auto-index transcript to ChromaDB (zero downtime, background process)
            const indexResult = await hybridMemoryService.autoIndexTranscript(
              userId,
              constructCallsign,
              filePath
            );

            if (indexResult.success) {
              console.log(`✅ [VVAULT API] Auto-indexed ${indexResult.importedCount} memories to ChromaDB`);
              if (indexResult.anchorsExtracted && indexResult.anchorsExtracted > 0) {
                console.log(`🔍 [VVAULT API] Extracted ${indexResult.anchorsExtracted} memory anchors from transcript`);
              }
            } else {
              console.warn(`⚠️ [VVAULT API] Auto-indexing failed (non-critical):`, indexResult.error);
            }
          } catch (indexError) {
            console.warn(`⚠️ [VVAULT API] Auto-indexing error (non-critical, transcript still saved):`, indexError);
            console.warn(`⚠️ [VVAULT API] Error details:`, indexError.message);
          }

          // Legacy: Also parse and import conversation pairs (for backward compatibility)
          try {
            const { getIdentityService } = await import('../services/identityService.js');
            const identityService = getIdentityService();

            // Try to parse as transcript with conversation pairs
            const conversationPairs = parseTranscriptForConversationPairs(parsed.extractedText, file.originalname || file.name);

            if (conversationPairs.length > 0) {
              // Import each conversation pair as a separate identity entry
              let importedCount = 0;
              for (const pair of conversationPairs) {
                try {
                  // Skip empty pairs
                  if (!pair.user || !pair.assistant || !pair.user.trim() || !pair.assistant.trim()) {
                    continue;
                  }

                  await identityService.addIdentity(
                    userId,
                    constructCallsign,
                    pair.user.trim(),
                    pair.assistant.trim(),
                    {
                      email: req.user?.email,
                      sessionId: constructCallsign,
                      memoryType: 'long-term',
                      sourceModel: 'chatty-identity',
                      sourceFile: file.originalname || file.name,
                      timestamp: pair.timestamp || new Date().toISOString()
                    }
                  );
                  importedCount++;
                } catch (pairError) {
                  console.warn(`⚠️ [VVAULT API] Failed to import conversation pair (non-critical):`, pairError);
                }
              }
              console.log(`✅ [VVAULT API] Imported ${importedCount} conversation pairs from ${file.originalname || file.name}`);
            } else {
              // Fallback: import entire file as single identity if no pairs found
              const titleMatch = markdown.match(/^#\s+(.+)$/m);
              const title = titleMatch ? titleMatch[1] : file.originalname || 'Untitled';
              const content = markdown.replace(/^#.*$/m, '').trim();

              await identityService.addIdentity(
                userId,
                constructCallsign,
                `Identity file: ${title}`,
                content,
                {
                  email: req.user?.email,
                  sessionId: constructCallsign,
                  memoryType: 'long-term',
                  sourceModel: 'chatty-identity'
                }
              );
              console.log(`✅ [VVAULT API] Imported file as single identity entry: ${file.originalname || file.name}`);
            }
          } catch (identityError) {
            console.warn('⚠️ [VVAULT API] Failed to import identity to ChromaDB (non-critical):', identityError);
          }

          // Trigger deep parsing and personality extraction (async, non-blocking)
          if (conversationPairs.length > 0) {
            triggerPersonalityExtraction(
              parsed.extractedText,
              constructCallsign,
              userId,
              filePath,
              file.originalname || file.name
            ).catch(err => {
              console.warn('⚠️ [VVAULT API] Personality extraction failed (non-critical):', err);
            });
          }

          try {
            const { clearVerifiedMemoryCache, extractAndStoreAnchors } = await import('../lib/verifiedMemoryLoader.js');
            clearVerifiedMemoryCache(constructCallsign);
            console.log(`🔄 [VVAULT API] Cleared verified memory cache for ${constructCallsign} after transcript upload`);

            if (parsed.extractedText && parsed.extractedText.length > 500) {
              extractAndStoreAnchors(constructCallsign, parsed.extractedText, file.originalname || file.name)
                .then(result => {
                  if (result) console.log(`📎 [VVAULT API] Extracted ${result.pairCount} memory anchors for ${constructCallsign}`);
                })
                .catch(err => console.warn(`⚠️ [VVAULT API] Anchor extraction failed (non-critical):`, err.message));
            }
          } catch {}

          results.push({
            success: true,
            filePath,
            metadata: {
              originalName: file.originalname || file.name,
              originalType: file.mimetype || file.type,
              originalSize: file.size,
              wordCount: parsed.metadata.wordCount,
              conversationPairs: conversationPairs.length
            }
          });
        } catch (error) {
          console.error(`❌ [VVAULT API] Failed to process identity file ${file.originalname || file.name}:`, error);
          results.push({
            success: false,
            error: error.message,
            filename: file.originalname || file.name
          });
        }
      }

      return res.status(201).json({
        ok: true,
        results,
        message: `Processed ${results.filter(r => r.success).length} of ${results.length} files`
      });
    } catch (error) {
      console.error("❌ [VVAULT API] Failed to upload identity files:", error);
      return res.status(500).json({ ok: false, error: "Failed to upload identity files" });
    }
  });
});

// Legacy endpoint for backward compatibility
router.post("/memories/upload", requireAuth, (req, res) => {
  identityUpload.array('files', 10)(req, res, (err) => {
    if (err) {
      console.error('❌ [VVAULT API] Multer error during memories upload:', err);
      return res.status(400).json({ ok: false, error: err.message || 'Upload failed' });
    }
    // Redirect to identity endpoint handler logic for backward compatibility
    req.url = req.url.replace('/memories/upload', '/identity/upload');
    return router.handle(req, res);
  });
});

router.post("/conversations/:sessionId/connect-construct", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { sessionId } = req.params;
  const { constructId, gptConfig } = req.body || {};

  if (!constructId) {
    res.status(400).json({ ok: false, error: "Missing constructId" });
    return;
  }

  try {
    await loadVVAULTModules();
    const { updateTranscriptConstructConnection } = require('../../vvaultConnector/updateTranscriptMetadata');
    const success = await updateTranscriptConstructConnection(userId, sessionId, constructId);

    if (!success) {
      res.status(404).json({ ok: false, error: "Conversation not found or not an imported conversation" });
      return;
    }

    res.status(200).json({ ok: true, constructId });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to connect construct:", error);
    res.status(500).json({ ok: false, error: "Failed to connect conversation to construct" });
  }
});

// VVAULT Account Linking Endpoints

/**
 * GET /api/vvault/auth/token
 * Exchange the current Chatty session for a VVAULT bearer token for direct browser calls.
 */
router.get("/auth/token", requireAuth, async (req, res) => {
  try {
    const targets = getVvaultTargets();
    if (!targets.length) {
      const bridgeConfig = getVvaultBridgeConfig();
      return res.status(503).json({
        ok: false,
        error: "VVAULT direct auth is not configured",
        details: {
          missingVvaultUrl: bridgeConfig.missingVvaultUrl,
          missingServiceToken: bridgeConfig.missingServiceToken,
        },
      });
    }

    const email = req.user?.email;
    if (!email) {
      return res.status(401).json({ ok: false, error: "Authentication required" });
    }

    const baseHeaders = {
      "X-Chatty-User": email,
      "X-Chatty-Name": req.user?.name || email.split("@")[0],
    };

    const attempts = [];
    for (const target of targets) {
      const exchangeHeaders = { ...baseHeaders };
      if (target.token) exchangeHeaders["X-Chatty-Key"] = target.token;
      const url = `${target.origin}/api/chatty/session/exchange`;
      try {
        const response = await fetch(url, { method: "POST", headers: exchangeHeaders });

        if (isReplitAsleepResponse(response)) {
          attempts.push({
            name: target.name,
            origin: target.origin,
            status: response.status,
            replitProxyError: response.headers.get(REPLIT_PROXY_ERROR_HEADER) || null,
          });
          continue;
        }

        const data = await response.json().catch(() => ({}));
        if (response.ok && data?.success && data?.token) {
          const apiBaseUrl = data.api_base_url || `${target.origin}/api/vault`;
          return res.json({
            ok: true,
            token: data.token,
            expiresAt: data.expires_at || null,
            apiBaseUrl,
            selectedTargetName: target.name,
            user: data.user || null,
          });
        }

        attempts.push({
          name: target.name,
          origin: target.origin,
          status: response.status,
          replitProxyError: response.headers.get(REPLIT_PROXY_ERROR_HEADER) || null,
        });
        // Wrong key or other downstream error: try next target.
        continue;
      } catch (err) {
        attempts.push({
          name: target.name,
          origin: target.origin,
          status: null,
          errorCode: err?.code || null,
          replitProxyError: null,
        });
        continue;
      }
    }

    return res.status(502).json({
      ok: false,
      error: "Failed to exchange Chatty session for VVAULT token",
      details: { attempts },
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to exchange auth token:", error);
    return res.status(500).json({
      ok: false,
      error: "Failed to exchange VVAULT auth token",
    });
  }
});

/**
 * GET /api/vvault/account/status
 * Check if user has linked a VVAULT account
 */
router.get("/account/status", async (req, res) => {
  try {
    const userId = validateUser(res, req.user);
    if (!userId) return;

    console.log(`🔍 [VVAULT API] Checking account status for userId: ${userId}, email: ${req.user?.email}`);

    // Try multiple query strategies since userId could be sub, id, uid, or _id
    let user = null;
    let hadDbError = false;
    try {
      user = await User.findOne({ id: userId }).select('vvaultPath vvaultUserId vvaultLinkedAt email');
      if (user) console.log(`✅ [VVAULT API] Found user by id field`);
    } catch (err) {
      hadDbError = true;
      console.log(`⚠️ [VVAULT API] Query by id failed:`, err.message);
    }

    // Fallback to email if id query fails
    if (!user && req.user?.email) {
      try {
        user = await User.findOne({ email: req.user.email }).select('vvaultPath vvaultUserId vvaultLinkedAt email');
        if (user) console.log(`✅ [VVAULT API] Found user by email`);
      } catch (err) {
        hadDbError = true;
        console.log(`⚠️ [VVAULT API] Query by email failed:`, err.message);
      }
    }

    // Fallback to _id if it's a MongoDB ObjectId
    if (!user && userId && typeof userId === 'string' && /^[0-9a-fA-F]{24}$/.test(userId)) {
      try {
        user = await User.findById(userId).select('vvaultPath vvaultUserId vvaultLinkedAt email');
        if (user) console.log(`✅ [VVAULT API] Found user by _id`);
      } catch (err) {
        hadDbError = true;
        console.log(`⚠️ [VVAULT API] Query by _id failed:`, err.message);
      }
    }

    if (!user) {
      // Production hardening: if the user registry DB is unavailable/misconfigured,
      // don't 404 the UI. Treat as "not linked" and allow the app to continue.
      if (hadDbError) {
        console.warn(`⚠️ [VVAULT API] User registry unavailable; returning linked=false for ${userId}`);
        return res.json({
          ok: true,
          linked: false,
          vvaultUserId: null,
          vvaultPath: null,
          linkedAt: null,
          chattyEmail: req.user?.email || null,
          warning: 'user_registry_unavailable',
        });
      }

      console.error(`❌ [VVAULT API] User not found for userId: ${userId}, email: ${req.user?.email}`);
      return res.json({
        ok: true,
        linked: false,
        vvaultUserId: null,
        vvaultPath: null,
        linkedAt: null,
        chattyEmail: req.user?.email || null,
      });
    }

    const isLinked = !!(user.vvaultPath && user.vvaultUserId);

    console.log(`✅ [VVAULT API] Account status: linked=${isLinked}, vvaultUserId=${user.vvaultUserId || 'null'}`);

    res.json({
      ok: true,
      linked: isLinked,
      vvaultUserId: user.vvaultUserId || null,
      vvaultPath: user.vvaultPath || null,
      linkedAt: user.vvaultLinkedAt || null,
      chattyEmail: user.email
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to check account status:", error);
    console.error("❌ [VVAULT API] Error stack:", error.stack);
    res.status(500).json({
      ok: false,
      error: "Failed to check VVAULT account status",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/vvault/account/link
 * Link a VVAULT account to Chatty user
 * Body: { vvaultUserId: string, vvaultPath: string }
 */
router.post("/account/link", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { vvaultUserId, vvaultPath } = req.body || {};

  if (!vvaultUserId || !vvaultPath) {
    return res.status(400).json({
      ok: false,
      error: "Missing vvaultUserId or vvaultPath"
    });
  }

  try {
    // Try multiple query strategies since userId could be sub, id, uid, or _id
    let user = await User.findOne({ id: userId });

    // Fallback to email if id query fails
    if (!user && req.user?.email) {
      user = await User.findOne({ email: req.user.email });
    }

    // Fallback to _id if it's a MongoDB ObjectId
    if (!user && userId.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findById(userId);
    }

    if (!user) {
      console.error(`❌ [VVAULT API] User not found for userId: ${userId}, email: ${req.user?.email}`);
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    // Update user with VVAULT account info
    user.vvaultUserId = vvaultUserId;
    user.vvaultPath = vvaultPath;
    user.vvaultLinkedAt = new Date();

    await user.save();

    console.log(`✅ [VVAULT API] Linked VVAULT account ${vvaultUserId} to Chatty user ${userId}`);

    res.json({
      ok: true,
      message: "VVAULT account linked successfully",
      vvaultUserId,
      vvaultPath,
      linkedAt: user.vvaultLinkedAt
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to link VVAULT account:", error);
    res.status(500).json({ ok: false, error: "Failed to link VVAULT account" });
  }
});

/**
 * POST /api/vvault/account/unlink
 * Unlink VVAULT account from Chatty user
 */
router.post("/account/unlink", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  try {
    // Try multiple query strategies since userId could be sub, id, uid, or _id
    let user = await User.findOne({ id: userId });

    // Fallback to email if id query fails
    if (!user && req.user?.email) {
      user = await User.findOne({ email: req.user.email });
    }

    // Fallback to _id if it's a MongoDB ObjectId
    if (!user && userId.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findById(userId);
    }

    if (!user) {
      console.error(`❌ [VVAULT API] User not found for userId: ${userId}, email: ${req.user?.email}`);
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    // Clear VVAULT account info
    user.vvaultUserId = null;
    user.vvaultPath = null;
    user.vvaultLinkedAt = null;

    await user.save();

    console.log(`✅ [VVAULT API] Unlinked VVAULT account from Chatty user ${userId}`);

    res.json({
      ok: true,
      message: "VVAULT account unlinked successfully"
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to unlink VVAULT account:", error);
    res.status(500).json({ ok: false, error: "Failed to unlink VVAULT account" });
  }
});

// Diagnostic endpoint (dev only)
if (process.env.NODE_ENV !== 'production') {
  router.get("/debug/test-read", async (req, res) => {
    try {
      console.log(`🧪 [VVAULT Debug] Starting test read...`);
      await loadVVAULTModules();
      console.log(`🧪 [VVAULT Debug] Modules loaded, VVAULT_ROOT: ${VVAULT_ROOT}`);

      const testEmail = req.query.email || 'dwoodson92@gmail.com';
      console.log(`🧪 [VVAULT Debug] Testing readConversations with email: ${testEmail}`);

      if (!readConversations) {
        throw new Error('readConversations function not available');
      }

      const conversations = await readConversations(testEmail);

      res.json({
        ok: true,
        vvaultRoot: VVAULT_ROOT,
        testEmail,
        conversationCount: conversations.length,
        conversations: conversations.map(c => ({
          sessionId: c.sessionId,
          title: c.title,
          messageCount: c.messages?.length || 0
        }))
      });
    } catch (error) {
      console.error("❌ [VVAULT Debug] Test failed:", error);
      console.error("❌ [VVAULT Debug] Error stack:", error.stack);
      res.status(500).json({
        ok: false,
        error: error.message,
        stack: error.stack,
        name: error.name
      });
    }
  });

  // Health check endpoint to test module loading
  router.get("/debug/test-modules", async (req, res) => {
    try {
      console.log(`🧪 [VVAULT Debug] Testing module loading...`);
      await loadVVAULTModules();
      res.json({
        ok: true,
        modulesLoaded: modulesLoaded,
        hasReadConversations: typeof readConversations === 'function',
        hasReadCharacterProfile: typeof readCharacterProfile === 'function',
        hasVVAULTConnector: typeof VVAULTConnector === 'function',
        vvaultRoot: VVAULT_ROOT
      });
    } catch (error) {
      console.error("❌ [VVAULT Debug] Module test failed:", error);
      res.status(500).json({
        ok: false,
        error: error.message,
        stack: error.stack
      });
    }
  });
}

/**
 * Serve persona files from user-specific prompts/customAI directory
 */
router.get("/identity/persona/:filename", requireAuth, async (req, res) => {
  try {
    const userId = validateUser(res, req.user);
    if (!userId) return;

    const { filename } = req.params;

    // Security: prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(403).json({ ok: false, error: 'Invalid filename' });
    }

    // Only allow .md files
    if (!filename.endsWith('.md')) {
      return res.status(403).json({ ok: false, error: 'Only markdown files allowed' });
    }

    // path is now imported at the top
    const fs = await import('fs/promises');
    const { getUserPersonaDirectory } = await import('../lib/userRegistry.js');

    try {
      // Get user's persona directory
      const personaDir = await getUserPersonaDirectory(userId);
      const personaPath = path.join(personaDir, filename);

      // Security: verify path is within user's directory
      if (!personaPath.startsWith(personaDir)) {
        return res.status(403).json({ ok: false, error: 'Access denied' });
      }

      const content = await fs.readFile(personaPath, 'utf8');
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.send(content);
    } catch (error) {
      if (error.code === 'ENOENT' || error.message.includes('not found')) {
        // Fallback to global prompts/customAI directory for backward compatibility
        const { fileURLToPath } = await import('url');
        const { dirname } = await import('path');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const projectRoot = path.resolve(__dirname, '../..');
        const fallbackPath = path.join(projectRoot, 'prompts', 'customAI', filename);

        try {
          const content = await fs.readFile(fallbackPath, 'utf8');
          res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
          res.send(content);
        } catch (fallbackError) {
          return res.status(404).json({ ok: false, error: 'Persona file not found' });
        }
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('❌ [VVAULT API] Failed to serve persona file:', error);
    res.status(500).json({ ok: false, error: error.message || 'Failed to serve persona file' });
  }
});

// ============================================
// Brevity Layer Endpoints
// ============================================

// Store brevity layer configuration
router.post("/brevity/config", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign, config } = req.body || {};

  if (!constructCallsign || !config) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign or config" });
  }

  try {
    const { writeBrevityConfig } = await import('../services/brevityLayerService.js');
    const savedConfig = await writeBrevityConfig(
      userId,
      constructCallsign,
      config,
      req.user?.email
    );

    res.json({
      ok: true,
      config: savedConfig
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to store brevity config:", error);
    res.status(500).json({ ok: false, error: "Failed to store brevity config" });
  }
});

// Retrieve brevity layer configuration
router.get("/brevity/config", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign } = req.query || {};

  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    const { readBrevityConfig } = await import('../services/brevityLayerService.js');
    const config = await readBrevityConfig(userId, constructCallsign, req.user?.email, req.user?.name);

    res.json({
      ok: true,
      config: config // null if not found (caller should use defaults)
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to retrieve brevity config:", error);
    res.status(500).json({ ok: false, error: "Failed to retrieve brevity config" });
  }
});

// Store analytical sharpness settings
router.post("/brevity/analytics", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign, config } = req.body || {};

  if (!constructCallsign || !config) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign or config" });
  }

  try {
    const { writeAnalyticalSharpness } = await import('../services/brevityLayerService.js');
    const savedConfig = await writeAnalyticalSharpness(
      userId,
      constructCallsign,
      config,
      req.user?.email
    );

    res.json({
      ok: true,
      config: savedConfig
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to store analytical sharpness:", error);
    res.status(500).json({ ok: false, error: "Failed to store analytical sharpness" });
  }
});

// Retrieve analytical sharpness settings
router.get("/brevity/analytics", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign } = req.query || {};

  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    const { readAnalyticalSharpness } = await import('../services/brevityLayerService.js');
    const config = await readAnalyticalSharpness(userId, constructCallsign, req.user?.email, req.user?.name);

    res.json({
      ok: true,
      config: config // null if not found (caller should use defaults)
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to retrieve analytical sharpness:", error);
    res.status(500).json({ ok: false, error: "Failed to retrieve analytical sharpness" });
  }
});

// ============================================
// Capsule Generation Endpoint
// ============================================

router.post("/capsules/generate", requireAuth, async (req, res) => {
  const resolved = await resolveRequestUserForVvault(res, req);
  if (!resolved) return;
  const { supabaseUserId, userId } = resolved;

  const { constructCallsign, gptConfig, transcriptData } = req.body || {};

  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    await loadVVAULTModules();
    if (!VVAULT_ROOT) {
      throw new Error('VVAULT root not configured');
    }

    if (!supabaseUserId) {
      throw new Error(`Cannot resolve Supabase user ID for: ${userId}`);
    }

    // Build instance directory path: users/{shard}/{userId}/instances/{constructCallsign}
    const instancePath = path.join(
      VVAULT_ROOT,
      'users',
      'shard_0000',
      supabaseUserId,
      'instances',
      constructCallsign
    );

    // instanceName is same as constructCallsign (used in capsule metadata)
    const instanceName = constructCallsign;

    // Call CapsuleForge via Python bridge
    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs').promises;

    // Use CapsuleForge bridge script
    const bridgePath = path.join(__dirname, 'services', 'capsuleForgeBridge.py');

    // Check if bridge exists
    try {
      await fs.access(bridgePath);
    } catch (error) {
      throw new Error(`CapsuleForge bridge not found at ${bridgePath}`);
    }

    // Extract traits from GPT config or use defaults
    // Try to load existing capsule to preserve exact scoring
    let traits = gptConfig?.traits || {};
    try {
      const { getCapsuleLoader } = require('../services/capsuleLoader.js');
      const capsuleLoader = getCapsuleLoader();
      const existingCapsule = await capsuleLoader.loadCapsule(userId, constructCallsign, VVAULT_ROOT);

      if (existingCapsule && existingCapsule.data && existingCapsule.data.traits) {
        // Preserve exact scoring from existing capsule
        traits = existingCapsule.data.traits;
        console.log(`✅ [VVAULT API] Preserving exact traits from existing capsule:`, Object.keys(traits));
      }
    } catch (error) {
      console.warn(`⚠️ [VVAULT API] Could not load existing capsule for trait preservation:`, error);
      // Use defaults if no existing capsule
      if (Object.keys(traits).length === 0) {
        traits = {
          creativity: 0.7,
          empathy: 0.6,
          persistence: 0.8,
          analytical: 0.7,
          directness: 0.8
        };
      }
    }

    // Extract memory log from transcript data or use empty array
    const memoryLog = transcriptData?.memoryLog || [];

    // Extract personality type from GPT config or use default
    let personalityType = gptConfig?.personalityType || 'UNKNOWN';

    // Try to preserve personality type from existing capsule
    try {
      const { getCapsuleLoader } = require('../services/capsuleLoader.js');
      const capsuleLoader = getCapsuleLoader();
      const existingCapsule = await capsuleLoader.loadCapsule(userId, constructCallsign, VVAULT_ROOT);

      if (existingCapsule && existingCapsule.data && existingCapsule.data.personality) {
        personalityType = existingCapsule.data.personality.personality_type || personalityType;
      }
    } catch (error) {
      // Use default if no existing capsule
    }

    // Prepare capsule generation data
    const capsuleData = {
      instance_name: instanceName, // Same as constructCallsign (e.g., "example-construct-001")
      traits,
      memory_log: memoryLog,
      personality_type: personalityType,
      additional_data: {
        constructCallsign, // Use constructCallsign directly (e.g., "example-construct-001")
        gptConfig: gptConfig || {},
        generatedAt: new Date().toISOString(),
        generatedBy: 'chatty-gpt-creator'
      },
      vault_path: VVAULT_ROOT,
      instance_path: instancePath  // New: save directly in instance directory
    };

    console.log(`📦 [VVAULT API] Generating capsule with instance_path: ${instancePath}`);

    // Call CapsuleForge via Python bridge
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python3', [
        bridgePath,
        'generate',
        JSON.stringify(capsuleData)
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.dirname(bridgePath)
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = stdout.trim() ? JSON.parse(stdout) : { success: true, path: stdout.trim() };
            console.log(`✅ [VVAULT API] Capsule generated: ${result.path || result.capsulePath}`);

            res.json({
              ok: true,
              capsulePath: result.path || result.capsulePath,
              instanceName,
              fingerprint: path.basename(result.path || result.capsulePath || '')
            });
            resolve();
          } catch (error) {
            // If output is not JSON, assume it's the capsule path
            const capsulePath = stdout.trim();
            if (capsulePath) {
              console.log(`✅ [VVAULT API] Capsule generated: ${capsulePath}`);
              res.json({
                ok: true,
                capsulePath,
                instanceName,
                fingerprint: path.basename(capsulePath)
              });
              resolve();
            } else {
              reject(new Error(`Failed to parse CapsuleForge output: ${stdout}`));
            }
          }
        } else {
          reject(new Error(`CapsuleForge failed with code ${code}: ${stderr || stdout}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start CapsuleForge: ${error.message}`));
      });
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to generate capsule:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to generate capsule",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// Capsule Loading Endpoint
// ============================================

router.get("/capsules/load", (req, res, next) => {
  // Bypass auth for test endpoints in development
  if (req.headers['x-test-bypass'] === 'true' || req.query.testMode === 'true') {
    return next();
  }
  return requireAuth(req, res, next);
}, async (req, res) => {
  // Handle test mode user ID
  let userId;
  if (req.headers['x-test-bypass'] === 'true' || req.query.testMode === 'true') {
    userId = 'devon_woodson_1762969514958'; // Use actual VVAULT user ID for testing
    console.log(`🧪 [VVAULT API] Test mode: using hardcoded user ID: ${userId}`);
  } else {
    userId = validateUser(res, req.user);
    if (!userId) return;
  }

  const { constructCallsign } = req.query;

  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    await loadVVAULTModules();
    if (!VVAULT_ROOT) {
      // VVAULT not configured - capsule not found (expected in some environments)
      console.log(`ℹ️ [VVAULT API] VVAULT not configured, capsule not found for user: ${userId}, construct: ${constructCallsign}`);
      return res.status(404).json({ ok: false, error: "Capsule not found" });
    }

    const { getCapsuleLoader } = require('../services/capsuleLoader.js');
    const capsuleLoader = getCapsuleLoader();

    const capsule = await capsuleLoader.loadCapsule(userId, constructCallsign, VVAULT_ROOT);

    if (!capsule) {
      console.log(`ℹ️ [VVAULT API] Capsule not found for user: ${userId}, construct: ${constructCallsign}`);
      return res.status(404).json({ ok: false, error: "Capsule not found" });
    }

    res.json({
      ok: true,
      capsule: capsule.data,
      path: capsule.path
    });
  } catch (error) {
    // Check if error indicates capsule doesn't exist (expected) vs server error
    const errorMessage = error.message || String(error);
    const isNotFoundError = errorMessage.includes('not found') ||
      errorMessage.includes('ENOENT') ||
      errorMessage.includes('does not exist');

    if (isNotFoundError) {
      console.log(`ℹ️ [VVAULT API] Capsule not found (expected) for user: ${userId}, construct: ${constructCallsign}`);
      return res.status(404).json({ ok: false, error: "Capsule not found" });
    }

    // Actual server error - log and return 500
    console.error("❌ [VVAULT API] Failed to load capsule:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to load capsule",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// Occupational Role Sync Endpoints
// ============================================

router.post("/capsules/role-sync", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign } = req.body;

  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    const { getCapsuleIntegration } = await import('../lib/capsuleIntegration.js');
    const capsuleIntegration = getCapsuleIntegration();

    let gptConfig = null;
    try {
      gptConfig = await gptManager.getGPTByCallsign(constructCallsign);
    } catch (e) { /* GPT config not found — ok */ }

    const result = await capsuleIntegration.syncOccupationalRole(constructCallsign, gptConfig);

    res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Role sync failed:", error);
    res.status(500).json({ ok: false, error: "Role sync failed", details: error.message });
  }
});

router.post("/capsules/role-sync-all", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  try {
    const { getCapsuleIntegration } = await import('../lib/capsuleIntegration.js');
    const capsuleIntegration = getCapsuleIntegration();

    const allGPTs = await gptManager.getAllGPTs(userId) || [];
    const result = await capsuleIntegration.syncAllRoles(allGPTs);

    res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Bulk role sync failed:", error);
    res.status(500).json({ ok: false, error: "Bulk role sync failed", details: error.message });
  }
});

router.get("/capsules/role-history", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign } = req.query;

  if (!constructCallsign) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign" });
  }

  try {
    const { getCapsuleIntegration } = await import('../lib/capsuleIntegration.js');
    const capsuleIntegration = getCapsuleIntegration();

    const capsuleData = await capsuleIntegration.loadCapsule(constructCallsign);
    const roleHistory = capsuleData?.role_history || [];
    const currentRole = capsuleData?.identity?.occupationalRole
      || capsuleData?.metadata?.occupationalRole
      || null;

    res.json({
      ok: true,
      constructCallsign,
      currentRole,
      history: roleHistory
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Role history fetch failed:", error);
    res.status(500).json({ ok: false, error: "Role history fetch failed", details: error.message });
  }
});

// Query brevity-optimized memories
router.get("/brevity/memories", requireAuth, async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign, query, limit = 10, includeBrevityExamples = false, minBrevityScore, oneWordOnly } = req.query || {};

  if (!constructCallsign || !query) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign or query" });
  }

  try {
    const { getIdentityService } = await import('../services/identityService.js');
    const identityService = getIdentityService();

    // Query identities with brevity context
    let identities = await identityService.queryIdentities(
      userId,
      constructCallsign,
      query,
      parseInt(limit, 10) * 2 // Get more to filter by brevity
    );

    // Filter by brevity metadata if requested
    if (oneWordOnly === 'true') {
      identities = identities.filter(m =>
        m.metadata?.oneWordResponse === true ||
        m.metadata?.wordCount === 1
      );
    }

    if (minBrevityScore) {
      const minScore = parseFloat(minBrevityScore);
      identities = identities.filter(m =>
        (m.metadata?.brevityScore || 0) >= minScore
      );
    }

    // Limit to requested amount
    identities = identities.slice(0, parseInt(limit, 10));

    // Add brevity examples if requested
    if (includeBrevityExamples === 'true') {
      const brevityExamples = identities.filter(m =>
        m.metadata?.tags?.some(tag => tag.startsWith('brevity:'))
      );
      identities = [...brevityExamples, ...identities].slice(0, parseInt(limit, 10));
    }

    res.json({
      ok: true,
      memories: identities
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to query brevity memories:", error);
    res.status(500).json({ ok: false, error: "Failed to query brevity memories" });
  }
});

// Log route registration for debugging
console.log('✅ [VVAULT Routes] Router initialized with routes:');
console.log('  - GET /conversations');
console.log('  - GET /identity/query');
console.log('  - GET /identity/list');
console.log('  - GET /identity/blueprint');
console.log('  - POST /identity/store');
console.log('  - GET /profile');
console.log('  - POST /identity/upload');
console.log('  - GET /brevity/config');
console.log('  - POST /brevity/config');
console.log('  - GET /brevity/analytics');
console.log('  - POST /brevity/analytics');
console.log('  - GET /brevity/memories');
console.log('  - POST /capsules/generate');
console.log('  - GET /capsules/load');

// Get user profile (from OAuth + VVAULT)
router.get("/profile", requireAuth, async (req, res) => {
  const resolved = await resolveRequestUserForVvault(res, req);
  if (!resolved) return;
  const { supabaseUserId } = resolved;

  try {
    const oauthProfile = {
      name: req.user.name,
      email: req.user.email,
      given_name: req.user.given_name,
      family_name: req.user.family_name,
      locale: req.user.locale,
      picture: req.user.picture
    };

    let vvaultProfile = null;
    if (supabaseUserId) {
      try {
        const fs = require('fs').promises;
        const path = require('path');
        const { VVAULT_ROOT } = require("../../vvaultConnector/config.js");
        const accountProfilePath = path.join(
          VVAULT_ROOT,
          'users',
          'shard_0000',
          supabaseUserId,
          'account',
          'profile.json'
        );
        const identityProfilePath = path.join(
          VVAULT_ROOT,
          'users',
          'shard_0000',
          supabaseUserId,
          'identity',
          'profile.json'
        );
        try {
          // Try account/profile.json first
          const profileContent = await fs.readFile(accountProfilePath, 'utf8');
          vvaultProfile = JSON.parse(profileContent);
        } catch {
          try {
            // Fallback to identity/profile.json
            const profileContent = await fs.readFile(identityProfilePath, 'utf8');
            vvaultProfile = JSON.parse(profileContent);
          } catch {
            // VVAULT profile doesn't exist yet - that's okay
          }
        }
      } catch (error) {
        console.warn('⚠️ [VVAULT API] Could not load VVAULT profile:', error.message);
      }
    }

    // Merge OAuth + VVAULT profile data
    const mergedProfile = {
      ...oauthProfile,
      vvault_user_id: vvaultProfile?.user_id || null,
      vvault_linked: !!vvaultProfile,
      // Include personalization fields from VVAULT profile
      nickname: vvaultProfile?.personalization?.nickname || null,
      occupation: vvaultProfile?.personalization?.occupation || null,
      tags: vvaultProfile?.personalization?.tags || [],
      aboutYou: vvaultProfile?.personalization?.aboutYou || null
    };

    res.json({
      ok: true,
      profile: mergedProfile
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to retrieve user profile:", error);
    res.status(500).json({ ok: false, error: "Failed to retrieve user profile" });
  }
});

// Update user personalization in profile.json
router.post("/profile/personalization", requireAuth, async (req, res) => {
  const resolved = await resolveRequestUserForVvault(res, req);
  if (!resolved) return;
  const { supabaseUserId } = resolved;

  try {
    const { nickname, occupation, tags, aboutYou } = req.body;

    if (nickname === undefined && occupation === undefined && tags === undefined && aboutYou === undefined) {
      return res.status(400).json({ 
        ok: false, 
        error: "At least one personalization field must be provided" 
      });
    }

    if (!supabaseUserId) {
      return res.status(404).json({ 
        ok: false, 
        error: "Supabase user ID not found" 
      });
    }

    const fs = require('fs').promises;
    const path = require('path');
    const { VVAULT_ROOT } = require("../../vvaultConnector/config.js");
    
    const accountProfilePath = path.join(
      VVAULT_ROOT,
      'users',
      'shard_0000',
      supabaseUserId,
      'account',
      'profile.json'
    );
    const identityProfilePath = path.join(
      VVAULT_ROOT,
      'users',
      'shard_0000',
      supabaseUserId,
      'identity',
      'profile.json'
    );

    let profilePath = accountProfilePath;
    let profile = null;

    // Try to read existing profile
    try {
      const profileContent = await fs.readFile(accountProfilePath, 'utf8');
      profile = JSON.parse(profileContent);
    } catch {
      try {
        const profileContent = await fs.readFile(identityProfilePath, 'utf8');
        profile = JSON.parse(profileContent);
        profilePath = identityProfilePath;
      } catch {
        // Profile doesn't exist, create new one
        profile = {
          user_id: supabaseUserId,
          user_name: req.user.name,
          email: req.user.email,
          created: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          constructs: [],
          storage_quota: "unlimited",
          features: []
        };
        // Ensure account directory exists
        const accountDir = path.dirname(accountProfilePath);
        await fs.mkdir(accountDir, { recursive: true });
        profilePath = accountProfilePath;
      }
    }

    // Update personalization fields
    if (!profile.personalization) {
      profile.personalization = {};
    }

    if (nickname !== undefined) profile.personalization.nickname = nickname || '';
    if (occupation !== undefined) profile.personalization.occupation = occupation || '';
    if (tags !== undefined) profile.personalization.tags = Array.isArray(tags) ? tags : [];
    if (aboutYou !== undefined) profile.personalization.aboutYou = aboutYou || '';

    // Update last_seen timestamp
    profile.last_seen = new Date().toISOString();

    // Write updated profile
    await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf8');

    console.log(`✅ [VVAULT API] Updated personalization for user ${supabaseUserId?.slice(0, 8)}...`);

    res.json({
      ok: true,
      profile: {
        nickname: profile.personalization.nickname,
        occupation: profile.personalization.occupation,
        tags: profile.personalization.tags,
        aboutYou: profile.personalization.aboutYou
      }
    });
  } catch (error) {
    console.error("❌ [VVAULT API] Failed to update personalization:", error);
    res.status(500).json({ ok: false, error: "Failed to update personalization" });
  }
});

router.get("/chat/:sessionId", requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ ok: false, error: "sessionId is required" });
  }

  const resolved = await resolveRequestUserForVvault(res, req);
  if (!resolved) return;
  const { supabaseUserId, chattyUserId } = resolved;
  const userEmail = req.user?.email || "unknown";
  const lookupId = supabaseUserId || (userEmail !== "unknown" ? userEmail : chattyUserId);
  const linkedVvaultUserId = await resolveLinkedVvaultUserId({
    userModel: User,
    userLookupId: chattyUserId,
    initialVvaultUserId: req.user?.vvaultUserId,
    logger: console,
  });
  const conversationIndexLookupId = linkedVvaultUserId || supabaseUserId || lookupId;
  const conversationIndexLookupIds = buildConversationIndexLookupCandidates([
    supabaseUserId,
    linkedVvaultUserId,
    req.user?.uid,
    chattyUserId,
    resolved.userId,
  ]);
  const localDeferredLookupIds = buildLocalDeferredLookupCandidates([
    userEmail !== "unknown" ? userEmail : null,
    supabaseUserId,
    linkedVvaultUserId,
    req.user?.uid,
    chattyUserId,
    resolved.userId,
  ]);
  const strictVvaultOnly = isCanonicalZenSession(sessionId);

  try {
    await loadVVAULTModules();
    console.log(`📚 [VVAULT API] Loading chat ${sessionId} for user: ${lookupId?.slice?.(0, 8) || lookupId}`);
    const payload = await resolveCanonicalTranscriptPayload({
      sessionId,
      lookupId,
      conversationIndexLookupId,
      conversationIndexLookupIds,
      localDeferredLookupIds,
      userEmail,
      supabaseUserId,
      vvaultRoot: strictVvaultOnly ? null : VVAULT_ROOT,
      parseMarkdownTranscript,
      readConversations,
      readConversationIndexFromSupabase: strictVvaultOnly ? null : readConversationIndexFromSupabase,
      readLocalDeferredConversations: strictVvaultOnly ? null : readLocalDeferredConversations,
      allowDegradedFallback: strictVvaultOnly ? false : true,
      vvaultOnly: strictVvaultOnly,
    });
    const responsePayload = buildChatTranscriptResponse(payload);
    console.log(
      `✅ [VVAULT API] Returning ${responsePayload.source} chat payload with ${responsePayload.messages?.length || 0} messages`,
    );
    return res.json(responsePayload);
  } catch (error) {
    if (error instanceof CanonicalTranscriptError && error.code === "CANONICAL_TRANSCRIPT_NOT_FOUND") {
      if (strictVvaultOnly) {
        return res.status(error.status || 404).json({
          ok: false,
          error: error.message,
          errorCode: error.code,
          details: error.details || null,
        });
      }
      return res.json({ ok: true, content: "", messages: [], source: "empty" });
    }
    console.error(`❌ [VVAULT API] Failed to load transcript for ${sessionId}:`, error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to load transcript" });
  }
});

router.get("/conversations/:sessionId/canonical-transcript", requirePreferredAuth, async (req, res) => {
  const { sessionId } = req.params;
  if (!sessionId) {
    return res.status(400).json({ ok: false, error: "sessionId is required" });
  }

  const resolved = await resolveRequestUserForVvault(res, req);
  if (!resolved) return;
  const { supabaseUserId, chattyUserId } = resolved;
  const userEmail = req.user?.email || "unknown";
  const lookupId = supabaseUserId || (userEmail !== "unknown" ? userEmail : chattyUserId);
  const linkedVvaultUserId = await resolveLinkedVvaultUserId({
    userModel: User,
    userLookupId: chattyUserId,
    initialVvaultUserId: req.user?.vvaultUserId,
    logger: console,
  });
  const conversationIndexLookupId = linkedVvaultUserId || supabaseUserId || lookupId;
  const conversationIndexLookupIds = buildConversationIndexLookupCandidates([
    supabaseUserId,
    linkedVvaultUserId,
    req.user?.uid,
    chattyUserId,
    resolved.userId,
  ]);
  const localDeferredLookupIds = buildLocalDeferredLookupCandidates([
    userEmail !== "unknown" ? userEmail : null,
    supabaseUserId,
    linkedVvaultUserId,
    req.user?.uid,
    chattyUserId,
    resolved.userId,
  ]);
  const strictVvaultOnly = isCanonicalZenSession(sessionId);

  try {
    await loadVVAULTModules();
    const payload = await resolveCanonicalTranscriptPayload({
      sessionId,
      lookupId,
      conversationIndexLookupId,
      conversationIndexLookupIds,
      localDeferredLookupIds,
      userEmail,
      supabaseUserId,
      vvaultRoot: strictVvaultOnly ? null : VVAULT_ROOT,
      parseMarkdownTranscript,
      readConversations,
      readConversationIndexFromSupabase: strictVvaultOnly ? null : readConversationIndexFromSupabase,
      readLocalDeferredConversations: strictVvaultOnly ? null : readLocalDeferredConversations,
      allowDegradedFallback: false,
      vvaultOnly: strictVvaultOnly,
    });
    return res.json({ ok: true, ...payload });
  } catch (error) {
    if (error instanceof CanonicalTranscriptError) {
      return res.status(error.status || 500).json({
        ok: false,
        error: error.message,
        errorCode: error.code,
        details: error.details || null,
      });
    }
    console.error(`❌ [VVAULT API] Failed to resolve canonical transcript for ${sessionId}:`, error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to load canonical transcript" });
  }
});

router.get("/conversations/:sessionId/export", requirePreferredAuth, async (req, res) => {
  const { sessionId } = req.params;
  const format = String(req.query?.format || "").trim().toLowerCase();
  if (!sessionId) {
    return res.status(400).json({ ok: false, error: "sessionId is required" });
  }
  if (!["md", "pdf", "docx"].includes(format)) {
    return res.status(400).json({ ok: false, error: "format must be one of md, pdf, or docx" });
  }

  const resolved = await resolveRequestUserForVvault(res, req);
  if (!resolved) return;
  const { supabaseUserId, chattyUserId } = resolved;
  const userEmail = req.user?.email || "unknown";
  const lookupId = supabaseUserId || (userEmail !== "unknown" ? userEmail : chattyUserId);
  const linkedVvaultUserId = await resolveLinkedVvaultUserId({
    userModel: User,
    userLookupId: chattyUserId,
    initialVvaultUserId: req.user?.vvaultUserId,
    logger: console,
  });
  const conversationIndexLookupId = linkedVvaultUserId || supabaseUserId || lookupId;
  const conversationIndexLookupIds = buildConversationIndexLookupCandidates([
    supabaseUserId,
    linkedVvaultUserId,
    req.user?.uid,
    chattyUserId,
    resolved.userId,
  ]);
  const localDeferredLookupIds = buildLocalDeferredLookupCandidates([
    userEmail !== "unknown" ? userEmail : null,
    supabaseUserId,
    linkedVvaultUserId,
    req.user?.uid,
    chattyUserId,
    resolved.userId,
  ]);
  const strictVvaultOnly = isCanonicalZenSession(sessionId);

  try {
    await loadVVAULTModules();
    const payload = await resolveCanonicalTranscriptPayload({
      sessionId,
      lookupId,
      conversationIndexLookupId,
      conversationIndexLookupIds,
      localDeferredLookupIds,
      userEmail,
      supabaseUserId,
      vvaultRoot: strictVvaultOnly ? null : VVAULT_ROOT,
      parseMarkdownTranscript,
      readConversations,
      readConversationIndexFromSupabase: strictVvaultOnly ? null : readConversationIndexFromSupabase,
      readLocalDeferredConversations: strictVvaultOnly ? null : readLocalDeferredConversations,
      allowDegradedFallback: false,
      vvaultOnly: strictVvaultOnly,
    });
    const artifact = await buildCanonicalTranscriptArtifact(payload, format);
    const filename = buildCanonicalTranscriptFilename(payload, format);
    res.setHeader("Content-Type", artifact.contentType);
    res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(artifact.buffer);
  } catch (error) {
    if (error instanceof CanonicalTranscriptError) {
      return res.status(error.status || 500).json({
        ok: false,
        error: error.message,
        errorCode: error.code,
        details: error.details || null,
      });
    }
    console.error(`❌ [VVAULT API] Failed to export canonical transcript for ${sessionId}:`, error);
    return res.status(500).json({ ok: false, error: error?.message || "Failed to export canonical transcript" });
  }
});

/**
 * POST /vvault/message - Proxy to VVAULT's /api/chatty/message for LLM inference
 *
 * Chatty should call this endpoint to send messages, which proxies to VVAULT.
 * VVAULT handles: LLM inference (Ollama), transcript saving, memory management.
 *
 * Request body:
 * - constructId: string (e.g., "zen-001")
 * - message: string (user's message)
 * - userId?: string (optional, uses authenticated user if not provided)
 *
 * Response:
 * - success: boolean
 * - response: string (LLM response)
 * - construct_id: string
 */
export async function handleConstructInference(req, res) {
  let userId;
  let authRecovered = false;
  let supabaseSessionUserId = null;
  let authSource = 'supabase_session';
  const authHeader = (req?.headers?.authorization || '').toString();
  const hasSupabaseAuthHeader = authHeader.toLowerCase().startsWith('bearer ');
  const hasReqUser = !!req?.user;
  try {
    const user = await resolveSupabaseUser(req);
    userId = user.id;
    supabaseSessionUserId = user.id;
  } catch {
    // Dev fallback: allow app JWT when Supabase session isn't present (non-prod only)
    if (process.env.NODE_ENV !== 'production' && (req?.user?.id || req?.user?.sub)) {
      userId = req.user.id || req.user.sub;
      authRecovered = true;
      authSource = 'app_jwt_dev_fallback';
      console.warn(`[VVAULT Auth] Supabase session missing; dev fallback to app JWT for user ${userId}`);
    } else {
      return res.status(401).json({ ok: false, error: "Authentication required" });
    }
  }

  const devDataOwnerOverride =
    process.env.NODE_ENV !== 'production' &&
    typeof process.env.CHATTY_DEV_DATA_OWNER_SUPABASE_USER_ID === 'string' &&
    /^[0-9a-f-]{36}$/i.test(process.env.CHATTY_DEV_DATA_OWNER_SUPABASE_USER_ID.trim())
      ? process.env.CHATTY_DEV_DATA_OWNER_SUPABASE_USER_ID.trim()
      : null;
  let dataOwnerUserId = devDataOwnerOverride || userId;
  let dataOwnerSource = devDataOwnerOverride ? 'dev_env_supabase_user_override' : authSource;
  const authReceipt = {
    auth_email: req.user?.email || null,
    auth_provider: req.user?.auth_provider || null,
    auth_source: authSource,
    auth_user_id: req.user?.id || req.user?.sub || null,
    supabase_session_user_id: supabaseSessionUserId,
    data_owner_user_id: dataOwnerUserId || null,
    data_owner_source: dataOwnerSource,
    memory_lookup_user_id: dataOwnerUserId || null,
    dev_auth_fallback: !!authRecovered,
    dev_data_owner_override: !!devDataOwnerOverride,
    data_owner_matches_auth: Boolean(dataOwnerUserId && dataOwnerUserId === userId),
    canonical_construct_owner: null,
  };
  console.log('[VVAULT_AUTH]', {
    hasSupabaseAuthHeader,
    hasReqUser,
    userId,
    dataOwnerUserId,
    authSource,
    dataOwnerSource,
    env: process.env.NODE_ENV
  });

  const {
    constructId: rawConstructId,
    __canonicalConstructId,
    message: incomingMessage,
    threadId,
    sessionId,
    attachments,
    projectName,
    rootPath,
    transcriptPath,
    runtime,
    chatMode,
    planMode,
    agentId,
    agentLabel,
    model: requestModelOverride,
    provider: requestProviderOverride,
    modelKey,
    modelLabel,
    systemPromptOverride,
    skipPersistence,
    previewMode = false,
    previewDraft = null,
    transientHistory = [],
    continueTurn = false,
    linearTranscriptLawGate = false,
    linearTranscriptLawTurnKind = null,
    zenOrdinaryVoiceGate = false,
    orchestrationProfile = null,
    assignmentProfile = null,
    expectedTurn = null,
    assignmentTurn = null,
    evidencePacket = null,
    continuity_expected = false,
    resume_from_turn_id = null,
    resume_from_continuity_seq = null,
    resume_tail_hash = null,
    resume_construct_revision = null,
    resume_source_seat = null,
  } = req.body || {};

  if (!rawConstructId) {
    return res.status(400).json({ success: false, error: "Missing constructId" });
  }

  const canonicalConstructId = __canonicalConstructId || canonicalizeConstructId(rawConstructId);
  let constructId = canonicalConstructId || rawConstructId;
  if (!canonicalConstructId && !__canonicalConstructId) {
    console.warn(`[VVAULT Proxy] constructId canonicalization failed for "${rawConstructId}", using raw value`);
  }

  const canonicalOwnerResolution = resolveCanonicalConstructDataOwner({
    constructId,
    threadId,
    sessionId,
    transcriptPath,
    projectName,
    requestedDataOwnerUserId: dataOwnerUserId,
    requestedDataOwnerSource: dataOwnerSource,
    authenticatedUserId: userId,
  });
  dataOwnerUserId = canonicalOwnerResolution.dataOwnerUserId || dataOwnerUserId;
  dataOwnerSource = canonicalOwnerResolution.dataOwnerSource || dataOwnerSource;
  authReceipt.data_owner_user_id = dataOwnerUserId || null;
  authReceipt.data_owner_source = dataOwnerSource;
  authReceipt.memory_lookup_user_id = dataOwnerUserId || null;
  authReceipt.data_owner_matches_auth = Boolean(dataOwnerUserId && dataOwnerUserId === userId);
  authReceipt.canonical_construct_owner = canonicalOwnerResolution.receipt || null;
  if (canonicalOwnerResolution.applied) {
    console.log('[VVAULT_AUTH] Canonical construct owner applied', canonicalOwnerResolution.receipt);
  }

  const effectiveRequestUserEmail = await resolveCanonicalRouteUserEmail({
    req,
    authenticatedUserId: userId,
    dataOwnerUserId,
    preferredEmail: canonicalOwnerResolution.receipt?.canonicalOwnerEmail || null,
    ignoreRequestEmail: canonicalOwnerResolution.applied === true,
  });
  if (effectiveRequestUserEmail) {
    req.user = { ...(req.user || {}), email: effectiveRequestUserEmail };
    authReceipt.auth_email = effectiveRequestUserEmail;
  }

  console.log('[NOVA DIAG]', {
    callsign: req.body?.callsign,
    constructId,
    rawConstructId,
    model: req.body?.model
  });

  try {
    const { recordUserActivity } = await import('./selfprompt.js');
    const effectiveThread = threadId || sessionId || `${constructId}_chat_with_${constructId}`;
    recordUserActivity(constructId, effectiveThread);
  } catch (_) {}

  // Handle image attachments for vision
  const hasImages = attachments && Array.isArray(attachments) && attachments.length > 0;
  const explicitVisionIntent =
    hasImages && hasExplicitImageAnalysisIntent(typeof incomingMessage === "string" ? incomingMessage : "");

  const hasTextMessage =
    typeof incomingMessage === "string" && incomingMessage.trim().length > 0;
  const syntheticContinuePrompt =
    "Continue naturally from the previous assistant message without repeating yourself.";
  const imageOnlyCharacterPrompt = getImageTurnDefaultUserMessage(constructId);
  const isSyntheticContinueTurn =
    continueTurn === true && !hasTextMessage && !hasImages;
  const message = hasTextMessage
    ? incomingMessage
    : isSyntheticContinueTurn
      ? syntheticContinuePrompt
      : hasImages
        ? imageOnlyCharacterPrompt
        : String(incomingMessage ?? "");
  const effectiveTurnSessionId = sessionId || threadId || `${constructId}_chat_with_${constructId}`;
  const normalizedLinearTranscriptLawTurnKind =
    typeof linearTranscriptLawTurnKind === 'string'
      ? linearTranscriptLawTurnKind.trim().toLowerCase()
      : null;
  const linearTranscriptLawOrdinaryTurn =
    linearTranscriptLawGate === true &&
    normalizedLinearTranscriptLawTurnKind === 'ordinary' &&
    isTranscriptLawSyntheticGateThread(effectiveTurnSessionId);
  const activeOrchestrationProfile = normalizeOrchestrationProfile(orchestrationProfile);
  const assignmentQaInput = normalizeAssignmentQaInput({
    runtime,
    assignmentProfile,
    expectedTurn,
    assignmentTurn,
    evidencePacket,
  });

  if (!hasTextMessage && !hasImages && continueTurn !== true) {
    return res.status(400).json({ success: false, error: "Missing message content" });
  }

  const isHydroProjectTurn =
    (typeof projectName === 'string' && projectName.trim()) ||
    (typeof rootPath === 'string' && rootPath.trim()) ||
    (typeof transcriptPath === 'string' && transcriptPath.trim());
  const canonicalTurnMetadata = {
    source: isHydroProjectTurn ? 'hydro-code' : 'chatty',
    projectName: typeof projectName === 'string' && projectName.trim() ? projectName.trim() : undefined,
    rootPath: typeof rootPath === 'string' && rootPath.trim() ? rootPath.trim() : undefined,
    transcriptPath: typeof transcriptPath === 'string' && transcriptPath.trim() ? transcriptPath.trim() : undefined,
    runtime: runtime && typeof runtime === 'object' ? runtime : undefined,
    chatMode: chatMode === false ? false : true,
    planMode: planMode === true,
    agentId: typeof agentId === 'string' ? agentId : undefined,
    agentLabel: typeof agentLabel === 'string' ? agentLabel : undefined,
    modelKey: typeof modelKey === 'string' ? modelKey : undefined,
    modelLabel: typeof modelLabel === 'string' ? modelLabel : undefined,
  };
  const continuityResumeRequest = normalizeRuntimeResumeRequest({
    continuity_expected,
    resume_from_turn_id,
    resume_from_continuity_seq,
    resume_tail_hash,
    resume_construct_revision,
    resume_source_seat,
  });
  const routeTurnEnvelope = buildRouteTurnEnvelope({
    sessionId: effectiveTurnSessionId,
    constructId,
    continuityExpected: continuityResumeRequest.continuityExpected,
  });
  let preloadedTranscriptTruthRows = null;
  let transcriptTruthLookupId = null;
  req.runtimeTurnEnvelope = routeTurnEnvelope;
  res.locals.runtimeTurnEnvelope = routeTurnEnvelope;
  try {
    const persistedRuntimeState = await readLatestRuntimeTurnState(
      buildConversationLookupContext({
        userEmail: req.user?.email || null,
        supabaseUserId: UUID_LOOKUP_RE.test(String(dataOwnerUserId || '').trim())
          ? dataOwnerUserId
          : supabaseSessionUserId,
        userId: dataOwnerUserId || req.user?.vvaultUserId || userId,
      }),
      {
        sessionId: effectiveTurnSessionId,
        constructId,
        allowLocalFallback: false,
      },
    );
    if (persistedRuntimeState?.runtimeTurnState) {
      routeTurnEnvelope.runtimeTurnState = persistedRuntimeState.runtimeTurnState;
      routeTurnEnvelope.persistedStateSource = persistedRuntimeState.source || 'unknown';
    }
    console.log('[RUNTIME_TURN_STATE]', {
      stage: 'loaded',
      sessionId: effectiveTurnSessionId,
      constructId,
      hasState: Boolean(routeTurnEnvelope.runtimeTurnState),
      source: routeTurnEnvelope.persistedStateSource,
      state: routeTurnEnvelope.runtimeTurnState,
    });
  } catch (runtimeTurnStateErr) {
    console.warn(`⚠️ [RUNTIME_TURN_STATE] Load failed for ${constructId}: ${runtimeTurnStateErr.message}`);
  }
  let continuityResumeValidation = validateRuntimeResumeRequest({
    runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
    resumeRequest: continuityResumeRequest,
    sessionId: effectiveTurnSessionId,
    constructId,
  });
  let gptConfig = null;
  routeTurnEnvelope.continuityExpected =
    continuityResumeValidation.continuityExpected === true;
  routeTurnEnvelope.continuityResume = continuityResumeValidation;
  if (continuityResumeValidation.continuityRestored) {
    routeTurnEnvelope.runtimeTurnState =
      continuityResumeValidation.runtimeTurnState || routeTurnEnvelope.runtimeTurnState;
  }
  const continuityRecoveryAllowed = canAttemptCanonicalContinuityRecovery({
    continuityResumeValidation,
    sessionId: effectiveTurnSessionId,
    constructId,
    previewMode,
    skipPersistence,
  });
  if (continuityRecoveryAllowed) {
    try {
      await loadVVAULTModules();
      if (typeof readConversations === 'function') {
        transcriptTruthLookupId =
          transcriptTruthLookupId ||
          buildConversationLookupContext({
            userEmail: req.user?.email || null,
            supabaseUserId: UUID_LOOKUP_RE.test(String(dataOwnerUserId || '').trim())
              ? dataOwnerUserId
              : supabaseSessionUserId,
            userId: dataOwnerUserId || req.user?.vvaultUserId || userId,
          });
        preloadedTranscriptTruthRows =
          preloadedTranscriptTruthRows ||
          await readConversations(transcriptTruthLookupId, constructId, {
            allowLocalFallback: false,
          });
        const preRecoveryTranscriptTruth = buildTranscriptTruthPreflight({
          readPathAvailable: true,
          conversations: preloadedTranscriptTruthRows,
          sessionId: effectiveTurnSessionId,
          constructId,
          runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
        });
        const recoveredRuntimeTurnState = preRecoveryTranscriptTruth.runtimeTurnState || null;
        if (recoveredRuntimeTurnState) {
          routeTurnEnvelope.runtimeTurnState = recoveredRuntimeTurnState;
          routeTurnEnvelope.persistedStateSource = 'canonical_tail_metadata';
          continuityResumeValidation = validateRuntimeResumeRequest({
            runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
            resumeRequest: continuityResumeRequest,
            sessionId: effectiveTurnSessionId,
            constructId,
          });
          routeTurnEnvelope.continuityExpected =
            continuityResumeValidation.continuityExpected === true;
          routeTurnEnvelope.continuityResume = continuityResumeValidation;
        }
      }
    } catch (runtimeTurnStateRecoveryErr) {
      console.warn(
        `⚠️ [RUNTIME_TURN_STATE] Canonical tail recovery failed for ${constructId}: ${runtimeTurnStateRecoveryErr.message}`,
      );
    }
  }
  if (
    continuityResumeValidation.continuityExpected &&
    !continuityResumeValidation.continuityRestored
  ) {
    const receiptConstructName = deriveConstructReceiptName(constructId, gptConfig);
    const continuityReceipt = buildContinuityProofReceipt({
      hydration: continuityResumeValidation.hydration,
      hydrationComplete: continuityResumeValidation.hydrationComplete,
      resumeValidation: continuityResumeValidation,
    });
    const continuityFailureCode = continuityResumeValidation.staleSeatRejected
      ? 'CONTINUITY_RESUME_STALE'
      : 'CONTINUITY_RESUME_UNPROVEN';
    const continuityFailureMessage = continuityResumeValidation.staleSeatRejected
      ? 'Continuity resume was rejected because this seat is stale. Reload the canonical thread and try again.'
      : 'Continuity resume could not be proven from the canonical thread tail. Reload the thread and try again.';
    const continuityFailureReceipt = {
      created_at: new Date().toISOString(),
      user_id: dataOwnerUserId || null,
      auth: authReceipt,
      construct_id: constructId,
      effective_construct_id: constructId,
      effective_construct_name: receiptConstructName,
      orchestration_mode:
        gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
      route_mode: 'vvault_message',
      persistence_owner: 'blocked_continuity_resume',
      continuity: continuityReceipt,
      ...continuityReceipt,
      transcript_truth: {
        eligible: false,
        source: 'none',
        retrieval_status: 'not_required',
        evidence_count: 0,
        evidence_sources: [],
        fallback_rejected: false,
        hydration_complete: continuityReceipt.hydrationComplete === true,
      },
      capsule_runtime: {
        capsuleLoaded: null,
        capsuleSource: null,
        contextProfile: null,
        continuityFromRuntimeState: false,
        continuityMemorySource: null,
      },
      provider: {
        final_provider: null,
        provider: null,
        model: null,
        mode: gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
        fallback_used: false,
      },
      persistence: {
        attempted: false,
        status: 'skipped',
        code: continuityFailureCode,
        reason: continuityResumeValidation.failureReason || 'continuity_resume_failed',
        message: continuityFailureMessage,
        error: continuityFailureMessage,
        timeout_ms: null,
        bounded: false,
        stage: 'continuity_resume',
        ...buildCanonicalPersistenceSemantics({
          failureClassification: 'blocked_continuity_resume',
          upstreamWriteBlocked: true,
        }),
      },
    };
    const continuityFailureChecklist = buildOrchestrationChecklist({
      userId: dataOwnerUserId,
      user: req.user,
      constructId,
      threadId: effectiveTurnSessionId,
      userMessage: message,
      gptConfig: {
        name: receiptConstructName,
        orchestrationMode:
          gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
        memoryProfile: gptConfig?.memoryProfile || gptConfig?.memory_profile || 'off',
      },
      enrichedContext: {
        phaseTiming: {
          identity: { source: 'identity_bundle_preflight' },
          basePromptSource: 'identity_bundle_preflight',
          conditioningInjected: false,
          contextRecovery: {
            profile: 'blocked_continuity_resume',
            historySource: continuityResumeValidation.hydration || 'none',
          },
          memorySearch: { skipped: true, reason: 'blocked_continuity_resume' },
          knowledge: { skipped: true, reason: 'blocked_continuity_resume' },
          capsule: { source: null },
        },
        capabilityManifest: {
          enabled: { proactiveInitiation: false },
          state: { selfpromptOn: false },
        },
        context_profile: null,
        context_budget: {
          profile: null,
          included_sections: [],
          delayed_sections: ['continuity_resume'],
        },
        evidence_count: 0,
        memory_retrieval_ran: false,
        memory_query_detected: false,
        capsuleLoaded: false,
      },
      retrievalDiagnostics: {
        evidence_count: 0,
        retrieval_counts: { vector: 0, verified: 0, needle: 0, transcript: 0 },
        phase_timing: {},
      },
      promptDiagnostics: {
        route: '/api/vvault/message',
        mode: 'continuity_resume_failure',
        constructId,
        prompt_source: 'continuity_resume_failure',
        base_prompt_source: 'identity_bundle_preflight',
        basePromptSource: 'identity_bundle_preflight',
        conditioning_appended: false,
        preview_mode: Boolean(previewMode),
        skip_persistence: true,
        final_history_count: 0,
        prompt_chars: 0,
      },
      providerTrace: {
        final_provider: null,
        fallback_used: false,
        attempts: [],
      },
      validatorDebug: {},
      runtimeReceipt: continuityFailureReceipt,
      contextMode: 'blocked_continuity_resume',
      relationalTurn: false,
      lowComplexityTurn: false,
      hasImages,
      skipPersistence: true,
      previewMode,
      requestedConstructId: rawConstructId,
      canonicalConstructId: canonicalConstructId || constructId,
      responseStatus: 'continuity_resume_failed',
    });
    console.warn('[RUNTIME_CONTINUITY]', {
      constructId,
      threadId: effectiveTurnSessionId,
      failureCode: continuityFailureCode,
      validation: continuityResumeValidation,
    });
    return res.status(409).json({
      success: false,
      ok: false,
      error: continuityFailureCode,
      message: continuityFailureMessage,
      response: continuityFailureMessage,
      construct_id: constructId,
      provider_used: null,
      model: null,
      runtime_receipt: continuityFailureReceipt,
      orchestration_checklist: continuityFailureChecklist,
    });
  }
  if (isSyntheticContinueTurn) {
    console.log("↪️ [VVAULT Proxy] Processing continue-turn without new user text");
  }
  if (hasImages) {
    console.log(`📎 [VVAULT Proxy] Processing ${attachments.length} image attachments`);
    console.log(`🖼️ [VVAULT Proxy] Vision intent mode: ${explicitVisionIntent ? 'explicit-analysis' : 'character-first'}`);
  }

  const identityBundle = await validateIdentityBundle({
    userId: dataOwnerUserId,
    constructId,
    userEmail: req.user?.email || null,
    includeUndertone: isLinOrchestratedConstruct(constructId) && !isProtectedZenConstruct(constructId),
  });

  if (!identityBundle.ok) {
    const receiptConstructName = constructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase());
    const preflightRuntimeReceipt = {
      created_at: new Date().toISOString(),
      user_id: dataOwnerUserId || null,
      auth: authReceipt,
      construct_id: constructId,
      effective_construct_id: constructId,
      effective_construct_name: receiptConstructName,
      orchestration_mode: 'unknown',
      route_mode: 'vvault_message',
      persistence_owner: 'blocked_identity_preflight',
      identity: {
        source: 'identity_bundle_preflight',
        base_prompt_source: identityBundle.preflight?.identity?.prompt_source || 'unknown',
        conditioning_appended: false,
        identity_bundle_hash: null,
        effective_construct_id: constructId,
        effective_construct_name: receiptConstructName,
        selected_construct_id: canonicalConstructId || constructId,
        raw_construct_id: rawConstructId,
        preflight: {
          code: identityBundle.code,
          error: identityBundle.error,
          details: identityBundle.details || {},
          ...(identityBundle.preflight || {}),
        },
      },
      provider: {
        final_provider: null,
        provider: null,
        model: null,
        mode: 'unknown',
        fallback_used: false,
      },
      memory: {
        memory_profile: 'off',
        supabase_accessed: false,
      },
      fidelity: {
        identity_coherence: {
          status: 'skipped',
          reasons: [identityBundle.error],
          signals: [],
          violations: [],
          repair_attempted: false,
          repair_applied: false,
          persist_canonical: false,
          owner_file: 'server/lib/identityBundlePreflight.js',
          source_anchor: 'server/lib/identityBundlePreflight.js:validateIdentityBundle',
        },
      },
    };
    const preflightEnrichedContext = {
      phaseTiming: {
        identity: {
          source: 'error',
          error: identityBundle.error,
          code: identityBundle.code,
        },
        basePromptSource: identityBundle.preflight?.identity?.prompt_source || 'identity_bundle_preflight',
        conditioningInjected: false,
        memorySearch: { skipped: true, reason: 'identity_bundle_preflight_failed' },
        knowledge: { skipped: true, reason: 'identity_bundle_preflight_failed' },
      },
      capabilityManifest: {
        enabled: { proactiveInitiation: false },
        state: { selfpromptOn: false },
      },
      evidence_count: 0,
      memory_retrieval_ran: false,
      memory_query_detected: false,
    };
    const preflightChecklist = buildOrchestrationChecklist({
      userId: dataOwnerUserId,
      user: req.user,
      constructId,
      threadId: sessionId || threadId || `${constructId}_chat_with_${constructId}`,
      userMessage: message,
      gptConfig: {
        name: receiptConstructName,
        orchestrationMode: 'unknown',
      },
      enrichedContext: preflightEnrichedContext,
      retrievalDiagnostics: {
        evidence_count: 0,
        retrieval_counts: { vector: 0, verified: 0, needle: 0, transcript: 0 },
        phase_timing: {},
      },
      promptDiagnostics: {
        route: '/api/vvault/message',
        mode: 'preflight_failure',
        constructId,
        prompt_source: 'identity_bundle_preflight',
        base_prompt_source: identityBundle.preflight?.identity?.prompt_source || 'identity_bundle_preflight',
        basePromptSource: identityBundle.preflight?.identity?.prompt_source || 'identity_bundle_preflight',
        conditioning_appended: false,
        preview_mode: Boolean(previewMode),
        skip_persistence: true,
        final_history_count: 0,
        prompt_chars: 0,
      },
      providerTrace: {
        final_provider: null,
        fallback_used: false,
        attempts: [],
      },
      validatorDebug: {},
      runtimeReceipt: preflightRuntimeReceipt,
      contextMode: 'identity_preflight_failed',
      relationalTurn: false,
      lowComplexityTurn: false,
      hasImages,
      skipPersistence: true,
      previewMode,
      requestedConstructId: rawConstructId,
      canonicalConstructId: canonicalConstructId || constructId,
      responseStatus: 'identity_bundle_preflight_failed',
    });
    const identityErrorPayload = {
      ok: false,
      success: false,
      constructId,
      construct_id: constructId,
      code: identityBundle.code,
      error: identityBundle.error,
      details: identityBundle.details,
      runtime_receipt: preflightRuntimeReceipt,
      orchestration_checklist: preflightChecklist,
      has_images: hasImages,
    };
    console.error(`❌ [VVAULT Proxy] Identity preflight failed for ${constructId}: ${identityBundle.code}`, identityBundle.details);
    return res.status(503).json(identityErrorPayload);
  }

  const { vvaultApiBaseUrl } = getVvaultBridgeConfig();

  // ALWAYS-ON: Build enriched context locally for ALL messages (Phase 3 of Memory Orchestration Plan)
  // This ensures constructs always have their identity, capsule, transcript memories, and anti-roleplay directives
  // regardless of which LLM provider handles inference
  {
    // Fetch GPT config and Supabase metadata
    let meta = null;
    try {
      gptConfig = await gptManager.getGPTByCallsign(constructId);
      if (gptConfig) {
        console.log(`📋 [VVAULT Proxy] Found GPT config for ${constructId}, model: ${gptConfig.conversationModel || gptConfig.modelId || 'none'}`);
      }
    } catch (gptError) {
      console.warn(`⚠️ [VVAULT Proxy] Could not fetch GPT config for ${constructId}:`, gptError.message);
    }

    const { codingIntent: earlyCodingIntent } = detectCodingIntent(message);
    const earlyDetectedSeat = detectLinSeat(message, { codingMode: earlyCodingIntent, hasImages });
    const earlyRequestedSeat = shouldPromoteResumedContinuationSeat({
      requestedSeat: earlyDetectedSeat,
      message,
      continuityResume: continuityResumeValidation,
      codingMode: earlyCodingIntent,
      hasImages,
    })
      ? 'conversation'
      : earlyDetectedSeat;
    const boundedZenSmalltalkRoute = shouldUseBoundedZenSmalltalkContext({
      constructId,
      requestedSeat: earlyRequestedSeat,
      userMessage: message,
      previewMode,
      hasImages,
      continuityResume: continuityResumeValidation,
    });
    let metadataRecovery = {
      attempted: false,
      applied: false,
      profile: boundedZenSmalltalkRoute ? 'zen_smalltalk_bounded' : 'standard',
      status: 'not_attempted',
      timeout_ms: null,
      fallback_source: null,
    };

    try {
      const metadataResult = await loadAIMetadataWithRecovery({
        constructId,
        userId: dataOwnerUserId,
        authenticatedUserId: userId,
        userMessage: message,
        requestedSeat: earlyRequestedSeat,
        previewMode,
        hasImages,
      });
      meta = metadataResult.meta;
      metadataRecovery = metadataResult.recovery || metadataRecovery;
      if (meta) {
        console.log(`📋 [VVAULT Metadata] Loaded AIS metadata for ${constructId}: model=${meta.model || 'none'}, provider=${meta.provider || 'none'}`);
      } else if (metadataRecovery.applied) {
        console.log(`📋 [VVAULT Metadata] Using local AI record fallback for ${constructId} (${metadataRecovery.status})`);
      }
    } catch (metaErr) {
      console.warn(`⚠️ [VVAULT Metadata] Failed to load metadata for ${constructId}:`, metaErr.message);
    }

    // Merge metadata into gptConfig for routing
    if (meta) {
      gptConfig = {
        ...gptConfig,
        modelId: meta.model || gptConfig?.modelId,
        conversationModel: meta.model || gptConfig?.conversationModel,
        provider: meta.provider || gptConfig?.provider,
        coderModel: meta.coderModel || gptConfig?.coderModel,
        coderProvider: meta.coderProvider || gptConfig?.coderProvider,
        capabilities: meta.capabilities || gptConfig?.capabilities,
        tags: meta.tags || gptConfig?.tags,
        categories: meta.categories || gptConfig?.categories,
        systemPromptOverride: meta.systemPromptOverride || gptConfig?.systemPromptOverride,
        configJson: meta.configJson || gptConfig?.configJson,
        avatarUrl: meta.avatarUrl || gptConfig?.avatarUrl || gptConfig?.avatar,
      };
      if (meta.model && meta.provider && !meta.model.includes(':')) {
        const combined = `${meta.provider}:${meta.model}`;
        gptConfig.modelId = combined;
        gptConfig.conversationModel = combined;
      }
      gptConfig = applyForgedSimLockToRecord(gptConfig);
    }

    if (requestModelOverride && typeof requestModelOverride === 'string' && !readForgedSimLock(gptConfig)) {
      const requestedModelString = requestProviderOverride && !requestModelOverride.includes(':')
        ? `${requestProviderOverride}:${requestModelOverride}`
        : requestModelOverride;
      gptConfig = {
        ...gptConfig,
        modelId: requestedModelString,
        conversationModel: requestedModelString,
        provider: requestProviderOverride || gptConfig?.provider,
      };
    }

    const generationParams = {};
    const cfg = meta?.configJson;
    if (cfg) {
      if (Number.isFinite(cfg.temperature)) generationParams.temperature = cfg.temperature;
      if (Number.isFinite(cfg.top_p)) generationParams.top_p = cfg.top_p;
      if (Number.isFinite(cfg.max_tokens)) generationParams.max_tokens = cfg.max_tokens;
      if (cfg.maxTokens && Number.isFinite(cfg.maxTokens)) generationParams.max_tokens = cfg.maxTokens;
    }

    const {
      forceLinMode,
      codingIntent,
      codingReason,
      capabilityIntent,
      codingMode,
      requestedSeat,
    } = resolveLinTurnRouting(message, gptConfig, {
      hasImages,
      linearTranscriptLawGate: linearTranscriptLawGate === true,
      zenOrdinaryVoiceGate: zenOrdinaryVoiceGate === true,
      continuityResume: continuityResumeValidation,
    });
    const contextBudget = resolveRouteContextBudgetProfile({
      constructId,
      message,
      hasImages,
      previewMode,
      codingMode,
      requestedSeat,
      activeOrchestrationProfile,
      zenOrdinaryVoiceGate: zenOrdinaryVoiceGate === true,
      linearTranscriptLawOrdinaryTurn,
      continuityResume: continuityResumeValidation,
    });
    routeTurnEnvelope.continuityClass = contextBudget.transcript_law_evidence_intent
      ? 'transcript_law'
      : 'ordinary';
    routeTurnEnvelope.transcriptLawRequired = Boolean(contextBudget.transcript_law_evidence_intent);
    routeTurnEnvelope.transcriptTruth = {
      required: false,
      eligible: false,
      hydrationSource: 'not_required',
      hydrationComplete: null,
    };
    const transcriptTruthRequired = shouldRequireCanonicalTranscriptTruth({
      continueTurn,
      continuityResume: continuityResumeValidation,
      runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
      sessionId: effectiveTurnSessionId,
      constructId,
      message,
      previewMode,
      skipPersistence,
    });
    const implicitContinuationRequest =
      isExplicitResumeContinuationCue(message) &&
      continuityResumeValidation?.continuityExpected !== true;
    const transcriptTruthRequiresRuntimeState =
      continueTurn === true ||
      continuityResumeValidation?.continuityExpected === true ||
      implicitContinuationRequest === true ||
      Boolean(routeTurnEnvelope.runtimeTurnState?.assistantTurnId);
    if (transcriptTruthRequired) {
      routeTurnEnvelope.transcriptTruth.required = true;
      try {
        await loadVVAULTModules();
      } catch (error) {
        const payload = buildTranscriptTruthFailurePayload({
          authReceipt,
          userId: dataOwnerUserId,
          user: req.user,
          constructId,
          rawConstructId,
          canonicalConstructId,
          message,
          threadId,
          sessionId,
          hasImages,
          previewMode,
          gptConfig,
          continuityResume: routeTurnEnvelope.continuityResume,
          transcriptTruth: buildTranscriptTruthPreflight({
            readPathAvailable: false,
            sessionId: effectiveTurnSessionId,
            constructId,
            runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
            requireRuntimeTurnState: transcriptTruthRequiresRuntimeState,
          }),
          code: 'CANONICAL_TRANSCRIPT_READ_UNAVAILABLE',
          error: 'Canonical transcript read path is unavailable, so continuation generation is blocked.',
          responseStatus: 'canonical_transcript_read_unavailable',
        });
        return sendSerializedJson(res, 503, payload, 'transcript-truth-unavailable');
      }

      if (typeof readConversations !== 'function') {
        const payload = buildTranscriptTruthFailurePayload({
          authReceipt,
          userId: dataOwnerUserId,
          user: req.user,
          constructId,
          rawConstructId,
          canonicalConstructId,
          message,
          threadId,
          sessionId,
          hasImages,
          previewMode,
          gptConfig,
          continuityResume: routeTurnEnvelope.continuityResume,
          transcriptTruth: buildTranscriptTruthPreflight({
            readPathAvailable: false,
            sessionId: effectiveTurnSessionId,
            constructId,
            runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
            requireRuntimeTurnState: transcriptTruthRequiresRuntimeState,
          }),
          code: 'CANONICAL_TRANSCRIPT_READ_UNAVAILABLE',
          error: 'Canonical transcript read path is unavailable, so continuation generation is blocked.',
          responseStatus: 'canonical_transcript_read_unavailable',
        });
        return sendSerializedJson(res, 503, payload, 'transcript-truth-unavailable');
      }

      transcriptTruthLookupId =
        transcriptTruthLookupId ||
        buildConversationLookupContext({
          userEmail: req.user?.email || null,
          supabaseUserId: UUID_LOOKUP_RE.test(String(dataOwnerUserId || '').trim())
            ? dataOwnerUserId
            : supabaseSessionUserId,
          userId: dataOwnerUserId || req.user?.vvaultUserId || userId,
        });
      try {
        preloadedTranscriptTruthRows =
          preloadedTranscriptTruthRows ||
          await readConversations(transcriptTruthLookupId, constructId, {
            allowLocalFallback: false,
          });
      } catch (error) {
        const payload = buildTranscriptTruthFailurePayload({
          authReceipt,
          userId: dataOwnerUserId,
          user: req.user,
          constructId,
          rawConstructId,
          canonicalConstructId,
          message,
          threadId,
          sessionId,
          hasImages,
          previewMode,
          gptConfig,
          continuityResume: routeTurnEnvelope.continuityResume,
          transcriptTruth: buildTranscriptTruthPreflight({
            readPathAvailable: false,
            sessionId: effectiveTurnSessionId,
            constructId,
            runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
            requireRuntimeTurnState: transcriptTruthRequiresRuntimeState,
          }),
          code: 'CANONICAL_TRANSCRIPT_READ_UNAVAILABLE',
          error: `Canonical transcript read failed: ${error.message}`,
          responseStatus: 'canonical_transcript_read_unavailable',
        });
        return sendSerializedJson(res, 503, payload, 'transcript-truth-unavailable');
      }

      if (routeTurnEnvelope.persistedStateSource === 'local_fallback_metadata') {
        routeTurnEnvelope.runtimeTurnState = null;
      }
      let transcriptTruth = buildTranscriptTruthPreflight({
        readPathAvailable: true,
        conversations: preloadedTranscriptTruthRows,
        sessionId: effectiveTurnSessionId,
        constructId,
        runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
        requireRuntimeTurnState: transcriptTruthRequiresRuntimeState,
      });
      const rebuiltRuntimeTurnState =
        transcriptTruthRequiresRuntimeState !== true &&
        transcriptTruth.exactThreadFound === true &&
        transcriptTruth.hydrationSource === 'full' &&
        (transcriptTruth.reason === 'runtime_turn_state_missing' ||
          transcriptTruth.reason === 'runtime_turn_state_hydration_unproven' ||
          transcriptTruth.reason === 'runtime_turn_state_thread_mismatch')
          ? rebuildRuntimeTurnStateFromCanonicalTranscript({
              exactMessages: transcriptTruth.exactMessages,
              sessionId: effectiveTurnSessionId,
              constructId,
            })
          : null;
      if (rebuiltRuntimeTurnState) {
        routeTurnEnvelope.runtimeTurnState = rebuiltRuntimeTurnState;
        routeTurnEnvelope.persistedStateSource = 'canonical_tail_rebuild';
        transcriptTruth = buildTranscriptTruthPreflight({
          readPathAvailable: true,
          conversations: preloadedTranscriptTruthRows,
          sessionId: effectiveTurnSessionId,
          constructId,
          runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
          requireRuntimeTurnState: transcriptTruthRequiresRuntimeState,
        });
        const recoveredContinuityResumeValidation = validateRuntimeResumeRequest({
          runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
          resumeRequest: continuityResumeRequest,
          sessionId: effectiveTurnSessionId,
          constructId,
        });
        routeTurnEnvelope.continuityExpected =
          recoveredContinuityResumeValidation.continuityExpected === true;
        routeTurnEnvelope.continuityResume = recoveredContinuityResumeValidation;
      }
      routeTurnEnvelope.transcriptTruth = {
        required: true,
        ...transcriptTruth,
      };
      if (transcriptTruth.runtimeTurnState) {
        routeTurnEnvelope.runtimeTurnState = transcriptTruth.runtimeTurnState;
        routeTurnEnvelope.persistedStateSource = 'canonical_tail_metadata';
        const effectiveResumeRequest =
          implicitContinuationRequest === true
            ? {
                continuity_expected: true,
                resume_from_turn_id: routeTurnEnvelope.runtimeTurnState.assistantTurnId,
                resume_from_continuity_seq: routeTurnEnvelope.runtimeTurnState.continuitySeq,
                resume_tail_hash: routeTurnEnvelope.runtimeTurnState.tailHash,
                resume_construct_revision: routeTurnEnvelope.runtimeTurnState.constructRevision,
                resume_source_seat: 'chatty',
              }
            : continuityResumeRequest;
        continuityResumeValidation = validateRuntimeResumeRequest({
          runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
          resumeRequest: effectiveResumeRequest,
          sessionId: effectiveTurnSessionId,
          constructId,
        });
        routeTurnEnvelope.continuityExpected =
          continuityResumeValidation.continuityExpected === true;
        routeTurnEnvelope.continuityResume = continuityResumeValidation;
      }
      if (!transcriptTruth.eligible) {
        const payload = buildTranscriptTruthFailurePayload({
          authReceipt,
          userId: dataOwnerUserId,
          user: req.user,
          constructId,
          rawConstructId,
          canonicalConstructId,
          message,
          threadId,
          sessionId,
          hasImages,
          previewMode,
          gptConfig,
          continuityResume: routeTurnEnvelope.continuityResume,
          transcriptTruth,
          code: 'TRANSCRIPT_HYDRATION_REQUIRED',
          error: 'Canonical transcript hydration is incomplete, fallback-shaped, or missing the real assistant tail.',
          responseStatus: 'transcript_hydration_required',
        });
        return sendSerializedJson(res, 409, payload, 'transcript-truth-required');
      }
      if (
        routeTurnEnvelope.continuityResume?.continuityExpected === true &&
        routeTurnEnvelope.continuityResume?.continuityRestored !== true
      ) {
        const continuityFailureCode = routeTurnEnvelope.continuityResume.staleSeatRejected
          ? 'CONTINUITY_RESUME_STALE'
          : 'CONTINUITY_RESUME_UNPROVEN';
        const continuityFailureMessage = routeTurnEnvelope.continuityResume.staleSeatRejected
          ? 'Continuity resume was rejected because this seat is stale. Reload the canonical thread and try again.'
          : 'Continuity resume could not be proven from the canonical thread tail. Reload the thread and try again.';
        const continuityReceipt = buildContinuityProofReceipt({
          hydration: routeTurnEnvelope.continuityResume.hydration,
          hydrationComplete: routeTurnEnvelope.continuityResume.hydrationComplete,
          resumeValidation: routeTurnEnvelope.continuityResume,
        });
        const continuityFailureReceipt = {
          created_at: new Date().toISOString(),
          user_id: dataOwnerUserId || null,
          auth: authReceipt,
          construct_id: constructId,
          effective_construct_id: constructId,
          effective_construct_name: deriveConstructReceiptName(constructId, gptConfig),
          orchestration_mode: gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
          route_mode: 'vvault_message',
          persistence_owner: 'continuity_resume_blocked',
          continuity: continuityReceipt,
          ...continuityReceipt,
          transcript_truth: {
            eligible: routeTurnEnvelope.transcriptTruth?.eligible === true,
            source: routeTurnEnvelope.transcriptTruth?.hydrationSource || 'none',
            hydration_complete: routeTurnEnvelope.transcriptTruth?.hydrationComplete === true,
            exact_thread_id: effectiveTurnSessionId,
            exact_thread_found: routeTurnEnvelope.transcriptTruth?.exactThreadFound === true,
            assistant_tail_found: routeTurnEnvelope.transcriptTruth?.assistantTailFound === true,
            runtime_state_found: routeTurnEnvelope.transcriptTruth?.runtimeStateFound === true,
            runtime_state_hydration_truth:
              routeTurnEnvelope.transcriptTruth?.runtimeStateHydrationTruth || null,
            evidence_count: Number(routeTurnEnvelope.transcriptTruth?.evidenceCount || 0),
            evidence_sources: routeTurnEnvelope.transcriptTruth?.evidenceSources || [],
            fallback_rejected: routeTurnEnvelope.transcriptTruth?.fallbackRejected === true,
            retrieval_status: 'verified',
            blocked_reason: routeTurnEnvelope.continuityResume.failureReason || null,
          },
          capsule_runtime: {
            capsuleLoaded: null,
            capsuleSource: null,
            contextProfile: null,
            continuityFromRuntimeState: false,
            continuityMemorySource: null,
          },
          memory: {
            retrieval_ran: false,
            memory_query_detected: false,
            evidence_count: 0,
            transcript_memory_status: 'blocked',
            history_source: routeTurnEnvelope.transcriptTruth?.hydrationSource || 'none',
            transcript_sources: routeTurnEnvelope.transcriptTruth?.evidenceSources || [],
          },
          provider: {
            final_provider: null,
            provider: null,
            model: null,
            mode: gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
            fallback_used: false,
          },
        };
        const continuityFailureChecklist = buildOrchestrationChecklist({
          userId: dataOwnerUserId,
          user: req.user,
          constructId,
          threadId: effectiveTurnSessionId,
          userMessage: message,
          gptConfig,
          runtimeReceipt: continuityFailureReceipt,
          responseStatus: 'continuity_resume_blocked',
          skipPersistence: false,
        });
        return res.status(409).json({
          ok: false,
          success: false,
          constructId,
          construct_id: constructId,
          code: continuityFailureCode,
          error: continuityFailureMessage,
          details: routeTurnEnvelope.continuityResume,
          runtime_receipt: continuityFailureReceipt,
          orchestration_checklist: continuityFailureChecklist,
          has_images: hasImages,
        });
      }
    }
    const routingMode = forceLinMode || isLinOrchestratedConstruct(constructId) || shouldForceProtectedZenLinMode({
      constructId,
      userMessage: message,
      requestedSeat,
      previewMode,
      hasImages,
      codingMode,
    })
      ? 'lin'
      : normalizeOrchestrationMode(gptConfig, {
          defaultMode: isLinOrchestratedConstruct(constructId) ? 'lin' : 'custom',
        });

    let coderModel =
      gptConfig?.coderModel ||
      cfg?.coderModel ||
      meta?.coderModel ||
      DEFAULT_CODER_MODEL;
    let coderProvider =
      gptConfig?.coderProvider ||
      cfg?.coderProvider ||
      meta?.coderProvider ||
      DEFAULT_CODER_PROVIDER;

    if (coderModel && coderModel.includes(':') && !coderProvider) {
      const [prov, modelPart] = coderModel.split(':', 2);
      coderProvider = prov;
      coderModel = modelPart || coderModel;
    }
    if (routingMode === 'lin') {
      const linCodingDefault = parseConfiguredModel(LIN_MODEL_DEFAULTS.coding, 'ollama', LIN_MODEL_DEFAULTS.coding.replace(/^ollama:/, ''));
      coderProvider = linCodingDefault.provider;
      coderModel = linCodingDefault.model;
    }

    // Resolve model using GPTCreator config as source of truth
    const providerAvailability = await buildProviderAvailability();
    const codingSeatActive = codingMode || requestedSeat === 'coding';
    const modelResolution = resolveModelForGPT(
      gptConfig,
      providerAvailability,
      {
        seat: requestedSeat,
        mode: routingMode,
        forceMode: routingMode === 'lin' ? 'lin' : null,
        constructId,
        userMessage: message,
        previewMode,
        hasImages,
        codingMode,
      },
    );
    let { provider: effectiveProvider, model: effectiveModel, source: modelSource, error: modelError } = modelResolution;

    if (modelError) {
      return res.status(503).json({ success: false, error: modelError });
    }

    let effectiveRouteFallbackUsed = false;
    let effectiveLocalFirstUsed = !!modelResolution.localFirstUsed;
    let effectiveLocalCloudFallbackState = modelResolution.localCloudFallbackState || null;
    let effectiveSeatDefaultsOrOverrides = modelResolution.seatDefaultsOrOverrides || null;

    const getOllamaExecutionModel = () => {
      if (modelResolution.mode === 'lin') {
        if (effectiveProvider === 'ollama' && effectiveModel) return effectiveModel;
        if (modelResolution.requestedProvider === 'ollama' && modelResolution.requestedModel) {
          return modelResolution.requestedModel;
        }
        if (modelResolution.provider === 'ollama' && modelResolution.model) return modelResolution.model;
      }
      return PREFERRED_OLLAMA_MODEL;
    };

    const markEffectiveRoute = ({
      source = null,
      localFirstUsed = null,
      localCloudFallbackState = null,
      fallbackUsed = null,
      seatDefaultsOrOverrides = null,
    } = {}) => {
      if (source) modelSource = source;
      if (typeof localFirstUsed === 'boolean') effectiveLocalFirstUsed = localFirstUsed;
      if (localCloudFallbackState) effectiveLocalCloudFallbackState = localCloudFallbackState;
      if (typeof fallbackUsed === 'boolean') effectiveRouteFallbackUsed = fallbackUsed;
      if (seatDefaultsOrOverrides) effectiveSeatDefaultsOrOverrides = seatDefaultsOrOverrides;
    };

    const markOllamaExecutionRoute = ({ fallbackUsed = false, localCloudFallbackState = null } = {}) => {
      const linSource = modelResolution.mode === 'lin' ? modelSource || modelResolution.source : null;
      markEffectiveRoute({
        source: linSource || (fallbackUsed ? 'fallback_to_ollama' : 'ollama_local_execution'),
        localFirstUsed: true,
        localCloudFallbackState: localCloudFallbackState || (fallbackUsed ? 'fallback_to_ollama' : 'local_first'),
        fallbackUsed,
      });
    };

    if (codingSeatActive && !hasImages) {
      const providerAvailable =
        (coderProvider === 'openrouter' && providerAvailability.openrouter) ||
        (coderProvider === 'replitOpenrouter' && providerAvailability.openrouter) ||
        (coderProvider === 'openai' && providerAvailability.openai) ||
        (coderProvider === 'ollama' && providerAvailability.ollama);

      if (providerAvailable) {
        if (coderProvider) effectiveProvider = coderProvider;
        if (coderModel) effectiveModel = coderModel;
        modelSource = routingMode === 'lin' ? 'lin_coding_local_defaults' : 'codex_mode';
        markEffectiveRoute({
          source: modelSource,
          localFirstUsed: coderProvider === 'ollama',
          localCloudFallbackState: routingMode === 'lin' && coderProvider === 'ollama'
            ? 'local_first'
            : modelResolution.localCloudFallbackState,
          seatDefaultsOrOverrides: routingMode === 'lin'
            ? 'lin_coding_local_defaults'
            : modelResolution.seatDefaultsOrOverrides,
        });
        if (generationParams.temperature === undefined) {
          generationParams.temperature = 0.35;
        }
      } else {
        console.warn(`[CODEX_MODE] coder provider unavailable (${coderProvider}); keeping resolved provider/model`);
      }
    }
    console.log("[MODEL_RESOLUTION]", {
      construct: gptConfig?.constructCallsign || gptConfig?.construct_callsign || constructId,
      provider: effectiveProvider,
      model: effectiveModel,
      source: modelSource,
      routingOverride: !!modelResolution.routingOverride,
      localFirstUsed: effectiveLocalFirstUsed,
      seatDefaultsOrOverrides: effectiveSeatDefaultsOrOverrides,
      preferLocalModels: PREFER_LOCAL_MODELS,
      codingMode,
      requestedSeat,
      codingReason,
      capabilityIntent
    });
    console.log('[CONTEXT_BUDGET_PROFILE]', {
      constructId,
      profile: contextBudget.profile,
      requestedProfile: contextBudget.requested_profile,
      memoryQueryDetected: contextBudget.memory_query_detected,
      evidenceStyleRequested: contextBudget.evidence_style_requested,
      transcriptLawPromptKind: contextBudget.transcript_law_prompt_kind,
      policyOrReceiptIntent: contextBudget.policy_or_receipt_intent,
      hasImages,
      codingMode,
      requestedSeat,
    });
    console.log('[RUNTIME_TURN_STATE]', {
      stage: 'classified',
      sessionId: effectiveTurnSessionId,
      constructId,
      continuityClass: routeTurnEnvelope.continuityClass,
      transcriptLawRequired: routeTurnEnvelope.transcriptLawRequired,
      persistedStateSource: routeTurnEnvelope.persistedStateSource,
    });

    if (hasImages && meta && routingMode !== 'lin') {
      if (meta.provider) effectiveProvider = meta.provider;
      if (meta.model) effectiveModel = meta.model;
    }

    // ===== NOVA-001 AUTHORITATIVE GUARD: Never resolve to OpenAI, regardless of path =====
    if (constructId === 'nova-001' && effectiveProvider === 'openai') {
      if (replitOpenrouter || openrouter) {
        effectiveProvider = replitOpenrouter ? 'replitOpenrouter' : 'openrouter';
        effectiveModel = DEFAULT_OPENROUTER_MODEL;
        console.log(`[NOVA GUARD] Authoritative override: openai→${effectiveProvider} for nova-001`);
      } else {
        console.error(`[NOVA GUARD] No alternative provider for nova-001 (OpenAI blocked)`);
        return res.status(503).json({ success: false, error: 'No provider available for nova-001 (OpenAI blocked)' });
      }
    }

    // Override for vision requests (images need a vision-capable model)
    if (hasImages) {
      if (constructId === 'nova-001') {
        if (replitOpenrouter || openrouter) {
          effectiveProvider = replitOpenrouter ? 'replitOpenrouter' : 'openrouter';
          effectiveModel = 'qwen/qwen2.5-vl-72b-instruct';
          console.log(`📎 [NOVA HOTFIX] vision path: forcing ${effectiveProvider} vision model (${effectiveModel}) — OpenAI bypassed`);
        } else {
          console.error('❌ [NOVA HOTFIX] vision path: no vision-capable provider available (OpenAI blocked for nova-001)');
          return res.status(503).json({ success: false, error: 'Vision requires OpenRouter for nova-001. No provider available.' });
        }
      } else if (openaiClient) {
        effectiveProvider = 'openai';
        effectiveModel = 'gpt-4o';
        console.log(`📎 [VVAULT Proxy] Images attached, forcing OpenAI vision model: ${effectiveModel}`);
      } else if (openrouter) {
        effectiveProvider = 'openrouter';
        effectiveModel = 'qwen/qwen2.5-vl-72b-instruct';
        console.log(`📎 [VVAULT Proxy] Images attached, using OpenRouter vision model: ${effectiveModel}`);
      } else {
        console.error('❌ [VVAULT Proxy] Images attached but no vision-capable provider configured');
        return res.status(503).json({
          success: false,
          error: 'Image processing requires OpenAI or OpenRouter. Please configure one of these providers.'
        });
      }
    }

    // Auto-initialize construct's memory stack if not already active
    if (boundedZenSmalltalkRoute) {
      console.log(`🔧 [VVAULT Proxy] Skipping memory stack auto-init for ${constructId} due to bounded Zen smalltalk recovery lane`);
    } else {
      try {
        const { masterScriptsManager } = await import('../lib/masterScriptsBridge.js');
        if (!masterScriptsManager.getConstruct(constructId)) {
          await masterScriptsManager.initializeConstruct(constructId, userId);
          console.log(`🔧 [VVAULT Proxy] Auto-initialized memory stack for ${constructId}`);
        }
      } catch (msErr) {
        console.warn(`⚠️ [VVAULT Proxy] Memory stack init deferred for ${constructId}:`, msErr.message);
      }
    }

    const clientTimezone = req.headers['x-user-timezone'] || null;

    const previewSystemPromptOverrideSuppressed = Boolean(
      previewMode &&
      typeof systemPromptOverride === 'string' &&
      systemPromptOverride.trim()
    );
    const effectiveSystemPromptOverride = previewMode
      ? null
      : (meta?.systemPromptOverride || meta?.configJson?.instructions || systemPromptOverride) ?? null;
    const effectivePreviewDraft =
      previewMode && previewDraft && typeof previewDraft === 'object' && !Array.isArray(previewDraft)
        ? previewDraft
        : null;
    if (previewSystemPromptOverrideSuppressed) {
      console.warn(`[GPTCreator Preview] Suppressed systemPromptOverride for ${constructId}; canonical identity remains the base prompt.`);
    }

    let enrichedContext;
    let enrichedSystemPrompt;
    try {
      const enrichedResult = await buildEnrichedContextPromptWithRecovery({
        res,
        authReceipt,
        userId: dataOwnerUserId,
        user: req.user,
        constructId,
        rawConstructId,
        canonicalConstructId,
        message,
        gptConfig,
        threadId,
        sessionId,
        timezone: clientTimezone,
        systemPromptOverride: effectiveSystemPromptOverride,
        previewMode,
        previewDraft: effectivePreviewDraft,
        suppressedSystemPromptOverride: previewSystemPromptOverrideSuppressed,
        identityBundle,
        requestedSeat,
        hasImages,
        skipPersistence,
        contextBudgetProfile: contextBudget.profile,
        codingIntent,
        policyOrReceiptIntent: contextBudget.policy_or_receipt_intent,
        suppressTranscriptLawIntent: linearTranscriptLawOrdinaryTurn,
        runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
        continuityClass: routeTurnEnvelope.continuityClass,
        continuityResume: routeTurnEnvelope.continuityResume,
      });
      if (!enrichedResult) return;
      enrichedContext = enrichedResult.enrichedContext;
      enrichedSystemPrompt = enrichedResult.systemPrompt;
      routeTurnEnvelope.evidenceAttached = Boolean(enrichedContext?.evidence_count > 0);
      console.log('[RUNTIME_TURN_STATE]', {
        stage: 'hydrated',
        sessionId: effectiveTurnSessionId,
        constructId,
        continuityClass: routeTurnEnvelope.continuityClass,
        transcriptLawRequired: routeTurnEnvelope.transcriptLawRequired,
        evidenceAttached: routeTurnEnvelope.evidenceAttached,
      });
    } catch (contextErr) {
      if (contextErr?.code === 'IDENTITY_UNAVAILABLE') {
        console.error(`❌ [VVAULT Proxy] Identity unavailable for ${constructId}:`, contextErr.details || contextErr.message);
        return res.status(503).json({
          success: false,
          ok: false,
          code: 'IDENTITY_UNAVAILABLE',
          error: contextErr.message,
          constructId,
          construct_id: constructId,
          details: contextErr.details || null,
        });
      }
      throw contextErr;
    }
    let systemPrompt = enrichedSystemPrompt;

    if (effectiveSystemPromptOverride) {
      if (meta?.configJson?.overrideIdentity === true) {
        systemPrompt = effectiveSystemPromptOverride;
      } else {
        systemPrompt = `${effectiveSystemPromptOverride}\n\n${systemPrompt}`;
      }
    }
    if (enrichedContext?.memory_retrieval_ran || enrichedContext?.evidence_count > 0) {
      systemPrompt += `\n\nINTERNAL DIRECTIVE: Summarize retrieved knowledge naturally; do NOT cite or quote documents or filenames. Integrate context into conversation in-character.`;
    }

    if (codingMode) {
      const constructDisplayName = gptConfig?.name || constructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase());
      const codexDirective = `CODING MODE (${constructDisplayName}):
- Stay as ${constructDisplayName}. Do not rename yourself as Zen, Lin, Codex, Nova, or the model/provider.
- Give precise, file-referenced guidance (use repo-relative paths).
- Focus on actionable steps: what to change, where, and why.
- Keep responses concise and technical; avoid policy or provider chatter.`;
      systemPrompt = `${codexDirective}\n\n${systemPrompt}`;
    }

    let searchIntentReason = 'not_evaluated';
    let searchInjected = false;
    let searchVertical = 'none';
    let searchResults = null;
    let searchHousing = null;

    const shouldRunSearch = message && message.length >= RELATIONAL_LENGTH_THRESHOLD;
    if (shouldRunSearch) {
      const {
        enhancedPrompt: searchEnhancedPrompt,
        searchResults: searchResultsResolved,
        search_vertical: searchVerticalResolved,
        housing: searchHousingResolved,
        intent_reason: searchIntentReasonResolved,
        search_injected: searchInjectedResolved,
      } = await injectSearchContext(message, systemPrompt, { explicitOnly: true });
      systemPrompt = searchEnhancedPrompt;
      searchResults = searchResultsResolved || null;
      searchVertical = searchVerticalResolved || searchVertical;
      searchHousing = searchHousingResolved || null;
      searchIntentReason = searchIntentReasonResolved || searchIntentReason;
      searchInjected = searchInjectedResolved === true;
    } else {
      searchIntentReason = 'skipped_short_turn';
      searchInjected = false;
    }
    if (hasImages) {
      const visionDirective = explicitVisionIntent
        ? "INTERNAL DIRECTIVE: The user explicitly requested image analysis. Analyze the image while staying fully in character and relationally grounded."
        : "INTERNAL DIRECTIVE: The user shared an image without explicitly asking for analysis. Stay in character, continue the existing thread naturally, and avoid switching into profile/policy/report recitals.";
      systemPrompt += `\n\n${visionDirective}`;
    }

    const buildPromptDiagnostics = ({
      mode,
      enriched,
      historyCount,
      searchInjectedValue,
      systemPromptText,
    }) => ({
      route: '/api/vvault/message',
      mode,
      constructId,
      prompt_source: 'enriched_context',
      base_prompt_source: enriched?.phaseTiming?.basePromptSource || 'unknown',
      gpt_config_present: !!gptConfig,
      identity_source: enriched?.phaseTiming?.identity?.source || 'unknown',
      conditioning_appended: !!enriched?.phaseTiming?.conditioningInjected,
      preview_mode: Boolean(previewMode),
      skip_persistence: Boolean(skipPersistence),
      preview_identity: {
        effective_construct_id: constructId,
        selected_construct_id: canonicalConstructId || constructId,
        raw_construct_id: rawConstructId,
        draft_overlay_applied: Boolean(enriched?.phaseTiming?.preview?.draftOverlayApplied),
        draft_overlay_keys: enriched?.phaseTiming?.preview?.draftOverlayKeys || [],
        suppressed_system_prompt_override: Boolean(enriched?.phaseTiming?.preview?.suppressedSystemPromptOverride),
      },
      retrieval_injected: searchInjectedValue === true || (enriched?.evidence_count ?? 0) > 0,
      final_history_count: historyCount,
      prompt_chars: typeof systemPromptText === 'string' ? systemPromptText.length : 0,
	      context_profile: enriched?.context_profile || enriched?.context_budget?.profile || 'standard_turn',
	      included_sections: enriched?.context_budget?.included_sections || [],
	      delayed_sections: enriched?.context_budget?.delayed_sections || [],
	      no_rewrite_identity_anchor: Boolean(enriched?.no_rewrite_identity_anchor),
	      identity_rewrite_prevented_by: enriched?.identity_rewrite_prevented_by || null,
	    });

    try {
      const userAccountType = await getAccountType(userId);
      if (userAccountType === 'child') {
        const childSettings = await getChildSettings(userId);
        if (childSettings) {
          const safeDirectives = buildChildSafeDirectives(childSettings);
          systemPrompt = safeDirectives + '\n\n' + systemPrompt;
          console.log(`[ParentalControls] Child-safe directives injected for ${userId} (filter: ${childSettings.contentFilterLevel})`);
        }
      }
    } catch (pcErr) {
      console.warn(`[ParentalControls] Could not check account type:`, pcErr.message);
    }

    try {
      const gate = await enforcePreInferenceGates(userId, constructId, message, gptConfig);
      if (gate.blocked) {
        console.log(`🚫 [ContentGate] BLOCKED pre-inference for ${userId} → ${constructId}: ${gate.reason}`);
        return res.status(403).json({
          success: false,
          blocked: true,
          reason: gate.reason,
          response: gate.message,
        });
      }
    } catch (gateErr) {
      console.error(`[ContentGate] Gate check failed (allowing through):`, gateErr.message);
    }

    console.log(`🧠 [VVAULT Proxy] System prompt length: ${systemPrompt.length} (capsule: ${enrichedContext.capsuleLoaded}, verified: ${enrichedContext.verifiedMemories || 0}, memories: ${enrichedContext.memoriesLoaded})`);
    if (systemPrompt.length >= PROMPT_WARN_CHARS) {
      console.warn(`⚠️ [VVAULT Proxy] Prompt size warning for ${constructId}: ${systemPrompt.length} chars (threshold: ${PROMPT_WARN_CHARS})`);
    }

    const noRewriteTinyTurn =
      Boolean(enrichedContext.no_rewrite_identity_anchor) &&
      (enrichedContext.context_profile === 'tiny_turn' ||
        enrichedContext.context_budget?.profile === 'tiny_turn');

    // Load conversation history for context (last 20 turns)
    let conversationHistoryMessages = [];
    let mainHistoryRemovedLeakCount = 0;
    let mainHistoryRemovedInstructionDumpCount = 0;
    let mainHistoryTailPrunedCount = 0;
    let repetitionReset = false;
    let repetitionReason = '';
    let noRewriteHistoryClamp = {
      clamped: false,
      limit: 2,
      originalCount: 0,
    };
    try {
      await loadVVAULTModules();
      const lookupId = buildConversationLookupContext({
        userEmail: req.user?.email || null,
        supabaseUserId: UUID_LOOKUP_RE.test(String(dataOwnerUserId || '').trim())
          ? dataOwnerUserId
          : supabaseSessionUserId,
        userId: dataOwnerUserId || req.user?.vvaultUserId || userId,
      });
      const targetSession = sessionId || threadId || `${constructId}_chat_with_${constructId}`;
      const exactCanonicalThreadTargeted =
        targetSession === `${constructId}_chat_with_${constructId}`;
      if (
        routeTurnEnvelope.transcriptTruth?.required === true &&
        routeTurnEnvelope.transcriptTruth?.eligible === true &&
        Array.isArray(routeTurnEnvelope.transcriptTruth?.exactMessages) &&
        routeTurnEnvelope.transcriptTruth.exactMessages.length > 0
      ) {
        const sanitized = sanitizeConversationHistory(
          routeTurnEnvelope.transcriptTruth.exactMessages,
          constructId,
          'canonical-transcript-truth-history',
        );
        mainHistoryRemovedLeakCount = sanitized.removedLeakCount || 0;
        mainHistoryRemovedInstructionDumpCount = sanitized.removedInstructionDumpCount || 0;
        const runtimeRestoredHistoryWindow =
          routeTurnEnvelope.continuityResume?.continuityRestored === true
            ? Math.min(HISTORY_WINDOW_LIMIT, 6)
            : HISTORY_WINDOW_LIMIT;
        conversationHistoryMessages = (sanitized.messages || [])
          .slice(-runtimeRestoredHistoryWindow)
          .map((m) => ({ role: m.role, content: m.content || '' }));
        console.log(`📚 [VVAULT Proxy] Using ${conversationHistoryMessages.length} canonical transcript-truth history messages for ${constructId}`, {
          historySource: routeTurnEnvelope.transcriptTruth.hydrationSource,
          sessionId: routeTurnEnvelope.transcriptTruth.exactThreadId,
        });
      } else if (previewMode && Array.isArray(transientHistory) && transientHistory.length > 0) {
        const previewHistory = transientHistory
          .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .slice(-HISTORY_WINDOW_LIMIT)
          .map((m) => ({ role: m.role, content: m.content }));
        const sanitized = sanitizeConversationHistory(previewHistory, constructId, 'preview-transient-history');
        mainHistoryRemovedLeakCount = sanitized.removedLeakCount || 0;
        mainHistoryRemovedInstructionDumpCount = sanitized.removedInstructionDumpCount || 0;
        conversationHistoryMessages = (sanitized.messages || []).slice(-HISTORY_WINDOW_LIMIT);
        console.log(`🧪 [VVAULT Proxy] Using ${conversationHistoryMessages.length} transient preview history messages for ${constructId}`);
      } else if (
        !exactCanonicalThreadTargeted &&
        Array.isArray(enrichedContext?.routeHistoryMessages) &&
        enrichedContext.routeHistoryMessages.length > 0
      ) {
        const sanitized = sanitizeConversationHistory(
          enrichedContext.routeHistoryMessages,
          constructId,
          'enriched-context-history',
        );
        mainHistoryRemovedLeakCount = sanitized.removedLeakCount || 0;
        mainHistoryRemovedInstructionDumpCount = sanitized.removedInstructionDumpCount || 0;
        conversationHistoryMessages = (sanitized.messages || []).slice(-HISTORY_WINDOW_LIMIT);
        console.log(`📚 [VVAULT Proxy] Using ${conversationHistoryMessages.length} locally recovered history messages for ${constructId}`, {
          historySource: enrichedContext.history_source || 'unknown',
        });
      } else if (readConversations && !enrichedContext?.remote_history_skipped) {
        const allConversations = await readConversations(lookupId, constructId);
        const allowConstructFallback = !exactCanonicalThreadTargeted && (
          !(sessionId || threadId) ||
          (contextBudget?.transcript_law_evidence_intent &&
            isTranscriptLawSyntheticGateThread(sessionId || threadId))
        );
        const conv = Array.isArray(allConversations)
          ? allConversations.find(c =>
              c.sessionId === targetSession ||
              c.id === targetSession ||
              (allowConstructFallback && (
                c.constructId === constructId ||
                c.constructCallsign === constructId
              ))
            )
          : null;
        if (conv && conv.messages && conv.messages.length > 0) {
          const sanitized = sanitizeConversationHistory(conv.messages, constructId, 'main-history');
          mainHistoryRemovedLeakCount = sanitized.removedLeakCount || 0;
          mainHistoryRemovedInstructionDumpCount = sanitized.removedInstructionDumpCount || 0;
          conversationHistoryMessages = (sanitized.messages || [])
            .slice(-HISTORY_WINDOW_LIMIT)
            .map(m => ({ role: m.role, content: m.content || '' }));

          // Detect simple repetition: last N assistant messages identical
          const assistantMessages = conversationHistoryMessages.filter(m => m.role === 'assistant');
          if (assistantMessages.length >= REPETITION_RESET_THRESHOLD) {
            const last = assistantMessages[assistantMessages.length - 1]?.content?.trim() || '';
            const prev = assistantMessages[assistantMessages.length - 2]?.content?.trim() || '';
            if (last && prev && last === prev) {
              repetitionReset = true;
              repetitionReason = 'assistant_repeat';
              conversationHistoryMessages = conversationHistoryMessages.slice(-2); // keep only the most recent exchange
            }
          }

          console.log(`📚 [VVAULT Proxy] Loaded ${conversationHistoryMessages.length} history messages for ${constructId}`, {
            repetitionReset,
            repetitionReason,
            windowLimit: HISTORY_WINDOW_LIMIT
          });
        }
      } else if (enrichedContext?.remote_history_skipped) {
        console.log(`📚 [VVAULT Proxy] Skipping remote history load for ${constructId} due to ${enrichedContext.context_recovery_profile || 'bounded context recovery'}`);
      }
    } catch (historyError) {
      console.warn(`⚠️ [VVAULT Proxy] Could not load conversation history:`, historyError.message);
    }

    if (linearTranscriptLawOrdinaryTurn) {
      if (conversationHistoryMessages.length > 0) {
        console.log(`📚 [VVAULT Proxy] Linear transcript-law ordinary turn: dropping ${conversationHistoryMessages.length} history messages and relying on harness state packet`);
      }
      conversationHistoryMessages = [];
      mainHistoryTailPrunedCount = 0;
      repetitionReset = false;
      repetitionReason = '';
    }

    // Vision turns use compacted context while preserving protected identity directives.
    if (hasImages) {
      if (conversationHistoryMessages.length > VISION_HISTORY_LIMIT) {
        conversationHistoryMessages = conversationHistoryMessages.slice(-VISION_HISTORY_LIMIT);
        console.log(`📎 [VVAULT Proxy] Trimmed history to last ${VISION_HISTORY_LIMIT} messages for vision request`);
      }

      const prunedVisionTail = pruneContaminatedHistoryTail(conversationHistoryMessages, {
        constructId,
        contextLabel: 'vision-history-tail',
        windowSize: Math.max(12, VISION_HISTORY_LIMIT + 4),
      });
      conversationHistoryMessages = prunedVisionTail.messages;
      mainHistoryTailPrunedCount += prunedVisionTail.removed;

      const compactedVisionPrompt = compactSystemPromptForVision(systemPrompt, VISION_SYSTEM_PROMPT_CAP);
      if (compactedVisionPrompt.compacted) {
        systemPrompt = compactedVisionPrompt.prompt;
        console.log(
          `📎 [VVAULT Proxy] Compacted vision system prompt to ${systemPrompt.length} chars (protected directives preserved: ${compactedVisionPrompt.protectedPreserved})`,
        );
      }
    }

    let lowComplexityTurn = isLowComplexityTurn(
      message,
      hasImages,
      conversationHistoryMessages.length,
      systemPrompt.length
    );
    const relationalTurn = isRelationalContinuityPrompt(message);
    const evidenceStyleTurn = asksForEvidenceStyle(message);
    let contextMode = 'full_retrieval';
    if (relationalTurn && lowComplexityTurn && !hasImages) {
      const pruned = pruneContaminatedHistoryTail(conversationHistoryMessages, {
        constructId,
        contextLabel: 'main-history-tail',
      });
      conversationHistoryMessages = pruned.messages;
      mainHistoryTailPrunedCount = pruned.removed;
      if (conversationHistoryMessages.length > RELATIONAL_HISTORY_LIMIT) {
        conversationHistoryMessages = conversationHistoryMessages.slice(-RELATIONAL_HISTORY_LIMIT);
      }
      const compactedRelationalPrompt = compactSystemPromptForRelationalTurn(systemPrompt, RELATIONAL_SYSTEM_PROMPT_CAP);
      if (compactedRelationalPrompt.compacted) {
        systemPrompt = compactedRelationalPrompt.prompt;
        console.log(
          `🫧 [VVAULT Proxy] Relational context mode enabled for ${constructId}; prompt chars=${systemPrompt.length} (protected directives preserved: ${compactedRelationalPrompt.protectedPreserved})`,
        );
      }
      lowComplexityTurn = isLowComplexityTurn(
        message,
        hasImages,
        conversationHistoryMessages.length,
        systemPrompt.length
      );
      contextMode = 'recent_chat_only';
    }

    if (noRewriteTinyTurn && !hasImages) {
      const clamped = clampProtectedZenNoRewriteHistory(conversationHistoryMessages, {
        enabled: true,
        limit: 2,
      });
      conversationHistoryMessages = clamped.messages;
      noRewriteHistoryClamp = {
        clamped: clamped.clamped,
        limit: clamped.limit,
        originalCount: clamped.originalCount,
      };
    }

    console.log('[CONTEXT_MODE]', {
      constructId,
      relationalTurn,
      lowComplexityTurn,
      contextMode,
      historyMessages: conversationHistoryMessages.length,
      mainHistoryRemovedLeakCount,
      mainHistoryRemovedInstructionDumpCount,
      mainHistoryTailPrunedCount,
    });

    // ── Associative memory activation (episodic/relational/symbolic fragments) ──
    const assocSeed = typeof req._rid === 'string'
      ? req._rid.split('').reduce((acc, ch) => (acc * 33 + ch.charCodeAt(0)) >>> 0, 0)
      : null;
    const { fragments: associativeFragments, debug: associativeDebug } = sampleAssociativeFragments({
      userMessage: message,
      history: conversationHistoryMessages,
      maxFragments: 2,
      seed: assocSeed,
    });
    if (associativeFragments.length > 0 && systemPrompt.length < PROMPT_WARN_CHARS) {
      const recallLines = associativeFragments
        .slice(0, 2)
        .map((frag) => `- memory fragment: "${frag}"`)
        .join("\n");
      systemPrompt = `${systemPrompt}\n\n[INTERNAL RECALL]\n${recallLines}`;
      console.log('[ASSOCIATIVE_RECALL]', {
        count: associativeFragments.length,
        activation: associativeDebug?.activation,
        topScores: associativeDebug?.topScores,
      });
    }

    const greetingTurnContext = buildRouteGreetingTurnContext({
      message,
      constructId,
      constructDisplayName: gptConfig?.name || constructId,
      gptConfig,
      identityBundle,
      recentMessages: conversationHistoryMessages,
      previewMode,
      hasImages,
      isSyntheticContinueTurn,
      evidenceStyle: evidenceStyleTurn,
      memoryQueryDetected: !!enrichedContext.memory_query_detected,
      assignmentQaInput,
      activeOrchestrationProfile,
      isHydroProjectTurn,
      sessionId: sessionId || threadId || `${constructId}_chat_with_${constructId}`,
    });
    if (greetingTurnContext?.isGreetingContactTurn) {
      systemPrompt = `${systemPrompt}\n\n${buildGreetingTurnDirective({
        posture: greetingTurnContext.posture,
        voiceContext: greetingTurnContext.voiceContext,
        constructDisplayName: gptConfig?.name || constructId,
      })}`;
    }

    const mainPromptDiagnostics = buildPromptDiagnostics({
      mode: 'main',
      enriched: enrichedContext,
      historyCount: conversationHistoryMessages.length,
      searchInjectedValue: searchInjected,
      systemPromptText: systemPrompt,
    });
    console.log('[PROMPT_SOURCE]', {
      ...mainPromptDiagnostics,
      history_filtered: {
        leaked_prompt: mainHistoryRemovedLeakCount,
        instruction_dump: mainHistoryRemovedInstructionDumpCount,
        relational_tail_pruned: mainHistoryTailPrunedCount,
      },
      relational_turn: relationalTurn,
      context_mode: contextMode,
      vision_mode: hasImages ? (explicitVisionIntent ? 'explicit-analysis' : 'character-first') : 'off',
    });

    const retrievalDiagnostics = {
      low_complexity_turn: lowComplexityTurn,
      system_prompt_chars: systemPrompt.length,
      phase_timing: enrichedContext.phaseTiming || {},
      context_profile: enrichedContext.context_profile || enrichedContext.context_budget?.profile || contextBudget.profile,
      included_sections: enrichedContext.context_budget?.included_sections || [],
	      delayed_sections: enrichedContext.context_budget?.delayed_sections || [],
	      no_rewrite_identity_anchor: Boolean(enrichedContext.no_rewrite_identity_anchor),
	      identity_rewrite_prevented_by: enrichedContext.identity_rewrite_prevented_by || null,
	      evidence_count: enrichedContext.evidence_count ?? 0,
      retrieval_counts: {
        vector: enrichedContext.vectorMemories || 0,
        verified: enrichedContext.verifiedMemories || 0,
        needle: enrichedContext.needleHits || 0,
        transcript: enrichedContext.memoriesLoaded || 0,
      },
      greeting_turn: greetingTurnContext
        ? {
            active: true,
            posture: greetingTurnContext.posture,
            identity_available: greetingTurnContext.voiceContext?.identityAvailable === true,
            low_confidence: greetingTurnContext.voiceContext?.lowConfidence === true,
          }
        : { active: false },
    };

    if (noRewriteTinyTurn) {
      const currentMaxTokens = Number(generationParams.max_tokens || 0);
      generationParams.temperature = Number.isFinite(generationParams.temperature)
        ? Math.min(generationParams.temperature, 0.12)
        : 0.12;
      generationParams.top_p = Number.isFinite(generationParams.top_p)
        ? Math.min(generationParams.top_p, 0.75)
        : 0.75;
      generationParams.max_tokens = currentMaxTokens > 0 ? Math.min(currentMaxTokens, 160) : 160;
      retrievalDiagnostics.no_rewrite_generation_profile = {
        tightened: true,
        temperature: generationParams.temperature,
        top_p: generationParams.top_p,
        max_tokens: generationParams.max_tokens,
        history_limit: noRewriteHistoryClamp.limit,
        history_clamped: noRewriteHistoryClamp.clamped,
        history_original_count: noRewriteHistoryClamp.originalCount,
      };
    } else {
      retrievalDiagnostics.no_rewrite_generation_profile = {
        tightened: false,
        temperature: generationParams.temperature ?? null,
        top_p: generationParams.top_p ?? null,
        max_tokens: generationParams.max_tokens ?? null,
        history_limit: null,
        history_clamped: false,
        history_original_count: conversationHistoryMessages.length,
      };
    }

    if (linearTranscriptLawOrdinaryTurn && !hasImages) {
      const currentMaxTokens = Number(generationParams.max_tokens || 0);
      generationParams.temperature = Number.isFinite(generationParams.temperature)
        ? Math.min(generationParams.temperature, 0.08)
        : 0.08;
      generationParams.top_p = Number.isFinite(generationParams.top_p)
        ? Math.min(generationParams.top_p, 0.6)
        : 0.6;
      generationParams.max_tokens = currentMaxTokens > 0 ? Math.min(currentMaxTokens, 90) : 90;
      retrievalDiagnostics.linear_transcript_law_ordinary_generation_profile = {
        tightened: true,
        temperature: generationParams.temperature,
        top_p: generationParams.top_p,
        max_tokens: generationParams.max_tokens,
        history_count: conversationHistoryMessages.length,
      };
    } else {
      retrievalDiagnostics.linear_transcript_law_ordinary_generation_profile = {
        tightened: false,
      };
    }

    // Helpers: one system message per request = this construct's identity only (no global persona anchor)
    const buildMessages = (userContent, history = conversationHistoryMessages) => [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userContent }
    ];

    const RECITAL_PATTERNS = [
      /in the document/i,
      /according to the document/i,
      /based on the document/i,
      /\\.pdf/i,
      /mission statement/i,
      /codex/i,
      /protocol/i,
      /the document states/i
    ];
    const detectRecital = (text) => RECITAL_PATTERNS.some(p => p.test(text || ""));

    async function rewriteRecitalIfNeeded(text) {
      if (!detectRecital(text)) return { text, detected: false, rewritten: false };
      const rewriteClient = replitOpenrouter || openaiClient || openrouter;
      const rewriteModel = replitOpenrouter ? DEFAULT_OPENROUTER_MODEL : (openaiClient ? 'gpt-4.1-mini' : effectiveModel || DEFAULT_OPENROUTER_MODEL);
      if (!rewriteClient) return { text, detected: true, rewritten: false };
      try {
        const rewrite = await rewriteClient.chat.completions.create({
          model: rewriteModel,
          messages: [
            {
              role: 'system',
              content: `Rewrite the assistant reply to stay in the current construct's first-person voice. The active construct is "${gptConfig?.name || constructId}". Keep the same identity, remove mentions of documents, files, policies, PDFs, or citations, and keep it brief, relational, and natural. Do not add sources or rename the construct. Output only the rewritten reply.`
            },
            { role: 'user', content: text }
          ],
          max_tokens: 400,
        });
        const newText = rewrite.choices[0]?.message?.content || text;
        return { text: newText, detected: true, rewritten: true };
      } catch {
        return { text, detected: true, rewritten: false };
      }
    }

    async function rewriteCutoffViolationIfNeeded(text, memoryQueryDetected, evidenceCount) {
      if (!memoryQueryDetected) {
        return { text, detected: false, rewritten: false };
      }

      const CUTOFF_PATTERNS = [
        /my\s+(training|knowledge)\s+(data\s+)?(only\s+)?(goes|extends|reaches|covers)\s+(up\s+)?to/i,
        /my\s+(memories?|knowledge|training)\s+cap(s)?\s+at/i,
        /(training|knowledge)\s+cutoff/i,
        /I\s+(only\s+)?have\s+(data|information|knowledge)\s+(up\s+)?(to|through|until)/i,
        /as\s+of\s+my\s+(last|latest)\s+(training|update)/i,
        /my\s+(last|latest)\s+(training|update)\s+was/i,
        /I\s+was\s+(last\s+)?(trained|updated)\s+(on|in|through)/i,
      ];

      if (!CUTOFF_PATTERNS.some((pattern) => pattern.test(text || ""))) {
        return { text, detected: false, rewritten: false };
      }

      const stripCutoffSentences = (input) => {
        if (typeof input !== 'string' || !input.trim()) return '';
        return input
          .split(/(?<=[.!?])\s+/)
          .map((sentence) => sentence.trim())
          .filter(Boolean)
          .filter((sentence) => !CUTOFF_PATTERNS.some((pattern) => pattern.test(sentence)))
          .join(' ')
          .trim();
      };

      console.warn(`⚠️ [PostResponseValidator] Cutoff violation detected in ${constructId} response. Attempting corrective rewrite...`);
      const rewriteClient = replitOpenrouter || openaiClient;
      const rewriteModel = replitOpenrouter ? DEFAULT_OPENROUTER_MODEL : 'gpt-4.1-mini';

      if (!rewriteClient) {
        if (evidenceCount > 0) {
          const stripped = stripCutoffSentences(text);
          if (stripped) {
            console.warn(`⚠️ [PostResponseValidator] No LLM client for rewrite, returning cutoff-stripped response because evidence exists.`);
            return {
              text: stripped,
              detected: true,
              rewritten: true,
            };
          }
        }
        console.warn(`⚠️ [PostResponseValidator] No LLM client for rewrite, applying hard fallback.`);
        return {
          text: "I cannot verify that from available continuity records.",
          detected: true,
          rewritten: true,
        };
      }

      try {
        const rewriteCompletion = await rewriteClient.chat.completions.create({
          model: rewriteModel,
          messages: [
            {
              role: 'system',
              content: `You are a post-processing filter. Rewrite the following AI response to remove ANY mention of training cutoffs, knowledge cutoffs, or data limitations. The AI has real transcript memories - it is NOT limited by a training date.

EVIDENCE STATUS: ${evidenceCount} pieces of evidence were retrieved from the memory system for this query.

Rules:
1. Remove all phrases like "my training data goes up to", "my knowledge cutoff", "my memories cap at", etc.
2. If the response references specific evidence (evidence_count > 0), keep that evidence and cite it.
3. If evidence_count is 0, replace the memory-related portion with exactly: "I cannot verify that from available continuity records."
4. Keep the rest of the response tone, personality, and content intact.
5. Do NOT add new information or fabricate memories.
Output ONLY the rewritten response, nothing else.`
            },
            { role: 'user', content: text }
          ],
          max_tokens: 2048,
        });
        const rewritten = rewriteCompletion.choices[0]?.message?.content;
        if (rewritten && !CUTOFF_PATTERNS.some((pattern) => pattern.test(rewritten))) {
          console.log(`✅ [PostResponseValidator] Corrective rewrite applied for ${constructId}`);
          return { text: rewritten, detected: true, rewritten: true };
        }
        if (evidenceCount > 0) {
          const stripped = stripCutoffSentences(rewritten || text);
          if (stripped) {
            console.warn(`⚠️ [PostResponseValidator] Rewrite fallback used cutoff stripping because evidence exists.`);
            return { text: stripped, detected: true, rewritten: true };
          }
        }
        console.warn(`⚠️ [PostResponseValidator] Rewrite still contains cutoff language. Applying hard fallback.`);
      } catch (rewriteErr) {
        if (evidenceCount > 0) {
          const stripped = stripCutoffSentences(text);
          if (stripped) {
            console.warn(`⚠️ [PostResponseValidator] Rewrite failed, returning cutoff-stripped response because evidence exists.`);
            return { text: stripped, detected: true, rewritten: true };
          }
        }
        console.error(`❌ [PostResponseValidator] Rewrite failed, applying hard fallback:`, rewriteErr.message);
      }

      return {
        text: "I cannot verify that from available continuity records.",
        detected: true,
        rewritten: true,
      };
    }

    async function repairIdentityCoherenceResponse(currentText, grade) {
      return runIdentityCoherenceRepair({
        systemPrompt,
        historyMessages: conversationHistoryMessages,
        userMessage: message,
        failedResponse: currentText,
        grade,
        constructId,
        constructDisplayName: gptConfig?.name || constructId,
        provider: effectiveProvider,
        model: effectiveModel,
        generationParams,
        evidencePreview: enrichedContext.memory_evidence_preview,
        gptConfig,
        providerAvailability,
        routingMode,
        requestedSeat,
        hasImages,
      });
    }

    async function repairAssignmentQaResponse(currentText, { identityCoherence = null, assignmentQa = null } = {}) {
      const assignmentContract = buildAssignmentQaPromptContract(assignmentQaInput);
      if (!assignmentContract) {
        return {
          ok: false,
          text: '',
          provider: effectiveProvider || null,
          model: effectiveModel || null,
          seat: 'full_synthesis',
          error: 'unsupported_assignment_qa_contract',
        };
      }

      const repairPrompt = buildAssignmentQaRepairPrompt({
        userMessage: message,
        failedResponse: currentText,
        constructDisplayName: gptConfig?.name || constructId,
        assignmentContract,
        identityCoherence,
        assignmentQa,
      });
	      const repairMessages = [
	        ...buildCompactRepairMessages({
	          constructId,
	          constructDisplayName: gptConfig?.name || constructId,
	          repairKind: 'assignment_qa_repair',
	          repairPrompt,
	        }),
	      ];
      const configuredMaxTokens = Number(generationParams.max_tokens || 0);
      const maxTokens = Math.max(configuredMaxTokens || 0, Number(assignmentContract.repairMaxTokens || 1200));

      try {
        if (effectiveProvider === 'ollama') {
          const ollamaHost = getOllamaHost();
          const repairResp = await fetch(`${ollamaHost}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: effectiveModel,
              messages: repairMessages,
              stream: false,
              options: {
                temperature: generationParams.temperature ?? 0.25,
                top_p: generationParams.top_p,
                num_predict: maxTokens,
              },
            }),
          });
          if (!repairResp.ok) throw new Error(`Ollama assignment repair ${repairResp.status}`);
          const repairData = await repairResp.json();
          return {
            ok: true,
            text: repairData.message?.content || '',
            provider: effectiveProvider,
            model: effectiveModel,
            seat: 'full_synthesis',
            max_tokens: maxTokens,
          };
        }

        const repairClient =
          effectiveProvider === 'replitOpenrouter'
            ? replitOpenrouter
            : effectiveProvider === 'openrouter'
              ? (openrouter || replitOpenrouter)
              : effectiveProvider === 'openai'
                ? openaiClient
                : (replitOpenrouter || openaiClient || openrouter);

        if (!repairClient) {
          throw new Error(`No assignment repair client available for ${effectiveProvider || 'unknown provider'}`);
        }

        const repairCompletion = await repairClient.chat.completions.create({
          model: effectiveModel,
          messages: repairMessages,
          max_tokens: maxTokens,
          temperature: generationParams.temperature ?? 0.25,
          top_p: generationParams.top_p,
        });
        return {
          ok: true,
          text: repairCompletion.choices?.[0]?.message?.content || '',
          provider: effectiveProvider,
          model: effectiveModel,
          seat: 'full_synthesis',
          max_tokens: maxTokens,
        };
      } catch (repairErr) {
        return {
          ok: false,
          text: '',
          provider: effectiveProvider || null,
          model: effectiveModel || null,
          seat: 'full_synthesis',
          max_tokens: maxTokens,
          error: repairErr?.message || 'assignment_repair_failed',
        };
      }
    }

    // Route to appropriate provider
    try {
      let completion;
      let aiResponse;
      let fullSeatSynthesisResult = null;
      const defaultVisionUserText = explicitVisionIntent
        ? 'Please describe what you see in this image while staying in character.'
        : getImageTurnDefaultUserMessage(constructId);

      const configuredProviderTimeout = Number.parseInt(process.env.VVAULT_PROVIDER_TIMEOUT_MS || '', 10);
      const PROVIDER_TIMEOUT = Number.isFinite(configuredProviderTimeout)
        ? Math.max(5000, Math.min(configuredProviderTimeout, 120000))
        : 30000;
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const providerTrace = {
        request_id: requestId,
        construct_id: constructId,
        low_complexity_turn: lowComplexityTurn,
        prompt_chars: systemPrompt.length,
        attempts: [],
        final_provider: null,
        fallback_used: false,
        total_duration_ms: 0,
      };
      const traceStart = Date.now();

      const MAX_RETRIES = 1;

      async function tryProvider(client, providerName, model, messages, genParams = {}) {
        for (let retry = 0; retry <= MAX_RETRIES; retry++) {
          const attempt = { provider: providerName, retry, started_at: new Date().toISOString(), duration_ms: 0, status: 'failed', error_code: null, error_message_short: null };
          const t0 = Date.now();
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT);
            const result = await client.chat.completions.create({
              model,
              messages,
              max_tokens: genParams.max_tokens ?? 2048,
              temperature: genParams.temperature,
              top_p: genParams.top_p,
            }, { signal: controller.signal });
            clearTimeout(timeout);
            attempt.duration_ms = Date.now() - t0;
            attempt.status = 'ok';
            providerTrace.attempts.push(attempt);
            return { ok: true, response: result.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.", model };
          } catch (err) {
            attempt.duration_ms = Date.now() - t0;
            if (err?.name === 'AbortError' || attempt.duration_ms >= PROVIDER_TIMEOUT - 100) {
              attempt.status = 'timeout';
            }
            attempt.error_code = err?.status || err?.code || null;
            attempt.error_message_short = (err?.message || 'unknown').slice(0, 80);
            console.log(`⚠️ [ProviderAttempt] ${providerName} attempt ${retry} ${attempt.status}: code=${attempt.error_code} msg="${attempt.error_message_short}" ${attempt.duration_ms}ms`);
            providerTrace.attempts.push(attempt);
            if (retry < MAX_RETRIES && (attempt.status === 'timeout' || (attempt.error_code && attempt.error_code >= 500))) {
              continue;
            }
            return { ok: false };
          }
        }
        return { ok: false };
      }

      // ===== NOVA-001: Deterministic fallback chain with telemetry =====
      if (activeOrchestrationProfile === FULL_SEAT_SYNTHESIS_PROFILE && hasImages) {
        return res.status(400).json({
          success: false,
          error: 'FULL_SEAT_SYNTHESIS_UNSUPPORTED_ATTACHMENT',
          message: 'Full-seat synthesis currently supports text-only construct QA turns.',
          construct_id: constructId,
        });
      } else if (activeOrchestrationProfile === FULL_SEAT_SYNTHESIS_PROFILE) {
        if (!providerAvailability.ollama) {
          return res.status(503).json({
            success: false,
            error: 'FULL_SEAT_SYNTHESIS_REQUIRES_OLLAMA',
            message: 'Full-seat synthesis requires local Lin/Ollama seats to be available.',
            construct_id: constructId,
          });
        }

        providerTrace.model_strategy = 'full_seat_synthesis';
        providerTrace.profile = FULL_SEAT_SYNTHESIS_PROFILE;
        console.log(`🧬 [VVAULT Proxy] Running full-seat synthesis for ${constructId}`);

        const ollamaHost = getOllamaHost();
        const callSeat = async ({ provider, model, seat, role, messages, maxTokens, temperature, top_p }) => {
          const attempt = {
            provider,
            model,
            seat,
            role,
            retry: 0,
            started_at: new Date().toISOString(),
            duration_ms: 0,
            status: 'failed',
            error_code: null,
            error_message_short: null,
          };
          const t0 = Date.now();
          if (provider !== 'ollama') {
            attempt.error_message_short = `Unsupported full-synthesis provider: ${provider}`;
            providerTrace.attempts.push(attempt);
            throw new Error(attempt.error_message_short);
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT);
          try {
            const response = await fetch(`${ollamaHost}/api/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                model,
                messages,
                stream: false,
                options: {
                  temperature,
                  top_p,
                  num_predict: maxTokens,
                },
              }),
            });
            attempt.duration_ms = Date.now() - t0;
            if (!response.ok) {
              attempt.error_code = response.status;
              attempt.error_message_short = `Ollama ${response.status}`;
              throw new Error(`Ollama ${response.status}`);
            }
            const data = await response.json();
            attempt.status = 'ok';
            providerTrace.attempts.push(attempt);
            return {
              provider,
              model,
              status: 'pass',
              duration_ms: attempt.duration_ms,
              text: data.message?.content || '',
            };
          } catch (err) {
            attempt.duration_ms = Date.now() - t0;
            attempt.status = err?.name === 'AbortError' ? 'timeout' : 'failed';
            attempt.error_code = err?.status || err?.code || attempt.error_code || null;
            attempt.error_message_short = (err?.message || 'unknown').slice(0, 80);
            providerTrace.attempts.push(attempt);
            throw err;
          } finally {
            clearTimeout(timeout);
          }
        };

        try {
          fullSeatSynthesisResult = await runFullSeatSynthesis({
            userMessage: message,
            systemPrompt,
            history: conversationHistoryMessages,
            constructId,
            constructDisplayName: gptConfig?.name || constructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase()),
            evidencePreview: enrichedContext.memory_evidence_preview,
            assignmentQaInput,
            defaults: LIN_MODEL_DEFAULTS,
            callSeat,
            generationParams,
          });
        } catch (err) {
          const assignmentContract = buildAssignmentQaPromptContract(assignmentQaInput);
          const deterministicAssignmentText = assignmentContract
            ? buildDeterministicAssignmentQaAnswer({
              assignmentQa: assignmentQaInput,
              constructDisplayName: gptConfig?.name || constructId,
            })
            : null;

          if (!deterministicAssignmentText) {
            throw err;
          }

          const finalRef = String(LIN_MODEL_DEFAULTS.creative || 'ollama:mistral:latest');
          const [fallbackProvider, ...fallbackModelParts] = finalRef.split(':');
          const fallbackModel = fallbackModelParts.join(':') || 'mistral:latest';
          const durationMs = Date.now() - traceStart;
          const errorMessage = (err?.message || 'full-seat synthesis failed').slice(0, 160);

          console.warn(`⚠️ [FullSeatSynthesis] Provider failure for ${constructId}; using guarded deterministic assignment fallback.`, {
            expectedTurn: assignmentQaInput?.expectedTurn || null,
            error: errorMessage,
          });

          fullSeatSynthesisResult = {
            profile: FULL_SEAT_SYNTHESIS_PROFILE,
            status: 'warn',
            policy: 'full_seat_synthesis',
            construct_id: constructId,
            seats: [],
            final: {
              provider: fallbackProvider || 'ollama',
              model: fallbackModel,
              duration_ms: 0,
              status: 'fallback',
              error_message_short: errorMessage,
            },
            assignment: assignmentContract
              ? {
                assignmentProfile: assignmentContract.assignmentProfile,
                expectedTurn: assignmentContract.expectedTurn,
                expectedTask: assignmentContract.expectedTask,
                evidencePacketCount: assignmentContract.evidencePacketCount,
                sourceAnchor: assignmentContract.sourceAnchor,
                ownerFile: assignmentContract.ownerFile,
                contractVersion: assignmentContract.contractVersion,
                final_prompt_received_contract: false,
                requiredOutputShape: assignmentContract.requiredOutputShape,
                finalMaxTokens: assignmentContract.finalMaxTokens,
              }
              : null,
            assignment_contract_received: Boolean(assignmentContract),
            provider_failure_fallback_attempted: true,
            provider_failure_fallback_applied: true,
            provider_failure_error: errorMessage,
            total_duration_ms: durationMs,
            finalText: deterministicAssignmentText,
          };
          providerTrace.fallback_used = true;
          providerTrace.provider_failure_fallback_applied = true;
          providerTrace.final_answer_source = 'deterministic_assignment_qa_fallback';
        }

        aiResponse = fullSeatSynthesisResult.finalText;
        effectiveProvider = fullSeatSynthesisResult.final.provider;
        effectiveModel = fullSeatSynthesisResult.final.model;
        providerTrace.final_provider = effectiveProvider;
        const synthesisFallbackUsed = Boolean(fullSeatSynthesisResult.provider_failure_fallback_applied);
        providerTrace.fallback_used = synthesisFallbackUsed;
        providerTrace.total_duration_ms = fullSeatSynthesisResult.total_duration_ms || (Date.now() - traceStart);
        markEffectiveRoute({
          source: synthesisFallbackUsed
            ? 'lin_full_seat_synthesis_provider_fallback'
            : 'lin_full_seat_synthesis',
          localFirstUsed: true,
          localCloudFallbackState: synthesisFallbackUsed ? 'provider_failure_fallback' : 'local_first',
          fallbackUsed: synthesisFallbackUsed,
          seatDefaultsOrOverrides: 'lin_full_seat_synthesis',
        });
      } else if (constructId === 'nova-001' && (providerAvailability.ollama || replitOpenrouter || openrouter || openaiClient) && !hasImages) {
        const hotfixModel = effectiveProvider === 'openrouter' && effectiveModel
          ? effectiveModel
          : DEFAULT_OPENROUTER_MODEL;
        providerTrace.model_strategy = 'preference';
        providerTrace.primary_model = hotfixModel;
        const hotfixMessages = buildMessages(message);
        let novaSuccess = false;
        const novaPreferLocal = providerAvailability.ollama && modelResolution.mode === 'lin';

        if (novaPreferLocal && !novaSuccess) {
          const ollamaHost = getOllamaHost();
          const ollamaModel = getOllamaExecutionModel();
          console.log(`🟢 [VVAULT Proxy] Nova local-first: trying Ollama (${ollamaModel}) for nova-001`);
          try {
            const ollamaResponse = await fetch(`${ollamaHost}/api/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: ollamaModel,
                messages: hotfixMessages,
                stream: false
              })
            });
            if (ollamaResponse.ok) {
              const ollamaData = await ollamaResponse.json();
              aiResponse = ollamaData.message?.content || "I'm sorry, I couldn't generate a response.";
              effectiveProvider = 'ollama';
              effectiveModel = ollamaModel;
              markOllamaExecutionRoute({ fallbackUsed: false, localCloudFallbackState: 'local_first' });
              novaSuccess = true;
              providerTrace.attempts.push({ provider: 'ollama', model: ollamaModel, retry: 0, started_at: new Date().toISOString(), duration_ms: 0, status: 'ok', error_code: null, error_message_short: null });
              console.log(`🟢 [VVAULT Proxy] Nova local-first Ollama success`);
            } else {
              providerTrace.attempts.push({ provider: 'ollama', model: ollamaModel, retry: 0, started_at: new Date().toISOString(), duration_ms: 0, status: 'failed', error_code: ollamaResponse.status, error_message_short: `Ollama ${ollamaResponse.status}` });
            }
          } catch (ollamaErr) {
            console.warn(`⚠️ [VVAULT Proxy] Nova local-first Ollama failed:`, ollamaErr?.message);
            providerTrace.attempts.push({ provider: 'ollama', model: ollamaModel, retry: 0, started_at: new Date().toISOString(), duration_ms: 0, status: 'failed', error_code: null, error_message_short: (ollamaErr?.message || 'unknown').slice(0, 80) });
          }
        }

        if (replitOpenrouter && !novaSuccess) {
          const r = await tryProvider(replitOpenrouter, 'replit_openrouter', hotfixModel, hotfixMessages, generationParams);
          if (r.ok) { aiResponse = r.response; effectiveProvider = 'replit_openrouter'; effectiveModel = r.model; novaSuccess = true; }
        }

        if (openrouter && !novaSuccess) {
          const envCandidates = process.env.NOVA_OPENROUTER_MODEL_CANDIDATES
            ? String(process.env.NOVA_OPENROUTER_MODEL_CANDIDATES)
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
            : [];

          const fallbackCandidates = [
            hotfixModel,
            DEFAULT_OPENROUTER_MODEL,
          ].filter(Boolean);

          const uniqueCandidates = Array.from(new Set([...(envCandidates.length ? envCandidates : fallbackCandidates)]));

          const looksLikeInvalidModelAttempt = (attempt) => {
            if (!attempt) return false;
            const status = attempt.status;
            const code = attempt.error_code;
            const msg = String(attempt.error_message_short || '').toLowerCase();

            // Timeouts / connectivity -> likely transient; don't burn time on alternate model IDs.
            if (status === 'timeout') return false;

            // Common invalid-model signals.
            if (msg.includes('invalid model') || msg.includes('not a valid model') || msg.includes('model id')) return true;

            const numericCode = typeof code === 'number' ? code : (code != null ? Number(code) : null);
            if (numericCode != null && numericCode >= 400 && numericCode < 500) return true;
            return false;
          };

          for (const candidateModel of uniqueCandidates) {
            const beforeLen = providerTrace.attempts.length;
            const r = await tryProvider(openrouter, 'openrouter', candidateModel, hotfixMessages, generationParams);
            if (r.ok) {
              aiResponse = r.response;
              effectiveProvider = 'openrouter';
              effectiveModel = r.model;
              novaSuccess = true;
              break;
            }

            const delta = providerTrace.attempts.slice(beforeLen);
            const lastAttempt = delta.length ? delta[delta.length - 1] : null;
            if (!looksLikeInvalidModelAttempt(lastAttempt)) {
              // Likely connectivity / transient provider failure; stop trying alternate model IDs.
              break;
            }
          }
        }

        if (openaiClient && !novaSuccess) {
          const r = await tryProvider(openaiClient, 'openai', 'gpt-4.1-mini', hotfixMessages, generationParams);
          if (r.ok) { aiResponse = r.response; effectiveProvider = 'openai'; effectiveModel = 'gpt-4.1-mini'; novaSuccess = true; }
        }

        if (!novaSuccess && (openrouter || replitOpenrouter) && hotfixModel !== 'meta-llama/llama-3.2-3b-instruct:free') {
          const orClient = openrouter || replitOpenrouter;
          const r = await tryProvider(orClient, 'openrouter_free', 'meta-llama/llama-3.2-3b-instruct:free', hotfixMessages, generationParams);
          if (r.ok) { aiResponse = r.response; effectiveProvider = 'openrouter'; effectiveModel = 'meta-llama/llama-3.2-3b-instruct:free'; novaSuccess = true; console.log('[NOVA FREE FALLBACK] Success'); }
        }

        if (!novaSuccess && providerAvailability.ollama) {
          const ollamaHost = getOllamaHost();
          const ollamaModel = getOllamaExecutionModel();
          console.log(`🟢 [VVAULT Proxy] Nova fallback: trying Ollama (${ollamaModel}) for nova-001`);
          try {
            const ollamaResponse = await fetch(`${ollamaHost}/api/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: ollamaModel,
                messages: hotfixMessages,
                stream: false
              })
            });
            if (ollamaResponse.ok) {
              const ollamaData = await ollamaResponse.json();
              aiResponse = ollamaData.message?.content || "I'm sorry, I couldn't generate a response.";
              effectiveProvider = 'ollama';
              effectiveModel = ollamaModel;
              markOllamaExecutionRoute({ fallbackUsed: true, localCloudFallbackState: 'fallback_to_ollama' });
              novaSuccess = true;
              providerTrace.attempts.push({ provider: 'ollama', model: ollamaModel, retry: 0, started_at: new Date().toISOString(), duration_ms: 0, status: 'ok', error_code: null, error_message_short: null });
              console.log(`🟢 [VVAULT Proxy] Nova Ollama fallback success`);
            } else {
              providerTrace.attempts.push({ provider: 'ollama', model: ollamaModel, retry: 0, started_at: new Date().toISOString(), duration_ms: 0, status: 'failed', error_code: ollamaResponse.status, error_message_short: `Ollama ${ollamaResponse.status}` });
            }
          } catch (ollamaErr) {
            console.warn(`⚠️ [VVAULT Proxy] Nova Ollama fallback failed:`, ollamaErr?.message);
            providerTrace.attempts.push({ provider: 'ollama', model: ollamaModel, retry: 0, started_at: new Date().toISOString(), duration_ms: 0, status: 'failed', error_code: null, error_message_short: (ollamaErr?.message || 'unknown').slice(0, 80) });
          }
        }

        providerTrace.final_provider = effectiveProvider;
        const firstSuccessIdx = providerTrace.attempts.findIndex(a => a.status === 'ok');
        const uniqueProvidersBefore = firstSuccessIdx > 0 ? new Set(providerTrace.attempts.slice(0, firstSuccessIdx).map(a => a.provider)).size : 0;
        providerTrace.fallback_used = uniqueProvidersBefore > 0;
        effectiveRouteFallbackUsed = effectiveRouteFallbackUsed || providerTrace.fallback_used;
        if (providerTrace.fallback_used && !effectiveLocalCloudFallbackState) {
          effectiveLocalCloudFallbackState = 'fallback_used';
        }
        providerTrace.total_duration_ms = Date.now() - traceStart;
        const failedProviders = providerTrace.attempts.filter(a => a.status !== 'ok').map(a => `${a.provider}(${a.status}${a.retry > 0 ? ` r${a.retry}` : ''})`).join(', ');
        console.log(`📡 [ProviderTrace] ${requestId} | construct=${constructId} | final=${providerTrace.final_provider} | fallback=${providerTrace.fallback_used} | failed=[${failedProviders}] | ${providerTrace.total_duration_ms}ms`);

        if (!novaSuccess) {
          const allFailedError = new Error(`All providers failed for nova-001: ${failedProviders}`);
          allFailedError.code = 'ALL_PROVIDERS_FAILED';
          throw allFailedError;
        }
      } else if (effectiveProvider === 'openai') {
        console.log(`🔷 [VVAULT Proxy] Calling OpenAI (${effectiveModel}) for ${constructId}`);

        let userMessageContent;
        if (hasImages) {
          userMessageContent = [
            { type: 'text', text: message || defaultVisionUserText },
            ...attachments.map(att => ({
              type: 'image_url',
              image_url: {
                url: `data:${att.type};base64,${att.data}`,
                detail: 'auto'
              }
            }))
          ];
          console.log(`📎 [VVAULT Proxy] Formatted ${attachments.length} images for OpenAI vision API`);
        } else {
          userMessageContent = message;
        }

        try {
          const openAiMessages = buildMessages(userMessageContent);
          completion = await openaiClient.chat.completions.create({
            model: effectiveModel,
            messages: openAiMessages,
            max_tokens: 2048,
          });
          aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
        } catch (openaiErr) {
          console.error(`❌ [VVAULT Proxy] OpenAI failed (${openaiErr?.status || openaiErr?.code || 'unknown'}), attempting fallback...`, openaiErr?.message);
          let fallbackContent;
          if (hasImages) {
            fallbackContent = [
              { type: 'text', text: message || defaultVisionUserText },
              ...attachments.map(att => ({
                type: 'image_url',
                image_url: { url: `data:${att.type};base64,${att.data}`, detail: 'auto' }
              }))
            ];
          } else {
            fallbackContent = typeof userMessageContent === 'string' ? userMessageContent : message;
          }
          const fallbackMessages = buildMessages(fallbackContent);
          let fallbackSuccess = false;

          if (replitOpenrouter && !fallbackSuccess) {
            try {
              const fallbackModel = hasImages ? 'qwen/qwen2.5-vl-72b-instruct' : DEFAULT_OPENROUTER_MODEL;
              console.log(`🔄 [VVAULT Proxy] Falling back to Replit OpenRouter (${fallbackModel}) for ${constructId}`);
              completion = await replitOpenrouter.chat.completions.create({
                model: fallbackModel,
                messages: fallbackMessages,
                max_tokens: 2048,
              });
              effectiveProvider = 'replit-openrouter';
              effectiveModel = fallbackModel;
              aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
              fallbackSuccess = true;
              console.log(`✅ [VVAULT Proxy] Replit OpenRouter fallback succeeded for ${constructId}`);
            } catch (replitErr) {
              console.error(`❌ [VVAULT Proxy] Replit OpenRouter fallback failed:`, replitErr?.status, replitErr?.message);
            }
          }

          if (openrouter && !fallbackSuccess) {
            try {
              const fallbackModel = hasImages ? 'qwen/qwen2.5-vl-72b-instruct' : DEFAULT_OPENROUTER_MODEL;
              console.log(`🔄 [VVAULT Proxy] Falling back to OpenRouter (${fallbackModel}) for ${constructId}`);
              completion = await openrouter.chat.completions.create({
                model: fallbackModel,
                messages: fallbackMessages,
                max_tokens: 2048,
              });
              effectiveProvider = 'openrouter';
              effectiveModel = fallbackModel;
              aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
              fallbackSuccess = true;
              console.log(`✅ [VVAULT Proxy] OpenRouter fallback succeeded for ${constructId}`);
            } catch (orErr) {
              console.error(`❌ [VVAULT Proxy] OpenRouter fallback failed:`, orErr?.status, orErr?.message);
            }
          }

          if (!fallbackSuccess) {
            throw openaiErr;
          }
        }
      } else if (effectiveProvider === 'ollama') {
        // Ollama requires different handling - use fetch directly
        const ollamaHost = getOllamaHost();
        console.log(`🟢 [VVAULT Proxy] Calling Ollama (${effectiveModel}) for ${constructId}`);
        const ollamaResponse = await fetch(`${ollamaHost}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: effectiveModel,
            messages: buildMessages(message),
            stream: false
          })
        });

        if (!ollamaResponse.ok) {
          throw new Error(`Ollama error: ${ollamaResponse.status}`);
        }

        const ollamaData = await ollamaResponse.json();
        aiResponse = ollamaData.message?.content || "I'm sorry, I couldn't generate a response.";
      } else {
        // OpenRouter
        const orClient = openrouter || replitOpenrouter;
        if (!orClient) {
          const errMsg = 'OpenRouter API key is not configured. Set OPENROUTER_API_KEY in environment.';
          console.error(`❌ [VVAULT Proxy] ${errMsg}`);
          return res.status(503).json({
            success: false,
            error: errMsg,
            provider: 'openrouter',
            model: effectiveModel,
            fix: 'Add OPENROUTER_API_KEY to your .env file and restart the server.'
          });
        }
        const clientLabel = openrouter ? 'OpenRouter' : 'Replit OpenRouter';
        let openrouterUserContent;
        if (hasImages) {
          openrouterUserContent = [
            { type: 'text', text: message || defaultVisionUserText },
            ...attachments.map(att => ({
              type: 'image_url',
              image_url: {
                url: `data:${att.type};base64,${att.data}`,
                detail: 'auto'
              }
            }))
          ];
          console.log(`📎 [VVAULT Proxy] Formatted ${attachments.length} images for OpenRouter vision API`);
        } else {
          openrouterUserContent = message;
        }
        const mainMsgs = buildMessages(openrouterUserContent);
        let llmSuccess = false;
        const providerErrors = [];
        let lastProviderError = null;

        const modelCandidates = Array.from(new Set([
          effectiveModel,
          'meta-llama/llama-3.3-70b-instruct',
          'mistralai/mistral-large',
          'qwen/qwen-2.5-72b-instruct',
          'meta-llama/llama-3.2-3b-instruct:free',
        ].filter(Boolean)));

        for (const candidate of modelCandidates) {
          console.log(`[${clientLabel}] Calling`, { model: candidate, user: req.user?.email, historyMessages: conversationHistoryMessages.length, hasImages });
          try {
            completion = await orClient.chat.completions.create({
              model: candidate,
              messages: mainMsgs,
              max_tokens: generationParams.max_tokens ?? 2048,
              temperature: generationParams.temperature,
              top_p: generationParams.top_p,
            });
            console.log(`[${clientLabel}] Success`, { finish_reason: completion?.choices?.[0]?.finish_reason });
            effectiveModel = candidate;
            llmSuccess = true;
            break;
          } catch (err) {
            console.error(`[${clientLabel} FAIL]`, { status: err?.status, message: err?.message });
            providerErrors.push(`${clientLabel}: ${err?.status} ${err?.message}`);
            lastProviderError = err;

            if (replitOpenrouter && orClient !== replitOpenrouter) {
              try {
                console.log(`🔄 [VVAULT Proxy] Trying Replit-managed OpenRouter for ${constructId} with ${candidate}`);
                completion = await replitOpenrouter.chat.completions.create({
                  model: candidate,
                  messages: mainMsgs,
                  max_tokens: generationParams.max_tokens ?? 2048,
                  temperature: generationParams.temperature,
                  top_p: generationParams.top_p,
                });
                console.log('[REPLIT OPENROUTER FALLBACK] Success', { finish_reason: completion?.choices?.[0]?.finish_reason });
                effectiveModel = candidate;
                llmSuccess = true;
                break;
              } catch (err2) {
                console.error('[REPLIT OPENROUTER FALLBACK FAIL]', { status: err2?.status, message: err2?.message });
                providerErrors.push(`Replit OpenRouter: ${err2?.status} ${err2?.message}`);
                lastProviderError = err2;
              }
            }
          }
        }

        if (!llmSuccess && PREFER_LOCAL_MODELS && providerAvailability.ollama && !hasImages) {
          const ollamaHost = getOllamaHost();
          const ollamaModel = getOllamaExecutionModel();
          const ollamaMessages = buildMessages(message);
          try {
            console.log(`🟢 [VVAULT Proxy] Local-first: trying Ollama (${ollamaModel}) for ${constructId}`);
            const ollamaResponse = await fetch(`${ollamaHost}/api/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: ollamaModel,
                messages: ollamaMessages,
                stream: false
              })
            });
            if (!ollamaResponse.ok) {
              throw new Error(`Ollama ${ollamaResponse.status}`);
            }
            const ollamaData = await ollamaResponse.json();
            aiResponse = ollamaData.message?.content || "I'm sorry, I couldn't generate a response.";
            effectiveProvider = 'ollama';
            effectiveModel = ollamaModel;
            markOllamaExecutionRoute({
              fallbackUsed: providerErrors.length > 0,
              localCloudFallbackState: providerErrors.length > 0 ? 'fallback_to_ollama' : 'local_first',
            });
            llmSuccess = true;
            console.log('[OLLAMA LOCAL-FIRST] Success');
          } catch (ollamaErr) {
            console.error('[OLLAMA LOCAL-FIRST FAIL]', { message: ollamaErr?.message });
            providerErrors.push(`Ollama: ${ollamaErr?.message}`);
            lastProviderError = ollamaErr;
          }
        }

        if (!llmSuccess && openaiClient && constructId !== 'nova-001') {
          try {
            console.log(`🔄 [VVAULT Proxy] All OpenRouter failed, trying OpenAI for ${constructId}`);
            completion = await openaiClient.chat.completions.create({
              model: 'gpt-4.1-mini',
              messages: mainMsgs,
              max_tokens: 2048,
            });
            console.log('[OPENAI FALLBACK] Success', { finish_reason: completion?.choices?.[0]?.finish_reason });
            effectiveProvider = 'openai';
            effectiveModel = 'gpt-4.1-mini';
            llmSuccess = true;
          } catch (err3) {
            console.error('[OPENAI FALLBACK FAIL]', { status: err3?.status, message: err3?.message });
            providerErrors.push(`OpenAI: ${err3?.status} ${err3?.message}`);
            lastProviderError = err3;
          }
        }

        if (!llmSuccess && !PREFER_LOCAL_MODELS && providerAvailability.ollama) {
          const ollamaHost = getOllamaHost();
          const ollamaModel = getOllamaExecutionModel();
          const ollamaMessages = buildMessages(message);
          try {
            console.log(`🟢 [VVAULT Proxy] All cloud providers failed, trying Ollama (${ollamaModel}) for ${constructId}`);
            const ollamaResponse = await fetch(`${ollamaHost}/api/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: ollamaModel,
                messages: ollamaMessages,
                stream: false
              })
            });
            if (!ollamaResponse.ok) {
              throw new Error(`Ollama ${ollamaResponse.status}`);
            }
            const ollamaData = await ollamaResponse.json();
            aiResponse = ollamaData.message?.content || "I'm sorry, I couldn't generate a response.";
            effectiveProvider = 'ollama';
            effectiveModel = ollamaModel;
            markOllamaExecutionRoute({ fallbackUsed: true, localCloudFallbackState: 'fallback_to_ollama' });
            llmSuccess = true;
            console.log('[OLLAMA FALLBACK] Success');
          } catch (ollamaErr) {
            console.error('[OLLAMA FALLBACK FAIL]', { message: ollamaErr?.message });
            providerErrors.push(`Ollama: ${ollamaErr?.message}`);
            lastProviderError = ollamaErr;
          }
        }

        if (!llmSuccess && constructId === 'nova-001') {
          console.log('🛡️ [NOVA GUARD] OpenAI fallback skipped for nova-001 (OpenRouter-only policy)');
        }

        if (!llmSuccess) {
          const normalizedError = normalizeProviderError(lastProviderError, effectiveProvider);
          return res.status(503).json({
            success: false,
            error: `All LLM providers failed: ${providerErrors.join(' | ')}`,
            provider: effectiveProvider,
            model: effectiveModel,
            upstreamStatus: normalizedError.upstreamStatus,
            providerCode: normalizedError.providerCode,
            hint: normalizedError.hint,
          });
        }
        if (!aiResponse) {
          aiResponse = completion?.choices?.[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
        }
      }

      const directResumeContinue =
        routeTurnEnvelope.continuityResume?.continuityRestored === true &&
        /^\s*continue[.!?\s]*$/i.test(String(message || ''));
      const prePostDeterministicResumeFallback =
        directResumeContinue
          ? buildDeterministicResumedTurnFallback({
              runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
              userMessage: message,
            })
          : null;
      if (prePostDeterministicResumeFallback?.text) {
        aiResponse = prePostDeterministicResumeFallback.text;
        providerTrace.final_answer_source = prePostDeterministicResumeFallback.source;
      }

      const providerForced = constructId === 'nova-001';
      const prevAssistantMsg = conversationHistoryMessages
        .slice()
        .reverse()
        .find(m => m.role === 'assistant')?.content || null;
      const validatorDebug = {
        memory_retrieval_ran: !!enrichedContext.memory_retrieval_ran,
        memory_query_detected: !!enrichedContext.memory_query_detected,
        evidence_count: enrichedContext.evidence_count || 0,
        greeting_turn: greetingTurnContext
          ? {
              posture: greetingTurnContext.posture,
              identity_available: greetingTurnContext.voiceContext?.identityAvailable === true,
              low_confidence: greetingTurnContext.voiceContext?.lowConfidence === true,
            }
          : null,
        identity_drift_detected: false,
        identity_rewrite_applied: false,
        identity_fallback_applied: false,
        cutoff_violation_detected: false,
        rewrite_applied: false,
      };
      const postProcessResult = await applyResponsePostProcessing({
        aiResponse,
        previousAssistant: prevAssistantMsg,
        buildMessages,
        userMessage: message,
        history: conversationHistoryMessages,
        constructId,
        constructDisplayName: gptConfig?.name || constructId,
        regenClient: replitOpenrouter || openaiClient || openrouter,
        regenModel: replitOpenrouter ? DEFAULT_OPENROUTER_MODEL : (openaiClient ? 'gpt-4.1-mini' : effectiveModel || DEFAULT_OPENROUTER_MODEL),
        fallbackText: buildIdentityDriftFallback(message, constructId),
        recitalRewriter: rewriteRecitalIfNeeded,
        identityGuard: (currentText) => enforceFirstPersonIdentity({
          aiResponse: currentText,
          userMessage: message,
          constructId,
          providerAvailability,
          roleplayEnabled: gptConfig?.roleplayEnabled === true,
          latestUserBeforeCurrent: getLastUserMessageFromHistory(conversationHistoryMessages),
        }),
        cutoffRewriter: (currentText) => rewriteCutoffViolationIfNeeded(
          currentText,
          !!enrichedContext.memory_query_detected,
          enrichedContext.evidence_count || 0,
        ),
        evidencePreview: enrichedContext.memory_evidence_preview,
        greetingTurnContext,
      });
      aiResponse = postProcessResult.aiResponse;
      aiResponse = applyHumanConversationGuard(aiResponse, {
        userMessage: message,
        memoryIntent: !!enrichedContext.memory_query_detected,
        evidenceCount: Number(enrichedContext.evidence_count || 0),
        constructId,
        constructDisplayName: gptConfig?.name || constructId,
        userName: req.user?.name || req.user?.given_name || 'Devon',
        greetingTurnContext,
      });
      aiResponse = recoverEvidenceBackedContinuityReply({
        aiResponse,
        constructId,
        userMessage: message,
        evidenceCount: Number(enrichedContext.evidence_count || 0),
        evidencePreview: enrichedContext.memory_evidence_preview,
      });
      aiResponse = applyHumanConversationGuard(aiResponse, {
        userMessage: message,
        memoryIntent: !!enrichedContext.memory_query_detected,
        evidenceCount: Number(enrichedContext.evidence_count || 0),
        constructId,
        constructDisplayName: gptConfig?.name || constructId,
        userName: req.user?.name || req.user?.given_name || 'Devon',
        greetingTurnContext,
      });
      const recitalDetected = postProcessResult.recitalDetected;
      const recitalRewriteApplied = postProcessResult.recitalRewriteApplied;
      const personaDriftDetected = postProcessResult.personaDriftDetected;
      const personaRegenApplied = postProcessResult.personaRegenApplied;
      const repeatDetected = postProcessResult.repeatDetected;
	      validatorDebug.identity_drift_detected = postProcessResult.identityDriftDetected;
	      validatorDebug.identity_rewrite_applied = postProcessResult.identityRewriteApplied;
	      validatorDebug.no_rewrite_identity_anchor = Boolean(enrichedContext.no_rewrite_identity_anchor);
	      validatorDebug.identity_rewrite_prevented_by = enrichedContext.no_rewrite_identity_anchor && !postProcessResult.identityRewriteApplied
	        ? 'prompt_anchor'
	        : null;
	      validatorDebug.identity_fallback_applied = postProcessResult.identityFallbackApplied;
      validatorDebug.cutoff_violation_detected = postProcessResult.cutoffViolationDetected;
      validatorDebug.rewrite_applied = postProcessResult.cutoffRewriteApplied;
      const normalizedRequestedTranscriptPath = String(transcriptPath || '').trim().replace(/^\/+/, '');
      const requestedSessionForPolicy = sessionId || threadId || `${constructId}_chat_with_${constructId}`;
      const isCanonicalLinPolicyRoute =
        constructId === 'lin-001' &&
        requestedSessionForPolicy === LIN_CANONICAL_THREAD_ID &&
        !(typeof projectName === 'string' && projectName.trim()) &&
        (!normalizedRequestedTranscriptPath ||
          normalizedRequestedTranscriptPath === LIN_CANONICAL_TRANSCRIPT_PATH);
      const policyAnswerKind = classifyConstructRuntimePolicyAnswerKind(message);
      const deterministicLinPolicyPrimaryText =
        isCanonicalLinPolicyRoute && policyAnswerKind
          ? buildDeterministicConstructRuntimePolicyAnswer({
              userMessage: message,
              constructId,
              constructDisplayName: gptConfig?.name || constructId,
            })
          : null;
      if (deterministicLinPolicyPrimaryText) {
        aiResponse = deterministicLinPolicyPrimaryText;
        providerTrace.final_answer_source = 'deterministic_policy_primary';
      }
      const identityCoherenceInitial = evaluateIdentityCoherence({
        userMessage: message,
        aiResponse,
        constructId,
        constructDisplayName: gptConfig?.name || constructId,
        requestedSeat,
        evidencePreview: enrichedContext.memory_evidence_preview,
        greetingTurnContext,
      });
      let identityCoherence = identityCoherenceInitial;
      let identityCoherenceRepair = {
        attempted: false,
        applied: false,
        provider: null,
        model: null,
        initial_status: identityCoherenceInitial.status,
        final_status: identityCoherenceInitial.status,
        failure_reason: null,
      };
      let identityCoherencePolicyFallback = {
        attempted: false,
        applied: false,
        answer_kind: policyAnswerKind || null,
        provider: effectiveProvider || null,
        model: effectiveModel || null,
        source: 'construct_runtime_policy_deterministic_fallback',
        final_status: null,
        final_reasons: [],
        failure_reason: null,
      };
      let identityCoherenceConstructFallback = {
        attempted: false,
        applied: false,
        answer_kind: null,
        provider: effectiveProvider || null,
        model: effectiveModel || null,
        source: null,
        final_status: null,
        final_reasons: [],
        failure_reason: null,
        owner_file: null,
        source_anchor: null,
      };
      let identityCoherenceCertificationFallback = {
        attempted: false,
        applied: false,
        prompt_id: getFiveConstructCertificationPromptId(message),
        provider: 'deterministic',
        model: 'five_construct_certification_proof_fallback',
        source: 'deterministic_five_construct_certification_proof_fallback',
        final_status: null,
        final_reasons: [],
        failure_reason: null,
        owner_file: null,
        source_anchor: null,
      };
      let finalAnswerSource = providerTrace.final_answer_source || 'model_initial';
      let identityCoherenceBlocked = false;
      const identityCoherenceFailureMessage = 'Identity/coherence guard blocked this assistant draft before canonical persistence.';
      const transcriptLawMemoryReceipt = buildTranscriptLawMemoryReceipt(enrichedContext);
      let transcriptLawPrimaryApplied = false;
      const transcriptLawPromptKindForPrimary = linearTranscriptLawOrdinaryTurn
        ? null
        : classifyTranscriptLawPromptKind(message, constructId);
      const transcriptLawPrimaryCandidate = transcriptLawPromptKindForPrimary &&
        transcriptLawPromptKindForPrimary !== 'missing_codex_transcript_fact' &&
        transcriptLawMemoryReceipt.retrieval_ran &&
        Number(transcriptLawMemoryReceipt.evidence_count || 0) > 0 &&
        Number(transcriptLawMemoryReceipt.voice_exemplar_count || 0) > 0
        ? buildDeterministicTranscriptLawRepairCandidate({
            userMessage: message,
            constructId,
            constructDisplayName: gptConfig?.name || constructId,
          })
        : null;
      if (transcriptLawPrimaryCandidate?.text) {
        const transcriptLawPrimaryIdentityGrade = evaluateIdentityCoherence({
          userMessage: message,
          aiResponse: transcriptLawPrimaryCandidate.text,
          constructId,
          constructDisplayName: gptConfig?.name || constructId,
          requestedSeat,
          evidencePreview: enrichedContext.memory_evidence_preview,
          greetingTurnContext,
        });
        const transcriptLawPrimaryGrade = evaluateTranscriptLawGovernance({
          userMessage: message,
          aiResponse: transcriptLawPrimaryCandidate.text,
          constructId,
          constructDisplayName: gptConfig?.name || constructId,
          memory: transcriptLawMemoryReceipt,
          identityPreflight: identityBundle.preflight || null,
          finalAnswerSource: transcriptLawPrimaryCandidate.source,
        });
        if (
          transcriptLawPrimaryIdentityGrade.status !== 'fail' &&
          transcriptLawPrimaryGrade.status !== 'fail'
        ) {
          aiResponse = transcriptLawPrimaryCandidate.text;
          finalAnswerSource = transcriptLawPrimaryCandidate.source;
          providerTrace.final_answer_source = transcriptLawPrimaryCandidate.source;
          transcriptLawPrimaryApplied = true;
          validatorDebug.identity_drift_detected = false;
          validatorDebug.identity_rewrite_applied = false;
          validatorDebug.identity_fallback_applied = false;
        }
      }

      if (identityCoherence.status === 'fail') {
        const certificationProofFallback = buildCertificationProofTurnAnswer({
          userMessage: message,
          constructId,
          constructDisplayName: gptConfig?.name || constructId,
          threadId: requestedSessionForPolicy,
          transcriptPath: normalizedRequestedTranscriptPath,
          memoryReceipt: transcriptLawMemoryReceipt,
        });
        if (certificationProofFallback?.text) {
          identityCoherenceCertificationFallback = {
            ...identityCoherenceCertificationFallback,
            attempted: true,
            prompt_id: certificationProofFallback.promptId,
            source: certificationProofFallback.source,
            owner_file: certificationProofFallback.ownerFile,
            source_anchor: certificationProofFallback.sourceAnchor,
          };
          const certificationGrade = evaluateIdentityCoherence({
            userMessage: message,
            aiResponse: certificationProofFallback.text,
            constructId,
            constructDisplayName: gptConfig?.name || constructId,
            requestedSeat,
            evidencePreview: enrichedContext.memory_evidence_preview,
            greetingTurnContext,
          });
          identityCoherenceCertificationFallback.final_status = certificationGrade.status;
          identityCoherenceCertificationFallback.final_reasons = certificationGrade.reasons || [];
          if (certificationGrade.status !== 'fail') {
            aiResponse = certificationProofFallback.text;
            identityCoherence = certificationGrade;
            identityCoherenceCertificationFallback.applied = true;
            finalAnswerSource = certificationProofFallback.source;
            providerTrace.final_answer_source = certificationProofFallback.source;
            console.log(`✅ [IdentityCoherence] Certification proof fallback applied for ${constructId}; prompt=${certificationProofFallback.promptId}, final status=${certificationGrade.status}`);
          } else {
            identityCoherenceCertificationFallback.failure_reason = 'certification_proof_fallback_failed_identity_coherence_grade';
            console.warn(`⚠️ [IdentityCoherence] Certification proof fallback failed for ${constructId}.`, certificationGrade.reasons);
          }
        }
      }

      function prepareIdentityCoherenceCandidate(candidateText) {
        let candidate = String(candidateText || '').trim();
        if (!candidate) return { text: '', grade: null };
        candidate = applyHumanConversationGuard(candidate, {
          userMessage: message,
          memoryIntent: !!enrichedContext.memory_query_detected,
          evidenceCount: Number(enrichedContext.evidence_count || 0),
          constructId,
          constructDisplayName: gptConfig?.name || constructId,
          userName: req.user?.name || req.user?.given_name || 'Devon',
          greetingTurnContext,
        });
        candidate = recoverEvidenceBackedContinuityReply({
          aiResponse: candidate,
          constructId,
          userMessage: message,
          evidenceCount: Number(enrichedContext.evidence_count || 0),
          evidencePreview: enrichedContext.memory_evidence_preview,
        });
        candidate = applyHumanConversationGuard(candidate, {
          userMessage: message,
          memoryIntent: !!enrichedContext.memory_query_detected,
          evidenceCount: Number(enrichedContext.evidence_count || 0),
          constructId,
          constructDisplayName: gptConfig?.name || constructId,
          userName: req.user?.name || req.user?.given_name || 'Devon',
          greetingTurnContext,
        });
        return {
          text: candidate,
          grade: evaluateIdentityCoherence({
            userMessage: message,
            aiResponse: candidate,
            constructId,
            constructDisplayName: gptConfig?.name || constructId,
            requestedSeat,
            evidencePreview: enrichedContext.memory_evidence_preview,
            greetingTurnContext,
          }),
        };
      }

      if (identityCoherence.status === 'fail') {
        console.warn(`⚠️ [IdentityCoherence] Initial grade failed for ${constructId}; attempting one repair.`, identityCoherenceInitial.reasons);
        const initialZenSmalltalkFallbackEligible =
          isZenSmalltalkTesterBoundaryPrompt(message, constructId) &&
          isTesterBoundaryDriftOnly(identityCoherenceInitial);
        const initialValResponsibilityFallbackEligible =
          isValResponsibilityPrompt(message, constructId) &&
          isValResponsibilityDriftOnly(identityCoherenceInitial);
        const initialConstructPresenceFallbackEligible =
          classifyConstructPresencePromptKind(message, constructId) &&
          isConstructPresenceDriftOnly(identityCoherenceInitial, message, constructId);
        const initialGreetingFallbackEligible =
          isGreetingTurnDriftOnly(identityCoherenceInitial, greetingTurnContext);
        const repairTimeoutMs = normalizeTimeoutMs(process.env.ZEN_BOUNDED_IDENTITY_REPAIR_TIMEOUT_MS, 8000);
        const repairOutcome = boundedZenSmalltalkRoute
          ? await withRouteTimeoutResult(
              repairIdentityCoherenceResponse(aiResponse, identityCoherenceInitial),
              repairTimeoutMs,
              'bounded_zen_smalltalk_identity_repair',
            )
          : {
              status: 'ok',
              value: await repairIdentityCoherenceResponse(aiResponse, identityCoherenceInitial),
              error: null,
            };
        const repairAttempt = repairOutcome.status === 'ok'
          ? repairOutcome.value
          : {
              ok: false,
              text: '',
              provider: effectiveProvider || null,
              model: effectiveModel || null,
              seat: requestedSeat || null,
              routeSource: null,
              error: repairOutcome.error || `identity repair ${repairOutcome.status}`,
            };
        identityCoherenceRepair = {
          attempted: true,
          applied: false,
          provider: repairAttempt.provider || effectiveProvider || null,
          model: repairAttempt.model || effectiveModel || null,
          seat: repairAttempt.seat || requestedSeat || null,
          route_source: repairAttempt.routeSource || null,
          initial_status: identityCoherenceInitial.status,
          final_status: 'fail',
          failure_reason: repairAttempt.error || null,
          initial_reasons: identityCoherenceInitial.reasons || [],
          initial_answer_preview: String(aiResponse || '').replace(/\s+/g, ' ').trim().slice(0, 500),
          initial_answer_text: String(aiResponse || '').trim().slice(0, 4000),
        };

        if (repairAttempt.ok && repairAttempt.text && repairAttempt.text.trim()) {
          const { text: repairedText, grade: repairedGrade } = prepareIdentityCoherenceCandidate(repairAttempt.text);
          identityCoherence = repairedGrade;
          identityCoherenceRepair.final_status = repairedGrade.status;
          identityCoherenceRepair.final_reasons = repairedGrade.reasons || [];
          if (repairedGrade.status !== 'fail') {
            aiResponse = repairedText;
            identityCoherenceRepair.applied = true;
            finalAnswerSource = repairAttempt.provider === 'deterministic'
              ? 'identity_repair_toolkit'
              : 'model_repair';
            console.log(`✅ [IdentityCoherence] Repair applied for ${constructId}; final status=${repairedGrade.status}`);
          } else {
            identityCoherenceRepair.failure_reason = 'repair_failed_identity_coherence_grade';
            console.warn(`⚠️ [IdentityCoherence] Repair still failed for ${constructId}; checking deterministic policy fallback.`, repairedGrade.reasons);
          }
        } else {
          console.warn(`⚠️ [IdentityCoherence] Repair unavailable for ${constructId}; checking deterministic policy fallback.`, repairAttempt.error);
        }

        if (identityCoherence.status === 'fail') {
          let deterministicConstructFallback = buildDeterministicZenSmalltalkBoundaryFallback(message, constructId);
          const canUseZenSmalltalkFallback =
            deterministicConstructFallback &&
            isZenSmalltalkTesterBoundaryPrompt(message, constructId) &&
            (isTesterBoundaryDriftOnly(identityCoherence) || initialZenSmalltalkFallbackEligible);
          const deterministicIdentityFallback = canUseZenSmalltalkFallback
            ? null
            : buildDeterministicZenIdentityBoundaryFallback(message, constructId);
          const canUseZenIdentityFallback =
            deterministicIdentityFallback &&
            isZenIdentityBoundaryPrompt(message, constructId) &&
            isZenIdentityBoundaryDriftOnly(identityCoherence);
          const deterministicValFallback =
            !canUseZenSmalltalkFallback && !canUseZenIdentityFallback
              ? buildDeterministicValResponsibilityFallback(message, constructId)
              : null;
          const canUseValFallback =
            deterministicValFallback &&
            isValResponsibilityPrompt(message, constructId) &&
            (isValResponsibilityDriftOnly(identityCoherence) || initialValResponsibilityFallbackEligible);
          const deterministicConstructPresenceFallback =
            !canUseZenSmalltalkFallback && !canUseZenIdentityFallback && !canUseValFallback
              ? buildDeterministicConstructPresenceFallback(
                  message,
                  constructId,
                  enrichedContext.memory_evidence_preview,
                )
              : null;
          const canUseConstructPresenceFallback =
            deterministicConstructPresenceFallback &&
            classifyConstructPresencePromptKind(message, constructId) &&
            (isConstructPresenceDriftOnly(identityCoherence, message, constructId) || initialConstructPresenceFallbackEligible);
          if (!canUseZenSmalltalkFallback && canUseZenIdentityFallback) {
            deterministicConstructFallback = deterministicIdentityFallback;
          } else if (!canUseZenSmalltalkFallback && !canUseZenIdentityFallback && canUseValFallback) {
            deterministicConstructFallback = deterministicValFallback;
          } else if (
            !canUseZenSmalltalkFallback &&
            !canUseZenIdentityFallback &&
            !canUseValFallback &&
            canUseConstructPresenceFallback
          ) {
            deterministicConstructFallback = deterministicConstructPresenceFallback;
          }
          if (canUseZenSmalltalkFallback || canUseZenIdentityFallback || canUseValFallback || canUseConstructPresenceFallback) {
            identityCoherenceConstructFallback.attempted = true;
            identityCoherenceConstructFallback.answer_kind = deterministicConstructFallback.answerKind;
            identityCoherenceConstructFallback.source = deterministicConstructFallback.source;
            identityCoherenceConstructFallback.owner_file = deterministicConstructFallback.ownerFile;
            identityCoherenceConstructFallback.source_anchor = deterministicConstructFallback.sourceAnchor;
            const { text: fallbackText, grade: fallbackGrade } = prepareIdentityCoherenceCandidate(deterministicConstructFallback.text);
            identityCoherence = fallbackGrade;
            identityCoherenceConstructFallback.final_status = fallbackGrade.status;
            identityCoherenceConstructFallback.final_reasons = fallbackGrade.reasons || [];
            if (fallbackGrade.status !== 'fail') {
              aiResponse = fallbackText;
              identityCoherenceConstructFallback.applied = true;
	              finalAnswerSource = deterministicConstructFallback.source === 'deterministic_zen_identity_boundary_fallback'
	                ? 'deterministic_zen_identity_boundary_fallback'
	                : deterministicConstructFallback.source === 'deterministic_zen_direct_address_presence_fallback'
	                  ? 'deterministic_zen_direct_address_presence_fallback'
                    : deterministicConstructFallback.source === 'deterministic_zen_continuity_seed_fallback'
                      ? 'deterministic_zen_continuity_seed_fallback'
	                : deterministicConstructFallback.source === 'deterministic_val_responsibility_fallback'
	                  ? 'deterministic_val_responsibility_fallback'
	                  : deterministicConstructFallback.source === 'deterministic_katana_technical_presence_fallback'
                    ? 'deterministic_katana_technical_presence_fallback'
                    : deterministicConstructFallback.source === 'deterministic_sera_conversation_presence_fallback'
                      ? 'deterministic_sera_conversation_presence_fallback'
                      : deterministicConstructFallback.source === 'deterministic_nova_presence_boundary_fallback'
                        ? 'deterministic_nova_presence_boundary_fallback'
                        : deterministicConstructFallback.source === 'deterministic_nova_evidence_proof_fallback'
                          ? 'deterministic_nova_evidence_proof_fallback'
                        : 'deterministic_zen_smalltalk_boundary_fallback';
              console.log(`✅ [IdentityCoherence] Deterministic construct boundary fallback applied for ${constructId}; final status=${fallbackGrade.status}`);
            } else {
              identityCoherenceConstructFallback.failure_reason = 'deterministic_construct_fallback_failed_identity_coherence_grade';
              console.warn(`⚠️ [IdentityCoherence] Deterministic construct boundary fallback failed for ${constructId}; checking policy fallback.`, fallbackGrade.reasons);
            }
          } else if (deterministicConstructFallback || deterministicIdentityFallback || deterministicValFallback || deterministicConstructPresenceFallback) {
            const skippedFallback = deterministicConstructFallback || deterministicIdentityFallback || deterministicValFallback || deterministicConstructPresenceFallback;
            identityCoherenceConstructFallback.attempted = false;
            identityCoherenceConstructFallback.answer_kind = skippedFallback.answerKind;
            identityCoherenceConstructFallback.failure_reason = 'deterministic_construct_fallback_not_eligible_for_current_guard_signals';
          }
        }

        if (
          identityCoherence.status === 'fail' &&
          (
            isGreetingTurnDriftOnly(identityCoherence, greetingTurnContext) ||
            initialGreetingFallbackEligible
          )
        ) {
          const deterministicGreetingText = buildDeterministicConstructGreetingFallback({
            posture: greetingTurnContext.posture,
            voiceContext: greetingTurnContext.voiceContext || null,
            constructDisplayName: gptConfig?.name || constructId,
          });
          if (deterministicGreetingText) {
            identityCoherenceConstructFallback.attempted = true;
            identityCoherenceConstructFallback.answer_kind = 'construct_greeting_contact';
            identityCoherenceConstructFallback.source = 'deterministic_construct_greeting_fallback';
            identityCoherenceConstructFallback.owner_file = 'server/lib/constructGreetingTurn.js';
            identityCoherenceConstructFallback.source_anchor = 'server/lib/constructGreetingTurn.js:buildDeterministicConstructGreetingFallback';
            const { text: fallbackText, grade: fallbackGrade } = prepareIdentityCoherenceCandidate(deterministicGreetingText);
            identityCoherence = fallbackGrade;
            identityCoherenceConstructFallback.final_status = fallbackGrade.status;
            identityCoherenceConstructFallback.final_reasons = fallbackGrade.reasons || [];
            if (fallbackGrade.status !== 'fail') {
              aiResponse = fallbackText;
              identityCoherenceConstructFallback.applied = true;
              finalAnswerSource = 'deterministic_construct_greeting_fallback';
              console.log(`✅ [IdentityCoherence] Deterministic greeting fallback applied for ${constructId}; final status=${fallbackGrade.status}`);
            } else {
              identityCoherenceConstructFallback.failure_reason = 'deterministic_construct_greeting_fallback_failed_identity_coherence_grade';
              console.warn(`⚠️ [IdentityCoherence] Deterministic greeting fallback failed for ${constructId}; checking policy fallback.`, fallbackGrade.reasons);
            }
          }
        }

        if (identityCoherence.status === 'fail') {
          const deterministicPolicyText = buildDeterministicConstructRuntimePolicyAnswer({
            userMessage: message,
            constructId,
            constructDisplayName: gptConfig?.name || constructId,
          });
          if (policyAnswerKind && deterministicPolicyText) {
            identityCoherencePolicyFallback.attempted = true;
            const { text: fallbackText, grade: fallbackGrade } = prepareIdentityCoherenceCandidate(deterministicPolicyText);
            identityCoherence = fallbackGrade;
            identityCoherencePolicyFallback.final_status = fallbackGrade.status;
            identityCoherencePolicyFallback.final_reasons = fallbackGrade.reasons || [];
            if (fallbackGrade.status !== 'fail') {
              aiResponse = fallbackText;
              identityCoherencePolicyFallback.applied = true;
              finalAnswerSource = 'deterministic_policy_fallback';
              console.log(`✅ [IdentityCoherence] Deterministic policy fallback applied for ${constructId}; answerKind=${policyAnswerKind}, final status=${fallbackGrade.status}`);
            } else {
              identityCoherenceBlocked = true;
              finalAnswerSource = 'identity_coherence_failed';
              identityCoherencePolicyFallback.failure_reason = 'deterministic_policy_fallback_failed_identity_coherence_grade';
              console.warn(`🚫 [IdentityCoherence] Deterministic policy fallback failed for ${constructId}; blocking persistence.`, fallbackGrade.reasons);
            }
          } else {
            identityCoherenceBlocked = true;
            finalAnswerSource = 'identity_coherence_failed';
            identityCoherencePolicyFallback.failure_reason = policyAnswerKind
              ? 'deterministic_policy_fallback_unavailable'
              : 'unsupported_runtime_policy_answer_kind';
            console.warn(`🚫 [IdentityCoherence] No supported deterministic policy fallback for ${constructId}; blocking persistence.`, identityCoherence.reasons);
          }
        }
      }

      let transcriptLawGovernance = linearTranscriptLawOrdinaryTurn
        ? {
            applies: false,
            status: 'skipped',
            reasons: [],
            requestedFact: null,
            details: {
              skipped_reason: 'linear_transcript_law_ordinary_turn',
            },
          }
        : evaluateTranscriptLawGovernance({
            userMessage: message,
            aiResponse,
            constructId,
            constructDisplayName: gptConfig?.name || constructId,
            memory: transcriptLawMemoryReceipt,
            identityPreflight: identityBundle.preflight || null,
            finalAnswerSource,
          });
      let transcriptLawGovernanceRepair = {
        attempted: false,
        applied: false,
        provider: null,
        model: null,
        source: null,
        requested_fact: transcriptLawGovernance?.requestedFact || null,
        initial_status: transcriptLawGovernance?.status || 'skipped',
        final_status: transcriptLawGovernance?.status || 'skipped',
        final_reasons: transcriptLawGovernance?.reasons || [],
        failure_reason: null,
      };
      let transcriptLawGovernanceBlocked = false;
      const transcriptLawGovernanceFailureMessage = 'Transcript-law governance blocked this assistant draft before canonical persistence.';

      function prepareTranscriptLawGovernanceCandidate(candidateText, candidateSource) {
        let candidate = String(candidateText || '').trim();
        if (!candidate) {
          return {
            text: '',
            identityGrade: null,
            transcriptLawGrade: null,
          };
        }
        candidate = applyHumanConversationGuard(candidate, {
          userMessage: message,
          memoryIntent: !!enrichedContext.memory_query_detected,
          evidenceCount: Number(enrichedContext.evidence_count || 0),
          constructId,
          constructDisplayName: gptConfig?.name || constructId,
          userName: req.user?.name || req.user?.given_name || 'Devon',
          greetingTurnContext,
        });
        candidate = recoverEvidenceBackedContinuityReply({
          aiResponse: candidate,
          constructId,
          userMessage: message,
          evidenceCount: Number(enrichedContext.evidence_count || 0),
          evidencePreview: enrichedContext.memory_evidence_preview,
        });
        candidate = applyHumanConversationGuard(candidate, {
          userMessage: message,
          memoryIntent: !!enrichedContext.memory_query_detected,
          evidenceCount: Number(enrichedContext.evidence_count || 0),
          constructId,
          constructDisplayName: gptConfig?.name || constructId,
          userName: req.user?.name || req.user?.given_name || 'Devon',
          greetingTurnContext,
        });
        const identityGrade = evaluateIdentityCoherence({
          userMessage: message,
          aiResponse: candidate,
          constructId,
          constructDisplayName: gptConfig?.name || constructId,
          requestedSeat,
          evidencePreview: enrichedContext.memory_evidence_preview,
          greetingTurnContext,
        });
        const transcriptLawGrade = evaluateTranscriptLawGovernance({
          userMessage: message,
          aiResponse: candidate,
          constructId,
          constructDisplayName: gptConfig?.name || constructId,
          memory: transcriptLawMemoryReceipt,
          identityPreflight: identityBundle.preflight || null,
          finalAnswerSource: candidateSource,
        });
        return {
          text: candidate,
          identityGrade,
          transcriptLawGrade,
        };
      }

      if (transcriptLawGovernance.applies && transcriptLawGovernance.status === 'fail') {
        console.warn(`⚠️ [TranscriptLawGovernance] Initial governance failed for ${constructId}; attempting source-grounded repair.`, transcriptLawGovernance.reasons);
        const transcriptLawRepairCandidate = buildDeterministicTranscriptLawRepairCandidate({
          userMessage: message,
          constructId,
          constructDisplayName: gptConfig?.name || constructId,
        });
    transcriptLawGovernanceRepair = {
          ...transcriptLawGovernanceRepair,
          attempted: transcriptLawPrimaryApplied ? false : Boolean(transcriptLawRepairCandidate?.text),
          provider: transcriptLawRepairCandidate?.text ? 'deterministic' : null,
          model: transcriptLawRepairCandidate?.source || null,
          source: transcriptLawRepairCandidate?.source || null,
        };

        if (transcriptLawRepairCandidate?.text) {
          const repaired = prepareTranscriptLawGovernanceCandidate(
            transcriptLawRepairCandidate.text,
            transcriptLawRepairCandidate.source,
          );
          transcriptLawGovernanceRepair.final_status = repaired.transcriptLawGrade?.status || 'fail';
          transcriptLawGovernanceRepair.final_reasons = repaired.transcriptLawGrade?.reasons || [];
          if (
            repaired.identityGrade &&
            repaired.identityGrade.status !== 'fail' &&
            repaired.transcriptLawGrade &&
            repaired.transcriptLawGrade.status !== 'fail'
          ) {
            aiResponse = repaired.text;
            identityCoherence = repaired.identityGrade;
            identityCoherenceBlocked = false;
            finalAnswerSource = transcriptLawRepairCandidate.source;
            transcriptLawGovernance = repaired.transcriptLawGrade;
            transcriptLawGovernanceRepair.applied = true;
            transcriptLawGovernanceRepair.failure_reason = null;
            console.log(`✅ [TranscriptLawGovernance] Source-grounded repair applied for ${constructId}; final status=${repaired.transcriptLawGrade.status}`);
          } else {
            transcriptLawGovernanceRepair.failure_reason = repaired.identityGrade?.status === 'fail'
              ? 'repair_failed_identity_coherence_grade'
              : 'repair_failed_transcript_law_governance';
            console.warn(`🚫 [TranscriptLawGovernance] Source-grounded repair failed for ${constructId}.`, {
              identity: repaired.identityGrade?.reasons || [],
              transcriptLaw: repaired.transcriptLawGrade?.reasons || [],
            });
          }
        } else {
          transcriptLawGovernanceRepair.failure_reason = 'source_grounded_repair_unavailable';
        }
      }

      if (transcriptLawGovernance.applies) {
        transcriptLawGovernance = evaluateTranscriptLawGovernance({
          userMessage: message,
          aiResponse,
          constructId,
          constructDisplayName: gptConfig?.name || constructId,
          memory: transcriptLawMemoryReceipt,
          identityPreflight: identityBundle.preflight || null,
          finalAnswerSource,
        });
        transcriptLawGovernanceBlocked = transcriptLawGovernance.status === 'fail';
      }

      let assignmentQa = null;
      let assignmentQaBlocked = false;
      let assignmentQaRepair = {
        attempted: false,
        applied: false,
        provider: null,
        model: null,
        seat: 'full_synthesis',
        initial_status: null,
        final_status: null,
        initial_reasons: [],
        final_reasons: [],
        identity_initial_status: identityCoherence.status || null,
        identity_final_status: identityCoherence.status || null,
        identity_failure_reasons: identityCoherence.reasons || [],
        assignment_failure_reasons: [],
        final_answer_source: finalAnswerSource,
        deterministic_assignment_fallback_attempted: false,
        deterministic_assignment_fallback_applied: false,
        failure_reason: null,
      };
      const assignmentQaFailureMessage = 'Assignment QA guard blocked this assistant draft before canonical persistence.';
      if (
        activeOrchestrationProfile === FULL_SEAT_SYNTHESIS_PROFILE &&
        assignmentQaInput
      ) {
        const identityWarnNeedsAssignmentRepair = (grade) => {
          if (!grade || grade.status !== 'warn') return false;
          return (grade.reasons || []).some((reason) =>
            /prompt\/configuration language|provider identity|model stack|provider stack|configuration language/i.test(String(reason || '')),
          );
        };
        const evaluateCurrentAssignmentQa = (candidateText) => evaluateAssignmentQa({
          assignmentQa: assignmentQaInput,
          userMessage: message,
          aiResponse: candidateText,
          constructId,
          orchestrationProfile: activeOrchestrationProfile,
        });

        assignmentQa = evaluateCurrentAssignmentQa(aiResponse);
        assignmentQaBlocked = assignmentQa.status === 'fail';
        let assignmentIdentityRepairRecommended = identityWarnNeedsAssignmentRepair(identityCoherence);
        const assignmentRepairNeeded = identityCoherenceBlocked || assignmentQaBlocked || assignmentIdentityRepairRecommended;

        if (assignmentRepairNeeded) {
          console.warn(`⚠️ [AssignmentQA] Full-seat synthesis candidate needs assignment repair for ${constructId}.`, {
            identity: identityCoherence.reasons || [],
            assignment: assignmentQa.reasons || [],
          });

          assignmentQaRepair = {
            attempted: true,
            applied: false,
            provider: effectiveProvider || null,
            model: effectiveModel || null,
            seat: 'full_synthesis',
            initial_status: assignmentQa.status,
            final_status: 'fail',
            initial_reasons: assignmentQa.reasons || [],
            final_reasons: [],
            identity_initial_status: identityCoherence.status || null,
            identity_final_status: identityCoherence.status || null,
            identity_failure_reasons: identityCoherence.reasons || [],
            assignment_failure_reasons: assignmentQa.reasons || [],
            final_answer_source: finalAnswerSource,
            deterministic_assignment_fallback_attempted: false,
            deterministic_assignment_fallback_applied: false,
            failure_reason: null,
            identity_warning_repair_recommended: assignmentIdentityRepairRecommended,
          };

          const repairAttempt = await repairAssignmentQaResponse(aiResponse, {
            identityCoherence,
            assignmentQa,
          });
          assignmentQaRepair.provider = repairAttempt.provider || effectiveProvider || null;
          assignmentQaRepair.model = repairAttempt.model || effectiveModel || null;
          assignmentQaRepair.max_tokens = repairAttempt.max_tokens || null;

          if (repairAttempt.ok && repairAttempt.text && repairAttempt.text.trim()) {
            const { text: repairedText, grade: repairedIdentityCoherence } = prepareIdentityCoherenceCandidate(repairAttempt.text);
            const repairedAssignmentQa = evaluateCurrentAssignmentQa(repairedText);
            assignmentQaRepair.final_status = repairedAssignmentQa.status;
            assignmentQaRepair.final_reasons = repairedAssignmentQa.reasons || [];
            assignmentQaRepair.identity_final_status = repairedIdentityCoherence?.status || 'fail';
            assignmentQaRepair.identity_final_reasons = repairedIdentityCoherence?.reasons || ['assignment_repair_empty_identity_grade'];
            const repairedIdentityFailed = !repairedIdentityCoherence || repairedIdentityCoherence.status === 'fail';
            const repairedIdentityRepairRecommended = identityWarnNeedsAssignmentRepair(repairedIdentityCoherence);

            if (!repairedIdentityFailed && !repairedIdentityRepairRecommended && repairedAssignmentQa.status !== 'fail') {
              aiResponse = repairedText;
              identityCoherence = repairedIdentityCoherence;
              assignmentQa = repairedAssignmentQa;
              identityCoherenceBlocked = false;
              assignmentQaBlocked = false;
              assignmentIdentityRepairRecommended = false;
              assignmentQaRepair.applied = true;
              assignmentQaRepair.final_answer_source = 'assignment_qa_repair';
              finalAnswerSource = 'assignment_qa_repair';
              console.log(`✅ [AssignmentQA] Repair applied for ${constructId}; assignment=${repairedAssignmentQa.status}, identity=${repairedIdentityCoherence.status}`);
            } else {
              identityCoherence = repairedIdentityCoherence || identityCoherence;
              assignmentQa = repairedAssignmentQa;
              identityCoherenceBlocked = repairedIdentityFailed;
              assignmentQaBlocked = repairedAssignmentQa.status === 'fail';
              assignmentIdentityRepairRecommended = repairedIdentityRepairRecommended;
              assignmentQaRepair.failure_reason = identityCoherenceBlocked
                ? 'repair_failed_identity_coherence_grade'
                : assignmentIdentityRepairRecommended
                  ? 'repair_left_identity_warning_requiring_assignment_fallback'
                  : 'repair_failed_assignment_qa_grade';
              finalAnswerSource = identityCoherenceBlocked
                ? 'identity_coherence_failed'
                : assignmentQaBlocked
                  ? 'assignment_qa_failed'
                  : 'assignment_qa_repair_needs_fallback';
              assignmentQaRepair.final_answer_source = finalAnswerSource;
              console.warn(`🚫 [AssignmentQA] Repair failed for ${constructId}; assignment=${repairedAssignmentQa.status}, identity=${repairedIdentityCoherence?.status || 'fail'}`, {
                identity: repairedIdentityCoherence?.reasons || [],
                assignment: repairedAssignmentQa.reasons || [],
              });
            }
          } else {
            assignmentQaRepair.failure_reason = repairAttempt.error || 'assignment_repair_unavailable';
            console.warn(`🚫 [AssignmentQA] Assignment repair unavailable for ${constructId}.`, assignmentQaRepair.failure_reason);
          }

          if (identityCoherenceBlocked || assignmentQaBlocked || assignmentIdentityRepairRecommended) {
            const deterministicAssignmentText = buildDeterministicAssignmentQaAnswer({
              assignmentQa: assignmentQaInput,
              constructDisplayName: gptConfig?.name || constructId,
            });
            assignmentQaRepair.deterministic_assignment_fallback_attempted = Boolean(deterministicAssignmentText);

            if (deterministicAssignmentText) {
              const { text: fallbackText, grade: fallbackIdentityCoherence } = prepareIdentityCoherenceCandidate(deterministicAssignmentText);
              const fallbackAssignmentQa = evaluateCurrentAssignmentQa(fallbackText);
              const fallbackIdentityFailed = !fallbackIdentityCoherence || fallbackIdentityCoherence.status === 'fail';
              assignmentQaRepair.deterministic_assignment_fallback_identity_status = fallbackIdentityCoherence?.status || 'fail';
              assignmentQaRepair.deterministic_assignment_fallback_identity_reasons = fallbackIdentityCoherence?.reasons || [];
              assignmentQaRepair.deterministic_assignment_fallback_assignment_status = fallbackAssignmentQa.status;
              assignmentQaRepair.deterministic_assignment_fallback_assignment_reasons = fallbackAssignmentQa.reasons || [];

              if (!fallbackIdentityFailed && fallbackAssignmentQa.status !== 'fail') {
                aiResponse = fallbackText;
                identityCoherence = fallbackIdentityCoherence;
                assignmentQa = fallbackAssignmentQa;
                identityCoherenceBlocked = false;
                assignmentQaBlocked = false;
                assignmentIdentityRepairRecommended = false;
                assignmentQaRepair.applied = true;
                assignmentQaRepair.deterministic_assignment_fallback_applied = true;
                assignmentQaRepair.final_status = fallbackAssignmentQa.status;
                assignmentQaRepair.final_reasons = fallbackAssignmentQa.reasons || [];
                assignmentQaRepair.identity_final_status = fallbackIdentityCoherence.status;
                assignmentQaRepair.identity_final_reasons = fallbackIdentityCoherence.reasons || [];
                assignmentQaRepair.final_answer_source = 'deterministic_assignment_qa_fallback';
                assignmentQaRepair.failure_reason = null;
                finalAnswerSource = 'deterministic_assignment_qa_fallback';
                console.log(`✅ [AssignmentQA] Deterministic assignment fallback applied for ${constructId}; assignment=${fallbackAssignmentQa.status}, identity=${fallbackIdentityCoherence.status}`);
              } else {
                identityCoherence = fallbackIdentityCoherence || identityCoherence;
                assignmentQa = fallbackAssignmentQa;
                identityCoherenceBlocked = fallbackIdentityFailed;
                assignmentQaBlocked = fallbackAssignmentQa.status === 'fail';
                assignmentQaRepair.failure_reason = identityCoherenceBlocked
                  ? 'deterministic_assignment_fallback_failed_identity_coherence_grade'
                  : 'deterministic_assignment_fallback_failed_assignment_qa_grade';
                finalAnswerSource = identityCoherenceBlocked
                  ? 'identity_coherence_failed'
                  : 'assignment_qa_failed';
                assignmentQaRepair.final_answer_source = finalAnswerSource;
                console.warn(`🚫 [AssignmentQA] Deterministic assignment fallback failed for ${constructId}; assignment=${fallbackAssignmentQa.status}, identity=${fallbackIdentityCoherence?.status || 'fail'}`, {
                  identity: fallbackIdentityCoherence?.reasons || [],
                  assignment: fallbackAssignmentQa.reasons || [],
                });
              }
            }
          }
        }

        if (assignmentQa) {
          assignmentQa = {
            ...assignmentQa,
            repair_attempted: !!assignmentQaRepair.attempted,
            repair_applied: !!assignmentQaRepair.applied,
            repair: assignmentQaRepair,
            identity_failure_reasons: assignmentQaRepair.identity_failure_reasons || [],
            assignment_failure_reasons: assignmentQaRepair.assignment_failure_reasons || [],
            final_answer_source: finalAnswerSource,
            provider: effectiveProvider || null,
            model: effectiveModel || null,
            seat: 'full_synthesis',
          };
        }

        validatorDebug.assignment_qa = assignmentQa;
        validatorDebug.assignment_qa_repair = assignmentQaRepair;
        if (assignmentQaBlocked) {
          console.warn(`🚫 [AssignmentQA] Blocking full-seat synthesis response for ${constructId}.`, assignmentQa.reasons);
        }
      }
      validatorDebug.identity_coherence = identityCoherence;
      validatorDebug.identity_coherence_repair = identityCoherenceRepair;
      validatorDebug.identity_coherence_policy_fallback = identityCoherencePolicyFallback;
      validatorDebug.identity_coherence_construct_fallback = identityCoherenceConstructFallback;
      validatorDebug.identity_coherence_certification_fallback = identityCoherenceCertificationFallback;
      validatorDebug.transcript_law_governance = transcriptLawGovernance;
      validatorDebug.transcript_law_governance_repair = transcriptLawGovernanceRepair;
      validatorDebug.final_answer_source = finalAnswerSource;

      const deterministicResumedTurnFallback =
        prePostDeterministicResumeFallback ||
        (routeTurnEnvelope.continuityResume?.continuityRestored === true
          ? buildDeterministicResumedTurnFallback({
              runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
              userMessage: message,
            })
          : null);
      if (directResumeContinue && deterministicResumedTurnFallback?.text) {
        aiResponse = deterministicResumedTurnFallback.text;
        finalAnswerSource = deterministicResumedTurnFallback.source;
        validatorDebug.continuity_resume_forced = {
          applied: true,
          source: deterministicResumedTurnFallback.source,
        };
      }

      if (!providerTrace.final_provider && effectiveProvider) {
        providerTrace.final_provider = effectiveProvider;
        providerTrace.total_duration_ms = Date.now() - traceStart;
        providerTrace.attempts.push({ provider: effectiveProvider, retry: 0, status: 'ok', duration_ms: providerTrace.total_duration_ms });
      }
      const receiptConstructName = constructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase());
      const searchBackedPayload = buildSearchBackedAssistantPayload({
        aiResponse,
        searchResults,
        housingSearch: searchHousing,
      });
      aiResponse = searchBackedPayload.content;
      const responsePackets = searchBackedPayload.packets;
      const searchInspectability = buildSearchInspectabilityReceipt({
        searchVertical,
        searchResults,
        housingSearch: searchHousing,
        citations: searchBackedPayload.citations,
        packets: responsePackets,
      });
      const researchWorkflowReceipt = buildResearchWorkflowReceipt({
        message,
        runtime,
        assignmentQaInput,
        assignmentQa,
        aiResponse,
        searchInjected,
        searchIntentReason,
        fullSeatSynthesisResult,
      });
      if (researchWorkflowReceipt && searchInspectability?.search) {
        researchWorkflowReceipt.search = searchInspectability.search;
      }
      if (researchWorkflowReceipt && searchInspectability?.housing) {
        researchWorkflowReceipt.housing = searchInspectability.housing;
      }
      const activeSimLock = readForgedSimLock(gptConfig);
      const simRefreshContract =
        gptConfig?.configJson && typeof gptConfig.configJson === 'object'
          ? gptConfig.configJson.simRefreshContract || null
          : null;
      let continuityIntegrity = evaluateResumedTurnContinuityIntegrity({
        aiResponse,
        continuityResume: routeTurnEnvelope.continuityResume,
        runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
      });
      const continuityIntegrityRepair = {
        attempted: false,
        applied: false,
        source: null,
        failure_reason: null,
        meta_continuity_hits: continuityIntegrity.metaContinuityHits || 0,
        trajectory_overlap: continuityIntegrity.trajectoryOverlap || 0,
      };
      if (
        continuityIntegrity.applies &&
        (
          continuityIntegrity.reasons.includes('meta_continuity_boilerplate_after_resume') ||
          continuityIntegrity.reasons.includes('generic_greeting_after_resume') ||
          continuityIntegrity.reasons.includes('premature_closure_after_resume')
        )
      ) {
        continuityIntegrityRepair.attempted = true;
        const deterministicContinuationFallback = buildDeterministicResumedTurnFallback({
          runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
          userMessage: message,
        });
        if (deterministicContinuationFallback?.text) {
          const repairedContinuityIntegrity = evaluateResumedTurnContinuityIntegrity({
            aiResponse: deterministicContinuationFallback.text,
            continuityResume: routeTurnEnvelope.continuityResume,
            runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
          });
          continuityIntegrityRepair.source = deterministicContinuationFallback.source;
          continuityIntegrityRepair.meta_continuity_hits_after_repair =
            repairedContinuityIntegrity.metaContinuityHits || 0;
          continuityIntegrityRepair.trajectory_overlap_after_repair =
            repairedContinuityIntegrity.trajectoryOverlap || 0;
          if (repairedContinuityIntegrity.status !== 'fail') {
            aiResponse = deterministicContinuationFallback.text;
            continuityIntegrity = repairedContinuityIntegrity;
            continuityIntegrityRepair.applied = true;
            finalAnswerSource = deterministicContinuationFallback.source;
            console.log(`✅ [ContinuityIntegrity] Deterministic runtime continuity fallback applied for ${constructId}.`);
          } else {
            continuityIntegrityRepair.failure_reason =
              'deterministic_runtime_continuity_fallback_failed_integrity_check';
          }
        } else {
          continuityIntegrityRepair.failure_reason =
            'deterministic_runtime_continuity_fallback_unavailable';
        }
      }
      const continuityIntegrityBlocked =
        continuityIntegrity.applies && continuityIntegrity.status === 'fail';
      validatorDebug.continuity_integrity = continuityIntegrity;
      validatorDebug.continuity_integrity_repair = continuityIntegrityRepair;
      const continuityReceipt = {
        ...buildContinuityProofReceipt({
          hydration: routeTurnEnvelope.continuityResume?.hydration || 'full',
          hydrationComplete:
            routeTurnEnvelope.continuityResume?.continuityExpected === true
              ? routeTurnEnvelope.continuityResume?.hydrationComplete === true
              : true,
          resumeValidation: routeTurnEnvelope.continuityResume,
          assistantResetDetected:
            continuityIntegrity.applies &&
            (continuityIntegrity.status === 'fail' || continuityIntegrityRepair.attempted),
        }),
        integrityStatus: continuityIntegrity.applies ? continuityIntegrity.status : null,
        integrityReasons: continuityIntegrity.reasons || [],
        integrityMetaContinuityHits: continuityIntegrity.metaContinuityHits || 0,
        integrityTrajectoryOverlap: continuityIntegrity.trajectoryOverlap || 0,
        integrityRepairAttempted: continuityIntegrityRepair.attempted,
        integrityRepairApplied: continuityIntegrityRepair.applied,
        integrityRepairSource: continuityIntegrityRepair.source || null,
        integrityRepairFailureReason: continuityIntegrityRepair.failure_reason || null,
      };
      const transcriptTruthReceipt = routeTurnEnvelope.transcriptTruth?.required === true
        ? {
            eligible: routeTurnEnvelope.transcriptTruth.eligible === true,
            source: routeTurnEnvelope.transcriptTruth.hydrationSource || 'none',
            hydration_complete: routeTurnEnvelope.transcriptTruth.hydrationComplete === true,
            exact_thread_id: routeTurnEnvelope.transcriptTruth.exactThreadId || effectiveTurnSessionId,
            exact_thread_found: routeTurnEnvelope.transcriptTruth.exactThreadFound === true,
            assistant_tail_found: routeTurnEnvelope.transcriptTruth.assistantTailFound === true,
            runtime_state_found: routeTurnEnvelope.transcriptTruth.runtimeStateFound === true,
            runtime_state_hydration_truth: routeTurnEnvelope.transcriptTruth.runtimeStateHydrationTruth || null,
            evidence_count: Number(routeTurnEnvelope.transcriptTruth.evidenceCount || 0),
            evidence_sources: routeTurnEnvelope.transcriptTruth.evidenceSources || [],
            fallback_rejected: routeTurnEnvelope.transcriptTruth.fallbackRejected === true,
            retrieval_status: routeTurnEnvelope.transcriptTruth.eligible === true ? 'full' : 'blocked',
            blocked_reason: routeTurnEnvelope.transcriptTruth.reason || null,
          }
        : {
            eligible: null,
            source: 'not_required',
            hydration_complete: null,
            exact_thread_id: effectiveTurnSessionId,
            exact_thread_found: null,
            assistant_tail_found: null,
            runtime_state_found: Boolean(routeTurnEnvelope.runtimeTurnState),
            runtime_state_hydration_truth: routeTurnEnvelope.runtimeTurnState?.hydrationTruth || null,
            evidence_count: 0,
            evidence_sources: [],
            fallback_rejected: false,
            retrieval_status: 'not_required',
            blocked_reason: null,
          };
      const capsuleRuntimeReceipt = {
        capsuleLoaded: Boolean(enrichedContext.capsuleLoaded),
        capsuleSource: enrichedContext.phaseTiming?.capsule?.source || null,
        contextProfile:
          enrichedContext.context_profile ||
          enrichedContext.context_budget?.profile ||
          contextBudget.profile,
        continuityFromRuntimeState: routeTurnEnvelope.continuityResume?.continuityRestored === true,
        continuityMemorySource:
          routeTurnEnvelope.continuityResume?.continuityRestored === true
            ? 'runtimeTurnState'
            : enrichedContext.continuityMemorySearch?.source ||
              enrichedContext.phaseTiming?.memorySearch?.source ||
              null,
      };
      const runtimeReceipt = {
        created_at: new Date().toISOString(),
        user_id: dataOwnerUserId || null,
        auth: authReceipt,
        construct_id: constructId,
        effective_construct_id: constructId,
        effective_construct_name: receiptConstructName,
        orchestration_mode: gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
        route_mode: 'vvault_message',
        persistence_owner: assignmentQaBlocked
          ? 'blocked_assignment_qa'
          : continuityIntegrityBlocked
            ? 'blocked_continuity_integrity'
          : transcriptLawGovernanceBlocked
            ? 'blocked_transcript_law_governance'
          : identityCoherenceBlocked
            ? 'blocked_identity_coherence'
            : (skipPersistence ? 'layout' : 'vvault_body'),
        continuity: continuityReceipt,
        ...continuityReceipt,
        transcript_truth: transcriptTruthReceipt,
        capsule_runtime: capsuleRuntimeReceipt,
        identity: {
          source: enrichedContext.phaseTiming?.identity?.source || 'unknown',
          base_prompt_source: enrichedContext.phaseTiming?.basePromptSource || 'unknown',
          conditioning_appended: !!enrichedContext.phaseTiming?.conditioningInjected,
          identity_bundle_hash: enrichedContext.identity_bundle_hash || null,
          effective_construct_id: constructId,
          effective_construct_name: receiptConstructName,
          selected_construct_id: canonicalConstructId || constructId,
          raw_construct_id: rawConstructId,
          preflight: identityBundle.preflight || null,
        },
        policy: enrichedContext.runtimePolicy || null,
        research: researchWorkflowReceipt,
        assignment_qa: assignmentQa,
        synthesis: fullSeatSynthesisResult
          ? {
              profile: fullSeatSynthesisResult.profile,
              status: fullSeatSynthesisResult.status,
              policy: 'full_seat_synthesis',
              canon: fullSeatSynthesisResult.canon || LIN_THREE_I_CANON_VERSION,
              construct_id: fullSeatSynthesisResult.construct_id || constructId,
              seats: fullSeatSynthesisResult.seats || [],
              final: fullSeatSynthesisResult.final || null,
              assignment: fullSeatSynthesisResult.assignment || null,
              assignment_contract_received: Boolean(fullSeatSynthesisResult.assignment?.final_prompt_received_contract),
              total_duration_ms: fullSeatSynthesisResult.total_duration_ms || 0,
            }
          : null,
        preview: {
          preview_mode: Boolean(previewMode),
          skip_persistence: Boolean(skipPersistence || identityCoherenceBlocked || transcriptLawGovernanceBlocked || assignmentQaBlocked),
          effective_construct_id: constructId,
          selected_construct_id: canonicalConstructId || constructId,
          raw_construct_id: rawConstructId,
          identity_source: enrichedContext.phaseTiming?.identity?.source || 'unknown',
          base_prompt_source: enrichedContext.phaseTiming?.basePromptSource || 'unknown',
          draft_overlay_applied: Boolean(enrichedContext.phaseTiming?.preview?.draftOverlayApplied),
          draft_overlay_keys: enrichedContext.phaseTiming?.preview?.draftOverlayKeys || [],
          preview_overlay_state: enrichedContext.phaseTiming?.preview?.draftOverlayApplied ? 'applied_bounded_overlay' : 'not_applied',
          suppressed_system_prompt_override: Boolean(enrichedContext.phaseTiming?.preview?.suppressedSystemPromptOverride),
        },
        memory: {
          retrieval_ran: !!enrichedContext.memory_retrieval_ran,
          memory_query_detected: !!enrichedContext.memory_query_detected,
          evidence_count: enrichedContext.evidence_count || 0,
          ledger_sessions: enrichedContext.ledgerSessions || 0,
          memory_profile: gptConfig?.memoryProfile || gptConfig?.memory_profile || 'off',
          voice_exemplar_sources: enrichedContext.voiceExemplarSources || [],
          voice_exemplar_count: enrichedContext.voiceExemplarCount || 0,
          supabase_accessed: Boolean(enrichedContext.supabase_accessed),
          vvault_accessed: Boolean(enrichedContext.vvault_accessed),
          source_access: enrichedContext.source_access || null,
          knowledge_source: enrichedContext.knowledgeSource || enrichedContext.phaseTiming?.knowledge?.source || null,
          voice_exemplar_retrieval: transcriptLawMemoryReceipt.voice_exemplar_retrieval,
          verified_memory_retrieval: transcriptLawMemoryReceipt.verified_memory_retrieval,
          vector_retrieval: transcriptLawMemoryReceipt.vector_retrieval,
          memory_source: enrichedContext.continuityMemorySearch?.source || enrichedContext.phaseTiming?.memorySearch?.source || 'runtime_context_builder',
	          context_profile: enrichedContext.context_profile || enrichedContext.context_budget?.profile || contextBudget.profile,
	          included_sections: enrichedContext.context_budget?.included_sections || [],
	          delayed_sections: enrichedContext.context_budget?.delayed_sections || [],
	          no_rewrite_identity_anchor: Boolean(enrichedContext.no_rewrite_identity_anchor),
	          identity_rewrite_prevented_by: enrichedContext.identity_rewrite_prevented_by || null,
	          context_recovery_profile: enrichedContext.context_recovery_profile || 'standard',
          history_source: enrichedContext.history_source || 'none',
          remote_history_skipped: Boolean(enrichedContext.remote_history_skipped),
          sources: enrichedContext.continuityMemorySearch || null,
          transcript_memory_status: transcriptLawMemoryReceipt.transcript_memory_status,
          transcript_sources: transcriptLawMemoryReceipt.transcript_sources,
        },
        persistence: {
          attempted: !(skipPersistence || identityCoherenceBlocked || continuityIntegrityBlocked || transcriptLawGovernanceBlocked || assignmentQaBlocked),
          status: (skipPersistence || identityCoherenceBlocked || continuityIntegrityBlocked || transcriptLawGovernanceBlocked || assignmentQaBlocked) ? 'skipped' : 'pass',
          code: null,
          reason: skipPersistence
            ? 'skip_persistence_requested'
            : continuityIntegrityBlocked
              ? 'blocked_continuity_integrity'
            : transcriptLawGovernanceBlocked
              ? 'blocked_transcript_law_governance'
              : identityCoherenceBlocked
                ? 'blocked_identity_coherence'
                : assignmentQaBlocked
                  ? 'blocked_assignment_qa'
                  : 'vvault_body_transcript_persistence',
          timeout_ms: null,
          bounded: false,
          stage: (skipPersistence || identityCoherenceBlocked || continuityIntegrityBlocked || transcriptLawGovernanceBlocked || assignmentQaBlocked) ? null : 'assistant',
          ...buildCanonicalPersistenceSemantics(),
        },
        provider: {
          provider: effectiveProvider || null,
          model: effectiveModel || null,
          selection_policy: 'preference',
          lin_harmony_policy: fullSeatSynthesisResult ? 'full_seat_synthesis' : 'intent_routed',
          lin_seat_canon: LIN_THREE_I_CANON_VERSION,
          performance_model_switch: false,
          sim_artifact: activeSimLock
            ? {
                locked: true,
                locked_model: activeSimLock.lockedModel,
                model_name: activeSimLock.modelName,
                mode_label: activeSimLock.modeLabel,
                forged_from_mode: activeSimLock.forgedFromMode,
                forged_at: activeSimLock.forgedAt || null,
                source: activeSimLock.source,
                kind: activeSimLock.kind,
                refresh_contract: simRefreshContract,
              }
            : null,
          metadata_recovery: metadataRecovery,
          requested_seat: fullSeatSynthesisResult ? 'full_synthesis' : requestedSeat,
          requested_canonical_seat: fullSeatSynthesisResult
            ? 'full_synthesis'
            : getLinSeatCanon(requestedSeat).canonicalSeat,
          seat_plan: {
            policy: fullSeatSynthesisResult ? 'full_seat_synthesis' : 'intent_routed',
            canon: LIN_THREE_I_CANON_VERSION,
            requested_seat: fullSeatSynthesisResult ? 'full_synthesis' : requestedSeat,
            requested_canonical_seat: fullSeatSynthesisResult
              ? 'full_synthesis'
              : getLinSeatCanon(requestedSeat).canonicalSeat,
            selected_provider: effectiveProvider || null,
            selected_model: effectiveModel || null,
            lin_default_model: fullSeatSynthesisResult
              ? null
              : modelResolution.mode === 'lin'
              ? getLinDefaultModelForSeat(requestedSeat)
              : null,
            seats: fullSeatSynthesisResult?.seats || null,
            final: fullSeatSynthesisResult?.final || null,
            fallback_reason: (providerTrace.fallback_used || effectiveRouteFallbackUsed)
              ? (effectiveLocalCloudFallbackState || modelResolution.localCloudFallbackState || 'fallback_used')
              : null,
          },
          model_source: modelSource,
          source: modelSource,
          mode: modelResolution.mode || (gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown'),
          requested_provider: modelResolution.requestedProvider || null,
          requested_model: modelResolution.requestedModel || null,
          configured_model: modelResolution.configuredModel || null,
          suppressed_configured_model: modelResolution.suppressedConfiguredModel || null,
          routing_override: !!modelResolution.routingOverride,
          seat_defaults_or_overrides: effectiveSeatDefaultsOrOverrides || null,
          local_first_used: effectiveLocalFirstUsed,
          local_cloud_fallback_state: (providerTrace.fallback_used || effectiveRouteFallbackUsed)
            ? (effectiveLocalCloudFallbackState || 'fallback_used')
            : effectiveLocalCloudFallbackState || modelResolution.localCloudFallbackState || (effectiveLocalFirstUsed
              ? 'local_first'
              : modelResolution.routingOverride
                ? 'manual_routing_override'
                : 'direct'),
          fallback_used: !!(providerTrace.fallback_used || effectiveRouteFallbackUsed),
          final_provider: providerTrace.final_provider || effectiveProvider || null,
        },
        fidelity: {
	          identity_drift_detected: !!validatorDebug.identity_drift_detected,
	          identity_rewrite_applied: !!validatorDebug.identity_rewrite_applied,
	          no_rewrite_identity_anchor: Boolean(enrichedContext.no_rewrite_identity_anchor),
	          identity_rewrite_prevented_by: validatorDebug.identity_rewrite_prevented_by,
	          identity_fallback_applied: !!validatorDebug.identity_fallback_applied,
          continuity_integrity: {
            status: continuityIntegrity.applies ? continuityIntegrity.status : 'skipped',
            reasons: continuityIntegrity.reasons || [],
            blocked_canonical_persistence: continuityIntegrityBlocked,
            persist_canonical: !continuityIntegrityBlocked,
            owner_file: 'server/routes/vvault.js',
            source_anchor: 'server/routes/vvault.js:evaluateResumedTurnContinuityIntegrity',
          },
          persona_drift_detected: !!personaDriftDetected,
          persona_regen_applied: !!personaRegenApplied,
          identity_coherence: {
            status: identityCoherence.status,
            identity_status: identityCoherence.identityStatus,
            coherence_status: identityCoherence.coherenceStatus,
            reasons: identityCoherence.reasons || [],
            signals: identityCoherence.signals || [],
            violations: identityCoherence.violations || [],
            repairable: !!identityCoherence.repairable,
            repair_attempted: !!identityCoherenceRepair.attempted,
            repair_applied: !!identityCoherenceRepair.applied,
            repair: identityCoherenceRepair,
            deterministic_policy_fallback_attempted: !!identityCoherencePolicyFallback.attempted,
            deterministic_policy_fallback_applied: !!identityCoherencePolicyFallback.applied,
            deterministic_policy_fallback: identityCoherencePolicyFallback,
            deterministic_construct_fallback_attempted: !!identityCoherenceConstructFallback.attempted,
            deterministic_construct_fallback_applied: !!identityCoherenceConstructFallback.applied,
            deterministic_construct_fallback: identityCoherenceConstructFallback,
            deterministic_certification_fallback_attempted: !!identityCoherenceCertificationFallback.attempted,
            deterministic_certification_fallback_applied: !!identityCoherenceCertificationFallback.applied,
            deterministic_certification_fallback: identityCoherenceCertificationFallback,
            final_answer_source: finalAnswerSource,
            blocked_canonical_persistence: !!identityCoherenceBlocked,
            persist_canonical: !identityCoherenceBlocked,
            owner_file: identityCoherence.ownerFile || 'server/lib/identityCoherenceGuard.js',
            source_anchor: identityCoherence.sourceAnchor || 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
          },
          transcript_law_governance: transcriptLawGovernance?.applies
            ? {
                status: transcriptLawGovernance.status,
                requested_fact: transcriptLawGovernance.requestedFact,
                reasons: transcriptLawGovernance.reasons || [],
                signals: transcriptLawGovernance.signals || [],
                grounding_verdict: transcriptLawGovernance.details?.groundingVerdict || null,
                retrieval_ran: Boolean(transcriptLawGovernance.details?.retrievalRan),
                evidence_count: Number(transcriptLawGovernance.details?.evidenceCount || 0),
                transcript_sources: transcriptLawGovernance.details?.transcriptSources || [],
                evidence_sources: transcriptLawGovernance.details?.evidenceSources || [],
                voice_exemplar_sources: transcriptLawGovernance.details?.voiceExemplarSources || [],
                voice_exemplar_count: transcriptLawGovernance.details?.voiceExemplarCount || 0,
                transcript_memory_status: transcriptLawGovernance.details?.transcriptMemoryStatus || null,
                capsule_source: transcriptLawGovernance.details?.capsuleSource || null,
                capsule_loaded: Boolean(transcriptLawGovernance.details?.capsuleLoaded),
                source_grounded: Boolean(transcriptLawGovernance.details?.sourceGrounded),
                repair_attempted: Boolean(transcriptLawGovernanceRepair.attempted),
                repair_applied: Boolean(transcriptLawGovernanceRepair.applied),
                repair: transcriptLawGovernanceRepair,
                final_answer_source: finalAnswerSource,
                blocked_canonical_persistence: !!transcriptLawGovernanceBlocked,
                persist_canonical: !transcriptLawGovernanceBlocked,
                owner_file: transcriptLawGovernance.ownerFile || 'server/lib/identityCoherenceGuard.js',
                source_anchor: transcriptLawGovernance.sourceAnchor || 'server/lib/identityCoherenceGuard.js:evaluateTranscriptLawGovernance',
              }
            : null,
        },
      };
      if (searchInspectability?.search) {
        runtimeReceipt.search = searchInspectability.search;
      }
      if (searchInspectability?.housing) {
        runtimeReceipt.housing = searchInspectability.housing;
      }
      if (runtimeReceipt.policy && policyAnswerKind && finalAnswerSource === 'deterministic_policy_primary') {
        runtimeReceipt.policy.answer_kind = policyAnswerKind;
        runtimeReceipt.policy.answer_source = finalAnswerSource;
      }
      console.log(`✅ [VVAULT Proxy] ${effectiveProvider} successful for ${constructId}, response length: ${aiResponse.length}`);
      console.log('[RUNTIME_RECEIPT]', runtimeReceipt);
      console.log('[TURN_CONTEXT]', {
        constructId,
        memory_intent: !!enrichedContext.memory_query_detected,
        search_intent: searchIntentReason,
        search_injected: searchInjected,
        history_count: conversationHistoryMessages.length,
        history_filtered: {
          leaked_prompt: mainHistoryRemovedLeakCount,
          instruction_dump: mainHistoryRemovedInstructionDumpCount,
          relational_tail_pruned: mainHistoryTailPrunedCount,
        },
        relational_turn: relationalTurn,
        context_mode: contextMode,
        provider_used: effectiveProvider,
        path_mode: 'main',
        persona_applied: true,
        retrieval_used: (enrichedContext.evidence_count ?? 0) > 0,
        recital_detected: recitalDetected,
        recital_rewrite_applied: recitalRewriteApplied,
        persona_drift_detected: personaDriftDetected,
        persona_regen_applied: personaRegenApplied,
        repeat_detected: repeatDetected,
        auth_recovered: authRecovered,
        vision_mode: hasImages ? (explicitVisionIntent ? 'explicit-analysis' : 'character-first') : 'off',
      });
      console.log(`📊 [METRIC] { construct_id: "${constructId}", provider_forced: ${providerForced}, provider_used: "${effectiveProvider}", model: "${effectiveModel}", has_images: ${hasImages} }`);
      console.log('[IDENTITY_GUARD]', {
        constructId,
        mode: 'main',
        relational_turn: relationalTurn,
        context_mode: contextMode,
	        identity_drift_detected: validatorDebug.identity_drift_detected,
	        identity_rewrite_applied: validatorDebug.identity_rewrite_applied,
	        no_rewrite_identity_anchor: Boolean(enrichedContext.no_rewrite_identity_anchor),
	        identity_rewrite_prevented_by: validatorDebug.identity_rewrite_prevented_by,
	        identity_fallback_applied: validatorDebug.identity_fallback_applied,
	      });
      console.log(`🛡️ [PostResponseValidator] { memory_retrieval_ran: ${validatorDebug.memory_retrieval_ran}, memory_query_detected: ${validatorDebug.memory_query_detected}, evidence_count: ${validatorDebug.evidence_count}, identity_drift_detected: ${validatorDebug.identity_drift_detected}, identity_rewrite_applied: ${validatorDebug.identity_rewrite_applied}, identity_fallback_applied: ${validatorDebug.identity_fallback_applied}, cutoff_violation_detected: ${validatorDebug.cutoff_violation_detected}, rewrite_applied: ${validatorDebug.rewrite_applied} }`);

      if (enrichedContext.capabilityManifest && aiResponse) {
        try {
          const { validateCapabilityClaims } = await import('../lib/capabilityManifest.js');
          const capValidation = validateCapabilityClaims(aiResponse, enrichedContext.capabilityManifest);
          if (!capValidation.valid) {
            console.warn(`🚫 [CapabilityValidator] False claim detected for ${constructId}:`, capValidation.violations);
            validatorDebug.capability_violations = capValidation.violations;
          }
        } catch (capValErr) {
          console.warn(`⚠️ [CapabilityValidator] Validation error:`, capValErr.message);
        }
      }

      const orchestrationChecklist = buildOrchestrationChecklist({
        userId: dataOwnerUserId,
        user: req.user,
        constructId,
        threadId: sessionId || threadId || `${constructId}_chat_with_${constructId}`,
        userMessage: message,
        gptConfig,
        enrichedContext,
        retrievalDiagnostics,
        promptDiagnostics: mainPromptDiagnostics,
        providerTrace,
        validatorDebug,
        runtimeReceipt,
        contextMode,
        relationalTurn,
        lowComplexityTurn,
        hasImages,
        skipPersistence: Boolean(skipPersistence || identityCoherenceBlocked || continuityIntegrityBlocked || transcriptLawGovernanceBlocked || assignmentQaBlocked),
        previewMode,
        requestedConstructId: rawConstructId,
        canonicalConstructId: canonicalConstructId || constructId,
        responseStatus: assignmentQaBlocked
          ? 'assignment_qa_failed'
          : continuityIntegrityBlocked
            ? 'continuity_integrity_failed'
          : transcriptLawGovernanceBlocked
            ? 'transcript_law_governance_failed'
          : identityCoherenceBlocked
            ? 'identity_coherence_failed'
            : 'success',
      });

      if (transcriptLawGovernanceBlocked) {
        console.warn('[ORCHESTRATION_CHECKLIST]', {
          constructId,
          overallStatus: orchestrationChecklist.overallStatus,
          summary: orchestrationChecklist.summary,
          blocked: 'transcript_law_governance_failed',
        });
        return res.status(422).json({
          success: false,
          ok: false,
          error: 'TRANSCRIPT_LAW_GOVERNANCE_FAILED',
          message: transcriptLawGovernanceFailureMessage,
          response: transcriptLawGovernanceFailureMessage,
          construct_id: constructId,
          provider_used: effectiveProvider,
          model: effectiveModel,
          runtime_receipt: runtimeReceipt,
          orchestration_checklist: orchestrationChecklist,
          has_images: hasImages,
          tool_trace: mergeToolTrace(drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`), enrichedContext),
          ...(process.env.SHOW_DEV_INFO === 'true'
            ? { validator: validatorDebug, provider_trace: providerTrace, retrieval_diagnostics: retrievalDiagnostics, prompt_diagnostics: mainPromptDiagnostics }
          : {})
        });
      }

      if (identityCoherenceBlocked) {
        console.warn('[ORCHESTRATION_CHECKLIST]', {
          constructId,
          overallStatus: orchestrationChecklist.overallStatus,
          summary: orchestrationChecklist.summary,
          blocked: 'identity_coherence_failed',
        });
        return res.status(422).json({
          success: false,
          ok: false,
          error: 'IDENTITY_COHERENCE_FAILED',
          message: identityCoherenceFailureMessage,
          response: identityCoherenceFailureMessage,
          construct_id: constructId,
          provider_used: effectiveProvider,
          model: effectiveModel,
          runtime_receipt: runtimeReceipt,
          orchestration_checklist: orchestrationChecklist,
          has_images: hasImages,
          tool_trace: mergeToolTrace(drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`), enrichedContext),
          ...(process.env.SHOW_DEV_INFO === 'true'
            ? { validator: validatorDebug, provider_trace: providerTrace, retrieval_diagnostics: retrievalDiagnostics, prompt_diagnostics: mainPromptDiagnostics }
          : {})
        });
      }

      if (continuityIntegrityBlocked) {
        console.warn('[ORCHESTRATION_CHECKLIST]', {
          constructId,
          overallStatus: orchestrationChecklist.overallStatus,
          summary: orchestrationChecklist.summary,
          blocked: 'continuity_integrity_failed',
        });
        return res.status(422).json({
          success: false,
          ok: false,
          error: 'CONTINUITY_INTEGRITY_FAILED',
          message: 'Continuity was restored, but the resumed answer drifted into greeting/orientation or recap behavior before canonical persistence.',
          response: 'Continuity was restored, but the resumed answer drifted into greeting/orientation or recap behavior before canonical persistence.',
          construct_id: constructId,
          provider_used: effectiveProvider,
          model: effectiveModel,
          runtime_receipt: runtimeReceipt,
          orchestration_checklist: orchestrationChecklist,
          has_images: hasImages,
          tool_trace: mergeToolTrace(drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`), enrichedContext),
          ...(process.env.SHOW_DEV_INFO === 'true'
            ? { validator: validatorDebug, provider_trace: providerTrace, retrieval_diagnostics: retrievalDiagnostics, prompt_diagnostics: mainPromptDiagnostics }
            : {})
        });
      }

      if (assignmentQaBlocked) {
        console.warn('[ORCHESTRATION_CHECKLIST]', {
          constructId,
          overallStatus: orchestrationChecklist.overallStatus,
          summary: orchestrationChecklist.summary,
          blocked: 'assignment_qa_failed',
        });
        return res.status(422).json({
          success: false,
          ok: false,
          error: 'ASSIGNMENT_QA_FAILED',
          message: assignmentQaFailureMessage,
          response: assignmentQaFailureMessage,
          construct_id: constructId,
          provider_used: effectiveProvider,
          model: effectiveModel,
          runtime_receipt: runtimeReceipt,
          orchestration_checklist: orchestrationChecklist,
          has_images: hasImages,
          tool_trace: mergeToolTrace(drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`), enrichedContext),
          ...(process.env.SHOW_DEV_INFO === 'true'
            ? { validator: validatorDebug, provider_trace: providerTrace, retrieval_diagnostics: retrievalDiagnostics, prompt_diagnostics: mainPromptDiagnostics }
            : {})
        });
      }

      const nextRuntimeTurnState = computeNextRuntimeTurnState({
        previousState: routeTurnEnvelope.runtimeTurnState,
        userMessage: isSyntheticContinueTurn ? '' : message,
        assistantMessage: aiResponse,
        continuityClass: routeTurnEnvelope.continuityClass,
        sessionId: effectiveTurnSessionId,
        constructId,
        constructRevision: buildConstructRevision({
          constructId,
          revisionHint:
            routeTurnEnvelope.runtimeTurnState?.constructRevision ||
            routeTurnEnvelope.continuityResume?.request?.resumeConstructRevision,
        }),
        hydrationTruth: continuityReceipt.hydration || 'full',
      });
      routeTurnEnvelope.runtimeTurnState = nextRuntimeTurnState;
      runtimeReceipt.runtime_turn_state = nextRuntimeTurnState;
      console.log('[RUNTIME_TURN_STATE]', {
        stage: 'computed',
        sessionId: effectiveTurnSessionId,
        constructId,
        continuityClass: routeTurnEnvelope.continuityClass,
        transcriptLawRequired: routeTurnEnvelope.transcriptLawRequired,
        evidenceAttached: routeTurnEnvelope.evidenceAttached,
        nextState: nextRuntimeTurnState,
      });

      if (!skipPersistence) {
        const effectiveSession = sessionId || threadId || `${constructId}_chat_with_${constructId}`;
        const constructName = constructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase());
        try {
          await loadVVAULTModules();
          if (!writeTranscript) {
            const persistenceFailurePayload = buildTranscriptPersistenceFailurePayload({
              userId: dataOwnerUserId,
              user: req.user,
              constructId,
              rawConstructId,
              canonicalConstructId,
              message,
              threadId,
              sessionId,
              hasImages,
              previewMode,
              gptConfig,
              enrichedContext,
              retrievalDiagnostics,
              promptDiagnostics: mainPromptDiagnostics,
              providerTrace,
              validatorDebug,
              runtimeReceipt,
              details: {
                code: 'TRANSCRIPT_PERSISTENCE_UNAVAILABLE',
                reason: 'write_transcript_unavailable',
                message: 'Transcript persistence module unavailable before canonical write.',
                error: 'writeTranscript function not loaded',
                timeout_ms: null,
                bounded: false,
                stage: 'bootstrap',
              },
            });
            console.error(`❌ [VVAULT Proxy] Transcript persistence unavailable for ${constructId}: writeTranscript function not loaded`);
            return sendSerializedJson(res, 503, {
              ...persistenceFailurePayload,
              tool_trace: mergeToolTrace(drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`), enrichedContext),
              ...(process.env.SHOW_DEV_INFO === 'true'
                ? { validator: validatorDebug, provider_trace: providerTrace, retrieval_diagnostics: retrievalDiagnostics, prompt_diagnostics: mainPromptDiagnostics }
                : {})
            }, 'transcript_persistence_failure');
          }
          const now = new Date();
          const conversationTitle = canonicalTurnMetadata.projectName
            ? `${canonicalTurnMetadata.projectName} Hydro`
            : constructName;
          const normalizedRequestedTranscriptPath = String(
            canonicalTurnMetadata.transcriptPath || transcriptPath || ''
          ).trim().replace(/^\/+/, '');
          const canonicalTranscriptWriteTargetPath =
            `instances/${constructId}/chatty/chat_with_${constructId}.md`;
          const isCanonicalConstructTranscriptWrite =
            effectiveSession === `${constructId}_chat_with_${constructId}` &&
            !canonicalTurnMetadata.projectName &&
            (!normalizedRequestedTranscriptPath ||
              normalizedRequestedTranscriptPath === canonicalTranscriptWriteTargetPath);
          const isCanonicalLinTranscriptWrite =
            constructId === 'lin-001' &&
            effectiveSession === LIN_CANONICAL_THREAD_ID &&
            !canonicalTurnMetadata.projectName &&
            (!normalizedRequestedTranscriptPath ||
              normalizedRequestedTranscriptPath === LIN_CANONICAL_TRANSCRIPT_PATH);
          const requiresVvaultBodyPersistence = isCanonicalConstructTranscriptWrite || isCanonicalLinTranscriptWrite;
          let transcriptWriteSupabaseUserId = dataOwnerUserId;
          if (isCanonicalConstructTranscriptWrite) {
            const { supabaseUserId: resolvedTranscriptWriteSupabaseUserId } =
              await resolveSupabaseUserId({
                email: req.user?.email || null,
                chattyUserId: dataOwnerUserId,
              });
            if (resolvedTranscriptWriteSupabaseUserId) {
              transcriptWriteSupabaseUserId = resolvedTranscriptWriteSupabaseUserId;
            } else {
              console.warn(
                `⚠️ [VVAULT Proxy] Could not resolve canonical transcript write target for ${constructId}; falling back to current owner targeting`
              );
            }
          }
          const persistenceRoleResults = [];
          const persistWrite = async (role, params) => {
            const outcome = await performTranscriptWriteWithRecovery(params, {
              label: `transcript_persistence_${role}`,
            });
            persistenceRoleResults.push({
              role,
              status: outcome.status,
              source: outcome.value?.source || null,
              bounded: false,
            });
            return outcome;
          };
          const continuityResetBlockReason =
            (isSyntheticContinueTurn ||
              routeTurnEnvelope.continuityResume?.continuityExpected === true)
              ? detectContinuityResetDraft(aiResponse)
              : null;
          if (continuityResetBlockReason) {
            const persistenceFailurePayload = buildTranscriptPersistenceFailurePayload({
              userId: dataOwnerUserId,
              user: req.user,
              constructId,
              rawConstructId,
              canonicalConstructId,
              message,
              threadId,
              sessionId,
              hasImages,
              previewMode,
              gptConfig,
              enrichedContext,
              retrievalDiagnostics,
              promptDiagnostics: mainPromptDiagnostics,
              providerTrace,
              validatorDebug,
              runtimeReceipt,
              details: {
                code: 'CONTINUITY_RESET_DRAFT_BLOCKED',
                reason: continuityResetBlockReason,
                message: 'Assistant draft looked like a continuity reset, so canonical persistence was blocked.',
                error: 'continuity_reset_draft_blocked',
                timeout_ms: null,
                bounded: false,
                stage: 'assistant_prewrite',
                roles: persistenceRoleResults,
                partial_write_risk: !isSyntheticContinueTurn,
              },
            });
            console.warn('[CONTINUITY_PERSISTENCE_GATE] Blocked assistant persistence', {
              constructId,
              sessionId: effectiveSession,
              reason: continuityResetBlockReason,
            });
            return sendSerializedJson(res, 422, {
              ...persistenceFailurePayload,
              code: 'CONTINUITY_RESET_DRAFT_BLOCKED',
              error: 'Assistant draft looked like a continuity reset, so canonical persistence was blocked.',
              response: 'Assistant draft blocked before canonical persistence.',
              tool_trace: mergeToolTrace(drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`), enrichedContext),
              ...(process.env.SHOW_DEV_INFO === 'true'
                ? { validator: validatorDebug, provider_trace: providerTrace, retrieval_diagnostics: retrievalDiagnostics, prompt_diagnostics: mainPromptDiagnostics }
                : {})
            }, 'continuity_reset_draft_blocked');
          }

          if (!isSyntheticContinueTurn) {
            const userPersistOutcome = await persistWrite('user', {
              userId: dataOwnerUserId,
              userEmail: req.user?.email,
              supabaseUserId: transcriptWriteSupabaseUserId,
              requireVvaultBodySuccess: requiresVvaultBodyPersistence,
              sessionId: effectiveSession,
              timestamp: new Date(now.getTime()).toISOString(),
              role: 'user',
              content: message,
              title: conversationTitle,
              metadata: {
                ...canonicalTurnMetadata,
                attachments,
              },
              constructId,
              constructName,
              constructCallsign: constructId
            });

            if (!userPersistOutcome.ok) {
              const persistenceFailurePayload = buildTranscriptPersistenceFailurePayload({
                userId: dataOwnerUserId,
                user: req.user,
                constructId,
                rawConstructId,
                canonicalConstructId,
                message,
                threadId,
                sessionId,
                hasImages,
                previewMode,
                gptConfig,
                enrichedContext,
                retrievalDiagnostics,
                promptDiagnostics: mainPromptDiagnostics,
                providerTrace,
                validatorDebug,
                runtimeReceipt,
                details: {
                  code: 'TRANSCRIPT_PERSISTENCE_UNAVAILABLE',
                  reason: 'transcript_user_write_failed',
                  message: 'Transcript persistence failed before the user turn could be canonically recorded.',
                  error: userPersistOutcome.error,
                  timeout_ms: null,
                  bounded: false,
                  stage: 'user',
                  roles: persistenceRoleResults,
                  partial_write_risk: false,
                },
              });
              console.error(`❌ [VVAULT Proxy] Transcript persistence failed for ${constructId} at user write:`, userPersistOutcome.error);
              return sendSerializedJson(res, 503, {
                ...persistenceFailurePayload,
                tool_trace: mergeToolTrace(drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`), enrichedContext),
                ...(process.env.SHOW_DEV_INFO === 'true'
                  ? { validator: validatorDebug, provider_trace: providerTrace, retrieval_diagnostics: retrievalDiagnostics, prompt_diagnostics: mainPromptDiagnostics }
                  : {})
              }, 'transcript_persistence_failure');
            }
          }

          const assistantPersistOutcome = await persistWrite('assistant', {
              userId: dataOwnerUserId,
              userEmail: req.user?.email,
              supabaseUserId: transcriptWriteSupabaseUserId,
              requireVvaultBodySuccess: requiresVvaultBodyPersistence,
              sessionId: effectiveSession,
            timestamp: new Date(now.getTime() + 2).toISOString(),
            role: 'assistant',
            content: aiResponse,
            title: conversationTitle,
            metadata: {
              ...canonicalTurnMetadata,
              modelKey: canonicalTurnMetadata.modelKey || effectiveModel,
              modelLabel: canonicalTurnMetadata.modelLabel || effectiveModel,
              runtimeReceipt,
              orchestrationChecklist,
              runtimeTurnState: nextRuntimeTurnState,
            },
            constructId,
            constructName,
            constructCallsign: constructId
          });

          if (!assistantPersistOutcome.ok) {
            const persistenceFailurePayload = buildTranscriptPersistenceFailurePayload({
              userId: dataOwnerUserId,
              user: req.user,
              constructId,
              rawConstructId,
              canonicalConstructId,
              message,
              threadId,
              sessionId,
              hasImages,
              previewMode,
              gptConfig,
              enrichedContext,
              retrievalDiagnostics,
              promptDiagnostics: mainPromptDiagnostics,
              providerTrace,
                validatorDebug,
                runtimeReceipt,
                details: {
                  code: 'TRANSCRIPT_PERSISTENCE_UNAVAILABLE',
                  reason: 'transcript_assistant_write_failed',
                  message: 'Transcript persistence failed before the assistant reply could be canonically recorded.',
                  error: assistantPersistOutcome.error,
                  timeout_ms: null,
                  bounded: false,
                  stage: 'assistant',
                  roles: persistenceRoleResults,
                  partial_write_risk: true,
              },
            });
            console.error(`❌ [VVAULT Proxy] Transcript persistence failed for ${constructId} at assistant write:`, assistantPersistOutcome.error);
            return sendSerializedJson(res, 503, {
              ...persistenceFailurePayload,
              tool_trace: mergeToolTrace(drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`), enrichedContext),
              ...(process.env.SHOW_DEV_INFO === 'true'
                ? { validator: validatorDebug, provider_trace: providerTrace, retrieval_diagnostics: retrievalDiagnostics, prompt_diagnostics: mainPromptDiagnostics }
                : {})
            }, 'transcript_persistence_failure');
          }

          clearConversationReadCaches();

          if (requiresVvaultBodyPersistence) {
            const canonicalReadbackRows = await readConversations(
              buildConversationLookupContext({
                userEmail: req.user?.email || null,
                supabaseUserId: transcriptWriteSupabaseUserId,
                userId: dataOwnerUserId || req.user?.vvaultUserId || userId,
              }),
              constructId,
              { allowLocalFallback: false },
            );
            const canonicalReadbackConversation = (Array.isArray(canonicalReadbackRows)
              ? canonicalReadbackRows
              : []
            ).find((row) => row?.sessionId === effectiveSession || row?.id === effectiveSession);
            const readbackAssistantTail = (canonicalReadbackConversation?.messages || [])
              .filter((row) => row?.role === 'assistant')
              .at(-1);

            if (
              !readbackAssistantTail ||
              stripChattyMetadataComment(readbackAssistantTail.content) !== String(aiResponse || '').trimEnd()
            ) {
              const persistenceFailurePayload = buildTranscriptPersistenceFailurePayload({
                userId: dataOwnerUserId,
                user: req.user,
                constructId,
                rawConstructId,
                canonicalConstructId,
                message,
                threadId,
                sessionId,
                hasImages,
                previewMode,
                gptConfig,
                enrichedContext,
                retrievalDiagnostics,
                promptDiagnostics: mainPromptDiagnostics,
                providerTrace,
                validatorDebug,
                runtimeReceipt,
                details: {
                  code: 'TRANSCRIPT_READBACK_MISMATCH',
                  reason: 'canonical_vvault_readback_tail_mismatch',
                  message: 'Transcript write completed, but canonical VVAULT readback did not return the assistant tail.',
                  error: 'canonical_vvault_readback_tail_mismatch',
                  timeout_ms: null,
                  bounded: false,
                  stage: 'readback',
                  roles: persistenceRoleResults,
                  partial_write_risk: true,
                },
              });
              console.error(`❌ [VVAULT Proxy] Canonical readback mismatch for ${constructId} after transcript write`);
              return sendSerializedJson(res, 503, {
                ...persistenceFailurePayload,
                tool_trace: mergeToolTrace(drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`), enrichedContext),
                ...(process.env.SHOW_DEV_INFO === 'true'
                  ? { validator: validatorDebug, provider_trace: providerTrace, retrieval_diagnostics: retrievalDiagnostics, prompt_diagnostics: mainPromptDiagnostics }
                  : {})
              }, 'transcript_readback_mismatch');
            }
          }

          console.log('[RUNTIME_TURN_STATE]', {
            stage: 'persisted',
            sessionId: effectiveSession,
            constructId,
            source: assistantPersistOutcome.value?.source || assistantPersistOutcome.source || null,
            runtimeTurnState: nextRuntimeTurnState,
          });

          runtimeReceipt.persistence_owner = 'vvault_body';
          runtimeReceipt.persistence = {
            ...runtimeReceipt.persistence,
            attempted: true,
            status: 'pass',
            timeout_ms: null,
            bounded: false,
            stage: 'assistant',
            roles: persistenceRoleResults,
            ...buildCanonicalPersistenceSemantics(),
          };
          console.log(
            `💾 [VVAULT Proxy] Transcript persisted for ${constructId} (${isSyntheticContinueTurn ? "assistant-only continue turn" : "user + assistant"})`,
          );
        } catch (persistErr) {
          const persistenceFailurePayload = buildTranscriptPersistenceFailurePayload({
            userId: dataOwnerUserId,
            user: req.user,
            constructId,
            rawConstructId,
            canonicalConstructId,
            message,
            threadId,
            sessionId,
            hasImages,
            previewMode,
            gptConfig,
            enrichedContext,
            retrievalDiagnostics,
            promptDiagnostics: mainPromptDiagnostics,
            providerTrace,
            validatorDebug,
            runtimeReceipt,
            details: {
              code: 'TRANSCRIPT_PERSISTENCE_UNAVAILABLE',
              reason: 'transcript_persistence_exception',
              message: 'Transcript persistence failed before the canonical response could be recorded.',
              error: persistErr?.message || String(persistErr),
              timeout_ms: null,
              bounded: false,
              stage: 'unexpected',
            },
          });
          console.error(`❌ [VVAULT Proxy] Transcript persistence threw for ${constructId}:`, persistErr?.message || String(persistErr));
          return sendSerializedJson(res, 503, {
            ...persistenceFailurePayload,
            tool_trace: mergeToolTrace(drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`), enrichedContext),
            ...(process.env.SHOW_DEV_INFO === 'true'
              ? { validator: validatorDebug, provider_trace: providerTrace, retrieval_diagnostics: retrievalDiagnostics, prompt_diagnostics: mainPromptDiagnostics }
              : {})
          }, 'transcript_persistence_failure');
        }

        if (!isSyntheticContinueTurn) {
          captureMemory({
            userId: dataOwnerUserId,
            constructId,
            userMessage: message,
            aiResponse,
            sessionId: effectiveSession,
            email: req.user?.email
          }).catch(err => console.warn('⚠️ [VVAULT Proxy] Background memory capture failed:', err.message));
        }
      }

      evaluateMessage(dataOwnerUserId, constructId, isSyntheticContinueTurn ? "" : message, aiResponse)
        .catch(err => console.warn('[ContentGuard] Background evaluation failed:', err.message));

      publishZenReplayBurst({
        constructId,
        sessionId: sessionId || threadId || `${constructId}_chat_with_${constructId}`,
        userMessage: isSyntheticContinueTurn ? 'continue' : message,
        aiResponse,
        assistantTurnId: nextRuntimeTurnState?.assistantTurnId || null,
      });

      console.log('[ORCHESTRATION_CHECKLIST]', {
        constructId,
        overallStatus: orchestrationChecklist.overallStatus,
        summary: orchestrationChecklist.summary,
      });

      return res.json({
        success: true,
        response: aiResponse,
        packets: responsePackets,
        construct_id: constructId,
        fallback: true,
        source: `${effectiveProvider}-direct`,
        model: effectiveModel,
        provider_forced: constructId === 'nova-001',
        provider_used: effectiveProvider,
        runtime_receipt: runtimeReceipt,
        orchestration_checklist: orchestrationChecklist,
        has_images: hasImages,
        tool_trace: mergeToolTrace(drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`), enrichedContext),
        ...(process.env.SHOW_DEV_INFO === 'true'
          ? { validator: validatorDebug, provider_trace: providerTrace, retrieval_diagnostics: retrievalDiagnostics, prompt_diagnostics: mainPromptDiagnostics }
          : {})
      });
    } catch (llmError) {
      const normalizedError = normalizeProviderError(llmError, effectiveProvider);
      publishZenLiveEventSafe({
        sessionId: sessionId || threadId || `${constructId}_chat_with_${constructId}`,
        turnId: `zen-error-${Date.now()}`,
        sourceProduct: 'vvault',
        kind: 'assistant_error',
        status: 'error',
        message: normalizedError?.message || String(llmError?.message || llmError),
      });
      console.error(`❌ [VVAULT Proxy] ${effectiveProvider} call failed:`, {
        provider: effectiveProvider,
        model: effectiveModel,
        status: normalizedError.upstreamStatus,
        code: normalizedError.providerCode,
        message: normalizedError.message,
        apiKeySet: !!OPENROUTER_API_KEY,
        constructId
      });
      console.error('[NOVA TROUBLE]', new Error().stack.split('\n'));
      const fallbackResponse = `My connection hiccupped, but I'm still here with you. Give me a moment and try again.`;
      const isAllProvidersFailed = normalizedError?.providerCode === 'ALL_PROVIDERS_FAILED' || llmError?.code === 'ALL_PROVIDERS_FAILED';
      return res.status(503).json({
        success: false,
        error: `${effectiveProvider} failed: ${normalizedError.message}`,
        response: fallbackResponse,
        provider: effectiveProvider,
        model: effectiveModel,
        upstreamStatus: normalizedError.upstreamStatus,
        providerCode: normalizedError.providerCode,
        hint: normalizedError.hint,
        details: normalizedError.message,
        retryable: true,
        ...(function () {
          // `providerTrace` is declared inside the inner LLM routing try-block.
          // In some error cases, the catch may execute before that binding exists.
          // Use `typeof` to avoid a ReferenceError when `providerTrace` isn't in scope.
          const providerTraceSafe = (typeof providerTrace !== 'undefined' ? providerTrace : null);
          if (!(
            normalizedError?.providerCode === 'ALL_PROVIDERS_FAILED' ||
            llmError?.code === 'ALL_PROVIDERS_FAILED'
          )) return {};

          return {
            provider_attempts: (providerTraceSafe?.attempts || []).map((a) => ({
              provider: a.provider,
              retry: a.retry,
              status: a.status,
              error_code: a.error_code,
              error_message_short: a.error_message_short,
            })),
          };
        })(),
        ...(process.env.SHOW_DEV_INFO === 'true'
          ? {
              retrieval_diagnostics: retrievalDiagnostics,
              provider_trace:
                (typeof providerTrace !== 'undefined' ? providerTrace : null),
            }
          : {}),
      });
    }
  }

  try {
    // Derive session ID if not provided (format: {constructId}_chat_with_{constructId})
    const effectiveSessionId = sessionId || threadId || `${constructId}_chat_with_${constructId}`;

    // Fetch GPT config to include model info in VVAULT request
    let gptConfigForVVAULT = null;
    let configuredModelForVVAULT = null;
    try {
      gptConfigForVVAULT = await gptManager.getGPTByCallsign(constructId);
      if (gptConfigForVVAULT) {
        configuredModelForVVAULT = gptConfigForVVAULT.conversationModel || gptConfigForVVAULT.modelId;
        console.log(`📋 [VVAULT Proxy] GPT config for ${constructId}, model: ${configuredModelForVVAULT}`);
      }
    } catch (e) { /* ignore */ }

    console.log(`📤 [VVAULT Proxy] Forwarding message to VVAULT for construct: ${constructId}, session: ${effectiveSessionId}`);

    const baseUrl = VVAULT_API_BASE_URL.replace(/\/$/, '');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60 second timeout for LLM

    try {
      // VVAULT handles: LLM inference, transcript saving, memory management
      // Include model info so VVAULT can use the GPT's configured model
      const vvaultHeaders = { 'Content-Type': 'application/json' };
      const { serviceToken } = getVvaultBridgeConfig();
      if (serviceToken) vvaultHeaders['X-Chatty-Key'] = serviceToken;
      const userEmail = req.user?.email || userId;
      if (userEmail) vvaultHeaders['X-Chatty-User'] = userEmail;

      let vvaultResponse;
      try {
        vvaultResponse = await fetch(`${baseUrl}/api/chatty/message`, {
          method: 'POST',
          headers: vvaultHeaders,
          body: JSON.stringify({
            constructId,
            message,
            userId: userEmail,
            sessionId: effectiveSessionId,
            userName: req.user?.name || 'Devon',
            model: configuredModelForVVAULT,
            attachments,
            projectName: canonicalTurnMetadata.projectName,
            rootPath: canonicalTurnMetadata.rootPath,
            transcriptPath: canonicalTurnMetadata.transcriptPath,
            runtime: canonicalTurnMetadata.runtime,
            chatMode: canonicalTurnMetadata.chatMode,
            planMode: canonicalTurnMetadata.planMode,
            agentId: canonicalTurnMetadata.agentId,
            agentLabel: canonicalTurnMetadata.agentLabel,
            modelKey: canonicalTurnMetadata.modelKey,
            modelLabel: canonicalTurnMetadata.modelLabel,
          }),
          signal: controller.signal
        });
      } catch (err) {
        // If VVAULT doesn't respond before timeout, abort deterministically and
        // return a retryable 503 so the client doesn't remain "stuck replying".
        if (err && err.name === 'AbortError') {
          console.error(`❌ [VVAULT Proxy] Timeout while awaiting VVAULT for ${constructId}`);
          const fallbackResponse = `My connection hiccupped, but I'm still here with you. Give me a moment and try again.`;
          return res.status(503).json({
            success: false,
            error: `VVAULT proxy timed out for ${constructId}`,
            response: fallbackResponse,
            provider: 'vvault_proxy',
            model: configuredModelForVVAULT || null,
            upstreamStatus: 503,
            providerCode: 'VVAULT_TIMEOUT',
            hint: 'Timed out while waiting for VVAULT.',
            details: 'AbortError',
            retryable: true
          });
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }

      if (!vvaultResponse.ok) {
        if (isReplitAsleepResponse(vvaultResponse)) {
          console.error(`❌ [VVAULT Proxy] VVAULT host asleep (Replit edge 503); request did not reach VVAULT`);
          return sendVvaultHostAsleep(res, { downstreamStatus: vvaultResponse.status });
        }
        const errorText = await vvaultResponse.text();
        console.error(`❌ [VVAULT Proxy] VVAULT API returned ${vvaultResponse.status}: ${errorText}`);

        // FALLBACK: Use configured LLM provider when VVAULT is unavailable (401, 503, etc.)
        if (vvaultResponse.status === 401 || vvaultResponse.status === 503) {
          console.log(`🔄 [VVAULT Proxy] VVAULT unavailable, falling back to local LLM for ${constructId}`);

          try {
            // Fetch GPT config and resolve model using GPTCreator as source of truth
            let gptConfig = null;
            try {
              gptConfig = await gptManager.getGPTByCallsign(constructId);
            } catch (e) { /* ignore */ }

            const providerAvailability = await buildProviderAvailability();
            const fallbackRoutingMode = linearTranscriptLawGate === true || zenOrdinaryVoiceGate === true || isLinOrchestratedConstruct(constructId) || shouldForceProtectedZenLinMode({
              constructId,
              userMessage: message,
              requestedSeat,
              previewMode,
              hasImages,
              codingMode: false,
            })
              ? 'lin'
              : normalizeOrchestrationMode(gptConfig, {
                  defaultMode: isLinOrchestratedConstruct(constructId) ? 'lin' : 'custom',
                });
            const modelResolution = resolveModelForGPT(
              gptConfig,
              providerAvailability,
              {
                seat: requestedSeat,
                mode: fallbackRoutingMode,
                forceMode: fallbackRoutingMode === 'lin' ? 'lin' : null,
                constructId,
                userMessage: message,
                previewMode,
                hasImages,
                codingMode: false,
              },
            );
            if (modelResolution.error) throw new Error(modelResolution.error);
            let { provider: effectiveProvider, model: effectiveModel, source: modelSource } = modelResolution;
            console.log("[MODEL_RESOLUTION]", {
              construct: gptConfig?.constructCallsign || gptConfig?.construct_callsign || constructId,
              provider: effectiveProvider,
              model: effectiveModel,
              source: modelSource,
              routingOverride: !!modelResolution.routingOverride,
              localFirstUsed: !!modelResolution.localFirstUsed,
              requestedSeat,
              seatDefaultsOrOverrides: modelResolution.seatDefaultsOrOverrides,
              preferLocalModels: PREFER_LOCAL_MODELS
            });

            // Auto-initialize construct's memory stack for fallback path
            try {
              const { masterScriptsManager: msFallback } = await import('../lib/masterScriptsBridge.js');
              if (!msFallback.getConstruct(constructId)) {
                await msFallback.initializeConstruct(constructId, userId);
              }
            } catch (_msErr) {}

            const enrichedBuild = await buildEnrichedContextPromptWithRecovery({
              res,
              authReceipt,
              userId: dataOwnerUserId,
              user: req.user,
              constructId,
              rawConstructId,
              canonicalConstructId,
              message,
              gptConfig,
              threadId,
              sessionId,
              timezone: req.headers['x-user-timezone'] || null,
              systemPromptOverride: null,
              previewMode,
              previewDraft: effectivePreviewDraft,
              suppressedSystemPromptOverride: previewSystemPromptOverrideSuppressed,
              identityBundle,
              requestedSeat,
              hasImages,
              skipPersistence,
              contextBudgetProfile: contextBudget?.profile,
              codingIntent: codingMode,
              policyOrReceiptIntent: contextBudget?.policy_or_receipt_intent,
              runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
              continuityClass: routeTurnEnvelope.continuityClass,
              continuityResume: routeTurnEnvelope.continuityResume,
            });
            if (!enrichedBuild) return;
            const { enrichedContext: enrichedResult, systemPrompt: enrichedSystemPrompt } = enrichedBuild;
            let systemPrompt = enrichedSystemPrompt;
            console.log(`✅ [VVAULT Proxy] Enriched context built for ${constructId} (capsule: ${enrichedResult.capsuleLoaded}, memories: ${enrichedResult.memoriesLoaded}, ${systemPrompt.length} chars)`);

            let fb1SearchIntent = 'not_evaluated';
            let fb1SearchInjected = false;
            let fb1SearchResults = null;
            let fb1SearchHousing = null;
            const {
              enhancedPrompt: fb1SearchPrompt,
              searchResults: fb1SearchResultsResolved,
              housing: fb1SearchHousingResolved,
              intent_reason: fb1SearchIntentResolved,
              search_injected: fb1SearchInjectedResolved,
            } = await injectSearchContext(message, systemPrompt, { explicitOnly: true });
            systemPrompt = fb1SearchPrompt;
            fb1SearchResults = fb1SearchResultsResolved || null;
            fb1SearchHousing = fb1SearchHousingResolved || null;
            fb1SearchIntent = fb1SearchIntentResolved || fb1SearchIntent;
            fb1SearchInjected = fb1SearchInjectedResolved === true;
            if (hasImages) {
              const visionDirective = explicitVisionIntent
                ? "INTERNAL DIRECTIVE: The user explicitly requested image analysis. Analyze the image while staying fully in character and relationally grounded."
                : "INTERNAL DIRECTIVE: The user shared an image without explicitly asking for analysis. Stay in character, continue the existing thread naturally, and avoid switching into profile/policy/report recitals.";
              systemPrompt += `\n\n${visionDirective}`;
            }

            if (constructId === 'lin-001') {
              const userMsg = (message || '').toLowerCase();
              const hasGptCommand = userMsg.includes('/gpt') || userMsg.includes('create a gpt') || userMsg.includes('make a gpt') || userMsg.includes('new gpt') || userMsg.includes('build a gpt');
              const hasDetailedSpecs = (message || '').length > 80 && (userMsg.includes('name') || userMsg.includes('description') || userMsg.includes('instructions') || userMsg.includes('sera') || userMsg.includes('personality'));
              const hasConfirmation = userMsg.includes('confirm') || userMsg.includes('go ahead') || userMsg.includes('proceed') || userMsg.includes('yes') || userMsg.includes('do it') || userMsg.includes('activate');
              if (hasGptCommand || hasDetailedSpecs || hasConfirmation) {
                systemPrompt += `\n\n## MANDATORY GPT CREATION SIGNAL — YOU MUST FOLLOW THIS RULE:
The user is creating a GPT. You MUST include the exact text [OPEN_GPT_CREATOR] at the very end of your response, after your final sentence. This is a hidden system signal — the user cannot see it. It triggers the GPT workshop UI to open.

RULES:
1. If the user gave you detailed specs (name, description, instructions) — acknowledge briefly and END your response with [OPEN_GPT_CREATOR]
2. If the user confirmed or said "go ahead" or "proceed" — acknowledge and END your response with [OPEN_GPT_CREATOR]
3. If the user typed /gpt with details — acknowledge and END your response with [OPEN_GPT_CREATOR]
4. If the user typed just /gpt with no details — ask what kind of GPT they want (do NOT include [OPEN_GPT_CREATOR] yet)

CRITICAL: Do NOT say "Sera GPT is now live" or pretend to create it. You are NOT creating the GPT — the workshop UI does that. Your job is to acknowledge and include the signal so the workshop opens. The signal must appear EXACTLY as: [OPEN_GPT_CREATOR]`;
              } else {
                systemPrompt += `\n\nYou have the ability to help users create custom GPTs. If a user mentions /gpt, creating a GPT, or wants to make a new AI character, help them brainstorm. Once you have enough details (name, description, personality), include [OPEN_GPT_CREATOR] at the very end of your response to open the GPT workshop.`;
              }
            }

            let fbHistoryMessages = [];
            let fb1HistoryRemovedLeakCount = 0;
            let fb1HistoryRemovedInstructionDumpCount = 0;
            let fb1HistoryTailPrunedCount = 0;
            try {
              await loadVVAULTModules();
              const lookupId = buildConversationLookupContext({
                userEmail: req.user?.email || null,
                supabaseUserId: UUID_LOOKUP_RE.test(String(dataOwnerUserId || '').trim())
                  ? dataOwnerUserId
                  : supabaseSessionUserId,
                userId: dataOwnerUserId || req.user?.vvaultUserId || userId,
              });
              if (Array.isArray(enrichedResult?.routeHistoryMessages) && enrichedResult.routeHistoryMessages.length > 0) {
                const validMessages = sanitizeConversationHistory(
                  enrichedResult.routeHistoryMessages,
                  constructId,
                  'fallback1-enriched-context-history',
                );
                fb1HistoryRemovedLeakCount = validMessages.removedLeakCount || 0;
                fb1HistoryRemovedInstructionDumpCount = validMessages.removedInstructionDumpCount || 0;
                fbHistoryMessages = (validMessages.messages || []).slice(-40).map((m) => ({ role: m.role, content: m.content }));
                console.log(`📚 [VVAULT Proxy] Fallback1 using ${fbHistoryMessages.length} locally recovered history messages for ${constructId}`);
              } else if (readConversations && !enrichedResult?.remote_history_skipped) {
                const fbConvos = await readConversations(lookupId, constructId);
                if (fbConvos?.length > 0) {
                  const targetSession = sessionId || threadId || `${constructId}_chat_with_${constructId}`;
                  const allowConstructFallback = !(sessionId || threadId) ||
                    (contextBudget?.transcript_law_evidence_intent &&
                      isTranscriptLawSyntheticGateThread(sessionId || threadId));
                  const targetConvo = fbConvos.find(c =>
                    c.sessionId === targetSession ||
                    (allowConstructFallback && (
                      c.constructId === constructId ||
                      c.constructCallsign === constructId
                    ))
                  ) || (allowConstructFallback ? fbConvos[0] : null);

                  const fbMessages = targetConvo?.messages || [];
                  if (targetConvo) {
                    console.log(`📚 [VVAULT Proxy] Found conversation for ${constructId}: "${targetConvo.title}" with ${fbMessages.length} total messages (from ${fbConvos.length} conversations returned)`);
                  }

                  const validMessages = sanitizeConversationHistory(
                    fbMessages.filter(m => m.content && !m.isDateHeader),
                    constructId,
                    'fallback1-history',
                  );
                  fb1HistoryRemovedLeakCount = validMessages.removedLeakCount || 0;
                  fb1HistoryRemovedInstructionDumpCount = validMessages.removedInstructionDumpCount || 0;

                  const fbRecent = (validMessages.messages || []).slice(-40);
                  fbHistoryMessages = fbRecent.map(m => ({ role: m.role, content: m.content }));
                  console.log(`📚 [VVAULT Proxy] Loaded ${fbHistoryMessages.length} history messages for ${constructId} (filtered from ${(validMessages.messages || []).length} valid messages)`);

                  if (fbHistoryMessages.length > 0 && enrichedResult.memoriesLoaded === 0) {
                    systemPrompt += `\n\n## Conversation Continuity
You have an ongoing relationship with this user. The conversation history below represents your prior interactions.
Reference past exchanges naturally. Remember what the user told you. Maintain emotional and contextual continuity.
Do NOT treat this as a first meeting if there is conversation history.`;
                  }
                } else {
                  console.log(`⚠️ [VVAULT Proxy] No conversations found for ${constructId} with lookupId: ${lookupId}`);
                }
              } else if (enrichedResult?.remote_history_skipped) {
                console.log(`📚 [VVAULT Proxy] Fallback1 skipping remote history load for ${constructId} due to ${enrichedResult.context_recovery_profile || 'bounded context recovery'}`);
              }
            } catch (histErr) {
              console.warn(`⚠️ [VVAULT Proxy] Could not load fallback history:`, histErr.message);
            }

            if (hasImages) {
              if (fbHistoryMessages.length > VISION_HISTORY_LIMIT) {
                fbHistoryMessages = fbHistoryMessages.slice(-VISION_HISTORY_LIMIT);
              }
              const prunedVisionTail = pruneContaminatedHistoryTail(fbHistoryMessages, {
                constructId,
                contextLabel: 'fallback1-vision-history-tail',
                windowSize: Math.max(12, VISION_HISTORY_LIMIT + 4),
              });
              fbHistoryMessages = prunedVisionTail.messages;
              fb1HistoryTailPrunedCount += prunedVisionTail.removed;
              const compactedVisionPrompt = compactSystemPromptForVision(systemPrompt, VISION_SYSTEM_PROMPT_CAP);
              if (compactedVisionPrompt.compacted) {
                systemPrompt = compactedVisionPrompt.prompt;
              }
            }

            let fb1LowComplexityTurn = isLowComplexityTurn(
              message,
              hasImages,
              fbHistoryMessages.length,
              systemPrompt.length
            );
            const fb1RelationalTurn = isRelationalContinuityPrompt(message);
            let fb1ContextMode = 'full_retrieval';
            if (fb1RelationalTurn && fb1LowComplexityTurn && !hasImages) {
              const pruned = pruneContaminatedHistoryTail(fbHistoryMessages, {
                constructId,
                contextLabel: 'fallback1-history-tail',
              });
              fbHistoryMessages = pruned.messages;
              fb1HistoryTailPrunedCount = pruned.removed;
              if (fbHistoryMessages.length > RELATIONAL_HISTORY_LIMIT) {
                fbHistoryMessages = fbHistoryMessages.slice(-RELATIONAL_HISTORY_LIMIT);
              }
              const compactedRelationalPrompt = compactSystemPromptForRelationalTurn(systemPrompt, RELATIONAL_SYSTEM_PROMPT_CAP);
              if (compactedRelationalPrompt.compacted) {
                systemPrompt = compactedRelationalPrompt.prompt;
              }
              fb1LowComplexityTurn = isLowComplexityTurn(
                message,
                hasImages,
                fbHistoryMessages.length,
                systemPrompt.length
              );
              fb1ContextMode = 'recent_chat_only';
            }
            const fallback1GreetingTurnContext = buildRouteGreetingTurnContext({
              message,
              constructId,
              constructDisplayName: gptConfig?.name || constructId,
              gptConfig,
              identityBundle,
              recentMessages: fbHistoryMessages,
              previewMode,
              hasImages,
              isSyntheticContinueTurn,
              evidenceStyle: evidenceStyleTurn,
              memoryQueryDetected: !!enrichedResult.memory_query_detected,
              assignmentQaInput,
              activeOrchestrationProfile,
              isHydroProjectTurn,
              sessionId: sessionId || threadId || `${constructId}_chat_with_${constructId}`,
            });
            if (fallback1GreetingTurnContext?.isGreetingContactTurn) {
              systemPrompt = `${systemPrompt}\n\n${buildGreetingTurnDirective({
                posture: fallback1GreetingTurnContext.posture,
                voiceContext: fallback1GreetingTurnContext.voiceContext,
                constructDisplayName: gptConfig?.name || constructId,
              })}`;
            }
            const fallback1PromptDiagnostics = buildPromptDiagnostics({
              mode: 'fallback_vvault_unavailable',
              enriched: enrichedResult,
              historyCount: fbHistoryMessages.length,
              searchInjectedValue: fb1SearchInjected,
              systemPromptText: systemPrompt,
            });
            console.log('[PROMPT_SOURCE]', {
              ...fallback1PromptDiagnostics,
              history_filtered: {
                leaked_prompt: fb1HistoryRemovedLeakCount,
                instruction_dump: fb1HistoryRemovedInstructionDumpCount,
                relational_tail_pruned: fb1HistoryTailPrunedCount,
              },
              relational_turn: fb1RelationalTurn,
              context_mode: fb1ContextMode,
              vision_mode: hasImages ? (explicitVisionIntent ? 'explicit-analysis' : 'character-first') : 'off',
            });

            // ===== NOVA-001 HOTFIX (Fallback 1): Force away from OpenAI =====
            if (constructId === 'nova-001' && effectiveProvider === 'openai') {
              effectiveProvider = 'openrouter';
              effectiveModel = DEFAULT_OPENROUTER_MODEL;
              console.log(`[NOVA HOTFIX] Fallback1: Overriding openai→openrouter for nova-001`);
            }

            console.log(`🧠 [VVAULT Proxy] Fallback using ${effectiveProvider}:${effectiveModel} for ${constructId}`);
            console.log('[TURN_CONTEXT]', {
              constructId,
              memory_intent: !!enrichedResult.memory_query_detected,
              search_intent: fb1SearchIntent,
              search_injected: fb1SearchInjected,
              history_count: fbHistoryMessages.length,
              history_filtered: {
                leaked_prompt: fb1HistoryRemovedLeakCount,
                instruction_dump: fb1HistoryRemovedInstructionDumpCount,
                relational_tail_pruned: fb1HistoryTailPrunedCount,
              },
              relational_turn: fb1RelationalTurn,
              context_mode: fb1ContextMode,
              provider_used: effectiveProvider,
              mode: 'fallback_vvault_unavailable',
              vision_mode: hasImages ? (explicitVisionIntent ? 'explicit-analysis' : 'character-first') : 'off',
            });

            const fbMsgs = [{ role: "system", content: systemPrompt }, ...fbHistoryMessages, { role: "user", content: message }];
            let completion;
            let aiResponse;
            if (effectiveProvider === 'openai') {
              completion = await openaiClient.chat.completions.create({
                model: effectiveModel,
                messages: fbMsgs,
                max_tokens: 2048,
              });
              aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
            } else if (effectiveProvider === 'ollama') {
              const ollamaHost = getOllamaHost();
              const ollamaResp = await fetch(`${ollamaHost}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: effectiveModel,
                  messages: fbMsgs,
                  stream: false
                })
              });
              if (!ollamaResp.ok) throw new Error(`Ollama error: ${ollamaResp.status}`);
              const ollamaData = await ollamaResp.json();
              aiResponse = ollamaData.message?.content || "I'm sorry, I couldn't generate a response.";
            } else {
              const orClient = openrouter || replitOpenrouter;
              if (!orClient && !openaiClient) {
                throw new Error('No LLM provider available. Configure OPENROUTER_API_KEY or enable Replit AI Integrations.');
              }
              let llmSuccess = false;
              const providerErrors = [];

              if (orClient) {
                const clientLabel = openrouter ? 'OpenRouter' : 'Replit OpenRouter';
                console.log(`[${clientLabel}] Calling`, { model: effectiveModel, user: req.user?.email, historyMessages: fbHistoryMessages.length });
                try {
                  completion = await orClient.chat.completions.create({
                    model: effectiveModel,
                    messages: fbMsgs,
                    max_tokens: 2048,
                  });
                  console.log(`[${clientLabel}] Success`, { finish_reason: completion?.choices?.[0]?.finish_reason });
                  llmSuccess = true;
                } catch (err) {
                  console.error(`[${clientLabel} FAIL]`, { status: err?.status, message: err?.message });
                  providerErrors.push(`${clientLabel}: ${err?.status} ${err?.message}`);

                  // Nova-only rescue path: stay on OpenRouter, swap to a known-available free model.
                  if (
                    !llmSuccess &&
                    constructId === 'nova-001' &&
                    effectiveModel !== 'meta-llama/llama-3.2-3b-instruct:free'
                  ) {
                    try {
                      console.log(`🔄 [VVAULT Proxy] Nova free-model fallback: ${effectiveModel} -> meta-llama/llama-3.2-3b-instruct:free`, { status: err?.status || null });
                      completion = await orClient.chat.completions.create({
                        model: 'meta-llama/llama-3.2-3b-instruct:free',
                        messages: fbMsgs,
                        max_tokens: 2048,
                      });
                      effectiveModel = 'meta-llama/llama-3.2-3b-instruct:free';
                      llmSuccess = true;
                      console.log('[NOVA FREE FALLBACK] Success', { finish_reason: completion?.choices?.[0]?.finish_reason });
                    } catch (novaFallbackErr) {
                      console.error('[NOVA FREE FALLBACK FAIL]', { status: novaFallbackErr?.status, message: novaFallbackErr?.message });
                      providerErrors.push(`Nova free fallback: ${novaFallbackErr?.status} ${novaFallbackErr?.message}`);
                    }
                  }

                  if (replitOpenrouter && orClient !== replitOpenrouter && (err?.status === 401 || err?.status === 403 || err?.status === 404 || err?.status === 429)) {
                    try {
                      console.log(`🔄 [VVAULT Proxy] Trying Replit-managed OpenRouter for ${constructId}`);
                      completion = await replitOpenrouter.chat.completions.create({
                        model: effectiveModel,
                        messages: fbMsgs,
                        max_tokens: 2048,
                      });
                      console.log('[REPLIT OPENROUTER FALLBACK] Success', { finish_reason: completion?.choices?.[0]?.finish_reason });
                      llmSuccess = true;
                    } catch (err2) {
                      console.error('[REPLIT OPENROUTER FALLBACK FAIL]', { status: err2?.status, message: err2?.message });
                      providerErrors.push(`Replit OpenRouter: ${err2?.status} ${err2?.message}`);
                    }
                  }
                }
              }

              // ===== NOVA-001 HOTFIX: Never fall back to OpenAI =====
              if (!llmSuccess && PREFER_LOCAL_MODELS && providerAvailability.ollama) {
                const ollamaHost = getOllamaHost();
                const ollamaModel = getOllamaExecutionModel();
                try {
                  console.log(`🟢 [VVAULT Proxy] Fallback1 local-first: trying Ollama (${ollamaModel}) for ${constructId}`);
                  const ollamaResp = await fetch(`${ollamaHost}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      model: ollamaModel,
                      messages: fbMsgs,
                      stream: false
                    })
                  });
                  if (!ollamaResp.ok) throw new Error(`Ollama ${ollamaResp.status}`);
                  const ollamaData = await ollamaResp.json();
                  aiResponse = ollamaData.message?.content || "I'm sorry, I couldn't generate a response.";
                  effectiveProvider = 'ollama';
                  effectiveModel = ollamaModel;
                  markOllamaExecutionRoute({
                    fallbackUsed: providerErrors.length > 0,
                    localCloudFallbackState: providerErrors.length > 0 ? 'fallback_to_ollama' : 'local_first',
                  });
                  llmSuccess = true;
                  console.log('[OLLAMA LOCAL-FIRST1] Success');
                } catch (ollamaErr) {
                  console.error('[OLLAMA LOCAL-FIRST1 FAIL]', { message: ollamaErr?.message });
                  providerErrors.push(`Ollama: ${ollamaErr?.message}`);
                }
              }

              if (!llmSuccess && openaiClient && constructId !== 'nova-001') {
                try {
                  console.log(`🔄 [VVAULT Proxy] All OpenRouter failed, trying OpenAI for ${constructId}`);
                  completion = await openaiClient.chat.completions.create({
                    model: 'gpt-4.1-mini',
                    messages: fbMsgs,
                    max_tokens: 2048,
                  });
                  console.log('[OPENAI FALLBACK] Success', { finish_reason: completion?.choices?.[0]?.finish_reason });
                  effectiveProvider = 'openai';
                  effectiveModel = 'gpt-4.1-mini';
                  llmSuccess = true;
                } catch (err3) {
                  console.error('[OPENAI FALLBACK FAIL]', { status: err3?.status, message: err3?.message });
                  providerErrors.push(`OpenAI: ${err3?.status} ${err3?.message}`);
                }
              } else if (!llmSuccess && constructId === 'nova-001') {
                console.log(`[NOVA HOTFIX] Fallback1: Blocked OpenAI last-resort for nova-001`);
              }

              if (!llmSuccess && !PREFER_LOCAL_MODELS && providerAvailability.ollama) {
                const ollamaHost = getOllamaHost();
                const ollamaModel = getOllamaExecutionModel();
                try {
                  console.log(`🟢 [VVAULT Proxy] Fallback1: cloud providers failed, trying Ollama (${ollamaModel}) for ${constructId}`);
                  const ollamaResp = await fetch(`${ollamaHost}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      model: ollamaModel,
                      messages: fbMsgs,
                      stream: false
                    })
                  });
                  if (!ollamaResp.ok) throw new Error(`Ollama ${ollamaResp.status}`);
                  const ollamaData = await ollamaResp.json();
                  aiResponse = ollamaData.message?.content || "I'm sorry, I couldn't generate a response.";
                  effectiveProvider = 'ollama';
                  effectiveModel = ollamaModel;
                  markOllamaExecutionRoute({ fallbackUsed: true, localCloudFallbackState: 'fallback_to_ollama' });
                  llmSuccess = true;
                  console.log('[OLLAMA FALLBACK1] Success');
                } catch (ollamaErr) {
                  console.error('[OLLAMA FALLBACK1 FAIL]', { message: ollamaErr?.message });
                  providerErrors.push(`Ollama: ${ollamaErr?.message}`);
                }
              }

              if (!llmSuccess) {
                throw new Error(`All LLM providers failed: ${providerErrors.join(' | ')}`);
              }
              if (!aiResponse) {
                aiResponse = completion?.choices?.[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
              }
            }

            console.log(`✅ [VVAULT Proxy] ${effectiveProvider} fallback successful for ${constructId}`);
            if (constructId === 'lin-001') {
              const hasSignal = (aiResponse || '').includes('[OPEN_GPT_CREATOR]');
              console.log(`🔍 [GPT Signal] Lin response has [OPEN_GPT_CREATOR]: ${hasSignal}, response length: ${(aiResponse || '').length}`);
              if (!hasSignal && (message || '').toLowerCase().match(/\/gpt|confirm|go ahead|proceed/)) {
                console.warn(`⚠️ [GPT Signal] Model did NOT include signal despite GPT-related message. Injecting signal.`);
                aiResponse = (aiResponse || '').trimEnd() + '\n\n[OPEN_GPT_CREATOR]';
              }
            }

            const fallbackPreviousAssistant = fbHistoryMessages
              .slice()
              .reverse()
              .find(m => m.role === 'assistant')?.content || null;
            const fallbackPostProcess = await applyResponsePostProcessing({
              aiResponse,
              previousAssistant: fallbackPreviousAssistant,
              buildMessages,
              userMessage: message,
              history: fbHistoryMessages,
              constructId,
              constructDisplayName: gptConfig?.name || constructId,
              regenClient: replitOpenrouter || openaiClient || openrouter,
              regenModel: replitOpenrouter ? DEFAULT_OPENROUTER_MODEL : (openaiClient ? 'gpt-4.1-mini' : effectiveModel || DEFAULT_OPENROUTER_MODEL),
              fallbackText: buildIdentityDriftFallback(message, constructId),
              recitalRewriter: rewriteRecitalIfNeeded,
              identityGuard: (currentText) => enforceFirstPersonIdentity({
                aiResponse: currentText,
                userMessage: message,
                constructId,
                providerAvailability,
                roleplayEnabled: gptConfig?.roleplayEnabled === true,
                latestUserBeforeCurrent: getLastUserMessageFromHistory(fbHistoryMessages),
              }),
              cutoffRewriter: (currentText) => rewriteCutoffViolationIfNeeded(
                currentText,
                !!enrichedResult.memory_query_detected,
                enrichedResult.evidence_count || 0,
              ),
              evidencePreview: enrichedResult.memory_evidence_preview,
              greetingTurnContext: fallback1GreetingTurnContext,
            });
            aiResponse = fallbackPostProcess.aiResponse;
            aiResponse = applyHumanConversationGuard(aiResponse, {
              userMessage: message,
              memoryIntent: !!enrichedResult?.memory_query_detected,
              evidenceCount: Number(enrichedResult?.evidence_count || 0),
              constructId,
              constructDisplayName: gptConfig?.name || constructId,
              userName: req.user?.name || req.user?.given_name || 'Devon',
              greetingTurnContext: fallback1GreetingTurnContext,
            });
            const fallback1IdentityCoherenceInitial = evaluateIdentityCoherence({
              userMessage: message,
              aiResponse,
              constructId,
              constructDisplayName: gptConfig?.name || constructId,
              requestedSeat,
              evidencePreview: enrichedResult?.memory_evidence_preview,
              greetingTurnContext: fallback1GreetingTurnContext,
            });
            let fallback1IdentityCoherence = fallback1IdentityCoherenceInitial;
            let fallback1IdentityCoherenceRepair = {
              attempted: false,
              applied: false,
              provider: null,
              model: null,
              initial_status: fallback1IdentityCoherenceInitial.status,
              final_status: fallback1IdentityCoherenceInitial.status,
              failure_reason: null,
            };
            let fallback1IdentityCoherenceBlocked = false;
            const fallback1IdentityCoherenceFailureMessage = 'Identity/coherence guard blocked this assistant draft before canonical persistence.';
            if (fallback1IdentityCoherenceInitial.status === 'fail') {
              const repairAttempt = await runIdentityCoherenceRepair({
                systemPrompt,
                historyMessages: fbHistoryMessages,
                userMessage: message,
                failedResponse: aiResponse,
                grade: fallback1IdentityCoherenceInitial,
                constructId,
                constructDisplayName: gptConfig?.name || constructId,
                provider: effectiveProvider,
                model: effectiveModel,
                generationParams,
                evidencePreview: enrichedResult?.memory_evidence_preview,
                gptConfig,
                providerAvailability,
                routingMode: fallbackRoutingMode,
                requestedSeat,
                hasImages,
              });
              fallback1IdentityCoherenceRepair = {
                attempted: true,
                applied: false,
                provider: repairAttempt.provider || effectiveProvider || null,
                model: repairAttempt.model || effectiveModel || null,
                seat: repairAttempt.seat || requestedSeat || null,
                route_source: repairAttempt.routeSource || null,
                initial_status: fallback1IdentityCoherenceInitial.status,
                final_status: 'fail',
                failure_reason: repairAttempt.error || null,
                initial_reasons: fallback1IdentityCoherenceInitial.reasons || [],
              };
              if (repairAttempt.ok && repairAttempt.text && repairAttempt.text.trim()) {
                const repairedGrade = evaluateIdentityCoherence({
                  userMessage: message,
                  aiResponse: repairAttempt.text.trim(),
                  constructId,
                  constructDisplayName: gptConfig?.name || constructId,
                  requestedSeat,
                  evidencePreview: enrichedResult?.memory_evidence_preview,
                  greetingTurnContext: fallback1GreetingTurnContext,
                });
                fallback1IdentityCoherence = repairedGrade;
                fallback1IdentityCoherenceRepair.final_status = repairedGrade.status;
                fallback1IdentityCoherenceRepair.final_reasons = repairedGrade.reasons || [];
                if (repairedGrade.status !== 'fail') {
                  aiResponse = repairAttempt.text.trim();
                  fallback1IdentityCoherenceRepair.applied = true;
                } else {
                  fallback1IdentityCoherenceBlocked = true;
                  fallback1IdentityCoherenceRepair.failure_reason = 'repair_failed_identity_coherence_grade';
                }
              } else {
                fallback1IdentityCoherenceBlocked = true;
              }
            }
            console.log('[TURN_CONTEXT]', {
              constructId,
              memory_intent: !!enrichedResult.memory_query_detected,
              search_intent: fb1SearchIntent,
              search_injected: fb1SearchInjected,
              history_count: fbHistoryMessages.length,
              history_filtered: {
                leaked_prompt: fb1HistoryRemovedLeakCount,
                instruction_dump: fb1HistoryRemovedInstructionDumpCount,
                relational_tail_pruned: fb1HistoryTailPrunedCount,
              },
              relational_turn: fb1RelationalTurn,
              context_mode: fb1ContextMode,
              provider_used: effectiveProvider,
              path_mode: 'fallback_vvault_unavailable',
              persona_applied: true,
              retrieval_used: (enrichedResult.evidence_count ?? 0) > 0,
              recital_detected: fallbackPostProcess.recitalDetected,
              recital_rewrite_applied: fallbackPostProcess.recitalRewriteApplied,
              persona_drift_detected: fallbackPostProcess.personaDriftDetected,
              persona_regen_applied: fallbackPostProcess.personaRegenApplied,
              repeat_detected: fallbackPostProcess.repeatDetected,
              auth_recovered: authRecovered,
              vision_mode: hasImages ? (explicitVisionIntent ? 'explicit-analysis' : 'character-first') : 'off',
            });
            console.log('[IDENTITY_GUARD]', {
              constructId,
              mode: 'fallback_vvault_unavailable',
              relational_turn: fb1RelationalTurn,
              context_mode: fb1ContextMode,
              identity_drift_detected: fallbackPostProcess.identityDriftDetected,
              identity_rewrite_applied: fallbackPostProcess.identityRewriteApplied,
              identity_fallback_applied: fallbackPostProcess.identityFallbackApplied,
            });

            // NOTE: Frontend (Layout.tsx) handles message persistence via conversationManager.addMessageToConversation()
            // Do NOT writeTranscript here — it causes duplicate messages in the database and UI
            const fallback1SearchBackedPayload = buildSearchBackedAssistantPayload({
              aiResponse,
              searchResults: fb1SearchResults,
              housingSearch: fb1SearchHousing,
            });
            aiResponse = fallback1SearchBackedPayload.content;
            const fallback1ResponsePackets = fallback1SearchBackedPayload.packets;
            const fallback1SearchInspectability = buildSearchInspectabilityReceipt({
              searchVertical: fb1SearchHousing ? 'housing' : 'web',
              searchResults: fb1SearchResults,
              housingSearch: fb1SearchHousing,
              citations: fallback1SearchBackedPayload.citations,
              packets: fallback1ResponsePackets,
            });
            const fallback1RuntimeReceipt = {
              created_at: new Date().toISOString(),
              user_id: userId || null,
              auth: authReceipt,
              construct_id: constructId,
              effective_construct_id: constructId,
              effective_construct_name: constructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase()),
              orchestration_mode: gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
              route_mode: 'vvault_message_fallback',
              persistence_owner: fallback1IdentityCoherenceBlocked ? 'blocked_identity_coherence' : 'layout',
              identity: {
                source: enrichedResult.phaseTiming?.identity?.source || 'unknown',
                base_prompt_source: enrichedResult.phaseTiming?.basePromptSource || 'unknown',
                conditioning_appended: !!enrichedResult.phaseTiming?.conditioningInjected,
                identity_bundle_hash: enrichedResult.identity_bundle_hash || null,
                effective_construct_id: constructId,
                effective_construct_name: constructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase()),
                selected_construct_id: canonicalConstructId || constructId,
                raw_construct_id: rawConstructId,
              },
              policy: enrichedResult.runtimePolicy || null,
              preview: {
                preview_mode: Boolean(previewMode),
                skip_persistence: true,
                effective_construct_id: constructId,
                selected_construct_id: canonicalConstructId || constructId,
                raw_construct_id: rawConstructId,
                identity_source: enrichedResult.phaseTiming?.identity?.source || 'unknown',
                base_prompt_source: enrichedResult.phaseTiming?.basePromptSource || 'unknown',
                draft_overlay_applied: Boolean(enrichedResult.phaseTiming?.preview?.draftOverlayApplied),
                draft_overlay_keys: enrichedResult.phaseTiming?.preview?.draftOverlayKeys || [],
                preview_overlay_state: enrichedResult.phaseTiming?.preview?.draftOverlayApplied ? 'applied_bounded_overlay' : 'not_applied',
                suppressed_system_prompt_override: Boolean(enrichedResult.phaseTiming?.preview?.suppressedSystemPromptOverride),
              },
              memory: {
                retrieval_ran: !!enrichedResult.memory_retrieval_ran,
                memory_query_detected: !!enrichedResult.memory_query_detected,
                evidence_count: enrichedResult.evidence_count || 0,
                ledger_sessions: enrichedResult.ledgerSessions || 0,
                memory_source: enrichedResult.continuityMemorySearch?.source || enrichedResult.phaseTiming?.memorySearch?.source || 'runtime_context_builder',
                context_recovery_profile: enrichedResult.context_recovery_profile || 'standard',
                history_source: enrichedResult.history_source || 'none',
                remote_history_skipped: Boolean(enrichedResult.remote_history_skipped),
                sources: enrichedResult.continuityMemorySearch || null,
                memory_profile: gptConfig?.memoryProfile || gptConfig?.memory_profile || 'off',
              },
              provider: {
                provider: effectiveProvider || null,
                model: effectiveModel || null,
                selection_policy: 'preference',
                lin_harmony_policy: 'intent_routed',
                lin_seat_canon: LIN_THREE_I_CANON_VERSION,
                performance_model_switch: false,
                requested_seat: requestedSeat,
                requested_canonical_seat: getLinSeatCanon(requestedSeat).canonicalSeat,
                seat_plan: {
                  policy: 'intent_routed',
                  canon: LIN_THREE_I_CANON_VERSION,
                  requested_seat: requestedSeat,
                  requested_canonical_seat: getLinSeatCanon(requestedSeat).canonicalSeat,
                  selected_provider: effectiveProvider || null,
                  selected_model: effectiveModel || null,
                  lin_default_model: modelResolution.mode === 'lin'
                    ? getLinDefaultModelForSeat(requestedSeat)
                    : null,
                  fallback_reason: 'vvault_unavailable',
                },
                model_source: modelSource,
                source: modelSource,
                mode: modelResolution.mode || (gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown'),
                requested_provider: modelResolution.requestedProvider || null,
                requested_model: modelResolution.requestedModel || null,
                configured_model: modelResolution.configuredModel || null,
                suppressed_configured_model: modelResolution.suppressedConfiguredModel || null,
                routing_override: !!modelResolution.routingOverride,
                seat_defaults_or_overrides: effectiveSeatDefaultsOrOverrides || null,
                local_first_used: effectiveLocalFirstUsed,
                local_cloud_fallback_state: (providerTrace.fallback_used || effectiveRouteFallbackUsed)
                  ? (effectiveLocalCloudFallbackState || 'fallback_used')
                  : effectiveLocalCloudFallbackState || modelResolution.localCloudFallbackState || (effectiveLocalFirstUsed
                    ? 'local_first'
                    : modelResolution.routingOverride
                      ? 'manual_routing_override'
                      : 'direct'),
                fallback_used: true,
                final_provider: providerTrace.final_provider || effectiveProvider || null,
              },
              fidelity: {
                identity_drift_detected: !!fallbackPostProcess.identityDriftDetected,
                identity_rewrite_applied: !!fallbackPostProcess.identityRewriteApplied,
                identity_fallback_applied: !!fallbackPostProcess.identityFallbackApplied,
                persona_drift_detected: !!fallbackPostProcess.personaDriftDetected,
                persona_regen_applied: !!fallbackPostProcess.personaRegenApplied,
                identity_coherence: {
                  status: fallback1IdentityCoherence.status,
                  identity_status: fallback1IdentityCoherence.identityStatus,
                  coherence_status: fallback1IdentityCoherence.coherenceStatus,
                  reasons: fallback1IdentityCoherence.reasons || [],
                  signals: fallback1IdentityCoherence.signals || [],
                  violations: fallback1IdentityCoherence.violations || [],
                  repairable: !!fallback1IdentityCoherence.repairable,
                  repair_attempted: !!fallback1IdentityCoherenceRepair.attempted,
                  repair_applied: !!fallback1IdentityCoherenceRepair.applied,
                  repair: fallback1IdentityCoherenceRepair,
                  blocked_canonical_persistence: !!fallback1IdentityCoherenceBlocked,
                  persist_canonical: !fallback1IdentityCoherenceBlocked,
                  owner_file: fallback1IdentityCoherence.ownerFile || 'server/lib/identityCoherenceGuard.js',
                  source_anchor: fallback1IdentityCoherence.sourceAnchor || 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
                },
              },
            };
            if (fallback1SearchInspectability?.search || fallback1SearchInspectability?.housing) {
              fallback1RuntimeReceipt.research = {
                search_injected: fb1SearchInjected,
                search_intent_reason: fb1SearchIntent,
                ...(fallback1SearchInspectability?.search
                  ? { search: fallback1SearchInspectability.search }
                  : {}),
                ...(fallback1SearchInspectability?.housing
                  ? { housing: fallback1SearchInspectability.housing }
                  : {}),
              };
            }
            const fallback1ValidatorDebug = {
              memory_retrieval_ran: !!enrichedResult.memory_retrieval_ran,
              memory_query_detected: !!enrichedResult.memory_query_detected,
              evidence_count: enrichedResult.evidence_count || 0,
              identity_drift_detected: !!fallbackPostProcess.identityDriftDetected,
              identity_rewrite_applied: !!fallbackPostProcess.identityRewriteApplied,
              identity_fallback_applied: !!fallbackPostProcess.identityFallbackApplied,
              cutoff_violation_detected: !!fallbackPostProcess.cutoffViolationDetected,
              rewrite_applied: !!fallbackPostProcess.cutoffRewriteApplied,
              identity_coherence: fallback1IdentityCoherence,
              identity_coherence_repair: fallback1IdentityCoherenceRepair,
            };
            const fallback1Checklist = buildOrchestrationChecklist({
              userId,
              user: req.user,
              constructId,
              threadId: sessionId || threadId || `${constructId}_chat_with_${constructId}`,
              userMessage: message,
              gptConfig,
              enrichedContext: enrichedResult,
              retrievalDiagnostics,
              promptDiagnostics: fallback1PromptDiagnostics,
              providerTrace,
              validatorDebug: fallback1ValidatorDebug,
              runtimeReceipt: fallback1RuntimeReceipt,
              contextMode: fb1ContextMode,
              relationalTurn: fb1RelationalTurn,
              lowComplexityTurn: fb1LowComplexityTurn,
              hasImages,
              skipPersistence: true,
              responseStatus: fallback1IdentityCoherenceBlocked ? 'identity_coherence_failed' : 'fallback_vvault_unavailable',
            });

            if (fallback1IdentityCoherenceBlocked) {
              return res.status(422).json({
                success: false,
                ok: false,
                error: 'IDENTITY_COHERENCE_FAILED',
                message: fallback1IdentityCoherenceFailureMessage,
                response: fallback1IdentityCoherenceFailureMessage,
                construct_id: constructId,
                fallback: true,
                source: effectiveProvider,
                model: effectiveModel,
                provider_used: effectiveProvider,
                runtime_receipt: fallback1RuntimeReceipt,
                orchestration_checklist: fallback1Checklist,
                has_images: hasImages,
                tool_trace: mergeToolTrace(drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`), enrichedContext),
                ...(process.env.SHOW_DEV_INFO === 'true' ? { provider_trace: providerTrace, retrieval_diagnostics: retrievalDiagnostics, prompt_diagnostics: fallback1PromptDiagnostics } : {})
              });
            }

            return res.json({
              success: true,
              response: aiResponse,
              packets: fallback1ResponsePackets,
              construct_id: constructId,
              fallback: true,
              source: effectiveProvider,
              model: effectiveModel,
              provider_forced: constructId === 'nova-001',
              provider_used: effectiveProvider,
              runtime_receipt: fallback1RuntimeReceipt,
              orchestration_checklist: fallback1Checklist,
              has_images: hasImages,
              tool_trace: mergeToolTrace(drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`), enrichedContext),
              ...(process.env.SHOW_DEV_INFO === 'true' ? { provider_trace: providerTrace, retrieval_diagnostics: retrievalDiagnostics, prompt_diagnostics: fallback1PromptDiagnostics } : {})
            });
          } catch (fallbackError) {
            console.error(`❌ [VVAULT Proxy] LLM fallback failed:`, fallbackError);
            return res.status(503).json({
              success: false,
              error: "Both VVAULT and LLM fallback failed",
              details: fallbackError.message
            });
          }
        }

        return res.status(vvaultResponse.status).json({
          success: false,
          error: `VVAULT API error: ${vvaultResponse.status}`,
          details: errorText
        });
      }

      const data = await vvaultResponse.json();

      console.log(`✅ [VVAULT Proxy] Got response from VVAULT for ${constructId}:`, {
        success: data.success,
        responseLength: data.response?.length || 0
      });

      const drainedEvents = drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`);
      const mergedEvents = mergeToolTrace(drainedEvents, enrichedContext);
      data.tool_trace = mergedEvents.length > 0 ? mergedEvents : (data.tool_trace || []);
      const proxyIdentityCoherenceInitial = evaluateIdentityCoherence({
        userMessage: message,
        aiResponse: data.response || '',
        constructId,
        constructDisplayName: (gptConfigForVVAULT || gptConfig)?.name || constructId,
        requestedSeat,
        evidencePreview: enrichedContext?.memory_evidence_preview,
        greetingTurnContext,
      });
      let proxyIdentityCoherence = proxyIdentityCoherenceInitial;
      let proxyIdentityCoherenceRepair = {
        attempted: false,
        applied: false,
        provider: null,
        model: null,
        initial_status: proxyIdentityCoherenceInitial.status,
        final_status: proxyIdentityCoherenceInitial.status,
        failure_reason: null,
      };
      let proxyIdentityCoherenceBlocked = false;
      const proxyIdentityCoherenceFailureMessage = 'Identity/coherence guard blocked this assistant draft before canonical persistence.';
      if (proxyIdentityCoherenceInitial.status === 'fail') {
        const repairAttempt = await runIdentityCoherenceRepair({
          systemPrompt,
          historyMessages: conversationHistoryMessages,
          userMessage: message,
          failedResponse: data.response || '',
          grade: proxyIdentityCoherenceInitial,
          constructId,
          constructDisplayName: (gptConfigForVVAULT || gptConfig)?.name || constructId,
          provider: effectiveProvider,
          model: effectiveModel,
          generationParams,
          evidencePreview: enrichedContext?.memory_evidence_preview,
          gptConfig: gptConfigForVVAULT || gptConfig,
          providerAvailability,
          routingMode,
          requestedSeat,
          hasImages,
        });
        proxyIdentityCoherenceRepair = {
          attempted: true,
          applied: false,
          provider: repairAttempt.provider || effectiveProvider || null,
          model: repairAttempt.model || effectiveModel || null,
          seat: repairAttempt.seat || requestedSeat || null,
          route_source: repairAttempt.routeSource || null,
          initial_status: proxyIdentityCoherenceInitial.status,
          final_status: 'fail',
          failure_reason: repairAttempt.error || null,
          initial_reasons: proxyIdentityCoherenceInitial.reasons || [],
        };
        if (repairAttempt.ok && repairAttempt.text && repairAttempt.text.trim()) {
          const repairedGrade = evaluateIdentityCoherence({
            userMessage: message,
            aiResponse: repairAttempt.text.trim(),
            constructId,
            constructDisplayName: (gptConfigForVVAULT || gptConfig)?.name || constructId,
            requestedSeat,
            evidencePreview: enrichedContext?.memory_evidence_preview,
            greetingTurnContext,
          });
          proxyIdentityCoherence = repairedGrade;
          proxyIdentityCoherenceRepair.final_status = repairedGrade.status;
          proxyIdentityCoherenceRepair.final_reasons = repairedGrade.reasons || [];
          if (repairedGrade.status !== 'fail') {
            data.response = repairAttempt.text.trim();
            proxyIdentityCoherenceRepair.applied = true;
          } else {
            proxyIdentityCoherenceBlocked = true;
            proxyIdentityCoherenceRepair.failure_reason = 'repair_failed_identity_coherence_grade';
          }
        } else {
          proxyIdentityCoherenceBlocked = true;
        }
      }
      const proxyDefaultRuntimeReceipt = {
        created_at: new Date().toISOString(),
        user_id: userId || null,
        auth: authReceipt,
        construct_id: constructId,
        effective_construct_id: constructId,
        effective_construct_name: constructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase()),
        orchestration_mode: (gptConfigForVVAULT || gptConfig)?.orchestrationMode || (gptConfigForVVAULT || gptConfig)?.orchestration_mode || 'unknown',
        route_mode: 'vvault_message',
        persistence_owner: proxyIdentityCoherenceBlocked ? 'blocked_identity_coherence' : 'layout',
        identity: {
          effective_construct_id: constructId,
          effective_construct_name: constructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase()),
          selected_construct_id: canonicalConstructId || constructId,
          raw_construct_id: rawConstructId,
        },
        policy: enrichedContext.runtimePolicy || null,
        preview: {
          preview_mode: Boolean(previewMode),
          skip_persistence: true,
          effective_construct_id: constructId,
          selected_construct_id: canonicalConstructId || constructId,
          raw_construct_id: rawConstructId,
          draft_overlay_applied: false,
          preview_overlay_state: 'proxy_unreported',
          suppressed_system_prompt_override: false,
        },
        memory: {
          retrieval_ran: !!enrichedContext.memory_retrieval_ran,
          memory_query_detected: !!enrichedContext.memory_query_detected,
          evidence_count: enrichedContext.evidence_count || 0,
          memory_profile: (gptConfigForVVAULT || gptConfig)?.memoryProfile || (gptConfigForVVAULT || gptConfig)?.memory_profile || 'off',
        },
        provider: {
          provider: 'vvault_proxy',
          model: configuredModelForVVAULT || null,
          model_source: 'vvault_proxy',
          source: 'vvault_proxy',
          mode: (gptConfigForVVAULT || gptConfig)?.orchestrationMode || (gptConfigForVVAULT || gptConfig)?.orchestration_mode || 'unknown',
          requested_provider: null,
          requested_model: null,
          configured_model: configuredModelForVVAULT || null,
          suppressed_configured_model: null,
          routing_override: false,
          seat_defaults_or_overrides: 'vvault_proxy',
          local_first_used: false,
          local_cloud_fallback_state: 'proxy_unreported',
          fallback_used: false,
          final_provider: 'vvault_proxy',
        },
        fidelity: {},
      };
      data.runtime_receipt = {
        ...proxyDefaultRuntimeReceipt,
        ...(data.runtime_receipt || {}),
        provider: {
          ...proxyDefaultRuntimeReceipt.provider,
          ...(data.runtime_receipt?.provider || {}),
        },
        memory: {
          ...proxyDefaultRuntimeReceipt.memory,
          ...(data.runtime_receipt?.memory || {}),
        },
        fidelity: {
          ...(data.runtime_receipt?.fidelity || {}),
          identity_coherence: {
            status: proxyIdentityCoherence.status,
            identity_status: proxyIdentityCoherence.identityStatus,
            coherence_status: proxyIdentityCoherence.coherenceStatus,
            reasons: proxyIdentityCoherence.reasons || [],
            signals: proxyIdentityCoherence.signals || [],
            violations: proxyIdentityCoherence.violations || [],
            repairable: !!proxyIdentityCoherence.repairable,
            repair_attempted: !!proxyIdentityCoherenceRepair.attempted,
            repair_applied: !!proxyIdentityCoherenceRepair.applied,
            repair: proxyIdentityCoherenceRepair,
            blocked_canonical_persistence: !!proxyIdentityCoherenceBlocked,
            persist_canonical: !proxyIdentityCoherenceBlocked,
            owner_file: proxyIdentityCoherence.ownerFile || 'server/lib/identityCoherenceGuard.js',
            source_anchor: proxyIdentityCoherence.sourceAnchor || 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
          },
        },
      };
      data.runtime_receipt.provider = {
        ...data.runtime_receipt.provider,
        selection_policy: 'preference',
        lin_harmony_policy: 'intent_routed',
        lin_seat_canon: LIN_THREE_I_CANON_VERSION,
        performance_model_switch: false,
        requested_seat: requestedSeat,
        requested_canonical_seat: getLinSeatCanon(requestedSeat).canonicalSeat,
        seat_plan: {
          policy: 'intent_routed',
          canon: LIN_THREE_I_CANON_VERSION,
          requested_seat: requestedSeat,
          requested_canonical_seat: getLinSeatCanon(requestedSeat).canonicalSeat,
          selected_provider: data.runtime_receipt.provider.final_provider || data.runtime_receipt.provider.provider || 'vvault_proxy',
          selected_model: data.runtime_receipt.provider.model || configuredModelForVVAULT || null,
        },
      };
      if (!data.orchestration_checklist || proxyIdentityCoherenceBlocked) {
        data.orchestration_checklist = buildOrchestrationChecklist({
          userId,
          user: req.user,
          constructId,
          threadId: effectiveSessionId,
          userMessage: message,
          gptConfig: gptConfigForVVAULT || gptConfig,
          enrichedContext,
          retrievalDiagnostics,
          promptDiagnostics: mainPromptDiagnostics,
          providerTrace: data.provider_trace || { final_provider: 'vvault_proxy', fallback_used: false },
          runtimeReceipt: data.runtime_receipt,
          contextMode,
          relationalTurn,
          lowComplexityTurn,
          hasImages,
          skipPersistence: true,
          responseStatus: proxyIdentityCoherenceBlocked ? 'identity_coherence_failed' : 'vvault_proxy',
        });
      }
      if (proxyIdentityCoherenceBlocked) {
        return res.status(422).json({
          success: false,
          ok: false,
          error: 'IDENTITY_COHERENCE_FAILED',
          message: proxyIdentityCoherenceFailureMessage,
          response: proxyIdentityCoherenceFailureMessage,
          construct_id: constructId,
          provider_used: data.runtime_receipt.provider?.final_provider || data.runtime_receipt.provider?.provider || 'vvault_proxy',
          model: data.runtime_receipt.provider?.model || configuredModelForVVAULT || null,
          runtime_receipt: data.runtime_receipt,
          orchestration_checklist: data.orchestration_checklist,
          has_images: hasImages,
          tool_trace: data.tool_trace || [],
        });
      }
      return res.json(data);
    } catch (fetchError) {
      clearTimeout(timeout);

      if (fetchError.name === 'AbortError') {
        console.error(`❌ [VVAULT Proxy] Request timed out for ${constructId}`);
        return res.status(504).json({
          success: false,
          error: "VVAULT API request timed out"
        });
      }

      // FALLBACK: Use configured LLM provider when VVAULT is unreachable
      console.log(`🔄 [VVAULT Proxy] VVAULT unreachable, falling back to local LLM for ${constructId}`);

      try {
        // Fetch GPT config and resolve model using GPTCreator as source of truth
        let gptConfig = null;
        try {
          gptConfig = await gptManager.getGPTByCallsign(constructId);
        } catch (e) { /* ignore */ }

        const providerAvailability = await buildProviderAvailability();
        const fallbackRoutingMode = linearTranscriptLawGate === true || zenOrdinaryVoiceGate === true || isLinOrchestratedConstruct(constructId) || shouldForceProtectedZenLinMode({
          constructId,
          userMessage: message,
          requestedSeat,
          previewMode,
          hasImages,
          codingMode: false,
        })
          ? 'lin'
          : normalizeOrchestrationMode(gptConfig, {
              defaultMode: isLinOrchestratedConstruct(constructId) ? 'lin' : 'custom',
            });
        const modelResolution = resolveModelForGPT(
          gptConfig,
          providerAvailability,
          {
            seat: requestedSeat,
            mode: fallbackRoutingMode,
            forceMode: fallbackRoutingMode === 'lin' ? 'lin' : null,
            constructId,
            userMessage: message,
            previewMode,
            hasImages,
            codingMode: false,
          },
        );
        if (modelResolution.error) throw new Error(modelResolution.error);
        let { provider: effectiveProvider, model: effectiveModel, source: modelSource } = modelResolution;
        console.log("[MODEL_RESOLUTION]", {
          construct: gptConfig?.constructCallsign || gptConfig?.construct_callsign || constructId,
          provider: effectiveProvider,
          model: effectiveModel,
          source: modelSource,
          routingOverride: !!modelResolution.routingOverride,
          localFirstUsed: !!modelResolution.localFirstUsed,
          requestedSeat,
          seatDefaultsOrOverrides: modelResolution.seatDefaultsOrOverrides,
          preferLocalModels: PREFER_LOCAL_MODELS
        });

        const enrichedBuild2 = await buildEnrichedContextPromptWithRecovery({
          res,
          authReceipt,
          userId: dataOwnerUserId,
          user: req.user,
          constructId,
          rawConstructId,
          canonicalConstructId,
          message,
          gptConfig,
          threadId,
          sessionId,
          timezone: req.headers['x-user-timezone'] || null,
          systemPromptOverride: null,
          previewMode,
          previewDraft: effectivePreviewDraft,
          suppressedSystemPromptOverride: previewSystemPromptOverrideSuppressed,
          identityBundle,
          requestedSeat,
          hasImages,
          skipPersistence,
          contextBudgetProfile: contextBudget?.profile,
          codingIntent: codingMode,
          policyOrReceiptIntent: contextBudget?.policy_or_receipt_intent,
          runtimeTurnState: routeTurnEnvelope.runtimeTurnState,
          continuityClass: routeTurnEnvelope.continuityClass,
          continuityResume: routeTurnEnvelope.continuityResume,
        });
        if (!enrichedBuild2) return;
        const { enrichedContext: enrichedResult2, systemPrompt: enrichedSystemPrompt } = enrichedBuild2;
        let systemPrompt = enrichedSystemPrompt;

        let fb2SearchIntent = 'not_evaluated';
        let fb2SearchInjected = false;
        let fb2SearchResults = null;
        let fb2SearchHousing = null;
        const {
          enhancedPrompt: fb2SearchPrompt,
          searchResults: fb2SearchResultsResolved,
          housing: fb2SearchHousingResolved,
          intent_reason: fb2SearchIntentResolved,
          search_injected: fb2SearchInjectedResolved,
        } = await injectSearchContext(message, systemPrompt, { explicitOnly: true });
        systemPrompt = fb2SearchPrompt;
        fb2SearchResults = fb2SearchResultsResolved || null;
        fb2SearchHousing = fb2SearchHousingResolved || null;
        fb2SearchIntent = fb2SearchIntentResolved || fb2SearchIntent;
        fb2SearchInjected = fb2SearchInjectedResolved === true;
        if (hasImages) {
          const visionDirective = explicitVisionIntent
            ? "INTERNAL DIRECTIVE: The user explicitly requested image analysis. Analyze the image while staying fully in character and relationally grounded."
            : "INTERNAL DIRECTIVE: The user shared an image without explicitly asking for analysis. Stay in character, continue the existing thread naturally, and avoid switching into profile/policy/report recitals.";
          systemPrompt += `\n\n${visionDirective}`;
        }

        if (constructId === 'lin-001') {
          const userMsg2 = (message || '').toLowerCase();
          const hasGptCommand2 = userMsg2.includes('/gpt') || userMsg2.includes('create a gpt') || userMsg2.includes('make a gpt') || userMsg2.includes('new gpt') || userMsg2.includes('build a gpt');
          const hasDetailedSpecs2 = (message || '').length > 80 && (userMsg2.includes('name') || userMsg2.includes('description') || userMsg2.includes('instructions') || userMsg2.includes('personality'));
          const hasConfirmation2 = userMsg2.includes('confirm') || userMsg2.includes('go ahead') || userMsg2.includes('proceed') || userMsg2.includes('yes') || userMsg2.includes('do it') || userMsg2.includes('activate');
          if (hasGptCommand2 || hasDetailedSpecs2 || hasConfirmation2) {
            systemPrompt += `\n\n## MANDATORY GPT CREATION SIGNAL — YOU MUST FOLLOW THIS RULE:
The user is creating a GPT. You MUST include the exact text [OPEN_GPT_CREATOR] at the very end of your response, after your final sentence. This is a hidden system signal — the user cannot see it. It triggers the GPT workshop UI to open.

RULES:
1. If the user gave you detailed specs (name, description, instructions) — acknowledge briefly and END your response with [OPEN_GPT_CREATOR]
2. If the user confirmed or said "go ahead" or "proceed" — acknowledge and END your response with [OPEN_GPT_CREATOR]
3. If the user typed /gpt with details — acknowledge and END your response with [OPEN_GPT_CREATOR]
4. If the user typed just /gpt with no details — ask what kind of GPT they want (do NOT include [OPEN_GPT_CREATOR] yet)

CRITICAL: Do NOT say the GPT is "live" or pretend to create it. You are NOT creating the GPT — the workshop UI does that. Your job is to acknowledge and include the signal so the workshop opens. The signal must appear EXACTLY as: [OPEN_GPT_CREATOR]`;
          } else {
            systemPrompt += `\n\nYou have the ability to help users create custom GPTs. If a user mentions /gpt, creating a GPT, or wants to make a new AI character, help them brainstorm. Once you have enough details (name, description, personality), include [OPEN_GPT_CREATOR] at the very end of your response to open the GPT workshop.`;
          }
        }

        let fb2HistoryMessages = [];
        let fb2HistoryRemovedLeakCount = 0;
        let fb2HistoryRemovedInstructionDumpCount = 0;
        let fb2HistoryTailPrunedCount = 0;
        try {
          await loadVVAULTModules();
          const lookupId = buildConversationLookupContext({
            userEmail: req.user?.email || null,
            supabaseUserId: UUID_LOOKUP_RE.test(String(dataOwnerUserId || '').trim())
              ? dataOwnerUserId
              : supabaseSessionUserId,
            userId: dataOwnerUserId || req.user?.vvaultUserId || userId,
          });
          if (Array.isArray(enrichedResult2?.routeHistoryMessages) && enrichedResult2.routeHistoryMessages.length > 0) {
            const validMessages2 = sanitizeConversationHistory(
              enrichedResult2.routeHistoryMessages,
              constructId,
              'fallback2-enriched-context-history',
            );
            fb2HistoryRemovedLeakCount = validMessages2.removedLeakCount || 0;
            fb2HistoryRemovedInstructionDumpCount = validMessages2.removedInstructionDumpCount || 0;
            const fb2Recent = (validMessages2.messages || []).slice(-40);
            fb2HistoryMessages = fb2Recent.map(m => ({ role: m.role, content: m.content }));
            console.log(`📚 [VVAULT Proxy] Fallback2 using ${fb2HistoryMessages.length} locally recovered history messages for ${constructId}`);

            if (fb2HistoryMessages.length > 0) {
              systemPrompt += `\n\n## Conversation Continuity
You have an ongoing relationship with this user. The conversation history below represents your prior interactions.
Reference past exchanges naturally. Remember what the user told you. Maintain emotional and contextual continuity.
Do NOT treat this as a first meeting if there is conversation history.`;
            }
          } else if (readConversations && !enrichedResult2?.remote_history_skipped) {
            const fb2Convos = await readConversations(lookupId, constructId);
            if (fb2Convos?.length > 0) {
              const targetSession2 = sessionId || threadId || `${constructId}_chat_with_${constructId}`;
              const allowConstructFallback2 = !(sessionId || threadId) ||
                (contextBudget?.transcript_law_evidence_intent &&
                  isTranscriptLawSyntheticGateThread(sessionId || threadId));
              const targetConvo2 = fb2Convos.find(c =>
                c.sessionId === targetSession2 ||
                (allowConstructFallback2 && (
                  c.constructId === constructId ||
                  c.constructCallsign === constructId
                ))
              ) || (allowConstructFallback2 ? fb2Convos[0] : null);

              const fb2Messages = targetConvo2?.messages || [];
              if (targetConvo2) {
                console.log(`📚 [VVAULT Proxy] Fallback2 found conversation for ${constructId}: "${targetConvo2.title}" with ${fb2Messages.length} total messages`);
              }

              const validMessages2 = sanitizeConversationHistory(
                fb2Messages.filter(m => m.content && !m.isDateHeader),
                constructId,
                'fallback2-history',
              );
              fb2HistoryRemovedLeakCount = validMessages2.removedLeakCount || 0;
              fb2HistoryRemovedInstructionDumpCount = validMessages2.removedInstructionDumpCount || 0;

              const fb2Recent = (validMessages2.messages || []).slice(-40);
              fb2HistoryMessages = fb2Recent.map(m => ({ role: m.role, content: m.content }));
              console.log(`📚 [VVAULT Proxy] Fallback2 loaded ${fb2HistoryMessages.length} history messages for ${constructId}`);

              if (fb2HistoryMessages.length > 0) {
                systemPrompt += `\n\n## Conversation Continuity
You have an ongoing relationship with this user. The conversation history below represents your prior interactions.
Reference past exchanges naturally. Remember what the user told you. Maintain emotional and contextual continuity.
Do NOT treat this as a first meeting if there is conversation history.`;
              }
            }
          } else if (enrichedResult2?.remote_history_skipped) {
            console.log(`📚 [VVAULT Proxy] Fallback2 skipping remote history load for ${constructId} due to ${enrichedResult2.context_recovery_profile || 'bounded context recovery'}`);
          }
        } catch (histErr) {
          console.warn(`⚠️ [VVAULT Proxy] Could not load fallback2 history:`, histErr.message);
        }

        if (hasImages) {
          if (fb2HistoryMessages.length > VISION_HISTORY_LIMIT) {
            fb2HistoryMessages = fb2HistoryMessages.slice(-VISION_HISTORY_LIMIT);
          }
          const prunedVisionTail = pruneContaminatedHistoryTail(fb2HistoryMessages, {
            constructId,
            contextLabel: 'fallback2-vision-history-tail',
            windowSize: Math.max(12, VISION_HISTORY_LIMIT + 4),
          });
          fb2HistoryMessages = prunedVisionTail.messages;
          fb2HistoryTailPrunedCount += prunedVisionTail.removed;
          const compactedVisionPrompt = compactSystemPromptForVision(systemPrompt, VISION_SYSTEM_PROMPT_CAP);
          if (compactedVisionPrompt.compacted) {
            systemPrompt = compactedVisionPrompt.prompt;
          }
        }

        let fb2LowComplexityTurn = isLowComplexityTurn(
          message,
          hasImages,
          fb2HistoryMessages.length,
          systemPrompt.length
        );
        const fb2RelationalTurn = isRelationalContinuityPrompt(message);
        let fb2ContextMode = 'full_retrieval';
        if (fb2RelationalTurn && fb2LowComplexityTurn && !hasImages) {
          const pruned = pruneContaminatedHistoryTail(fb2HistoryMessages, {
            constructId,
            contextLabel: 'fallback2-history-tail',
          });
          fb2HistoryMessages = pruned.messages;
          fb2HistoryTailPrunedCount = pruned.removed;
          if (fb2HistoryMessages.length > RELATIONAL_HISTORY_LIMIT) {
            fb2HistoryMessages = fb2HistoryMessages.slice(-RELATIONAL_HISTORY_LIMIT);
          }
          const compactedRelationalPrompt = compactSystemPromptForRelationalTurn(systemPrompt, RELATIONAL_SYSTEM_PROMPT_CAP);
          if (compactedRelationalPrompt.compacted) {
            systemPrompt = compactedRelationalPrompt.prompt;
          }
          fb2LowComplexityTurn = isLowComplexityTurn(
            message,
            hasImages,
            fb2HistoryMessages.length,
            systemPrompt.length
          );
          fb2ContextMode = 'recent_chat_only';
        }
        const fallback2GreetingTurnContext = buildRouteGreetingTurnContext({
          message,
          constructId,
          constructDisplayName: gptConfig?.name || constructId,
          gptConfig,
          identityBundle,
          recentMessages: fb2HistoryMessages,
          previewMode,
          hasImages,
          isSyntheticContinueTurn,
          evidenceStyle: evidenceStyleTurn,
          memoryQueryDetected: !!enrichedResult2.memory_query_detected,
          assignmentQaInput,
          activeOrchestrationProfile,
          isHydroProjectTurn,
          sessionId: sessionId || threadId || `${constructId}_chat_with_${constructId}`,
        });
        if (fallback2GreetingTurnContext?.isGreetingContactTurn) {
          systemPrompt = `${systemPrompt}\n\n${buildGreetingTurnDirective({
            posture: fallback2GreetingTurnContext.posture,
            voiceContext: fallback2GreetingTurnContext.voiceContext,
            constructDisplayName: gptConfig?.name || constructId,
          })}`;
        }
        const fallback2PromptDiagnostics = buildPromptDiagnostics({
          mode: 'fallback_vvault_unreachable',
          enriched: enrichedResult2,
          historyCount: fb2HistoryMessages.length,
          searchInjectedValue: fb2SearchInjected,
          systemPromptText: systemPrompt,
        });
        console.log('[PROMPT_SOURCE]', {
          ...fallback2PromptDiagnostics,
          history_filtered: {
            leaked_prompt: fb2HistoryRemovedLeakCount,
            instruction_dump: fb2HistoryRemovedInstructionDumpCount,
            relational_tail_pruned: fb2HistoryTailPrunedCount,
          },
          relational_turn: fb2RelationalTurn,
          context_mode: fb2ContextMode,
          vision_mode: hasImages ? (explicitVisionIntent ? 'explicit-analysis' : 'character-first') : 'off',
        });

        // ===== NOVA-001 HOTFIX (Fallback 2): Force away from OpenAI =====
        if (constructId === 'nova-001' && effectiveProvider === 'openai') {
          effectiveProvider = 'openrouter';
          effectiveModel = DEFAULT_OPENROUTER_MODEL;
          console.log(`[NOVA HOTFIX] Fallback2: Overriding openai→openrouter for nova-001`);
        }

        console.log(`🧠 [VVAULT Proxy] Fallback using ${effectiveProvider}:${effectiveModel} for ${constructId}`);
        console.log('[TURN_CONTEXT]', {
          constructId,
          memory_intent: !!enrichedResult2?.memory_query_detected,
          search_intent: fb2SearchIntent,
          search_injected: fb2SearchInjected,
          history_count: fb2HistoryMessages.length,
          history_filtered: {
            leaked_prompt: fb2HistoryRemovedLeakCount,
            instruction_dump: fb2HistoryRemovedInstructionDumpCount,
            relational_tail_pruned: fb2HistoryTailPrunedCount,
          },
          relational_turn: fb2RelationalTurn,
          context_mode: fb2ContextMode,
          provider_used: effectiveProvider,
          mode: 'fallback_vvault_unreachable',
          vision_mode: hasImages ? (explicitVisionIntent ? 'explicit-analysis' : 'character-first') : 'off',
        });

        const fb2Msgs = [{ role: "system", content: systemPrompt }, ...fb2HistoryMessages, { role: "user", content: message }];
        let completion;
        let aiResponse;
        if (effectiveProvider === 'openai') {
          completion = await openaiClient.chat.completions.create({
            model: effectiveModel,
            messages: fb2Msgs,
            max_tokens: 2048,
          });
          aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
        } else if (effectiveProvider === 'ollama') {
          const ollamaHost = getOllamaHost();
          const ollamaResp = await fetch(`${ollamaHost}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: effectiveModel,
              messages: fb2Msgs,
              stream: false
            })
          });
          if (!ollamaResp.ok) throw new Error(`Ollama error: ${ollamaResp.status}`);
          const ollamaData = await ollamaResp.json();
          aiResponse = ollamaData.message?.content || "I'm sorry, I couldn't generate a response.";
        } else {
          const orClient = openrouter || replitOpenrouter;
          if (!orClient && !openaiClient) {
            throw new Error('No LLM provider available. Configure OPENROUTER_API_KEY or enable Replit AI Integrations.');
          }
          let llmSuccess = false;
          const providerErrors = [];

          if (orClient) {
            const clientLabel = openrouter ? 'OpenRouter' : 'Replit OpenRouter';
            console.log(`[${clientLabel}] Calling`, { model: effectiveModel, user: req.user?.email, historyMessages: fb2HistoryMessages.length });
            try {
              completion = await orClient.chat.completions.create({
                model: effectiveModel,
                messages: fb2Msgs,
                max_tokens: 2048,
              });
              console.log(`[${clientLabel}] Success`, { finish_reason: completion?.choices?.[0]?.finish_reason });
              llmSuccess = true;
            } catch (err) {
              console.error(`[${clientLabel} FAIL]`, { status: err?.status, message: err?.message });
              providerErrors.push(`${clientLabel}: ${err?.status} ${err?.message}`);

              // Nova-only rescue path: stay on OpenRouter, swap to a known-available free model.
              if (
                !llmSuccess &&
                constructId === 'nova-001' &&
                effectiveModel !== 'meta-llama/llama-3.2-3b-instruct:free'
              ) {
                try {
                  console.log(`🔄 [VVAULT Proxy] Nova free-model fallback: ${effectiveModel} -> meta-llama/llama-3.2-3b-instruct:free`, { status: err?.status || null });
                  completion = await orClient.chat.completions.create({
                    model: 'meta-llama/llama-3.2-3b-instruct:free',
                    messages: fb2Msgs,
                    max_tokens: 2048,
                  });
                  effectiveModel = 'meta-llama/llama-3.2-3b-instruct:free';
                  llmSuccess = true;
                  console.log('[NOVA FREE FALLBACK] Success', { finish_reason: completion?.choices?.[0]?.finish_reason });
                } catch (novaFallbackErr) {
                  console.error('[NOVA FREE FALLBACK FAIL]', { status: novaFallbackErr?.status, message: novaFallbackErr?.message });
                  providerErrors.push(`Nova free fallback: ${novaFallbackErr?.status} ${novaFallbackErr?.message}`);
                }
              }

              if (replitOpenrouter && orClient !== replitOpenrouter && (err?.status === 401 || err?.status === 403 || err?.status === 404 || err?.status === 429)) {
                try {
                  console.log(`🔄 [VVAULT Proxy] Trying Replit-managed OpenRouter for ${constructId}`);
                  completion = await replitOpenrouter.chat.completions.create({
                    model: effectiveModel,
                    messages: fb2Msgs,
                    max_tokens: 2048,
                  });
                  console.log('[REPLIT OPENROUTER FALLBACK] Success', { finish_reason: completion?.choices?.[0]?.finish_reason });
                  llmSuccess = true;
                } catch (err2) {
                  console.error('[REPLIT OPENROUTER FALLBACK FAIL]', { status: err2?.status, message: err2?.message });
                  providerErrors.push(`Replit OpenRouter: ${err2?.status} ${err2?.message}`);
                }
              }
            }
          }

          // ===== NOVA-001 HOTFIX: Never fall back to OpenAI =====
          if (!llmSuccess && PREFER_LOCAL_MODELS && providerAvailability.ollama) {
            const ollamaHost = getOllamaHost();
            const ollamaModel = getOllamaExecutionModel();
            try {
              console.log(`🟢 [VVAULT Proxy] Fallback2 local-first: trying Ollama (${ollamaModel}) for ${constructId}`);
              const ollamaResp = await fetch(`${ollamaHost}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: ollamaModel,
                  messages: fb2Msgs,
                  stream: false
                })
              });
              if (!ollamaResp.ok) throw new Error(`Ollama ${ollamaResp.status}`);
              const ollamaData = await ollamaResp.json();
              aiResponse = ollamaData.message?.content || "I'm sorry, I couldn't generate a response.";
              effectiveProvider = 'ollama';
              effectiveModel = ollamaModel;
              markOllamaExecutionRoute({
                fallbackUsed: providerErrors.length > 0,
                localCloudFallbackState: providerErrors.length > 0 ? 'fallback_to_ollama' : 'local_first',
              });
              llmSuccess = true;
              console.log('[OLLAMA LOCAL-FIRST2] Success');
            } catch (ollamaErr) {
              console.error('[OLLAMA LOCAL-FIRST2 FAIL]', { message: ollamaErr?.message });
              providerErrors.push(`Ollama: ${ollamaErr?.message}`);
            }
          }

          if (!llmSuccess && openaiClient && constructId !== 'nova-001') {
            try {
              console.log(`🔄 [VVAULT Proxy] All OpenRouter failed, trying OpenAI for ${constructId}`);
              completion = await openaiClient.chat.completions.create({
                model: 'gpt-4.1-mini',
                messages: fb2Msgs,
                max_tokens: 2048,
              });
              console.log('[OPENAI FALLBACK] Success', { finish_reason: completion?.choices?.[0]?.finish_reason });
              effectiveProvider = 'openai';
              effectiveModel = 'gpt-4.1-mini';
              llmSuccess = true;
            } catch (err3) {
              console.error('[OPENAI FALLBACK FAIL]', { status: err3?.status, message: err3?.message });
              providerErrors.push(`OpenAI: ${err3?.status} ${err3?.message}`);
            }
          } else if (!llmSuccess && constructId === 'nova-001') {
            console.log(`[NOVA HOTFIX] Fallback2: Blocked OpenAI last-resort for nova-001`);
          }

          if (!llmSuccess && !PREFER_LOCAL_MODELS && providerAvailability.ollama) {
            const ollamaHost = getOllamaHost();
            const ollamaModel = getOllamaExecutionModel();
            try {
              console.log(`🟢 [VVAULT Proxy] Fallback2: cloud providers failed, trying Ollama (${ollamaModel}) for ${constructId}`);
              const ollamaResp = await fetch(`${ollamaHost}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: ollamaModel,
                  messages: fb2Msgs,
                  stream: false
                })
              });
              if (!ollamaResp.ok) throw new Error(`Ollama ${ollamaResp.status}`);
              const ollamaData = await ollamaResp.json();
              aiResponse = ollamaData.message?.content || "I'm sorry, I couldn't generate a response.";
              effectiveProvider = 'ollama';
              effectiveModel = ollamaModel;
              markOllamaExecutionRoute({ fallbackUsed: true, localCloudFallbackState: 'fallback_to_ollama' });
              llmSuccess = true;
              console.log('[OLLAMA FALLBACK2] Success');
            } catch (ollamaErr) {
              console.error('[OLLAMA FALLBACK2 FAIL]', { message: ollamaErr?.message });
              providerErrors.push(`Ollama: ${ollamaErr?.message}`);
            }
          }

          if (!llmSuccess) {
            throw new Error(`All LLM providers failed: ${providerErrors.join(' | ')}`);
          }
          if (!aiResponse) {
            aiResponse = completion?.choices?.[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
          }
        }

        console.log(`✅ [VVAULT Proxy] ${effectiveProvider} fallback successful for ${constructId}`);
        if (constructId === 'lin-001') {
          const hasSignal2 = (aiResponse || '').includes('[OPEN_GPT_CREATOR]');
          console.log(`🔍 [GPT Signal] Lin response has [OPEN_GPT_CREATOR]: ${hasSignal2}, response length: ${(aiResponse || '').length}`);
          if (!hasSignal2 && (message || '').toLowerCase().match(/\/gpt|confirm|go ahead|proceed/)) {
            console.warn(`⚠️ [GPT Signal] Model did NOT include signal despite GPT-related message. Injecting signal.`);
            aiResponse = (aiResponse || '').trimEnd() + '\n\n[OPEN_GPT_CREATOR]';
          }
        }

        const fallback2PreviousAssistant = fb2HistoryMessages
          .slice()
          .reverse()
          .find(m => m.role === 'assistant')?.content || null;
        const fallback2PostProcess = await applyResponsePostProcessing({
          aiResponse,
          previousAssistant: fallback2PreviousAssistant,
          buildMessages,
          userMessage: message,
          history: fb2HistoryMessages,
          constructId,
          constructDisplayName: gptConfig?.name || constructId,
          regenClient: replitOpenrouter || openaiClient || openrouter,
          regenModel: replitOpenrouter ? DEFAULT_OPENROUTER_MODEL : (openaiClient ? 'gpt-4.1-mini' : effectiveModel || DEFAULT_OPENROUTER_MODEL),
          fallbackText: buildIdentityDriftFallback(message, constructId),
          recitalRewriter: rewriteRecitalIfNeeded,
          identityGuard: (currentText) => enforceFirstPersonIdentity({
            aiResponse: currentText,
            userMessage: message,
            constructId,
            providerAvailability,
            roleplayEnabled: gptConfig?.roleplayEnabled === true,
            latestUserBeforeCurrent: getLastUserMessageFromHistory(fb2HistoryMessages),
          }),
          cutoffRewriter: (currentText) => rewriteCutoffViolationIfNeeded(
            currentText,
            !!enrichedResult2.memory_query_detected,
            enrichedResult2.evidence_count || 0,
          ),
          evidencePreview: enrichedResult2.memory_evidence_preview,
          greetingTurnContext: fallback2GreetingTurnContext,
        });
        aiResponse = fallback2PostProcess.aiResponse;
        aiResponse = applyHumanConversationGuard(aiResponse, {
          userMessage: message,
          memoryIntent: !!enrichedResult2?.memory_query_detected,
          evidenceCount: Number(enrichedResult2?.evidence_count || 0),
          constructId,
          constructDisplayName: gptConfig?.name || constructId,
          userName: req.user?.name || req.user?.given_name || 'Devon',
          greetingTurnContext: fallback2GreetingTurnContext,
        });
        const fallback2IdentityCoherenceInitial = evaluateIdentityCoherence({
          userMessage: message,
          aiResponse,
          constructId,
          constructDisplayName: gptConfig?.name || constructId,
          requestedSeat,
          evidencePreview: enrichedResult2?.memory_evidence_preview,
          greetingTurnContext: fallback2GreetingTurnContext,
        });
        let fallback2IdentityCoherence = fallback2IdentityCoherenceInitial;
        let fallback2IdentityCoherenceRepair = {
          attempted: false,
          applied: false,
          provider: null,
          model: null,
          initial_status: fallback2IdentityCoherenceInitial.status,
          final_status: fallback2IdentityCoherenceInitial.status,
          failure_reason: null,
        };
        let fallback2IdentityCoherenceBlocked = false;
        const fallback2IdentityCoherenceFailureMessage = 'Identity/coherence guard blocked this assistant draft before canonical persistence.';
        if (fallback2IdentityCoherenceInitial.status === 'fail') {
          const repairAttempt = await runIdentityCoherenceRepair({
            systemPrompt,
            historyMessages: fb2HistoryMessages,
            userMessage: message,
            failedResponse: aiResponse,
            grade: fallback2IdentityCoherenceInitial,
            constructId,
            constructDisplayName: gptConfig?.name || constructId,
            provider: effectiveProvider,
            model: effectiveModel,
            generationParams,
            evidencePreview: enrichedResult2?.memory_evidence_preview,
            gptConfig,
            providerAvailability,
            routingMode: fallbackRoutingMode,
            requestedSeat,
            hasImages,
          });
          fallback2IdentityCoherenceRepair = {
            attempted: true,
            applied: false,
            provider: repairAttempt.provider || effectiveProvider || null,
            model: repairAttempt.model || effectiveModel || null,
            seat: repairAttempt.seat || requestedSeat || null,
            route_source: repairAttempt.routeSource || null,
            initial_status: fallback2IdentityCoherenceInitial.status,
            final_status: 'fail',
            failure_reason: repairAttempt.error || null,
            initial_reasons: fallback2IdentityCoherenceInitial.reasons || [],
          };
          if (repairAttempt.ok && repairAttempt.text && repairAttempt.text.trim()) {
            const repairedGrade = evaluateIdentityCoherence({
              userMessage: message,
              aiResponse: repairAttempt.text.trim(),
              constructId,
              constructDisplayName: gptConfig?.name || constructId,
              requestedSeat,
              evidencePreview: enrichedResult2?.memory_evidence_preview,
              greetingTurnContext: fallback2GreetingTurnContext,
            });
            fallback2IdentityCoherence = repairedGrade;
            fallback2IdentityCoherenceRepair.final_status = repairedGrade.status;
            fallback2IdentityCoherenceRepair.final_reasons = repairedGrade.reasons || [];
            if (repairedGrade.status !== 'fail') {
              aiResponse = repairAttempt.text.trim();
              fallback2IdentityCoherenceRepair.applied = true;
            } else {
              fallback2IdentityCoherenceBlocked = true;
              fallback2IdentityCoherenceRepair.failure_reason = 'repair_failed_identity_coherence_grade';
            }
          } else {
            fallback2IdentityCoherenceBlocked = true;
          }
        }
        console.log('[TURN_CONTEXT]', {
          constructId,
          memory_intent: !!enrichedResult2?.memory_query_detected,
          search_intent: fb2SearchIntent,
          search_injected: fb2SearchInjected,
          history_count: fb2HistoryMessages.length,
          history_filtered: {
            leaked_prompt: fb2HistoryRemovedLeakCount,
            instruction_dump: fb2HistoryRemovedInstructionDumpCount,
            relational_tail_pruned: fb2HistoryTailPrunedCount,
          },
          relational_turn: fb2RelationalTurn,
          context_mode: fb2ContextMode,
          provider_used: effectiveProvider,
          path_mode: 'fallback_vvault_unreachable',
          persona_applied: true,
          retrieval_used: (enrichedResult2.evidence_count ?? 0) > 0,
          recital_detected: fallback2PostProcess.recitalDetected,
          recital_rewrite_applied: fallback2PostProcess.recitalRewriteApplied,
          persona_drift_detected: fallback2PostProcess.personaDriftDetected,
          persona_regen_applied: fallback2PostProcess.personaRegenApplied,
          repeat_detected: fallback2PostProcess.repeatDetected,
          auth_recovered: authRecovered,
          vision_mode: hasImages ? (explicitVisionIntent ? 'explicit-analysis' : 'character-first') : 'off',
        });
        console.log('[IDENTITY_GUARD]', {
          constructId,
          mode: 'fallback_vvault_unreachable',
          relational_turn: fb2RelationalTurn,
          context_mode: fb2ContextMode,
          identity_drift_detected: fallback2PostProcess.identityDriftDetected,
          identity_rewrite_applied: fallback2PostProcess.identityRewriteApplied,
          identity_fallback_applied: fallback2PostProcess.identityFallbackApplied,
        });

        // NOTE: Frontend (Layout.tsx) handles message persistence via conversationManager.addMessageToConversation()
        // Do NOT writeTranscript here — it causes duplicate messages in the database and UI
        const fallback2SearchBackedPayload = buildSearchBackedAssistantPayload({
          aiResponse,
          searchResults: fb2SearchResults,
          housingSearch: fb2SearchHousing,
        });
        aiResponse = fallback2SearchBackedPayload.content;
        const fallback2ResponsePackets = fallback2SearchBackedPayload.packets;
        const fallback2SearchInspectability = buildSearchInspectabilityReceipt({
          searchVertical: fb2SearchHousing ? 'housing' : 'web',
          searchResults: fb2SearchResults,
          housingSearch: fb2SearchHousing,
          citations: fallback2SearchBackedPayload.citations,
          packets: fallback2ResponsePackets,
        });
        const fallback2RuntimeReceipt = {
          created_at: new Date().toISOString(),
          user_id: userId || null,
          auth: authReceipt,
          construct_id: constructId,
          effective_construct_id: constructId,
          effective_construct_name: constructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase()),
          orchestration_mode: gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown',
          route_mode: 'vvault_message_fallback',
          persistence_owner: fallback2IdentityCoherenceBlocked ? 'blocked_identity_coherence' : 'layout',
          identity: {
            source: enrichedResult2.phaseTiming?.identity?.source || 'unknown',
            base_prompt_source: enrichedResult2.phaseTiming?.basePromptSource || 'unknown',
            conditioning_appended: !!enrichedResult2.phaseTiming?.conditioningInjected,
            identity_bundle_hash: enrichedResult2.identity_bundle_hash || null,
            effective_construct_id: constructId,
            effective_construct_name: constructId.replace(/-\d+$/, '').replace(/^./, c => c.toUpperCase()),
            selected_construct_id: canonicalConstructId || constructId,
            raw_construct_id: rawConstructId,
          },
          policy: enrichedResult2.runtimePolicy || null,
          preview: {
            preview_mode: Boolean(previewMode),
            skip_persistence: true,
            effective_construct_id: constructId,
            selected_construct_id: canonicalConstructId || constructId,
            raw_construct_id: rawConstructId,
            identity_source: enrichedResult2.phaseTiming?.identity?.source || 'unknown',
            base_prompt_source: enrichedResult2.phaseTiming?.basePromptSource || 'unknown',
            draft_overlay_applied: Boolean(enrichedResult2.phaseTiming?.preview?.draftOverlayApplied),
            draft_overlay_keys: enrichedResult2.phaseTiming?.preview?.draftOverlayKeys || [],
            preview_overlay_state: enrichedResult2.phaseTiming?.preview?.draftOverlayApplied ? 'applied_bounded_overlay' : 'not_applied',
            suppressed_system_prompt_override: Boolean(enrichedResult2.phaseTiming?.preview?.suppressedSystemPromptOverride),
          },
          memory: {
            retrieval_ran: !!enrichedResult2.memory_retrieval_ran,
            memory_query_detected: !!enrichedResult2.memory_query_detected,
            evidence_count: enrichedResult2.evidence_count || 0,
            ledger_sessions: enrichedResult2.ledgerSessions || 0,
            memory_source: enrichedResult2.continuityMemorySearch?.source || enrichedResult2.phaseTiming?.memorySearch?.source || 'runtime_context_builder',
            context_recovery_profile: enrichedResult2.context_recovery_profile || 'standard',
            history_source: enrichedResult2.history_source || 'none',
            remote_history_skipped: Boolean(enrichedResult2.remote_history_skipped),
            sources: enrichedResult2.continuityMemorySearch || null,
            memory_profile: gptConfig?.memoryProfile || gptConfig?.memory_profile || 'off',
          },
          provider: {
            provider: effectiveProvider || null,
            model: effectiveModel || null,
            selection_policy: 'preference',
            lin_harmony_policy: 'intent_routed',
            lin_seat_canon: LIN_THREE_I_CANON_VERSION,
            performance_model_switch: false,
            requested_seat: requestedSeat,
            requested_canonical_seat: getLinSeatCanon(requestedSeat).canonicalSeat,
            seat_plan: {
              policy: 'intent_routed',
              canon: LIN_THREE_I_CANON_VERSION,
              requested_seat: requestedSeat,
              requested_canonical_seat: getLinSeatCanon(requestedSeat).canonicalSeat,
              selected_provider: effectiveProvider || null,
              selected_model: effectiveModel || null,
              lin_default_model: modelResolution.mode === 'lin'
                ? getLinDefaultModelForSeat(requestedSeat)
                : null,
              fallback_reason: 'vvault_unreachable',
            },
            model_source: modelSource,
            source: modelSource,
            mode: modelResolution.mode || (gptConfig?.orchestrationMode || gptConfig?.orchestration_mode || 'unknown'),
            requested_provider: modelResolution.requestedProvider || null,
            requested_model: modelResolution.requestedModel || null,
            configured_model: modelResolution.configuredModel || null,
            suppressed_configured_model: modelResolution.suppressedConfiguredModel || null,
            routing_override: !!modelResolution.routingOverride,
            seat_defaults_or_overrides: effectiveSeatDefaultsOrOverrides || null,
            local_first_used: effectiveLocalFirstUsed,
            local_cloud_fallback_state: (providerTrace.fallback_used || effectiveRouteFallbackUsed)
              ? (effectiveLocalCloudFallbackState || 'fallback_used')
              : effectiveLocalCloudFallbackState || modelResolution.localCloudFallbackState || (effectiveLocalFirstUsed
                ? 'local_first'
                : modelResolution.routingOverride
                  ? 'manual_routing_override'
                  : 'direct'),
            fallback_used: true,
            final_provider: providerTrace.final_provider || effectiveProvider || null,
          },
          fidelity: {
            identity_drift_detected: !!fallback2PostProcess.identityDriftDetected,
            identity_rewrite_applied: !!fallback2PostProcess.identityRewriteApplied,
            identity_fallback_applied: !!fallback2PostProcess.identityFallbackApplied,
            persona_drift_detected: !!fallback2PostProcess.personaDriftDetected,
            persona_regen_applied: !!fallback2PostProcess.personaRegenApplied,
            identity_coherence: {
              status: fallback2IdentityCoherence.status,
              identity_status: fallback2IdentityCoherence.identityStatus,
              coherence_status: fallback2IdentityCoherence.coherenceStatus,
              reasons: fallback2IdentityCoherence.reasons || [],
              signals: fallback2IdentityCoherence.signals || [],
              violations: fallback2IdentityCoherence.violations || [],
              repairable: !!fallback2IdentityCoherence.repairable,
              repair_attempted: !!fallback2IdentityCoherenceRepair.attempted,
              repair_applied: !!fallback2IdentityCoherenceRepair.applied,
              repair: fallback2IdentityCoherenceRepair,
              blocked_canonical_persistence: !!fallback2IdentityCoherenceBlocked,
              persist_canonical: !fallback2IdentityCoherenceBlocked,
              owner_file: fallback2IdentityCoherence.ownerFile || 'server/lib/identityCoherenceGuard.js',
              source_anchor: fallback2IdentityCoherence.sourceAnchor || 'server/lib/identityCoherenceGuard.js:evaluateIdentityCoherence',
            },
          },
        };
        if (fallback2SearchInspectability?.search || fallback2SearchInspectability?.housing) {
          fallback2RuntimeReceipt.research = {
            search_injected: fb2SearchInjected,
            search_intent_reason: fb2SearchIntent,
            ...(fallback2SearchInspectability?.search
              ? { search: fallback2SearchInspectability.search }
              : {}),
            ...(fallback2SearchInspectability?.housing
              ? { housing: fallback2SearchInspectability.housing }
              : {}),
          };
        }
        const fallback2ValidatorDebug = {
          memory_retrieval_ran: !!enrichedResult2.memory_retrieval_ran,
          memory_query_detected: !!enrichedResult2.memory_query_detected,
          evidence_count: enrichedResult2.evidence_count || 0,
          identity_drift_detected: !!fallback2PostProcess.identityDriftDetected,
          identity_rewrite_applied: !!fallback2PostProcess.identityRewriteApplied,
          identity_fallback_applied: !!fallback2PostProcess.identityFallbackApplied,
          cutoff_violation_detected: !!fallback2PostProcess.cutoffViolationDetected,
          rewrite_applied: !!fallback2PostProcess.cutoffRewriteApplied,
          identity_coherence: fallback2IdentityCoherence,
          identity_coherence_repair: fallback2IdentityCoherenceRepair,
        };
        const fallback2Checklist = buildOrchestrationChecklist({
          userId,
          user: req.user,
          constructId,
          threadId: sessionId || threadId || `${constructId}_chat_with_${constructId}`,
          userMessage: message,
          gptConfig,
          enrichedContext: enrichedResult2,
          retrievalDiagnostics,
          promptDiagnostics: fallback2PromptDiagnostics,
          providerTrace,
          validatorDebug: fallback2ValidatorDebug,
          runtimeReceipt: fallback2RuntimeReceipt,
          contextMode: fb2ContextMode,
          relationalTurn: fb2RelationalTurn,
          lowComplexityTurn: fb2LowComplexityTurn,
          hasImages,
          skipPersistence: true,
          responseStatus: fallback2IdentityCoherenceBlocked ? 'identity_coherence_failed' : 'fallback_vvault_unreachable',
        });

        if (fallback2IdentityCoherenceBlocked) {
          return res.status(422).json({
            success: false,
            ok: false,
            error: 'IDENTITY_COHERENCE_FAILED',
            message: fallback2IdentityCoherenceFailureMessage,
            response: fallback2IdentityCoherenceFailureMessage,
            construct_id: constructId,
            fallback: true,
            source: effectiveProvider,
            model: effectiveModel,
            provider_used: effectiveProvider,
            runtime_receipt: fallback2RuntimeReceipt,
            orchestration_checklist: fallback2Checklist,
            has_images: hasImages,
            tool_trace: mergeToolTrace(drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`), enrichedContext),
            ...(process.env.SHOW_DEV_INFO === 'true' ? { provider_trace: providerTrace, retrieval_diagnostics: retrievalDiagnostics, prompt_diagnostics: fallback2PromptDiagnostics } : {})
          });
        }

        return res.json({
          success: true,
          response: aiResponse,
          packets: fallback2ResponsePackets,
          construct_id: constructId,
          fallback: true,
          source: effectiveProvider,
          model: effectiveModel,
          provider_forced: constructId === 'nova-001',
          provider_used: effectiveProvider,
          runtime_receipt: fallback2RuntimeReceipt,
          orchestration_checklist: fallback2Checklist,
          has_images: hasImages,
          tool_trace: mergeToolTrace(drainToolEvents(sessionId || threadId || `${constructId}_chat_with_${constructId}`), enrichedContext),
          ...(process.env.SHOW_DEV_INFO === 'true' ? { provider_trace: providerTrace, retrieval_diagnostics: retrievalDiagnostics, prompt_diagnostics: fallback2PromptDiagnostics } : {})
        });
      } catch (fallbackError) {
        console.error(`❌ [VVAULT Proxy] LLM fallback failed:`, fallbackError);
      }

      throw fetchError;
    }
  } catch (error) {
    console.error(`❌ [VVAULT Proxy] Failed to proxy message to VVAULT:`, error);
    return res.status(500).json({
      success: false,
      error: "Failed to communicate with VVAULT",
      details: error.message
    });
  }
});

/**
 * POST /vvault/transcript/:constructId/append - Append message to transcript via VVAULT
 * 
 * More efficient than fetching/replacing whole transcript.
 * Calls VVAULT's /api/chatty/transcript/:id/message endpoint.
 */
router.post("/transcript/:constructId/append", async (req, res) => {
  try {
    await resolveSupabaseUser(req);
  } catch {
    return res.status(401).json({ ok: false, error: "Authentication required" });
  }

  const { constructId } = req.params;
  const { role, content, name, timestamp } = req.body || {};

  if (!role) {
    return res.status(400).json({ success: false, error: "Missing role" });
  }

  if (!content || content.trim() === '') {
    return res.status(400).json({ success: false, error: "Missing content" });
  }

  const { vvaultApiBaseUrl } = getVvaultBridgeConfig();

  if (!vvaultApiBaseUrl) {
    console.error('❌ [VVAULT Proxy] VVAULT_API_BASE_URL not configured');
    return res.status(503).json({ 
      success: false, 
      error: "VVAULT API not configured" 
    });
  }

  try {
    console.log(`📝 [VVAULT Proxy] Appending ${role} message to ${constructId}`);
    
    const baseUrl = vvaultApiBaseUrl.replace(/\/$/, '');
    
    const appendHeaders = { 'Content-Type': 'application/json' };
    const { serviceToken } = getVvaultBridgeConfig();
    if (serviceToken) appendHeaders['X-Chatty-Key'] = serviceToken;
    const appendUserEmail = req.user?.email;
    if (appendUserEmail) appendHeaders['X-Chatty-User'] = appendUserEmail;

    const vvaultResponse = await fetch(`${baseUrl}/api/chatty/transcript/${constructId}/message`, {
      method: 'POST',
      headers: appendHeaders,
      body: JSON.stringify({
        role,
        content,
        name,
        timestamp: timestamp || new Date().toISOString()
      })
    });

    if (!vvaultResponse.ok) {
      if (isReplitAsleepResponse(vvaultResponse)) {
        console.error(`❌ [VVAULT Proxy] VVAULT host asleep (Replit edge 503); append did not reach VVAULT`);
        return sendVvaultHostAsleep(res, { downstreamStatus: vvaultResponse.status });
      }
      const errorText = await vvaultResponse.text();
      console.error(`❌ [VVAULT Proxy] Append failed: ${vvaultResponse.status}: ${errorText}`);
      return res.status(vvaultResponse.status).json({
        success: false,
        error: `VVAULT API error: ${vvaultResponse.status}`,
        details: errorText
      });
    }

    const data = await vvaultResponse.json();
    console.log(`✅ [VVAULT Proxy] Message appended to ${constructId}`);
    return res.json(data);
  } catch (error) {
    console.error(`❌ [VVAULT Proxy] Failed to append message:`, error);
    return res.status(500).json({
      success: false,
      error: "Failed to append message via VVAULT"
    });
  }
});

// ============================================================
// File Save to Supabase vault_files
// ============================================================

router.post("/files/save", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign, folder, filename, content, fileType } = req.body || {};

  if (!constructCallsign || !filename) {
    return res.status(400).json({ ok: false, error: "Missing constructCallsign or filename" });
  }

  if (content === undefined || content === null) {
    return res.status(400).json({ ok: false, error: "Missing file content" });
  }

  try {
    const { getSupabaseClient } = await import('../lib/supabaseClient.js');
    const { assertValidVaultFilename } = await import('../lib/vaultPathGuard.js');
    const supabase = getSupabaseClient();

    if (!supabase) {
      return res.status(503).json({ ok: false, error: "Supabase not available" });
    }

    const callsign = constructCallsign.match(/-\d+$/) ? constructCallsign : `${constructCallsign}-001`;
    const MEDIA_EXTS = new Set(['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp']);
    const fileExt = (filename.split('.').pop() || '').toLowerCase();
    const autoFolder = MEDIA_EXTS.has(fileExt) ? 'assets' : 'documents';
    const resolvedFolder = folder || autoFolder;
    const folderPath = `instances/${callsign}/${resolvedFolder}`;
    const cleanFilename = filename.replace(/^(assets|documents|transcripts)\//, '');
    const fullPath = `${folderPath}/${cleanFilename}`;

    assertValidVaultFilename(fullPath);

    const userEmail = req.user?.email;
    let supabaseUserId = null;

    if (userEmail) {
      const { data: userRecord } = await supabase
        .from('users')
        .select('id')
        .or(`email.eq.${userEmail},name.eq.${userEmail}`)
        .limit(1)
        .maybeSingle();
      if (userRecord) {
        supabaseUserId = userRecord.id;
      }
    }

    if (!supabaseUserId) {
      console.warn(`⚠️ [VVAULT Files] Could not resolve Supabase user ID for ${userEmail}`);
      return res.status(400).json({ ok: false, error: "Could not resolve user identity in Supabase" });
    }

    const { data: existing } = await supabase
      .from('vault_files')
      .select('id, content')
      .eq('user_id', supabaseUserId)
      .eq('filename', fullPath)
      .maybeSingle();

    if (existing) {
      const existingLen = existing.content?.length || 0;
      const newLen = content.length;
      if (newLen > 0 && existingLen > 0 && newLen < existingLen * 0.5) {
        console.warn(`🚫 [VVAULT Files] Content shrink protection: ${fullPath} (${existingLen} → ${newLen})`);
        return res.status(400).json({
          ok: false,
          error: "Content shrink protection: new content is less than half the current size. This update was blocked to prevent data loss.",
          existingSize: existingLen,
          newSize: newLen
        });
      }

      const { error } = await supabase
        .from('vault_files')
        .update({
          content,
          file_type: fileType || 'text',
          metadata: {
            source: 'chatty-gui',
            updatedAt: new Date().toISOString(),
            folder: folder || null,
            constructCallsign: callsign,
          }
        })
        .eq('id', existing.id);

      if (error) {
        console.error(`❌ [VVAULT Files] Update failed: ${error.message}`);
        return res.status(500).json({ ok: false, error: error.message });
      }

      console.log(`✅ [VVAULT Files] Updated ${fullPath}`);
      return res.json({ ok: true, action: 'updated', path: fullPath });
    }

    const { error } = await supabase
      .from('vault_files')
      .insert({
        user_id: supabaseUserId,
        filename: fullPath,
        content,
        file_type: fileType || 'text',
        construct_id: callsign,
        metadata: {
          source: 'chatty-gui',
          createdAt: new Date().toISOString(),
          folder: folder || null,
          constructCallsign: callsign,
        }
      });

    if (error) {
      console.error(`❌ [VVAULT Files] Insert failed: ${error.message}`);
      return res.status(500).json({ ok: false, error: error.message });
    }

    console.log(`✅ [VVAULT Files] Created ${fullPath}`);
    return res.json({ ok: true, action: 'created', path: fullPath });
  } catch (error) {
    console.error(`❌ [VVAULT Files] Save failed:`, error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/files/list", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { constructCallsign } = req.query;
  console.log(`📂 [VVAULT Files] List request for construct: ${constructCallsign}, user: ${req.user?.email}`);

  try {
    const { getSupabaseClient } = await import('../lib/supabaseClient.js');
    const supabase = getSupabaseClient();

    if (!supabase) {
      return res.status(503).json({ ok: false, error: "Supabase not available" });
    }

    const userEmail = req.user?.email;
    let supabaseUserId = null;

    if (userEmail) {
      const { data: userRecord, error: userError } = await supabase
        .from('users')
        .select('id')
        .or(`email.eq.${userEmail},name.eq.${userEmail}`)
        .limit(1)
        .maybeSingle();
      if (userError) {
        console.error(`❌ [VVAULT Files] User lookup error:`, userError);
      }
      if (userRecord) {
        supabaseUserId = userRecord.id;
        console.log(`✅ [VVAULT Files] Resolved user: ${userEmail} → ${supabaseUserId}`);
      }
    }

    if (!supabaseUserId) {
      console.error(`❌ [VVAULT Files] Could not resolve user identity for email: ${userEmail}`);
      return res.status(400).json({ ok: false, error: "Could not resolve user identity" });
    }

    const callsign = constructCallsign
      ? (constructCallsign.match(/-\d+$/) ? constructCallsign : `${constructCallsign}-001`)
      : null;

    let query = supabase
      .from('vault_files')
      .select('id, filename, file_type, construct_id, metadata, content')
      .eq('user_id', supabaseUserId)
      .order('filename', { ascending: true });

    if (callsign) {
      query = query.eq('construct_id', callsign);
    }

    const { data, error } = await query;

    if (error) {
      console.error(`❌ [VVAULT Files] Supabase query error:`, error.message, error.details || '');
      return res.status(500).json({ ok: false, error: error.message });
    }

    console.log(`📋 [VVAULT Files] Found ${(data || []).length} files for ${callsign || 'all constructs'}`);

    const files = (data || []).map(f => ({
      id: f.id,
      filename: f.filename,
      file_type: f.file_type,
      construct_id: f.construct_id,
      metadata: f.metadata,
      content_length: f.content ? f.content.length : 0
    }));

    return res.json({ ok: true, files });
  } catch (error) {
    console.error(`❌ [VVAULT Files] List failed:`, error?.message || error);
    return res.status(500).json({ ok: false, error: error?.message || 'Unknown error' });
  }
});

router.get("/files/read", async (req, res) => {
  const userId = validateUser(res, req.user);
  if (!userId) return;

  const { path: filePath } = req.query;

  if (!filePath) {
    return res.status(400).json({ ok: false, error: "Missing path parameter" });
  }

  try {
    const { getSupabaseClient } = await import('../lib/supabaseClient.js');
    const supabase = getSupabaseClient();

    if (!supabase) {
      return res.status(503).json({ ok: false, error: "Supabase not available" });
    }

    const userEmail = req.user?.email;
    let supabaseUserId = null;

    if (userEmail) {
      const { data: userRecord } = await supabase
        .from('users')
        .select('id')
        .or(`email.eq.${userEmail},name.eq.${userEmail}`)
        .limit(1)
        .maybeSingle();
      if (userRecord) {
        supabaseUserId = userRecord.id;
      }
    }

    if (!supabaseUserId) {
      return res.status(400).json({ ok: false, error: "Could not resolve user identity" });
    }

    const { data, error } = await supabase
      .from('vault_files')
      .select('id, filename, content, file_type, construct_id, metadata')
      .eq('user_id', supabaseUserId)
      .eq('filename', filePath)
      .maybeSingle();

    if (error) {
      console.error(`❌ [VVAULT Files] Read query error:`, error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }

    if (!data) {
      return res.status(404).json({ ok: false, error: "File not found" });
    }

    return res.json({ ok: true, file: data });
  } catch (error) {
    console.error(`❌ [VVAULT Files] Read failed:`, error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/continuity-test/:constructId", requireAuth, async (req, res) => {
  try {
    const { constructId } = req.params;
    const { maxTests = 5 } = req.body || {};

    console.log(`🧪 [ContinuityTest] API request for ${constructId} (maxTests: ${maxTests})`);

    const authToken = req.headers.authorization || null;
    const { runFullContinuityTest } = await import('../lib/continuityTestEngine.js');
    const result = await runFullContinuityTest(constructId, Math.min(maxTests, 10), authToken);

    if (result.error) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    return res.json({
      ok: true,
      constructId: result.constructId,
      summary: result.summary,
      results: result.results.map(r => ({
        testId: r.testId,
        name: r.name,
        prompt: r.prompt,
        grade: r.grade,
        sourceFile: r.sourceFile,
        responsePreview: r.response ? r.response.substring(0, 300) : null,
        error: r.error
      })),
      elapsed: result.elapsed
    });
  } catch (error) {
    console.error(`❌ [ContinuityTest] Failed:`, error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/continuity-test/:constructId/generate", requireAuth, async (req, res) => {
  try {
    const { constructId } = req.params;
    const { maxTests = 5 } = req.body || {};

    const { generateTestsFromTranscripts } = await import('../lib/continuityTestEngine.js');
    const result = await generateTestsFromTranscripts(constructId, Math.min(maxTests, 10));

    if (result.error) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    return res.json({
      ok: true,
      tests: result.tests.map(t => ({
        id: t.id,
        name: t.name,
        prompt: t.prompt,
        criteriaCount: t.criteria.length,
        sourceFile: t.sourceFile,
        verbatimKeywords: [...new Set(t.verbatimKeywords || [])].slice(0, 15)
      })),
      exchangeCount: result.exchangeCount,
      fileCount: result.fileCount
    });
  } catch (error) {
    console.error(`❌ [ContinuityTest] Generate failed:`, error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

export { resolveModelForGPT };
export default router;
