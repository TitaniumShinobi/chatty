#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_ORIGIN = 'https://vvault.thewreck.org';
const MAX_FILES = 32;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function textParts(payload) {
  if (!Array.isArray(payload?.content)) return '';
  const allowed = payload.role === 'user' ? 'input_text' : 'output_text';
  return payload.content
    .filter((part) => part?.type === allowed && typeof part.text === 'string')
    .map((part) => part.text.replace(/\r\n?/g, '\n').normalize('NFC'))
    .join('');
}

export function adaptCodexJsonl(rawBytes, sourceName = 'rollout.jsonl') {
  if (!Buffer.isBuffer(rawBytes)) throw new TypeError('rawBytes must be a Buffer');
  const rows = rawBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`Invalid JSONL at ${path.basename(sourceName)}:${index + 1}`); }
  });
  const metas = rows.filter((row) => row?.type === 'session_meta' && row.payload);
  if (metas.length !== 1) throw new Error('Exactly one session_meta record is required');
  const meta = metas[0].payload;
  if (!UUID_RE.test(String(meta.id || ''))) throw new Error('Stable Codex thread UUID is required');
  if (meta.thread_source !== 'user') throw new Error('Only thread_source=user is eligible');
  if (!['cli', 'vscode'].includes(meta.source)) throw new Error('Only cli or vscode Codex surfaces are eligible');
  if (typeof meta.source === 'object' || meta.source?.subagent) throw new Error('Subagent sessions are ineligible');

  const messages = rows.flatMap((row) => {
    const payload = row?.type === 'response_item' ? row.payload : null;
    if (payload?.type !== 'message' || !['user', 'assistant'].includes(payload.role)) return [];
    const text = textParts(payload);
    return text ? [{ role: payload.role, timestamp: row.timestamp || null, text }] : [];
  });
  if (messages.length === 0) throw new Error('No user or assistant messages found');
  const projection = `${messages.map((message) => {
    const role = message.role === 'user' ? 'User' : 'Assistant';
    return `## ${role} (${message.timestamp || 'timestamp-unavailable'})\n${message.text}`;
  }).join('\n\n')}\n`;
  const rawHash = sha256(rawBytes);
  const projectionBytes = Buffer.from(projection, 'utf8');
  return {
    body: {
      provider: 'codex',
      sourceKind: 'jsonl',
      sourceCollection: 'codex-desktop-rollouts',
      stableSourceId: meta.id,
      sourceLocator: path.basename(sourceName),
      rawEnvelopeBase64: rawBytes.toString('base64'),
      projectionContent: projection,
      projectionContract: 'life.vvault.provider-transcript.codex-desktop/v1',
      projectionVersion: '1',
      contentType: 'text/markdown; charset=utf-8',
      sourceMetadata: {
        sourceProduct: 'codex',
        sourceSessionId: meta.id,
        sourceSurface: meta.source,
        sourceEnvelopeSha256: rawHash,
        sourceEnvelopeBytes: rawBytes.length,
        projectionSha256: sha256(projectionBytes),
        projectionBytes: projectionBytes.length,
        classificationEvidence: {
          threadSource: 'user',
          supportedCodexSurface: true,
          subagentMarkerAbsent: true,
        },
      },
    },
    expected: { rawHash, rawBytes: rawBytes.length, projectionHash: sha256(projectionBytes), projectionBytes: projectionBytes.length },
  };
}

export function validateReceipt(payload, expected, stableSourceId) {
  const receipt = payload?.receipt || {};
  const valid = payload?.success === true && payload?.canonical === true &&
    payload?.storageOwner === 'ovvaults.vault_files' && receipt.readbackVerified === true &&
    receipt.rawEnvelopeSha256 === expected.rawHash && Number(receipt.rawEnvelopeBytes) === expected.rawBytes &&
    receipt.destinationSha256 === expected.projectionHash && Number(receipt.destinationBytes) === expected.projectionBytes &&
    receipt.stableSourceId === stableSourceId && receipt.classification === 'ACCOUNT_PRIVATE' &&
    receipt.classificationConstruct === 'zen-001' && typeof receipt.destinationPath === 'string' && receipt.destinationPath;
  if (!valid) throw new Error('VVAULT source-native ingestion receipt mismatch');
  return receipt;
}

export async function syncFiles({ files, origin = DEFAULT_ORIGIN, serviceToken, ownerEmail, fetchImpl = globalThis.fetch }) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('At least one explicit --file is required');
  if (files.length > MAX_FILES) throw new Error(`At most ${MAX_FILES} explicit files are allowed`);
  if (!serviceToken || !ownerEmail) throw new Error('Service token and owner email are required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
  const receipts = [];
  for (const file of files) {
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) throw new Error('Source must be a regular file no larger than 10 MiB');
    const raw = await fs.readFile(file);
    const record = adaptCodexJsonl(raw, file);
    const response = await fetchImpl(`${String(origin).replace(/\/$/, '')}/api/vault/source-native-ingestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceToken}`, 'X-Service-Token': serviceToken, 'X-Chatty-User': ownerEmail.trim().toLowerCase() },
      body: JSON.stringify(record.body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) throw new Error(`VVAULT source-native ingestion failed (${response.status})`);
    receipts.push(validateReceipt(payload, record.expected, record.body.stableSourceId));
  }
  return { ok: true, files: files.length, receipts };
}

function parseArgs(argv) {
  const files = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--file' || !argv[index + 1]) throw new Error('Usage: syncCodexSourceNative.js --file PATH [--file PATH]');
    files.push(argv[index += 1]);
  }
  return files;
}

export async function main(argv = process.argv.slice(2)) {
  const result = await syncFiles({
    files: parseArgs(argv),
    origin: process.env.CODEX_VVAULT_LIVE_API_BASE_URL || DEFAULT_ORIGIN,
    serviceToken: process.env.CODEX_VVAULT_LIVE_SERVICE_TOKEN || process.env.VVAULT_LIVE_SERVICE_TOKEN,
    ownerEmail: process.env.CODEX_VVAULT_OWNER_EMAIL || process.env.CHATTY_USER_EMAIL,
  });
  process.stdout.write(`${JSON.stringify({ ok: result.ok, files: result.files })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
