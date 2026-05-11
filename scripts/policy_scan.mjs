import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { validateAuditFile } from './verify_agent_audit.mjs';

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

function escapeRegexCharacter(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegex(pattern) {
  let result = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === '*' && next === '*') {
      result += '.*';
      index += 1;
      continue;
    }
    if (char === '*') {
      result += '[^/]*';
      continue;
    }
    result += escapeRegexCharacter(char);
  }
  result += '$';
  return new RegExp(result);
}

function matchesPattern(pattern, filePath) {
  const normalizedFilePath = filePath.replace(/^\.\//, '').replace(/\\/g, '/');
  return globToRegex(pattern).test(normalizedFilePath);
}

function git(args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function resolveDiffBase() {
  if (process.env.GITHUB_BASE_REF) {
    return `origin/${process.env.GITHUB_BASE_REF}`;
  }
  try {
    return git(['rev-parse', 'HEAD~1']);
  } catch (_error) {
    return 'HEAD';
  }
}

function getChangedFiles() {
  const base = resolveDiffBase();
  try {
    const output = git(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`]);
    return output ? output.split('\n').filter(Boolean) : [];
  } catch (_error) {
    const fallback = git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']);
    return fallback ? fallback.split('\n').filter(Boolean) : [];
  }
}

function parseEventMetadata() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) {
    return {
      labels: [],
      title: '',
      branch: process.env.GITHUB_HEAD_REF || '',
      actor: process.env.GITHUB_ACTOR || '',
    };
  }
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  return {
    labels: (event.pull_request?.labels ?? []).map((label) => label.name),
    title: event.pull_request?.title || '',
    branch: event.pull_request?.head?.ref || process.env.GITHUB_HEAD_REF || '',
    actor: process.env.GITHUB_ACTOR || event.sender?.login || '',
  };
}

function isAgentOrigin(config) {
  const metadata = parseEventMetadata();
  const hasAgentLabel = metadata.labels.some((label) => config.heuristics.labels.includes(label));
  const hasAgentBranch = config.heuristics.branchPrefixes.some((prefix) => metadata.branch.startsWith(prefix));
  const hasAgentTitle = config.heuristics.titleMarkers.some((marker) => metadata.title.toLowerCase().includes(marker.toLowerCase()));
  const isBotActor = metadata.actor.endsWith(config.heuristics.botActorSuffix);
  return hasAgentLabel || hasAgentBranch || hasAgentTitle || isBotActor;
}

function fail(message) {
  process.stderr.write(`agent policy check failed: ${message}\n`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const configPath = path.resolve(args.get('config') || '.github/agent-governance/policy.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const changedFiles = getChangedFiles();

const forbiddenHits = changedFiles.filter((filePath) =>
  config.forbiddenPaths.some((pattern) => matchesPattern(pattern, filePath)),
);
if (forbiddenHits.length > 0) {
  fail(`forbidden paths changed: ${forbiddenHits.join(', ')}`);
}

const auditPath = path.resolve(config.artifactPath || 'AGENT-AUDIT.json');
const auditPresent = fs.existsSync(auditPath);
const auditRequired = auditPresent || isAgentOrigin(config);

if (auditRequired && !auditPresent) {
  fail(`${config.artifactPath || 'AGENT-AUDIT.json'} is required for agent-origin changes`);
}

if (auditPresent) {
  try {
    validateAuditFile({
      auditPath,
      secret: process.env.AGENT_AUDIT_HMAC_SECRET || '',
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

process.stdout.write(`agent policy check passed for ${config.repo} (${changedFiles.length} changed file(s))\n`);
