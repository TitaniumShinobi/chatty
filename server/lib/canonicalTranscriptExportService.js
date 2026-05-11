import fs from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

const EXPORTABLE_CANONICAL_SOURCES = new Set([
  "canonical-transcript",
  "canonical-conversation",
]);

const DEGRADED_SOURCES = new Set([
  "local-deferred",
  "local-fallback",
  "index-fallback",
  "empty",
  "empty-fallback",
]);

export class CanonicalTranscriptError extends Error {
  constructor(message, { status = 500, code = "CANONICAL_TRANSCRIPT_ERROR", details = null } = {}) {
    super(message);
    this.name = "CanonicalTranscriptError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function deriveConstructIdFromSession(sessionId = "") {
  return sessionId.split("_chat_with_")[0] || sessionId.split("_")[0] || sessionId;
}

function resolveTranscriptStorageCandidates({ sessionId, supabaseUserId, vvaultRoot }) {
  if (!vvaultRoot || !supabaseUserId || !sessionId) {
    return [];
  }

  const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
  const constructId = deriveConstructIdFromSession(sanitizedSessionId);
  const fileName = `chat_with_${constructId}.md`;
  const candidates = [
    {
      sourcePath: path.join(
        vvaultRoot,
        "users",
        "shard_0000",
        supabaseUserId,
        "instances",
        constructId,
        "chatty",
        fileName,
      ),
      constructId,
    },
  ];

  const legacyConstructId = constructId.replace(/-\d+$/, "");
  if (legacyConstructId && legacyConstructId !== constructId) {
    candidates.push({
      sourcePath: path.join(
        vvaultRoot,
        "users",
        "shard_0000",
        supabaseUserId,
        "instances",
        legacyConstructId,
        "chatty",
        fileName,
      ),
      constructId,
    });
  }

  return candidates;
}

async function readCanonicalTranscriptFile({
  sessionId,
  supabaseUserId,
  vvaultRoot,
  parseMarkdownTranscript,
}) {
  const candidates = resolveTranscriptStorageCandidates({
    sessionId,
    supabaseUserId,
    vvaultRoot,
  });

  for (const candidate of candidates) {
    try {
      const content = await fs.readFile(candidate.sourcePath, "utf8");
      const turns =
        typeof parseMarkdownTranscript === "function"
          ? parseMarkdownTranscript(content, candidate.sourcePath)
          : [];
      return {
        source: "canonical-transcript",
        sourcePath: candidate.sourcePath,
        rawMarkdown: content,
        turns,
      };
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  return null;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeAttachmentReference(attachment = {}, index = 0) {
  return {
    id:
      typeof attachment.id === "string" && attachment.id.trim()
        ? attachment.id.trim()
        : `attachment-${index + 1}`,
    name:
      typeof attachment.name === "string" && attachment.name.trim()
        ? attachment.name.trim()
        : typeof attachment.filename === "string" && attachment.filename.trim()
          ? attachment.filename.trim()
          : `attachment-${index + 1}`,
    filename:
      typeof attachment.filename === "string" && attachment.filename.trim()
        ? attachment.filename.trim()
        : undefined,
    category:
      typeof attachment.category === "string" && attachment.category.trim()
        ? attachment.category.trim()
        : undefined,
    mimeType:
      typeof attachment.mimeType === "string" && attachment.mimeType.trim()
        ? attachment.mimeType.trim()
        : undefined,
    size: Number.isFinite(attachment.size) ? Number(attachment.size) : undefined,
    storagePath:
      typeof attachment.storagePath === "string" && attachment.storagePath.trim()
        ? attachment.storagePath.trim()
        : undefined,
    url:
      typeof attachment.url === "string" && attachment.url.trim()
        ? attachment.url.trim()
        : undefined,
    sha256:
      typeof attachment.sha256 === "string" && attachment.sha256.trim()
        ? attachment.sha256.trim()
        : undefined,
  };
}

function normalizeTurn(turn = {}, index = 0) {
  const normalizedRole =
    typeof turn.role === "string" && turn.role.trim()
      ? turn.role.trim().toLowerCase()
      : "assistant";
  const timestampValue = turn.timestamp ?? turn.ts ?? null;
  const normalizedTimestamp =
    typeof timestampValue === "string"
      ? timestampValue
      : Number.isFinite(timestampValue)
        ? new Date(Number(timestampValue)).toISOString()
        : null;
  const content =
    typeof turn.content === "string"
      ? turn.content
      : typeof turn.text === "string"
        ? turn.text
        : turn.content == null
          ? ""
          : String(turn.content);

  return {
    id:
      typeof turn.id === "string" && turn.id.trim()
        ? turn.id.trim()
        : `turn-${index + 1}`,
    role: normalizedRole,
    content,
    timestamp: normalizedTimestamp,
    attachments: Array.isArray(turn.attachments)
      ? turn.attachments.map((attachment, attachmentIndex) =>
          normalizeAttachmentReference(attachment, attachmentIndex),
        )
      : [],
    metadata: isPlainObject(turn.metadata) ? turn.metadata : null,
    isDateHeader: turn.isDateHeader === true,
  };
}

function matchesConversationSession(conversation, sessionId, constructId) {
  if (!conversation) return false;
  return (
    conversation.sessionId === sessionId ||
    conversation.id === sessionId ||
    conversation.constructId === constructId ||
    conversation.constructCallsign === constructId ||
    (typeof conversation.sessionId === "string" &&
      (sessionId.includes(conversation.sessionId) ||
        conversation.sessionId.includes(sessionId.split("_")[0])))
  );
}

function findCanonicalConversation(conversations = [], sessionId, constructId) {
  return (Array.isArray(conversations) ? conversations : []).find((conversation) =>
    matchesConversationSession(conversation, sessionId, constructId),
  ) || null;
}

function turnIdentity(turn = {}) {
  if (typeof turn.id === "string" && turn.id.trim()) {
    return `id:${turn.id.trim()}`;
  }
  const role = typeof turn.role === "string" ? turn.role.trim().toLowerCase() : "";
  const timestamp = typeof turn.timestamp === "string" ? turn.timestamp.trim() : "";
  const content =
    typeof turn.content === "string"
      ? turn.content
      : typeof turn.text === "string"
        ? turn.text
        : "";
  return [role, timestamp, content.trim()].join("\u0000");
}

function mergeConversationWithIndexTail(conversation, indexConversation) {
  if (!conversation || !indexConversation || !Array.isArray(indexConversation.messages)) {
    return conversation;
  }

  const baseMessages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const mergedMessages = [...baseMessages];
  const explicitMessageCount = indexConversation.messageCount ?? indexConversation.message_count;
  const indexMessageCount = Number(explicitMessageCount ?? indexConversation.messages.length);
  if (
    explicitMessageCount != null &&
    (!Number.isFinite(indexMessageCount) || indexMessageCount <= baseMessages.length)
  ) {
    const enrichedMessages = enrichConversationTurns(mergedMessages, indexConversation.messages);
    if (enrichedMessages === mergedMessages) {
      return conversation;
    }
    return {
      ...conversation,
      updatedAt: indexConversation.updatedAt || indexConversation.updated_at || conversation.updatedAt,
      messages: enrichedMessages,
    };
  }

  const seen = new Set(baseMessages.map((turn) => turnIdentity(turn)));
  const enrichedMessages = enrichConversationTurns(mergedMessages, indexConversation.messages);
  for (const message of indexConversation.messages) {
    const identity = turnIdentity(message);
    if (!identity || seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    mergedMessages.push(message);
  }

  if (enrichedMessages === baseMessages) {
    return conversation;
  }

  return {
    ...conversation,
    updatedAt: indexConversation.updatedAt || indexConversation.updated_at || conversation.updatedAt,
    messages: enrichedMessages,
  };
}

function turnHasStructuredProof(turn = {}) {
  return Boolean(
    (isPlainObject(turn.metadata) && Object.keys(turn.metadata).length > 0) ||
      (Array.isArray(turn.attachments) && turn.attachments.length > 0),
  );
}

function enrichConversationTurns(baseMessages = [], incomingMessages = []) {
  if (!Array.isArray(baseMessages) || !Array.isArray(incomingMessages)) {
    return baseMessages;
  }

  let changed = false;
  const mergedMessages = [...baseMessages];
  const incomingByIdentity = new Map();
  for (const turn of incomingMessages) {
    incomingByIdentity.set(turnIdentity(turn), turn);
  }

  for (let index = 0; index < mergedMessages.length; index += 1) {
    const current = mergedMessages[index];
    const incoming = incomingByIdentity.get(turnIdentity(current));
    if (!incoming) continue;
    if (turnHasStructuredProof(current) || !turnHasStructuredProof(incoming)) continue;
    mergedMessages[index] = {
      ...current,
      ...(Array.isArray(incoming.attachments) && incoming.attachments.length > 0
        ? { attachments: incoming.attachments }
        : {}),
      ...(isPlainObject(incoming.metadata) ? { metadata: incoming.metadata } : {}),
    };
    changed = true;
  }

  return changed ? mergedMessages : baseMessages;
}

function extractHeadingTitle(rawMarkdown) {
  if (typeof rawMarkdown !== "string") return null;
  const match = rawMarkdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || null;
}

function titleFromConstructId(constructId, sessionId) {
  if (typeof constructId === "string" && constructId.trim()) {
    const base = constructId.replace(/-\d+$/, "");
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  return sessionId || "Conversation";
}

function buildCanonicalPayload({
  sessionId,
  constructId,
  source,
  sourcePath = null,
  rawMarkdown = "",
  turns = [],
  conversation = null,
}) {
  const normalizedTurns = (Array.isArray(turns) ? turns : []).map((turn, index) =>
    normalizeTurn(turn, index),
  );
  const threadTitle =
    conversation?.title ||
    extractHeadingTitle(rawMarkdown) ||
    titleFromConstructId(conversation?.constructId || constructId, sessionId);

  return {
    thread: {
      sessionId,
      title: threadTitle,
      constructId: conversation?.constructId || constructId || null,
      constructName: conversation?.constructName || null,
      constructCallsign: conversation?.constructCallsign || null,
      createdAt: conversation?.createdAt || null,
      updatedAt: conversation?.updatedAt || null,
      source,
      sourcePath,
      metadata: isPlainObject(conversation?.metadata) ? conversation.metadata : null,
    },
    turns: normalizedTurns,
    rawMarkdown: typeof rawMarkdown === "string" ? rawMarkdown : "",
  };
}

function turnsContainStructuredProof(turns = []) {
  return (Array.isArray(turns) ? turns : []).some((turn) => turnHasStructuredProof(turn));
}

export async function resolveCanonicalTranscriptPayload({
  sessionId,
  lookupId,
  conversationIndexLookupId = null,
  conversationIndexLookupIds = null,
  localDeferredLookupIds = null,
  userEmail = null,
  supabaseUserId = null,
  vvaultRoot = null,
  parseMarkdownTranscript,
  readConversations,
  readConversationsFromSupabase,
  readConversationIndexFromSupabase,
  readLocalDeferredConversations,
  allowDegradedFallback = false,
  vvaultOnly = false,
}) {
  if (!sessionId) {
    throw new CanonicalTranscriptError("sessionId is required", {
      status: 400,
      code: "SESSION_ID_REQUIRED",
    });
  }

  const constructId = deriveConstructIdFromSession(sessionId);
  const canonicalTranscript = vvaultOnly
    ? null
    : await readCanonicalTranscriptFile({
        sessionId,
        supabaseUserId,
        vvaultRoot,
        parseMarkdownTranscript,
      });

  let canonicalConversation = null;
  const readCanonicalConversations = readConversations || readConversationsFromSupabase;
  if (typeof readCanonicalConversations === "function") {
    const conversations = await readCanonicalConversations(
      { supabaseUserId, userEmail, userId: lookupId },
      constructId,
      { allowLocalFallback: false },
    );
    canonicalConversation = findCanonicalConversation(conversations, sessionId, constructId);
  }

  if (!vvaultOnly && typeof readConversationIndexFromSupabase === "function") {
    try {
      const lookupCandidates = Array.isArray(conversationIndexLookupIds)
        ? conversationIndexLookupIds
        : [conversationIndexLookupId || lookupId];
      for (const indexLookupId of lookupCandidates.filter(Boolean)) {
        const indexRows = await readConversationIndexFromSupabase(indexLookupId);
        const indexConversation = findCanonicalConversation(indexRows, sessionId, constructId);
        canonicalConversation = mergeConversationWithIndexTail(
          canonicalConversation,
          indexConversation,
        );
      }
    } catch {
      // The index is a freshness supplement. Canonical transcript resolution
      // should still succeed or fail based on the primary canonical sources.
    }
  }

  if (!vvaultOnly && canonicalConversation && typeof readLocalDeferredConversations === "function") {
    try {
      const localLookupCandidates = Array.isArray(localDeferredLookupIds)
        ? localDeferredLookupIds
        : [lookupId];
      for (const localLookupId of localLookupCandidates.filter(Boolean)) {
        const localDeferredRows = await readLocalDeferredConversations(
          localLookupId,
          constructId,
        );
        const localDeferredConversation = findCanonicalConversation(
          localDeferredRows,
          sessionId,
          constructId,
        );
        canonicalConversation = mergeConversationWithIndexTail(
          canonicalConversation,
          localDeferredConversation,
        );
      }
    } catch {
      // Local deferred rows are only used as a freshness supplement when a
      // canonical conversation exists. They should not decide availability.
    }
  }

  if (canonicalTranscript) {
    const transcriptTurns =
      canonicalTranscript.turns.length > 0
        ? canonicalTranscript.turns
        : canonicalConversation?.messages || [];
    const conversationTurns = Array.isArray(canonicalConversation?.messages)
      ? canonicalConversation.messages
      : [];
    const conversationCarriesMoreProof =
      conversationTurns.length === transcriptTurns.length &&
      turnsContainStructuredProof(conversationTurns) &&
      !turnsContainStructuredProof(transcriptTurns);

    if (conversationTurns.length > transcriptTurns.length || conversationCarriesMoreProof) {
      return buildCanonicalPayload({
        sessionId,
        constructId,
        source: "canonical-conversation",
        turns: conversationTurns,
        conversation: canonicalConversation,
      });
    }

    return buildCanonicalPayload({
      sessionId,
      constructId,
      source: canonicalTranscript.source,
      sourcePath: canonicalTranscript.sourcePath,
      rawMarkdown: canonicalTranscript.rawMarkdown,
      turns: transcriptTurns,
      conversation: canonicalConversation,
    });
  }

  if (canonicalConversation) {
    return buildCanonicalPayload({
      sessionId,
      constructId,
      source: "canonical-conversation",
      turns: canonicalConversation.messages || [],
      conversation: canonicalConversation,
    });
  }

  if (!vvaultOnly && allowDegradedFallback && typeof readLocalDeferredConversations === "function") {
    const localDeferredRows = await readLocalDeferredConversations(lookupId, constructId);
    const localDeferredConversation = findCanonicalConversation(
      localDeferredRows,
      sessionId,
      constructId,
    );
    if (localDeferredConversation) {
      return buildCanonicalPayload({
        sessionId,
        constructId,
        source: "local-deferred",
        turns: localDeferredConversation.messages || [],
        conversation: localDeferredConversation,
      });
    }
  }

  throw new CanonicalTranscriptError(
    `Canonical transcript not found for session ${sessionId}`,
    {
      status: 404,
      code: "CANONICAL_TRANSCRIPT_NOT_FOUND",
    },
  );
}

export function assertCanonicalExportablePayload(payload) {
  const source = payload?.thread?.source || "empty";
  if (!EXPORTABLE_CANONICAL_SOURCES.has(source)) {
    const isDegraded = DEGRADED_SOURCES.has(source);
    throw new CanonicalTranscriptError(
      isDegraded
        ? `Canonical transcript export is unavailable because the resolved source was ${source}.`
        : `Canonical transcript export does not support source ${source}.`,
      {
        status: isDegraded ? 503 : 400,
        code: isDegraded
          ? "CANONICAL_TRANSCRIPT_UNAVAILABLE"
          : "CANONICAL_TRANSCRIPT_UNSUPPORTED_SOURCE",
        details: { source },
      },
    );
  }
  return {
    ...payload,
    turns: Array.isArray(payload?.turns)
      ? payload.turns.map((turn, index) => normalizeTurn(turn, index))
      : [],
  };
}

function stableSortObject(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => stableSortObject(entry));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = stableSortObject(value[key]);
      return acc;
    }, {});
}

function stableJsonStringify(value) {
  return JSON.stringify(stableSortObject(value), null, 2);
}

function formatAttachmentLines(attachments = []) {
  const rows = [];
  for (const attachment of attachments) {
    const parts = [];
    if (attachment.category) parts.push(`type=${attachment.category}`);
    if (attachment.mimeType) parts.push(`mime=${attachment.mimeType}`);
    if (Number.isFinite(attachment.size)) parts.push(`size=${attachment.size}`);
    if (attachment.storagePath) parts.push(`path=${attachment.storagePath}`);
    if (attachment.url) parts.push(`url=${attachment.url}`);
    if (attachment.sha256) parts.push(`sha256=${attachment.sha256}`);
    rows.push(`- ${attachment.name}${parts.length ? ` (${parts.join(", ")})` : ""}`);
  }
  return rows;
}

export function serializeCanonicalTranscriptToMarkdown(payload) {
  const canonicalPayload = assertCanonicalExportablePayload(payload);
  const lines = [
    `# ${canonicalPayload.thread.title || canonicalPayload.thread.sessionId || "Conversation"}`,
    "",
    "## Thread Metadata",
    `- Session ID: ${canonicalPayload.thread.sessionId || ""}`,
    `- Construct ID: ${canonicalPayload.thread.constructId || ""}`,
    `- Construct Name: ${canonicalPayload.thread.constructName || ""}`,
    `- Construct Callsign: ${canonicalPayload.thread.constructCallsign || ""}`,
    `- Source: ${canonicalPayload.thread.source || ""}`,
    `- Source Path: ${canonicalPayload.thread.sourcePath || ""}`,
    `- Created At: ${canonicalPayload.thread.createdAt || ""}`,
    `- Updated At: ${canonicalPayload.thread.updatedAt || ""}`,
    "",
  ];

  if (canonicalPayload.thread.metadata) {
    lines.push("### Thread Metadata JSON", "", "```json", stableJsonStringify(canonicalPayload.thread.metadata), "```", "");
  }

  canonicalPayload.turns.forEach((turn, index) => {
    if (turn.isDateHeader) {
      lines.push(`## ${turn.content || `Date Header ${index + 1}`}`, "");
      return;
    }

    lines.push(`## Turn ${index + 1} - ${turn.role}`);
    lines.push(`- Message ID: ${turn.id || ""}`);
    lines.push(`- Role: ${turn.role || ""}`);
    lines.push(`- Timestamp: ${turn.timestamp || ""}`);
    lines.push("");

    if (turn.content) {
      lines.push(turn.content, "");
    }

    if (turn.attachments.length > 0) {
      lines.push("### Attachments", ...formatAttachmentLines(turn.attachments), "");
    }

    if (turn.metadata) {
      lines.push("### Metadata", "", "```json", stableJsonStringify(turn.metadata), "```", "");
    }
  });

  return `${lines.join("\n").trimEnd()}\n`;
}

export function buildChatTranscriptResponse(payload) {
  return {
    ok: true,
    content:
      payload?.thread?.source === "canonical-transcript" && payload?.rawMarkdown
        ? payload.rawMarkdown
        : serializeCanonicalTranscriptToMarkdown({
            ...payload,
            thread: {
              ...payload.thread,
              source: EXPORTABLE_CANONICAL_SOURCES.has(payload?.thread?.source)
                ? payload.thread.source
                : "canonical-conversation",
            },
          }),
    messages: payload?.turns || [],
    source: payload?.thread?.source || "empty",
  };
}

function renderThreadMetadataBlock(doc, payload) {
  doc.font("Helvetica-Bold").fontSize(16).text(payload.thread.title || payload.thread.sessionId || "Conversation");
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(10);
  const metadataLines = [
    `Session ID: ${payload.thread.sessionId || ""}`,
    `Construct ID: ${payload.thread.constructId || ""}`,
    `Construct Name: ${payload.thread.constructName || ""}`,
    `Construct Callsign: ${payload.thread.constructCallsign || ""}`,
    `Source: ${payload.thread.source || ""}`,
    `Source Path: ${payload.thread.sourcePath || ""}`,
    `Created At: ${payload.thread.createdAt || ""}`,
    `Updated At: ${payload.thread.updatedAt || ""}`,
  ];
  for (const line of metadataLines) {
    doc.text(line);
  }
  doc.moveDown();
}

export async function renderCanonicalTranscriptPdfBuffer(payload) {
  const canonicalPayload = assertCanonicalExportablePayload(payload);
  const doc = new PDFDocument({
    autoFirstPage: true,
    margin: 48,
    compress: false,
    info: {
      Title: canonicalPayload.thread.title || canonicalPayload.thread.sessionId || "Conversation Export",
      Author: "Chatty",
      Subject: "Canonical transcript export",
    },
  });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  renderThreadMetadataBlock(doc, canonicalPayload);

  canonicalPayload.turns.forEach((turn, index) => {
    if (turn.isDateHeader) {
      doc.font("Helvetica-Bold").fontSize(13).text(turn.content || `Date Header ${index + 1}`);
      doc.moveDown(0.5);
      return;
    }

    doc.font("Helvetica-Bold").fontSize(13).text(`Turn ${index + 1} - ${turn.role}`);
    doc.font("Helvetica").fontSize(10);
    doc.text(`Message ID: ${turn.id || ""}`);
    doc.text(`Role: ${turn.role || ""}`);
    doc.text(`Timestamp: ${turn.timestamp || ""}`);
    doc.moveDown(0.3);
    if (turn.content) {
      doc.font("Helvetica").fontSize(11).text(turn.content, {
        paragraphGap: 6,
      });
    }
    if (turn.attachments.length > 0) {
      doc.font("Helvetica-Bold").fontSize(11).text("Attachments");
      doc.font("Helvetica").fontSize(10);
      for (const line of formatAttachmentLines(turn.attachments)) {
        doc.text(line);
      }
      doc.moveDown(0.3);
    }
    if (turn.metadata) {
      doc.font("Helvetica-Bold").fontSize(11).text("Metadata");
      doc.font("Courier").fontSize(9).text(stableJsonStringify(turn.metadata));
      doc.moveDown(0.3);
    }
    doc.moveDown(0.6);
  });

  doc.end();

  return await new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function buildDocxParagraphs(payload) {
  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun(payload.thread.title || payload.thread.sessionId || "Conversation")],
    }),
    new Paragraph({ text: `Session ID: ${payload.thread.sessionId || ""}` }),
    new Paragraph({ text: `Construct ID: ${payload.thread.constructId || ""}` }),
    new Paragraph({ text: `Construct Name: ${payload.thread.constructName || ""}` }),
    new Paragraph({ text: `Construct Callsign: ${payload.thread.constructCallsign || ""}` }),
    new Paragraph({ text: `Source: ${payload.thread.source || ""}` }),
    new Paragraph({ text: `Source Path: ${payload.thread.sourcePath || ""}` }),
    new Paragraph({ text: `Created At: ${payload.thread.createdAt || ""}` }),
    new Paragraph({ text: `Updated At: ${payload.thread.updatedAt || ""}` }),
    new Paragraph({ text: "" }),
  ];

