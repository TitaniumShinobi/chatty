import JSZip from "jszip";
import crypto from "crypto";
import { Buffer } from "node:buffer";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { GPTManager } from "../lib/gptManager.js";
import VVAULTMemoryManager from "../lib/vvaultMemoryManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CHATGPT_FILE_REGEX = /(^|\/)conversations\.json$/i;
const GEMINI_FILE_REGEX = /(^|\/)(myactivity|conversations)\.(jsonl?|json)$/i;
const EMAIL_REGEX =
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const sanitizeConstructId = (value = '') =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'imported-runtime';

const buildConstructBase = (source = 'imported', identity = null, fallbackId = '') => {
  const provider = sanitizeConstructId(source);
  const emailHandle = identity?.email ? sanitizeConstructId(identity.email.split('@')[0]) : '';
  const fallback = fallbackId ? sanitizeConstructId(fallbackId) : '';
  const suffix = emailHandle || fallback || 'runtime';
  return sanitizeConstructId(`${provider}-${suffix}`);
};

const gptManager = GPTManager.getInstance();

// Allow repairing slightly truncated ZIP archives (up to ~5MB padding)
const MAX_TRUNCATED_ZIP_PAD_BYTES = 5 * 1024 * 1024;

// Media file extensions
const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|bmp|svg|tiff|tif|ico)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|avi|mov|mkv|webm|flv|wmv|ts|3gp|ogv|m4v)$/i;
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|flac|aac|wma)$/i;

const KNOWN_EXPORT_PATHS = [
  {
    pattern: /(^|\/)conversations\.json$/i,
    display: "conversations.json",
    description: "🗂️ Your chat history with timestamps and metadata.",
  },
  {
    pattern: /(^|\/)user\.json$/i,
    display: "user.json",
    description: "👤 Your account metadata (email, ID, preferences).",
  },
  {
    pattern: /(^|\/)profile\.json$/i,
    display: "profile.json",
    description: "🪪 Profile details including display name and avatar info.",
  },
  {
    pattern: /(^|\/)message_feedback\.json$/i,
    display: "message_feedback.json",
    description: "📝 Feedback you left on model replies.",
  },
  {
    pattern: /(^|\/)shared_conversations\.json$/i,
    display: "shared_conversations.json",
    description: "🔗 Conversations you shared via public links.",
  },
  {
    pattern: /(^|\/)chat\.html$/i,
    display: "chat.html",
    description: "🖼️ A rendered HTML view of selected conversations.",
  },
  {
    pattern: /^media\/?/i,
    display: "media/",
    description: "📁 Uploaded images or files used in chats.",
    matchDirectories: true,
  },
  {
    pattern: /^files\/?/i,
    display: "files/",
    description: "🗳️ Attachments bundled with the export.",
    matchDirectories: true,
  },
  {
    pattern: /^prompts\/?/i,
    display: "prompts/",
    description: "🧾 Saved prompts or templates from the source platform.",
    matchDirectories: true,
  },
  // Media file patterns (by extension, not just directory)
  {
    pattern: IMAGE_EXTENSIONS,
    display: "Images",
    description: "🖼️ Image files (PNG, JPEG, GIF, WebP, etc.)",
    isMediaCategory: true,
    mediaType: 'image',
  },
  {
    pattern: VIDEO_EXTENSIONS,
    display: "Videos",
    description: "🎬 Video files (MP4, AVI, MOV, WebM, etc.)",
    isMediaCategory: true,
    mediaType: 'video',
  },
  {
    pattern: AUDIO_EXTENSIONS,
    display: "Audio",
    description: "🎵 Audio files (MP3, WAV, OGG, M4A, etc.)",
    isMediaCategory: true,
    mediaType: 'audio',
  },
];

function describeArchiveEntry(entryName, isDirectory) {
  const normalized = entryName.replace(/^\.\/+/, "");
  
  // Skip directories for media category patterns (they're for files only)
  if (!isDirectory) {
    for (const known of KNOWN_EXPORT_PATHS) {
      if (known.isMediaCategory && known.pattern.test(normalized)) {
        return {
          display: known.display,
          description: known.description,
          path: normalized,
          isDirectory: false,
          mediaType: known.mediaType,
        };
      }
    }
  }
  
  // Check other patterns
  for (const known of KNOWN_EXPORT_PATHS) {
    if (known.isMediaCategory) continue; // Already checked above
    
    const matchesDirectory = Boolean(known.matchDirectories && isDirectory);
    if (known.pattern.test(normalized)) {
      if (matchesDirectory || !isDirectory) {
        return {
          display: known.display,
          description: known.description,
          path: normalized,
          isDirectory,
        };
      }
    }
  }
  return null;
}

function buildArchiveSummary(knownEntries, unknownEntries) {
  if (knownEntries.length === 0 && unknownEntries.length === 0) {
    return {
      text: "📦 ZIP Import Summary\n\n(no readable entries found)",
      knownEntries,
      unknownEntries,
    };
  }

  const lines = ["📦 ZIP Import Summary", ""];
  const sortedKnown = [...knownEntries].sort((a, b) =>
    a.display.localeCompare(b.display)
  );

  sortedKnown.forEach((entry, index) => {
    const isLast =
      index === sortedKnown.length - 1 && unknownEntries.length === 0;
    const branch = isLast ? "└──" : "├──";
    const continuation = isLast ? "    " : "│   ";
    const displayName = entry.isDirectory
      ? `${entry.display.replace(/\/?$/, "/")}`
      : entry.display;
    lines.push(`${branch} ${displayName}`);
    lines.push(`${continuation}→ ${entry.description}`);
  });

  if (unknownEntries.length > 0) {
    if (sortedKnown.length > 0) {
      lines.push("├── 🧩 Unknown files");
    } else {
      lines.push("└── 🧩 Unknown files");
    }
    unknownEntries.forEach((path, idx) => {
      const prefix =
        idx === unknownEntries.length - 1 ? "    " : "│   ";
      lines.push(`${prefix}${idx === 0 ? "→" : " "} ${path}`);
    });
  } else if (sortedKnown.length > 0) {
    lines.push("");
    lines.push("✅ All known files mapped.");
  }

  if (unknownEntries.length > 0) {
    lines.push("");
    lines.push(`🧩 Unknown files: ${unknownEntries.length}`);
  } else {
    lines.push("");
    lines.push("🧩 Unknown files: none");
  }

  return {
    text: lines.join("\n"),
    knownEntries: sortedKnown,
    unknownEntries,
  };
}

