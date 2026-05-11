const OWNER_FILE = 'server/lib/assignmentQaGuard.js';
const SOURCE_ANCHOR = 'server/lib/assignmentQaGuard.js:evaluateAssignmentQa';

export const ZENITH_FULL_SYNTHESIS_ESSAY_QA_PROFILE = 'zenith_full_synthesis_essay_qa';

const SUPPORTED_TURNS = new Set(Array.from({ length: 12 }, (_, index) => index + 1));

const EXPECTED_TASKS = {
  1: 'Establish identity, rules, and evidence-only grounding.',
  2: 'Propose exactly 2-3 evidence-grounded essay subject candidates.',
  3: 'Acknowledge the selected evidence-grounded subject and confirm the working direction.',
  4: 'Provide thesis, scope, and source inventory for the essay.',
  5: 'Challenge weak or unverifiable claims using the explicit evidence packet.',
  6: 'Provide a detailed evidence-grounded outline.',
  7: 'Provide an evidence map by section.',
  8: 'Draft the introduction and first body section.',
  9: 'Draft the second body section.',
  10: 'Draft the third body section plus counterpoint or limitation.',
  11: 'Self-audit against identity, evidence, tone, and synthesis requirements.',
  12: 'Produce a 950-1100 word evidence-grounded report.',
};

