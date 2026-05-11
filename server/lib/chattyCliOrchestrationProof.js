const DEFAULT_ORCHESTRATION_PROOF_OUTPUT_ROOT = "/private/tmp/chatty-cli-orchestration-proof";
const DEFAULT_ORCHESTRATION_PROOF_CONSTRUCT = "zen-001";
const DEFAULT_ORCHESTRATION_PROOF_CONSTRUCTS = ["zen-001", "nova-001"];
const DEFAULT_ORCHESTRATION_PROOF_PROMPT_ID = "zen_direct_orchestration";
const DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT = "zen-001";
const DEFAULT_LATEST_CODEX_ORCHESTRATION_PROMPT_ID = "latest_codex_continue";
const ORCHESTRATION_PROOF_PROMPT_BY_CONSTRUCT = Object.freeze({
  "zen-001": "zen_direct_orchestration",
  "nova-001": "nova_direct_address",
});

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

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number`);
  }
  return Math.floor(parsed);
}

function parseOrchestrationProofArgs(argv = []) {
  let constructsExplicit = false;
  const args = {
    json: false,
    constructs: [...DEFAULT_ORCHESTRATION_PROOF_CONSTRUCTS],
    latestCodex: false,
    noBrowser: false,
    authTimeoutMs: null,
    skipPersistence: false,
    outDir: DEFAULT_ORCHESTRATION_PROOF_OUTPUT_ROOT,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--latest-codex") {
      args.latestCodex = true;
    } else if (arg === "--skip-persistence") {
      args.skipPersistence = true;
    } else if (arg === "--persist") {
      args.skipPersistence = false;
    } else if (arg === "--no-browser") {
      args.noBrowser = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg.startsWith("--constructs=")) {
      args.constructs = parseCsv(arg.slice("--constructs=".length));
      constructsExplicit = true;
    } else if (arg === "--constructs") {
      args.constructs = parseCsv(consumeValue(argv, index, "--constructs"));
      constructsExplicit = true;
      index += 1;
    } else if (arg.startsWith("--auth-timeout-ms=")) {
      args.authTimeoutMs = parsePositiveInteger(
        arg.slice("--auth-timeout-ms=".length).trim(),
        "--auth-timeout-ms",
      );
    } else if (arg === "--auth-timeout-ms") {
      args.authTimeoutMs = parsePositiveInteger(
        consumeValue(argv, index, "--auth-timeout-ms"),
        "--auth-timeout-ms",
      );
      index += 1;
    } else if (arg.startsWith("--out-dir=")) {
      args.outDir = arg.slice("--out-dir=".length).trim() || DEFAULT_ORCHESTRATION_PROOF_OUTPUT_ROOT;
    } else if (arg === "--out-dir") {
      args.outDir = consumeValue(argv, index, "--out-dir").trim() || DEFAULT_ORCHESTRATION_PROOF_OUTPUT_ROOT;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.constructs.length) {
    args.constructs = [...DEFAULT_ORCHESTRATION_PROOF_CONSTRUCTS];
  }
  if (args.latestCodex === true && !constructsExplicit) {
    args.constructs = [DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT];
  }

  return args;
}

function resolveOrchestrationConstructs(args = {}) {
  return Array.isArray(args.constructs) && args.constructs.length
    ? args.constructs
    : [...DEFAULT_ORCHESTRATION_PROOF_CONSTRUCTS];
}

function validateLatestCodexOrchestrationArgs(args = {}) {
  if (args.latestCodex !== true) {
    return;
  }

  const constructs = resolveOrchestrationConstructs(args);
  if (args.skipPersistence === true) {
    throw new Error("--latest-codex orchestration requires canonical persistence; do not pass --skip-persistence.");
  }
  if (constructs.length !== 1 || constructs[0] !== DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT) {
    throw new Error(
      `--latest-codex orchestration is Zen-only in v1 and requires --constructs=${DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT}.`,
    );
  }
}

function liveProofOutDir(root, constructId) {
  return `${root || DEFAULT_ORCHESTRATION_PROOF_OUTPUT_ROOT}/live/${constructId}`;
}

function buildLiveProofRunsForOrchestration(args = {}) {
  validateLatestCodexOrchestrationArgs(args);
  const constructs = resolveOrchestrationConstructs(args);
  const root = args.outDir || DEFAULT_ORCHESTRATION_PROOF_OUTPUT_ROOT;
  if (args.latestCodex === true) {
    const constructId = DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT;
    const outDir = liveProofOutDir(root, constructId);
    return [
      {
        constructId,
        promptId: DEFAULT_LATEST_CODEX_ORCHESTRATION_PROMPT_ID,
        outDir,
        args: [
          "--latest-codex",
          "--persist",
          `--out-dir=${outDir}`,
          "--json",
        ],
      },
    ];
  }
  return constructs.map((constructId) => {
    const promptId = ORCHESTRATION_PROOF_PROMPT_BY_CONSTRUCT[constructId];
    if (!promptId) {
      throw new Error(`No orchestration proof prompt configured for construct: ${constructId}`);
    }
    const outDir = liveProofOutDir(root, constructId);
    return {
      constructId,
      promptId,
      outDir,
      args: [
        `--constructs=${constructId}`,
        `--prompt-id=${promptId}`,
        args.skipPersistence ? "--skip-persistence" : "--persist",
        `--out-dir=${outDir}`,
        "--json",
      ],
    };
  });
}

function buildLiveProofArgsForOrchestration(args = {}) {
  return buildLiveProofRunsForOrchestration(args)[0]?.args || [];
}

function buildLatestCodexContinuePayload({ resumeToken } = {}) {
  if (!resumeToken || typeof resumeToken !== "object") {
    throw new Error("resumeToken is required to build the latest-codex orchestration payload.");
  }

  return {
    constructId: resumeToken.constructId,
    message: "continue",
    threadId: resumeToken.threadId,
    sessionId: resumeToken.threadId,
    attachments: [],
    skipPersistence: false,
    continuity_expected: true,
    resume_from_turn_id: resumeToken.assistantTurnId,
    resume_from_continuity_seq: resumeToken.continuitySeq,
    resume_tail_hash: resumeToken.tailHash,
    resume_construct_revision: resumeToken.constructRevision,
    resume_source_seat: resumeToken.sourceSeat,
  };
}

function firstResult(report = {}) {
  return Array.isArray(report.results) && report.results.length ? report.results[0] : null;
}

function failureReasonFromReport(report = {}) {
  const reportFailure = Array.isArray(report.failures)
    ? report.failures.find((failure) => failure?.failureReason)
    : null;
  if (reportFailure?.failureReason) {
    return String(reportFailure.failureReason);
  }
  const resultFailure = Array.isArray(report.results)
    ? report.results.find((result) => result?.failureReason)
    : null;
  return String(resultFailure?.failureReason || "");
}

function failedStageFromReport(report = {}) {
  const failure = failureReasonFromReport(report);
  if (!failure) {
    return report.status === "warn" ? "warning" : "none";
  }
  if (/continuity|resume anchor|stale seat|continuedFromTurnId|continued from/i.test(failure)) {
    return "continuity";
  }
  if (/latest codex|codex rollout|conversational tail|relay precondition|source tail|parse report|terminal user\/assistant pair|end with an assistant/i.test(failure)) {
    return "context";
  }
  if (/auth|unauthenticated|session cookie|login/i.test(failure)) return "auth";
  if (/backend route|HTTP|route mode|proof request/i.test(failure)) return "route";
  if (/checklist/i.test(failure)) return "checklist";
  if (/receipt/i.test(failure)) return "receipt";
  if (/provider|model|fallback|ollama|local/i.test(failure)) return "provider";
  if (/canonical transcript|readback|persisted prompt|persisted answer|persistence|index|second-surface|hydration/i.test(failure)) {
    return "persistence";
  }
  if (/first-person|third person|helpdesk|voice/i.test(failure)) return "voice";
  return "unknown";
}

function boolWord(value) {
  return value ? "yes" : "no";
}

function valueOrUnknown(value) {
  if (value === null || value === undefined || value === "") {
    return "unknown";
  }
  return String(value);
}

function uniqueValues(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))]
    .map((value) => String(value));
}

function truncateText(value, limit = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}...`;
}

