#!/usr/bin/env -S npx tsx

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_ORCHESTRATION_PROOF_CONSTRUCTS,
  DEFAULT_ORCHESTRATION_PROOF_OUTPUT_ROOT,
  DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT,
  DEFAULT_LATEST_CODEX_ORCHESTRATION_PROMPT_ID,
  buildAggregateOrchestrationReport,
  buildLatestCodexContinuePayload,
  buildLiveProofRunsForOrchestration,
  buildOrchestrationAuthFailureReport,
  buildOrchestrationJsonOutput,
  buildOrchestrationMarkdownReport,
  formatOrchestrationContract,
  parseOrchestrationProofArgs,
  validateLatestCodexOrchestrationArgs,
} from "../lib/chattyCliOrchestrationProof.js";
import { buildAnswerFileName, previewText } from "../lib/chattyCliLiveProof.js";
import { relayCodexContinuity } from "../lib/codexContinuityRelay.js";
import {
  DEFAULT_API_URL,
  cliApiClient,
  summarizeCanonicalTurn,
} from "../../src/cli/apiClient.ts";
import type {
  CanonicalMessagePayload,
  CanonicalMessageResult,
} from "../../src/cli/apiClient.ts";
import { CLIAuth } from "../../src/cli/auth.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const tsxBin = path.join(repoRoot, "node_modules", ".bin", "tsx");
const liveProofScript = path.join(repoRoot, "server", "scripts", "runChattyCliConstructRollcall.ts");
const REPO_DOTENV_KEYS = [
  "VVAULT_API_BASE_URL",
  "VVAULT_URL",
  "VVAULT_SERVICE_TOKEN",
  "CHATTY_API_URL",
] as const;

interface OrchestrationArgs {
  json: boolean;
  constructs: string[];
  latestCodex: boolean;
  noBrowser: boolean;
  authTimeoutMs: number | null;
  skipPersistence: boolean;
  outDir: string;
  help: boolean;
}

interface AuthBridgeResult {
  authenticated: boolean;
  cookiePresent: boolean;
  storedSessionReused: boolean;
  autoAuthAttempted: boolean;
  browserOpenAllowed: boolean;
  cookie: string | null;
  error: Error | null;
}

interface CanonicalTranscriptPayload {
  ok?: boolean;
  content?: string;
  turns?: unknown[];
  source?: string | null;
  conversation?: {
    id?: string;
    thread_id?: string;
    title?: string | null;
    messages?: unknown[];
  } | null;
  messages?: unknown[];
}

interface ConversationsHydrationPayload {
  ok?: boolean;
  conversations?: unknown[];
  hydrationSource?: string | null;
  hydrationComplete?: boolean;
}

interface JsonFetchResult<T> {
  status: number | null;
  ok: boolean;
  payload: T | null;
  error: string | null;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run probe:chatty-cli:orchestration -- --json",
    "  chatty-cli orchestration [--json] [--skip-persistence] [--constructs=zen-001,nova-001] [--latest-codex] [--no-browser] [--auth-timeout-ms=<ms>] [--out-dir=<path>]",
    "",
    "Defaults:",
    `  constructs: ${DEFAULT_ORCHESTRATION_PROOF_CONSTRUCTS.join(",")}`,
    "  prompts: zen_direct_orchestration,nova_direct_address",
    "  latest-codex: route-backed Zen-only continuity proof",
    "  persistence: enabled",
    "  auth: reuse CLI session, otherwise run CLIAuth auto-auth",
    `  out-dir: ${DEFAULT_ORCHESTRATION_PROOF_OUTPUT_ROOT}`,
  ].join("\n");
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("orchestration proof produced no JSON report");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("orchestration proof JSON report was not parseable");
    }
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

async function runWithAuthLogsOnStderr<T>(work: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (...values: unknown[]) => console.error(...values);
  console.warn = (...values: unknown[]) => console.error(...values);
  try {
    return await work();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

function parseDotenvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex <= 0) return null;
  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

async function loadRepoContinuityEnv(): Promise<void> {
  const dotenvPath = path.join(repoRoot, ".env");
  let raw = "";
  try {
    raw = await fs.readFile(dotenvPath, "utf8");
  } catch {
    return;
  }
  const allowedKeys = new Set<string>(REPO_DOTENV_KEYS);
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseDotenvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (!allowedKeys.has(key) || process.env[key]) continue;
    process.env[key] = value;
  }
}