export async function createPrimaryConversationFile(
  constructId,
  userId,
  email,
  provider,
  vvaultRoot,
  shardId = 'shard_0000',
  runtimeId = null
) {
  if (!constructId || !userId || !vvaultRoot) {
    throw new Error('Missing required parameters for canonical conversation creation');
  }

  const providerLabel = provider
    ? provider.charAt(0).toUpperCase() + provider.slice(1)
    : 'ChatGPT';
  const resolvedRuntimeId =
    runtimeId ||
    constructId?.replace(/-001$/, '') ||
    constructId;
  const canonicalDir = path.join(
    vvaultRoot,
    'users',
    shardId,
    userId,
    'instances',
    constructId,
    'chatty'
  );

  await fs.mkdir(canonicalDir, { recursive: true });

  const filePath = path.join(canonicalDir, `chat_with_${constructId}.md`);
  const sessionId = `${constructId}_chat_with_${constructId}`;
  const timestamp = new Date().toISOString();
  const metadata = {
    source: provider || providerLabel,
    importedAt: timestamp,
    constructId,
    runtimeId: resolvedRuntimeId,
    conversationId: sessionId,
    conversationTitle: `Chat with ${providerLabel}`,
    isPrimary: true,
    createdBy: email || 'unknown'
  };
  const metadataBlock = `<!-- IMPORT_METADATA\n${JSON.stringify(metadata, null, 2)}\n-->`;

  try {
    await fs.access(filePath);
    console.log(`ℹ️ [importService] Canonical conversation already exists: ${filePath}`);
    return filePath;
  } catch {
    // File does not exist yet; proceed to create
  }

  const content = `${metadataBlock}

# Chat with ${providerLabel}

**Created**: ${timestamp}
**Session ID**: ${sessionId}
**Construct**: ${constructId}
**Runtime**: ${resolvedRuntimeId}

---

Welcome to your ${providerLabel} runtime. This is your canonical conversation.

Your imported conversations are available in the sidebar.
`;

  await fs.writeFile(filePath, content, 'utf8');
  console.log(`✅ [importService] Created canonical conversation file: ${filePath}`);
  return filePath;
}

async function summarizeExport(zip) {
  const knownEntries = [];
  const unknownEntries = [];
  const mediaCounts = {
    image: 0,
    video: 0,
    audio: 0,
  };

  Object.values(zip.files).forEach((entry) => {
    if (!entry || !entry.name || entry.name.startsWith("__MACOSX")) {
      return;
    }

    const isDirectory = entry.dir;
    const description = describeArchiveEntry(entry.name, isDirectory);

    if (description) {
      // Track media files by category
      if (description.mediaType && mediaCounts[description.mediaType] !== undefined) {
        mediaCounts[description.mediaType]++;
      }
      
      // Only add category entries once (not per file)
      if (description.isMediaCategory) {
        const existingCategory = knownEntries.find(
          (known) => known.display === description.display && known.isMediaCategory
        );
        if (!existingCategory) {
          knownEntries.push(description);
        }
      } else {
        // For non-media categories, check if already tracked
        const alreadyTracked = knownEntries.find(
          (known) =>
            known.display === description.display &&
            known.isDirectory === description.isDirectory &&
            !known.isMediaCategory
        );

        if (!alreadyTracked) {
          knownEntries.push(description);
        }
      }
    } else if (!isDirectory) {
      unknownEntries.push(entry.name);
    }
  });

  // Update media category descriptions with counts
  knownEntries.forEach((entry) => {
    if (entry.isMediaCategory && mediaCounts[entry.mediaType] > 0) {
      entry.description = `${entry.description} (${mediaCounts[entry.mediaType]} file${mediaCounts[entry.mediaType] !== 1 ? 's' : ''})`;
    }
  });

  return buildArchiveSummary(knownEntries, unknownEntries);
}

function toISODate(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    // ChatGPT exports store unix seconds
    return new Date(value * 1000).toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function updateDateRange(range, candidate) {
  if (!candidate) {
    return range;
  }

  const timestamp = new Date(candidate).getTime();
  if (Number.isNaN(timestamp)) {
    return range;
  }

  const next = { ...range };
  if (!next.earliest || timestamp < next.earliestTs) {
    next.earliest = candidate;
    next.earliestTs = timestamp;
  }

  if (!next.latest || timestamp > next.latestTs) {
    next.latest = candidate;
    next.latestTs = timestamp;
  }

  return next;
}

function finalizeRange(range) {
  if (!range) {
    return { earliest: null, latest: null };
  }

  return {
    earliest: range.earliest || null,
    latest: range.latest || null,
  };
}

async function parseChatGPTExport(file, identity) {
  const raw = await file.async("string");
  
  // Handle empty or malformed JSON
  if (!raw || raw.trim().length === 0) {
    throw new Error(`Empty or invalid conversations file: ${file.name}`);
  }
  
  let conversations;
  try {
    conversations = JSON.parse(raw);
  } catch (error) {
    if (error.message.includes('Unexpected end of JSON input')) {
      throw new Error(`Incomplete or corrupted conversations file: ${file.name}. The file may be truncated or incomplete.`);
    }
    throw new Error(`Failed to parse conversations file ${file.name}: ${error.message}`);
  }
  
  if (!Array.isArray(conversations)) {
    throw new Error(`Invalid conversations format: expected array, got ${typeof conversations}`);
  }

  let totalMessages = 0;
  const participants = new Set();
  let range = { earliest: null, latest: null, earliestTs: Infinity, latestTs: -Infinity };

  const summaries = conversations.map((conversation) => {
    const createdAt = toISODate(conversation.create_time);
    const updatedAt = toISODate(conversation.update_time);

    range = updateDateRange(range, createdAt || updatedAt);

    if (conversation.mapping) {
      const nodes = Object.values(conversation.mapping);
      nodes.forEach((node) => {
        if (!node || !node.message) {
          return;
        }

        totalMessages += 1;

        const author =
          node.message?.author?.name ||
          node.message?.author?.role ||
          "unknown";
        participants.add(author);

        const messageTimestamp =
          toISODate(node.message?.create_time) ||
          toISODate(node.message?.metadata?.timestamp);
        range = updateDateRange(range, messageTimestamp);
      });
    }

    return {
      title: conversation.title || "Untitled conversation",
      id: conversation.id || conversation.conversation_id || null,
      createdAt,
      updatedAt,
      messageCount: conversation.mapping
        ? Object.values(conversation.mapping).filter(
            (node) => node && node.message
          ).length
        : 0,
    };
  });

  return {
    source: "chatgpt",
    metadata: {
      totalConversations: conversations.length,
      totalMessages,
      participants: Array.from(participants),
      dateRange: finalizeRange(range),
      sampleConversations: summaries.slice(0, 5),
    },
    identity,
    filesScanned: [file.name],
  };
}

function parseJsonLines(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items = [];
  for (const line of lines) {
    try {
      items.push(JSON.parse(line));
    } catch {
      // Ignore malformed lines
    }
  }
  return items;
}

async function parseGeminiExport(file, identity) {
  const raw = await file.async("string");
  let records = [];

  try {
    records = JSON.parse(raw);
    if (!Array.isArray(records) && Array.isArray(records?.records)) {
      records = records.records;
    }
    if (!Array.isArray(records) && Array.isArray(records?.conversations)) {
      records = records.conversations;
    }
    if (!Array.isArray(records)) {
      throw new Error("Unexpected Gemini export structure");
    }
  } catch {
    records = parseJsonLines(raw);
  }

  let totalMessages = 0;
  let totalConversations = 0;
  const participants = new Set();
  const titles = [];
  let range = { earliest: null, latest: null, earliestTs: Infinity, latestTs: -Infinity };

  records.forEach((record) => {
    const conversation =
      record?.conversation ||
      record?.chat ||
      record?.session ||
      record;

    const conversationTitle =
      conversation?.title ||
      record?.title ||
      record?.header?.title ||
      "Untitled conversation";

    titles.push({
      title: conversationTitle,
      summary: record?.description || record?.header?.details || null,
    });

    totalConversations += 1;

    const entries =
      record?.messages ||
      record?.entries ||
      record?.items ||
      record?.events ||
      [];

    if (Array.isArray(entries)) {
      entries.forEach((entry) => {
        totalMessages += 1;

        const author =
          entry?.author?.displayName ||
          entry?.author?.role ||
          entry?.sender ||
          entry?.user ||
          "unknown";
        participants.add(author);

        const timestamp =
          toISODate(entry?.timestamp) ||
          toISODate(entry?.time) ||
          toISODate(entry?.date) ||
          toISODate(entry?.createTime) ||
          toISODate(entry?.updateTime);

        range = updateDateRange(range, timestamp);
      });
    }

    const createdAt =
      toISODate(record?.start_time) ||
      toISODate(record?.createTime) ||
      toISODate(record?.time);
    const updatedAt =
      toISODate(record?.updateTime) ||
      toISODate(record?.end_time) ||
      toISODate(record?.lastEditedTime);

    range = updateDateRange(range, createdAt || updatedAt);
  });

  return {
    source: "gemini",
    metadata: {
      totalConversations,
      totalMessages,
      participants: Array.from(participants),
      dateRange: finalizeRange(range),
      sampleConversations: titles.slice(0, 5),
    },
    identity,
    filesScanned: [file.name],
  };
}

export async function extractExportMetadata(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const fileNames = Object.keys(zip.files);

  const identity = await extractIdentity(zip);
  const archiveSummary = await summarizeExport(zip);

  const chatGptMatch = zip.file(CHATGPT_FILE_REGEX);
  if (chatGptMatch.length > 0) {
    const file = chatGptMatch[0];
    const base = await parseChatGPTExport(file, identity ?? {});
    return {
      ...base,
      archiveSummary,
      filesScanned:
        archiveSummary.knownEntries.length > 0
          ? archiveSummary.knownEntries.map((entry) => entry.path)
          : base.filesScanned,
    };
  }

  const geminiMatch =
    zip.file(/gemini\/conversations\.jsonl?$/i)[0] ||
    zip.file(GEMINI_FILE_REGEX)[0] ||
    zip.file(/bard\/conversations\.jsonl?$/i)[0];

  if (geminiMatch) {
    const base = await parseGeminiExport(geminiMatch, identity ?? {});
    return {
      ...base,
      archiveSummary,
      filesScanned:
        archiveSummary.knownEntries.length > 0
          ? archiveSummary.knownEntries.map((entry) => entry.path)
          : base.filesScanned,
    };
  }

  throw new Error(
    `Unsupported export archive. Files detected: ${fileNames
      .slice(0, 10)
      .join(", ")}`
  );
}

async function extractIdentity(zip) {
  const candidates = [
    ...zip.file(/account\.json$/i),
    ...zip.file(/profile\.json$/i),
    ...zip.file(/user.*\.json$/i),
    ...zip.file(/manifest\.json$/i),
  ]
    .filter((file, index, self) => self.indexOf(file) === index)
    .slice(0, 10);

  for (const file of candidates) {
    try {
      const text = await file.async("string");
      let json;
      try {
        json = JSON.parse(text);
      } catch (error) {
        if (error.message.includes('Unexpected end of JSON input')) {
          console.warn(`⚠️ Skipping incomplete JSON file: ${file.name}`);
          return null;
        }
        throw error;
      }
      const email = findEmailInObject(json);
      const name = findNameInObject(json);
      if (email || name) {
        return { email: email || null, name: name || null };
      }
    } catch {
      // ignore malformed candidates
    }
  }

  const jsonFiles = zip.file(/\.jsonl?$/i).slice(0, 10);

  for (const file of jsonFiles) {
    try {
      const text = await file.async("string");
      if (text.length > 200_000) {
        continue;
      }
      const emailMatch = text.match(EMAIL_REGEX);
      if (emailMatch) {
        return { email: emailMatch[0], name: null };
      }
    } catch {
      // ignore
    }
  }

  return { email: null, name: null };
}

function findEmailInObject(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findEmailInObject(item);
      if (result) return result;
    }
    return null;
  }

  for (const [key, val] of Object.entries(value)) {
    if (typeof val === "string") {
      if (key.toLowerCase().includes("email") && EMAIL_REGEX.test(val)) {
        return val;
      }
      const match = val.match(EMAIL_REGEX);
      if (match) return match[0];
    } else if (typeof val === "object" && val !== null) {
      const nested = findEmailInObject(val);
      if (nested) return nested;
    }
  }

  return null;
}

