import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSearchCitations,
  buildSearchPacket,
  detectSearchIntent,
  enrichHousingResults,
  injectSearchContext,
  isAllowlistedHousingMediaUrl,
  normalizeHousingFilters,
} from '../routes/search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readFixture(name) {
  const fixturePath = path.join(__dirname, 'fixtures', name);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

describe('search intent (explicit-only mode)', () => {
  it('does not trigger search for conversational memory prompt', () => {
    const result = detectSearchIntent('Zen, you remember me yet?', { explicitOnly: true });
    assert.equal(result.shouldSearch, false);
    assert.equal(result.intent_reason, 'explicit_only_no_trigger');
  });

  it('triggers search for /search command', () => {
    const result = detectSearchIntent('/search what is zen buddhism', { explicitOnly: true });
    assert.equal(result.shouldSearch, true);
    assert.equal(result.intent_reason, 'explicit_slash_command');
    assert.equal(result.searchQuery, 'what is zen buddhism');
    assert.equal(result.slash_command, 'search');
  });

  it('triggers search for /websearch command while preserving /search alias behavior', () => {
    const result = detectSearchIntent('/websearch 2 bedroom apartments in Detroit under $1500', {
      explicitOnly: true,
    });
    assert.equal(result.shouldSearch, true);
    assert.equal(result.intent_reason, 'explicit_slash_command');
    assert.equal(result.search_vertical, 'housing');
    assert.equal(result.housing_filters.maxPrice, 1500);
    assert.equal(result.slash_command, 'websearch');
  });

  it('keeps prompt unchanged when explicit search trigger is absent', async () => {
    const basePrompt = 'identity prompt';
    const result = await injectSearchContext('Zen, you remember me yet?', basePrompt, { explicitOnly: true });
    assert.equal(result.enhancedPrompt, basePrompt);
    assert.equal(result.search_injected, false);
    assert.equal(result.intent_reason, 'explicit_only_no_trigger');
  });
});

describe('housing plain-language autodetect', () => {
  it('autodetects housing listing requests without requiring slash commands', () => {
    const result = detectSearchIntent('Find me a 2 bedroom apartment in Detroit under $1500 with parking');
    assert.equal(result.shouldSearch, true);
    assert.equal(result.intent_reason, 'housing_plain_language');
    assert.equal(result.search_vertical, 'housing');
    assert.equal(result.housing_filters.location, 'Detroit');
    assert.equal(result.housing_filters.maxPrice, 1500);
    assert.deepEqual(result.housing_filters.propertyTypes, ['apartment']);
    assert.deepEqual(result.housing_filters.mustHave, ['parking']);
  });

  it('does not autodetect non-housing plain-language prompts by default', () => {
    const result = detectSearchIntent('What is zen buddhism?');
    assert.equal(result.shouldSearch, false);
    assert.equal(result.intent_reason, 'heuristic_no_match');
  });
});

describe('housing normalization fixtures', () => {
  const fixture = readFixture('housing-normalization.json');

  for (const testCase of fixture.cases) {
    it(testCase.name, () => {
      const normalized = normalizeHousingFilters(testCase.query);
      for (const [key, value] of Object.entries(testCase.expected)) {
        assert.deepEqual(normalized[key], value);
      }
    });
  }
});

describe('housing enrichment fixtures', () => {
  const fixture = readFixture('housing-enrichment.json');

  for (const testCase of fixture.cases) {
    it(testCase.name, () => {
      const filters = normalizeHousingFilters(testCase.query);
      const enriched = enrichHousingResults(testCase.results, filters);

      assert.equal(enriched.curatedCount, testCase.expected.curatedCount);
      assert.equal(enriched.fallbackUsed, testCase.expected.fallbackUsed);
      assert.equal(enriched.fallbackReason, testCase.expected.fallbackReason);

      if (testCase.expected.firstProvider) {
        assert.equal(enriched.results[0].housing.provider.id, testCase.expected.firstProvider);
      }
      if (testCase.expected.firstPrice !== undefined) {
        assert.equal(enriched.results[0].housing.extracted.price, testCase.expected.firstPrice);
      }
      if (testCase.expected.firstMatchedFilters) {
        assert.deepEqual(enriched.results[0].housing.matchedFilters, testCase.expected.firstMatchedFilters);
      }
    });
  }
});

describe('search packets and citations', () => {
  it('builds structured citations and packets from enriched housing results', () => {
    const query = '2 bedroom apartments in Detroit under $1500';
    const filters = normalizeHousingFilters(query);
    const enriched = enrichHousingResults([
      {
        title: '123 Main St, Detroit, MI 48201 - $1,450/mo | 2 bd | 1 ba | Apartments.com',
        url: 'https://www.apartments.com/123-main-st-detroit-mi/abc123/',
        snippet: 'Pet friendly apartment with parking and laundry.',
      },
    ], filters);

    const citations = buildSearchCitations(enriched.results, { prefix: 'housing', provider: 'serpapi' });
    const packet = buildSearchPacket({
      query,
      executedQuery: query,
      provider: 'serpapi',
      intent_reason: 'housing_plain_language',
      search_vertical: 'housing',
      results: enriched.results,
      citations,
      housing: enriched,
    });

    assert.deepEqual(citations, [
      {
        id: 'housing-1',
        ordinal: 1,
        title: '123 Main St, Detroit, MI 48201 - $1,450/mo | 2 bd | 1 ba | Apartments.com',
        url: 'https://www.apartments.com/123-main-st-detroit-mi/abc123/',
        domain: 'www.apartments.com',
        snippet: 'Pet friendly apartment with parking and laundry.',
        provider: 'apartments',
      },
    ]);

    assert.equal(packet.op, 'housing.results.v1');
    assert.equal(packet.payload.query, query);
    assert.equal(packet.payload.region, 'Detroit');
    assert.equal(packet.payload.results[0].price, 1450);
    assert.equal(packet.payload.results[0].bedrooms, 2);
    assert.equal(packet.payload.citations[0].id, 'housing-1');
  });
});

describe('housing media allowlist', () => {
  it('allows known listing media hosts and rejects unknown ones', () => {
    assert.equal(isAllowlistedHousingMediaUrl('https://photos.zillowstatic.com/fp/example.webp'), true);
    assert.equal(isAllowlistedHousingMediaUrl('https://example.com/not-allowed.webp'), false);
  });
});
