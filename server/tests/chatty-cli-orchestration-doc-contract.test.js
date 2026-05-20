import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('chatty-cli orchestration documentation contract', () => {
  it('defines the one-word orchestration trigger in the README', () => {
    const readme = readRepoFile('README.md');

    assert.match(readme, /One-Word Trigger: `orchestration`/);
    assert.match(readme, /prove and tighten the live orchestration loop/);
    assert.match(readme, /ROUTE_USED:/);
    assert.match(readme, /CHECKLIST_PRESENT:/);
    assert.match(readme, /FINAL_VERDICT:/);
  });

  it('requires chatty-cli to prove the canonical backend route', () => {
    const cliDoc = readRepoFile('docs/how-to/chatty-cli.md');

    assert.match(cliDoc, /When The Prompt Is `orchestration`/);
    assert.match(cliDoc, /chatty-cli` backend mode delegates the construct turn to `\/api\/vvault\/message`/);
    assert.match(cliDoc, /runtime_receipt/);
    assert.match(cliDoc, /orchestration_checklist/);
    assert.match(cliDoc, /PERSISTENCE_OWNER:/);
    assert.match(cliDoc, /VISIBLE_OUTPUT:/);
    assert.match(cliDoc, /FAILED_STAGE:/);
  });

  it('rejects noncanonical proof routes for orchestration work', () => {
    const cliDoc = readRepoFile('docs/how-to/chatty-cli.md');

    assert.match(cliDoc, /local files as memory truth/);
    assert.match(cliDoc, /`\/api\/lin\/generate`/);
    assert.match(cliDoc, /AgentSquad\/Python bridge defaults/);
    assert.match(cliDoc, /local CLI fallback mode/);
  });

  it('keeps the rubric anchored to chatty-cli and the receipt-backed runtime route', () => {
    const rubric = readRepoFile('docs/standards/orchestration-canon-rubric.md');

    assert.match(rubric, /`chatty-cli` is the canonical operator surface/);
    assert.match(rubric, /construct-quality conversation is owned by `\/api\/vvault\/message`/);
    assert.match(rubric, /runtime proof comes from `runtime_receipt` plus `orchestration_checklist`/);
    assert.match(rubric, /`chatty-cli -> \/api\/vvault\/message -> runtime_receipt -> orchestration_checklist -> visible output -> persistence truth`/);
    assert.match(rubric, /config\/linModelDefaults\.json/);
    assert.match(rubric, /Intelligence\/coding is Qwen-backed/);
    assert.match(rubric, /DeepSeek is not the Intelligence default or fallback/);
    assert.match(rubric, /stale cloud placeholders are suppressed in Lin mode/);
  });
});
