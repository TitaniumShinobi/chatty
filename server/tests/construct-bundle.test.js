import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  CONSTRUCT_BUNDLE_SPEC,
  buildConstructBundleEntries,
  writeConstructBundleEntries,
} from '../lib/constructBundle.js';

describe('construct bundle contract', () => {
  it('builds the minimum complete system construct bundle for Val', () => {
    const entries = buildConstructBundleEntries('val-001');
    const filenames = new Set(entries.map((entry) => entry.filename));

    for (const relativePath of CONSTRUCT_BUNDLE_SPEC.generated) {
      const expected = `instances/val-001/${relativePath.replace('{callsign}', 'val-001')}`;
      assert.equal(filenames.has(expected), true, `expected bundle file ${expected}`);
    }

    const promptJsonEntry = entries.find((entry) => entry.filename.endsWith('/identity/prompt.json'));
    assert.ok(promptJsonEntry, 'expected prompt.json entry');
    const promptJson = JSON.parse(promptJsonEntry.content);
    assert.equal(promptJson.displayName, 'Val');
    assert.equal(promptJson.fullName, 'Validator');
    assert.equal(promptJson.capabilities.agent, true);

    const toneProfileEntry = entries.find((entry) => entry.filename.endsWith('/config/tone_profile.json'));
    assert.ok(toneProfileEntry, 'expected tone_profile.json entry');
  });

  it('syncs generated files without stomping authored identity placeholders', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'construct-bundle-'));
    const initialEntries = buildConstructBundleEntries('val-001');

    try {
      await writeConstructBundleEntries(tempRoot, initialEntries, { syncGenerated: false });

      const voicePath = path.join(tempRoot, 'instances', 'val-001', 'identity', 'voice.json');
      const promptJsonPath = path.join(tempRoot, 'instances', 'val-001', 'identity', 'prompt.json');

      await fs.writeFile(voicePath, JSON.stringify({ schemaVersion: 1, instructions: 'Keep this exactly.' }, null, 2), 'utf8');

      const updatedEntries = buildConstructBundleEntries('val-001', {
        description: 'Updated validator description.',
      });

      await writeConstructBundleEntries(tempRoot, updatedEntries, { syncGenerated: true });

      const voiceContent = JSON.parse(await fs.readFile(voicePath, 'utf8'));
      const promptJson = JSON.parse(await fs.readFile(promptJsonPath, 'utf8'));

      assert.equal(voiceContent.instructions, 'Keep this exactly.');
      assert.equal(promptJson.description, 'Updated validator description.');
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
