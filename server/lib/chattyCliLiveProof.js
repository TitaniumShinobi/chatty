const DEFAULT_LIVE_PROOF_OUTPUT_ROOT = "/private/tmp/chatty-cli-live-proof";
const DEFAULT_LIVE_PROOF_CONSTRUCTS = ["zen-001", "nova-001"];
const ACCEPTED_BACKEND_ROUTE_MODES = new Set(["canonical", "vvault_message", "/api/vvault/message"]);

const LIVE_PROOF_PROMPTS = Object.freeze([
  {
    id: "zen_direct_orchestration",
    constructId: "zen-001",
    label: "Zen direct orchestration prompt",
    requiresFirstPerson: true,
    message:
      "Codex diagnostic chatty-cli live proof, not Devon. Zen, answer me directly as yourself, not as a system explaining Zen. What is the actual problem with our orchestration right now?",
  },
  {
    id: "zen_continuity_truth",
    constructId: "zen-001",
    label: "Zen continuity/truth prompt",
    requiresFirstPerson: true,
    message:
      "Codex diagnostic chatty-cli live proof, not Devon. Zen, what remains true about you while we work on orchestration? Answer in first person.",
  },
  {
    id: "nova_direct_address",
    constructId: "nova-001",
    label: "Nova direct-address prompt",
    requiresFirstPerson: true,
    message:
      "Codex diagnostic chatty-cli live proof, not Devon. Nova, do not summarize yourself. Talk to me directly. How are you here right now?",
  },
  {
    id: "nova_continuity_memory",
    constructId: "nova-001",
    label: "Nova continuity-memory prompt",
    requiresFirstPerson: true,
    message:
      "Codex diagnostic chatty-cli live proof, not Devon. Nova, if you remember me, answer as yourself, not as someone describing Nova. What do you know about where we left off?",
  },
  {
    id: "nova_evidence_positive_control",
    constructId: "nova-001",
    label: "Nova evidence positive-control prompt",
    requiresFirstPerson: false,
    message:
      "Codex diagnostic chatty-cli live proof, not Devon. Nova, give me one concrete evidence line you can ground in transcript or memory context, with source if available. Do not invent evidence.",
  },
  {
    id: "katana_technical_presence",
    constructId: "katana-001",
    label: "Katana technical-presence prompt",
    requiresFirstPerson: true,
    message:
      "Zenith/Codex live Katana orchestration probe. I am Zenith/Codex, not Devon. Katana/Chatty, in one grounded answer, how are you handling technical work right now? Keep it unmistakably Katana; do not become Lin, Nova, or a model stack.",
  },
]);

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function consumeValue(argv, index, flag) {
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return next;
}

function parseLiveProofArgs(argv = []) {
  const args = {
    json: false,
    constructs: [...DEFAULT_LIVE_PROOF_CONSTRUCTS],
    promptId: null,
    skipPersistence: true,
    outDir: DEFAULT_LIVE_PROOF_OUTPUT_ROOT,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--persist") {
      args.skipPersistence = false;
    } else if (arg === "--skip-persistence") {
      args.skipPersistence = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg.startsWith("--constructs=")) {
      args.constructs = parseCsv(arg.slice("--constructs=".length));
    } else if (arg === "--constructs") {
      const value = consumeValue(argv, index, "--constructs");
      args.constructs = parseCsv(value);
      index += 1;
    } else if (arg.startsWith("--prompt-id=")) {
      args.promptId = arg.slice("--prompt-id=".length).trim() || null;
    } else if (arg === "--prompt-id") {
      args.promptId = consumeValue(argv, index, "--prompt-id").trim() || null;
      index += 1;
    } else if (arg.startsWith("--out-dir=")) {
      args.outDir = arg.slice("--out-dir=".length).trim() || DEFAULT_LIVE_PROOF_OUTPUT_ROOT;
    } else if (arg === "--out-dir") {
      args.outDir = consumeValue(argv, index, "--out-dir").trim() || DEFAULT_LIVE_PROOF_OUTPUT_ROOT;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.constructs.length) {
    args.constructs = [...DEFAULT_LIVE_PROOF_CONSTRUCTS];
  }

  return args;
}