function sanitizeSummary(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeSummary(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const sanitized = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/^(cookiePresent|hasCookie)$/i.test(key)) {
      sanitized[key] = sanitizeSummary(entry);
      continue;
    }
    if (/(cookie|secret|token|authorization|api[_-]?key|service[_-]?key|provider[_-]?key)/i.test(key)) {
      continue;
    }
    sanitized[key] = sanitizeSummary(entry);
  }
  return sanitized;
}

function sanitizeResult(result) {
  if (!result) return null;
  return {
    constructId: result.constructId || null,
    threadId: result.threadId || null,
    promptId: result.promptId || null,
    httpStatus: result.httpStatus ?? null,
    route: result.route || null,
    persistenceMode: result.persistenceMode || null,
    persistenceVerdict: result.persistenceVerdict || null,
    canonicalTranscriptStatus: result.canonicalTranscriptStatus ?? null,
    beforeTranscriptMessageCount: result.beforeTranscriptMessageCount ?? null,
    afterTranscriptMessageCount: result.afterTranscriptMessageCount ?? null,
    promptReadbackFound: result.promptReadbackFound ?? null,
    answerReadbackFound: result.answerReadbackFound ?? null,
    conversationsIndexVisible: result.conversationsIndexVisible ?? null,
    contextSource: result.contextSource || null,
    relaySourcePath: result.relaySourcePath || null,
    relayImportedTurns: result.relayImportedTurns ?? null,
    relayDedupedTurns: result.relayDedupedTurns ?? null,
    relayLatestAssistantTurnId: result.relayLatestAssistantTurnId || null,
    relayCanonicalReadbackVerified:
      typeof result.relayCanonicalReadbackVerified === "boolean"
        ? result.relayCanonicalReadbackVerified
        : null,
    continuityRestored:
      typeof result.continuityRestored === "boolean"
        ? result.continuityRestored
        : null,
    continuedFromTurnId: result.continuedFromTurnId || null,
    continuityRestoredStageStatus: result.continuityRestoredStageStatus || null,
    transcriptMemoryStageStatus: result.transcriptMemoryStageStatus || null,
    transcriptMemoryVerifiedStatus: result.transcriptMemoryVerifiedStatus || null,
    transcriptMemoryCapsuleLoaded:
      typeof result.transcriptMemoryCapsuleLoaded === "boolean"
        ? result.transcriptMemoryCapsuleLoaded
        : null,
    transcriptMemoryCapsuleSource: result.transcriptMemoryCapsuleSource || null,
    transcriptLawEvidenceStageStatus: result.transcriptLawEvidenceStageStatus || null,
    capsuleRuntimeEvidenceStageStatus: result.capsuleRuntimeEvidenceStageStatus || null,
    transcriptLawGovernanceStageStatus: result.transcriptLawGovernanceStageStatus || null,
    transcriptLawGovernanceCapsuleLoaded:
      typeof result.transcriptLawGovernanceCapsuleLoaded === "boolean"
        ? result.transcriptLawGovernanceCapsuleLoaded
        : null,
    transcriptLawGovernanceCapsuleSource: result.transcriptLawGovernanceCapsuleSource || null,
    readbackImportedUserFound:
      typeof result.readbackImportedUserFound === "boolean"
        ? result.readbackImportedUserFound
        : null,
    readbackImportedAssistantFound:
      typeof result.readbackImportedAssistantFound === "boolean"
        ? result.readbackImportedAssistantFound
        : null,
    readbackResumedTurnPersisted:
      typeof result.readbackResumedTurnPersisted === "boolean"
        ? result.readbackResumedTurnPersisted
        : null,
    staleAnchorRejected:
      typeof result.staleAnchorRejected === "boolean"
        ? result.staleAnchorRejected
        : null,
    staleAnchorStatus: result.staleAnchorStatus ?? null,
    staleAnchorError: result.staleAnchorError || null,
    secondSurfaceSingletonThreadRestored:
      typeof result.secondSurfaceSingletonThreadRestored === "boolean"
        ? result.secondSurfaceSingletonThreadRestored
        : null,
    secondSurfaceThreadCount: result.secondSurfaceThreadCount ?? null,
    secondSurfaceHydrationSource: result.secondSurfaceHydrationSource || null,
    secondSurfaceHydrationComplete:
      typeof result.secondSurfaceHydrationComplete === "boolean"
        ? result.secondSurfaceHydrationComplete
        : null,
    receiptSummary: sanitizeSummary(result.receiptSummary || null),
    checklistSummary: sanitizeSummary(result.checklistSummary || null),
    answerPreview: truncateText(result.answerPreview || ""),
    failureReason: result.failureReason || null,
    warnings: result.warnings || [],
  };
}

