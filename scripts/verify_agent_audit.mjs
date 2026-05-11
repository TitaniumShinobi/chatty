import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_FIELDS = [
  'traceId',
  'actor',
  'repo',
  'mode',
  'approvalState',
  'changedPaths',
  'diffHash',
  'checksRun',
  'checkResults',
  'timestamp',
  'summary',
  'signature',
];

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }
  return value;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function signAuditPayload(payload, secret) {
  const body = JSON.stringify(canonicalize(payload));
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

export function validateAuditObject(audit, secret) {
  for (const field of REQUIRED_FIELDS) {
    assert(Object.prototype.hasOwnProperty.call(audit, field), `Missing required field: ${field}`);
  }

  assert(typeof audit.traceId === 'string' && audit.traceId.length > 0, 'traceId must be a non-empty string');
  assert(audit.actor && typeof audit.actor === 'object', 'actor must be an object');
  assert(typeof audit.actor.id === 'string' && audit.actor.id.length > 0, 'actor.id must be a non-empty string');
  assert(['human', 'agent', 'bot', 'service'].includes(audit.actor.type), 'actor.type must be a supported actor type');
  assert(typeof audit.repo === 'string' && audit.repo.length > 0, 'repo must be a non-empty string');
  assert(['READ_ONLY', 'PLAN_ONLY', 'SUGGEST_EDITS', 'APPLY_EDITS'].includes(audit.mode), 'mode must be a supported execution mode');
  assert(audit.approvalState && typeof audit.approvalState === 'object', 'approvalState must be an object');
  assert(typeof audit.approvalState.required === 'boolean', 'approvalState.required must be boolean');
  assert(typeof audit.approvalState.approved === 'boolean', 'approvalState.approved must be boolean');
  assert(audit.approvalState.approvedBy === null || typeof audit.approvalState.approvedBy === 'string', 'approvalState.approvedBy must be string or null');
  assert(audit.approvalState.approvedAt === null || isIsoDate(audit.approvalState.approvedAt), 'approvalState.approvedAt must be an ISO timestamp or null');
  assert(Array.isArray(audit.changedPaths), 'changedPaths must be an array');
  assert(audit.changedPaths.every((entry) => typeof entry === 'string' && entry.length > 0), 'changedPaths entries must be non-empty strings');
  assert(typeof audit.diffHash === 'string' && audit.diffHash.length > 0, 'diffHash must be a non-empty string');
  assert(Array.isArray(audit.checksRun), 'checksRun must be an array');
  assert(audit.checksRun.every((entry) => typeof entry === 'string' && entry.length > 0), 'checksRun entries must be non-empty strings');
  assert(audit.checkResults && typeof audit.checkResults === 'object' && !Array.isArray(audit.checkResults), 'checkResults must be an object');
  assert(Object.values(audit.checkResults).every((entry) => ['passed', 'failed', 'skipped'].includes(entry)), 'checkResults values must be passed, failed, or skipped');
  assert(isIsoDate(audit.timestamp), 'timestamp must be an ISO date-time string');
  assert(typeof audit.summary === 'string' && audit.summary.length > 0, 'summary must be a non-empty string');
  assert(audit.signature && typeof audit.signature === 'object', 'signature must be an object');
  assert(audit.signature.algorithm === 'HMAC-SHA256', 'signature.algorithm must be HMAC-SHA256');
  assert(typeof audit.signature.value === 'string' && audit.signature.value.length > 0, 'signature.value must be a non-empty string');

  if (secret) {
    const payload = { ...audit };
    delete payload.signature;
    const expected = signAuditPayload(payload, secret);
    assert(expected === audit.signature.value, 'signature.value does not match the expected HMAC');
  }

  return true;
}

export function validateAuditFile({ auditPath, secret }) {
  const absoluteAuditPath = path.resolve(auditPath);
  const raw = fs.readFileSync(absoluteAuditPath, 'utf8');
  const parsed = JSON.parse(raw);
  validateAuditObject(parsed, secret);
  return parsed;
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith('--') || value == null) continue;
    args.set(key.slice(2), value);
    index += 1;
  }
  return args;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const args = parseArgs(process.argv.slice(2));
  const auditPath = args.get('file') || 'AGENT-AUDIT.json';
  const secret = process.env.AGENT_AUDIT_HMAC_SECRET || '';
  validateAuditFile({ auditPath, secret });
  process.stdout.write(`Verified ${path.resolve(auditPath)}\n`);
}
