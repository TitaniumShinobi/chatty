import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import mammoth from "mammoth";

import {
  buildCanonicalTranscriptArtifact,
  CanonicalTranscriptError,
  resolveCanonicalTranscriptPayload,
  serializeCanonicalTranscriptToMarkdown,
} from "../lib/canonicalTranscriptExportService.js";

function buildLongConversation(messageCount = 120) {
  return {
    sessionId: "lin-001_chat_with_lin-001",
    title: "Lin",
    constructId: "lin-001",
    constructName: "Lin",
    constructCallsign: "lin-001",
    createdAt: "2026-04-26T00:00:00.000Z",
    updatedAt: "2026-04-26T00:59:00.000Z",
    messages: Array.from({ length: messageCount }, (_, index) => ({
      id: `turn-${index + 1}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content:
        index === 2
          ? "```js\nconsole.log('export keeps fenced code');\n```"
          : `Message ${index + 1}`,
      timestamp: `2026-04-26T00:${String(Math.floor(index / 2)).padStart(2, "0")}:${String((index % 2) * 30).padStart(2, "0")}.000Z`,
      attachments:
        index === 3
          ? [
              {
                id: "img-1",
                name: "diagram.png",
                filename: "diagram.png",
                category: "image",
                mimeType: "image/png",
                storagePath: "instances/lin-001/chatty/attachments/diagram.png",
              },
            ]
          : undefined,
      metadata:
        index === 4
          ? {
              source: "unit-test",
              confidence: 0.99,
            }
          : undefined,
    })),
  };
}

describe("canonical transcript export service", () => {
  it("resolves the full canonical conversation payload for long threads", async () => {
    const canonicalConversation = buildLongConversation(120);
    const payload = await resolveCanonicalTranscriptPayload({
      sessionId: canonicalConversation.sessionId,
      lookupId: "user-1",
      conversationIndexLookupId: "vvault-user-1",
      supabaseUserId: "user-1",
      readConversationsFromSupabase: async () => [canonicalConversation],
      readLocalDeferredConversations: async () => [],
      parseMarkdownTranscript: () => [],
      allowDegradedFallback: false,
    });

    assert.equal(payload.thread.source, "canonical-conversation");
    assert.equal(payload.turns.length, 120);
    assert.equal(payload.turns[0].content, "Message 1");
    assert.equal(payload.turns.at(-1)?.content, "Message 120");
    assert.equal(payload.turns[0].timestamp, "2026-04-26T00:00:00.000Z");
    assert.equal(payload.turns[1].timestamp, "2026-04-26T00:00:30.000Z");
  });

  it("prefers newer canonical conversation turns over a stale canonical transcript file", async () => {
    const canonicalConversation = buildLongConversation(4);
    const vvaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "chatty-canonical-transcript-"));
    const transcriptPath = path.join(
      vvaultRoot,
      "users",
      "shard_0000",
      "user-1",
      "instances",
      "lin-001",
      "chatty",
      "chat_with_lin-001.md",
    );
    await fs.mkdir(path.dirname(transcriptPath), { recursive: true });
    await fs.writeFile(transcriptPath, "# Lin\n\nstale transcript snapshot\n", "utf8");

    const payload = await resolveCanonicalTranscriptPayload({
      sessionId: canonicalConversation.sessionId,
      lookupId: "user-1",
      supabaseUserId: "user-1",
      vvaultRoot,
      readConversationsFromSupabase: async () => [canonicalConversation],
      readLocalDeferredConversations: async () => [],
      parseMarkdownTranscript: () => canonicalConversation.messages.slice(0, 2),
      allowDegradedFallback: false,
    });

    assert.equal(payload.thread.source, "canonical-conversation");
    assert.equal(payload.turns.length, 4);
    assert.equal(payload.turns.at(-1)?.content, "Message 4");
  });

  it("ignores local transcript files when strict VVAULT-only resolution is requested", async () => {
    const vvaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "chatty-canonical-transcript-"));
    const transcriptPath = path.join(
      vvaultRoot,
      "users",
      "shard_0000",
      "user-1",
      "instances",
      "zen-001",
      "chatty",
      "chat_with_zen-001.md",
    );
    await fs.mkdir(path.dirname(transcriptPath), { recursive: true });
    await fs.writeFile(transcriptPath, "# Zen\n\nlocal file must not become truth\n", "utf8");

    await assert.rejects(
      resolveCanonicalTranscriptPayload({
        sessionId: "zen-001_chat_with_zen-001",
        lookupId: "user-1",
        supabaseUserId: "user-1",
        vvaultRoot,
        readConversationsFromSupabase: async () => [],
        readLocalDeferredConversations: async () => [buildLongConversation(4)],
        parseMarkdownTranscript: () => {
          throw new Error("local transcript parser should not run in vvaultOnly mode");
        },
        allowDegradedFallback: true,
        vvaultOnly: true,
      }),
      (error) =>
        error instanceof CanonicalTranscriptError &&
        error.code === "CANONICAL_TRANSCRIPT_NOT_FOUND",
    );
  });

  it("prefers canonical conversation turns when transcript markdown would strip saved proof metadata", async () => {
    const canonicalConversation = buildLongConversation(2);
    const payload = await resolveCanonicalTranscriptPayload({
      sessionId: canonicalConversation.sessionId,
      lookupId: "user-1",
      supabaseUserId: "user-1",
      readConversationsFromSupabase: async () => [
        {
          ...canonicalConversation,
          messages: canonicalConversation.messages.map((message, index) => ({
            ...message,
            metadata:
              index === 1
                ? {
                    runtime_receipt: { provider: { final_provider: "ollama" } },
                    orchestration_checklist: { overallStatus: "pass" },
                  }
                : message.metadata,
          })),
        },
      ],
      readLocalDeferredConversations: async () => [],
      parseMarkdownTranscript: () =>
        canonicalConversation.messages.map(({ metadata, attachments, ...turn }) => turn),
      allowDegradedFallback: false,
    });

    assert.equal(payload.thread.source, "canonical-conversation");
    assert.deepEqual(payload.turns[1]?.metadata, {
      runtime_receipt: { provider: { final_provider: "ollama" } },
      orchestration_checklist: { overallStatus: "pass" },
    });
  });

  it("supplements truncated canonical reads with the fresh conversation index tail", async () => {
    const canonicalConversation = buildLongConversation(4);
    const truncatedConversation = {
      ...canonicalConversation,
      messages: canonicalConversation.messages.slice(0, 2),
    };
    const indexTail = {
      ...canonicalConversation,
      messageCount: 4,
      messages: canonicalConversation.messages.slice(-2),
    };
    let indexConstructFilter = "not-called";
    const indexLookups = [];

    const payload = await resolveCanonicalTranscriptPayload({
      sessionId: canonicalConversation.sessionId,
      lookupId: "user-1",
      conversationIndexLookupId: "vvault-user-1",
      conversationIndexLookupIds: ["stale-user", "vvault-user-1"],
      supabaseUserId: "user-1",
      readConversationsFromSupabase: async () => [truncatedConversation],
      readConversationIndexFromSupabase: async (lookup, constructFilter) => {
        indexLookups.push(lookup);
        indexConstructFilter = constructFilter;
        return lookup === "vvault-user-1" ? [indexTail] : [];
      },
      readLocalDeferredConversations: async () => [],
      parseMarkdownTranscript: () => [],
      allowDegradedFallback: false,
    });

    assert.deepEqual(indexLookups, ["stale-user", "vvault-user-1"]);
    assert.equal(indexConstructFilter, undefined);
    assert.equal(payload.thread.source, "canonical-conversation");
    assert.equal(payload.turns.length, 4);
    assert.equal(payload.turns.at(-1)?.content, "Message 4");
  });

  it("does not use index or local deferred supplements during strict VVAULT-only resolution", async () => {
    const canonicalConversation = buildLongConversation(4);
    const truncatedConversation = {
      ...canonicalConversation,
      sessionId: "zen-001_chat_with_zen-001",
      constructId: "zen-001",
      messages: canonicalConversation.messages.slice(0, 2),
    };
    let indexCalls = 0;
    let localCalls = 0;

    const payload = await resolveCanonicalTranscriptPayload({
      sessionId: "zen-001_chat_with_zen-001",
      lookupId: "user-1",
      conversationIndexLookupId: "vvault-user-1",
      supabaseUserId: "user-1",
      readConversationsFromSupabase: async () => [truncatedConversation],
      readConversationIndexFromSupabase: async () => {
        indexCalls += 1;
        return [canonicalConversation];
      },
      readLocalDeferredConversations: async () => {
        localCalls += 1;
        return [canonicalConversation];
      },
      parseMarkdownTranscript: () => [],
      allowDegradedFallback: true,
      vvaultOnly: true,
    });

    assert.equal(payload.thread.source, "canonical-conversation");
    assert.equal(payload.turns.length, 2);
    assert.equal(indexCalls, 0);
    assert.equal(localCalls, 0);
  });

  it("supplements existing canonical conversations with fresh local deferred tails", async () => {
    const canonicalConversation = buildLongConversation(4);
    const truncatedConversation = {
      ...canonicalConversation,
      messages: canonicalConversation.messages.slice(0, 2),
    };
    const localDeferredTail = {
      ...canonicalConversation,
      messages: canonicalConversation.messages.slice(-2),
    };
    const localLookups = [];

    const payload = await resolveCanonicalTranscriptPayload({
      sessionId: canonicalConversation.sessionId,
      lookupId: "user-1",
      localDeferredLookupIds: ["stale-user", "local-user-1"],
      supabaseUserId: "user-1",
      readConversationsFromSupabase: async () => [truncatedConversation],
      readConversationIndexFromSupabase: async () => [],
      readLocalDeferredConversations: async (lookup) => {
        localLookups.push(lookup);
        return lookup === "local-user-1" ? [localDeferredTail] : [];
      },
      parseMarkdownTranscript: () => [],
      allowDegradedFallback: false,
    });

    assert.deepEqual(localLookups, ["stale-user", "local-user-1"]);
    assert.equal(payload.thread.source, "canonical-conversation");
    assert.equal(payload.turns.length, 4);
    assert.equal(payload.turns.at(-1)?.content, "Message 4");
  });

  it("serializes roles, timestamps, code fences, attachments, and metadata into markdown deterministically", () => {
    const canonicalConversation = buildLongConversation(8);
    const payload = {
      thread: {
        sessionId: canonicalConversation.sessionId,
        title: canonicalConversation.title,
        constructId: canonicalConversation.constructId,
        constructName: canonicalConversation.constructName,
        constructCallsign: canonicalConversation.constructCallsign,
        createdAt: canonicalConversation.createdAt,
        updatedAt: canonicalConversation.updatedAt,
        source: "canonical-conversation",
        sourcePath: "instances/lin-001/chatty/chat_with_lin-001.md",
        metadata: { archive: "vvault" },
      },
      turns: canonicalConversation.messages,
      rawMarkdown: "",
    };

    const markdown = serializeCanonicalTranscriptToMarkdown(payload);

    assert.match(markdown, /## Thread Metadata/);
    assert.match(markdown, /- Session ID: lin-001_chat_with_lin-001/);
    assert.match(markdown, /## Turn 1 - user/);
    assert.match(markdown, /- Timestamp: 2026-04-26T00:00:00.000Z/);
    assert.match(markdown, /```js\nconsole\.log\('export keeps fenced code'\);\n```/);
    assert.match(markdown, /diagram\.png \(type=image, mime=image\/png, path=instances\/lin-001\/chatty\/attachments\/diagram\.png\)/);
    assert.match(markdown, /"source": "unit-test"/);
    assert.ok(markdown.indexOf("## Turn 1 - user") < markdown.indexOf("## Turn 8 - assistant"));
  });

  it("renders PDF and DOCX from the same canonical payload", async () => {
    const canonicalConversation = buildLongConversation(6);
    const payload = {
      thread: {
        sessionId: canonicalConversation.sessionId,
        title: canonicalConversation.title,
        constructId: canonicalConversation.constructId,
        constructName: canonicalConversation.constructName,
        constructCallsign: canonicalConversation.constructCallsign,
        createdAt: canonicalConversation.createdAt,
        updatedAt: canonicalConversation.updatedAt,
        source: "canonical-conversation",
        sourcePath: "instances/lin-001/chatty/chat_with_lin-001.md",
        metadata: null,
      },
      turns: canonicalConversation.messages,
      rawMarkdown: "",
    };

    const pdfArtifact = await buildCanonicalTranscriptArtifact(payload, "pdf");
    const docxArtifact = await buildCanonicalTranscriptArtifact(payload, "docx");

    assert.equal(pdfArtifact.contentType, "application/pdf");
    assert.equal(
      docxArtifact.contentType,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    const pdfText = pdfArtifact.buffer.toString("latin1");
    const docxText = (await mammoth.extractRawText({ buffer: docxArtifact.buffer })).value;

    assert.match(pdfText, /^%PDF-/);
    assert.match(pdfText, /75726e2031202d2075736572/);
    assert.match(pdfText, /75726e2036202d20617373697374616e74/);
    assert.match(pdfText, /64696167> 10 <72> 10 <616d2e706e67/);

    assert.match(docxText, /Lin/);
    assert.match(docxText, /Turn 1 - user/);
    assert.match(docxText, /Turn 6 - assistant/);
    assert.match(docxText, /diagram\.png/);
  });

  it("fails closed when only degraded local transcript fallback is available", async () => {
    await assert.rejects(
      resolveCanonicalTranscriptPayload({
        sessionId: "lin-001_chat_with_lin-001",
        lookupId: "user-1",
        supabaseUserId: "user-1",
        readConversationsFromSupabase: async () => [],
        readLocalDeferredConversations: async () => [
          buildLongConversation(4),
        ],
        parseMarkdownTranscript: () => [],
        allowDegradedFallback: false,
      }),
      (error) =>
        error instanceof CanonicalTranscriptError &&
        error.code === "CANONICAL_TRANSCRIPT_NOT_FOUND",
    );
  });

  it("marks degraded local transcript fallback explicitly when chat-mode fallback is allowed", async () => {
    const payload = await resolveCanonicalTranscriptPayload({
      sessionId: "lin-001_chat_with_lin-001",
      lookupId: "user-1",
      supabaseUserId: "user-1",
      readConversationsFromSupabase: async () => [],
      readLocalDeferredConversations: async () => [buildLongConversation(4)],
      parseMarkdownTranscript: () => [],
      allowDegradedFallback: true,
    });

    assert.equal(payload.thread.source, "local-deferred");
    await assert.rejects(
      buildCanonicalTranscriptArtifact(payload, "md"),
      (error) =>
        error instanceof CanonicalTranscriptError &&
        error.code === "CANONICAL_TRANSCRIPT_UNAVAILABLE",
    );
  });
});