async function ensureAuthBridge(apiUrl: string, args: OrchestrationArgs): Promise<AuthBridgeResult> {
  const auth = new CLIAuth(apiUrl);
  const existingUser = await auth.getCurrentUser();
  if (existingUser) {
    const session = await auth.loadSession();
    if (session?.cookie) {
      return {
        authenticated: true,
        cookiePresent: true,
        storedSessionReused: true,
        autoAuthAttempted: false,
        browserOpenAllowed: args.noBrowser !== true,
        cookie: session.cookie,
        error: null,
      };
    }
  }

  if (args.noBrowser) {
    return {
      authenticated: false,
      cookiePresent: false,
      storedSessionReused: false,
      autoAuthAttempted: false,
      browserOpenAllowed: false,
      cookie: null,
      error: new Error("No stored CLI session and --no-browser was provided"),
    };
  }

  try {
    await runWithAuthLogsOnStderr(() =>
      auth.autoAuthenticate({
        openBrowser: true,
        timeoutMs: args.authTimeoutMs || undefined,
      }),
    );
    const session = await auth.loadSession();
    const user = await auth.getCurrentUser();
    if (!user || !session?.cookie) {
      throw new Error("CLIAuth auto-auth completed without a reusable session cookie");
    }
    return {
      authenticated: true,
      cookiePresent: true,
      storedSessionReused: false,
      autoAuthAttempted: true,
      browserOpenAllowed: true,
      cookie: session.cookie,
      error: null,
    };
  } catch (error) {
    return {
      authenticated: false,
      cookiePresent: false,
      storedSessionReused: false,
      autoAuthAttempted: true,
      browserOpenAllowed: true,
      cookie: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

async function runLiveProof(args: string[], env: NodeJS.ProcessEnv): Promise<{ report: any; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(tsxBin, [liveProofScript, ...args], {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        resolve({
          report: extractJsonObject(stdout),
          stderr,
          code,
        });
      } catch (error) {
        reject(
          new Error(
            `${error instanceof Error ? error.message : String(error)}${
              stderr.trim() ? `: ${stderr.trim()}` : ""
            }`,
          ),
        );
      }
    });
  });
}

async function writeArtifacts(report: any, outDir: string): Promise<void> {
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(outDir, "report.md"), buildOrchestrationMarkdownReport(report), "utf8");
}

function answersDir(outDir: string): string {
  return path.join(outDir, "answers");
}

async function writeAnswerArtifact(outDir: string, answer: string): Promise<string | null> {
  if (!answer.trim()) {
    return null;
  }
  const fileName = buildAnswerFileName(
    DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT,
    DEFAULT_LATEST_CODEX_ORCHESTRATION_PROMPT_ID,
  );
  const answerPath = path.join(answersDir(outDir), fileName);
  await fs.mkdir(path.dirname(answerPath), { recursive: true });
  await fs.writeFile(answerPath, `${answer}\n`, "utf8");
  return answerPath;
}

function canonicalThreadId(constructId: string): string {
  return `${constructId}_chat_with_${constructId}`;
}

function toJsonObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function messageText(message: unknown): string {
  const objectMessage = toJsonObject(message);
  if (!objectMessage) {
    return "";
  }
  const content = objectMessage.content ?? objectMessage.text ?? objectMessage.message ?? "";
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        const objectPart = toJsonObject(part);
        return typeof objectPart?.text === "string" ? objectPart.text : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function messageRole(message: unknown): string {
  const objectMessage = toJsonObject(message);
  return String(objectMessage?.role || objectMessage?.sender || objectMessage?.type || "").toLowerCase();
}

function messageMetadata(message: unknown): Record<string, unknown> | null {
  const objectMessage = toJsonObject(message);
  const metadata = objectMessage?.metadata;
  return toJsonObject(metadata);
}

function transcriptTurns(payload: CanonicalTranscriptPayload | null): unknown[] {
  if (!payload) return [];
  if (Array.isArray(payload.messages)) return payload.messages;
  if (Array.isArray(payload.turns)) return payload.turns;
  if (Array.isArray(payload.conversation?.messages)) return payload.conversation.messages;
  return [];
}

function conversationIdentity(conversation: unknown): string {
  const objectConversation = toJsonObject(conversation);
  return String(
    objectConversation?.sessionId ||
      objectConversation?.session_id ||
      objectConversation?.threadId ||
      objectConversation?.thread_id ||
      objectConversation?.id ||
      "",
  ).trim();
}

function conversationIndexThreadCount(
  payload: ConversationsHydrationPayload | null,
  threadId: string,
): number {
  const conversations = Array.isArray(payload?.conversations) ? payload.conversations : [];
  return conversations.filter((conversation) => conversationIdentity(conversation) === threadId).length;
}

function normalizeComparableText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function transcriptContainsText(
  payload: CanonicalTranscriptPayload | null,
  needle: string | null,
): boolean {
  if (!needle) return false;
  const normalizedNeedle = normalizeComparableText(needle);
  if (!normalizedNeedle) return false;
  return transcriptTurns(payload).some(
    (turn) => normalizeComparableText(messageText(turn)).includes(normalizedNeedle),
  );
}

function runtimeReceiptFromMetadata(metadata: Record<string, unknown> | null): Record<string, unknown> | null {
  return toJsonObject(metadata?.runtime_receipt || metadata?.runtimeReceipt || null);
}

function orchestrationChecklistFromMetadata(metadata: Record<string, unknown> | null): Record<string, unknown> | null {
  return toJsonObject(
    metadata?.orchestration_checklist || metadata?.orchestrationChecklist || null,
  );
}

function containsRequiredChecklistStages(checklist: Record<string, unknown> | null) {
  const requiredStageIds = [
    "auth",
    "construct_identity",
    "orchestration_mode",
    "transcript_memory",
    "continuity_restored",
    "transcript_law_evidence",
    "capsule_runtime_evidence",
    "provider",
    "persistence",
  ];
  const stages = Array.isArray(checklist?.stages) ? checklist.stages : [];
  const presentIds = new Set(
    stages
      .map((stage) => toJsonObject(stage)?.id)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
  );
  const missing = requiredStageIds.filter((id) => !presentIds.has(id));
  return {
    ok: missing.length === 0,
    missing,
  };
}

function checklistStageById(
  checklist: Record<string, unknown> | null,
  stageId: string,
): Record<string, unknown> | null {
  const stages = Array.isArray(checklist?.stages) ? checklist.stages : [];
  for (const stage of stages) {
    const objectStage = toJsonObject(stage);
    if (String(objectStage?.id || "").trim() === stageId) {
      return objectStage;
    }
  }
  return null;
}

async function fetchJsonWithStatus<T>(
  url: string,
  cookie: string,
  timeoutMs = 20_000,
): Promise<JsonFetchResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Cookie: cookie,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        status: response.status,
        ok: false,
        payload: null,
        error: `HTTP ${response.status}`,
      };
    }
    return {
      status: response.status,
      ok: true,
      payload: (await response.json()) as T,
      error: null,
    };
  } catch (error) {
    return {
      status: null,
      ok: false,
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCanonicalTranscript(
  apiUrl: string,
  cookie: string,
  threadId: string,
): Promise<JsonFetchResult<CanonicalTranscriptPayload>> {
  return fetchJsonWithStatus<CanonicalTranscriptPayload>(
    `${apiUrl}/api/vvault/conversations/${encodeURIComponent(threadId)}/canonical-transcript`,
    cookie,
  );
}

async function fetchConversationsHydration(
  apiUrl: string,
  cookie: string,
): Promise<JsonFetchResult<ConversationsHydrationPayload>> {
  return fetchJsonWithStatus<ConversationsHydrationPayload>(
    `${apiUrl}/api/vvault/conversations`,
    cookie,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCanonicalTranscriptUntil(
  apiUrl: string,
  cookie: string,
  threadId: string,
  predicate: (payload: CanonicalTranscriptPayload | null) => boolean,
  initial: JsonFetchResult<CanonicalTranscriptPayload>,
): Promise<JsonFetchResult<CanonicalTranscriptPayload>> {
  let latest = initial;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (latest.ok && predicate(latest.payload)) {
      return latest;
    }
    await sleep(750);
    latest = await fetchCanonicalTranscript(apiUrl, cookie, threadId);
  }
  return latest;
}

function findResumedAssistantTurn(
  payload: CanonicalTranscriptPayload | null,
  continuedFromTurnId: string | null,
  answerText: string,
): unknown | null {
  const normalizedAnswer = normalizeComparableText(answerText);
  const turns = transcriptTurns(payload);
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (messageRole(turn) !== "assistant") continue;
    const metadata = messageMetadata(turn);
    const runtimeReceipt = runtimeReceiptFromMetadata(metadata);
    const text = normalizeComparableText(messageText(turn));
    const continuedFrom = String(
      runtimeReceipt?.continuedFromTurnId || runtimeReceipt?.continued_from_turn_id || "",
    ).trim();
    if (continuedFromTurnId && continuedFrom === continuedFromTurnId) {
      return turn;
    }
    if (
      normalizedAnswer &&
      text === normalizedAnswer &&
      runtimeReceipt &&
      runtimeReceipt.continuityRestored === true
    ) {
      return turn;
    }
  }
  return null;
}

function routeAnswerText(payload: CanonicalMessagePayload): string {
  const candidates = [
    payload?.response,
    payload?.content,
    payload?.answer,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

function buildSingleResultReport({
  apiUrl,
  outDir,
  args,
  auth,
  result,
}: {
  apiUrl: string;
  outDir: string;
  args: OrchestrationArgs;
  auth: AuthBridgeResult;
  result: Record<string, unknown>;
}) {
  const status = String(result.status || "fail") as "pass" | "warn" | "fail";
  return {
    generatedAt: new Date().toISOString(),
    apiUrl,
    outputRoot: outDir,
    persistenceMode: args.skipPersistence ? "skipped" : "persisted",
    status,
    summary: {
      total: 1,
      pass: status === "pass" ? 1 : 0,
      warn: status === "warn" ? 1 : 0,
      fail: status === "fail" ? 1 : 0,
    },
    auth: {
      source: "cli-auth-bridge",
      cookiePresent: Boolean(auth.cookiePresent),
      storedSessionReused: Boolean(auth.storedSessionReused),
      autoAuthAttempted: Boolean(auth.autoAuthAttempted),
      browserOpenAllowed: auth.browserOpenAllowed !== false,
      authenticated: Boolean(auth.authenticated),
    },
    constructs: [DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT],
    results: [result],
    failures:
      typeof result.failureReason === "string" && result.failureReason
        ? [
            {
              constructId: result.constructId || DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT,
              threadId: result.threadId || canonicalThreadId(DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT),
              promptId: result.promptId || DEFAULT_LATEST_CODEX_ORCHESTRATION_PROMPT_ID,
              failureReason: result.failureReason,
            },
          ]
        : [],
    liveReports: [
      {
        outputRoot: outDir,
        status,
        summary: {
          total: 1,
          pass: status === "pass" ? 1 : 0,
          warn: status === "warn" ? 1 : 0,
          fail: status === "fail" ? 1 : 0,
        },
      },
    ],
  };
}

async function runLatestCodexOrchestrationProof({
  apiUrl,
  args,
  auth,
}: {
  apiUrl: string;
  args: OrchestrationArgs;
  auth: AuthBridgeResult;
}) {
  const result: Record<string, unknown> = {
    constructId: DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT,
    displayName: "Zen",
    threadId: canonicalThreadId(DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT),
    promptId: DEFAULT_LATEST_CODEX_ORCHESTRATION_PROMPT_ID,
    promptLabel: "Latest Codex route-backed continuation proof",
    prompt: "continue",
    answerPreview: "",
    answerPath: null,
    httpStatus: null,
    route: null,
    auth: {
      source: "cli-session",
      cookiePresent: Boolean(auth.cookiePresent),
    },
    persistenceMode: "persisted",
    canonicalPersistenceVerified: null,
    uiVisibilityLikely: null,
    canonicalTranscriptStatus: null,
    beforeTranscriptMessageCount: null,
    afterTranscriptMessageCount: null,
    promptReadbackFound: null,
    answerReadbackFound: null,
    conversationsIndexVisible: null,
    persistenceVerdict: "failed",
    receiptSummary: null,
    checklistSummary: null,
    contextSource: "latest-codex",
    relaySourcePath: null,
    relayImportedTurns: 0,
    relayDedupedTurns: 0,
    relayLatestAssistantTurnId: null,
    relayCanonicalReadbackVerified: null,
    continuityRestored: null,
    continuedFromTurnId: null,
    continuityRestoredStageStatus: null,
    transcriptMemoryStageStatus: null,
    transcriptMemoryVerifiedStatus: null,
    transcriptMemoryCapsuleLoaded: null,
    transcriptMemoryCapsuleSource: null,
    transcriptLawEvidenceStageStatus: null,
    capsuleRuntimeEvidenceStageStatus: null,
    transcriptLawGovernanceStageStatus: null,
    transcriptLawGovernanceCapsuleLoaded: null,
    transcriptLawGovernanceCapsuleSource: null,
    readbackImportedUserFound: null,
    readbackImportedAssistantFound: null,
    readbackResumedTurnPersisted: null,
    staleAnchorRejected: null,
    staleAnchorStatus: null,
    staleAnchorError: null,
    secondSurfaceSingletonThreadRestored: null,
    secondSurfaceThreadCount: null,
    secondSurfaceHydrationSource: null,
    secondSurfaceHydrationComplete: null,
    status: "fail",
    failureReason: null,
    warnings: [],
  };

  try {
    const relayResult = await relayCodexContinuity({ latestCodex: true });
    result.threadId = relayResult.threadId || result.threadId;
    result.contextSource = relayResult.source?.type || "latest-codex";
    result.relaySourcePath = relayResult.source?.path || null;
    result.relayImportedTurns = relayResult.importedTurns ?? 0;
    result.relayDedupedTurns = relayResult.dedupedTurns ?? 0;
    result.relayLatestAssistantTurnId = relayResult.latestAssistantTurnId || null;
    if (relayResult.source?.type !== "latest-codex") {
      result.failureReason = "relay source was not latest-codex";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (!relayResult.latestAssistantTurnId) {
      result.failureReason = "relay did not expose a latest Codex assistant turn id";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if ((relayResult.importedTurns ?? 0) <= 0 && (relayResult.dedupedTurns ?? 0) <= 0) {
      result.failureReason = "relay neither imported nor deduped any latest Codex turns";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }

    const beforeTranscript = await fetchCanonicalTranscript(
      apiUrl,
      auth.cookie as string,
      String(result.threadId),
    );
    result.beforeTranscriptMessageCount = beforeTranscript.ok
      ? transcriptTurns(beforeTranscript.payload).length
      : null;
    const relayUserReadbackFound = transcriptContainsText(
      beforeTranscript.payload,
      relayResult.latestUserContent || null,
    );
    const relayAssistantReadbackFound = transcriptContainsText(
      beforeTranscript.payload,
      relayResult.latestAssistantContent || null,
    );
    result.relayCanonicalReadbackVerified = Boolean(
      beforeTranscript.ok &&
        relayUserReadbackFound &&
        relayAssistantReadbackFound,
    );
    if (result.relayCanonicalReadbackVerified !== true) {
      result.failureReason =
        "canonical readback did not expose the relayed latest Codex tail before continuation";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }

    const continuePayload = buildLatestCodexContinuePayload({
      resumeToken: relayResult.resumeTokenJson,
    });
    const routeResult: CanonicalMessageResult = await cliApiClient.sendCanonicalMessage(
      continuePayload,
      {
        apiUrl,
        allowInteractiveAuth: false,
        openBrowser: false,
        timeoutMs: 120_000,
      },
    );
    const payload = routeResult.payload;
    const answerText = routeAnswerText(payload);
    result.httpStatus = routeResult.status;
    result.answerPreview = previewText(answerText);
    result.answerPath = await writeAnswerArtifact(args.outDir, answerText);

    const turnSummary = summarizeCanonicalTurn(payload, routeResult.status);
    result.route = turnSummary.receipt?.routeMode || payload.runtime_receipt?.route_mode || null;
    result.receiptSummary = turnSummary.receipt;
    result.checklistSummary = turnSummary.checklist;
    result.uiVisibilityLikely = Boolean(payload.runtime_receipt && payload.orchestration_checklist);
    result.continuityRestored = payload.runtime_receipt?.continuityRestored === true;
    result.continuedFromTurnId = payload.runtime_receipt?.continuedFromTurnId || null;

    if (!payload.runtime_receipt) {
      result.failureReason = "route response missing runtime_receipt";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (!payload.orchestration_checklist) {
      result.failureReason = "route response missing orchestration_checklist";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (payload.runtime_receipt.continuityRestored !== true) {
      result.failureReason = "continuity was not restored from the imported latest Codex tail";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (payload.runtime_receipt.continuedFromTurnId !== relayResult.latestAssistantTurnId) {
      result.failureReason = "continuedFromTurnId did not match the imported latest Codex assistant tail";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (!toJsonObject(payload.runtime_receipt.transcript_truth)) {
      result.failureReason = "runtime_receipt missing transcript_truth evidence";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (!toJsonObject(payload.runtime_receipt.capsule_runtime)) {
      result.failureReason = "runtime_receipt missing capsule_runtime evidence";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }

    const checklistStages = containsRequiredChecklistStages(
      toJsonObject(payload.orchestration_checklist),
    );
    if (!checklistStages.ok) {
      result.failureReason = `orchestration_checklist missing required stages: ${checklistStages.missing.join(",")}`;
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }

    const checklist = toJsonObject(payload.orchestration_checklist);
    const continuityRestoredStage = checklistStageById(checklist, "continuity_restored");
    const transcriptMemoryStage = checklistStageById(checklist, "transcript_memory");
    const transcriptLawEvidenceStage = checklistStageById(checklist, "transcript_law_evidence");
    const capsuleRuntimeEvidenceStage = checklistStageById(checklist, "capsule_runtime_evidence");
    const transcriptMemoryDetails = toJsonObject(transcriptMemoryStage?.details);
    const verifiedMemoryRetrieval = toJsonObject(
      transcriptMemoryDetails?.verifiedMemoryRetrieval,
    );
    result.continuityRestoredStageStatus =
      String(continuityRestoredStage?.status || "").trim() || null;
    result.transcriptMemoryStageStatus = String(transcriptMemoryStage?.status || "").trim() || null;
    result.transcriptMemoryVerifiedStatus =
      String(verifiedMemoryRetrieval?.status || "").trim() || null;
    result.transcriptMemoryCapsuleLoaded =
      typeof transcriptMemoryDetails?.capsuleLoaded === "boolean"
        ? transcriptMemoryDetails.capsuleLoaded
        : null;
    result.transcriptMemoryCapsuleSource =
      String(transcriptMemoryDetails?.capsuleSource || "").trim() || null;
    result.transcriptLawEvidenceStageStatus =
      String(transcriptLawEvidenceStage?.status || "").trim() || null;
    result.capsuleRuntimeEvidenceStageStatus =
      String(capsuleRuntimeEvidenceStage?.status || "").trim() || null;

    if (!transcriptMemoryStage) {
      result.failureReason = "orchestration_checklist missing transcript_memory stage evidence";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (!continuityRestoredStage) {
      result.failureReason = "orchestration_checklist missing continuity_restored stage evidence";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (!transcriptLawEvidenceStage) {
      result.failureReason = "orchestration_checklist missing transcript_law_evidence stage";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (!capsuleRuntimeEvidenceStage) {
      result.failureReason = "orchestration_checklist missing capsule_runtime_evidence stage";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (!Object.hasOwn(transcriptMemoryDetails || {}, "verifiedMemoryRetrieval")) {
      result.failureReason =
        "orchestration_checklist transcript_memory stage did not expose whether verified retrieval ran";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (!Object.hasOwn(transcriptMemoryDetails || {}, "capsuleLoaded")) {
      result.failureReason =
        "orchestration_checklist transcript_memory stage did not expose capsuleLoaded in the live receipt";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (!Object.hasOwn(transcriptMemoryDetails || {}, "capsuleSource")) {
      result.failureReason =
        "orchestration_checklist transcript_memory stage did not expose capsuleSource in the live receipt";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (String(continuityRestoredStage?.status || "").trim().toLowerCase() !== "pass") {
      result.failureReason = "orchestration_checklist continuity_restored stage did not pass";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (String(transcriptLawEvidenceStage?.status || "").trim().toLowerCase() !== "pass") {
      result.failureReason = "orchestration_checklist transcript_law_evidence stage did not pass";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }

    const transcriptLawStage = checklistStageById(checklist, "transcript_law_governance");
    const transcriptLawDetails = toJsonObject(transcriptLawStage?.details);
    result.transcriptLawGovernanceStageStatus =
      String(transcriptLawStage?.status || "").trim() || null;
    result.transcriptLawGovernanceCapsuleLoaded =
      typeof transcriptLawDetails?.capsuleLoaded === "boolean"
        ? transcriptLawDetails.capsuleLoaded
        : null;
    result.transcriptLawGovernanceCapsuleSource =
      String(transcriptLawDetails?.capsuleSource || "").trim() || null;

    const initialAfterTranscript = await fetchCanonicalTranscript(
      apiUrl,
      auth.cookie as string,
      String(result.threadId),
    );
    const afterTranscript = await fetchCanonicalTranscriptUntil(
      apiUrl,
      auth.cookie as string,
      String(result.threadId),
      (canonicalPayload) => {
        const importedUserFound = transcriptContainsText(
          canonicalPayload,
          relayResult.latestUserContent || null,
        );
        const importedAssistantFound = transcriptContainsText(
          canonicalPayload,
          relayResult.latestAssistantContent || null,
        );
        const resumedTurn = findResumedAssistantTurn(
          canonicalPayload,
          relayResult.latestAssistantTurnId || null,
          answerText,
        );
        const metadata = messageMetadata(resumedTurn);
        return (
          importedUserFound &&
          importedAssistantFound &&
          Boolean(resumedTurn) &&
          Boolean(runtimeReceiptFromMetadata(metadata)) &&
          Boolean(orchestrationChecklistFromMetadata(metadata))
        );
      },
      initialAfterTranscript,
    );

    result.canonicalTranscriptStatus = afterTranscript.status;
    result.afterTranscriptMessageCount = afterTranscript.ok
      ? transcriptTurns(afterTranscript.payload).length
      : null;
    result.promptReadbackFound = transcriptContainsText(afterTranscript.payload, "continue");
    result.answerReadbackFound = transcriptContainsText(afterTranscript.payload, answerText);
    result.readbackImportedUserFound = transcriptContainsText(
      afterTranscript.payload,
      relayResult.latestUserContent || null,
    );
    result.readbackImportedAssistantFound = transcriptContainsText(
      afterTranscript.payload,
      relayResult.latestAssistantContent || null,
    );
    const resumedTurn = findResumedAssistantTurn(
      afterTranscript.payload,
      relayResult.latestAssistantTurnId || null,
      answerText,
    );
    const resumedMetadata = messageMetadata(resumedTurn);
    result.readbackResumedTurnPersisted = Boolean(
      resumedTurn &&
        runtimeReceiptFromMetadata(resumedMetadata) &&
        orchestrationChecklistFromMetadata(resumedMetadata),
    );
    result.canonicalPersistenceVerified = Boolean(
      result.readbackImportedUserFound &&
        result.readbackImportedAssistantFound &&
        result.readbackResumedTurnPersisted,
    );
    result.persistenceVerdict = result.canonicalPersistenceVerified ? "verified" : "failed";

    if (afterTranscript.ok !== true) {
      result.failureReason = `canonical transcript readback failed: ${afterTranscript.error || "unknown error"}`;
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (result.readbackImportedUserFound !== true) {
      result.failureReason = "canonical readback did not contain the relayed latest Codex user turn";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (result.readbackImportedAssistantFound !== true) {
      result.failureReason = "canonical readback did not contain the relayed latest Codex assistant turn";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }
    if (result.readbackResumedTurnPersisted !== true) {
      result.failureReason = "canonical readback did not persist the resumed assistant turn with runtime_receipt and orchestration_checklist";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }

    const staleRouteResult: CanonicalMessageResult = await cliApiClient.sendCanonicalMessage(
      continuePayload,
      {
        apiUrl,
        allowInteractiveAuth: false,
        openBrowser: false,
        timeoutMs: 60_000,
      },
    );
    result.staleAnchorStatus = staleRouteResult.status;
    result.staleAnchorError =
      typeof staleRouteResult.payload?.error === "string"
        ? staleRouteResult.payload.error
        : null;
    const staleRuntimeReceipt = toJsonObject(staleRouteResult.payload?.runtime_receipt || null);
    const staleContinuityReceipt = toJsonObject(staleRuntimeReceipt?.continuity || null);
    result.staleAnchorRejected = Boolean(
      staleRouteResult.status === 409 &&
        staleRouteResult.payload?.error === "CONTINUITY_RESUME_STALE" &&
        staleContinuityReceipt?.staleSeatRejected === true &&
        staleRuntimeReceipt?.persistence_owner === "blocked_continuity_resume",
    );
    if (result.staleAnchorRejected !== true) {
      result.failureReason = "stale Codex resume anchor was not rejected after the canonical tail advanced";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }

    const indexResult = await fetchConversationsHydration(apiUrl, auth.cookie as string);
    const singletonThreadCount = conversationIndexThreadCount(
      indexResult.payload,
      String(result.threadId),
    );
    result.conversationsIndexVisible = Boolean(indexResult.ok && singletonThreadCount > 0);
    result.secondSurfaceThreadCount = singletonThreadCount;
    result.secondSurfaceHydrationSource = indexResult.payload?.hydrationSource || null;
    result.secondSurfaceHydrationComplete = indexResult.payload?.hydrationComplete === true;
    result.secondSurfaceSingletonThreadRestored = Boolean(
      indexResult.ok &&
        indexResult.payload?.hydrationSource === "full" &&
        indexResult.payload?.hydrationComplete === true &&
        singletonThreadCount === 1 &&
        String(result.threadId) === canonicalThreadId(DEFAULT_LATEST_CODEX_ORCHESTRATION_CONSTRUCT),
    );
    if (result.secondSurfaceSingletonThreadRestored !== true) {
      result.failureReason =
        "second-surface conversations hydration did not restore exactly one full singleton Zen thread";
      return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
    }

    result.status = turnSummary.receipt?.fallbackUsed ? "warn" : "pass";
    result.failureReason = null;
    return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
  } catch (error) {
    result.failureReason =
      error instanceof Error
        ? `latest Codex orchestration proof failed: ${error.message}`
        : `latest Codex orchestration proof failed: ${String(error)}`;
    return buildSingleResultReport({ apiUrl, outDir: args.outDir, args, auth, result });
  }
}

async function main(): Promise<void> {
  await loadRepoContinuityEnv();
  const args = parseOrchestrationProofArgs(process.argv.slice(2)) as OrchestrationArgs;
  if (args.help) {
    console.log(usage());
    return;
  }
  validateLatestCodexOrchestrationArgs(args);

  const apiUrl = (process.env.CHATTY_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
  const auth = await ensureAuthBridge(apiUrl, args);
  if (!auth.authenticated) {
    const report = buildOrchestrationAuthFailureReport({
      apiUrl,
      outDir: args.outDir,
      args,
      error: auth.error,
      autoAuthAttempted: auth.autoAuthAttempted,
    });
    const jsonOutput = buildOrchestrationJsonOutput(report);
    await writeArtifacts(report, args.outDir);
    if (args.json) {
      console.log(JSON.stringify(jsonOutput, null, 2));
    } else {
      process.stdout.write(formatOrchestrationContract(jsonOutput.contract));
    }
    process.exitCode = 1;
    return;
  }

  if (args.latestCodex) {
    const report = await runLatestCodexOrchestrationProof({ apiUrl, args, auth });
    const jsonOutput = buildOrchestrationJsonOutput(report);
    await writeArtifacts(report, args.outDir);

    if (args.json) {
      console.log(JSON.stringify(jsonOutput, null, 2));
    } else {
      process.stdout.write(formatOrchestrationContract(jsonOutput.contract));
    }

    if (jsonOutput.status === "fail") {
      process.exitCode = 1;
    }
    return;
  }

  const runs = buildLiveProofRunsForOrchestration(args);
  const reports = [];
  for (const run of runs) {
    const { report } = await runLiveProof(run.args, process.env);
    reports.push(report);
  }

  const aggregateReport = buildAggregateOrchestrationReport({
    apiUrl,
    outDir: args.outDir,
    args,
    auth,
    reports,
  });
  const jsonOutput = buildOrchestrationJsonOutput(aggregateReport);
  await writeArtifacts(aggregateReport, args.outDir);

  if (args.json) {
    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    process.stdout.write(formatOrchestrationContract(jsonOutput.contract));
  }

  if (jsonOutput.status === "fail") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
