import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT,
  DEFAULT_LATEST_CODEX_ORCHESTRATION_PROMPT_ID,
  DEFAULT_ORCHESTRATION_PROOF_CONSTRUCTS,
  DEFAULT_ORCHESTRATION_PROOF_OUTPUT_ROOT,
  DEFAULT_ORCHESTRATION_PROOF_PROMPT_ID,
  buildAggregateOrchestrationReport,
  buildLatestCodexContinuePayload,
  buildLiveProofRunsForOrchestration,
  buildOrchestrationAuthFailureReport,
  buildOrchestrationContract,
  buildOrchestrationJsonOutput,
  failedStageFromReport,
  formatOrchestrationContract,
  parseOrchestrationProofArgs,
  validateLatestCodexOrchestrationArgs,
} from "../lib/chattyCliOrchestrationProof.js";

const zenResult = {
  constructId: "zen-001",
  threadId: "zen-001_chat_with_zen-001",
  promptId: DEFAULT_ORCHESTRATION_PROOF_PROMPT_ID,
  httpStatus: 200,
  route: "canonical",
  persistenceMode: "persisted",
  persistenceVerdict: "verified",
  canonicalTranscriptStatus: 200,
  promptReadbackFound: true,
  answerReadbackFound: true,
  conversationsIndexVisible: true,
  contextSource: "latest-codex",
  relaySourcePath: "/Users/devonwoodson/.codex/sessions/2026/05/09/rollout.jsonl",
  relayImportedTurns: 2,
  relayDedupedTurns: 0,
  relayLatestAssistantTurnId: "rt_18_tail",
  relayCanonicalReadbackVerified: true,
  continuityRestored: true,
  continuedFromTurnId: "rt_18_tail",
  continuityRestoredStageStatus: "pass",
  transcriptMemoryStageStatus: "pass",
  transcriptMemoryVerifiedStatus: "success",
  transcriptMemoryCapsuleLoaded: true,
  transcriptMemoryCapsuleSource: "capsule-file",
  transcriptLawEvidenceStageStatus: "pass",
  capsuleRuntimeEvidenceStageStatus: "pass",
  transcriptLawGovernanceStageStatus: "pass",
  transcriptLawGovernanceCapsuleLoaded: true,
  transcriptLawGovernanceCapsuleSource: "capsule-file",
  readbackImportedUserFound: true,
  readbackImportedAssistantFound: true,
  readbackResumedTurnPersisted: true,
  staleAnchorRejected: true,
  staleAnchorStatus: 409,
  staleAnchorError: "CONTINUITY_RESUME_STALE",
  secondSurfaceSingletonThreadRestored: true,
  secondSurfaceThreadCount: 1,
  secondSurfaceHydrationSource: "full",
  secondSurfaceHydrationComplete: true,
  answerPreview: "I am proving orchestration through the live receipt-backed route.",
  receiptSummary: {
    routeMode: "canonical",
    constructId: "zen-001",
    persistenceOwner: "canonical",
    orchestrationMode: "lin",
    provider: "openai",
    model: "gpt-5.1",
  },
  checklistSummary: {
    overallStatus: "pass",
    stages: [
      { id: "auth", status: "pass" },
      { id: "construct_identity", status: "pass" },
      { id: "orchestration_mode", status: "pass" },
      { id: "transcript_memory", status: "pass" },
      { id: "continuity_restored", status: "pass" },
      { id: "transcript_law_evidence", status: "pass" },
      { id: "capsule_runtime_evidence", status: "pass" },
      { id: "provider", status: "pass" },
      { id: "persistence", status: "pass" },
    ],
  },
  status: "pass",
  failureReason: null,
  warnings: [],
};

const novaResult = {
  ...zenResult,
  constructId: "nova-001",
  threadId: "nova-001_chat_with_nova-001",
  promptId: "nova_direct_address",
  answerPreview: "I am here through the same backend proof path, speaking as Nova.",
  receiptSummary: {
    ...zenResult.receiptSummary,
    constructId: "nova-001",
  },
};