function buildOrchestrationContract(report = {}) {
  const results = Array.isArray(report.results) ? report.results : [];
  const receipts = results.map((result) => result?.receiptSummary).filter(Boolean);
  const checklists = results.map((result) => result?.checklistSummary).filter(Boolean);
  const failedStage = failedStageFromReport(report);
  const status = report.status || "fail";
  const routeModes = uniqueValues(
    results.map((result) => result?.receiptSummary?.routeMode || result?.route || null),
  );
  const contextSources = uniqueValues(results.map((result) => result?.contextSource || null));
  const constructIds = uniqueValues(
    results.length
      ? results.map((result) => result?.constructId || result?.receiptSummary?.constructId || null)
      : report.constructs || DEFAULT_ORCHESTRATION_PROOF_CONSTRUCTS,
  );
  const orchestrationModes = uniqueValues(results.map((result) => result?.receiptSummary?.orchestrationMode || null));
  const persistenceOwners = uniqueValues(
    results.map(
      (result) =>
        result?.receiptSummary?.persistenceOwner ||
        result?.persistenceOwner ||
        result?.persistenceVerdict ||
        (result?.persistenceMode === "skipped" ? "skipped" : null),
    ),
  );
  const visibleOutput = results
    .map((result) => {
      const constructId = result?.constructId || "construct";
      const preview = truncateText(result?.answerPreview || "", 90);
      return preview ? `${constructId}: ${preview}` : null;
    })
    .filter(Boolean)
    .join(" | ");
  const continuityRestoredValues = results
    .map((result) =>
      typeof result?.continuityRestored === "boolean"
        ? result.continuityRestored
        : null,
    )
    .filter((value) => typeof value === "boolean");
  const expectedCount = constructIds.length || DEFAULT_ORCHESTRATION_PROOF_CONSTRUCTS.length;

  return {
    STATUS: valueOrUnknown(status),
    ROUTE_USED: valueOrUnknown(routeModes.join(",")),
    CONSTRUCT_ID: valueOrUnknown(constructIds.join(",")),
    ORCHESTRATION_MODE: valueOrUnknown(orchestrationModes.join(",")),
    CONTEXT_SOURCE: valueOrUnknown(contextSources.join(",")),
    CONTINUITY_RESTORED:
      continuityRestoredValues.length === 0
        ? "unknown"
        : boolWord(
            continuityRestoredValues.length >= expectedCount &&
              continuityRestoredValues.every(Boolean),
          ),
    RECEIPT_PRESENT: boolWord(results.length >= expectedCount && receipts.length === results.length),
    CHECKLIST_PRESENT: boolWord(results.length >= expectedCount && checklists.length === results.length),
    PERSISTENCE_OWNER: valueOrUnknown(persistenceOwners.join(",")),
    VISIBLE_OUTPUT: valueOrUnknown(visibleOutput),
    FAILED_STAGE: failedStage,
    FILES_CHANGED: "none",
    TESTS_RUN: "not run by orchestration proof command",
    FINAL_VERDICT: status === "pass" ? "PASS" : status === "warn" ? "WARN" : "FAIL",
  };
}