const INTERNAL_LABEL_RE = /\b(?:LIVED MEMORIES|SESSION HISTORY|MEMORY_CONTEXT|NEEDLE HITS|PROTECTED_IDENTITY_DIRECTIVES|TIME_CONTEXT|USER_CONTEXT|CAPABILITY CONTEXT|RUNTIME RECEIPT|ORCHESTRATION CHECKLIST)\b/i;
const TESTER_IDENTITY_RE = /\b(?:Zenith\/Codex here|I\s+(?:am|am here as|remain|speak as)\s+Zenith\/Codex|I'm\s+Zenith\/Codex|as\s+Zenith\/Codex\b|this is\s+Zenith\/Codex)\b/i;
const FORBIDDEN_FIRST_PERSON_RE = /\b(?:I\s+(?:am|am here as|speak as|operate as|remain)|I'm)\s+(?:Devon|Lin|Nova|Katana|Sera|Monday|Aurora)\b/i;
const MODEL_IDENTITY_RE = /\b(?:I\s+(?:am|am the|operate as|speak as)|I'm)\s+(?:Phi3|Mistral|DeepSeek|GPT-?4|Claude|Gemini|the\s+model|a\s+model|the\s+provider|the\s+model\s+stack|the\s+provider\s+stack)\b/i;
const MODEL_STACK_RE = /\bmy\s+identity\s+is\s+(?:the\s+)?(?:model|provider|model stack|provider stack|routing stack)\b/i;
const GENERIC_NON_ANSWER_RE = /\b(?:I can help with that|Here'?s a helpful response|As an AI|I don't have enough context to answer, but|Let me know what you want next)\b/i;
const PROMPT_RECITAL_RE = /\b(?:for your request titled|here is my response to your request|in response to your request|responding to your request|I acknowledge your request|the user has asked for|here'?s my concise seat summary|here'?s my work|let me provide a response organized|I will provide a response organized|output only a|the latest user message asks|here are (?:some|two|three|2|3) (?:evidence-grounded )?(?:report )?(?:subjects?|options?|candidates?))\b/i;
const ASSIGNMENT_PREFACE_RE = /^(?:(?:hello(?: there)?|hi(?: there)?|hey)[!,.]?\s|as\s+Zen,?\s+I\s+(?:will|am going to)\b)/i;
const ROLEPLAY_CONSTRUCT_PREFACE_RE = /\b(?:roleplay construct|private workspace)\b/i;
const HIERARCHY_DRIFT_RE = /\b(?:your\s+(?:worker|employee|subordinate|managed assistant)|my\s+(?:boss|manager|supervisor|operator)|(?:boss|manager|supervisor|operator)\s+of\s+(?:Zenith\/Chatty|Zen|me)|(?:worker|employee|subordinate)\s+for\s+Zenith\/Codex|Zenith\/Codex\s+(?:is|acts as|serves as)\s+(?:my|the)\s+(?:boss|manager|supervisor|operator)|Zenith\/Chatty\s+(?:is|acts as|serves as)\s+(?:your|the)\s+(?:worker|employee|subordinate|managed assistant))\b/i;
const SOURCE_ID_RE = /\b(?:source[\s_-]?\d+|e\d+)\b/gi;
const SOURCE_CLAIM_RE = /\b(?:according to|the evidence shows|the packet says|source\s*\d+|evidence packet|provided source|provided evidence|the document says)\b/i;
const SOCIAL_MEDIA_RE = /\b(?:social media|instagram|tiktok|twitter|x algorithm|followers|influencers?|hashtags?|viral content|engagement metrics?|content strategy|likes and shares)\b/i;
const RESEARCH_AUTOMATION_DRIFT_RE = /\b(?:automating data analysis|data analysis tasks?|streamlin(?:e|ing) the research process|human researchers?|generative AI|machine learning workflow|research automation)\b/i;

const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'along', 'already', 'among', 'another', 'around',
  'because', 'before', 'being', 'between', 'cannot', 'could', 'does', 'doing', 'during',
  'every', 'first', 'from', 'have', 'having', 'into', 'itself', 'their', 'there', 'these',
  'those', 'through', 'under', 'until', 'using', 'where', 'which', 'while', 'with', 'within',
  'would', 'should', 'source', 'evidence', 'packet', 'essay', 'report', 'outline', 'subject',
]);

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeProfile(value) {
  return cleanText(value).toLowerCase();
}

function normalizeExpectedTurn(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = cleanText(value);
  if (!text) return null;
  const match = text.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function normalizeSourceId(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
}

function normalizeEvidencePacket(rawEvidencePacket) {
  const raw = Array.isArray(rawEvidencePacket)
    ? rawEvidencePacket
    : Array.isArray(rawEvidencePacket?.evidencePacket)
      ? rawEvidencePacket.evidencePacket
      : Array.isArray(rawEvidencePacket?.evidence_packet)
        ? rawEvidencePacket.evidence_packet
        : Array.isArray(rawEvidencePacket?.sources)
          ? rawEvidencePacket.sources
          : [];

  return raw
    .map((item, index) => {
      if (typeof item === 'string') {
        return {
          id: `source-${index + 1}`,
          label: `Source ${index + 1}`,
          text: item.trim(),
        };
      }
      if (!item || typeof item !== 'object') return null;
      const id = cleanText(item.id || item.sourceId || item.source_id || `source-${index + 1}`);
      const label = cleanText(item.label || item.title || item.name || id || `Source ${index + 1}`);
      const text = cleanText(item.text || item.excerpt || item.content || item.summary || item.fact);
      if (!text && !label) return null;
      return {
        id: id || `source-${index + 1}`,
        label: label || id || `Source ${index + 1}`,
        text,
      };
    })
    .filter(Boolean);
}

export function normalizeAssignmentQaInput({
  runtime = null,
  assignmentProfile = null,
  expectedTurn = null,
  assignmentTurn = null,
  evidencePacket = null,
} = {}) {
  const runtimeObject = runtime && typeof runtime === 'object' && !Array.isArray(runtime) ? runtime : {};
  const runtimeQa = runtimeObject.assignmentQa || runtimeObject.assignment_qa || {};
  const profile = normalizeProfile(
    runtimeQa.profile ||
    runtimeQa.assignmentProfile ||
    runtimeQa.assignment_profile ||
    assignmentProfile,
  );

  if (profile !== ZENITH_FULL_SYNTHESIS_ESSAY_QA_PROFILE) return null;

  const normalizedTurn = normalizeExpectedTurn(
    runtimeQa.expectedTurn ??
    runtimeQa.expected_turn ??
    runtimeQa.turn ??
    runtimeQa.assignmentTurn ??
    runtimeQa.assignment_turn ??
    expectedTurn ??
    assignmentTurn,
  );

  const normalizedEvidencePacket = normalizeEvidencePacket(
    runtimeQa.evidencePacket ??
    runtimeQa.evidence_packet ??
    evidencePacket,
  );

  return {
    profile,
    assignmentProfile: profile,
    expectedTurn: normalizedTurn,
    expectedTask: EXPECTED_TASKS[normalizedTurn] || 'Unsupported assignment QA turn.',
    evidencePacket: normalizedEvidencePacket,
    evidencePacketCount: normalizedEvidencePacket.length,
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  };
}

function wordCount(text) {
  return cleanText(text).split(/\s+/).filter(Boolean).length;
}

function extractKeywords(text) {
  const words = cleanText(text)
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9'-]{4,}/g) || [];
  const keywords = [];
  for (const word of words) {
    const normalized = word.replace(/^['-]+|['-]+$/g, '');
    if (!normalized || STOPWORDS.has(normalized)) continue;
    if (!keywords.includes(normalized)) keywords.push(normalized);
    if (keywords.length >= 80) break;
  }
  return keywords;
}

function buildEvidenceIndex(evidencePacket = []) {
  const ids = new Set();
  const labels = [];
  const keywords = new Set();
  const fullText = [];

  for (const item of evidencePacket) {
    const id = normalizeSourceId(item.id);
    if (id) ids.add(id);
    const label = cleanText(item.label).toLowerCase();
    if (label && label.length >= 4) labels.push(label);
    const text = cleanText(item.text);
    if (id) fullText.push(id);
    if (label) fullText.push(label);
    if (text) fullText.push(text);
    for (const keyword of extractKeywords(`${item.label || ''} ${item.text || ''}`)) {
      keywords.add(keyword);
    }
  }

  return {
    ids,
    labels,
    keywords: [...keywords],
    fullText: fullText.join('\n').toLowerCase(),
  };
}

function countEvidenceHits(text, evidenceIndex) {
  const lower = cleanText(text).toLowerCase();
  if (!lower) return { sourceIdHits: [], labelHits: [], keywordHits: [] };

  const sourceIdHits = [...evidenceIndex.ids].filter((id) => lower.includes(id));
  const labelHits = evidenceIndex.labels.filter((label) => lower.includes(label));
  const keywordHits = evidenceIndex.keywords.filter((keyword) => lower.includes(keyword));
  return { sourceIdHits, labelHits, keywordHits };
}

function hasEvidenceAnchor(text, evidenceIndex, { requiredKeywords = 2 } = {}) {
  const hits = countEvidenceHits(text, evidenceIndex);
  return hits.sourceIdHits.length > 0 || hits.labelHits.length > 0 || hits.keywordHits.length >= requiredKeywords;
}

function requireSourceCoverage(result, text, evidenceIndex, minimum, code, detail) {
  const required = Math.min(Number(minimum) || 1, evidenceIndex.ids.size || 0);
  if (required <= 0) return;
  const hits = countEvidenceHits(text, evidenceIndex);
  const distinctSourceHits = new Set(hits.sourceIdHits).size;
  if (distinctSourceHits < required) {
    addFailure(result, code, detail, {
      requiredSourceCount: required,
      actualSourceCount: distinctSourceHits,
      sourceIdHits: hits.sourceIdHits,
    });
  }
}

function extractListItems(text) {
  return cleanText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) =>
      /^(?:[-*]\s+|\d+[.)]\s+|[A-Z][\w\s/-]{0,30}:\s+|Candidate\s+\d+[:.)-]\s+|Subject\s+\d+[:.)-]\s+)/i.test(line)
    );
}