  if (payload.thread.metadata) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Thread Metadata JSON" }),
      new Paragraph({ text: stableJsonStringify(payload.thread.metadata) }),
      new Paragraph({ text: "" }),
    );
  }

  payload.turns.forEach((turn, index) => {
    if (turn.isDateHeader) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, text: turn.content || `Date Header ${index + 1}` }));
      return;
    }

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        text: `Turn ${index + 1} - ${turn.role}`,
      }),
      new Paragraph({ text: `Message ID: ${turn.id || ""}` }),
      new Paragraph({ text: `Role: ${turn.role || ""}` }),
      new Paragraph({ text: `Timestamp: ${turn.timestamp || ""}` }),
    );
    if (turn.content) {
      children.push(new Paragraph({ text: turn.content }));
    }
    if (turn.attachments.length > 0) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, text: "Attachments" }));
      for (const line of formatAttachmentLines(turn.attachments)) {
        children.push(new Paragraph({ text: line }));
      }
    }
    if (turn.metadata) {
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_3, text: "Metadata" }),
        new Paragraph({ text: stableJsonStringify(turn.metadata) }),
      );
    }
    children.push(new Paragraph({ text: "" }));
  });

  return children;
}

export async function renderCanonicalTranscriptDocxBuffer(payload) {
  const canonicalPayload = assertCanonicalExportablePayload(payload);
  const document = new Document({
    sections: [
      {
        properties: {},
        children: buildDocxParagraphs(canonicalPayload),
      },
    ],
  });
  return Packer.toBuffer(document);
}

function slugifyFilePart(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "conversation";
}

export function buildCanonicalTranscriptFilename(payload, format) {
  const base = slugifyFilePart(payload?.thread?.title || payload?.thread?.sessionId || "conversation");
  return `${base}-transcript.${format}`;
}

export async function buildCanonicalTranscriptArtifact(payload, format) {
  const canonicalPayload = assertCanonicalExportablePayload(payload);
  switch (format) {
    case "md":
      return {
        contentType: "text/markdown; charset=utf-8",
        buffer: Buffer.from(serializeCanonicalTranscriptToMarkdown(canonicalPayload), "utf8"),
      };
    case "pdf":
      return {
        contentType: "application/pdf",
        buffer: await renderCanonicalTranscriptPdfBuffer(canonicalPayload),
      };
    case "docx":
      return {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: await renderCanonicalTranscriptDocxBuffer(canonicalPayload),
      };
    default:
      throw new CanonicalTranscriptError(`Unsupported export format: ${format}`, {
        status: 400,
        code: "UNSUPPORTED_EXPORT_FORMAT",
      });
  }
}
