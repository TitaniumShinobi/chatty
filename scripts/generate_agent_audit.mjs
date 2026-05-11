import fs from 'node:fs';
import path from 'node:path';
import { signAuditPayload } from './verify_agent_audit.mjs';

function parseArgs(argv) {
  const args = new Map();
  const multi = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const normalized = key.slice(2);
    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) {
      args.set(normalized, 'true');
      continue;
    }
    if (normalized === 'changed-path' || normalized === 'check') {
      const values = multi.get(normalized) ?? [];
      values.push(value);
      multi.set(normalized, values);
    } else {
      args.set(normalized, value);
    }
    index += 1;
  }
  return { args, multi };
}

function boolValue(value, defaultValue = false) {
  if (value == null) return defaultValue;
  return value === 'true';
}

const { args, multi } = parseArgs(process.argv.slice(2));
const secret = process.env.AGENT_AUDIT_HMAC_SECRET || '';
if (!secret) {
  throw new Error('AGENT_AUDIT_HMAC_SECRET must be set to generate AGENT-AUDIT.json');
}

const checks = multi.get('check') ?? [];
const changedPaths = multi.get('changed-path') ?? [];
const checkResults = {};
const checksRun = [];
for (const entry of checks) {
  const [name, status = 'passed'] = entry.split('=');
  checksRun.push(name);
  checkResults[name] = status;
}

const payload = {
  traceId: args.get('trace-id') || `trace-${Date.now()}`,
  actor: {
    id: args.get('actor-id') || 'unknown',
    type: args.get('actor-type') || 'agent',
  },
  repo: args.get('repo') || path.basename(process.cwd()),
  mode: args.get('mode') || 'SUGGEST_EDITS',
  approvalState: {
    required: boolValue(args.get('approval-required'), true),
    approved: boolValue(args.get('approved'), false),
    approvedBy: args.get('approved-by') || null,
    approvedAt: args.get('approved-at') || null,
  },
  changedPaths,
  diffHash: args.get('diff-hash') || 'unknown',
  checksRun,
  checkResults,
  timestamp: args.get('timestamp') || new Date().toISOString(),
  summary: args.get('summary') || 'Agent-origin change summary pending.',
};

payload.signature = {
  algorithm: 'HMAC-SHA256',
  value: signAuditPayload(payload, secret),
};

const outputPath = path.resolve(args.get('output') || 'AGENT-AUDIT.json');
fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
process.stdout.write(`Wrote ${outputPath}\n`);