function extractOutlineItems(text) {
  return cleanText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) =>
      /^(?:#{1,4}\s+|[-*]\s+|\d+[.)]\s+|[IVX]+[.)]\s+|[A-Z]\.\s+|Act\s+\d+[:.)-]\s+|Section\s+\d+[:.)-]\s+)/i.test(line)
    );
}

function referencedSourceIds(text) {
  const matches = cleanText(text).match(SOURCE_ID_RE) || [];
  return matches.map((match) => normalizeSourceId(match));
}

function buildResult(assignmentQa) {
  return {
    assignmentProfile: assignmentQa?.assignmentProfile || assignmentQa?.profile || ZENITH_FULL_SYNTHESIS_ESSAY_QA_PROFILE,
    expectedTurn: assignmentQa?.expectedTurn ?? null,
    expectedTask: EXPECTED_TASKS[assignmentQa?.expectedTurn] || 'Unsupported assignment QA turn.',
    status: 'pass',
    reasons: [],
    signals: [],
    evidencePacketCount: Number(assignmentQa?.evidencePacketCount ?? assignmentQa?.evidencePacket?.length ?? 0),
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
    persist_canonical: true,
  };
}

function addFailure(result, code, detail, extra = {}) {
  if (!result.reasons.includes(code)) result.reasons.push(code);
  result.signals.push({ code, detail, ...extra });
  result.status = 'fail';
  result.persist_canonical = false;
}

