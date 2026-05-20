const OWNER_FILE = 'server/lib/researchWorkflowReceipt.js';
const SOURCE_ANCHOR = 'server/lib/researchWorkflowReceipt.js:buildResearchWorkflowReceipt';

export const RESEARCH_WORKFLOW_STEPS = [
  {
    id: 'research_web_search',
    label: 'Research: Web Search',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  },
  {
    id: 'research_source_selection',
    label: 'Research: Source Selection',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  },
  {
    id: 'research_source_balance',
    label: 'Research: Source Balance',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  },
  {
    id: 'research_credibility',
    label: 'Research: Credibility Grading',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  },
  {
    id: 'research_citations',
    label: 'Research: Citation Extraction',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  },
  {
    id: 'research_outline',
    label: 'Research: Outline',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  },
  {
    id: 'research_draft',
    label: 'Research: Draft',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  },
  {
    id: 'research_self_audit',
    label: 'Research: Self-Audit',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  },
  {
    id: 'research_thesis',
    label: 'Research: Thesis',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  },
  {
    id: 'research_evidence',
    label: 'Research: Evidence',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  },
  {
    id: 'research_argument',
    label: 'Research: Argument / Limits',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  },
  {
    id: 'research_case_studies',
    label: 'Research: Case Studies',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  },
  {
    id: 'research_conclusion',
    label: 'Research: Conclusion',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  },
  {
    id: 'research_final_report',
    label: 'Research: Final Report',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
  },
];

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStatus(value, fallback = 'warn') {
  const status = cleanText(value).toLowerCase();
  return ['pass', 'warn', 'fail', 'skipped'].includes(status) ? status : fallback;
}

export function isResearchWorkflowRequested({ message = '', runtime = null } = {}) {
  const runtimeObject = runtime && typeof runtime === 'object' && !Array.isArray(runtime) ? runtime : {};
  const command = cleanText(runtimeObject.command || runtimeObject.slashCommand || runtimeObject.slash_command).toLowerCase();
  if (command === 'research') return true;
  return /^\/research(?:\s|$)/i.test(cleanText(message));
}

function wordCount(text) {
  return cleanText(text).split(/\s+/).filter(Boolean).length;
}

function responseCitesPacketSources(text, evidencePacket = []) {
  const lower = cleanText(text).toLowerCase();
  if (!lower) return false;
  return evidencePacket.some((item) => {
    const id = cleanText(item?.id).toLowerCase();
    return id && lower.includes(id);
  });
}

function isBoundedEvidenceRequest(message, runtimeObject = {}) {
  const research = runtimeObject.research || runtimeObject.researchWorkflow || runtimeObject.research_workflow || {};
  const policy = cleanText(research.sourcePolicy || research.source_policy || research.webSearchPolicy || research.web_search_policy).toLowerCase();
  if (['provided_only', 'bounded_evidence', 'internal_only', 'no_web'].includes(policy)) return true;

  const text = cleanText(message).toLowerCase();
  return (
    /\buse only\b/.test(text) &&
    /\b(?:explicit evidence|provided evidence|evidence packet|provided sources|internal evidence|current snapshots|canonical transcript)\b/.test(text)
  ) || /\b(?:bounded evidence|evidence-packet report|internal-source report)\b/.test(text);
}

function hasAnyPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function evaluateCollegeStructure(aiResponse, {
  citesPacketSources,
  evidencePacketCount,
} = {}) {
  const text = cleanText(aiResponse);
  const lower = text.toLowerCase();
  const hasThesis = hasAnyPattern(lower, [
    /\bthesis\b/,
    /\bcentral claim\b/,
    /\bmain claim\b/,
    /\bthe central argument\b/,
    /\bthis report argues\b/,
    /\bthe argument is\b/,
  ]);
  const hasEvidence = citesPacketSources || hasAnyPattern(lower, [
    /\bevidence\b/,
    /\bsource-\d+\b/,
    /\bcase study\b/,
    /\bproof\b/,
  ]);
  const hasArgument = hasAnyPattern(lower, [
    /\bhowever\b/,
    /\balthough\b/,
    /\bexception\b/,
    /\blimitation\b/,
    /\bcounterpoint\b/,
    /\bnot always\b/,
    /\bnot automatically\b/,
    /\bdepends on\b/,
  ]);
  const hasCaseStudies = hasAnyPattern(lower, [
    /\bcase stud(?:y|ies)\b/,
    /\bclosest proof\b/,
    /\bexample\b/,
    /\bprobe\b/,
    /\bcanonical row\b/,
    /\bsupabase row\b/,
    /\btranscript row\b/,
    /\bturn sequence\b/,
  ]);
  const hasConclusion = hasAnyPattern(lower, [
    /\bconclusion\b/,
    /\bin conclusion\b/,
    /\bin sum\b/,
    /\boverall\b/,
    /\btherefore\b/,
    /\bultimately\b/,
    /\bthe result is\b/,
  ]);

  return {
    thesis: hasThesis,
    evidence: hasEvidence && evidencePacketCount > 0,
    argument: hasArgument,
    caseStudies: hasCaseStudies,
    conclusion: hasConclusion,
  };
}

function getRuntimeStep(runtimeObject, key) {
  const research = runtimeObject.research || runtimeObject.researchWorkflow || runtimeObject.research_workflow || {};
  const steps = research.steps || research.checkpoints || {};
  return steps[key] || research[key] || null;
}

function getRuntimeResearch(runtimeObject) {
  return runtimeObject.research || runtimeObject.researchWorkflow || runtimeObject.research_workflow || {};
}

function getSelectedSourceCount(runtimeObject, evidencePacketCount) {
  const research = getRuntimeResearch(runtimeObject);
  const explicitCount = Number(
    research.selectedSourceCount ??
    research.selected_source_count ??
    research.sourceCount ??
    research.source_count ??
    research.webSourceCount ??
    research.web_source_count,
  );
  if (Number.isFinite(explicitCount) && explicitCount > 0) return explicitCount;
  const selectedSources = research.selectedSources || research.selected_sources || research.sources;
  if (Array.isArray(selectedSources) && selectedSources.length > 0) return selectedSources.length;
  return Number(evidencePacketCount || 0);
}

function getSourceAgreement(runtimeObject) {
  const research = getRuntimeResearch(runtimeObject);
  return cleanText(
    research.sourceAgreement ||
    research.source_agreement ||
    research.consensus ||
    research.convergence ||
    research.secondOpinionSummary ||
    research.second_opinion_summary,
  );
}

function stepFromRuntime(runtimeObject, key) {
  const raw = getRuntimeStep(runtimeObject, key);
  if (!raw || typeof raw !== 'object') return null;
  return {
    status: normalizeStatus(raw.status),
    why: cleanText(raw.why || raw.reason || raw.summary) || 'Research workflow step reported by runtime.',
    details: raw.details && typeof raw.details === 'object' ? raw.details : {},
  };
}

function mergeStep(base, override) {
  if (!override) return base;
  return {
    ...base,
    ...override,
    details: {
      ...(base.details || {}),
      ...(override.details || {}),
    },
  };
}

