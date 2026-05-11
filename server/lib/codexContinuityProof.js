import {
  buildConstructRevision,
  computeNextRuntimeTurnState,
  validateRuntimeResumeRequest,
} from './runtimeTurnState.js';
import { buildContinuityProofReceipt } from './vvaultConversationRouteContract.js';
import {
  CODEX_CONTINUITY_SEED_DEFAULTS,
  buildCodexResumeToken,
  readCanonicalSeedUser,
} from './codexContinuitySeed.js';
import {
  CODEX_CONTINUITY_PROOF_TURNS,
  relayCodexContinuity,
} from './codexContinuityRelay.js';
import { readConversations } from '../../vvaultConnector/readConversations.js';
import { readLatestRuntimeTurnState } from '../../vvaultConnector/runtimeTurnStateStore.js';
import { writeTranscript } from '../../vvaultConnector/writeTranscript.js';

const GATE_NAMES = Object.freeze([
  'G0_HYDRATION_PREFLIGHT',
  'G1_TAIL_PACKET_PRESENT',
  'G2_REQUEST_PAYLOAD_MATCH',
  'G3_CONTINUITY_RESTORED',
  'G4_TRAJECTORY_CONTINUED',
  'G5_CANONICAL_READBACK',
  'G6_STALE_SEAT_REJECTED',
]);

function buildUserContext(user = {}) {
  return {
    userId: user.user_id || user.userId || user.id || null,
    userEmail: user.email || null,
    supabaseUserId: user.vvault_user_id || user.supabaseUserId || user.user_id || null,
  };
}

function gateMap() {
  return Object.fromEntries(GATE_NAMES.map((gate) => [gate, 'FAIL']));
}

function tailFieldsPresent(state = {}) {
  return Boolean(
    state.sessionId &&
      state.constructId &&
      state.constructRevision &&
      typeof state.continuitySeq === 'number' &&
      state.assistantTurnId &&
      state.tailHash,
  );
}

function buildContinuePayload(token) {
  return {
    constructId: token.constructId,
    message: '',
    threadId: token.threadId,
    sessionId: token.threadId,
    attachments: [],
    continueTurn: true,
    skipPersistence: false,
    continuity_expected: true,
    resume_from_turn_id: token.assistantTurnId,
    resume_from_continuity_seq: token.continuitySeq,
    resume_tail_hash: token.tailHash,
    resume_construct_revision: token.constructRevision,
    resume_source_seat: token.sourceSeat,
  };
}

function requestMatchesToken(payload, token) {
  return (
    payload.constructId === token.constructId &&
    payload.threadId === token.threadId &&
    payload.sessionId === token.threadId &&
    payload.continuity_expected === true &&
    payload.resume_from_turn_id === token.assistantTurnId &&
    payload.resume_from_continuity_seq === token.continuitySeq &&
    payload.resume_tail_hash === token.tailHash &&
    payload.resume_construct_revision === token.constructRevision &&
    payload.resume_source_seat === token.sourceSeat
  );
}

function trajectoryContinued({ seedState, readbackState }) {
  return (
    readbackState?.continuitySeq === seedState.continuitySeq + 1 &&
    readbackState?.activeGoal === seedState.activeGoal &&
    readbackState?.openLoop === seedState.openLoop &&
    readbackState?.nextStep === seedState.nextStep
  );
}

function canonicalReadbackMatches({ readbackState, expectedState }) {
  return (
    readbackState?.continuitySeq === expectedState?.continuitySeq &&
    readbackState?.assistantTurnId === expectedState?.assistantTurnId &&
    readbackState?.tailHash === expectedState?.tailHash
  );
}

function containsMessageContent(messages = [], role, content) {
  return (messages || []).some(
    (message) =>
      message?.role === role &&
      typeof message?.content === 'string' &&
      message.content === content,
  );
}

function failResult({ gates, evidence, failedGate }) {
  return {
    rawEvidence: {
      ...evidence,
      failedGate,
    },
    gates,
  };
}