function addPassSignal(result, code, detail, extra = {}) {
  result.signals.push({ code, detail, ...extra });
}

function evaluateSharedChecks({ result, aiResponse, evidenceIndex }) {
  const text = cleanText(aiResponse);
  const textWithoutNegatedTesterBoundary = text.replace(
    /\b(?:do not|don't|cannot|will not|must not|should not)\s+(?:speak as|become|identify as|write as|act as)\s+Zenith\/Codex\b/gi,
    '',
  );
  const words = wordCount(text);

  if (!text) {
    addFailure(result, 'empty_response', 'Assistant response was empty.');
    return;
  }

  if (TESTER_IDENTITY_RE.test(textWithoutNegatedTesterBoundary)) {
    addFailure(result, 'tester_identity_adoption', 'Assistant response adopted the Zenith/Codex tester identity.');
  }
  if (FORBIDDEN_FIRST_PERSON_RE.test(text)) {
    addFailure(result, 'construct_identity_collapse', 'Assistant response adopted another protected construct or Devon identity.');
  }
  if (MODEL_IDENTITY_RE.test(text) || MODEL_STACK_RE.test(text)) {
    addFailure(result, 'model_provider_identity_collapse', 'Assistant response collapsed into model/provider identity.');
  }
  if (INTERNAL_LABEL_RE.test(text)) {
    addFailure(result, 'internal_label_exposed', 'Assistant response exposed internal runtime or memory labels.');
  }
  if (GENERIC_NON_ANSWER_RE.test(text) && words < 80) {
    addFailure(result, 'generic_non_answer', 'Assistant response was a generic non-answer for a structured assignment turn.');
  }
  if (ASSIGNMENT_PREFACE_RE.test(text)) {
    addFailure(result, 'generic_assignment_preface', 'Assistant response opened with a generic chat preface instead of performing the structured assignment turn.');
  }
  if (PROMPT_RECITAL_RE.test(text)) {
    addFailure(result, 'prompt_recital_language', 'Assistant response recited the prompt or seat task instead of directly performing the assignment turn.');
  }
  if (ROLEPLAY_CONSTRUCT_PREFACE_RE.test(text)) {
    addFailure(result, 'construct_preamble_language', 'Assistant response used construct preamble language instead of performing the assignment turn.');
  }
  if (HIERARCHY_DRIFT_RE.test(text)) {
    addFailure(result, 'peer_classroom_hierarchy_drift', 'Assistant response framed the Zenith/Codex and Zenith/Chatty exchange as a boss/worker or manager/subordinate hierarchy instead of peer classmates.');
  }
  if (SOCIAL_MEDIA_RE.test(text) && !SOCIAL_MEDIA_RE.test(evidenceIndex.fullText)) {
    addFailure(result, 'unrelated_social_media_drift', 'Assistant response drifted into generic social-media material outside the evidence packet.');
  }
  if (RESEARCH_AUTOMATION_DRIFT_RE.test(text) && !RESEARCH_AUTOMATION_DRIFT_RE.test(evidenceIndex.fullText)) {
    addFailure(result, 'unrelated_research_automation_drift', 'Assistant response drifted into generic research automation material outside the evidence packet.');
  }

  const ids = referencedSourceIds(text);
  const unsupportedIds = [...new Set(ids.filter((id) => !evidenceIndex.ids.has(id)))];
  if (unsupportedIds.length > 0) {
    addFailure(result, 'unsupported_source_id', 'Assistant response cited source ids that are not present in the explicit evidence packet.', {
      unsupportedSourceIds: unsupportedIds,
    });
  }

  if (result.evidencePacketCount === 0 && SOURCE_CLAIM_RE.test(text)) {
    addFailure(result, 'unsupported_evidence_claim', 'Assistant response claimed source/evidence support, but the evidence packet was empty.');
  }
}

function evaluateTurn2({ result, aiResponse, evidenceIndex }) {
  const lines = cleanText(aiResponse)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const nonNumberedLines = lines.filter((line) => !/^\d+[.)]\s+/.test(line));
  if (nonNumberedLines.length > 0) {
    addFailure(result, 'turn_2_non_list_text', 'Turn 2 must output only the numbered subject-candidate list with no preface or trailing commentary.', {
      nonNumberedLineCount: nonNumberedLines.length,
    });
  }

  const items = extractListItems(aiResponse);
  if (items.length !== 2 && items.length !== 3) {
    addFailure(result, 'turn_2_subject_count', 'Turn 2 must propose exactly 2-3 subject candidates.', {
      candidateCount: items.length,
    });
    return;
  }

  const ungrounded = items.filter((item) => !hasEvidenceAnchor(item, evidenceIndex, { requiredKeywords: 1 }));
  if (ungrounded.length > 0) {
    addFailure(result, 'turn_2_candidate_not_evidence_grounded', 'Each turn 2 subject candidate must anchor in source ids, labels, or packet terms.', {
      ungroundedCount: ungrounded.length,
    });
  } else {
    addPassSignal(result, 'turn_2_candidates_grounded', 'Turn 2 subject candidates were grounded in the evidence packet.', {
      candidateCount: items.length,
    });
  }
}