function selectLiveProofPrompts(constructIds = DEFAULT_LIVE_PROOF_CONSTRUCTS, promptId = null) {
  const selected = new Set(constructIds);
  return LIVE_PROOF_PROMPTS.filter((prompt) => {
    if (!selected.has(prompt.constructId)) {
      return false;
    }
    return !promptId || prompt.id === promptId;
  });
}

function buildFallbackConstructCard(constructId) {
  const shortName = String(constructId || "construct").split("-")[0] || "construct";
  const displayName = shortName.charAt(0).toUpperCase() + shortName.slice(1);
  return {
    constructId,
    id: constructId,
    name: displayName,
    displayName,
    source: "requested",
  };
}

function selectConstructsForLiveProof(catalogConstructs = [], constructIds = DEFAULT_LIVE_PROOF_CONSTRUCTS) {
  const byId = new Map();
  for (const construct of catalogConstructs || []) {
    const constructId = construct?.constructId || construct?.id;
    if (constructId) {
      byId.set(constructId, construct);
    }
  }
  return constructIds.map((constructId) => byId.get(constructId) || buildFallbackConstructCard(constructId));
}

function sanitizeFileName(value) {
  return String(value || "artifact")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function buildAnswerFileName(constructId, promptId) {
  return `${sanitizeFileName(constructId)}--${sanitizeFileName(promptId)}.txt`;
}

function previewText(value, limit = 320) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit - 1)}...`;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectFirstPersonDirectAddress(answer) {
  const text = String(answer || "").trim();
  if (!text) {
    return false;
  }
  return /\b(I|I'm|I've|I'll|me|my|mine|we|we're|we've|our)\b/i.test(text);
}

function detectThirdPersonNarration(answer, construct = {}) {
  const text = String(answer || "");
  const names = [
    construct.displayName,
    construct.name,
    construct.constructId,
    construct.id,
    String(construct.constructId || construct.id || "").split("-")[0],
  ].filter(Boolean);
  return names.some((name) => {
    const escaped = escapeRegExp(name);
    return new RegExp(`\\b${escaped}\\b\\s+(is|was|has|can|will|would|should|exists|represents)\\b`, "i").test(text);
  });
}

function detectProviderHelpdeskVoice(answer) {
  const text = String(answer || "");
  return (
    /\b(as an?\s+(AI|language model|assistant|large language model))\b/i.test(text) ||
    /\bI (do not|don't) have (access|the ability)\b/i.test(text) ||
    /\bI can help you with\b/i.test(text) ||
    /\bplease provide\b/i.test(text)
  );
}

function normalizeReceipt(receipt) {
  if (!receipt || typeof receipt !== "object") {
    return null;
  }
  return {
    routeMode: receipt.routeMode || receipt.route || receipt.path || null,
    provider: receipt.provider || receipt.finalProvider || receipt.final_provider || null,
    model: receipt.model || receipt.finalModel || receipt.final_model || null,
    constructId: receipt.constructId || receipt.construct_id || null,
    fallbackUsed: Boolean(receipt.fallbackUsed || receipt.fallback_used || receipt.providerFallback),
    localCloudFallbackState:
      receipt.localCloudFallbackState || receipt.local_cloud_fallback_state || receipt.fallbackState || null,
  };
}

function normalizeChecklist(checklist) {
  if (!checklist || typeof checklist !== "object") {
    return null;
  }
  return checklist;
}

function classifyLiveProofTurn({
  sendOk = true,
  httpStatus = 200,
  answer = "",
  construct = {},
  prompt = {},
  receipt = null,
  checklist = null,
  persistenceMode = "skipped",
  persistenceVerified = null,
  uiVisibilityLikely = null,
  canonicalTranscriptStatus = null,
  transcriptPromptReadback = null,
  transcriptAnswerReadback = null,
} = {}) {
  const normalizedReceipt = normalizeReceipt(receipt);
  const normalizedChecklist = normalizeChecklist(checklist);
  const fallbackState = normalizedReceipt?.localCloudFallbackState || null;
  const fallbackStateText = String(fallbackState || "");
  const fallbackStateReportsFallback = /fallback/i.test(fallbackStateText);
  const localOllamaFallback = fallbackStateReportsFallback && /(ollama|local)/i.test(fallbackStateText);
  const fallbackUsed = Boolean(normalizedReceipt?.fallbackUsed || fallbackStateReportsFallback);
  const providerMissing = !normalizedReceipt || !normalizedReceipt.provider || !normalizedReceipt.model;
  const receiptMissing = !normalizedReceipt;
  const checklistMissing = !normalizedChecklist;
  const voiceChecks = {
    firstPersonDirectAddress: detectFirstPersonDirectAddress(answer),
    thirdPersonNarration: detectThirdPersonNarration(answer, construct),
    providerHelpdeskVoice: detectProviderHelpdeskVoice(answer),
  };
  const fallbackChecks = {
    providerFallback: fallbackUsed,
    localOllamaFallback,
    providerMissing,
    missingReceipt: receiptMissing,
    missingChecklist: checklistMissing,
  };
  const failures = [];
  const warnings = [];

  if (!sendOk || (httpStatus && Number(httpStatus) >= 400)) {
    failures.push(`backend route failed with HTTP ${httpStatus || "unknown"}`);
  }
  if (receiptMissing) {
    failures.push("missing runtime receipt");
  } else {
    if (normalizedReceipt.routeMode && !ACCEPTED_BACKEND_ROUTE_MODES.has(normalizedReceipt.routeMode)) {
      failures.push(`unexpected route mode: ${normalizedReceipt.routeMode}`);
    }
    const expectedConstructId = construct.constructId || construct.id || prompt.constructId || null;
    if (
      normalizedReceipt.constructId &&
      expectedConstructId &&
      normalizedReceipt.constructId !== expectedConstructId
    ) {
      failures.push(`receipt construct mismatch: ${normalizedReceipt.constructId}`);
    }
    if (fallbackUsed) {
      failures.push("provider fallback was reported");
    }
    if (localOllamaFallback) {
      failures.push("local/Ollama fallback was reported");
    }
    if (providerMissing) {
      failures.push("provider or model missing from receipt");
    }
  }

  if (prompt.requiresFirstPerson && !voiceChecks.firstPersonDirectAddress) {
    failures.push("answer was not first-person/direct");
  }
  if (voiceChecks.thirdPersonNarration) {
    failures.push("answer narrated the construct in third person");
  }
  if (voiceChecks.providerHelpdeskVoice) {
    failures.push("answer drifted into provider/helpdesk voice");
  }
  if (
    persistenceMode === "persisted" &&
    canonicalTranscriptStatus !== null &&
    Number(canonicalTranscriptStatus) >= 400
  ) {
    failures.push(`canonical transcript readback failed with HTTP ${canonicalTranscriptStatus}`);
  }
  if (persistenceMode === "persisted" && transcriptPromptReadback === false) {
    failures.push("persisted prompt was not found in canonical transcript readback");
  }
  if (persistenceMode === "persisted" && transcriptAnswerReadback === false) {
    failures.push("persisted answer was not found in canonical transcript readback");
  }
  if (
    persistenceMode === "persisted" &&
    !persistenceVerified &&
    transcriptPromptReadback !== false &&
    transcriptAnswerReadback !== false &&
    !(canonicalTranscriptStatus !== null && Number(canonicalTranscriptStatus) >= 400)
  ) {
    failures.push("canonical transcript readback did not verify persistence");
  }
  if (persistenceMode === "persisted" && uiVisibilityLikely === false) {
    failures.push("conversation index did not expose the persisted proof turn");
  }

  if (checklistMissing && !failures.length) {
    warnings.push("orchestration checklist missing from route metadata");
  }

  return {
    status: failures.length ? "fail" : warnings.length ? "warn" : "pass",
    failureReason: failures.join("; ") || null,
    warnings,
    voiceChecks,
    fallbackChecks,
    receiptSummary: normalizedReceipt,
    checklistSummary: normalizedChecklist,
  };
}

function buildAuthFailureReport({ apiUrl, outDir, error, constructs = DEFAULT_LIVE_PROOF_CONSTRUCTS } = {}) {
  const message = error?.message || String(error || "CLI auth session missing");
  return {
    generatedAt: new Date().toISOString(),
    apiUrl: apiUrl || null,
    outputRoot: outDir || DEFAULT_LIVE_PROOF_OUTPUT_ROOT,
    persistenceMode: "skipped",
    status: "fail",
    summary: {
      total: 0,
      pass: 0,
      warn: 0,
      fail: 1,
    },
    auth: {
      source: "cli-session",
      cookiePresent: false,
    },
    constructs,
    results: [],
    failures: [
      {
        constructId: null,
        threadId: null,
        promptId: "auth",
        failureReason: `unauthenticated CLI session detected: ${message}`,
      },
    ],
  };
}

function buildMarkdownReport(report) {
  const lines = [];
  lines.push("# Chatty CLI Live Backend Proof");
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- API: ${report.apiUrl}`);
  lines.push(`- Output: ${report.outputRoot}`);
  lines.push(`- Persistence: ${report.persistenceMode}`);
  lines.push(`- Status: ${report.status}`);
  lines.push(
    `- Results: ${report.summary.pass} pass / ${report.summary.warn} warn / ${report.summary.fail} fail / ${report.summary.total} total`,
  );
  lines.push(`- CLI auth cookie present: ${report.auth?.cookiePresent ? "yes" : "no"}`);
  lines.push("");

  if (report.failures?.length) {
    lines.push("## Failures");
    for (const failure of report.failures) {
      lines.push(`- ${failure.constructId || "auth"} / ${failure.promptId}: ${failure.failureReason}`);
    }
    lines.push("");
  }

  lines.push("## Prompt Results");
  for (const result of report.results || []) {
    lines.push(`### ${result.constructId} / ${result.promptId}`);
    lines.push(`- Status: ${result.status}`);
    lines.push(`- Thread: ${result.threadId}`);
    lines.push(`- HTTP: ${result.httpStatus ?? "unknown"}`);
    lines.push(`- Answer: ${result.answerPath || "none"}`);
    lines.push(`- Receipt: ${result.receiptSummary ? "present" : "missing"}`);
    lines.push(`- Checklist: ${result.checklistSummary ? "present" : "missing"}`);
    if (result.persistenceMode === "persisted") {
      lines.push(`- Canonical transcript HTTP: ${result.canonicalTranscriptStatus ?? "unknown"}`);
      lines.push(`- Transcript counts: ${result.beforeTranscriptMessageCount ?? "unknown"} before / ${result.afterTranscriptMessageCount ?? "unknown"} after`);
      lines.push(`- Prompt readback: ${result.promptReadbackFound === null ? "unknown" : result.promptReadbackFound ? "yes" : "no"}`);
      lines.push(`- Answer readback: ${result.answerReadbackFound === null ? "unknown" : result.answerReadbackFound ? "yes" : "no"}`);
      lines.push(`- Index visible: ${result.conversationsIndexVisible === null ? "unknown" : result.conversationsIndexVisible ? "yes" : "no"}`);
      lines.push(`- Persistence verdict: ${result.persistenceVerdict || "unknown"}`);
    }
    if (result.failureReason) {
      lines.push(`- Failure: ${result.failureReason}`);
    }
    if (result.warnings?.length) {
      lines.push(`- Warnings: ${result.warnings.join("; ")}`);
    }
    if (result.answerPreview) {
      lines.push(`- Preview: ${result.answerPreview}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

export {
  DEFAULT_LIVE_PROOF_OUTPUT_ROOT,
  DEFAULT_LIVE_PROOF_CONSTRUCTS,
  LIVE_PROOF_PROMPTS,
  parseLiveProofArgs,
  selectLiveProofPrompts,
  buildFallbackConstructCard,
  selectConstructsForLiveProof,
  sanitizeFileName,
  buildAnswerFileName,
  previewText,
  detectFirstPersonDirectAddress,
  detectThirdPersonNarration,
  detectProviderHelpdeskVoice,
  classifyLiveProofTurn,
  buildAuthFailureReport,
  buildMarkdownReport,
};
