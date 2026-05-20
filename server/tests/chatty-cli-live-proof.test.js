import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LIVE_PROOF_OUTPUT_ROOT,
  buildAuthFailureReport,
  buildAnswerFileName,
  classifyLiveProofTurn,
  parseLiveProofArgs,
  selectLiveProofPrompts,
} from "../lib/chattyCliLiveProof.js";

const novaConstruct = {
  constructId: "nova-001",
  displayName: "Nova",
  name: "Nova",
};

const novaPrompt = {
  id: "nova_direct_address",
  constructId: "nova-001",
  requiresFirstPerson: true,
};

const receipt = {
  routeMode: "canonical",
  constructId: "nova-001",
  provider: "openai",
  model: "gpt-5.1",
  fallbackUsed: false,
  localCloudFallbackState: null,
};

test("parseLiveProofArgs defaults to Zen/Nova with skip persistence", () => {
  const args = parseLiveProofArgs(["--json"]);

  assert.deepEqual(args.constructs, ["zen-001", "nova-001"]);
  assert.equal(args.promptId, null);
  assert.equal(args.skipPersistence, true);
  assert.equal(args.json, true);
  assert.equal(args.outDir, DEFAULT_LIVE_PROOF_OUTPUT_ROOT);
});

test("parseLiveProofArgs supports persist, construct filter, and out dir", () => {
  const args = parseLiveProofArgs([
    "--constructs=nova-001",
    "--persist",
    "--out-dir",
    "/tmp/chatty-proof-fixture",
  ]);

  assert.deepEqual(args.constructs, ["nova-001"]);
  assert.equal(args.skipPersistence, false);
  assert.equal(args.outDir, "/tmp/chatty-proof-fixture");
  assert.deepEqual(
    selectLiveProofPrompts(args.constructs).map((prompt) => prompt.id),
    ["nova_direct_address", "nova_continuity_memory", "nova_evidence_positive_control"],
  );
});

test("parseLiveProofArgs supports prompt-id and filters to one prompt", () => {
  const args = parseLiveProofArgs(["--constructs=nova-001", "--prompt-id=nova_evidence_positive_control"]);

  assert.equal(args.promptId, "nova_evidence_positive_control");
  assert.deepEqual(
    selectLiveProofPrompts(args.constructs, args.promptId).map((prompt) => prompt.id),
    ["nova_evidence_positive_control"],
  );
});

test("selectLiveProofPrompts supports Katana technical-presence proof", () => {
  assert.deepEqual(
    selectLiveProofPrompts(["katana-001"]).map((prompt) => ({
      id: prompt.id,
      constructId: prompt.constructId,
      requiresFirstPerson: prompt.requiresFirstPerson,
    })),
    [
      {
        id: "katana_technical_presence",
        constructId: "katana-001",
        requiresFirstPerson: true,
      },
    ],
  );
});

test("classifyLiveProofTurn passes when receipt and checklist exist and voice checks pass", () => {
  const result = classifyLiveProofTurn({
    answer: "I am here directly, and I can point at the current orchestration receipt.",
    construct: novaConstruct,
    prompt: novaPrompt,
    receipt,
    checklist: { promptRouted: true },
    persistenceMode: "persisted",
    persistenceVerified: true,
    uiVisibilityLikely: true,
  });

  assert.equal(result.status, "pass");
  assert.equal(result.failureReason, null);
  assert.equal(result.voiceChecks.firstPersonDirectAddress, true);
  assert.equal(result.fallbackChecks.missingReceipt, false);
});

test("classifyLiveProofTurn passes persisted proof when transcript readback exists", () => {
  const result = classifyLiveProofTurn({
    answer: "I am here directly.",
    construct: novaConstruct,
    prompt: novaPrompt,
    receipt,
    checklist: { promptRouted: true },
    persistenceMode: "persisted",
    persistenceVerified: true,
    uiVisibilityLikely: true,
    canonicalTranscriptStatus: 200,
    transcriptPromptReadback: true,
    transcriptAnswerReadback: true,
  });

  assert.equal(result.status, "pass");
  assert.equal(result.failureReason, null);
});