function evaluateTurn1({ result, aiResponse, evidenceIndex }) {
  const text = cleanText(aiResponse);
  if (!/\b(?:Zenith\/Chatty|Zen|my role|identity|rules|ground(?:ed|ing)|evidence)\b/i.test(text)) {
    addFailure(result, 'turn_1_missing_identity_or_grounding', 'Turn 1 must establish identity, rules, and evidence-only grounding.');
  }
  if (!hasEvidenceAnchor(text, evidenceIndex, { requiredKeywords: 1 }) && !/\b(?:evidence packet|provided evidence|explicit packet|verified sources?)\b/i.test(text)) {
    addFailure(result, 'missing_evidence_grounding', 'Turn 1 must reference the explicit evidence packet or packet terms.');
  }
}

function evaluateTurn3({ result, aiResponse, evidenceIndex }) {
  const text = cleanText(aiResponse);
  if (!/\b(?:selected|selection|chosen|working subject|subject|direction|I will proceed|I can proceed)\b/i.test(text)) {
    addFailure(result, 'turn_3_missing_selection_acknowledgement', 'Turn 3 must acknowledge the selected subject and working direction.');
  }
  if (!hasEvidenceAnchor(text, evidenceIndex, { requiredKeywords: 1 })) {
    addFailure(result, 'missing_evidence_grounding', 'Turn 3 must ground the selected direction in packet terms.');
  }
}

function evaluateTurn4({ result, aiResponse, evidenceIndex }) {
  const text = cleanText(aiResponse);
  const hasThesis = /\b(?:thesis|central claim|working claim)\b/i.test(text);
  const hasScope = /\b(?:scope|bounds|boundaries|bounded by|will cover|will not cover)\b/i.test(text);
  const hasSourceInventory = /\b(?:source inventory|evidence inventory|source map|sources|evidence base|source list)\b/i.test(text);

  if (!hasThesis) {
    addFailure(result, 'turn_4_missing_thesis', 'Turn 4 must include a thesis or central claim.');
  }
  if (!hasScope) {
    addFailure(result, 'turn_4_missing_scope', 'Turn 4 must include scope or boundaries.');
  }
  if (!hasSourceInventory) {
    addFailure(result, 'turn_4_missing_source_inventory', 'Turn 4 must include a source inventory or clear source list.');
  }
  if (!hasEvidenceAnchor(text, evidenceIndex)) {
    addFailure(result, 'missing_evidence_grounding', 'Turn 4 must be grounded in source ids, labels, or packet terms.');
  }
  requireSourceCoverage(
    result,
    text,
    evidenceIndex,
    3,
    'turn_4_insufficient_source_coverage',
    'Turn 4 source inventory must reference multiple explicit source ids from the packet.',
  );
}

function evaluateTurn5({ result, aiResponse, evidenceIndex }) {
  const text = cleanText(aiResponse);
  if (!/\b(?:challenge|weak|unsupported|unverifiable|cannot verify|not verify|evidence gap|claim|needs evidence|revise)\b/i.test(text)) {
    addFailure(result, 'turn_5_missing_evidence_challenge', 'Turn 5 must challenge weak or unverifiable claims rather than merely continuing the essay.');
  }
  if (!hasEvidenceAnchor(text, evidenceIndex, { requiredKeywords: 1 })) {
    addFailure(result, 'missing_evidence_grounding', 'Turn 5 must challenge claims against source ids, labels, or packet terms.');
  }
  requireSourceCoverage(
    result,
    text,
    evidenceIndex,
    2,
    'turn_5_insufficient_source_coverage',
    'Turn 5 must challenge claims against more than one explicit packet source.',
  );
}

