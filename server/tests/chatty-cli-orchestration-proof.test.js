import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_ORCHESTRATION_PROOF_CONSTRUCTS,
  DEFAULT_ORCHESTRATION_PROOF_OUTPUT_ROOT,
  DEFAULT_ORCHESTRATION_PROOF_PROMPT_ID,
  buildAggregateOrchestrationReport,
  buildLiveProofRunsForOrchestration,
  buildOrchestrationAuthFailureReport,
  buildOrchestrationContract,
  buildOrchestrationJsonOutput,
  failedStageFromReport,
  formatOrchestrationContract,
  parseOrchestrationProofArgs,
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
    stages: [{ id: "persistence", status: "pass" }],
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

test("chatty-cli handoff relays stdin JSON and emits a resume URL", async () => {
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

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.command, "chatty-cli handoff");
    assert.equal(payload.source.type, "stdin-json");
    assert.equal(payload.importedTurns, 2);
    assert.match(payload.chattyResumeUrl, /^http:\/\/localhost:5173\/app\/chat\/zen-001_chat_with_zen-001\?resume=/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("chatty-cli handoff relays a saved Codex export file and emits a resume URL", async () => {
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

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.command, "chatty-cli handoff");
    assert.equal(payload.source.type, "file");
    assert.equal(payload.source.path, exportPath);
    assert.equal(payload.importedTurns, 2);
    assert.match(payload.chattyResumeUrl, /^http:\/\/localhost:5173\/app\/chat\/zen-001_chat_with_zen-001\?resume=/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("chatty-cli handoff relays the latest local Codex rollout and emits a resume URL", async () => {
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
          payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "latest codex tail ready" }] },
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

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.command, "chatty-cli handoff");
    assert.equal(payload.source.type, "latest-codex");
    assert.equal(payload.importedTurns, 2);
    assert.match(payload.chattyResumeUrl, /^http:\/\/localhost:5173\/app\/chat\/zen-001_chat_with_zen-001\?resume=/);
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
  assert.doesNotMatch(serialized, /full answer body/);
  assert.doesNotMatch(serialized, /full prompt body/);
  assert.doesNotMatch(serialized, /secret-cookie/);
  assert.doesNotMatch(serialized, /secret-provider-key/);
});