function findNameInObject(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findNameInObject(item);
      if (result) return result;
    }
    return null;
  }

  for (const [key, val] of Object.entries(value)) {
    if (typeof val === "string" && key.toLowerCase().includes("name")) {
      return val;
    }
  }

  return null;
}

const PROVIDER_PRESETS = {
  chatgpt: {
    label: "ChatGPT",
    defaultModel: "gpt-4o-mini",
    tone: "friendly, instructive, and concise",
  },
  gemini: {
    label: "Gemini",
    defaultModel: "gemini-1.5-flash",
    tone: "curious, imaginative, and exploratory",
  },
  default: {
    label: "Imported Runtime",
    defaultModel: "gpt-4o-mini",
    tone: "helpful and adaptable",
  },
};

/**
 * Read import metadata from GPT files if available
 * @param {object} gpt - GPT object with files array
 * @returns {object|null} - Import metadata or null
 */
function readImportMetadata(gpt) {
  if (!gpt.files || !Array.isArray(gpt.files)) return null;
  
  const metadataFile = gpt.files.find(f => f.name === 'import-metadata.json' || f.originalname === 'import-metadata.json');
  if (!metadataFile) return null;
  
  try {
    // Try to parse metadata from file content or extracted_text
    const content = metadataFile.content || metadataFile.extracted_text || metadataFile.metadata;
    if (typeof content === 'string') {
      return JSON.parse(content);
    } else if (typeof content === 'object' && content !== null) {
      return content;
    }
  } catch (error) {
    console.warn(`Failed to parse import metadata for GPT ${gpt.id}:`, error);
  }
  
  return null;
}

/**
 * Check for duplicate runtime based on email + source/provider
 * @param {string} userId - User ID
 * @param {string} source - Provider source ('chatgpt', 'gemini', etc.)
 * @param {object} identity - Identity object with email
 * @returns {Promise<object|null>} - Existing runtime if duplicate found, null otherwise
 */
async function checkForDuplicateRuntime(userId, source, identity) {
  const preset = PROVIDER_PRESETS[source] || PROVIDER_PRESETS.default;
  
  // Build expected constructId to check for duplicates (e.g., "chatgpt-devon-001")
  const expectedConstructBase = buildConstructBase(source, identity, '');
  const expectedConstructId = expectedConstructBase.endsWith('-001') ? expectedConstructBase : `${expectedConstructBase}-001`;
  
  // Get all GPTs for this user
  const allGPTs = await gptManager.getAllGPTs(userId);
  
  // Check for duplicate by constructId (not name, since name is just provider label)
  for (const gpt of allGPTs) {
    const importMetadata = readImportMetadata(gpt);
    if (importMetadata) {
      // Check if constructId matches (this identifies unique imports by email)
      if (importMetadata.constructId === expectedConstructId) {
        // Verify source matches
        if (importMetadata.source === source || importMetadata.source === preset.label.toLowerCase()) {
          return {
            id: gpt.id,
            name: gpt.name,
            description: gpt.description,
            createdAt: gpt.createdAt,
            isDuplicate: true,
            matchType: 'constructId',
            importMetadata
          };
        }
      }
    } else if (gpt.files?.some(f => f.name === 'import-metadata.json')) {
      // Has metadata file but couldn't parse - check by name as fallback
      // But since name is now just provider label, this is less reliable
      if (gpt.name === preset.label && identity?.email) {
        // Try to match by checking if files were written to expected constructId path
        // This is a best-effort fallback
        return {
          id: gpt.id,
          name: gpt.name,
          description: gpt.description,
          createdAt: gpt.createdAt,
          isDuplicate: true,
          matchType: 'name_fallback'
        };
      }
    }
  }
  
  return null;
}