export function buildResearchWorkflowReceipt({
  message = '',
  runtime = null,
  assignmentQaInput = null,
  assignmentQa = null,
  aiResponse = '',
  searchInjected = false,
  searchIntentReason = 'not_evaluated',
  fullSeatSynthesisResult = null,
} = {}) {
  const runtimeObject = runtime && typeof runtime === 'object' && !Array.isArray(runtime) ? runtime : {};
  const requested = isResearchWorkflowRequested({ message, runtime: runtimeObject });
  if (!requested) return null;

  const evidencePacket = Array.isArray(assignmentQaInput?.evidencePacket)
    ? assignmentQaInput.evidencePacket
    : [];
  const evidencePacketCount = Number(
    assignmentQaInput?.evidencePacketCount ??
    assignmentQa?.evidencePacketCount ??
    evidencePacket.length ??
    0,
  );
  const finalWordCount = wordCount(aiResponse);
  const citesPacketSources = responseCitesPacketSources(aiResponse, evidencePacket);
  const assignmentExpectedTurn = assignmentQaInput?.expectedTurn ?? assignmentQa?.expectedTurn ?? null;
  const assignmentPassed = assignmentQa?.status === 'pass' || assignmentQa?.status === 'warn';
  const fullSynthesisPassed = fullSeatSynthesisResult?.status === 'pass';
  const runtimeWebSearchStep = stepFromRuntime(runtimeObject, 'research_web_search');
  const webSearchRan = Boolean(searchInjected || runtimeWebSearchStep?.status === 'pass');
  const boundedEvidenceRequest = isBoundedEvidenceRequest(message, runtimeObject);
  const selectedSourceCount = getSelectedSourceCount(runtimeObject, evidencePacketCount);
  const sourceAgreement = getSourceAgreement(runtimeObject);
  const sourceBalancePass = selectedSourceCount >= 2 && selectedSourceCount <= 5;
  const collegeStructure = evaluateCollegeStructure(aiResponse, {
    citesPacketSources,
    evidencePacketCount,
  });

  const steps = {
    research_web_search: {
      status: webSearchRan ? 'pass' : boundedEvidenceRequest ? 'skipped' : 'warn',
      why: webSearchRan
        ? 'External search context was injected into the prompt.'
        : boundedEvidenceRequest
          ? 'External web search was intentionally skipped because the request was bounded to provided/current evidence.'
          : 'No external web search step ran; this was a bounded evidence/report turn.',
      details: {
        searchInjected: webSearchRan,
        searchIntentReason,
        boundedEvidenceRequest,
      },
    },
    research_source_selection: {
      status: evidencePacketCount > 0 ? 'pass' : 'warn',
      why: evidencePacketCount > 0
        ? `${evidencePacketCount} explicit evidence packet source(s) were available for selection.`
        : 'No explicit source packet or selected source list was recorded.',
      details: {
        evidencePacketCount,
        sourceIds: evidencePacket.map((item) => item.id).filter(Boolean),
      },
    },
    research_source_balance: {
      status: webSearchRan
        ? (sourceBalancePass ? 'pass' : 'warn')
        : boundedEvidenceRequest
          ? 'skipped'
          : 'warn',
      why: webSearchRan
        ? sourceBalancePass
          ? `Research selected ${selectedSourceCount} source(s), enough for a second opinion without overloading the answer.`
          : selectedSourceCount < 2
            ? 'Web research needs at least two selected sources for a second opinion.'
            : 'Web research selected too many sources for a focused college-level answer.'
        : boundedEvidenceRequest
          ? 'Source balance is scoped to the provided evidence packet for this internal-source request.'
          : 'No source-balance check ran because no web/source selection workflow was recorded.',
      details: {
        selectedSourceCount,
        recommendedMinimum: 2,
        recommendedMaximum: 5,
        sourceAgreement: sourceAgreement || null,
        agreementChecked: Boolean(sourceAgreement),
        boundedEvidenceRequest,
        webSearchRan,
      },
    },
    research_credibility: {
      status: webSearchRan ? 'warn' : boundedEvidenceRequest ? 'skipped' : 'warn',
      why: boundedEvidenceRequest
        ? 'External credibility grading was intentionally skipped; credibility is scoped to the provided evidence packet.'
        : 'No independent source credibility grading step is implemented for /research yet.',
      details: {
        credibilityGradingImplemented: false,
        evidencePacketOnly: evidencePacketCount > 0,
        boundedEvidenceRequest,
      },
    },
    research_citations: {
      status: citesPacketSources ? 'pass' : 'warn',
      why: citesPacketSources
        ? 'The final answer cited explicit packet source ids.'
        : 'The final answer did not cite explicit packet source ids.',
      details: {
        citesPacketSources,
        evidencePacketCount,
      },
    },
    research_outline: {
      status: assignmentExpectedTurn && assignmentExpectedTurn < 8 ? (assignmentPassed ? 'pass' : 'warn') : 'skipped',
      why: assignmentExpectedTurn && assignmentExpectedTurn < 8
        ? 'This research turn was part of the pre-draft planning/outline sequence.'
        : 'No separate outline step was recorded for this one-turn research request.',
      details: {
        assignmentExpectedTurn,
        assignmentStatus: assignmentQa?.status || null,
      },
    },
    research_draft: {
      status: aiResponse ? (fullSynthesisPassed || assignmentPassed ? 'pass' : 'warn') : 'fail',
      why: aiResponse
        ? 'A candidate research answer was drafted through the response path.'
        : 'No research draft text reached the final response path.',
      details: {
        responseChars: cleanText(aiResponse).length,
        synthesisStatus: fullSeatSynthesisResult?.status || null,
      },
    },
    research_self_audit: {
      status: assignmentExpectedTurn === 11 && assignmentPassed ? 'pass' : 'warn',
      why: assignmentExpectedTurn === 11 && assignmentPassed
        ? 'The active assignment turn was a self-audit and passed assignment QA.'
        : 'No separate self-audit step was recorded for this research request.',
      details: {
        assignmentExpectedTurn,
        assignmentStatus: assignmentQa?.status || null,
      },
    },
    research_thesis: {
      status: collegeStructure.thesis ? 'pass' : 'warn',
      why: collegeStructure.thesis
        ? 'The report includes a thesis or central claim.'
        : 'The report did not clearly expose a thesis or central claim.',
      details: {
        expectedPlacement: 'end_of_intro_or_opening_claim',
        detected: collegeStructure.thesis,
      },
    },
    research_evidence: {
      status: collegeStructure.evidence ? 'pass' : 'warn',
      why: collegeStructure.evidence
        ? 'The report grounds claims in explicit evidence/source references.'
        : 'The report did not show enough explicit evidence grounding.',
      details: {
        citesPacketSources,
        evidencePacketCount,
        detected: collegeStructure.evidence,
      },
    },
    research_argument: {
      status: collegeStructure.argument ? 'pass' : 'warn',
      why: collegeStructure.argument
        ? 'The report includes limits, exceptions, or a counterpoint instead of treating the thesis as absolute.'
        : 'The report did not clearly test whether the thesis has exceptions or limits.',
      details: {
        detected: collegeStructure.argument,
      },
    },
    research_case_studies: {
      status: collegeStructure.caseStudies ? 'pass' : 'warn',
      why: collegeStructure.caseStudies
        ? 'The report includes closest available proof, examples, probes, or case-study material.'
        : 'The report did not clearly include case studies or closest available proof.',
      details: {
        detected: collegeStructure.caseStudies,
      },
    },
    research_conclusion: {
      status: collegeStructure.conclusion ? 'pass' : 'warn',
      why: collegeStructure.conclusion
        ? 'The report includes a fact-based concluding synthesis.'
        : 'The report did not clearly include a concluding synthesis.',
      details: {
        biasPosture: 'non_bias_to_lite_bias_fact_based_summary',
        detected: collegeStructure.conclusion,
      },
    },
    research_final_report: {
      status: assignmentExpectedTurn === 12
        ? (assignmentPassed && finalWordCount >= 950 && finalWordCount <= 1100 ? 'pass' : 'warn')
        : (aiResponse ? 'pass' : 'fail'),
      why: assignmentExpectedTurn === 12
        ? `Final report word count was ${finalWordCount}; expected 950-1100 for this QA contract.`
        : aiResponse
          ? 'Final response text was produced for the research request.'
          : 'No final response text was produced for the research request.',
      details: {
        wordCount: finalWordCount,
        assignmentExpectedTurn,
        assignmentStatus: assignmentQa?.status || null,
      },
    },
  };

  for (const key of Object.keys(steps)) {
    steps[key] = mergeStep(steps[key], stepFromRuntime(runtimeObject, key));
  }

  const statusValues = Object.values(steps).map((item) => item.status);
  const overallStatus = statusValues.includes('fail')
    ? 'fail'
    : statusValues.includes('warn')
      ? 'warn'
      : statusValues.includes('skipped')
        ? 'partial'
        : 'pass';

  return {
    requested: true,
    command: 'research',
    profile: 'research_workflow.v1',
    status: overallStatus,
    mode: webSearchRan ? 'search_augmented' : 'bounded_evidence_packet',
    evidencePacketCount,
    webSearchRan,
    boundedEvidenceRequest,
    selectedSourceCount,
    sourceAgreement: sourceAgreement || null,
    credibilityGradingRan: steps.research_credibility.status === 'pass',
    citationExtractionRan: steps.research_citations.status === 'pass',
    collegeStructure,
    finalWordCount,
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
    steps,
  };
}
