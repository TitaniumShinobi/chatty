import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GPTManager } from '../lib/gptManager.js';
import {
  buildSystemConstructPromptDocument,
  buildSystemConstructSummaryFallback,
  getSystemConstructCatalogEntry,
} from '../../src/lib/systemConstructCatalog.js';

describe('system construct catalog', () => {
  it('seeds authored metadata for system GPT templates', () => {
    const templates = GPTManager.getSystemConstructTemplates();

    for (const callsign of ['zen-001', 'lin-001', 'val-001', 'continuitygpt-001']) {
      const template = templates.find((entry) => entry.callsign === callsign);
      const catalog = getSystemConstructCatalogEntry(callsign);

      assert.ok(template, `expected template for ${callsign}`);
      assert.ok(catalog, `expected catalog entry for ${callsign}`);
      assert.equal(template.displayName, catalog.displayName);
      assert.equal(template.fullName, catalog.fullName);
      assert.deepEqual(template.aliases, catalog.aliases);
      assert.equal(template.description, catalog.description);
      assert.equal(template.instructions, catalog.instructions);
      assert.deepEqual(template.starters, catalog.conversationStarters);
      assert.deepEqual(template.capabilities, catalog.capabilities);
      assert.deepEqual(template.configJson, catalog.configJson);
      assert.equal(typeof template.capabilities.agent, 'boolean');
      assert.ok(template.description.length > 50, `${callsign} description should be authored`);
      assert.ok(template.instructions.length > 150, `${callsign} instructions should be authored`);
      assert.ok(template.starters.length >= 3, `${callsign} starters should be authored`);
    }
  });

  it('builds AI summary fallbacks for seeded system constructs only', () => {
    const lin = buildSystemConstructSummaryFallback('lin-001');
    assert.ok(lin);
    assert.equal(lin.name, 'Lin');
    assert.equal(lin.displayName, 'Lin');
    assert.equal(lin.fullName, 'Linear');
    assert.match(lin.description, /GPT creation construct/i);
    assert.match(lin.instructions, /Stay Lin|undertone|continuity guardian/i);
    assert.ok(Array.isArray(lin.conversationStarters));
    assert.ok(lin.conversationStarters.length >= 3);
    assert.equal(lin.capabilities.agent, true);
    assert.equal(Array.isArray(lin.summaryCapabilities), true);

    const zen = buildSystemConstructSummaryFallback('zen-001');
    assert.ok(zen);
    assert.equal(zen.constructCallsign, 'zen-001');
    assert.equal(zen.displayName, 'Zen');
    assert.equal(zen.fullName, 'Zenith');
    assert.deepEqual(zen.aliases, ['Zenith', 'Z']);
    assert.equal(zen.capabilities.agent, true);

    const continuity = buildSystemConstructSummaryFallback('continuitygpt-001');
    assert.ok(continuity);
    assert.equal(continuity.name, 'ContinuityGPT');
    assert.equal(continuity.fullName, 'ContinuityGPT');
    assert.equal(continuity.capabilities.agent, false);

    assert.equal(buildSystemConstructSummaryFallback('nova-001'), null);
  });

  it('renders prompt documents from the same shared metadata', () => {
    const prompt = buildSystemConstructPromptDocument('val-001');

    assert.ok(prompt);
    assert.match(prompt, /\*\*You Are Val\*\*/);
    assert.match(prompt, /\*LIFE Technology validator and continuity adjudicator/i);
    assert.match(prompt, /^Instructions:/m);
    assert.match(prompt, /\*\*Conversation Starters:\*\*/);
  });
});