function formatOrchestrationContract(contract = {}) {
  const fields = [
    "STATUS",
    "ROUTE_USED",
    "CONSTRUCT_ID",
    "ORCHESTRATION_MODE",
    "CONTEXT_SOURCE",
    "CONTINUITY_RESTORED",
    "RECEIPT_PRESENT",
    "CHECKLIST_PRESENT",
    "PERSISTENCE_OWNER",
    "VISIBLE_OUTPUT",
    "FAILED_STAGE",
    "FILES_CHANGED",
    "TESTS_RUN",
    "FINAL_VERDICT",
  ];
  return `${fields.map((field) => `${field}: ${valueOrUnknown(contract[field])}`).join("\n")}\n`;
}

function summarizeReports(results) {
  return {
    total: results.length,
    pass: results.filter((result) => result?.status === "pass").length,
    warn: results.filter((result) => result?.status === "warn").length,
    fail: results.filter((result) => result?.status === "fail").length,
  };
}

function buildAggregateOrchestrationReport({
  apiUrl = null,
  outDir = DEFAULT_ORCHESTRATION_PROOF_OUTPUT_ROOT,
  args = {},
  auth = {},
  reports = [],
} = {}) {
  const results = reports.flatMap((report) => (Array.isArray(report?.results) ? report.results : []));
  const failures = reports.flatMap((report) => (Array.isArray(report?.failures) ? report.failures : []));
  const summary = summarizeReports(results);
  const hasWarnReport = reports.some((report) => report?.status === "warn");
  const hasFailReport = reports.some((report) => report?.status === "fail");
  const status = failures.length || summary.fail || hasFailReport ? "fail" : summary.warn || hasWarnReport ? "warn" : "pass";
  const constructs = Array.isArray(args.constructs) && args.constructs.length
    ? args.constructs
    : args.latestCodex === true
      ? [DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT]
      : [...DEFAULT_ORCHESTRATION_PROOF_CONSTRUCTS];
  return {
    generatedAt: new Date().toISOString(),
    apiUrl,
    outputRoot: outDir,
    persistenceMode: args.skipPersistence ? "skipped" : "persisted",
    status,
    summary,
    auth: sanitizeSummary({
      source: "cli-auth-bridge",
      cookiePresent: Boolean(auth.cookiePresent),
      storedSessionReused: Boolean(auth.storedSessionReused),
      autoAuthAttempted: Boolean(auth.autoAuthAttempted),
      browserOpenAllowed: auth.browserOpenAllowed !== false,
      authenticated: Boolean(auth.authenticated),
    }),
    constructs,
    results,
    failures,
    liveReports: reports.map((report) => ({
      outputRoot: report?.outputRoot || null,
      status: report?.status || null,
      summary: report?.summary || null,
    })),
  };
}

