#!/usr/bin/env -S npx tsx

import "../loadEnv.js";

import fs from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_LIVE_PROOF_CONSTRUCTS,
  DEFAULT_LIVE_PROOF_OUTPUT_ROOT,
  buildAnswerFileName,
  buildAuthFailureReport,
  buildMarkdownReport,
  classifyLiveProofTurn,
  parseLiveProofArgs,
  previewText,
  selectConstructsForLiveProof,
  selectLiveProofPrompts,
} from "../lib/chattyCliLiveProof.js";
import { DEFAULT_API_URL, cliApiClient, summarizeCanonicalTurn } from "../../src/cli/apiClient.ts";
import type {
  CanonicalMessageResult,
  CliConstructCard,
  CliConstructCatalogResult,
} from "../../src/cli/apiClient.ts";
import { CLIAuth } from "../../src/cli/auth.ts";

const REQUEST_TIMEOUT_MS = Number(process.env.CHATTY_ROLLCALL_TIMEOUT_MS || 120_000);
const INDEX_TIMEOUT_MS = Number(process.env.CHATTY_ROLLCALL_INDEX_TIMEOUT_MS || 20_000);
const READBACK_RETRY_COUNT = Number(process.env.CHATTY_ROLLCALL_READBACK_RETRIES || 6);
const READBACK_RETRY_DELAY_MS = Number(process.env.CHATTY_ROLLCALL_READBACK_RETRY_DELAY_MS || 750);

interface LiveProofArgs {
  json: boolean;
  constructs: string[];
  promptId: string | null;
  skipPersistence: boolean;
  outDir: string;
  help: boolean;
}

interface CanonicalTranscriptPayload {
  ok?: boolean;
  content?: string;
  turns?: unknown[];
  conversation?: {
    id?: string;
    thread_id?: string;
    title?: string | null;
    messages?: unknown[];
  } | null;
  messages?: unknown[];
}

interface ConversationIndexPayload {
  ok?: boolean;
  conversations?: Array<{
    id?: string;
    thread_id?: string;
    title?: string | null;
    constructId?: string | null;
    construct_id?: string | null;
    preview?: string | null;
    lastMessageAt?: string | null;
    updated_at?: string | null;
  }>;
}

interface JsonFetchResult<T> {
  status: number | null;
  ok: boolean;
  payload: T | null;
  error: string | null;
}

interface StudySnapshot {
  constructId: string;
  threadId: string;
  canonicalPath: string;
  identityCompact: unknown;
  ledger: unknown;
  transcriptSummary: {
    messageCount: number;
    lastUserPreview: string | null;
    lastAssistantPreview: string | null;
  };
}

interface LiveProofResult {
  constructId: string;
  displayName: string;
  threadId: string;
  canonicalPath: string;
  promptId: string;
  promptLabel: string;
  prompt: string;
  answerPreview: string;
  answerPath: string | null;
  httpStatus: number | null;
  route: string | null;
  auth: {
    source: "cli-session";
    cookiePresent: boolean;
  };
  persistenceMode: "skipped" | "persisted";
  canonicalPersistenceVerified: boolean | null;
  uiVisibilityLikely: boolean | null;
  canonicalTranscriptStatus: number | null;
  beforeTranscriptMessageCount: number | null;
  afterTranscriptMessageCount: number | null;
  promptReadbackFound: boolean | null;
  answerReadbackFound: boolean | null;
  conversationsIndexVisible: boolean | null;
  persistenceVerdict: "skipped" | "verified" | "failed";
  receiptSummary: unknown;
  checklistSummary: unknown;
  voiceChecks: Record<string, boolean>;
  fallbackChecks: Record<string, boolean>;
  status: "pass" | "warn" | "fail";
  failureReason: string | null;
  warnings: string[];
  studyPath: string | null;
}

interface LiveProofReport {
  generatedAt: string;
  apiUrl: string;
  outputRoot: string;
  persistenceMode: "skipped" | "persisted";
  status: "pass" | "warn" | "fail";
  summary: {
    total: number;
    pass: number;
    warn: number;
    fail: number;
  };
  auth: {
    source: "cli-session";
    cookiePresent: boolean;
  };
  constructs: string[];
  results: LiveProofResult[];
  failures: Array<{
    constructId: string | null;
    threadId: string | null;
    promptId: string;
    failureReason: string;
  }>;
}

