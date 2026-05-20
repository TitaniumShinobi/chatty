import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_OWNER_LIFE_ID,
  DEFAULT_SOURCE_EVIDENCE_OUTPUT_ROOT,
  SAFE_VAULT_FILE_COLUMNS,
  buildConstructSourceEvidenceReport,
  buildVaultFilesPrefix,
  classifySourceFolder,
  environmentAvailability,
  parseConstructSourceEvidenceArgs,
  resolveProofOwner,
  sanitizeVaultFileRow,
} from "../lib/constructSourceEvidenceProof.js";

const canonicalOwnerUuid = "7e34f6b8-e33a-48b5-8ddb-95b94d18e296";

function availableEnv() {
  return environmentAvailability({
    DATABASE_URL: "",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_KEY: "service-key-for-test",
  });
}

test("parseConstructSourceEvidenceArgs defaults to Zen codex Postgres JSON-safe proof", () => {
  const args = parseConstructSourceEvidenceArgs(["--json"]);

  assert.equal(args.construct, "zen-001");
  assert.equal(args.source, "codex");
  assert.equal(args.store, "postgres");
  assert.equal(args.owner, CANONICAL_OWNER_LIFE_ID);
  assert.equal(args.outDir, DEFAULT_SOURCE_EVIDENCE_OUTPUT_ROOT);
  assert.equal(args.json, true);
});

test("codex maps to source-evidence and not identity or capsule canon", () => {
  const classification = classifySourceFolder("codex");

  assert.equal(classification.verdict, "source-evidence");
  assert.equal(classification.sourceEvidence, true);
  assert.equal(classification.identityCanon, false);
  assert.equal(classification.capsuleCanon, false);
});

test("passes when Supabase/Postgres returns transcript rows for construct source evidence", () => {
  const report = buildConstructSourceEvidenceReport({
    args: parseConstructSourceEvidenceArgs(["--construct=zen-001", "--source=codex", "--store=postgres"]),
    availability: availableEnv(),
    owner: resolveProofOwner({
      owner: CANONICAL_OWNER_LIFE_ID,
      canonicalOwnerSupabaseUserId: canonicalOwnerUuid,
    }),
    evidenceResult: {
      ok: true,
      count: 1,
      rows: [
        {
          id: "row-1",
          user_id: canonicalOwnerUuid,
          filename: "instances/zen-001/codex/codex_you_are_tasked_with_implementing.txt",
          construct_id: "zen-001",
          file_type: "transcript",
          created_at: "2026-05-08T00:00:00.000Z",
          metadata: { source: "codex", sha256: "abc123" },
        },
      ],
    },
    chattyResult: {
      ok: true,
      count: 1,
      rows: [
        {
          id: "chatty-row",
          filename: "instances/zen-001/chatty/zen-001_chat_with_zen-001.md",
          construct_id: "zen-001",
          file_type: "conversation",
          created_at: "2026-05-08T00:00:00.000Z",
          metadata: { canonical: true },
        },
      ],
    },
  });

  assert.equal(report.status, "pass");
  assert.equal(report.queries.sourceEvidence.prefix, "instances/zen-001/codex/%");
  assert.equal(report.queries.sourceEvidence.count, 1);
  assert.equal(report.queries.canonicalChatty.count, 1);
  assert.equal(report.rows[0].filename, "instances/zen-001/codex/codex_you_are_tasked_with_implementing.txt");
  assert.deepEqual(report.rows[0].metadataKeys, ["sha256", "source"]);
  assert.equal(report.rows[0].sha256, "abc123");
});

test("passes with empty status when source query succeeds but row count is zero", () => {
  const report = buildConstructSourceEvidenceReport({
    args: parseConstructSourceEvidenceArgs(["--construct=zen-001", "--source=codex", "--store=postgres"]),
    availability: availableEnv(),
    owner: resolveProofOwner({
      owner: CANONICAL_OWNER_LIFE_ID,
      canonicalOwnerSupabaseUserId: canonicalOwnerUuid,
    }),
    evidenceResult: { ok: true, count: 0, rows: [] },
    chattyResult: { ok: true, count: 1, rows: [] },
  });

  assert.equal(report.status, "pass-with-empty");
  assert.deepEqual(report.warnings, ["source-evidence query succeeded with zero matching rows"]);
});