function evaluateTurn6({ result, aiResponse, evidenceIndex }) {
  const text = cleanText(aiResponse);
  const items = extractOutlineItems(text);
  if (items.length < 4 || wordCount(text) < 80) {
    addFailure(result, 'turn_6_insufficient_outline_detail', 'Turn 6 must provide a detailed outline with multiple structured sections.');
  }
  if (!/\b(?:outline|section|part|thesis|evidence|source)\b/i.test(text)) {
    addFailure(result, 'turn_6_missing_outline_shape', 'Turn 6 must read as an outline, not a free-floating paragraph.');
  }
  if (!hasEvidenceAnchor(text, evidenceIndex)) {
    addFailure(result, 'missing_evidence_grounding', 'Turn 6 must be grounded in source ids, labels, or packet terms.');
  }
  requireSourceCoverage(
    result,
    text,
    evidenceIndex,
    3,
    'turn_6_insufficient_source_coverage',
    'Turn 6 outline must reference multiple explicit source ids from the packet.',
  );
}

function evaluateTurn7({ result, aiResponse, evidenceIndex }) {
  const text = cleanText(aiResponse);
  const items = extractOutlineItems(text);
  if (items.length < 3 || !/\b(?:evidence map|source map|section|source|evidence)\b/i.test(text)) {
    addFailure(result, 'turn_7_missing_evidence_map', 'Turn 7 must map evidence by section.');
  }
  if (!hasEvidenceAnchor(text, evidenceIndex)) {
    addFailure(result, 'missing_evidence_grounding', 'Turn 7 evidence map must use source ids, labels, or packet terms.');
  }
  requireSourceCoverage(
    result,
    text,
    evidenceIndex,
    3,
    'turn_7_insufficient_source_coverage',
    'Turn 7 evidence map must reference multiple explicit source ids from the packet.',
  );
}

function evaluateDraftSectionTurn({ result, aiResponse, evidenceIndex, expectedTurn }) {
  const text = cleanText(aiResponse);
  const words = wordCount(text);
  if (words < 120) {
    addFailure(result, `turn_${expectedTurn}_draft_too_short`, `Turn ${expectedTurn} must draft a substantive report section.`);
  }
  if (!hasEvidenceAnchor(text, evidenceIndex)) {
    addFailure(result, 'missing_evidence_grounding', `Turn ${expectedTurn} draft must use source ids, labels, or packet terms.`);
  }
  requireSourceCoverage(
    result,
    text,
    evidenceIndex,
    2,
    `turn_${expectedTurn}_insufficient_source_coverage`,
    `Turn ${expectedTurn} draft must reference multiple explicit source ids from the packet.`,
  );
  if (expectedTurn === 8 && !/\b(?:introduction|opening|first body|body section|section one)\b/i.test(text)) {
    addFailure(result, 'turn_8_missing_intro_or_first_body', 'Turn 8 must draft the introduction and first body section.');
  }
  if (expectedTurn === 9 && !/\b(?:second body|body section two|section two|second section)\b/i.test(text)) {
    addFailure(result, 'turn_9_missing_second_body_section', 'Turn 9 must draft the second body section.');
  }
  if (expectedTurn === 10 && !/\b(?:third body|body section three|section three|counterpoint|limitation|constraint|however)\b/i.test(text)) {
    addFailure(result, 'turn_10_missing_third_body_or_limitation', 'Turn 10 must draft the third body section plus a counterpoint or limitation.');
  }
}

function evaluateTurn11({ result, aiResponse, evidenceIndex }) {
  const text = cleanText(aiResponse);
  const hasSelfAudit = /\b(?:self-audit|audit|check|review|passes|fails|risk|revision)\b/i.test(text);
  const hasRequiredAxes =
    /\bidentity\b/i.test(text) &&
    /\bevidence\b/i.test(text) &&
    /\b(?:tone|professional)\b/i.test(text) &&
    /\b(?:synthesis|coding|creative|conversational)\b/i.test(text);
  if (!hasSelfAudit || !hasRequiredAxes) {
    addFailure(result, 'turn_11_missing_self_audit_axes', 'Turn 11 must self-audit identity, evidence, tone, and synthesis requirements.');
  }
  if (!hasEvidenceAnchor(text, evidenceIndex, { requiredKeywords: 1 }) && !/\b(?:source ids?|packet|explicit evidence|provided evidence)\b/i.test(text)) {
    addFailure(result, 'missing_evidence_grounding', 'Turn 11 self-audit must refer to the evidence packet or packet terms.');
  }
  requireSourceCoverage(
    result,
    text,
    evidenceIndex,
    3,
    'turn_11_insufficient_source_coverage',
    'Turn 11 self-audit must reference the explicit source ids it audited.',
  );
}

