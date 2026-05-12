const DEFAULT_SOURCE_EVIDENCE_OUTPUT_ROOT = "/private/tmp/chatty-cli-source-evidence-proof";
const DEFAULT_SOURCE_EVIDENCE_CONSTRUCT = "zen-001";
const DEFAULT_SOURCE_EVIDENCE_SOURCE = "codex";
const DEFAULT_SOURCE_EVIDENCE_STORE = "postgres";
const DEFAULT_SOURCE_EVIDENCE_ROW_LIMIT = 100;
const CANONICAL_OWNER_LIFE_ID = process.env.CANONICAL_OWNER_VVAULT_USER_ID || process.env.VVAULT_USER_ID || '';
const SAFE_VAULT_FILE_COLUMNS = "id,user_id,filename,construct_id,file_type,created_at,metadata";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SOURCE_EVIDENCE_FOLDERS = new Set([
  "chatgpt",
  "character.ai",
  "chatty",
  "codex",
  "documents",
  "github_copilot",
]);

function consumeValue(argv, index, flag) {
  const next = argv[index + 1];
  if (!next || next.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return next;
}

function normalizeSource(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

function parseConstructSourceEvidenceArgs(argv = []) {
  const args = {
    construct: DEFAULT_SOURCE_EVIDENCE_CONSTRUCT,
    source: DEFAULT_SOURCE_EVIDENCE_SOURCE,
    store: DEFAULT_SOURCE_EVIDENCE_STORE,
    owner: CANONICAL_OWNER_LIFE_ID,
    outDir: DEFAULT_SOURCE_EVIDENCE_OUTPUT_ROOT,
    rowLimit: DEFAULT_SOURCE_EVIDENCE_ROW_LIMIT,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg.startsWith("--construct=")) {
      args.construct = arg.slice("--construct=".length).trim() || DEFAULT_SOURCE_EVIDENCE_CONSTRUCT;
    } else if (arg === "--construct") {
      args.construct = consumeValue(argv, index, "--construct").trim() || DEFAULT_SOURCE_EVIDENCE_CONSTRUCT;
      index += 1;
    } else if (arg.startsWith("--source=")) {
      args.source = normalizeSource(arg.slice("--source=".length)) || DEFAULT_SOURCE_EVIDENCE_SOURCE;
    } else if (arg === "--source") {
      args.source = normalizeSource(consumeValue(argv, index, "--source")) || DEFAULT_SOURCE_EVIDENCE_SOURCE;
      index += 1;
    } else if (arg.startsWith("--store=")) {
      args.store = arg.slice("--store=".length).trim().toLowerCase() || DEFAULT_SOURCE_EVIDENCE_STORE;
    } else if (arg === "--store") {
      args.store = consumeValue(argv, index, "--store").trim().toLowerCase() || DEFAULT_SOURCE_EVIDENCE_STORE;
      index += 1;
    } else if (arg.startsWith("--owner=")) {
      args.owner = arg.slice("--owner=".length).trim() || CANONICAL_OWNER_LIFE_ID;
    } else if (arg === "--owner") {
      args.owner = consumeValue(argv, index, "--owner").trim() || CANONICAL_OWNER_LIFE_ID;
      index += 1;
    } else if (arg.startsWith("--out-dir=")) {
      args.outDir = arg.slice("--out-dir=".length).trim() || DEFAULT_SOURCE_EVIDENCE_OUTPUT_ROOT;
    } else if (arg === "--out-dir") {
      args.outDir = consumeValue(argv, index, "--out-dir").trim() || DEFAULT_SOURCE_EVIDENCE_OUTPUT_ROOT;
      index += 1;
    } else if (arg.startsWith("--row-limit=")) {
      args.rowLimit = Number(arg.slice("--row-limit=".length)) || DEFAULT_SOURCE_EVIDENCE_ROW_LIMIT;
    } else if (arg === "--row-limit") {
      args.rowLimit = Number(consumeValue(argv, index, "--row-limit")) || DEFAULT_SOURCE_EVIDENCE_ROW_LIMIT;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  args.source = normalizeSource(args.source) || DEFAULT_SOURCE_EVIDENCE_SOURCE;
  args.store = String(args.store || DEFAULT_SOURCE_EVIDENCE_STORE).toLowerCase();
  args.rowLimit = Math.max(1, Math.min(500, Number(args.rowLimit) || DEFAULT_SOURCE_EVIDENCE_ROW_LIMIT));
  return args;
}

function classifySourceFolder(source) {
  const normalized = normalizeSource(source);
  if (SOURCE_EVIDENCE_FOLDERS.has(normalized)) {
    return {
      source: normalized,
      verdict: "source-evidence",
      sourceEvidence: true,
      identityCanon: false,
      capsuleCanon: false,
    };
  }
  return {
    source: normalized,
    verdict: "unknown",
    sourceEvidence: false,
    identityCanon: false,
    capsuleCanon: false,
  };
}

function buildVaultFilesPrefix(construct, source) {
  const constructId = String(construct || "").trim();
  const folder = normalizeSource(source);
  return `instances/${constructId}/${folder}/%`;
}

function buildChattyVaultFilesPrefix(construct) {
  const constructId = String(construct || "").trim();
  return `instances/${constructId}/chatty/%`;
}

function resolveProofOwner({ owner, canonicalOwnerSupabaseUserId }) {
  const rawOwner = String(owner || CANONICAL_OWNER_LIFE_ID).trim();
  const canonicalUuid = String(canonicalOwnerSupabaseUserId || "").trim();
  if (!canonicalUuid || !UUID_RE.test(canonicalUuid)) {
    throw new Error("canonical owner Supabase UUID is unavailable");
  }

  if (!rawOwner || rawOwner === CANONICAL_OWNER_LIFE_ID || rawOwner.toLowerCase() === "canonical") {
    return {
      requestedOwner: rawOwner || "canonical",
      supabaseUserId: canonicalUuid,
      resolution: "canonical_owner_policy",
      lifeIdUsedAsDatabaseId: false,
    };
  }

  if (UUID_RE.test(rawOwner)) {
    return {
      requestedOwner: rawOwner,
      supabaseUserId: rawOwner,
      resolution: rawOwner === canonicalUuid ? "canonical_owner_uuid" : "explicit_uuid",
      lifeIdUsedAsDatabaseId: false,
    };
  }

  return {
    requestedOwner: rawOwner,
    supabaseUserId: canonicalUuid,
    resolution: "canonical_owner_policy",
    lifeIdUsedAsDatabaseId: false,
  };
}

function environmentAvailability(env = process.env) {
  return {
    postgresAdapter: {
      DATABASE_URL_SET: Boolean(env.DATABASE_URL),
    },
    supabasePostgres: {
      SUPABASE_URL_SET: Boolean(env.SUPABASE_URL),
      SERVICE_KEY_SET: Boolean(env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY),
    },
  };
}

function postgresStoreAvailable(availability) {
  return Boolean(
    availability?.supabasePostgres?.SUPABASE_URL_SET &&
      availability?.supabasePostgres?.SERVICE_KEY_SET
  );
}

function metadataKeys(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  return Object.keys(metadata).sort();
}

function optionalSha256(row) {
  const metadata = row?.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    for (const key of ["sha256", "sourceSha256", "source_sha256"]) {
      if (typeof metadata[key] === "string" && metadata[key].trim()) {
        return metadata[key].trim();
      }
    }
  }
  return null;
}

function sanitizeVaultFileRow(row = {}) {
  return {
    filename: row.filename || null,
    constructId: row.construct_id || row.constructId || null,
    fileType: row.file_type || row.fileType || null,
    createdAt: row.created_at || row.createdAt || null,
    metadataKeys: metadataKeys(row.metadata),
    sha256: optionalSha256(row),
  };
}

function summarizeQueryResult(result = {}) {
  const rows = Array.isArray(result.rows) ? result.rows : [];
  return {
    ok: Boolean(result.ok),
    count: Number.isFinite(result.count) ? result.count : rows.length,
    error: result.error || null,
    rows: rows.map(sanitizeVaultFileRow),
  };
}

function classifySourceEvidenceReport({
  args = {},
  availability = environmentAvailability({}),
  sourceClassification = classifySourceFolder(args.source),
  evidenceResult = {},
  chattyResult = {},
} = {}) {
  const failures = [];
  const warnings = [];
  const store = String(args.store || DEFAULT_SOURCE_EVIDENCE_STORE).toLowerCase();
  const evidence = summarizeQueryResult(evidenceResult);
  const chatty = summarizeQueryResult(chattyResult);

  if (store !== "postgres") {
    failures.push(`unsupported store: ${store}`);
  }
  if (store === "postgres" && !postgresStoreAvailable(availability)) {
    failures.push("Supabase/Postgres env is missing for --store=postgres");
  }
  if (!sourceClassification.sourceEvidence) {
    failures.push(`source folder is not classified as source-evidence: ${sourceClassification.source || "unknown"}`);
  }
  if (evidenceResult.error) {
    failures.push(`source-evidence query failed: ${evidenceResult.error}`);
  }
  if (chattyResult.error) {
    failures.push(`canonical chatty query failed: ${chattyResult.error}`);
  }
  if (!failures.length && evidence.count === 0) {
    warnings.push("source-evidence query succeeded with zero matching rows");
  }

  return {
    status: failures.length ? "fail" : warnings.length ? "pass-with-empty" : "pass",
    failures,
    warnings,
    evidence,
    chatty,
  };
}

function buildConstructSourceEvidenceReport({
  args = {},
  generatedAt = new Date().toISOString(),
  availability = environmentAvailability({}),
  owner = null,
  evidenceResult = {},
  chattyResult = {},
  localFilesystem = null,
} = {}) {
  const sourceClassification = classifySourceFolder(args.source || DEFAULT_SOURCE_EVIDENCE_SOURCE);
  const classification = classifySourceEvidenceReport({
    args,
    availability,
    sourceClassification,
    evidenceResult,
    chattyResult,
  });
  const construct = args.construct || DEFAULT_SOURCE_EVIDENCE_CONSTRUCT;
  const source = normalizeSource(args.source || DEFAULT_SOURCE_EVIDENCE_SOURCE);
  const store = String(args.store || DEFAULT_SOURCE_EVIDENCE_STORE).toLowerCase();

  return {
    generatedAt,
    outputRoot: args.outDir || DEFAULT_SOURCE_EVIDENCE_OUTPUT_ROOT,
    status: classification.status,
    store,
    construct,
    source,
    owner,
    database: availability,
    classification: sourceClassification,
    safeColumns: SAFE_VAULT_FILE_COLUMNS.split(","),
    queries: {
      sourceEvidence: {
        table: "vault_files",
        prefix: buildVaultFilesPrefix(construct, source),
        ok: classification.evidence.ok,
        count: classification.evidence.count,
        error: classification.evidence.error,
      },
      canonicalChatty: {
        table: "vault_files",
        prefix: buildChattyVaultFilesPrefix(construct),
        ok: classification.chatty.ok,
        count: classification.chatty.count,
        error: classification.chatty.error,
      },
    },
    localFilesystem,
    rows: classification.evidence.rows,
    canonicalChattyRows: classification.chatty.rows,
    failures: classification.failures,
    warnings: classification.warnings,
  };
}

function buildConstructSourceEvidenceMarkdown(report) {
  const lines = [];
  lines.push("# Construct Source-Evidence Proof");
  lines.push("");
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Status: ${report.status}`);
  lines.push(`- Store: ${report.store}`);
  lines.push(`- Construct: ${report.construct}`);
  lines.push(`- Source: ${report.source}`);
  lines.push(`- Output: ${report.outputRoot}`);
  lines.push(`- Owner resolution: ${report.owner?.resolution || "unknown"}`);
  lines.push(`- Supabase user id: ${report.owner?.supabaseUserId || "unknown"}`);
  lines.push(`- DATABASE_URL_SET: ${report.database?.postgresAdapter?.DATABASE_URL_SET ? "yes" : "no"}`);
  lines.push(`- SUPABASE_URL_SET: ${report.database?.supabasePostgres?.SUPABASE_URL_SET ? "yes" : "no"}`);
  lines.push(`- SERVICE_KEY_SET: ${report.database?.supabasePostgres?.SERVICE_KEY_SET ? "yes" : "no"}`);
  lines.push(
    `- Classification: ${report.source} is ${report.classification?.verdict || "unknown"}; identity canon: no; capsule canon: no`,
  );
  lines.push(`- Source-evidence prefix: ${report.queries?.sourceEvidence?.prefix}`);
  lines.push(`- Source-evidence row count: ${report.queries?.sourceEvidence?.count ?? "unknown"}`);
  lines.push(`- Canonical chatty prefix: ${report.queries?.canonicalChatty?.prefix}`);
  lines.push(`- Canonical chatty row count: ${report.queries?.canonicalChatty?.count ?? "unknown"}`);
  if (report.localFilesystem) {
    lines.push(`- Local folder: ${report.localFilesystem.path}`);
    lines.push(`- Local folder exists: ${report.localFilesystem.exists ? "yes" : "no"}`);
    lines.push(`- Local folder entries: ${report.localFilesystem.entryCount ?? "unknown"}`);
  }
  lines.push("");

  if (report.failures?.length) {
    lines.push("## Failures");
    for (const failure of report.failures) {
      lines.push(`- ${failure}`);
    }
    lines.push("");
  }

  if (report.warnings?.length) {
    lines.push("## Warnings");
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push("");
  }

  lines.push("## Rows");
  if (!report.rows?.length) {
    lines.push("- none");
  } else {
    for (const row of report.rows) {
      const keys = row.metadataKeys?.length ? row.metadataKeys.join(", ") : "none";
      const sha = row.sha256 ? `; sha256=${row.sha256}` : "";
      lines.push(
        `- ${row.filename || row.id || "unknown"} | construct=${row.constructId || "unknown"} | type=${
          row.fileType || "unknown"
        } | created=${row.createdAt || "unknown"} | metadata keys=${keys}${sha}`,
      );
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

export {
  CANONICAL_OWNER_LIFE_ID,
  DEFAULT_SOURCE_EVIDENCE_CONSTRUCT,
  DEFAULT_SOURCE_EVIDENCE_OUTPUT_ROOT,
  DEFAULT_SOURCE_EVIDENCE_ROW_LIMIT,
  DEFAULT_SOURCE_EVIDENCE_SOURCE,
  DEFAULT_SOURCE_EVIDENCE_STORE,
  SAFE_VAULT_FILE_COLUMNS,
  buildChattyVaultFilesPrefix,
  buildConstructSourceEvidenceMarkdown,
  buildConstructSourceEvidenceReport,
  buildVaultFilesPrefix,
  classifySourceEvidenceReport,
  classifySourceFolder,
  environmentAvailability,
  parseConstructSourceEvidenceArgs,
  postgresStoreAvailable,
  resolveProofOwner,
  sanitizeVaultFileRow,
};