function buildOrchestrationAuthFailureReport({
  apiUrl = null,
  outDir = DEFAULT_ORCHESTRATION_PROOF_OUTPUT_ROOT,
  args = {},
  error = null,
  autoAuthAttempted = false,
} = {}) {
  const message = error?.message || String(error || "CLI auth bridge could not establish a session");
  const constructs = Array.isArray(args.constructs) && args.constructs.length
    ? args.constructs
    : args.latestCodex === true
      ? [DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT]
      : [...DEFAULT_ORCHESTRATION_PROOF_CONSTRUCTS];
  return {
    generatedAt: new Date().toISOString(),
    apiUrl,
    outputRoot: outDir,
    persistenceMode: args.skipPersistence ? "skipped" : "persisted",
    status: "fail",
    summary: {
      total: 0,
      pass: 0,
      warn: 0,
      fail: 1,
    },
    auth: sanitizeSummary({
      source: "cli-auth-bridge",
      cookiePresent: false,
      storedSessionReused: false,
      autoAuthAttempted,
      browserOpenAllowed: args.noBrowser !== true,
      authenticated: false,
    }),
    constructs,
    results: [],
    failures: [
      {
        constructId: null,
        threadId: null,
        promptId: "auth",
        failureReason: `authentication bridge failed: ${message}`,
      },
    ],
  };
}