function canonicalThreadId(constructId: string): string {
  return `${constructId}_chat_with_${constructId}`;
}

function canonicalPath(constructId: string): string {
  return `/canonical-threads/${canonicalThreadId(constructId)}`;
}

function studyDir(outDir: string): string {
  return path.join(outDir, "study");
}

function answersDir(outDir: string): string {
  return path.join(outDir, "answers");
}

function logProgress(args: LiveProofArgs, message: string): void {
  if (args.json) {
    console.error(message);
    return;
  }
  console.log(message);
}

function toJsonObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

async function ensureOutputDirs(outDir: string): Promise<void> {
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(studyDir(outDir), { recursive: true });
  await fs.mkdir(answersDir(outDir), { recursive: true });
}

async function fetchJson<T>(url: string, cookie: string, timeoutMs = INDEX_TIMEOUT_MS): Promise<T | null> {
  const result = await fetchJsonWithStatus<T>(url, cookie, timeoutMs);
  return result.ok ? result.payload : null;
}

async function fetchJsonWithStatus<T>(
  url: string,
  cookie: string,
  timeoutMs = INDEX_TIMEOUT_MS,
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

async function fetchConversationIndex(apiUrl: string, cookie: string): Promise<ConversationIndexPayload | null> {
  return fetchJson<ConversationIndexPayload>(`${apiUrl}/api/vvault/conversations/index`, cookie);
}

function normalizeFallbackConstructCard(raw: Record<string, unknown>): CliConstructCard | null {
  const constructId = String(raw.constructId || raw.id || "").trim();
  if (!constructId) {
    return null;
  }
  const displayName = String(raw.displayName || raw.name || constructId).trim();
  return {
    constructId,
    callsign: constructId,
    displayName,
    description: typeof raw.description === "string" ? raw.description : "",
    avatarUrl: typeof raw.avatarUrl === "string" ? raw.avatarUrl : null,
    avatarSha256: typeof raw.avatarSha256 === "string" ? raw.avatarSha256 : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

async function loadFallbackConstructCatalog(apiUrl: string, cookie: string): Promise<CliConstructCard[]> {
  const payload = await fetchJson<unknown>(`${apiUrl}/api/vvault/constructs`, cookie);
  const objectPayload = toJsonObject(payload);
  const rawConstructs = Array.isArray(objectPayload?.constructs)
    ? objectPayload?.constructs
    : Array.isArray(objectPayload?.items)
      ? objectPayload?.items
      : Array.isArray(payload)
        ? payload
        : [];
  return rawConstructs
    .map((entry) => normalizeFallbackConstructCard(toJsonObject(entry) || {}))
    .filter((entry): entry is CliConstructCard => Boolean(entry));
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCanonicalTranscriptUntilReadback(
  apiUrl: string,
  cookie: string,
  threadId: string,
  prompt: string,
  answer: string,
  initial: JsonFetchResult<CanonicalTranscriptPayload>,
): Promise<JsonFetchResult<CanonicalTranscriptPayload>> {
  let latest = initial;
  for (let attempt = 0; attempt < READBACK_RETRY_COUNT; attempt += 1) {
    if (latest.ok && transcriptContainsPromptAndReply(latest.payload, prompt, answer)) {
      return latest;
    }
    await sleep(READBACK_RETRY_DELAY_MS);
    latest = await fetchCanonicalTranscript(apiUrl, cookie, threadId);
  }
  return latest;
}

async function fetchIdentityCompact(apiUrl: string, cookie: string, constructId: string): Promise<unknown> {
  return fetchJson<unknown>(
    `${apiUrl}/api/constructs/${encodeURIComponent(constructId)}/identity-compact`,
    cookie,
  );
}

async function fetchLedger(apiUrl: string, cookie: string, constructId: string): Promise<unknown> {
  return fetchJson<unknown>(`${apiUrl}/api/constructs/${encodeURIComponent(constructId)}/ledger`, cookie);
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
        if (typeof part === "string") {
          return part;
        }
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

function transcriptTurns(payload: CanonicalTranscriptPayload | null): unknown[] {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload.messages)) {
    return payload.messages;
  }
  if (Array.isArray(payload.turns)) {
    return payload.turns;
  }
  if (Array.isArray(payload.conversation?.messages)) {
    return payload.conversation.messages;
  }
  return [];
}

function transcriptRawText(payload: CanonicalTranscriptPayload | null): string {
  if (!payload) {
    return "";
  }
  const parts = [];
  if (typeof payload.content === "string") {
    parts.push(payload.content);
  }
  for (const turn of transcriptTurns(payload)) {
    parts.push(messageText(turn));
  }
  return parts.join("\n");
}

function normalizeComparableText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function transcriptContainsText(payload: CanonicalTranscriptPayload | null, needle: string): boolean {
  const rawText = transcriptRawText(payload);
  const normalizedRawText = normalizeComparableText(rawText);
  const normalizedNeedle = normalizeComparableText(needle);
  return Boolean(
    needle &&
      (rawText.includes(needle) ||
        (normalizedNeedle && normalizedRawText.includes(normalizedNeedle))),
  );
}

function transcriptMessageCount(payload: CanonicalTranscriptPayload | null): number | null {
  return payload ? transcriptTurns(payload).length : null;
}

function findReplyAfterPrompt(payload: CanonicalTranscriptPayload | null, prompt: string): string | null {
  const turns = transcriptTurns(payload);
  const promptPreview = previewText(prompt, 160);
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const text = messageText(turns[index]);
    if (!text.includes(promptPreview) && !text.includes(prompt)) {
      continue;
    }
    for (let replyIndex = index + 1; replyIndex < turns.length; replyIndex += 1) {
      const role = messageRole(turns[replyIndex]);
      if (role.includes("assistant") || role.includes("construct") || role.includes("model")) {
        const reply = messageText(turns[replyIndex]).trim();
        if (reply) {
          return reply;
        }
      }
    }
  }
  return null;
}

function transcriptContainsPromptAndReply(
  payload: CanonicalTranscriptPayload | null,
  prompt: string,
  answer: string,
): boolean {
  const turns = transcriptTurns(payload);
  const promptPreview = previewText(prompt, 160);
  const answerPreview = previewText(answer, 160);
  const containsPrompt = turns.some((turn) => {
    return transcriptContainsText({ turns: [turn] }, promptPreview) || transcriptContainsText({ turns: [turn] }, prompt);
  }) || transcriptContainsText(payload, promptPreview) || transcriptContainsText(payload, prompt);
  const containsAnswer = turns.some((turn) => {
    const text = messageText(turn);
    return Boolean(answerPreview) && (
      transcriptContainsText({ turns: [turn] }, answerPreview) ||
      transcriptContainsText({ turns: [turn] }, answer)
    );
  }) || (Boolean(answerPreview) && (
    transcriptContainsText(payload, answerPreview) ||
    transcriptContainsText(payload, answer)
  ));
  return containsPrompt && containsAnswer;
}

function summarizeTranscript(payload: CanonicalTranscriptPayload | null): StudySnapshot["transcriptSummary"] {
  const turns = transcriptTurns(payload);
  const lastUser = [...turns].reverse().find((turn) => {
    const role = messageRole(turn);
    return role.includes("user") || role.includes("human");
  });
  const lastAssistant = [...turns].reverse().find((turn) => {
    const role = messageRole(turn);
    return role.includes("assistant") || role.includes("construct") || role.includes("model");
  });
  return {
    messageCount: turns.length,
    lastUserPreview: lastUser ? previewText(messageText(lastUser), 240) : null,
    lastAssistantPreview: lastAssistant ? previewText(messageText(lastAssistant), 240) : null,
  };
}

function conversationVisibleInIndex(
  payload: ConversationIndexPayload | null,
  threadId: string,
  constructId: string,
): boolean | null {
  if (!payload || !Array.isArray(payload.conversations)) {
    return null;
  }
  return payload.conversations.some((conversation) => {
    const candidateThreadId = conversation.thread_id || conversation.id;
    const candidateConstructId = conversation.constructId || conversation.construct_id;
    return candidateThreadId === threadId || candidateConstructId === constructId;
  });
}

async function buildStudySnapshot(
  apiUrl: string,
  cookie: string,
  constructId: string,
  threadId: string,
): Promise<StudySnapshot> {
  const [identityCompact, ledger, transcript] = await Promise.all([
    fetchIdentityCompact(apiUrl, cookie, constructId),
    fetchLedger(apiUrl, cookie, constructId),
    fetchCanonicalTranscript(apiUrl, cookie, threadId),
  ]);
  return {
    constructId,
    threadId,
    canonicalPath: canonicalPath(constructId),
    identityCompact,
    ledger,
    transcriptSummary: summarizeTranscript(transcript.payload),
  };
}

async function writeStudyArtifact(study: StudySnapshot, outDir: string): Promise<string> {
  const filePath = path.join(studyDir(outDir), `${study.constructId}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(study, null, 2)}\n`, "utf8");
  return filePath;
}

function extractAnswer(result: CanonicalMessageResult, transcript: CanonicalTranscriptPayload | null, prompt: string): string {
  const objectPayload = toJsonObject(result.payload);
  const candidates = [
    objectPayload?.response,
    objectPayload?.answer,
    objectPayload?.message,
    objectPayload?.content,
    findReplyAfterPrompt(transcript, prompt),
  ];
  return candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)?.trim() || "";
}

function extractHttpStatus(result: CanonicalMessageResult): number | null {
  return typeof result.status === "number" ? result.status : null;
}

async function resolveCliAuth(apiUrl: string): Promise<{ cookie: string; cookiePresent: true }> {
  const auth = new CLIAuth(apiUrl);
  const currentUser = await auth.getCurrentUser();
  if (!currentUser) {
    throw new Error("No authenticated CLI user. Run chatty-cli login first.");
  }
  const session = await auth.loadSession();
  if (!session?.cookie) {
    throw new Error("Authenticated CLI user has no session cookie. Run chatty-cli login again.");
  }
  return {
    cookie: session.cookie,
    cookiePresent: true,
  };
}

function printHelp(): void {
  console.log(`Usage: npm run probe:chatty-cli:live -- [options]

Options:
  --constructs=<ids>     Comma-separated construct ids. Defaults to ${DEFAULT_LIVE_PROOF_CONSTRUCTS.join(",")}
  --prompt-id=<id>       Run one prompt id from the selected construct matrix.
  --skip-persistence     Send proof turns without canonical persistence. This is the default.
  --persist              Persist proof turns and verify transcript/index readback.
  --out-dir=<path>       Artifact directory. Defaults to ${DEFAULT_LIVE_PROOF_OUTPUT_ROOT}
  --json                 Print the final report JSON to stdout.
`);
}

async function writeArtifacts(report: LiveProofReport, outDir: string): Promise<void> {
  await fs.writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(outDir, "report.md"), buildMarkdownReport(report), "utf8");
}

