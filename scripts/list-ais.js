#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";

const argv = process.argv.slice(2);

function getFlag(name) {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const next = argv[idx + 1];
  if (!next || next.startsWith("--")) return true;
  return next;
}

const userId = getFlag("--user") || null;
const outputPath = getFlag("--output") || null;
const addMonday = argv.includes("--add-monday");

const defaultDbCandidates = [
  path.resolve(process.cwd(), "chatty.db"),
  path.resolve(process.cwd(), "chatty", "chatty.db"),
];

const CHATTY_DB_PATH =
  process.env.CHATTY_DB_PATH ||
  defaultDbCandidates.find((candidate) => fs.existsSync(candidate)) ||
  defaultDbCandidates[0];

const SUPABASE_URL = process.env.SUPABASE_URL || null;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || null;

const MONDAY_CALLSIGN = "monday-001";
const MONDAY_NAME = "Monday";
const MONDAY_DESCRIPTION = "Inserted by script";
const SQLITE_DEFAULT_MODEL = "openrouter/auto";

const SOURCE_PRECEDENCE = [
  "sqlite-ais",
  "sqlite-gpts",
  "supabase-ais",
  "supabase-vault-files",
];

function normalizeRow(row, source) {
  if (!row) return null;
  const constructCallsign =
    row.construct_callsign ||
    row.construct_call_sign ||
    row.constructCallsign ||
    row.construct_id ||
    null;

  return {
    id: row.id ?? null,
    construct_callsign: constructCallsign,
    name: row.name ?? null,
    description: row.description ?? null,
    user_id: row.user_id ?? row.userId ?? null,
    created_at: row.created_at ?? row.createdAt ?? null,
    source,
  };
}

function escapeCsv(value) {
  const text = value == null ? "" : String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function derivePromptMetadata(content, fallbackCallsign) {
  const text = typeof content === "string" ? content : "";
  const nameMatch = text.match(/^Name:\s*(.+)$/im);
  const descMatch = text.match(/^Description:\s*(.+)$/im);

  return {
    name: nameMatch?.[1]?.trim() || fallbackCallsign,
    description: descMatch?.[1]?.trim() || "",
  };
}

function dedupeRows(rows) {
  const idSeen = new Set();
  const callsignSeen = new Set();
  const deduped = [];

  for (const source of SOURCE_PRECEDENCE) {
    for (const row of rows) {
      if (row.source !== source) continue;
      const idKey = row.id || null;
      const callsignKey = row.construct_callsign || null;

      if (idKey && idSeen.has(idKey)) continue;
      if (callsignKey && callsignSeen.has(callsignKey)) continue;

      if (idKey) idSeen.add(idKey);
      if (callsignKey) callsignSeen.add(callsignKey);
      deduped.push(row);
    }
  }

  return deduped;
}

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function fetchSqliteRows(tableName) {
  if (!fs.existsSync(CHATTY_DB_PATH)) {
    return [];
  }

  const db = new Database(CHATTY_DB_PATH, { readonly: true });

  try {
    const tableExists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      )
      .get(tableName);

    if (!tableExists) {
      return [];
    }

    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const hasConstructCallsign = columns.some(
      (column) => column.name === "construct_callsign",
    );
    const hasUpdatedAt = columns.some((column) => column.name === "updated_at");

    const selectConstruct = hasConstructCallsign
      ? "construct_callsign"
      : "NULL AS construct_callsign";
    const orderBy = hasUpdatedAt ? "updated_at DESC" : "created_at DESC";

    const where = userId ? "WHERE user_id = ?" : "";
    const sql = `
      SELECT
        id,
        ${selectConstruct},
        name,
        description,
        user_id,
        created_at
      FROM ${tableName}
      ${where}
      ORDER BY ${orderBy}
    `;

    const stmt = db.prepare(sql);
    const rows = userId ? stmt.all(userId) : stmt.all();
    return rows.map((row) => normalizeRow(row, `sqlite-${tableName}`)).filter(Boolean);
  } finally {
    db.close();
  }
}

async function fetchSupabaseAisRows(client) {
  if (!client) return [];

  try {
    let query = client
      .from("ais")
      .select("id,construct_call_sign,name,description,user_id,created_at")
      .order("created_at", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn(`[list-ais] Supabase ais query failed: ${error.message}`);
      return [];
    }

    return (data || [])
      .map((row) => normalizeRow(row, "supabase-ais"))
      .filter(Boolean);
  } catch (error) {
    console.warn(`[list-ais] Supabase ais query threw: ${error.message}`);
    return [];
  }
}