const passingReport = {
  status: "pass",
  outputRoot: "/tmp/chatty-cli-orchestration-proof",
  persistenceMode: "persisted",
  auth: {
    source: "cli-auth-bridge",
    cookiePresent: true,
    authenticated: true,
  },
  constructs: ["zen-001", "nova-001"],
  results: [zenResult, novaResult],
  failures: [],
};

test("parseOrchestrationProofArgs defaults to persisted Zen and Nova proof artifacts", () => {
  const args = parseOrchestrationProofArgs([]);
  const runs = buildLiveProofRunsForOrchestration(args);

  assert.equal(args.skipPersistence, false);
  assert.equal(args.json, false);
  assert.equal(args.outDir, DEFAULT_ORCHESTRATION_PROOF_OUTPUT_ROOT);
  assert.deepEqual(args.constructs, DEFAULT_ORCHESTRATION_PROOF_CONSTRUCTS);
  assert.deepEqual(
    runs.map((run) => [run.constructId, run.promptId]),
    [
      ["zen-001", "zen_direct_orchestration"],
      ["nova-001", "nova_direct_address"],
    ],
  );
  assert.equal(runs[0].args.includes("--persist"), true);
  assert.equal(runs[1].args.includes("--persist"), true);
});

test("chatty-cli orchestration parses operator auth and construct flags", () => {
  const result = spawnSync(
    "./node_modules/.bin/tsx",
    [
      "--eval",
      [
        "import { isOrchestrationProofCommand, parseCliArgs } from './src/cli/chatty-cli.ts';",
        "const args = parseCliArgs(['orchestration', '--json', '--skip-persistence', '--constructs=nova-001', '--no-browser', '--auth-timeout-ms=1234', '--out-dir=/tmp/proof']);",
        "console.log(JSON.stringify({",
        "  isProof: isOrchestrationProofCommand(args),",
        "  jsonOut: args.jsonOut,",
        "  skipPersistence: args.skipPersistence,",
        "  constructs: args.orchestrationConstructs,",
        "  noBrowser: args.orchestrationNoBrowser,",
        "  authTimeoutMs: args.orchestrationAuthTimeoutMs,",
        "  outDir: args.orchestrationOutDir,",
        "  positionals: args.positionals,",
        "}));",
      ].join("\n"),
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    isProof: true,
    jsonOut: true,
    skipPersistence: true,
    constructs: "nova-001",
    noBrowser: true,
    authTimeoutMs: 1234,
    outDir: "/tmp/proof",
    positionals: ["orchestration"],
  });
});

test("chatty-cli orchestration parses latest-codex as a route-backed proof input", () => {
  const result = spawnSync(
    "./node_modules/.bin/tsx",
    [
      "--eval",
      [
        "import { isOrchestrationProofCommand, parseCliArgs } from './src/cli/chatty-cli.ts';",
        "const args = parseCliArgs(['orchestration', '--latest-codex', '--json']);",
        "console.log(JSON.stringify({",
        "  isProof: isOrchestrationProofCommand(args),",
        "  jsonOut: args.jsonOut,",
        "  latestCodex: args.handoffLatestCodex,",
        "  positionals: args.positionals,",
        "}));",
      ].join('\n'),
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    isProof: true,
    jsonOut: true,
    latestCodex: true,
    positionals: ["orchestration"],
  });
});

test("chatty-cli handoff parses transcript-source flags without runtime flags", () => {
  const result = spawnSync(
    "./node_modules/.bin/tsx",
    [
      "--eval",
      [
        "import { isCodexHandoffCommand, isOrchestrationProofCommand, parseCliArgs } from './src/cli/chatty-cli.ts';",
        "const args = parseCliArgs(['handoff', '--from-file', '/tmp/codex-tail.txt']);",
        "console.log(JSON.stringify({",
        "  isHandoff: isCodexHandoffCommand(args),",
        "  isProof: isOrchestrationProofCommand(args),",
        "  onceMode: args.onceMode,",
        "  localMode: args.localMode,",
        "  localModel: args.localModel,",
        "  noBrowser: args.orchestrationNoBrowser,",
        "  handoffLatestCodex: args.handoffLatestCodex,",
        "  handoffFromFile: args.handoffFromFile,",
        "  handoffStdinJson: args.handoffStdinJson,",
        "  handoffSeedOnly: args.handoffSeedOnly,",
        "  positionals: args.positionals,",
        "}));",
      ].join("\n"),
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    isHandoff: true,
    isProof: false,
    onceMode: false,
    localMode: false,
    localModel: false,
    noBrowser: false,
    handoffLatestCodex: false,
    handoffFromFile: "/tmp/codex-tail.txt",
    handoffStdinJson: false,
    handoffSeedOnly: false,
    positionals: ["handoff"],
  });
});

