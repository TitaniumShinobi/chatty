import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectCodingIntent, resolveRouteContextBudgetProfile } from '../routes/vvault.js';

describe('detectCodingIntent', () => {
  const positivePrompts = [
    'write a JavaScript function that formats a date',
    'generate a TypeScript helper for parsing model ids',
    'implement a Python script that reads a CSV',
    'code a small React component for the settings row',
  ];

  for (const prompt of positivePrompts) {
    it(`routes natural code request to coding seat: ${prompt}`, () => {
      const result = detectCodingIntent(prompt);

      assert.equal(result.codingIntent, true);
      assert.equal(result.reason, 'natural_code_request');
    });
  }

  const negativePrompts = [
    'write me a short note',
    'make this sound warmer',
    'tell me what you remember',
  ];

  for (const prompt of negativePrompts) {
    it(`keeps non-code request on conversation seat: ${prompt}`, () => {
      const result = detectCodingIntent(prompt);

      assert.equal(result.codingIntent, false);
      assert.equal(result.reason, 'none');
    });
  }
});

describe('resolveRouteContextBudgetProfile', () => {
  it('keeps tiny turns tiny for short social contact', () => {
    const result = resolveRouteContextBudgetProfile({ message: 'hello', requestedSeat: 'smalltalk' });
    assert.equal(result.profile, 'tiny_turn');
    assert.equal(result.memory_query_detected, false);
  });

  it('uses standard profile for coding and image turns', () => {
    assert.equal(
      resolveRouteContextBudgetProfile({ message: 'fix this endpoint', codingMode: true, requestedSeat: 'coding' }).profile,
      'standard_turn',
    );
    assert.equal(
      resolveRouteContextBudgetProfile({ message: 'what is in this image?', hasImages: true }).profile,
      'standard_turn',
    );
  });

  it('escalates memory, evidence, and receipt turns to evidence profile', () => {
    assert.equal(
      resolveRouteContextBudgetProfile({ message: 'do you remember the canonical transcript path?' }).profile,
      'evidence_turn',
    );
    assert.equal(
      resolveRouteContextBudgetProfile({ message: 'show the exact receipt and source proof' }).profile,
      'evidence_turn',
    );
    assert.equal(
      resolveRouteContextBudgetProfile({ message: 'what is the persistence_owner in the runtime receipt?' }).profile,
      'evidence_turn',
    );
  });
});
