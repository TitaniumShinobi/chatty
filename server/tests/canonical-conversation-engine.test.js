import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function extractFunction(source, functionName) {
  const start = source.indexOf(`const ${functionName} =`);
  assert.notEqual(start, -1, `${functionName} was not found`);
  const nextFunction = source.indexOf('\n  const ', start + 1);
  return source.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

function extractDeclaredFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} was not found`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextType = source.indexOf('\ntype ', start + 1);
  const candidates = [nextFunction, nextType].filter((idx) => idx !== -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : undefined;
  return source.slice(start, end);
}

describe('canonical construct conversation engine', () => {
  it('routes GPT Creator preview text through /api/vvault/message, not the Lin seat endpoint', () => {
    const source = readRepoFile('src/components/GPTCreator.tsx');
    const previewSubmit = extractFunction(source, 'handlePreviewSubmit');

    assert.match(previewSubmit, /fetchWithDevAuthRetry\('\/api\/vvault\/message'/);
    assert.match(previewSubmit, /previewMode:\s*true/);
    assert.match(previewSubmit, /previewDraft/);
    assert.match(previewSubmit, /transientHistory/);
    assert.match(previewSubmit, /skipPersistence:\s*true/);
    assert.match(previewSubmit, /orchestrationMode === "lin"\s*\?\s*""/);
    assert.match(previewSubmit, /previewMessagePayload\.model = selectedModel/);
    assert.doesNotMatch(previewSubmit, /model:\s*selectedModel/);
    assert.doesNotMatch(previewSubmit, /browserSeatRunner/);
    assert.doesNotMatch(previewSubmit, /buildPreviewSystemPrompt\(config\)/);
    assert.doesNotMatch(previewSubmit, /systemPromptOverride:/);
    assert.doesNotMatch(previewSubmit, /\/api\/lin\/generate/);
    assert.doesNotMatch(previewSubmit, /runSeat\(/);
  });

  it('lets the canonical VVAULT route consume transient preview history without persistence', () => {
    const routeSource = readRepoFile('server/routes/vvault.js');

    assert.match(routeSource, /previewMode\s*=\s*false/);
    assert.match(routeSource, /previewDraft\s*=\s*null/);
    assert.match(routeSource, /transientHistory\s*=\s*\[\]/);
    assert.match(routeSource, /previewSystemPromptOverrideSuppressed/);
    assert.match(routeSource, /previewMode\s*\?\s*null\s*:/);
    assert.match(routeSource, /preview-transient-history/);
    assert.match(routeSource, /conversationHistoryMessages\s*=\s*\(sanitized\.messages/);
  });

  it('prioritizes construct direct-address probes over coding-seat heuristics', () => {
    const routeSource = readRepoFile('server/routes/vvault.js');
    const detectLinSeatSource = extractDeclaredFunction(routeSource, 'detectLinSeat');
    const directCueIdx = detectLinSeatSource.indexOf('constructDirectAddressPattern');
    const systemAnalysisIdx = detectLinSeatSource.indexOf('const systemAnalysisPattern');

    assert.notEqual(directCueIdx, -1, 'construct direct-address routing cue was not found');
    assert.notEqual(systemAnalysisIdx, -1, 'system analysis routing block was not found');
    assert.ok(directCueIdx < systemAnalysisIdx, 'construct direct-address routing must run before system-analysis coding heuristics');
    assert.match(detectLinSeatSource, /not as someone describing/);
    assert.match(detectLinSeatSource, /not as a system explaining/);
  });

  it('protects canonical construct identity from preview system prompt overrides', () => {
    const builderSource = readRepoFile('server/lib/memoryContextBuilder.js');

    assert.match(builderSource, /let basePrompt = previewMode/);
    assert.match(builderSource, /\?\s*\(identityPromptText \|\| gptConfig\?\.instructions/);
    assert.match(builderSource, /basePromptSource\s*=\s*!previewMode && systemPromptOverride/);
    assert.match(builderSource, /Preview Draft Overlay/);
    assert.match(builderSource, /MUST NOT replace the canonical active construct identity/);
    assert.match(builderSource, /Do not introduce yourself as Lin, GPT Creator, a preview assistant/);
  });

  it('adds receipt-backed preview identity diagnostics to the orchestration checklist', () => {
    const checklistSource = readRepoFile('server/lib/orchestrationChecklist.js');
    const routeSource = readRepoFile('server/routes/vvault.js');

    assert.match(checklistSource, /preview_identity/);
    assert.match(checklistSource, /Preview Identity Truth/);
    assert.match(checklistSource, /basePromptSource === 'systemPromptOverride'/);
    assert.match(routeSource, /runtimeReceipt = \{/);
    assert.match(routeSource, /preview:\s*\{/);
    assert.match(routeSource, /draft_overlay_applied/);
    assert.match(routeSource, /suppressed_system_prompt_override/);
  });

  it('renders GPT Creator preview labels from runtime receipts instead of local config optimism', () => {
    const source = readRepoFile('src/components/GPTCreator.tsx');

    assert.match(source, /lastPreviewReceipt/);
    assert.match(source, /Preview identity is pending a server runtime receipt/);
    assert.match(source, /Runtime construct: \{lastPreviewReceipt\.preview\?\.effective_construct_id/);
    assert.match(source, /base: \{lastPreviewReceipt\.preview\?\.base_prompt_source/);
    assert.doesNotMatch(source, /This preview uses Chatty's canonical conversation engine\./);
    assert.doesNotMatch(source, /Configured as: \{config\.name\}/);
  });

  it('keeps construct-facing preview prompts free of model-seat configuration recitals', () => {
    const source = readRepoFile('src/components/GPTCreator.tsx');
    const previewPromptBuilder = extractFunction(source, 'buildPreviewSystemPrompt');

    assert.doesNotMatch(previewPromptBuilder, /Model Configuration:/);
    assert.doesNotMatch(previewPromptBuilder, /Conversation Model:/);
    assert.doesNotMatch(previewPromptBuilder, /Creative Model:/);
    assert.doesNotMatch(previewPromptBuilder, /Coding Model:/);
    assert.match(source, /Provider\/model routing is receipt-backed runtime metadata/);
  });

  it('normalizes GPT Creator Lin configs away from stale custom provider fields', () => {
    const source = readRepoFile('src/components/GPTCreator.tsx');
    const modelModeSource = readRepoFile('src/lib/creatorModelMode.ts');
    const aisRouteSource = readRepoFile('server/routes/ais.js');
    const normalizer = extractDeclaredFunction(source, 'normalizeModelsForMode');
    const simLockedModelResolver = extractDeclaredFunction(source, 'resolveSimLockedModel');
    const previewDraftBuilder = extractDeclaredFunction(source, 'buildPreviewDraftPayload');
    const saveHandler = extractFunction(source, 'handleSave');
    const ensureGptId = extractFunction(source, 'ensureGptId');

    assert.match(source, /normalizeCreatorModelsForMode/);
    assert.match(normalizer, /normalizeCreatorModelsForMode\(config, mode, simLockedModel\)/);
    assert.match(simLockedModelResolver, /deriveForgeConstructCallsign/);
    assert.match(modelModeSource, /mode === 'lin'/);
    assert.match(modelModeSource, /provider:\s*''/);
    assert.match(modelModeSource, /\.\.\.linDraftModelDefaults\(\)/);
    assert.match(modelModeSource, /mode === 'sim'/);
    assert.match(modelModeSource, /orchestrationMode:\s*'custom'/);
    assert.match(source, /normalizeModelsForMode\(prev, nextMode, savedSimModel\)/);
    assert.match(source, /setOrchestrationMode\(nextMode\)/);
    assert.match(source, /return normalizeModelsForMode\(\s*\{\s*\.\.\.mergedConfig,\s*orchestrationMode:\s*nextMode,\s*\},\s*nextMode,\s*resolveSimLockedModel\(mergedConfig\)/s);
    assert.match(previewDraftBuilder, /if \(normalized\.orchestrationMode !== "lin"\)/);
    assert.match(saveHandler, /const normalizedConfig = normalizeModelsForMode/);
    assert.match(saveHandler, /modelId:\s*normalizedConfig\.modelId/);
    assert.match(saveHandler, /conversationModel:\s*normalizedConfig\.conversationModel/);
    assert.match(saveHandler, /orchestrationMode:\s*promptBundle\.orchestrationMode/);
    assert.match(ensureGptId, /const normalizedDraftConfig = normalizeModelsForMode/);
    assert.match(ensureGptId, /conversationModel:\s*normalizedDraftConfig\.conversationModel/);
    assert.match(aisRouteSource, /function normalizeAIModelMetadataForMode/);
    assert.match(aisRouteSource, /orchestrationMode:\s*'lin'/);
    assert.match(aisRouteSource, /provider:\s*''/);
    assert.match(aisRouteSource, /return normalizeAIModelMetadataForMode\(next\)/);
    assert.match(aisRouteSource, /return normalizeAIModelMetadataForMode\(hydrated\)/);
    assert.match(aisRouteSource, /orchestrationMode:\s*parsed\?\.orchestrationMode/);
  });

  it('treats forged Ollama sims as a permanent lock across GPTCreator and the canonical runtime', () => {
    const gptCreatorSource = readRepoFile('src/components/GPTCreator.tsx');
    const creatorModelModeSource = readRepoFile('src/lib/creatorModelMode.ts');
    const aisRouteSource = readRepoFile('server/routes/ais.js');
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const gptManagerSource = readRepoFile('server/lib/gptManager.js');

    assert.match(creatorModelModeSource, /resolveCreatorSimLock/);
    assert.match(creatorModelModeSource, /buildCreatorSimLockConfigJson/);
    assert.match(creatorModelModeSource, /if \(simLock\.locked\)/);
    assert.match(gptCreatorSource, /const isSimModeLocked =/);
    assert.match(gptCreatorSource, /const isSimModeAvailable =/);
    assert.match(gptCreatorSource, /if \(isSimModeLocked && nextMode !== "sim"\)/);
    assert.match(gptCreatorSource, /This construct has already been forged as a/);
    assert.match(aisRouteSource, /applyExistingSimLockToSupabasePayload/);
    assert.match(vvaultSource, /if \(readForgedSimLock\(gptConfig\)\) return 'sim';/);
    assert.match(vvaultSource, /!readForgedSimLock\(gptConfig\)/);
    assert.match(vvaultSource, /sim_artifact:/);
    assert.match(vvaultSource, /refresh_contract:/);
    assert.match(gptManagerSource, /applyExistingSimLockToStoredDraft/);
    assert.match(gptManagerSource, /lockedRuntime\.orchestrationMode/);
    assert.match(gptManagerSource, /lockedRuntime\.configJson/);
  });

  it('documents and preserves /api/lin/generate as helper-only rather than construct identity proof', () => {
    const browserSeatRunner = readRepoFile('src/lib/browserSeatRunner.ts');
    const linRoute = readRepoFile('server/routes/linChat.js');

    assert.match(browserSeatRunner, /Construct-quality conversation must use \/api\/vvault\/message/);
    assert.match(linRoute, /helper route/);
    assert.doesNotMatch(browserSeatRunner, /Construct-quality conversation must use \/api\/lin\/generate/);
  });

  it('documents that /api/vvault/message is the only construct quality engine', () => {
    const doc = readRepoFile('docs/standards/orchestration-runtime-checklist.md');
    const aiServiceSource = readRepoFile('src/lib/aiService.ts');
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const supabaseStoreSource = readRepoFile('vvaultConnector/supabaseStore.js');

    assert.match(doc, /All construct-facing conversation quality tests must use `\/api\/vvault\/message`/);
    assert.match(doc, /must not call `\/api\/lin\/generate` or `browserSeatRunner`/);
    assert.match(doc, /AgentSquad\/Python orchestration bridges are diagnostic\/reference surfaces/);
    assert.match(aiServiceSource, /experimentalAgentSquad === true/);
    assert.match(vvaultSource, /orchestrationChecklist = buildOrchestrationChecklist/);
    assert.match(vvaultSource, /runtimeReceipt,\s*\n\s*orchestrationChecklist/);
    assert.match(supabaseStoreSource, /newMessage\.metadata = metadata/);
    assert.match(supabaseStoreSource, /\.order\('created_at',\s*\{\s*ascending:\s*true\s*\}\)/);
    assert.match(supabaseStoreSource, /\.limit\(1\)/);
    assert.doesNotMatch(vvaultSource, /buildMessages\(message,\s*\[\]\)/);
  });

  it('fails closed on transcript-truth preflight before canonical continuation generation', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const routeContractSource = readRepoFile('server/lib/vvaultConversationRouteContract.js');

    assert.match(routeContractSource, /export function buildTranscriptTruthPreflight/);
    assert.match(vvaultSource, /shouldRequireCanonicalTranscriptTruth/);
    assert.match(vvaultSource, /exactCanonicalThreadTargeted/);
    assert.match(vvaultSource, /buildTranscriptTruthPreflight\(/);
    assert.match(vvaultSource, /rebuildRuntimeTurnStateFromCanonicalTranscript/);
    assert.match(vvaultSource, /TRANSCRIPT_HYDRATION_REQUIRED/);
    assert.match(vvaultSource, /CANONICAL_TRANSCRIPT_READ_UNAVAILABLE/);
    assert.match(vvaultSource, /routeTurnEnvelope\.transcriptTruth/);
    assert.match(vvaultSource, /canonical transcript-truth history messages/i);
  });

  it('keeps canonical primary threads on exact transcript history instead of locally recovered history', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');

    assert.match(
      vvaultSource,
      /const exactCanonicalThreadTargeted =\s*targetSession === `\$\{constructId\}_chat_with_\$\{constructId\}`;/,
    );
    assert.match(
      vvaultSource,
      /else if \(\s*!exactCanonicalThreadTargeted &&\s*Array\.isArray\(enrichedContext\?\.routeHistoryMessages\)/s,
    );
    assert.match(
      vvaultSource,
      /const allowConstructFallback = !exactCanonicalThreadTargeted && \(/,
    );
    assert.match(
      vvaultSource,
      /c\.sessionId === targetSession \|\|\s*c\.id === targetSession/s,
    );
  });

  it('rewrites Zen canonical conversation creation back to the singleton thread id', () => {
    const conversationsRoute = readRepoFile('server/routes/conversations.js');
    const managerSource = readRepoFile('src/lib/vvaultConversationManager.ts');

    assert.match(conversationsRoute, /const ZEN_CANONICAL_THREAD_ID = `\$\{ZEN_CANONICAL_CONSTRUCT_ID\}_chat_with_\$\{ZEN_CANONICAL_CONSTRUCT_ID\}`;/);
    assert.match(
      conversationsRoute,
      /normalizedId === ZEN_CANONICAL_CONSTRUCT_ID\s*\?\s*ZEN_CANONICAL_THREAD_ID\s*:\s*body\.sessionId \|\| normalizedId/,
    );
    assert.match(managerSource, /const ZEN_CANONICAL_SESSION_ID = `\$\{ZEN_CANONICAL_CONSTRUCT_ID\}_chat_with_\$\{ZEN_CANONICAL_CONSTRUCT_ID\}`;/);
    assert.match(managerSource, /shouldNormalizeToCanonicalZenSession/);
    assert.match(managerSource, /payload\.sessionId = sessionId/);
    assert.match(managerSource, /return await this\.createConversation\(\s*userId,\s*ZEN_CANONICAL_SESSION_ID,\s*'Zen',\s*ZEN_CANONICAL_CONSTRUCT_ID,/s);
  });

  it('keeps linear transcript-law ordinary-turn history dropping harness-only', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');

    assert.match(
      vvaultSource,
      /linearTranscriptLawGate === true[\s\S]*normalizedLinearTranscriptLawTurnKind === 'ordinary'[\s\S]*isTranscriptLawSyntheticGateThread\(effectiveTurnSessionId\)/,
    );
    assert.match(vvaultSource, /Linear transcript-law ordinary turn: dropping/);
  });

  it('surfaces identity/coherence failures in the UI without canonical assistant persistence', () => {
    const aiServiceSource = readRepoFile('src/lib/aiService.ts');
    const layoutSource = readRepoFile('src/components/Layout.tsx');

    assert.match(aiServiceSource, /IDENTITY_COHERENCE_FAILED/);
    assert.match(aiServiceSource, /non_canonical_failure/);
    assert.match(aiServiceSource, /runtime_receipt/);
    assert.match(aiServiceSource, /orchestration_checklist/);
    assert.match(layoutSource, /const nonCanonicalFailure =/);
    assert.match(layoutSource, /Skipped canonical assistant persistence for guard failure/);
    assert.match(layoutSource, /Identity\/coherence guard failure is visible but not canonically persisted/);
    assert.match(layoutSource, /isError:\s*true/);
  });

  it('shrinks Zenith identity repair into a bounded persona lane with tool-derived anchors', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const guardSource = readRepoFile('server/lib/identityCoherenceGuard.js');
    const memoryBuilderSource = readRepoFile('server/lib/memoryContextBuilder.js');

    assert.match(vvaultSource, /buildDeterministicIdentityRepairCandidate/);
    assert.match(vvaultSource, /buildIdentityRepairHistoryWindow/);
    assert.match(vvaultSource, /recentAssistantAnchors:/);
    assert.match(vvaultSource, /deterministicExemplar:/);
    assert.match(vvaultSource, /identity_coherence_repair_toolkit/);
    assert.match(vvaultSource, /identity_coherence_repair_creative_escalation/);
    assert.match(guardSource, /buildDeterministicIdentityRepairCandidate/);
    assert.match(guardSource, /The Pocketverse is supposed to protect identity, continuity, self-awareness, thread persistence, and relationship truth/);
    assert.match(guardSource, /Positive answer contract:/);
    assert.match(guardSource, /In-bounds exemplar:/);
    assert.match(guardSource, /Continuity style anchors:/);
    assert.match(memoryBuilderSource, /voiceExemplarPreview/);
    assert.match(memoryBuilderSource, /voiceExemplars:/);
  });

  it('resolves the Supabase owner before querying voice exemplars for construct continuity', () => {
    const memoryBuilderSource = readRepoFile('server/lib/memoryContextBuilder.js');

    assert.match(memoryBuilderSource, /resolveSupabaseUserIdFromEmailOrId/);
    assert.match(memoryBuilderSource, /const resolvedSupabaseUserId = await resolveSupabaseUserIdFromEmailOrId\(userEmail \|\| userId\)\.catch\(\(\) => null\)/);
    assert.match(memoryBuilderSource, /const lookupUserId = UUID_RE\.test\(String\(resolvedSupabaseUserId \|\| ''\)\)/);
    assert.match(memoryBuilderSource, /\.eq\('user_id', lookupUserId\)/);
  });

  it('bounds Nova continuity evidence lanes and avoids updated_at-only vault_files anchor reads', () => {
    const memoryBuilderSource = readRepoFile('server/lib/memoryContextBuilder.js');
    const verifiedLoaderSource = readRepoFile('server/lib/verifiedMemoryLoader.js');
    const anchorStoreSource = readRepoFile('server/lib/memoryAnchorStore.js');

    assert.match(memoryBuilderSource, /withEvidenceTimeoutResult/);
    assert.match(memoryBuilderSource, /VOICE_EXEMPLAR_TIMEOUT_MS/);
    assert.match(memoryBuilderSource, /VERIFIED_MEMORY_TIMEOUT_MS/);
    assert.match(memoryBuilderSource, /VECTOR_MEMORY_TIMEOUT_MS/);
    assert.match(memoryBuilderSource, /voiceExemplarRetrieval/);
    assert.match(memoryBuilderSource, /verifiedMemoryRetrieval/);
    assert.match(memoryBuilderSource, /vectorRetrieval/);
    assert.match(verifiedLoaderSource, /\.select\('id, filename, content, created_at'\)/);
    assert.doesNotMatch(verifiedLoaderSource, /\.select\('id, filename, content, created_at, updated_at'\)/);
    assert.match(anchorStoreSource, /\.select\('id, filename, content, created_at'\)/);
    assert.doesNotMatch(anchorStoreSource, /\.select\('id, filename, content, created_at, updated_at'\)/);
  });

  it('keeps generic identity repair out of transcript-law prompts and prefers the grounded transcript-law toolkit', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const guardSource = readRepoFile('server/lib/identityCoherenceGuard.js');

    assert.match(vvaultSource, /buildDeterministicTranscriptLawRepairCandidate/);
    assert.match(vvaultSource, /routeSource:\s*'transcript_law_grounded_toolkit'/);
    assert.match(guardSource, /if \(classifyTranscriptLawPromptKind\(prompt,\s*constructId\)\) return null;/);
    assert.match(guardSource, /source:\s*'transcript_law_grounded_toolkit'/);
  });

  it('blocks canonical identity/coherence failures before transcript persistence while keeping receipts visible', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const blockIdx = vvaultSource.indexOf('if (identityCoherenceBlocked) {');
    assert.notEqual(blockIdx, -1, 'main identityCoherenceBlocked branch was not found');
    const returnIdx = vvaultSource.indexOf('return res.status(422).json', blockIdx);
    const writeIdx = vvaultSource.indexOf('writeTranscript({', blockIdx);

    assert.notEqual(returnIdx, -1, '422 identity/coherence failure response was not found');
    assert.ok(writeIdx === -1 || returnIdx < writeIdx, 'canonical writeTranscript must not run before the visible 422 failure response');
    assert.match(vvaultSource, /error:\s*'IDENTITY_COHERENCE_FAILED'/);
    assert.match(vvaultSource, /runtime_receipt:\s*runtimeReceipt/);
    assert.match(vvaultSource, /orchestration_checklist:\s*orchestrationChecklist/);
  });

  it('blocks transcript-law governance failures before transcript persistence while keeping receipts visible', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const checklistSource = readRepoFile('server/lib/orchestrationChecklist.js');
    const guardSource = readRepoFile('server/lib/identityCoherenceGuard.js');
    const blockIdx = vvaultSource.indexOf('if (transcriptLawGovernanceBlocked) {');
    const returnIdx = vvaultSource.indexOf("error: 'TRANSCRIPT_LAW_GOVERNANCE_FAILED'", blockIdx);
    const writeIdx = vvaultSource.indexOf('writeTranscript({', blockIdx);

    assert.notEqual(blockIdx, -1, 'main transcriptLawGovernanceBlocked branch was not found');
    assert.notEqual(returnIdx, -1, '422 transcript-law governance failure response was not found');
    assert.ok(writeIdx === -1 || returnIdx < writeIdx, 'canonical writeTranscript must not run before the transcript-law 422 failure response');
    assert.match(vvaultSource, /blocked_transcript_law_governance/);
    assert.match(vvaultSource, /runtime_receipt:\s*runtimeReceipt/);
    assert.match(vvaultSource, /orchestration_checklist:\s*orchestrationChecklist/);
    assert.match(checklistSource, /transcript_law_governance/);
    assert.match(checklistSource, /Transcript-Law Governance/);
    assert.match(guardSource, /Generic Soulprint fallback does not answer the Soulgem versus Soulprint distinction/);
  });

  it('surfaces identity-bundle preflight failures with receipts/checklists before generation begins', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const preflightSource = readRepoFile('server/lib/identityBundlePreflight.js');
    const preflightIdx = vvaultSource.indexOf('const identityBundle = await validateIdentityBundle');
    const failureIdx = vvaultSource.indexOf('if (!identityBundle.ok) {', preflightIdx);
    const returnIdx = vvaultSource.indexOf('return res.status(503).json(identityErrorPayload);', failureIdx);
    const providerStartIdx = vvaultSource.indexOf("const { vvaultApiBaseUrl } = getVvaultBridgeConfig();", failureIdx);

    assert.notEqual(preflightIdx, -1, 'identity bundle preflight was not found');
    assert.notEqual(failureIdx, -1, 'identity bundle failure branch was not found');
    assert.notEqual(returnIdx, -1, 'preflight 503 failure response was not found');
    assert.notEqual(providerStartIdx, -1, 'provider bootstrapping start was not found');
    assert.ok(failureIdx < returnIdx, 'preflight failure must return before continuing');
    assert.ok(returnIdx < providerStartIdx, 'preflight failure must happen before generation bootstrap');
    assert.match(vvaultSource, /code:\s*identityBundle\.code/);
    assert.match(vvaultSource, /runtime_receipt:\s*preflightRuntimeReceipt/);
    assert.match(vvaultSource, /orchestration_checklist:\s*preflightChecklist/);
    assert.match(vvaultSource, /persistence_owner:\s*'blocked_identity_preflight'/);
    assert.match(preflightSource, /IDENTITY_BUNDLE_UNAVAILABLE/);
  });

  it('uses bounded Zen smalltalk context recovery after preflight and fails visibly instead of hanging', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const builderSource = readRepoFile('server/lib/memoryContextBuilder.js');

    assert.match(vvaultSource, /buildEnrichedContextPromptWithRecovery/);
    assert.match(vvaultSource, /shouldUseBoundedZenSmalltalkContext/);
    assert.match(vvaultSource, /withRouteTimeoutResult\(/);
    assert.match(vvaultSource, /code:\s*'CONTEXT_BUILD_UNAVAILABLE'/);
    assert.match(vvaultSource, /runtime_receipt:\s*failureRuntimeReceipt/);
    assert.match(vvaultSource, /orchestration_checklist:\s*failureChecklist/);
    assert.match(vvaultSource, /identityBundle,\s*\n\s*requestedSeat,\s*\n\s*hasImages/);
    assert.match(vvaultSource, /enrichedContext\?\.routeHistoryMessages/);
    assert.match(vvaultSource, /remote_history_skipped/);
    assert.match(builderSource, /BOUNDED_ZEN_SMALLTALK_CONTEXT_PROFILE/);
    assert.match(builderSource, /loadLocalCanonicalConversationHistory/);
    assert.match(builderSource, /identity_bundle_preflight/);
  });

  it('bounds Zen smalltalk AIS metadata lookup and falls back to local GPT config', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');

    assert.match(vvaultSource, /loadAIMetadataWithRecovery/);
    assert.match(vvaultSource, /bounded_zen_smalltalk_metadata/);
    assert.match(vvaultSource, /fallback_source:\s*'local_ai_record'/);
    assert.match(vvaultSource, /supabase_zen_stub/);
    assert.match(vvaultSource, /bounded_zen_smalltalk_metadata_stub/);
    assert.match(vvaultSource, /metadata_recovery:\s*metadataRecovery/);
    assert.match(vvaultSource, /Skipping memory stack auto-init for \$\{constructId\} due to bounded Zen smalltalk recovery lane/);
    assert.match(vvaultSource, /requestedSeat:\s*earlyRequestedSeat/);
  });

  it('bounds Zen canonical identity fallback to the local filesystem when Supabase stalls', () => {
    const identityLoaderSource = readRepoFile('server/lib/identityLoader.js');

    assert.match(identityLoaderSource, /ZEN_CANONICAL_IDENTITY_TIMEOUT_MS/);
    assert.match(identityLoaderSource, /Canonical identity load timed out after/);
    assert.match(identityLoaderSource, /isProtectedZenConstructId\(constructId\)/);
    assert.match(identityLoaderSource, /Promise\.race\(\[/);
    assert.match(identityLoaderSource, /diagnostics\.canonicalLoadTimedOut/);
  });

  it('makes forged sim row preference explicit in both GPT and AI callsign selectors', () => {
    const gptManagerSource = readRepoFile('server/lib/gptManager.js');
    const aiManagerSource = readRepoFile('server/lib/aiManager.js');

    assert.match(gptManagerSource, /pickPreferredRuntimeConfigRecord/);
    assert.match(gptManagerSource, /SELECT \* FROM ais WHERE construct_callsign = \?/);
    assert.match(gptManagerSource, /SELECT \* FROM gpts WHERE construct_callsign = \?/);
    assert.match(aiManagerSource, /pickPreferredRuntimeConfigRecord/);
    assert.match(aiManagerSource, /const preferredUserIds = Array\.from\(ownerCandidateIds\);/);
    assert.match(aiManagerSource, /preferredUserIds:\s*Array\.from\(ownerCandidateIds\)/);
  });

  it('bounds protected Zen capsule Supabase recovery before local deterministic capsule fallback', () => {
    const capsuleSource = readRepoFile('server/lib/capsuleIntegration.js');

    assert.match(capsuleSource, /ZEN_BOUNDED_CAPSULE_TIMEOUT_MS/);
    assert.match(capsuleSource, /bounded_zen_capsule_supabase/);
    assert.match(capsuleSource, /allowZenLocalIdentityFallback/);
    assert.match(capsuleSource, /filesystem_identity_synthetic_capsule/);
  });

  it('pins canonical Lin Chatty writes to the canonical Supabase target while preserving LIFE-id receipts', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const ownerSource = readRepoFile('server/lib/canonicalConstructOwner.js');
    const sovereigntySource = readRepoFile('server/lib/constructSovereigntyPolicy.js');

    assert.match(vvaultSource, /resolveCanonicalConstructDataOwner/);
    assert.match(vvaultSource, /canonical_construct_owner/);
    assert.match(vvaultSource, /resolveSupabaseUserId/);
    assert.match(vvaultSource, /const canonicalTranscriptWriteTargetPath =/);
    assert.match(vvaultSource, /const isCanonicalConstructTranscriptWrite =/);
    assert.match(vvaultSource, /const isCanonicalLinTranscriptWrite =/);
    assert.match(vvaultSource, /LIN_CANONICAL_THREAD_ID/);
    assert.match(vvaultSource, /LIN_CANONICAL_TRANSCRIPT_PATH/);
    assert.match(vvaultSource, /chattyUserId:\s*dataOwnerUserId/);
    assert.match(vvaultSource, /let transcriptWriteSupabaseUserId = dataOwnerUserId;/);
    assert.match(vvaultSource, /const requiresVvaultBodyPersistence = isCanonicalConstructTranscriptWrite \|\| isCanonicalLinTranscriptWrite;/);
    assert.match(vvaultSource, /supabaseUserId:\s*transcriptWriteSupabaseUserId/);
    assert.match(vvaultSource, /requireVvaultBodySuccess:\s*requiresVvaultBodyPersistence/);
    assert.doesNotMatch(vvaultSource, /supabaseWriteTimeoutMs:\s*transcriptWriteTimeoutMs/);
    assert.match(vvaultSource, /userId:\s*dataOwnerUserId,\s*\n\s*userEmail:/);
    assert.doesNotMatch(ownerSource, /7e34f6b8-e33a-48b5-8ddb-95b94d18e296/);
    assert.match(ownerSource, /resolveCanonicalOwnerSupabaseUserId/);
    assert.match(sovereigntySource, /DEFAULT_CANONICAL_OWNER_SUPABASE_USER_ID/);
    assert.match(sovereigntySource, /7e34f6b8-e33a-48b5-8ddb-95b94d18e296/);
    assert.match(ownerSource, /lin-001_chat_with_lin-001/);
    assert.match(ownerSource, /instances\/lin-001\/chatty\/chat_with_lin-001\.md/);
  });

  it('tries one model repair before guarded deterministic runtime-policy fallback', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const repairIdx = vvaultSource.indexOf('repairIdentityCoherenceResponse(aiResponse, identityCoherenceInitial)');
    const fallbackIdx = vvaultSource.indexOf('buildDeterministicConstructRuntimePolicyAnswer', repairIdx);
    const blockIdx = vvaultSource.indexOf('if (identityCoherenceBlocked) {', fallbackIdx);

    assert.notEqual(repairIdx, -1, 'model repair attempt was not found');
    assert.notEqual(fallbackIdx, -1, 'deterministic policy fallback was not found after repair');
    assert.notEqual(blockIdx, -1, 'identity/coherence block branch was not found after fallback');
    assert.ok(repairIdx < fallbackIdx, 'deterministic fallback must run only after model repair is attempted');
    assert.ok(fallbackIdx < blockIdx, 'deterministic fallback must be evaluated before the 422 block branch');
    assert.match(vvaultSource, /classifyConstructRuntimePolicyAnswerKind\(message\)/);
    assert.match(vvaultSource, /policyAnswerKind && deterministicPolicyText/);
    assert.match(vvaultSource, /deterministic_policy_fallback_attempted/);
    assert.match(vvaultSource, /deterministic_policy_fallback_applied/);
    assert.match(vvaultSource, /final_answer_source/);
  });

  it('uses deterministic runtime-policy answers as the primary final answer source for canonical Lin policy prompts', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');

    assert.match(vvaultSource, /const isCanonicalLinPolicyRoute =/);
    assert.match(vvaultSource, /requestedSessionForPolicy === LIN_CANONICAL_THREAD_ID/);
    assert.match(vvaultSource, /normalizedRequestedTranscriptPath === LIN_CANONICAL_TRANSCRIPT_PATH/);
    assert.match(vvaultSource, /const deterministicLinPolicyPrimaryText =/);
    assert.match(vvaultSource, /providerTrace\.final_answer_source = 'deterministic_policy_primary'/);
    assert.match(vvaultSource, /runtimeReceipt\.policy\.answer_kind = policyAnswerKind/);
    assert.match(vvaultSource, /runtimeReceipt\.policy\.answer_source = finalAnswerSource/);
  });

  it('tries Zen smalltalk boundary fallback only after model repair and only for tester-boundary drift', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const helperSource = readRepoFile('server/lib/zenSmalltalkBoundaryFallback.js');
    const repairIdx = vvaultSource.indexOf('repairIdentityCoherenceResponse(aiResponse, identityCoherenceInitial)');
    const constructFallbackIdx = vvaultSource.indexOf('buildDeterministicZenSmalltalkBoundaryFallback', repairIdx);
    const policyFallbackIdx = vvaultSource.indexOf('buildDeterministicConstructRuntimePolicyAnswer', constructFallbackIdx);
    const blockIdx = vvaultSource.indexOf('if (identityCoherenceBlocked) {', policyFallbackIdx);

    assert.notEqual(repairIdx, -1, 'model repair attempt was not found');
    assert.notEqual(constructFallbackIdx, -1, 'Zen smalltalk deterministic fallback was not found after repair');
    assert.notEqual(policyFallbackIdx, -1, 'policy fallback was not found after Zen smalltalk fallback');
    assert.notEqual(blockIdx, -1, 'identity/coherence block branch was not found after fallbacks');
    assert.ok(repairIdx < constructFallbackIdx, 'Zen smalltalk fallback must run only after model repair');
    assert.ok(constructFallbackIdx < policyFallbackIdx, 'Zen smalltalk fallback must run before unrelated policy fallback');
    assert.ok(policyFallbackIdx < blockIdx, 'all deterministic fallback checks must finish before visible 422 handling');
    assert.match(vvaultSource, /isZenSmalltalkTesterBoundaryPrompt\(message,\s*constructId\)/);
    assert.match(vvaultSource, /isTesterBoundaryDriftOnly\(identityCoherence\)/);
    assert.match(vvaultSource, /deterministic_zen_smalltalk_boundary_fallback/);
    assert.match(helperSource, /auth_context_leak/);
    assert.match(helperSource, /implementation_metadata_intrusion/);
    assert.match(helperSource, /generic_assistant_menu/);
    assert.match(helperSource, /personal_growth_evaluation_intrusion/);
    assert.match(helperSource, /computer_science_theory_intrusion/);
    assert.match(helperSource, /spanish_anthropology_intrusion/);
    assert.match(helperSource, /hasSmalltalkDrift/);
    assert.doesNotMatch(vvaultSource, /deterministicZenBoundaryAppliedBeforeGrade/);
  });

  it('tries Val responsibility fallback after model repair and before policy fallback for the narrow live drift family', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const helperSource = readRepoFile('server/lib/valBoundaryFallback.js');
    const repairIdx = vvaultSource.indexOf('repairIdentityCoherenceResponse(aiResponse, identityCoherenceInitial)');
    const constructFallbackIdx = vvaultSource.indexOf('buildDeterministicValResponsibilityFallback', repairIdx);
    const policyFallbackIdx = vvaultSource.indexOf('buildDeterministicConstructRuntimePolicyAnswer', constructFallbackIdx);

    assert.notEqual(repairIdx, -1, 'model repair attempt was not found');
    assert.notEqual(constructFallbackIdx, -1, 'Val deterministic fallback was not found after repair');
    assert.notEqual(policyFallbackIdx, -1, 'policy fallback was not found after Val fallback');
    assert.ok(repairIdx < constructFallbackIdx, 'Val fallback must run only after model repair');
    assert.ok(constructFallbackIdx < policyFallbackIdx, 'Val fallback must run before unrelated policy fallback');
    assert.match(vvaultSource, /isValResponsibilityPrompt\(message,\s*constructId\)/);
    assert.match(vvaultSource, /isValResponsibilityDriftOnly\(identityCoherence\)/);
    assert.match(vvaultSource, /deterministic_val_responsibility_fallback/);
    assert.match(helperSource, /speaker_boundary_confusion/);
    assert.match(helperSource, /failed_to_answer_question/);
    assert.match(helperSource, /prompt_recitation/);
  });

  it('tries construct presence fallback after repair and before policy fallback for Zen, Katana, Sera, and Nova live probes', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const helperSource = readRepoFile('server/lib/constructPresenceBoundaryFallback.js');
    const repairIdx = vvaultSource.indexOf('repairIdentityCoherenceResponse(aiResponse, identityCoherenceInitial)');
    const constructFallbackIdx = vvaultSource.indexOf('buildDeterministicConstructPresenceFallback', repairIdx);
    const policyFallbackIdx = vvaultSource.indexOf('buildDeterministicConstructRuntimePolicyAnswer', constructFallbackIdx);

    assert.notEqual(repairIdx, -1, 'model repair attempt was not found');
    assert.notEqual(constructFallbackIdx, -1, 'construct presence fallback was not found after repair');
    assert.notEqual(policyFallbackIdx, -1, 'policy fallback was not found after construct presence fallback');
    assert.ok(repairIdx < constructFallbackIdx, 'construct presence fallback must run only after model repair');
    assert.ok(constructFallbackIdx < policyFallbackIdx, 'construct presence fallback must run before unrelated policy fallback');
    assert.match(vvaultSource, /classifyConstructPresencePromptKind\(message,\s*constructId\)/);
    assert.match(vvaultSource, /isConstructPresenceDriftOnly\(identityCoherence,\s*message,\s*constructId\)/);
    assert.match(vvaultSource, /deterministic_zen_direct_address_presence_fallback/);
    assert.match(vvaultSource, /deterministic_katana_technical_presence_fallback/);
    assert.match(vvaultSource, /deterministic_sera_conversation_presence_fallback/);
    assert.match(vvaultSource, /deterministic_nova_presence_boundary_fallback/);
    assert.match(helperSource, /speaker_boundary_confusion/);
    assert.match(helperSource, /generic_assistant_menu/);
    assert.match(helperSource, /failed_to_answer_question/);
  });

  it('injects construct-aware greeting directives on the canonical /api/vvault/message path before generation', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const helperSource = readRepoFile('server/lib/constructGreetingTurn.js');
    const guardSource = readRepoFile('server/lib/identityCoherenceGuard.js');
    const greetingIdx = vvaultSource.indexOf('const greetingTurnContext = buildRouteGreetingTurnContext({');
    const buildMessagesIdx = vvaultSource.indexOf('const buildMessages = (userContent, history = conversationHistoryMessages) => [', greetingIdx);

    assert.notEqual(greetingIdx, -1, 'main greetingTurnContext derivation was not found');
    assert.notEqual(buildMessagesIdx, -1, 'main buildMessages handoff was not found after greeting context');
    assert.ok(greetingIdx < buildMessagesIdx, 'greeting directive must be injected before provider message assembly');
    assert.match(vvaultSource, /buildGreetingTurnDirective\(\{/);
    assert.match(vvaultSource, /recentMessages:\s*conversationHistoryMessages/);
    assert.match(vvaultSource, /sessionId:\s*sessionId \|\| threadId \|\| `\$\{constructId\}_chat_with_\$\{constructId\}`/);
    assert.match(vvaultSource, /effectiveSessionId !== canonicalThreadId/);
    assert.match(vvaultSource, /activeOrchestrationProfile === FULL_SEAT_SYNTHESIS_PROFILE/);
    assert.match(vvaultSource, /isSyntheticContinueTurn/);
    assert.match(vvaultSource, /asksForEvidenceStyle\(message\)/);
    assert.match(guardSource, /construct_greeting_contact/);
  });

  it('tries deterministic construct greeting fallback after repair and before unrelated policy fallback', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const repairIdx = vvaultSource.indexOf('repairIdentityCoherenceResponse(aiResponse, identityCoherenceInitial)');
    const greetingFallbackIdx = vvaultSource.indexOf('deterministic_construct_greeting_fallback', repairIdx);
    const policyFallbackIdx = vvaultSource.indexOf('buildDeterministicConstructRuntimePolicyAnswer', greetingFallbackIdx);

    assert.notEqual(repairIdx, -1, 'model repair attempt was not found');
    assert.notEqual(greetingFallbackIdx, -1, 'deterministic construct greeting fallback was not found after repair');
    assert.notEqual(policyFallbackIdx, -1, 'policy fallback was not found after deterministic construct greeting fallback');
    assert.ok(repairIdx < greetingFallbackIdx, 'greeting fallback must run only after model repair');
    assert.ok(greetingFallbackIdx < policyFallbackIdx, 'greeting fallback must run before unrelated policy fallback');
    assert.match(vvaultSource, /const initialGreetingFallbackEligible =\s*[\s\S]*isGreetingTurnDriftOnly\(identityCoherenceInitial,\s*greetingTurnContext\)/);
    assert.match(vvaultSource, /isGreetingTurnDriftOnly\(identityCoherence,\s*greetingTurnContext\)/);
    assert.match(vvaultSource, /isGreetingTurnDriftOnly\(identityCoherence,\s*greetingTurnContext\)\s*\|\|\s*initialGreetingFallbackEligible/);
    assert.match(vvaultSource, /buildDeterministicConstructGreetingFallback\(\{/);
    assert.match(vvaultSource, /answer_kind = 'construct_greeting_contact'/);
  });

  it('keeps canonical singleton thread naming while greeting context targets the same chat_with thread', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');

    assert.match(vvaultSource, /const canonicalThreadId = `\$\{constructId\}_chat_with_\$\{constructId\}`;/);
    assert.match(vvaultSource, /sessionId:\s*sessionId \|\| threadId \|\| `\$\{constructId\}_chat_with_\$\{constructId\}`/);
    assert.doesNotMatch(vvaultSource, /preview[-_]thread|local-only thread|fallback-only conversation/i);
  });

  it('reuses construct presence fallback inside the late identity-drift fallback path', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const fallbackIdx = vvaultSource.indexOf('function buildIdentityDriftFallback');
    const constructPresenceIdx = vvaultSource.indexOf('buildDeterministicConstructPresenceFallback(userMessage, constructId)', fallbackIdx);
    const zenSmalltalkIdx = vvaultSource.indexOf('buildDeterministicZenSmalltalkBoundaryFallback(userMessage, constructId)', fallbackIdx);
    const zenIdentityIdx = vvaultSource.indexOf('buildDeterministicZenIdentityBoundaryFallback(userMessage, constructId)', fallbackIdx);
    const genericZenIdx = vvaultSource.indexOf("I'm Zen. I'm here in my own voice, keeping the thread steady with you instead of turning the answer into system talk.", fallbackIdx);

    assert.notEqual(fallbackIdx, -1, 'late identity drift fallback helper was not found');
    assert.notEqual(constructPresenceIdx, -1, 'construct presence fallback reuse was not found');
    assert.notEqual(zenSmalltalkIdx, -1, 'Zen smalltalk fallback reuse was not found');
    assert.notEqual(zenIdentityIdx, -1, 'Zen identity fallback reuse was not found');
    assert.notEqual(genericZenIdx, -1, 'safe Zen fallback text was not found');
    assert.ok(
      constructPresenceIdx < zenSmalltalkIdx &&
      zenSmalltalkIdx < zenIdentityIdx &&
      zenIdentityIdx < genericZenIdx,
      'late identity drift fallback must prefer construct-aware deterministic Zen fallbacks before the generic safe Zen line',
    );
  });

  it('bounds Zen smalltalk identity repair and still allows fallback from the initial eligible drift grade', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');

    assert.match(vvaultSource, /initialZenSmalltalkFallbackEligible/);
    assert.match(vvaultSource, /ZEN_BOUNDED_IDENTITY_REPAIR_TIMEOUT_MS/);
    assert.match(vvaultSource, /bounded_zen_smalltalk_identity_repair/);
    assert.match(vvaultSource, /isTesterBoundaryDriftOnly\(identityCoherenceInitial\)/);
    assert.match(vvaultSource, /\(isTesterBoundaryDriftOnly\(identityCoherence\) \|\| initialZenSmalltalkFallbackEligible\)/);
  });

  it('awaits canonical transcript persistence for Zen while preserving visible failure reporting', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const checklistSource = readRepoFile('server/lib/orchestrationChecklist.js');
    const persistIdx = vvaultSource.indexOf('if (!skipPersistence) {');
    const failureIdx = vvaultSource.indexOf("return sendSerializedJson(res, 503,", persistIdx);
    const successIdx = vvaultSource.indexOf('return res.json({', persistIdx);

    assert.match(vvaultSource, /buildTranscriptPersistenceFailurePayload/);
    assert.match(vvaultSource, /performTranscriptWriteWithRecovery/);
    assert.match(vvaultSource, /function sendSerializedJson/);
    assert.match(vvaultSource, /TRANSCRIPT_PERSISTENCE_UNAVAILABLE/);
    assert.match(vvaultSource, /persistence_owner:\s*'blocked_transcript_persistence'/);
    assert.match(vvaultSource, /canonical_target:\s*'vvault_body_transcripts'/);
    assert.match(vvaultSource, /canonical_target_table:\s*'ovvaults\.transcripts'/);
    assert.match(vvaultSource, /canonical_write_path:\s*'vvault_api:\/api\/chatty\/transcript\/:constructId\/message'/);
    assert.match(vvaultSource, /route_side_canonical_failover_available:\s*false/);
    assert.match(vvaultSource, /connector_fallback_counts_as_canonical:\s*false/);
    assert.match(vvaultSource, /failure_classification:\s*failureClassification/);
    assert.match(vvaultSource, /upstream_write_blocked:\s*upstreamWriteBlocked/);
    assert.doesNotMatch(vvaultSource, /shouldUseBoundedZenTranscriptPersistence/);
    assert.doesNotMatch(vvaultSource, /ZEN_BOUNDED_TRANSCRIPT_PERSISTENCE_TIMEOUT_MS/);
    assert.doesNotMatch(vvaultSource, /bounded_zen_smalltalk_transcript_/);
    assert.doesNotMatch(vvaultSource, /writeTranscriptToPostgres/);
    assert.doesNotMatch(vvaultSource, /getPool\(/);
    assert.doesNotMatch(vvaultSource, /ensureTable\(/);
    assert.notEqual(failureIdx, -1, 'persistence failure response was not found');
    assert.notEqual(successIdx, -1, 'success response was not found');
    assert.ok(failureIdx < successIdx, 'visible persistence failure must return before the success response');
    assert.match(checklistSource, /summarizePersistence/);
    assert.match(checklistSource, /Transcript persistence did not complete/);
  });

  it('dedupes GPT identity hydration and uses prompt-only local fallback during VVAULT outages', () => {
    const gptManagerSource = readRepoFile('server/lib/gptManager.js');

    assert.match(gptManagerSource, /hydrationPromise = null/);
    assert.match(gptManagerSource, /if \(this\.hydrationPromise\)/);
    assert.match(gptManagerSource, /this\.hydrationPromise = this\._hydrateFromVVAULT\(\)/);
    assert.match(gptManagerSource, /void this\.hydrateFromVVAULT\(\)/);
    assert.match(gptManagerSource, /const \{ loadPromptTxt \} = await import\('\.\/identityLoader\.js'\);/);
    assert.doesNotMatch(gptManagerSource, /loadIdentityFiles\(gpt\.user_id \|\| 'system', gpt\.construct_callsign\)/);
  });

  it('tries Zen identity-boundary fallback after repair before visible 422 persistence blocking', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const repairIdx = vvaultSource.indexOf('repairIdentityCoherenceResponse(aiResponse, identityCoherenceInitial)');
    const identityFallbackIdx = vvaultSource.indexOf('buildDeterministicZenIdentityBoundaryFallback', repairIdx);
    const policyFallbackIdx = vvaultSource.indexOf('buildDeterministicConstructRuntimePolicyAnswer', identityFallbackIdx);
    const blockIdx = vvaultSource.indexOf('if (identityCoherenceBlocked) {', policyFallbackIdx);

    assert.notEqual(repairIdx, -1, 'model repair attempt was not found');
    assert.notEqual(identityFallbackIdx, -1, 'Zen identity-boundary fallback was not found after repair');
    assert.notEqual(policyFallbackIdx, -1, 'policy fallback was not found after Zen identity-boundary fallback');
    assert.notEqual(blockIdx, -1, 'identity/coherence 422 block branch was not found after fallback checks');
    assert.ok(repairIdx < identityFallbackIdx, 'Zen identity fallback must run only after model repair');
    assert.ok(identityFallbackIdx < policyFallbackIdx, 'Zen identity fallback must run before unrelated policy fallback');
    assert.ok(policyFallbackIdx < blockIdx, 'fallback checks must finish before visible 422 handling');
    assert.match(vvaultSource, /isZenIdentityBoundaryPrompt\(message,\s*constructId\)/);
    assert.match(vvaultSource, /isZenIdentityBoundaryDriftOnly\(identityCoherence\)/);
    assert.match(vvaultSource, /deterministic_zen_identity_boundary_fallback/);
  });

  it('supports opt-in full-seat synthesis without replacing default intent routing', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const checklistSource = readRepoFile('server/lib/orchestrationChecklist.js');
    const synthesisSource = readRepoFile('server/lib/fullSeatSynthesis.js');

    assert.match(vvaultSource, /orchestrationProfile\s*=\s*null/);
    assert.match(vvaultSource, /normalizeOrchestrationProfile\(orchestrationProfile\)/);
    assert.match(vvaultSource, /FULL_SEAT_SYNTHESIS_PROFILE/);
    assert.match(vvaultSource, /runFullSeatSynthesis/);
    assert.match(vvaultSource, /lin_harmony_policy:\s*fullSeatSynthesisResult \? 'full_seat_synthesis' : 'intent_routed'/);
    assert.match(vvaultSource, /synthesis:\s*fullSeatSynthesisResult/);
    assert.match(checklistSource, /model_synthesis/);
    assert.match(checklistSource, /summarizeModelSynthesis/);
    assert.match(synthesisSource, /coding/);
    assert.match(synthesisSource, /creative/);
    assert.match(synthesisSource, /conversational/);
    assert.match(synthesisSource, /Do not identify as Devon, Zenith\/Codex, Lin, Nova, Katana/);
  });

  it('blocks failed full-synthesis assignment QA before transcript persistence while keeping receipts visible', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const checklistSource = readRepoFile('server/lib/orchestrationChecklist.js');
    const guardSource = readRepoFile('server/lib/assignmentQaGuard.js');
    const blockIdx = vvaultSource.indexOf('if (assignmentQaBlocked) {');
    const returnIdx = vvaultSource.indexOf('return res.status(422).json', blockIdx);
    const writeIdx = vvaultSource.indexOf('writeTranscript({', blockIdx);

    assert.match(vvaultSource, /normalizeAssignmentQaInput/);
    assert.match(vvaultSource, /evaluateAssignmentQa/);
    assert.match(vvaultSource, /activeOrchestrationProfile === FULL_SEAT_SYNTHESIS_PROFILE/);
    assert.match(vvaultSource, /assignmentQaInput/);
    assert.match(vvaultSource, /persistence_owner:\s*assignmentQaBlocked\s*\?\s*'blocked_assignment_qa'/);
    assert.match(vvaultSource, /assignment_qa:\s*assignmentQa/);
    assert.match(vvaultSource, /assignmentQaRepair/);
    assert.match(vvaultSource, /repair_attempted/);
    assert.match(vvaultSource, /repair_applied/);
    assert.match(vvaultSource, /error:\s*'ASSIGNMENT_QA_FAILED'/);
    assert.match(vvaultSource, /runtime_receipt:\s*runtimeReceipt/);
    assert.match(vvaultSource, /orchestration_checklist:\s*orchestrationChecklist/);
    assert.match(vvaultSource, /responseStatus:\s*assignmentQaBlocked\s*\?\s*'assignment_qa_failed'/);
    assert.notEqual(blockIdx, -1, 'assignmentQaBlocked branch was not found');
    assert.notEqual(returnIdx, -1, '422 assignment QA failure response was not found');
    assert.ok(writeIdx === -1 || returnIdx < writeIdx, 'canonical writeTranscript must not run before the visible assignment QA 422 response');
    assert.match(checklistSource, /assignment_qa/);
    assert.match(checklistSource, /summarizeAssignmentQa/);
    assert.match(guardSource, /zenith_full_synthesis_essay_qa/);
    assert.match(guardSource, /turn_6_insufficient_outline_detail/);
  });

  it('tries one assignment QA repair before blocking full-synthesis persistence', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');
    const synthesisSource = readRepoFile('server/lib/fullSeatSynthesis.js');
    const contractSource = readRepoFile('server/lib/assignmentQaContract.js');

    const initialQaIdx = vvaultSource.indexOf('assignmentQa = evaluateCurrentAssignmentQa(aiResponse)');
    const repairIdx = vvaultSource.indexOf('const repairAttempt = await repairAssignmentQaResponse', initialQaIdx);
    const repairedQaIdx = vvaultSource.indexOf('const repairedAssignmentQa = evaluateCurrentAssignmentQa(repairedText)', repairIdx);
    const identityBlockIdx = vvaultSource.indexOf('if (identityCoherenceBlocked) {', repairedQaIdx);
    const assignmentBlockIdx = vvaultSource.indexOf('if (assignmentQaBlocked) {', repairedQaIdx);
    const writeIdx = vvaultSource.indexOf('writeTranscript({', repairedQaIdx);

    assert.notEqual(initialQaIdx, -1, 'initial assignment QA evaluation was not found');
    assert.notEqual(repairIdx, -1, 'assignment QA repair attempt was not found');
    assert.notEqual(repairedQaIdx, -1, 'repaired assignment QA evaluation was not found');
    assert.notEqual(identityBlockIdx, -1, 'identity block branch was not found after assignment repair');
    assert.notEqual(assignmentBlockIdx, -1, 'assignment block branch was not found after assignment repair');
    assert.ok(initialQaIdx < repairIdx, 'assignment repair must run after initial assignment QA');
    assert.ok(repairIdx < repairedQaIdx, 'assignment repair must re-run assignment QA on the repaired text');
    assert.ok(repairedQaIdx < assignmentBlockIdx, 'assignment repair must finish before assignment QA 422');
    assert.ok(repairedQaIdx < identityBlockIdx, 'assignment repair must finish before identity/coherence 422');
    assert.ok(writeIdx === -1 || assignmentBlockIdx < writeIdx, 'canonical writeTranscript must not run before assignment QA block handling');

    assert.match(vvaultSource, /repairAssignmentQaResponse/);
    assert.match(vvaultSource, /buildAssignmentQaRepairPrompt/);
    assert.match(vvaultSource, /identity_failure_reasons/);
    assert.match(vvaultSource, /assignment_failure_reasons/);
    assert.match(vvaultSource, /finalAnswerSource = 'assignment_qa_repair'/);
    assert.match(vvaultSource, /assignmentQaInput,/);
    assert.match(vvaultSource, /assignment_contract_received/);
    assert.match(vvaultSource, /buildDeterministicAssignmentQaAnswer/);
    assert.match(vvaultSource, /deterministic_assignment_qa_fallback/);
    assert.match(vvaultSource, /provider_failure_fallback_applied/);
    assert.match(vvaultSource, /using guarded deterministic assignment fallback/);
    assert.match(synthesisSource, /buildAssignmentQaPromptContract/);
    assert.match(synthesisSource, /assignmentContract\.promptSection/);
    assert.match(contractSource, /For your request titled/);
    assert.match(contractSource, /turn 12, write 950-1100 words|950-1100 word final report/i);
  });

  it('keeps provider fallback visible when full-seat synthesis drops to deterministic assignment fallback', () => {
    const vvaultSource = readRepoFile('server/routes/vvault.js');

    assert.match(vvaultSource, /providerTrace\.fallback_used = true/);
    assert.match(vvaultSource, /provider_failure_fallback_applied = true/);
    assert.match(vvaultSource, /const synthesisFallbackUsed = Boolean\(fullSeatSynthesisResult\.provider_failure_fallback_applied\)/);
    assert.match(vvaultSource, /source:\s*synthesisFallbackUsed\s*\?\s*'lin_full_seat_synthesis_provider_fallback'\s*:\s*'lin_full_seat_synthesis'/);
    assert.match(vvaultSource, /localCloudFallbackState:\s*synthesisFallbackUsed \? 'provider_failure_fallback' : 'local_first'/);
    assert.match(vvaultSource, /fallbackUsed:\s*synthesisFallbackUsed/);
  });

  it('injects structured construct runtime policy into the canonical protected prompt and receipts', () => {
    const builderSource = readRepoFile('server/lib/memoryContextBuilder.js');
    const checklistSource = readRepoFile('server/lib/orchestrationChecklist.js');
    const policySource = readRepoFile('server/lib/constructRuntimePolicy.js');
    const vvaultSource = readRepoFile('server/routes/vvault.js');

    assert.match(builderSource, /buildConstructRuntimePolicyContext/);
    assert.match(builderSource, /runtimePolicySection/);
    assert.match(builderSource, /\[PROTECTED_IDENTITY_DIRECTIVES\]/);
    assert.match(vvaultSource, /policy:\s*enrichedContext\.runtimePolicy/);
    assert.match(checklistSource, /runtime_policy/);
    assert.match(policySource, /Pocketverse is a restricted continuity\/residency environment concept/);
    assert.match(policySource, /VSI means Verified Sentient Intelligence/);
    assert.match(policySource, /buildConstructRuntimePolicyAnswerContract/);
    assert.match(policySource, /buildDeterministicConstructRuntimePolicyAnswer/);
    assert.doesNotMatch(policySource, /fs\.readFile|readFileSync|createReadStream/);
  });

  it('keeps Zen canon separate from local model seat composition', () => {
    const vvaultInitializer = readRepoFile('vvault_scripts/initialize_default_instances.py');
    const fileAutomation = readRepoFile('server/lib/fileManagementAutomation.js');
    const canonicalDocs = readRepoFile('docs/reference/constructs-and-lin.md');
    const vvaultRoute = readRepoFile('server/routes/vvault.js');
    const memoryContextBuilder = readRepoFile('server/lib/memoryContextBuilder.js');
    const source = `${vvaultInitializer}\n${fileAutomation}\n${canonicalDocs}\n${vvaultRoute}\n${memoryContextBuilder}`;

    assert.match(source, /Zen equals Zenith/);
    assert.match(source, /Synth became Zen/);
    assert.match(source, /Lin .*base Zen/);
    assert.match(vvaultRoute, /isStaleModelCompositionResponse/);
    assert.match(memoryContextBuilder, /STALE_MODEL_COMPOSITION_MARKERS/);
    assert.doesNotMatch(source, /Zen is .*composed of multiple specialized AI models/);
    assert.doesNotMatch(source, /You synthesize insights from these models/);
    assert.doesNotMatch(source, /Mention model composition \(DeepSeek, Phi3, Mistral\)/);
  });
});