async function fetchSupabaseVaultFallbackRows(client) {
  if (!client) return [];

  try {
    let query = client
      .from("vault_files")
      .select("id, filename, content, construct_id, user_id, created_at")
      .like("filename", "instances/%/identity/prompt.txt")
      .order("created_at", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn(`[list-ais] Supabase vault_files fallback failed: ${error.message}`);
      return [];
    }

    return (data || [])
      .map((row) => {
        const constructCallsign =
          row.construct_id || row.filename?.match(/instances\/([^/]+)\//)?.[1] || null;
        if (!constructCallsign) return null;

        const metadata = derivePromptMetadata(row.content, constructCallsign);
        return normalizeRow(
          {
            id: row.id || `vault-${constructCallsign}`,
            construct_callsign: constructCallsign,
            name: metadata.name,
            description: metadata.description,
            user_id: row.user_id,
            created_at: row.created_at,
          },
          "supabase-vault-files",
        );
      })
      .filter(Boolean);
  } catch (error) {
    console.warn(
      `[list-ais] Supabase vault_files fallback threw: ${error.message}`,
    );
    return [];
  }
}

function insertMondaySqlite() {
  if (!userId) {
    throw new Error("--user is required with --add-monday");
  }
  if (!fs.existsSync(CHATTY_DB_PATH)) {
    throw new Error(`SQLite DB not found at ${CHATTY_DB_PATH}`);
  }

  const db = new Database(CHATTY_DB_PATH);

  try {
    db.prepare(
      `
        INSERT OR IGNORE INTO ais (
          id, name, description, construct_callsign, model_id, user_id, is_active, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `,
    ).run(
      MONDAY_CALLSIGN,
      MONDAY_NAME,
      MONDAY_DESCRIPTION,
      MONDAY_CALLSIGN,
      SQLITE_DEFAULT_MODEL,
      userId,
    );

    const row = db
      .prepare(
        `
          SELECT id, construct_callsign, name, description, user_id, created_at
          FROM ais
          WHERE construct_callsign = ? AND user_id = ?
          LIMIT 1
        `,
      )
      .get(MONDAY_CALLSIGN, userId);

    return normalizeRow(row, "sqlite-ais");
  } finally {
    db.close();
  }
}

async function insertMondaySupabase(client) {
  if (!client) {
    throw new Error("Supabase is not configured");
  }
  if (!userId) {
    throw new Error("--user is required with --add-monday");
  }

  const payload = {
    id: MONDAY_CALLSIGN,
    construct_call_sign: MONDAY_CALLSIGN,
    name: MONDAY_NAME,
    description: MONDAY_DESCRIPTION,
    user_id: userId,
  };

  const selectColumns = "id,construct_call_sign,name,description,user_id,created_at";
  const tryExisting = async () => {
    const { data, error } = await client
      .from("ais")
      .select(selectColumns)
      .eq("user_id", userId)
      .eq("construct_call_sign", MONDAY_CALLSIGN)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    return data ? normalizeRow(data, "supabase-ais") : null;
  };

  try {
    const { data, error } = await client
      .from("ais")
      .upsert(payload, { onConflict: "user_id,construct_call_sign" })
      .select(selectColumns)
      .limit(1)
      .single();

    if (error) {
      throw error;
    }
    return normalizeRow(data, "supabase-ais");
  } catch (error) {
    console.warn(`[list-ais] Supabase upsert failed: ${error.message}`);
    const existing = await tryExisting();
    if (existing) return existing;

    const { data, error: insertError } = await client
      .from("ais")
      .insert(payload)
      .select(selectColumns)
      .limit(1)
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }
    return normalizeRow(data, "supabase-ais");
  }
}

function writeOutput(rows) {
  if (!outputPath) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  const ext = path.extname(outputPath).toLowerCase();
  if (ext === ".csv") {
    const headers = [
      "id",
      "construct_callsign",
      "name",
      "description",
      "user_id",
      "created_at",
      "source",
    ];
    const lines = [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
    ];
    fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
    console.log(`Wrote ${rows.length} rows to ${outputPath}`);
    return;
  }

  fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2), "utf8");
  console.log(`Wrote ${rows.length} rows to ${outputPath}`);
}

async function main() {
  const supabaseClient = getSupabaseClient();
  const loadAllRows = async () => {
    const sqliteAisRows = fetchSqliteRows("ais");
    const sqliteGptRows = fetchSqliteRows("gpts");
    const supabaseAisRows = await fetchSupabaseAisRows(supabaseClient);
    const supabaseVaultRows = await fetchSupabaseVaultFallbackRows(supabaseClient);

    return dedupeRows([
      ...sqliteAisRows,
      ...sqliteGptRows,
      ...supabaseAisRows,
      ...supabaseVaultRows,
    ]);
  };

  let allRows = await loadAllRows();

  if (!fs.existsSync(CHATTY_DB_PATH) && (!SUPABASE_URL || !SUPABASE_KEY) && allRows.length === 0) {
    throw new Error("No data source available. Set SUPABASE_URL/SUPABASE_SERVICE_KEY or provide CHATTY_DB_PATH.");
  }

  if (addMonday) {
    const inserted = supabaseClient
      ? await insertMondaySupabase(supabaseClient)
      : insertMondaySqlite();
    console.log("Inserted or reused Monday:");
    console.log(JSON.stringify(inserted, null, 2));
    allRows = await loadAllRows();
  }

  console.log(`Found ${allRows.length} rows.`);
  writeOutput(allRows);
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exitCode = 1;
});