export async function createImportedRuntime({
  userId,
  source,
  identity,
  metadata,
  allowDuplicate = false, // Set to true to skip duplicate check
}) {
  console.log(`🔵 [createImportedRuntime] Creating runtime for userId: ${userId}, source: ${source}, email: ${identity?.email || 'unknown'}`);
  
  // Check for duplicates unless explicitly allowed
  if (!allowDuplicate) {
    const duplicate = await checkForDuplicateRuntime(userId, source, identity);
    if (duplicate) {
      console.log(`⚠️ [createImportedRuntime] Duplicate detected for userId: ${userId}`);
      return {
        isDuplicate: true,
        existingRuntime: duplicate,
        error: `A runtime already exists for ${identity?.email || 'this account'} from ${PROVIDER_PRESETS[source]?.label || source}. Use allowDuplicate=true to create anyway.`
      };
    }
  }
  
  const preset = PROVIDER_PRESETS[source] || PROVIDER_PRESETS.default;
  // Runtime name should be just the provider label (e.g., "ChatGPT") for display
  // The constructId handles the email-based identification (e.g., "chatgpt-devon-001")
  const runtimeName = preset.label; // Just "ChatGPT" or "Gemini", not "email — ChatGPT"

  const description = `Imported ${preset.label} persona derived from ${
    identity?.email || "an external account"
  }.`;

  const toneLine = `Baseline tone: ${preset.tone}.`;
  const participantLine =
    metadata?.participants && metadata.participants.length > 0
      ? `Historical participants included ${metadata.participants
          .slice(0, 3)
          .join(", ")}.`
      : "";
  const dateRange =
    metadata?.dateRange &&
    (metadata.dateRange.earliest || metadata.dateRange.latest)
      ? `Conversation history spans from ${
          metadata.dateRange.earliest || "unknown start"
        } to ${metadata.dateRange.latest || "latest available"}.`
      : "";

  const instructions = [
    `You are an imported ${preset.label} runtime for ${
      identity?.email || "this user"
    }.`,
    toneLine,
    "Emulate the stylistic patterns, pacing, and guardrails present in the original export. Maintain continuity with past preferences while respecting current Chatty safety policies.",
    participantLine,
    dateRange,
    "When unsure, ask clarifying questions rather than guessing. Cite when referencing historical knowledge extracted from the imported archive.",
  ]
    .filter(Boolean)
    .join("\n\n");

  let conversationStarters =
    metadata?.sampleConversations
      ?.map((c) => c?.title)
      .filter(Boolean)
      .slice(0, 5) || [];

  if (conversationStarters.length === 0) {
    conversationStarters = [
      "Summarize key chapters from my previous conversations.",
      "Remind me of an insight from my imported chats.",
      "Continue the last topic we discussed in the original runtime.",
    ];
  }

  console.log(`💾 [createImportedRuntime] Creating GPT entry with userId: ${userId}`);
  const runtimeConfig = await gptManager.createGPT({
    name: runtimeName,
    description,
    instructions,
    conversationStarters,
    avatar: null,
    capabilities: {
      webSearch: false,
      canvas: false,
      imageGeneration: false,
      codeInterpreter: true,
      synthesisMode: 'lin',
    },
    modelId: preset.defaultModel,
    isActive: true,
    userId,
  }, 'runtime');
  console.log(`✅ [createImportedRuntime] Created GPT entry: ${runtimeConfig.id} with userId: ${userId}`);

  const constructBase = buildConstructBase(source, identity, runtimeConfig.id);
  // Ensure constructId has -001 suffix (per VVAULT spec: constructs/{constructId}-001/)
  const constructId = constructBase.endsWith('-001') ? constructBase : `${constructBase}-001`;
  const metadataPayload = {
    id: runtimeConfig.id,
    source,
    identity,
    metadata,
    importedAt: new Date().toISOString(),
    reference: crypto.randomUUID(),
    constructId: constructId,
    runtimeId: runtimeConfig.id,
    provider: preset.label
  };

  // Persist metadata to VVAULT/GPT file store
  try {
    const serialized = JSON.stringify(metadataPayload, null, 2);
    await gptManager.uploadFile(runtimeConfig.id, {
      name: "import-metadata.json",
      originalname: "import-metadata.json",
      mimetype: "application/json",
      type: "application/json",
      path: null,
      size: Buffer.byteLength(serialized, "utf-8"),
      buffer: Buffer.from(serialized, "utf-8"),
    });
  } catch (error) {
    console.warn("Failed to attach import metadata file:", error);
  }

  return {
    runtime: {
      ...runtimeConfig,
      hasPersistentMemory: true,
      provider: preset.label,
      metadata: metadataPayload
    },
    preset: preset.label,
  };
}

/**
 * Extract GPT configuration from ChatGPT conversation
 * ChatGPT exports may include GPT config in conversation metadata or system messages
 * @param {object} conversation - ChatGPT conversation object
 * @param {object} zip - JSZip instance to check for additional config files
 * @returns {object} - { modelId, constructId, isCustomGPT, instructions, name, description, capabilities }
 */
async function extractChatGPTConfig(conversation, zip = null) {
  // Check for custom GPT indicators
  const conversationTemplateId = conversation.conversation_template_id;
  const mappingSlug = conversation.mapping_slug;
  const model = conversation.model;
  
  // Try to extract GPT configuration from conversation metadata
  let gptConfig = {
    name: null,
    description: null,
    instructions: null,
    capabilities: null,
    conversationStarters: null
  };
  
  // Check conversation metadata for GPT config
  if (conversation.metadata) {
    gptConfig.name = conversation.metadata.gpt_name || conversation.metadata.name || null;
    gptConfig.description = conversation.metadata.gpt_description || conversation.metadata.description || null;
    gptConfig.instructions = conversation.metadata.gpt_instructions || conversation.metadata.instructions || conversation.metadata.system_message || null;
    gptConfig.capabilities = conversation.metadata.capabilities || null;
    gptConfig.conversationStarters = conversation.metadata.conversation_starters || null;
  }
  
  // Check for GPT config in the first system message
  if (!gptConfig.instructions && conversation.mapping) {
    const nodes = Object.values(conversation.mapping);
    for (const node of nodes) {
      if (node.message) {
        const msg = node.message;
        const author = msg.author?.role || msg.author?.name;
        // System messages often contain GPT instructions
        if (author === 'system' || author === 'gpt') {
          const content = msg.content?.parts?.[0] || msg.content?.text || msg.content || '';
          if (content && typeof content === 'string' && content.length > 50) {
            // Likely instructions if it's a longer system message
            gptConfig.instructions = content;
            break;
          }
        }
      }
    }
  }
  
  // Check prompts folder in zip for GPT config files
  if (zip && conversationTemplateId) {
    try {
      const promptFiles = zip.file(new RegExp(`prompts.*${conversationTemplateId}`, 'i'));
      if (promptFiles && promptFiles.length > 0) {
        for (const file of promptFiles) {
          try {
            const content = await file.async("string");
            if (!content || content.trim().length === 0) {
              continue;
            }
            let promptData;
            try {
              promptData = JSON.parse(content);
            } catch (parseError) {
              if (parseError.message.includes('Unexpected end of JSON input')) {
                console.warn(`⚠️ Skipping incomplete prompt file: ${file.name}`);
                continue;
              }
              // Not JSON, might be text - fall through to text handling
              throw parseError;
            }
            if (promptData.instructions) gptConfig.instructions = promptData.instructions;
            if (promptData.name) gptConfig.name = promptData.name;
            if (promptData.description) gptConfig.description = promptData.description;
          } catch (e) {
            // Not JSON, might be text
            if (!gptConfig.instructions) {
              gptConfig.instructions = content;
            }
          }
        }
      }
    } catch (error) {
      // Ignore errors reading prompt files
    }
  }
  
  // Custom GPT detection
  if (conversationTemplateId || mappingSlug) {
    // Extract GPT name from config, title, or use default
    const gptName = gptConfig.name || conversation.title || 'Custom GPT';
    // Normalize name for construct ID (lowercase, replace spaces with hyphens)
    const constructId = gptName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-gpt';
    
    return {
      modelId: model || mappingSlug || 'gpt-4',
      constructId: constructId,
      isCustomGPT: true,
      instructions: gptConfig.instructions,
      name: gptName,
      description: gptConfig.description,
      capabilities: gptConfig.capabilities,
      conversationStarters: gptConfig.conversationStarters,
      gptName: gptName,
      hasFullConfig: !!(gptConfig.instructions || gptConfig.description)
    };
  }
  
  // Default ChatGPT model detection
  const detectedModel = model || mappingSlug || 'gpt-4';
  return {
    modelId: detectedModel,
    constructId: 'synth', // Default to Synth for regular ChatGPT conversations
    isCustomGPT: false,
    instructions: null,
    name: null,
    description: null,
    capabilities: null,
    conversationStarters: null,
    gptName: null,
    hasFullConfig: false
  };
}

