#!/usr/bin/env -S npx tsx

import "../loadEnv.js";

import fs from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  DEFAULT_SOURCE_EVIDENCE_OUTPUT_ROOT,
  SAFE_VAULT_FILE_COLUMNS,
  buildConstructSourceEvidenceMarkdown,
  buildConstructSourceEvidenceReport,
  buildVaultFilesPrefix,
  buildChattyVaultFilesPrefix,
  environmentAvailability,
  parseConstructSourceEvidenceArgs,
  postgresStoreAvailable,
  resolveProofOwner,
} from "../lib/constructSourceEvidenceProof.js";
import { resolveCanonicalOwnerSupabaseUserId } from "../lib/constructSovereigntyPolicy.js";
import { getVvaultBasePath } from "../lib/vvaultPaths.js";

interface QueryResult {
  ok: boolean;
  count: number;
  rows: unknown[];
  error: string | null;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run probe:construct-source-evidence -- --construct=zen-001 --source=codex --store=postgres --json",
    "",
    "Options:",
    "  --construct=<id>    Construct id. Default: zen-001",
    "  --source=<folder>   Source-evidence folder. Default: codex",
    "  --store=<store>     Store backend. Only postgres is supported.",
    `  --out-dir=<path>   Artifact directory. Default: ${DEFAULT_SOURCE_EVIDENCE_OUTPUT_ROOT}`,
    "  --json              Print JSON report.",
  ].join("\n");
}

function serviceKey(env: NodeJS.ProcessEnv): string {
  return String(env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

function buildClient(env: NodeJS.ProcessEnv) {
  const url = String(env.SUPABASE_URL || "").trim();
  const key = serviceKey(env);
  if (!url || !key) {
    return null;
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function queryVaultFiles({
  supabase,
  ownerSupabaseUserId,
  prefix,
  rowLimit,
}: {
  supabase: ReturnType<typeof createClient> | null;
  ownerSupabaseUserId: string;
  prefix: string;
  rowLimit: number;
}): Promise<QueryResult> {
  if (!supabase) {
    return {
      ok: false,
      count: 0,
      rows: [],
      error: null,
    };
  }

  const { data, error, count } = await supabase
    .from("vault_files")
    .select(SAFE_VAULT_FILE_COLUMNS, { count: "exact" })
    .eq("user_id", ownerSupabaseUserId)
    .like("filename", prefix)
    .order("created_at", { ascending: false })
    .limit(rowLimit);

  if (error) {
    return {
      ok: false,
      count: 0,
      rows: [],
      error: error.message || String(error),
    };
  }

  return {
    ok: true,
    count: typeof count === "number" ? count : Array.isArray(data) ? data.length : 0,
    rows: Array.isArray(data) ? data : [],
    error: null,
  };
}

async function inspectLocalSourceFolder(construct: string, source: string) {
  const folderPath = path.join(getVvaultBasePath(), "instances", construct, source);
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    return {
      path: folderPath,
      exists: true,
      entryCount: entries.length,
      entries: entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
      })),
    };
  } catch (error) {
    const filesystemError = error as NodeJS.ErrnoException;
    return {
      path: folderPath,
      exists: false,
      entryCount: 0,
      entries: [],
      error: filesystemError.code || (error instanceof Error ? error.message : String(error)),
    };
  }
}

async function writeArtifacts(outDir: string, report: unknown, markdown: string): Promise<void> {
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(outDir, "report.md"), markdown);
}

async function main(): Promise<void> {
  const args = parseConstructSourceEvidenceArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const availability = environmentAvailability(process.env);
  const owner = resolveProofOwner({
    owner: args.owner,
    canonicalOwnerSupabaseUserId: resolveCanonicalOwnerSupabaseUserId(process.env),
  });
  const supabase = args.store === "postgres" && postgresStoreAvailable(availability)
    ? buildClient(process.env)
    : null;

  const [localFilesystem, evidenceResult, chattyResult] = await Promise.all([
    inspectLocalSourceFolder(args.construct, args.source),
    queryVaultFiles({
      supabase,
      ownerSupabaseUserId: owner.supabaseUserId,
      prefix: buildVaultFilesPrefix(args.construct, args.source),
      rowLimit: args.rowLimit,
    }),
    queryVaultFiles({
      supabase,
      ownerSupabaseUserId: owner.supabaseUserId,
      prefix: buildChattyVaultFilesPrefix(args.construct),
      rowLimit: args.rowLimit,
    }),
  ]);

  const report = buildConstructSourceEvidenceReport({
    args,
    availability,
    owner,
    evidenceResult,
    chattyResult,
    localFilesystem,
  });
  const markdown = buildConstructSourceEvidenceMarkdown(report);
  await writeArtifacts(args.outDir, report, markdown);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(markdown);
  }

  if (report.status === "fail") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