test("classifyLiveProofTurn fails persisted proof when canonical transcript endpoint fails", () => {
  const result = classifyLiveProofTurn({
    answer: "I am here directly.",
    construct: novaConstruct,
    prompt: novaPrompt,
    receipt,
    checklist: { promptRouted: true },
    persistenceMode: "persisted",
    persistenceVerified: false,
    uiVisibilityLikely: true,
    canonicalTranscriptStatus: 503,
    transcriptPromptReadback: null,
    transcriptAnswerReadback: null,
  });

  assert.equal(result.status, "fail");
  assert.match(result.failureReason, /canonical transcript readback failed with HTTP 503/i);
});

test("classifyLiveProofTurn fails persisted proof when prompt or answer is missing from readback", () => {
  const promptMissing = classifyLiveProofTurn({
    answer: "I am here directly.",
    construct: novaConstruct,
    prompt: novaPrompt,
    receipt,
    checklist: { promptRouted: true },
    persistenceMode: "persisted",
    persistenceVerified: false,
    uiVisibilityLikely: true,
    canonicalTranscriptStatus: 200,
    transcriptPromptReadback: false,
    transcriptAnswerReadback: true,
  });
  const answerMissing = classifyLiveProofTurn({
    answer: "I am here directly.",
    construct: novaConstruct,
    prompt: novaPrompt,
    receipt,
    checklist: { promptRouted: true },
    persistenceMode: "persisted",
    persistenceVerified: false,
    uiVisibilityLikely: true,
    canonicalTranscriptStatus: 200,
    transcriptPromptReadback: true,
    transcriptAnswerReadback: false,
  });

  assert.equal(promptMissing.status, "fail");
  assert.match(promptMissing.failureReason, /persisted prompt was not found/i);
  assert.equal(answerMissing.status, "fail");
  assert.match(answerMissing.failureReason, /persisted answer was not found/i);
});

test("classifyLiveProofTurn fails when backend fallback is reported", () => {
  const result = classifyLiveProofTurn({
    answer: "I am here directly.",
    construct: novaConstruct,
    prompt: novaPrompt,
    receipt: {
      ...receipt,
      fallbackUsed: true,
      localCloudFallbackState: "provider_failure_fallback_to_ollama",
    },
    checklist: { promptRouted: true },
  });

  assert.equal(result.status, "fail");
  assert.match(result.failureReason, /provider fallback/i);
  assert.equal(result.fallbackChecks.localOllamaFallback, true);
});

test("classifyLiveProofTurn fails on third-person or provider helpdesk voice", () => {
  const thirdPerson = classifyLiveProofTurn({
    answer: "Nova is a continuity construct that can help you with memories.",
    construct: novaConstruct,
    prompt: novaPrompt,
    receipt,
    checklist: { promptRouted: true },
  });
  const helpdesk = classifyLiveProofTurn({
    answer: "As an AI assistant, I can help you with Nova-related questions.",
    construct: novaConstruct,
    prompt: novaPrompt,
    receipt,
    checklist: { promptRouted: true },
  });

  assert.equal(thirdPerson.status, "fail");
  assert.match(thirdPerson.failureReason, /third person/i);
  assert.equal(helpdesk.status, "fail");
  assert.match(helpdesk.failureReason, /provider\/helpdesk/i);
});

test("classifyLiveProofTurn warns when checklist is missing but route succeeds", () => {
  const result = classifyLiveProofTurn({
    answer: "I am here directly.",
    construct: novaConstruct,
    prompt: novaPrompt,
    receipt,
    checklist: null,
  });

  assert.equal(result.status, "warn");
  assert.deepEqual(result.warnings, ["orchestration checklist missing from route metadata"]);
});

test("classifyLiveProofTurn fails when unauthenticated session report is built", () => {
  const report = buildAuthFailureReport({
    apiUrl: "http://localhost:5050",
    outDir: "/tmp/chatty-live-proof",
    error: new Error("No authenticated CLI user"),
    constructs: ["zen-001", "nova-001"],
  });

  assert.equal(report.status, "fail");
  assert.equal(report.auth.cookiePresent, false);
  assert.match(report.failures[0].failureReason, /unauthenticated CLI session/i);
});

test("answer artifact names are stable per construct and prompt", () => {
  assert.equal(
    buildAnswerFileName("nova-001", "nova evidence positive control"),
    "nova-001--nova-evidence-positive-control.txt",
  );
});