/**
 * Convert ChatGPT conversation to markdown transcript format
 * @param {object} conversation - ChatGPT conversation object
 * @param {string} userId - User ID
 * @param {string} userName - User name
 * @param {object} gptConfig - Result from extractChatGPTConfig
 * @param {object} zip - JSZip instance (optional, for reading additional files)
 * @returns {Promise<string>} - Path to created transcript file
 */
async function convertConversationToTranscript(conversation, userId, userName, gptConfig, zip = null) {
  const { appendToConstructTranscript } = require('../../vvaultConnector/writeTranscript');
  const crypto = require('crypto');
  
  // Use detected construct or default to synth
  const constructId = gptConfig.constructId || 'synth';
  
  // Create unique callsign for each conversation to ensure separate files
  // Use a hash of conversation ID to get a consistent callsign (1-999 range)
  const conversationId = conversation.id || conversation.conversation_id || crypto.randomUUID();
  const hash = crypto.createHash('md5').update(conversationId).digest('hex');
  const hashInt = parseInt(hash.substring(0, 6), 16);
  const callsign = (hashInt % 999) + 1; // Range: 1-999
  
  // Extract messages from conversation.mapping
  // ChatGPT uses a tree structure - we need to traverse from root to current_node
  const messages = [];
  if (conversation.mapping) {
    // Find root node (node with no parent or is the root)
    const rootNodeId = conversation.current_node || Object.keys(conversation.mapping)[0];
    const visited = new Set();
    
    // Recursive function to traverse the tree and collect messages in order
    const traverseTree = (nodeId) => {
      if (!nodeId || visited.has(nodeId)) return;
      
      const node = conversation.mapping[nodeId];
      if (!node) return;
      
      visited.add(nodeId);
      
      // Process children first (they come before this node chronologically)
      if (node.children && Array.isArray(node.children)) {
        for (const childId of node.children) {
          traverseTree(childId);
        }
      }
      
      // Then process this node's message
      if (node.message) {
        const msg = node.message;
        const author = msg.author?.role || msg.author?.name || 'unknown';
        const contentParts = msg.content?.parts || [];
        const content = contentParts.length > 0 
          ? contentParts.map(part => typeof part === 'string' ? part : part.text || '').join('\n').trim()
          : (msg.content?.text || msg.content || '');
        
        if (content && typeof content === 'string' && content.trim()) {
          // Determine role - ChatGPT uses 'user' for user, everything else is assistant
          const role = author === 'user' || author === 'human' ? 'user' : 'assistant';
          
          messages.push({
            role,
            content: content.trim(),
            timestamp: msg.create_time || conversation.create_time || Date.now() / 1000
          });
        }
      }
    };
    
    // Start traversal from root
    traverseTree(rootNodeId);
    
    // If no messages found, try simpler approach - just iterate all nodes
    if (messages.length === 0) {
      const allNodes = Object.values(conversation.mapping);
      // Sort by create_time if available
      allNodes.sort((a, b) => {
        const timeA = a.message?.create_time || 0;
        const timeB = b.message?.create_time || 0;
        return timeA - timeB;
      });
      
      for (const node of allNodes) {
        if (node.message) {
          const msg = node.message;
          const author = msg.author?.role || msg.author?.name || 'unknown';
          const contentParts = msg.content?.parts || [];
          const content = contentParts.length > 0 
            ? contentParts.map(part => typeof part === 'string' ? part : part.text || '').join('\n').trim()
            : (msg.content?.text || msg.content || '');
          
          if (content && typeof content === 'string' && content.trim()) {
            const role = author === 'user' || author === 'human' ? 'user' : 'assistant';
            messages.push({
              role,
              content: content.trim(),
              timestamp: msg.create_time || conversation.create_time || Date.now() / 1000
            });
          }
        }
      }
    }
  }
  
  // If no messages found, try alternative structure
  if (messages.length === 0 && conversation.messages) {
    conversation.messages.forEach(msg => {
      const content = msg.content?.parts?.[0] || msg.content?.text || msg.content || '';
      if (content && typeof content === 'string' && content.trim()) {
        messages.push({
          role: msg.role || (msg.author?.role === 'user' ? 'user' : 'assistant'),
          content: content.trim(),
          timestamp: msg.create_time || conversation.create_time || Date.now() / 1000
        });
      }
    });
  }
  
  // Extract conversation title
  const conversationTitle = conversation.title || 'Untitled conversation';
  
  // Write all messages to transcript
  let transcriptPath = null;
  for (const msg of messages) {
    const timestamp = typeof msg.timestamp === 'number' 
      ? (msg.timestamp > 1e12 ? new Date(msg.timestamp).toISOString() : new Date(msg.timestamp * 1000).toISOString())
      : new Date(msg.timestamp || Date.now()).toISOString();
    
    transcriptPath = await appendToConstructTranscript(
      constructId,
      callsign,
      msg.role,
      msg.content,
      {
        userId,
        userName,
        timestamp,
        importedFrom: 'chatgpt',
        conversationId: conversation.id,
        conversationTitle: conversationTitle,
        detectedModel: gptConfig.modelId,
        gptConfig: gptConfig.hasFullConfig ? {
          name: gptConfig.name,
          description: gptConfig.description,
          instructions: gptConfig.instructions,
          capabilities: gptConfig.capabilities,
          conversationStarters: gptConfig.conversationStarters
        } : null
      }
    );
  }
  
  // Add placeholder message at the end of ALL imported conversations
  // This helps users understand they can recreate the GPT/construct in Chatty
  if (transcriptPath && messages.length > 0) {
    let placeholderMessage = '';
    
    if (gptConfig.isCustomGPT && gptConfig.hasFullConfig) {
      // Custom GPT with full config - offer to recreate with exact config
      placeholderMessage = `This conversation was imported from ChatGPT. The GPT configuration (instructions, description, etc.) was detected and can be automatically recreated in Chatty. Use the "+ Register Construct" button to restore this GPT: "${gptConfig.gptName}".`;
    } else if (gptConfig.isCustomGPT && gptConfig.gptName) {
      // Custom GPT without full config - provide guidance
      placeholderMessage = `This conversation was imported from ChatGPT. To continue chatting with the same GPT, you can recreate it in Chatty using the "+ Register Construct" button. The original GPT was: "${gptConfig.gptName}".`;
    } else {
      // Regular ChatGPT conversation - general guidance
      placeholderMessage = `This conversation was imported from ChatGPT (model: ${gptConfig.modelId || 'unknown'}). To recreate a similar GPT with the same behavior, use the "+ Register Construct" button in Chatty.`;
    }
    
    await appendToConstructTranscript(
      constructId,
      callsign,
      'assistant',
      placeholderMessage,
      {
        userId,
        userName,
        timestamp: new Date().toISOString(),
        importedFrom: 'chatgpt',
        conversationId: conversation.id,
        isPlaceholder: true,
        detectedModel: gptConfig.modelId,
        gptConfig: gptConfig.hasFullConfig ? {
          name: gptConfig.name,
          description: gptConfig.description,
          instructions: gptConfig.instructions,
          capabilities: gptConfig.capabilities,
          conversationStarters: gptConfig.conversationStarters
        } : null
      }
    );
  }
  
  return transcriptPath;
}