export async function runCodexContinuityProof({
  now = new Date().toISOString(),
  relayTurns = CODEX_CONTINUITY_PROOF_TURNS,
  relayNow = new Date(new Date(now).getTime() - 1000).toISOString(),
  readConversationsImpl = readConversations,
  readLatestRuntimeTurnStateImpl = readLatestRuntimeTurnState,
  writeTranscriptImpl = writeTranscript,
} = {}) {
  const gates = gateMap();
  const evidence = {};
  const user = await readCanonicalSeedUser();
  const userContext = buildUserContext(user);

  const relayResult = await relayCodexContinuity({
    stdinJson: JSON.stringify(relayTurns),
    now: relayNow,
    readLatestRuntimeTurnStateImpl,
    readConversationsImpl,
    writeTranscriptImpl,
  });
  const seedState = relayResult.latestRuntimeTurnState || null;
  evidence.hydrationState = {
    source: relayResult.canonicalReadback?.persistenceSource || relayResult.canonicalReadback?.source || null,
    timestamp: seedState?.updatedAt || null,
    hydrationTruth: seedState?.hydrationTruth || null,
    hydrationComplete: seedState?.hydrationTruth === 'full',
  };
  evidence.seedRuntimeTurnState = seedState;
  evidence.relaySource = relayResult.source;
  evidence.relayedTurns = relayResult.relayedTurns;

  if (!seedState || seedState.hydrationTruth !== 'full') {
    return failResult({ gates, evidence, failedGate: 'G0_HYDRATION_PREFLIGHT' });
  }
  gates.G0_HYDRATION_PREFLIGHT = 'PASS';

  if (!tailFieldsPresent(seedState)) {
    return failResult({ gates, evidence, failedGate: 'G1_TAIL_PACKET_PRESENT' });
  }
  gates.G1_TAIL_PACKET_PRESENT = 'PASS';

  const resumeToken = buildCodexResumeToken(seedState, {
    issuedAt: seedState.updatedAt || now,
    threadId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
  });
  const outgoingRequestPayload = buildContinuePayload(resumeToken);
  evidence.resumeTokenJson = resumeToken;
  evidence.outgoingRequestPayload = outgoingRequestPayload;

  if (!requestMatchesToken(outgoingRequestPayload, resumeToken)) {
    return failResult({ gates, evidence, failedGate: 'G2_REQUEST_PAYLOAD_MATCH' });
  }
  gates.G2_REQUEST_PAYLOAD_MATCH = 'PASS';

  const resumeValidation = validateRuntimeResumeRequest({
    runtimeTurnState: seedState,
    resumeRequest: outgoingRequestPayload,
    sessionId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
    constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
  });
  const continuityReceipt = buildContinuityProofReceipt({
    hydration: resumeValidation.hydration,
    hydrationComplete: resumeValidation.hydrationComplete,
    resumeValidation,
  });
  const runtimeReceipt = {
    route_mode: 'vvault_message',
    persistence_owner: 'vvault_body',
    continuity: continuityReceipt,
    ...continuityReceipt,
  };
  evidence.runtime_receipt = runtimeReceipt;
  evidence.continuitySeq = runtimeReceipt.continuitySeq;
  evidence.tailHash = seedState.tailHash;
  evidence.continuedFromTurnId = runtimeReceipt.continuedFromTurnId;

  if (
    runtimeReceipt.continuityRestored !== true ||
    runtimeReceipt.continuitySource !== 'runtimeTurnState' ||
    runtimeReceipt.continuedFromTurnId !== seedState.assistantTurnId
  ) {
    return failResult({ gates, evidence, failedGate: 'G3_CONTINUITY_RESTORED' });
  }
  gates.G3_CONTINUITY_RESTORED = 'PASS';

  const resumedRuntimeTurnState = computeNextRuntimeTurnState({
    previousState: resumeValidation.runtimeTurnState,
    userMessage: '',
    continuityClass: 'ordinary',
    sessionId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
    constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
    constructRevision: buildConstructRevision({
      constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
      revisionHint: seedState.constructRevision,
    }),
    hydrationTruth: runtimeReceipt.hydration || 'full',
    now,
  });

  await writeTranscriptImpl({
    userId: userContext.userId,
    userEmail: userContext.userEmail,
    supabaseUserId: userContext.supabaseUserId,
    sessionId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
    timestamp: now,
    role: 'assistant',
    content: 'Continue naturally from the last assistant turn without asking for confirmation.',
    title: CODEX_CONTINUITY_SEED_DEFAULTS.constructName,
    metadata: {
      constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
      constructName: CODEX_CONTINUITY_SEED_DEFAULTS.constructName,
      constructCallsign: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
      runtimeReceipt,
      runtimeTurnState: resumedRuntimeTurnState,
      codexContinuityProof: {
        sourceSeat: 'codex',
        continuedFromTurnId: seedState.assistantTurnId,
      },
    },
    constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
    constructName: CODEX_CONTINUITY_SEED_DEFAULTS.constructName,
    constructCallsign: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
  });

  const readback = await readLatestRuntimeTurnStateImpl(userContext, {
    sessionId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
    constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
  });
  const readbackConversations = await readConversationsImpl(
    userContext,
    CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
  );
  const canonicalConversation =
    readbackConversations.find(
      (conversation) => conversation?.sessionId === CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
    ) || null;
  const readbackState = readback?.runtimeTurnState || null;
  evidence.persistedReadbackMetadata = {
    source: readback?.source || null,
    timestamp: readback?.timestamp || null,
    runtimeTurnState: readbackState,
    messages: canonicalConversation?.messages || [],
  };

  if (
    !trajectoryContinued({ seedState, readbackState }) ||
    !containsMessageContent(canonicalConversation?.messages, 'user', relayResult.latestUserContent) ||
    !containsMessageContent(canonicalConversation?.messages, 'assistant', relayResult.latestAssistantContent)
  ) {
    return failResult({ gates, evidence, failedGate: 'G4_TRAJECTORY_CONTINUED' });
  }
  gates.G4_TRAJECTORY_CONTINUED = 'PASS';

  if (
    !readback?.source ||
    !canonicalReadbackMatches({
      readbackState,
      expectedState: resumedRuntimeTurnState,
    }) ||
    !containsMessageContent(canonicalConversation?.messages, 'user', relayResult.latestUserContent) ||
    !containsMessageContent(canonicalConversation?.messages, 'assistant', relayResult.latestAssistantContent)
  ) {
    return failResult({ gates, evidence, failedGate: 'G5_CANONICAL_READBACK' });
  }
  gates.G5_CANONICAL_READBACK = 'PASS';

  const staleSeatRejection = validateRuntimeResumeRequest({
    runtimeTurnState: readbackState,
    resumeRequest: outgoingRequestPayload,
    sessionId: CODEX_CONTINUITY_SEED_DEFAULTS.sessionId,
    constructId: CODEX_CONTINUITY_SEED_DEFAULTS.constructId,
  });
  evidence.staleSeatRejectionResult = staleSeatRejection;

  if (
    staleSeatRejection.staleSeatRejected !== true ||
    staleSeatRejection.continuityRestored === true
  ) {
    return failResult({ gates, evidence, failedGate: 'G6_STALE_SEAT_REJECTED' });
  }
  gates.G6_STALE_SEAT_REJECTED = 'PASS';

  return {
    rawEvidence: evidence,
    gates,
  };
}