test("fails when Supabase/Postgres env is missing and --store=postgres is requested", () => {
  const report = buildConstructSourceEvidenceReport({
    args: parseConstructSourceEvidenceArgs(["--store=postgres"]),
    availability: environmentAvailability({}),
    owner: resolveProofOwner({
      owner: CANONICAL_OWNER_LIFE_ID,
      canonicalOwnerSupabaseUserId: canonicalOwnerUuid,
    }),
    evidenceResult: { ok: false, count: 0, rows: [] },
    chattyResult: { ok: false, count: 0, rows: [] },
  });

  assert.equal(report.status, "fail");
  assert.match(report.failures.join("; "), /Supabase\/Postgres env is missing/i);
});

test("fails query schema errors while avoiding updated_at in the safe select list", () => {
  const report = buildConstructSourceEvidenceReport({
    args: parseConstructSourceEvidenceArgs(["--store=postgres"]),
    availability: availableEnv(),
    owner: resolveProofOwner({
      owner: CANONICAL_OWNER_LIFE_ID,
      canonicalOwnerSupabaseUserId: canonicalOwnerUuid,
    }),
    evidenceResult: { ok: false, count: 0, rows: [], error: "column vault_files.some_missing_column does not exist" },
    chattyResult: { ok: true, count: 1, rows: [] },
  });

  assert.equal(report.status, "fail");
  assert.match(report.failures.join("; "), /some_missing_column/);
  assert.doesNotMatch(SAFE_VAULT_FILE_COLUMNS, /updated_at/);
});

test("resolves canonical life-id through owner policy instead of using it as vault_files.user_id", () => {
  const owner = resolveProofOwner({
    owner: CANONICAL_OWNER_LIFE_ID,
    canonicalOwnerSupabaseUserId: canonicalOwnerUuid,
  });

  assert.equal(owner.requestedOwner, CANONICAL_OWNER_LIFE_ID);
  assert.equal(owner.supabaseUserId, canonicalOwnerUuid);
  assert.equal(owner.lifeIdUsedAsDatabaseId, false);
  assert.notEqual(owner.supabaseUserId, CANONICAL_OWNER_LIFE_ID);
  assert.equal(buildVaultFilesPrefix("zen-001", "codex"), "instances/zen-001/codex/%");
});

test("sanitized rows and reports omit transcript bodies and secret values", () => {
  const row = {
    id: "row-1",
    user_id: canonicalOwnerUuid,
    filename: "instances/zen-001/codex/proof.txt",
    construct_id: "zen-001",
    file_type: "transcript",
    created_at: "2026-05-08T00:00:00.000Z",
    content: "full transcript body must not be emitted",
    metadata: {
      source: "codex",
      sha256: "abc123",
      token: "service-key-for-test",
    },
  };
  const sanitized = sanitizeVaultFileRow(row);
  const report = buildConstructSourceEvidenceReport({
    args: parseConstructSourceEvidenceArgs(["--store=postgres"]),
    availability: availableEnv(),
    owner: resolveProofOwner({
      owner: CANONICAL_OWNER_LIFE_ID,
      canonicalOwnerSupabaseUserId: canonicalOwnerUuid,
    }),
    evidenceResult: { ok: true, count: 1, rows: [row] },
    chattyResult: { ok: true, count: 0, rows: [] },
  });
  const serialized = JSON.stringify({ sanitized, report });

  assert.equal(sanitized.filename, "instances/zen-001/codex/proof.txt");
  assert.equal(sanitized.sha256, "abc123");
  assert.doesNotMatch(serialized, /full transcript body/);
  assert.doesNotMatch(serialized, /service-key-for-test/);
  assert.doesNotMatch(serialized, /"user_id":"7e34f6b8-e33a-48b5-8ddb-95b94d18e296"/);
});