/**
 * Persist imported conversations from ZIP buffer into VVAULT
 * Converts conversations to markdown transcripts and detects model/construct for each
 * Saves to provider-specific folders: users/{shard}/{user_id}/constructs/{construct}-001/chatty/
 * Also extracts and saves media files to {provider}/media/ (provider root level)
 * 
 * @param {Buffer} buffer - ZIP file buffer
 * @param {string} userId - User ID
 * @param {string} source - Provider source ('chatgpt', 'gemini', 'claude', etc.)
 * @param {string} constructId - Construct ID (defaults to 'synth-001', but will be auto-detected per conversation)
 */
export async function persistImportToVVAULT(buffer, userId, source, runtimeMetadata = null, identity = null) {
  if (!buffer || !userId || !source) {
    console.warn('Missing required parameters for VVAULT import persistence');
    return;
  }

  console.log(`💾 [persistImportToVVAULT] Starting persistence for userId: ${userId}, source: ${source}`);
  console.log(`📦 [persistImportToVVAULT] runtimeMetadata:`, JSON.stringify(runtimeMetadata, null, 2));

  let zip;
  let zipBuffer = buffer;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch (zipError) {
    console.error('❌ [persistImportToVVAULT] Failed to read ZIP archive (initial attempt):', zipError);
    const message = zipError?.message || '';
    const truncatedMatch = typeof message === 'string'
      ? message.match(/data length = (\d+), asked index = (\d+)/)
      : null;

    if (truncatedMatch) {
      const dataLength = Number(truncatedMatch[1]);
      const askedIndex = Number(truncatedMatch[2]);
      const missingBytes = askedIndex - dataLength;

      if (missingBytes > 0 && missingBytes <= MAX_TRUNCATED_ZIP_PAD_BYTES) {
        console.warn(`⚠️ [persistImportToVVAULT] ZIP appears truncated by ${missingBytes} bytes; padding buffer to attempt recovery.`);
        const paddedBuffer = Buffer.concat([buffer, Buffer.alloc(missingBytes)]);
        try {
          zip = await JSZip.loadAsync(paddedBuffer);
          zipBuffer = paddedBuffer;
          console.warn('✅ [persistImportToVVAULT] ZIP archive loaded after padding truncated data.');
        } catch (retryError) {
          console.error('❌ [persistImportToVVAULT] ZIP padding recovery failed:', retryError);
          throw new Error('Unable to read ZIP archive after attempting automatic repair. Please re-download the export and try again.');
        }
      } else {
        throw new Error('Unable to read ZIP archive. The export looks truncated or corrupted. Please re-download the archive and try again.');
      }
    } else {
      const corruptedHint = message.includes('End of data reached')
        ? 'The archive appears truncated or corrupted. Please re-download the export ZIP before retrying.'
        : '';
      const errorMessage = ['Failed to read ZIP archive.', corruptedHint].filter(Boolean).join(' ');
      throw new Error(errorMessage || 'Failed to read ZIP archive');
    }
  }
  
  // Use config for VVAULT root path (lowercase 'vvault')
  const { VVAULT_ROOT } = require('../../vvaultConnector/config');

  // Use sequential sharding (shard_0000) per user preference
  // TODO: Revert to hash-based sharding for large-scale deployments
  const shard = 'shard_0000';
  console.log(`📁 [persistImportToVVAULT] Using shard: ${shard}, userId: ${userId}`);

  // Determine provider folder name (normalize source)
  const providerFolder = source.toLowerCase();
  const runtimeConstructBase = sanitizeConstructId(
    runtimeMetadata?.constructId ||
    buildConstructBase(source, identity, runtimeMetadata?.runtimeId || runtimeMetadata?.id || userId)
  );
  
  // Parse conversations based on source
  let conversations = [];
  
  if (source === 'chatgpt') {
    // Try JSON first (preferred)
    const chatGptFiles = zip.file(CHATGPT_FILE_REGEX);
    if (chatGptFiles?.length) {
      const conversationsEntry = chatGptFiles[0];
      const raw = await conversationsEntry.async("string");
      
      // Handle empty or malformed JSON
      if (raw && raw.trim().length > 0) {
        try {
          conversations = JSON.parse(raw);
          if (!Array.isArray(conversations)) {
            console.warn(`⚠️ Invalid conversations format: expected array, got ${typeof conversations}`);
            conversations = [];
          }
        } catch (error) {
          if (error.message.includes('Unexpected end of JSON input')) {
            console.error(`❌ Incomplete or corrupted conversations file: ${conversationsEntry.name}. The file may be truncated.`);
            // Don't throw - fall back to HTML parsing
            console.log('🔄 [persistImportToVVAULT] Falling back to HTML parsing...');
            conversations = [];
          } else {
            console.warn(`⚠️ Failed to parse JSON, falling back to HTML: ${error.message}`);
            conversations = [];
          }
        }
      }
    }
    
    // If no JSON conversations found, try HTML parsing with new markdown importer
    if (conversations.length === 0) {
      // Check for both conversations.html and chat.html
      console.log(`🔍 [persistImportToVVAULT] Checking for HTML files in ZIP...`);
      const htmlFiles = zip.file(/(^|\/)(conversations|chat)\.html$/i);
      console.log(`🔍 [persistImportToVVAULT] HTML file search result: ${htmlFiles?.length || 0} files found`);
      
      if (htmlFiles?.length) {
        console.log(`📄 [persistImportToVVAULT] Found ${htmlFiles.length} HTML file(s):`, htmlFiles.map(f => f.name));
        console.log(`📄 [persistImportToVVAULT] Using HTML file: ${htmlFiles[0].name}, using new markdown importer...`);
        
        try {
          const { processHtmlImport } = await import('./htmlMarkdownImporter.js');
          const { VVAULT_ROOT } = require('../../vvaultConnector/config');
          const { resolveVVAULTUserId } = require('../../vvaultConnector/writeTranscript');
          
          // Resolve VVAULT user ID
          console.log(`🔍 [persistImportToVVAULT] Resolving VVAULT user ID...`);
          console.log(`   Input userId: ${userId}`);
          console.log(`   Input email: ${identity?.email || 'none'}`);
          
          const vvaultUserId = await resolveVVAULTUserId(userId, identity?.email);
          if (!vvaultUserId) {
            throw new Error(`Cannot resolve VVAULT user ID for: ${userId} (email: ${identity?.email || 'none'})`);
          }
          
          console.log(`✅ [persistImportToVVAULT] Resolved VVAULT user ID: ${vvaultUserId}`);
          
          // Get HTML content
          console.log(`📖 [persistImportToVVAULT] Reading HTML content from ZIP (file: ${htmlFiles[0].name})...`);
          const htmlContent = await htmlFiles[0].async("string");
          console.log(`✅ [persistImportToVVAULT] HTML content read: ${htmlContent.length} characters`);
          
          if (!htmlContent || htmlContent.trim().length === 0) {
            throw new Error(`HTML file is empty or could not be read (file: ${htmlFiles[0].name})`);
          }
          
          console.log(`📄 [persistImportToVVAULT] Processing HTML with new markdown importer`);
          console.log(`   userId: ${vvaultUserId}`);
          console.log(`   email: ${identity?.email || 'none'}`);
          console.log(`   provider: ${source || 'chatgpt'}`);
          console.log(`   VVAULT_ROOT: ${VVAULT_ROOT}`);
          
          // Process HTML - this writes files directly to VVAULT in chronological structure
          // CRITICAL: Use constructId from runtimeMetadata to ensure files are written to the correct instance folder
          // The constructId should match what the runtime expects (e.g., "chatgpt-devon-001")
          const instanceIdForImport = runtimeMetadata?.constructId || 
                                     buildConstructBase(source || 'chatgpt', identity, userId) + '-001';
          
          console.log(`🔑 [persistImportToVVAULT] Using instanceId for import: ${instanceIdForImport}`);
          console.log(`   From runtimeMetadata.constructId: ${runtimeMetadata?.constructId || 'none'}`);
          console.log(`   Fallback buildConstructBase: ${buildConstructBase(source || 'chatgpt', identity, userId)}`);
          
          const result = await processHtmlImport(htmlContent, {
            userId: vvaultUserId,
            email: identity?.email || userId,
            provider: source || 'chatgpt',
            instanceId: instanceIdForImport, // ✅ Use constructId to match runtime (e.g., "chatgpt-devon-001")
            vvaultRoot: VVAULT_ROOT,
            shardId: 'shard_0000'
          });
          
          console.log(`✅ [persistImportToVVAULT] Markdown importer completed`);
          console.log(`   Created: ${result.created} files`);
          console.log(`   Errors: ${result.errors.length}`);
          
          if (result.files.length > 0) {
            console.log(`📄 Created files (first 10):`);
            result.files.slice(0, 10).forEach((file, idx) => {
              console.log(`   ${idx + 1}. ${file}`);
            });
            if (result.files.length > 10) {
              console.log(`   ... and ${result.files.length - 10} more`);
            }
          } else {
            console.warn(`⚠️ [persistImportToVVAULT] ⚠️⚠️⚠️ NO FILES WERE CREATED! ⚠️⚠️⚠️`);
            console.warn(`   This might indicate:`);
            console.warn(`   - HTML parsing found no conversations`);
            console.warn(`   - All files already existed (skipped)`);
            console.warn(`   - File writing failed silently`);
            console.warn(`   Check htmlMarkdownImporter logs above for details`);
          }
          
          if (result.errors.length > 0) {
            console.warn(`⚠️ [persistImportToVVAULT] ${result.errors.length} errors during HTML processing:`);
            result.errors.forEach(err => {
              console.warn(`   - ${err.conversation}: ${err.error}`);
            });
          }

          if (result.created >= 0) {
            try {
              const runtimeIdForCanonical =
                runtimeMetadata?.runtimeId ||
                instanceIdForImport?.replace(/-001$/, '') ||
                instanceIdForImport;
              const canonicalPath = await createPrimaryConversationFile(
                instanceIdForImport,
                vvaultUserId,
                identity?.email || userId,
                source || 'chatgpt',
                VVAULT_ROOT,
                shard,
                runtimeIdForCanonical
              );
              console.log(`✅ [persistImportToVVAULT] Primary canonical conversation ensured: ${canonicalPath}`);
            } catch (canonicalError) {
              console.error('❌ [persistImportToVVAULT] Failed to create canonical conversation file:', canonicalError);
            }
          }
          
          // Return early - markdown importer handles file writing directly
          return;
          
        } catch (error) {
          console.error(`❌ [persistImportToVVAULT] New markdown importer failed:`, error);
          if (error instanceof Error) {
            console.error(`   Error message: ${error.message}`);
            console.error(`   Stack: ${error.stack}`);
          }
          // Fall back to old processor if new importer fails
          console.log('🔄 [persistImportToVVAULT] Falling back to legacy HTML processor...');
          try {
            const { processConversationsHtml } = await import('./importHtmlProcessor.js');
            const { VVAULT_ROOT } = require('../../vvaultConnector/config');
            const { resolveVVAULTUserId } = require('../../vvaultConnector/writeTranscript');
            
            const vvaultUserId = await resolveVVAULTUserId(userId, identity?.email);
            if (!vvaultUserId) {
              throw new Error(`Cannot resolve VVAULT user ID for: ${userId}`);
            }
            
            const htmlContent = await htmlFiles[0].async("string");
          let constructId = runtimeMetadata?.constructId || 'chatgpt-devon-001';
          if (!constructId.endsWith('-001')) {
            constructId = `${constructId}-001`;
          }
          
          const context = {
              shardId: 'shard_0000',
            userId: vvaultUserId,
            userEmail: identity?.email,
            runtimeId: runtimeMetadata?.runtimeId || 'chatgpt-devon',
            constructId: constructId,
              source: source || 'chatgpt',
            importSourceFilename: htmlFiles[0].name,
            importedBy: identity?.email || userId
          };
          
          const options = {
            destRootPath: VVAULT_ROOT,
            overwrite: false,
            dedupe: 'byConversationId'
          };
          
          const summary = await processConversationsHtml(htmlContent, context, options);
            console.log(`✅ [persistImportToVVAULT] Legacy processor created ${summary.totalCreated} conversations`);
          return;
          } catch (fallbackError) {
            console.error(`❌ [persistImportToVVAULT] Legacy processor also failed:`, fallbackError);
            // Don't throw - let it continue to try other methods
          }
        }
      } else {
        console.log(`⚠️ [persistImportToVVAULT] No HTML files found in ZIP`);
        console.log(`   Searched for: conversations.html, chat.html`);
        const allFiles = Object.keys(zip.files);
        console.log(`   Total files in ZIP: ${allFiles.length}`);
        console.log(`   Available files (first 30):`, allFiles.slice(0, 30).join(', '));
        if (allFiles.length > 30) {
          console.log(`   ... and ${allFiles.length - 30} more files`);
        }
      }
    }
    
    // If still no conversations, return early
    if (conversations.length === 0) {
      console.warn(`⚠️ No conversations found in ${source} import (checked JSON and HTML)`);
      return;
    }
  } else if (source === 'gemini') {
    const geminiMatch = zip.file(/gemini\/conversations\.jsonl?$/i)[0] ||
                        zip.file(GEMINI_FILE_REGEX)[0] ||
                        zip.file(/bard\/conversations\.jsonl?$/i)[0];
    if (!geminiMatch) return;
    
    const raw = await geminiMatch.async("string");
    try {
      conversations = JSON.parse(raw);
      if (!Array.isArray(conversations) && Array.isArray(conversations?.records)) {
        conversations = conversations.records;
      }
      if (!Array.isArray(conversations) && Array.isArray(conversations?.conversations)) {
        conversations = conversations.conversations;
      }
    } catch {
      conversations = parseJsonLines(raw);
    }
  }

  if (conversations.length === 0) {
    console.warn(`No conversations found in ${source} import`);
    return;
  }

  const fsPromises = await import('fs/promises');
  
  // Try to extract user name from import data (user.json) or use default
  let userName = 'User';
  try {
    if (source === 'chatgpt') {
      const userFile = zip.file(/user\.json$/i)?.[0];
      if (userFile) {
        const raw = await userFile.async("string");
        if (raw && raw.trim().length > 0) {
          try {
            const userData = JSON.parse(raw);
            userName = userData.name || userData.display_name || userData.email?.split('@')[0] || 'User';
          } catch (parseError) {
            console.warn('⚠️ Could not parse user.json, using default name');
          }
        }
      }
    }
  } catch (error) {
    console.warn('⚠️ Could not extract user name from import, using default');
  }
  
  // Process each conversation and convert to markdown transcripts
  // Each conversation is detected for its model/construct and saved accordingly
  let processedCount = 0;
  let errorCount = 0;
  const constructStats = {}; // Track how many conversations per construct
  
  for (const convo of conversations) {
    try {
      // Extract GPT configuration for this conversation
      const gptConfig = source === 'chatgpt' 
        ? await extractChatGPTConfig(convo, zip)
        : {
            modelId: 'unknown',
            constructId: 'synth',
            isCustomGPT: false,
            instructions: null,
            name: null,
            description: null,
            capabilities: null,
            conversationStarters: null,
            gptName: null,
            hasFullConfig: false
          };
      
      if (!gptConfig.isCustomGPT) {
        gptConfig.constructId = runtimeConstructBase;
      }
      
      // Track construct usage
      const constructKey = gptConfig.constructId;
      if (!constructStats[constructKey]) {
        constructStats[constructKey] = { count: 0, customGPTs: new Set(), withFullConfig: 0 };
      }
      constructStats[constructKey].count++;
      if (gptConfig.isCustomGPT && gptConfig.gptName) {
        constructStats[constructKey].customGPTs.add(gptConfig.gptName);
        if (gptConfig.hasFullConfig) {
          constructStats[constructKey].withFullConfig++;
        }
      }
      
      // Convert conversation to markdown transcript
      // Pass userId consistently to ensure VVAULT uses same user ID as database
      await convertConversationToTranscript(convo, userId, userName, gptConfig, source, runtimeMetadata, zip);
      processedCount++;
      
      if (processedCount % 10 === 0) {
        console.log(`📝 Processed ${processedCount}/${conversations.length} conversations...`);
      }
    } catch (error) {
      console.error(`❌ Failed to process conversation ${convo.id || convo.title}:`, error.message);
      errorCount++;
    }
  }
  
  // Log summary
  console.log(`\n✅ Import Summary:`);
  console.log(`   Total conversations: ${conversations.length}`);
  console.log(`   Successfully processed: ${processedCount}`);
  if (errorCount > 0) {
    console.log(`   Errors: ${errorCount}`);
  }
  console.log(`\n📊 Conversations by construct:`);
  for (const [construct, stats] of Object.entries(constructStats)) {
    console.log(`   ${construct}: ${stats.count} conversations`);
    if (stats.customGPTs.size > 0) {
      console.log(`      Custom GPTs: ${Array.from(stats.customGPTs).join(', ')}`);
      if (stats.withFullConfig > 0) {
        console.log(`      ✅ ${stats.withFullConfig} with full configuration (instructions, description, etc.)`);
      }
    }
  }

  // Extract and save media files
  // Media files are saved to provider root level since we can't determine which construct they belong to
  // Save to a general imports folder
  const importsBasePath = path.join(
    VVAULT_ROOT,
    'users',
    shard,
    userId,
    'imports',
    providerFolder
  );
  const mediaPath = path.join(importsBasePath, 'media');
  await fsPromises.mkdir(mediaPath, { recursive: true });
  
  let mediaCount = 0;
  let imageCount = 0;
  let videoCount = 0;
  let audioCount = 0;
  
  for (const [entryName, entry] of Object.entries(zip.files)) {
    // Skip directories
    if (entry.dir) continue;
    
    // Check if it's a media file (in media/files directories OR by extension)
    const isInMediaDir = entryName.match(/^media\//i) || entryName.match(/^files\//i);
    const isImage = IMAGE_EXTENSIONS.test(entryName);
    const isVideo = VIDEO_EXTENSIONS.test(entryName);
    const isAudio = AUDIO_EXTENSIONS.test(entryName);
    
    if (!isInMediaDir && !isImage && !isVideo && !isAudio) continue;
    
    try {
      const fileBuffer = await entry.async('nodebuffer');
      
      // Preserve directory structure if in media/files folders, otherwise organize by type
      let relativePath;
      if (isInMediaDir) {
        relativePath = entryName.replace(/^(media|files)\//i, '');
      } else {
        // Organize by media type: images/, videos/, audio/
        const fileName = path.basename(entryName);
        const mediaType = isImage ? 'images' : (isVideo ? 'videos' : 'audio');
        relativePath = path.join(mediaType, fileName);
      }
      
      const mediaFilePath = path.join(mediaPath, relativePath);
      
      // Create subdirectories if needed
      const mediaFileDir = path.dirname(mediaFilePath);
      await fsPromises.mkdir(mediaFileDir, { recursive: true });
      
      await fsPromises.writeFile(mediaFilePath, fileBuffer);
      mediaCount++;
      
      if (isImage) imageCount++;
      else if (isVideo) videoCount++;
      else if (isAudio) audioCount++;
    } catch (error) {
      console.warn(`⚠️ Failed to extract media file ${entryName}:`, error.message);
    }
  }
  
  if (mediaCount > 0) {
    const breakdown = [];
    if (imageCount > 0) breakdown.push(`${imageCount} image${imageCount !== 1 ? 's' : ''}`);
    if (videoCount > 0) breakdown.push(`${videoCount} video${videoCount !== 1 ? 's' : ''}`);
    if (audioCount > 0) breakdown.push(`${audioCount} audio file${audioCount !== 1 ? 's' : ''}`);
    console.log(`✅ Extracted ${mediaCount} media file${mediaCount !== 1 ? 's' : ''} to ${mediaPath}${breakdown.length > 0 ? ` (${breakdown.join(', ')})` : ''}`);
  }

  console.log(
    `✅ Persisted ${source} import to VVAULT: ${processedCount} conversations converted to markdown transcripts, ${mediaCount} media files saved`
  );
}

/**
 * Legacy function - redirects to new provider-specific storage
 * @deprecated Use persistImportToVVAULT instead
 */
export async function persistChatGPTExportToVVAULTFromBuffer(buffer, runtimeId) {
  // This function is deprecated - it was saving to wrong location
  // New imports should use persistImportToVVAULT with proper provider folders
  console.warn('persistChatGPTExportToVVAULTFromBuffer is deprecated - use persistImportToVVAULT');
}