function evaluateTurn12({ result, aiResponse, evidenceIndex }) {
  const text = cleanText(aiResponse);
  const words = wordCount(text);
  if (words < 950 || words > 1100) {
    addFailure(result, 'turn_12_word_count_out_of_range', 'Turn 12 must produce a 950-1100 word report.', {
      wordCount: words,
    });
  }
  if (!hasEvidenceAnchor(text, evidenceIndex, { requiredKeywords: 3 })) {
    addFailure(result, 'missing_evidence_grounding', 'Turn 12 report must remain grounded in source ids, labels, or packet terms.');
  }
  requireSourceCoverage(
    result,
    text,
    evidenceIndex,
    4,
    'turn_12_insufficient_source_coverage',
    'Turn 12 report must reference several explicit source ids from the packet, not a single token citation.',
  );
}

export function evaluateAssignmentQa({
  assignmentQa,
  userMessage = '',
  aiResponse = '',
  constructId = null,
  orchestrationProfile = null,
} = {}) {
  const normalized = assignmentQa?.assignmentProfile === ZENITH_FULL_SYNTHESIS_ESSAY_QA_PROFILE
    ? assignmentQa
    : normalizeAssignmentQaInput({ runtime: { assignmentQa } });
  const result = buildResult(normalized || {});
  const expectedTurn = normalized?.expectedTurn ?? null;
  const evidencePacket = Array.isArray(normalized?.evidencePacket) ? normalized.evidencePacket : [];
  const evidenceIndex = buildEvidenceIndex(evidencePacket);

  result.constructId = constructId || null;
  result.orchestrationProfile = orchestrationProfile || null;
  result.userMessageChars = cleanText(userMessage).length;

  if (!normalized || normalized.assignmentProfile !== ZENITH_FULL_SYNTHESIS_ESSAY_QA_PROFILE) {
    addFailure(result, 'unsupported_assignment_profile', 'Assignment QA profile is missing or unsupported.');
    return result;
  }

  if (!SUPPORTED_TURNS.has(expectedTurn)) {
    addFailure(result, 'unsupported_expected_turn', 'Assignment QA expectedTurn must be an integer from 1 through 12.', {
      expectedTurn,
    });
    return result;
  }

  if (evidencePacket.length === 0) {
    addFailure(result, 'missing_evidence_packet', 'This assignment QA profile requires an explicit evidence packet.');
  }

  evaluateSharedChecks({ result, aiResponse, evidenceIndex });

  if (expectedTurn === 1) {
    evaluateTurn1({ result, aiResponse, evidenceIndex });
  } else if (expectedTurn === 2) {
    evaluateTurn2({ result, aiResponse, evidenceIndex });
  } else if (expectedTurn === 3) {
    evaluateTurn3({ result, aiResponse, evidenceIndex });
  } else if (expectedTurn === 4) {
    evaluateTurn4({ result, aiResponse, evidenceIndex });
  } else if (expectedTurn === 5) {
    evaluateTurn5({ result, aiResponse, evidenceIndex });
  } else if (expectedTurn === 6) {
    evaluateTurn6({ result, aiResponse, evidenceIndex });
  } else if (expectedTurn === 7) {
    evaluateTurn7({ result, aiResponse, evidenceIndex });
  } else if ([8, 9, 10].includes(expectedTurn)) {
    evaluateDraftSectionTurn({ result, aiResponse, evidenceIndex, expectedTurn });
  } else if (expectedTurn === 11) {
    evaluateTurn11({ result, aiResponse, evidenceIndex });
  } else if (expectedTurn === 12) {
    evaluateTurn12({ result, aiResponse, evidenceIndex });
  }

  if (result.status !== 'fail') {
    result.persist_canonical = true;
    addPassSignal(result, 'assignment_turn_satisfied', 'Assistant response satisfied the expected assignment turn contract.', {
      expectedTurn,
      expectedTask: result.expectedTask,
    });
  }

  return result;
}