function summarizeReport(results: LiveProofResult[]): LiveProofReport["summary"] {
  return {
    total: results.length,
    pass: results.filter((result) => result.status === "pass").length,
    warn: results.filter((result) => result.status === "warn").length,
    fail: results.filter((result) => result.status === "fail").length,
  };
}

async function main(): Promise<void> {
  const args = parseLiveProofArgs(process.argv.slice(2)) as LiveProofArgs;
  if (args.help) {
    printHelp();
    return;
  }

  const apiUrl = DEFAULT_API_URL.replace(/\/$/, "");
  await ensureOutputDirs(args.outDir);

  let authCookie: string;
  try {
    const auth = await resolveCliAuth(apiUrl);
    authCookie = auth.cookie;
  } catch (error) {
    const report = buildAuthFailureReport({
      apiUrl,
      outDir: args.outDir,
      error,
      constructs: args.constructs,
    }) as LiveProofReport;
    await writeArtifacts(report, args.outDir);
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.error(report.failures[0]?.failureReason || "CLI auth failed");
      console.error(`Wrote ${path.join(args.outDir, "report.json")}`);
    }
    process.exitCode = 1;
    return;
  }

  let catalog: CliConstructCatalogResult | null = null;
  try {
    catalog = await cliApiClient.listConstructCatalog({
      apiUrl,
      allowInteractiveAuth: false,
      openBrowser: false,
      timeoutMs: INDEX_TIMEOUT_MS,
    });
  } catch {
    catalog = null;
  }
  const fallbackConstructs = catalog?.constructs?.length
    ? []
    : await loadFallbackConstructCatalog(apiUrl, authCookie);
  const catalogConstructs = catalog?.constructs?.length ? catalog.constructs : fallbackConstructs;
  const constructs = selectConstructsForLiveProof(catalogConstructs, args.constructs);
  const constructById = new Map(constructs.map((construct) => [construct.constructId || construct.id, construct]));
  const prompts = selectLiveProofPrompts(args.constructs, args.promptId);
  if (!prompts.length) {
    const promptDetail = args.promptId ? ` and prompt id: ${args.promptId}` : "";
    throw new Error(`No live proof prompts selected for constructs: ${args.constructs.join(",")}${promptDetail}`);
  }

  const persistenceMode = args.skipPersistence ? "skipped" : "persisted";
  const results: LiveProofResult[] = [];
  const studyPathByConstruct = new Map<string, string | null>();

  for (const promptDef of prompts) {
    const construct = constructById.get(promptDef.constructId);
    const constructId = promptDef.constructId;
    const displayName = String(construct?.displayName || constructId);
    const threadId = canonicalThreadId(constructId);
    const proofCanonicalPath = canonicalPath(constructId);
    logProgress(args, `[chatty-cli live proof] ${constructId} / ${promptDef.id}`);

    let studyPath = studyPathByConstruct.get(constructId) || null;
    if (!studyPathByConstruct.has(constructId)) {
      try {
        const study = await buildStudySnapshot(apiUrl, authCookie, constructId, threadId);
        studyPath = await writeStudyArtifact(study, args.outDir);
      } catch {
        studyPath = null;
      }
      studyPathByConstruct.set(constructId, studyPath);
    }

    const answerPath = path.join(answersDir(args.outDir), buildAnswerFileName(constructId, promptDef.id));
    try {
      const beforeTranscript = args.skipPersistence
        ? null
        : await fetchCanonicalTranscript(apiUrl, authCookie, threadId);
      const payload = await cliApiClient.sendCanonicalMessage(
        {
          constructId,
          threadId,
          sessionId: threadId,
          skipPersistence: args.skipPersistence,
          message: promptDef.message,
        },
        {
          apiUrl,
          allowInteractiveAuth: false,
          openBrowser: false,
          timeoutMs: REQUEST_TIMEOUT_MS,
        },
      );
      const turnMetadata = summarizeCanonicalTurn(payload.payload, payload.status);
      let afterTranscript = args.skipPersistence
        ? null
        : await fetchCanonicalTranscript(apiUrl, authCookie, threadId);
      const beforeTranscriptPayload = beforeTranscript?.payload || null;
      let afterTranscriptPayload = afterTranscript?.payload || null;
      const answer = extractAnswer(payload, afterTranscriptPayload || beforeTranscriptPayload, promptDef.message);
      if (!args.skipPersistence && afterTranscript && answer) {
        afterTranscript = await fetchCanonicalTranscriptUntilReadback(
          apiUrl,
          authCookie,
          threadId,
          promptDef.message,
          answer,
          afterTranscript,
        );
        afterTranscriptPayload = afterTranscript?.payload || null;
      }
      const conversationIndex = args.skipPersistence ? null : await fetchConversationIndex(apiUrl, authCookie);
      await fs.writeFile(answerPath, `${answer}\n`, "utf8");

      const promptReadbackFound = args.skipPersistence
        ? null
        : transcriptContainsText(afterTranscriptPayload, previewText(promptDef.message, 160)) ||
          transcriptContainsText(afterTranscriptPayload, promptDef.message);
      const answerReadbackFound = args.skipPersistence
        ? null
        : Boolean(previewText(answer, 160)) &&
          (transcriptContainsText(afterTranscriptPayload, previewText(answer, 160)) ||
            transcriptContainsText(afterTranscriptPayload, answer));
      const canonicalPersistenceVerified = args.skipPersistence
        ? null
        : Boolean(
            afterTranscript?.ok &&
              transcriptContainsPromptAndReply(afterTranscriptPayload, promptDef.message, answer),
          );
      const uiVisibilityLikely = args.skipPersistence
        ? null
        : conversationVisibleInIndex(conversationIndex, threadId, constructId);
      const persistenceVerdict = args.skipPersistence
        ? "skipped"
        : canonicalPersistenceVerified && uiVisibilityLikely !== false
          ? "verified"
          : "failed";
      const classification = classifyLiveProofTurn({
        sendOk: true,
        httpStatus: extractHttpStatus(payload),
        answer,
        construct,
        prompt: promptDef,
        receipt: turnMetadata.receipt,
        checklist: turnMetadata.checklist,
        persistenceMode,
        persistenceVerified: canonicalPersistenceVerified,
        uiVisibilityLikely,
        canonicalTranscriptStatus: args.skipPersistence ? null : afterTranscript?.status ?? null,
        transcriptPromptReadback: promptReadbackFound,
        transcriptAnswerReadback: answerReadbackFound,
      });

      results.push({
        constructId,
        displayName,
        threadId,
        canonicalPath: proofCanonicalPath,
        promptId: promptDef.id,
        promptLabel: promptDef.label,
        prompt: promptDef.message,
        answerPreview: previewText(answer),
        answerPath,
        httpStatus: extractHttpStatus(payload),
        route: classification.receiptSummary?.routeMode || null,
        auth: {
          source: "cli-session",
          cookiePresent: true,
        },
        persistenceMode,
        canonicalPersistenceVerified,
        uiVisibilityLikely,
        canonicalTranscriptStatus: args.skipPersistence ? null : afterTranscript?.status ?? null,
        beforeTranscriptMessageCount: args.skipPersistence ? null : transcriptMessageCount(beforeTranscriptPayload),
        afterTranscriptMessageCount: args.skipPersistence ? null : transcriptMessageCount(afterTranscriptPayload),
        promptReadbackFound,
        answerReadbackFound,
        conversationsIndexVisible: uiVisibilityLikely,
        persistenceVerdict,
        receiptSummary: classification.receiptSummary,
        checklistSummary: classification.checklistSummary,
        voiceChecks: classification.voiceChecks,
        fallbackChecks: classification.fallbackChecks,
        status: classification.status,
        failureReason: classification.failureReason,
        warnings: classification.warnings,
        studyPath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        constructId,
        displayName,
        threadId,
        canonicalPath: proofCanonicalPath,
        promptId: promptDef.id,
        promptLabel: promptDef.label,
        prompt: promptDef.message,
        answerPreview: "",
        answerPath: null,
        httpStatus: null,
        route: null,
        auth: {
          source: "cli-session",
          cookiePresent: true,
        },
        persistenceMode,
        canonicalPersistenceVerified: args.skipPersistence ? null : false,
        uiVisibilityLikely: args.skipPersistence ? null : false,
        canonicalTranscriptStatus: null,
        beforeTranscriptMessageCount: null,
        afterTranscriptMessageCount: null,
        promptReadbackFound: args.skipPersistence ? null : false,
        answerReadbackFound: args.skipPersistence ? null : false,
        conversationsIndexVisible: args.skipPersistence ? null : false,
        persistenceVerdict: args.skipPersistence ? "skipped" : "failed",
        receiptSummary: null,
        checklistSummary: null,
        voiceChecks: {
          firstPersonDirectAddress: false,
          thirdPersonNarration: false,
          providerHelpdeskVoice: false,
        },
        fallbackChecks: {
          providerFallback: false,
          localOllamaFallback: false,
          providerMissing: true,
          missingReceipt: true,
          missingChecklist: true,
        },
        status: "fail",
        failureReason: `backend proof request failed: ${message}`,
        warnings: [],
        studyPath,
      });
    }
  }

  const summary = summarizeReport(results);
  const report: LiveProofReport = {
    generatedAt: new Date().toISOString(),
    apiUrl,
    outputRoot: args.outDir,
    persistenceMode,
    status: summary.fail ? "fail" : summary.warn ? "warn" : "pass",
    summary,
    auth: {
      source: "cli-session",
      cookiePresent: true,
    },
    constructs: args.constructs,
    results,
    failures: results
      .filter((result) => result.failureReason)
      .map((result) => ({
        constructId: result.constructId,
        threadId: result.threadId,
        promptId: result.promptId,
        failureReason: result.failureReason || "",
      })),
  };

  await writeArtifacts(report, args.outDir);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Wrote ${path.join(args.outDir, "report.json")}`);
    console.log(`Wrote ${path.join(args.outDir, "report.md")}`);
  }

  if (report.status === "fail") {
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  });
}