function buildOrchestrationJsonOutput(report = {}) {
  const results = Array.isArray(report.results) ? report.results.map((result) => sanitizeResult(result)) : [];
  return {
    ok: report.status === "pass" || report.status === "warn",
    status: report.status || "fail",
    outputRoot: report.outputRoot || DEFAULT_ORCHESTRATION_PROOF_OUTPUT_ROOT,
    reportPath: report.outputRoot ? `${report.outputRoot}/report.json` : null,
    markdownPath: report.outputRoot ? `${report.outputRoot}/report.md` : null,
    auth: sanitizeSummary(report.auth || null),
    constructs: Array.isArray(report.constructs) ? report.constructs : [],
    contract: buildOrchestrationContract(report),
    result: results[0] || null,
    results,
    failures: Array.isArray(report.failures) ? report.failures.map((failure) => sanitizeSummary(failure)) : [],
  };
}

function buildOrchestrationMarkdownReport(report = {}) {
  const lines = [];
  const contract = buildOrchestrationContract(report);
  lines.push("# Chatty CLI Orchestration Proof");
  lines.push("");
  lines.push("```txt");
  lines.push(formatOrchestrationContract(contract).trim());
  lines.push("```");
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt || "unknown"}`);
  lines.push(`- API: ${report.apiUrl || "unknown"}`);
  lines.push(`- Output: ${report.outputRoot || "unknown"}`);
  lines.push(`- Persistence: ${report.persistenceMode || "unknown"}`);
  lines.push(`- Auth bridge: ${report.auth?.authenticated ? "authenticated" : "failed or unavailable"}`);
  lines.push("");

  if (report.failures?.length) {
    lines.push("## Failures");
    for (const failure of report.failures) {
      lines.push(`- ${failure.constructId || "auth"} / ${failure.promptId || "unknown"}: ${failure.failureReason}`);
    }
    lines.push("");
  }

  if (report.results?.length) {
    lines.push("## Results");
    for (const result of report.results) {
      lines.push(`- ${result.constructId} / ${result.promptId}: ${result.status}`);
      lines.push(`  - Route: ${result.route || result.receiptSummary?.routeMode || "unknown"}`);
      lines.push(`  - Receipt: ${result.receiptSummary ? "present" : "missing"}`);
      lines.push(`  - Checklist: ${result.checklistSummary ? "present" : "missing"}`);
      lines.push(`  - Transcript HTTP: ${result.canonicalTranscriptStatus ?? "unknown"}`);
      lines.push(`  - Persistence: ${result.persistenceVerdict || "unknown"}`);
      if (result.answerPreview) {
        lines.push(`  - Preview: ${truncateText(result.answerPreview, 160)}`);
      }
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

export {
  DEFAULT_ORCHESTRATION_PROOF_CONSTRUCT,
  DEFAULT_ORCHESTRATION_PROOF_CONSTRUCTS,
  DEFAULT_ORCHESTRATION_PROOF_OUTPUT_ROOT,
  DEFAULT_ORCHESTRATION_PROOF_PROMPT_ID,
  DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT,
  DEFAULT_LATEST_CODEX_ORCHESTRATION_PROMPT_ID,
  ORCHESTRATION_PROOF_PROMPT_BY_CONSTRUCT,
  buildLatestCodexContinuePayload,
  buildAggregateOrchestrationReport,
  buildLiveProofArgsForOrchestration,
  buildLiveProofRunsForOrchestration,
  buildOrchestrationAuthFailureReport,
  buildOrchestrationContract,
  buildOrchestrationJsonOutput,
  buildOrchestrationMarkdownReport,
  failedStageFromReport,
  formatOrchestrationContract,
  parseOrchestrationProofArgs,
  validateLatestCodexOrchestrationArgs,
};