test("chatty-cli handoff fails closed without transcript input unless --seed-only is set", () => {
  const result = spawnSync(
    "./node_modules/.bin/tsx",
    ["src/cli/chatty-cli.ts", "handoff"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /requires --latest-codex, --from-file, or --stdin-json/i);
});

test("chatty-cli handoff parses latest-codex as the primary operator source", () => {
  const result = spawnSync(
    "./node_modules/.bin/tsx",
    [
      "--eval",
      [
        "import { isCodexHandoffCommand, parseCliArgs } from './src/cli/chatty-cli.ts';",
        "const args = parseCliArgs(['handoff', '--latest-codex']);",
        "console.log(JSON.stringify({",
        "  isHandoff: isCodexHandoffCommand(args),",
        "  handoffLatestCodex: args.handoffLatestCodex,",
        "  handoffFromFile: args.handoffFromFile || null,",
        "  handoffStdinJson: args.handoffStdinJson,",
        "  handoffSeedOnly: args.handoffSeedOnly,",
        "}));",
      ].join('\n'),
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    isHandoff: true,
    handoffLatestCodex: true,
    handoffFromFile: null,
    handoffStdinJson: false,
    handoffSeedOnly: false,
  });
});

test("chatty-cli handoff parses latest-codex watch mode with poll interval", () => {
  const result = spawnSync(
    "./node_modules/.bin/tsx",
    [
      "--eval",
      [
        "import { isCodexHandoffCommand, parseCliArgs } from './src/cli/chatty-cli.ts';",
        "const args = parseCliArgs(['handoff', '--latest-codex', '--watch', '--poll-seconds', '4']);",
        "console.log(JSON.stringify({",
        "  isHandoff: isCodexHandoffCommand(args),",
        "  handoffLatestCodex: args.handoffLatestCodex,",
        "  handoffWatch: args.handoffWatch,",
        "  handoffPollSeconds: args.handoffPollSeconds,",
        "}));",
      ].join('\n'),
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    isHandoff: true,
    handoffLatestCodex: true,
    handoffWatch: true,
    handoffPollSeconds: 4,
  });
});

test("chatty-cli handoff watch fails closed without latest-codex", () => {
  const result = spawnSync(
    "./node_modules/.bin/tsx",
    ["src/cli/chatty-cli.ts", "handoff", "--watch"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--watch requires --latest-codex/i);
});

test("chatty-cli handoff poll-seconds fails closed without watch", () => {
  const result = spawnSync(
    "./node_modules/.bin/tsx",
    ["src/cli/chatty-cli.ts", "handoff", "--latest-codex", "--poll-seconds", "4"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--poll-seconds requires --watch/i);
});

test("chatty-cli handoff help documents the VVAULT readback-gated watch command", () => {
  const result = spawnSync(
    "./node_modules/.bin/tsx",
    ["src/cli/chatty-cli.ts", "--help"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /chatty-cli handoff \[--latest-codex \[--watch\] \[--poll-seconds <n>\]/);
  assert.match(result.stdout, /relay only after VVAULT readback proof/i);
});

test("chatty-cli handoff fails closed for stdin JSON when canonical VVAULT is unavailable", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "chatty-cli-handoff-stdin-"));
  const storePath = path.join(tempDir, "store.json");

  try {
    const result = spawnSync(
      "./node_modules/.bin/tsx",
      ["src/cli/chatty-cli.ts", "handoff", "--stdin-json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        input: JSON.stringify([
          { role: "user", content: "Relay this prompt from stdin." },
          { role: "assistant", content: "Relay acknowledged from stdin." },
        ]),
        env: {
          ...process.env,
          VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH: storePath,
          DATABASE_URL: "",
          VVAULT_API_BASE_URL: "",
          VVAULT_URL: "",
          VVAULT_BASE_URL: "",
        },
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Codex relay canonical user write failed/i);
    assert.equal(result.stdout, "");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("chatty-cli handoff fails closed for saved Codex exports when canonical VVAULT is unavailable", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "chatty-cli-handoff-file-"));
  const storePath = path.join(tempDir, "store.json");
  const exportPath = path.join(tempDir, "codex-export.txt");

  try {
    await fs.writeFile(
      exportPath,
      [
        "No tasks in progress",
        "",
        "",
        "carry this into chatty",
        "",
        "",
        "2 previous messages",
        "I will carry this into Chatty.",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "./node_modules/.bin/tsx",
      ["src/cli/chatty-cli.ts", "handoff", "--from-file", exportPath],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH: storePath,
          DATABASE_URL: "",
          VVAULT_API_BASE_URL: "",
          VVAULT_URL: "",
          VVAULT_BASE_URL: "",
        },
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Codex relay canonical user write failed/i);
    assert.equal(result.stdout, "");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("chatty-cli handoff fails closed for latest local Codex rollout when canonical VVAULT is unavailable", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "chatty-cli-handoff-latest-codex-"));
  const storePath = path.join(tempDir, "store.json");
  const sessionsRoot = path.join(tempDir, "sessions");
  const rolloutDir = path.join(sessionsRoot, "2026", "05", "08");
  const rolloutPath = path.join(rolloutDir, "rollout-latest.jsonl");

  try {
    await fs.mkdir(rolloutDir, { recursive: true });
    await fs.writeFile(
      rolloutPath,
      [
        JSON.stringify({
          timestamp: "2026-05-08T23:35:00.000Z",
          type: "session_meta",
          payload: { id: "latest-codex", cwd: process.cwd() },
        }),
        JSON.stringify({
          timestamp: "2026-05-08T23:35:01.000Z",
          type: "response_item",
          payload: { type: "message", role: "user", content: [{ type: "input_text", text: "carry latest codex tail" }] },
        }),
        JSON.stringify({
          timestamp: "2026-05-08T23:35:02.000Z",
          type: "response_item",
          payload: { type: "message", role: "assistant", phase: "final_answer", content: [{ type: "output_text", text: "latest codex tail ready" }] },
        }),
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "./node_modules/.bin/tsx",
      ["src/cli/chatty-cli.ts", "handoff", "--latest-codex"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          CODEX_SESSIONS_ROOT: sessionsRoot,
          VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH: storePath,
          DATABASE_URL: "",
          VVAULT_API_BASE_URL: "",
          VVAULT_URL: "",
          VVAULT_BASE_URL: "",
        },
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Codex relay canonical user write failed/i);
    assert.equal(result.stdout, "");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("chatty-cli handoff watch fails closed when VVAULT authority is unavailable", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "chatty-cli-handoff-watch-vvault-"));
  const storePath = path.join(tempDir, "store.json");
  const sessionsRoot = path.join(tempDir, "sessions");
  const rolloutDir = path.join(sessionsRoot, "2026", "05", "08");
  const rolloutPath = path.join(rolloutDir, "rollout-watch.jsonl");
  const cliHome = path.join(tempDir, "chatty-cli-home");

  try {
    await fs.mkdir(rolloutDir, { recursive: true });
    await fs.writeFile(
      rolloutPath,
      [
        JSON.stringify({
          timestamp: "2026-05-08T23:45:00.000Z",
          type: "session_meta",
          payload: { id: "latest-codex-watch", cwd: process.cwd() },
        }),
        JSON.stringify({
          timestamp: "2026-05-08T23:45:01.000Z",
          type: "response_item",
          payload: { type: "message", role: "user", content: [{ type: "input_text", text: "watch latest codex tail" }] },
        }),
        JSON.stringify({
          timestamp: "2026-05-08T23:45:02.000Z",
          type: "response_item",
          payload: { type: "message", role: "assistant", phase: "final_answer", content: [{ type: "output_text", text: "watch latest codex tail ready" }] },
        }),
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "./node_modules/.bin/tsx",
      ["src/cli/chatty-cli.ts", "handoff", "--latest-codex", "--watch", "--poll-seconds", "1"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          CODEX_SESSIONS_ROOT: sessionsRoot,
          CHATTY_CLI_HOME: cliHome,
          CHATTY_CLI_HANDOFF_WATCH_MAX_POLLS: "1",
          VVAULT_LOCAL_CONVERSATION_FALLBACK_PATH: storePath,
          DATABASE_URL: "",
          VVAULT_API_BASE_URL: "",
          VVAULT_URL: "",
          VVAULT_BASE_URL: "",
          VVAULT_SERVICE_TOKEN: "",
        },
      },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Codex thread VVAULT sync unavailable/i);
    await assert.rejects(() => fs.access(path.join(cliHome, "codex-handoff-watch.state.json")));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("parseOrchestrationProofArgs supports skip-persistence, no-browser, auth timeout, and construct filter", () => {
  const args = parseOrchestrationProofArgs([
    "--json",
    "--skip-persistence",
    "--constructs=nova-001",
    "--no-browser",
    "--auth-timeout-ms=2500",
    "--out-dir=/tmp/custom-proof",
  ]);
  const runs = buildLiveProofRunsForOrchestration(args);

  assert.equal(args.json, true);
  assert.equal(args.skipPersistence, true);
  assert.equal(args.noBrowser, true);
  assert.equal(args.authTimeoutMs, 2500);
  assert.deepEqual(args.constructs, ["nova-001"]);
  assert.deepEqual(runs, [
    {
      constructId: "nova-001",
      promptId: "nova_direct_address",
      outDir: "/tmp/custom-proof/live/nova-001",
      args: [
        "--constructs=nova-001",
        "--prompt-id=nova_direct_address",
        "--skip-persistence",
        "--out-dir=/tmp/custom-proof/live/nova-001",
        "--json",
      ],
    },
  ]);
});

test("parseOrchestrationProofArgs supports latest-codex as a Zen-only proof mode", () => {
  const args = parseOrchestrationProofArgs([
    "--json",
    "--latest-codex",
    "--constructs=zen-001",
  ]);
  const runs = buildLiveProofRunsForOrchestration(args);

  assert.equal(args.latestCodex, true);
  assert.deepEqual(args.constructs, ["zen-001"]);
  assert.deepEqual(runs, [
    {
      constructId: "zen-001",
      promptId: DEFAULT_LATEST_CODEX_ORCHESTRATION_PROMPT_ID,
      outDir: "/private/tmp/chatty-cli-orchestration-proof/live/zen-001",
      args: [
        "--latest-codex",
        "--persist",
        "--out-dir=/private/tmp/chatty-cli-orchestration-proof/live/zen-001",
        "--json",
      ],
    },
  ]);
});

test("validateLatestCodexOrchestrationArgs rejects multi-construct and non-persisted runs", () => {
  assert.throws(
    () =>
      validateLatestCodexOrchestrationArgs({
        latestCodex: true,
        constructs: ["zen-001", "nova-001"],
        skipPersistence: false,
      }),
    /Zen-only/i,
  );
  assert.throws(
    () =>
      validateLatestCodexOrchestrationArgs({
        latestCodex: true,
        constructs: ["zen-001"],
        skipPersistence: true,
      }),
    /requires canonical persistence/i,
  );
});

test("buildLatestCodexContinuePayload emits a real continue turn with resume anchor fields", () => {
  assert.deepEqual(
    buildLatestCodexContinuePayload({
      resumeToken: {
        constructId: "zen-001",
        threadId: "zen-001_chat_with_zen-001",
        continuitySeq: 18,
        assistantTurnId: "rt_18_abc",
        tailHash: "tail-hash",
        constructRevision: "construct-runtime-v1:zen-001",
        sourceSeat: "codex",
      },
    }),
    {
      constructId: "zen-001",
      message: "continue",
      threadId: "zen-001_chat_with_zen-001",
      sessionId: "zen-001_chat_with_zen-001",
      attachments: [],
      skipPersistence: false,
      continuity_expected: true,
      resume_from_turn_id: "rt_18_abc",
      resume_from_continuity_seq: 18,
      resume_tail_hash: "tail-hash",
      resume_construct_revision: "construct-runtime-v1:zen-001",
      resume_source_seat: "codex",
    },
  );
});

test("auth failure maps to FAILED_STAGE auth and carries no backend results", () => {
  const args = parseOrchestrationProofArgs(["--no-browser"]);
  const report = buildOrchestrationAuthFailureReport({
    apiUrl: "http://127.0.0.1:5050",
    outDir: "/tmp/proof",
    args,
    error: new Error("No stored CLI session and --no-browser was provided"),
    autoAuthAttempted: false,
  });
  const contract = buildOrchestrationContract(report);

  assert.equal(report.results.length, 0);
  assert.equal(report.failures.length, 1);
  assert.equal(contract.FAILED_STAGE, "auth");
  assert.equal(contract.RECEIPT_PRESENT, "no");
  assert.equal(contract.CHECKLIST_PRESENT, "no");
});

test("aggregate contract is derived from receipt, checklist, and persistence readback", () => {
  const report = buildAggregateOrchestrationReport({
    apiUrl: "http://127.0.0.1:5050",
    outDir: "/tmp/proof",
    args: parseOrchestrationProofArgs([]),
    auth: { authenticated: true, cookiePresent: true },
    reports: [
      { status: "pass", results: [zenResult], failures: [], summary: { total: 1, pass: 1, warn: 0, fail: 0 } },
      { status: "pass", results: [novaResult], failures: [], summary: { total: 1, pass: 1, warn: 0, fail: 0 } },
    ],
  });
  const contract = buildOrchestrationContract(report);
  const text = formatOrchestrationContract(contract);

  assert.equal(contract.STATUS, "pass");
  assert.equal(contract.ROUTE_USED, "canonical");
  assert.equal(contract.CONSTRUCT_ID, "zen-001,nova-001");
  assert.equal(contract.ORCHESTRATION_MODE, "lin");
  assert.equal(contract.RECEIPT_PRESENT, "yes");
  assert.equal(contract.CHECKLIST_PRESENT, "yes");
  assert.equal(contract.PERSISTENCE_OWNER, "canonical");
  assert.equal(contract.FAILED_STAGE, "none");
  assert.match(text, /^STATUS: pass/m);
  assert.match(text, /^FINAL_VERDICT: PASS/m);
});

test("latest-codex contract includes context source and continuity restoration", () => {
  const report = buildAggregateOrchestrationReport({
    apiUrl: "http://127.0.0.1:5050",
    outDir: "/tmp/proof",
    args: {
      latestCodex: true,
      constructs: [DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT],
      skipPersistence: false,
    },
    auth: { authenticated: true, cookiePresent: true },
    reports: [
      {
        status: "pass",
        results: [
          {
            constructId: "zen-001",
            threadId: "zen-001_chat_with_zen-001",
            promptId: DEFAULT_LATEST_CODEX_ORCHESTRATION_PROMPT_ID,
            route: "vvault_message",
            receiptSummary: {
              routeMode: "vvault_message",
              constructId: "zen-001",
              persistenceOwner: "vvault_body",
              orchestrationMode: "lin",
            },
            checklistSummary: {
              overallStatus: "pass",
              stages: [
                { id: "auth", status: "pass" },
                { id: "construct_identity", status: "pass" },
                { id: "orchestration_mode", status: "pass" },
                { id: "transcript_memory", status: "pass" },
                { id: "continuity_restored", status: "pass" },
                { id: "transcript_law_evidence", status: "pass" },
                { id: "capsule_runtime_evidence", status: "pass" },
                { id: "provider", status: "pass" },
                { id: "persistence", status: "pass" },
              ],
            },
            contextSource: "latest-codex",
            continuityRestored: true,
            continuityRestoredStageStatus: "pass",
            transcriptLawEvidenceStageStatus: "pass",
            capsuleRuntimeEvidenceStageStatus: "pass",
            answerPreview: "continue route-backed from the imported Codex tail",
            status: "pass",
            failureReason: null,
            warnings: [],
          },
        ],
        failures: [],
        summary: { total: 1, pass: 1, warn: 0, fail: 0 },
      },
    ],
  });
  const contract = buildOrchestrationContract(report);

  assert.equal(contract.CONTEXT_SOURCE, "latest-codex");
  assert.equal(contract.CONTINUITY_RESTORED, "yes");
});

test("failed stage maps transcript readback failures to persistence", () => {
  assert.equal(
    failedStageFromReport({
      status: "fail",
      results: [
        {
          failureReason: "persisted answer was not found in canonical transcript readback",
        },
      ],
    }),
    "persistence",
  );
});

test("failed stage maps second-surface hydration failures to persistence", () => {
  assert.equal(
    failedStageFromReport({
      status: "fail",
      results: [
        {
          failureReason:
            "second-surface conversations hydration did not restore exactly one full singleton Zen thread",
        },
      ],
    }),
    "persistence",
  );
});

test("failed stage maps latest-codex source failures to context", () => {
  assert.equal(
    failedStageFromReport({
      status: "fail",
      failures: [
        {
          failureReason: "latest Codex orchestration proof failed: Codex rollout does not contain a terminal user/assistant pair.",
        },
      ],
    }),
    "context",
  );
});

test("failed stage maps resume-anchor failures to continuity", () => {
  assert.equal(
    failedStageFromReport({
      status: "fail",
      failures: [
        {
          failureReason: "continuedFromTurnId did not match the imported latest Codex assistant tail",
        },
      ],
    }),
    "continuity",
  );
});

test("failed stage maps missing transcript-memory receipt evidence to checklist", () => {
  assert.equal(
    failedStageFromReport({
      status: "fail",
      failures: [
        {
          failureReason:
            "orchestration_checklist transcript_memory stage did not expose capsuleSource in the live receipt",
        },
      ],
    }),
    "checklist",
  );
});

test("JSON output includes per-construct summaries and omits secrets and transcript bodies", () => {
  const output = buildOrchestrationJsonOutput({
    ...passingReport,
    results: [
      {
        ...zenResult,
        answer: "full answer body must not be emitted",
        prompt: "full prompt body should not be emitted",
        auth: { cookie: "secret-cookie", cookiePresent: true },
        receiptSummary: {
          ...zenResult.receiptSummary,
          apiKey: "secret-provider-key",
        },
      },
      novaResult,
    ],
  });
  const serialized = JSON.stringify(output);

  assert.equal(output.ok, true);
  assert.equal(output.results.length, 2);
  assert.equal(output.result.receiptSummary.routeMode, "canonical");
  assert.equal(output.result.checklistSummary.overallStatus, "pass");
  assert.equal(output.result.persistenceVerdict, "verified");
  assert.equal(output.result.relayCanonicalReadbackVerified, true);
  assert.equal(output.result.staleAnchorRejected, true);
  assert.equal(output.result.staleAnchorStatus, 409);
  assert.equal(output.result.staleAnchorError, "CONTINUITY_RESUME_STALE");
  assert.equal(output.result.secondSurfaceSingletonThreadRestored, true);
  assert.equal(output.result.secondSurfaceThreadCount, 1);
  assert.equal(output.result.secondSurfaceHydrationSource, "full");
  assert.equal(output.result.secondSurfaceHydrationComplete, true);
  assert.equal(output.result.transcriptMemoryStageStatus, "pass");
  assert.equal(output.result.transcriptMemoryVerifiedStatus, "success");
  assert.equal(output.result.transcriptMemoryCapsuleLoaded, true);
  assert.equal(output.result.transcriptMemoryCapsuleSource, "capsule-file");
  assert.equal(output.result.continuityRestoredStageStatus, "pass");
  assert.equal(output.result.transcriptLawEvidenceStageStatus, "pass");
  assert.equal(output.result.capsuleRuntimeEvidenceStageStatus, "pass");
  assert.equal(output.result.transcriptLawGovernanceStageStatus, "pass");
  assert.equal(output.result.transcriptLawGovernanceCapsuleLoaded, true);
  assert.equal(output.result.transcriptLawGovernanceCapsuleSource, "capsule-file");
  assert.doesNotMatch(serialized, /full answer body/);
  assert.doesNotMatch(serialized, /full prompt body/);
  assert.doesNotMatch(serialized, /secret-cookie/);
  assert.doesNotMatch(serialized, /secret-provider-key/);
});
