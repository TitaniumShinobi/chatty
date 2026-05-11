const HOUSING_LISTING_ALLOWLIST = [
  {
    id: 'zillow',
    name: 'Zillow',
    domains: ['zillow.com'],
    mediaHosts: ['photos.zillowstatic.com', 'photos.rdc.moveaws.com', 'zillowstatic.com'],
  },
  {
    id: 'realtor',
    name: 'Realtor.com',
    domains: ['realtor.com'],
    mediaHosts: ['ap.rdcpix.com', 'rdcpix.com', 'static.rdc.moveaws.com'],
  },
  {
    id: 'redfin',
    name: 'Redfin',
    domains: ['redfin.com'],
    mediaHosts: ['ssl.cdn-redfin.com', 'cdn-redfin.com'],
  },
  {
    id: 'apartments',
    name: 'Apartments.com',
    domains: ['apartments.com'],
    mediaHosts: ['images1.apartments.com', 'images.apartments.com', 'aptsimg.apartments.com'],
  },
  {
    id: 'homes',
    name: 'Homes.com',
    domains: ['homes.com'],
    mediaHosts: ['photos.homes.com', 'media.homes.com'],
  },
  {
    id: 'trulia',
    name: 'Trulia',
    domains: ['trulia.com'],
    mediaHosts: ['www.trulia.com', 'img.trulia-cdn.com'],
  },
  {
    id: 'zumper',
    name: 'Zumper',
    domains: ['zumper.com'],
    mediaHosts: ['image.zumper.com', 'photos.zumpercdn.com'],
  },
  {
    id: 'hotpads',
    name: 'HotPads',
    domains: ['hotpads.com'],
    mediaHosts: ['photos.hotpads.com', 'hotpads-img-prod.s3.amazonaws.com'],
  },
  {
    id: 'rent',
    name: 'Rent.com',
    domains: ['rent.com'],
    mediaHosts: ['images.rent.com', 'photos.rent.com'],
  },
  {
    id: 'streeteasy',
    name: 'StreetEasy',
    domains: ['streeteasy.com'],
    mediaHosts: ['img.streeteasy.com'],
  },
];

const HOUSING_SUBJECT_KEYWORDS = [
  'apartment',
  'apartments',
  'house',
  'houses',
  'home',
  'homes',
  'condo',
  'condos',
  'townhome',
  'townhomes',
  'townhouse',
  'townhouses',
  'duplex',
  'triplex',
  'loft',
  'studio',
  'rental',
  'rentals',
  'listing',
  'listings',
  'real estate',
  'open house',
  'for rent',
  'for sale',
  'lease',
  'mortgage',
  'realtor',
  'zillow',
  'redfin',
  'homes.com',
];

const HOUSING_ACTION_KEYWORDS = [
  'rent',
  'lease',
  'buy',
  'purchase',
  'for rent',
  'for sale',
  'looking for',
  'look for',
  'find me',
  'show me',
  'need',
  'want',
  'move to',
  'search',
];

const NON_HOUSING_FALSE_POSITIVES = [
  'house music',
  'housing policy',
  'housing crisis',
  'house boundary',
  'in-house',
];

const WORD_NUMBER_MAP = new Map([
  ['zero', 0],
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
]);

const PROPERTY_TYPE_PATTERNS = [
  ['studio', /\bstudio\b/i],
  ['apartment', /\bapartment(?:s)?\b/i],
  ['house', /\bhouse(?:s)?\b/i],
  ['home', /\bhome(?:s)?\b/i],
  ['condo', /\bcondo(?:s|minium|miniums)?\b/i],
  ['townhouse', /\btown ?house(?:s)?\b/i],
  ['townhome', /\btown ?home(?:s)?\b/i],
  ['duplex', /\bduplex\b/i],
  ['triplex', /\btriplex\b/i],
  ['loft', /\bloft(?:s)?\b/i],
  ['single_family', /\bsingle[- ]family\b/i],
  ['multi_family', /\bmulti[- ]family\b/i],
];

const MUST_HAVE_PATTERNS = [
  ['pet_friendly', /\bpet[- ]friendly\b/i],
  ['dogs_allowed', /\bdogs?\s+(?:ok|allowed|welcome)\b/i],
  ['cats_allowed', /\bcats?\s+(?:ok|allowed|welcome)\b/i],
  ['furnished', /\bfurnished\b/i],
  ['parking', /\bparking\b/i],
  ['garage', /\bgarage\b/i],
  ['laundry', /\blaundry\b/i],
  ['in_unit_laundry', /\bin[- ]unit laundry\b/i],
  ['balcony', /\bbalcony\b/i],
  ['yard', /\byard\b/i],
  ['pool', /\bpool\b/i],
  ['utilities_included', /\butilities included\b/i],
  ['no_fee', /\bno[- ]fee\b/i],
];

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function safeHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function matchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function parseWordNumber(raw) {
  if (!raw) return null;
  const normalized = String(raw).trim().toLowerCase();
  if (WORD_NUMBER_MAP.has(normalized)) {
    return WORD_NUMBER_MAP.get(normalized);
  }
  const numeric = Number.parseFloat(normalized.replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

function parseMoneyValue(raw) {
  if (!raw) return null;
  const normalized = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  const suffix = normalized.endsWith('m') ? 'm' : normalized.endsWith('k') ? 'k' : '';
  const numeric = Number.parseFloat(normalized.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric)) return null;
  if (suffix === 'm') return Math.round(numeric * 1_000_000);
  if (suffix === 'k') return Math.round(numeric * 1_000);
  return Math.round(numeric);
}

function extractLocation(text) {
  const stopPattern = String.raw`(?:under|below|less than|over|above|more than|between|with|w\/|without|studio|loft|pet|pets|dog|dogs|cat|cats|parking|garage|furnished|unfurnished|laundry|pool|balcony|yard|\d+\+?\s*(?:bed|beds|bedroom|bedrooms|bath|baths|bathroom|bathrooms|br|ba)|for\s+rent|for\s+sale|to buy|to rent|$)`;
  const match = text.match(new RegExp(String.raw`\b(?:in|near|around|at)\s+([a-z0-9][a-z0-9\s.,'-]{1,80}?)(?=\s+${stopPattern}|[?!.]|$)`, 'i'));
  if (!match?.[1]) return null;
  return normalizeWhitespace(match[1].replace(/[.,]+$/, ''));
}

function extractPostalCode(text) {
  const match = text.match(/\b\d{5}(?:-\d{4})?\b/);
  return match?.[0] || null;
}

function extractMinMax(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseWordNumber(match[1]);
    }
  }
  return null;
}

function extractBeds(text) {
  if (/\bstudio\b/i.test(text)) {
    return { minBeds: 0, maxBeds: 0 };
  }

  const rangeMatch = text.match(/\b(\d+)\s*(?:-|to)\s*(\d+)\s*(?:bed|beds|bedroom|bedrooms|br)\b/i);
  if (rangeMatch) {
    return {
      minBeds: Number.parseInt(rangeMatch[1], 10),
      maxBeds: Number.parseInt(rangeMatch[2], 10),
    };
  }

  const minBeds = extractMinMax(text, [
    /\b(?:at least|min(?:imum)?|minimum of)\s+(\w+)\s*(?:bed|beds|bedroom|bedrooms|br)\b/i,
    /\b(\w+)\+\s*(?:bed|beds|bedroom|bedrooms|br)\b/i,
  ]);
  if (minBeds !== null) {
    return { minBeds, maxBeds: null };
  }

  const exactMatch = text.match(/\b(\w+)\s*(?:bed|beds|bedroom|bedrooms|br)\b/i);
  if (!exactMatch) return { minBeds: null, maxBeds: null };

  const exactBeds = parseWordNumber(exactMatch[1]);
  if (exactBeds === null) {
    return { minBeds: null, maxBeds: null };
  }

  return { minBeds: exactBeds, maxBeds: exactBeds };
}

function extractBaths(text) {
  const rangeMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:bath|baths|bathroom|bathrooms|ba)\b/i);
  if (rangeMatch) {
    return {
      minBaths: Number.parseFloat(rangeMatch[1]),
      maxBaths: Number.parseFloat(rangeMatch[2]),
    };
  }

  const minBaths = extractMinMax(text, [
    /\b(?:at least|min(?:imum)?|minimum of)\s+(\w+)\s*(?:bath|baths|bathroom|bathrooms|ba)\b/i,
    /\b(\w+)\+\s*(?:bath|baths|bathroom|bathrooms|ba)\b/i,
  ]);
  if (minBaths !== null) {
    return { minBaths, maxBaths: null };
  }

  const exactMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:bath|baths|bathroom|bathrooms|ba)\b/i);
  if (!exactMatch) return { minBaths: null, maxBaths: null };

  const exactBaths = Number.parseFloat(exactMatch[1]);
  return Number.isFinite(exactBaths)
    ? { minBaths: exactBaths, maxBaths: exactBaths }
    : { minBaths: null, maxBaths: null };
}

function extractPrices(text) {
  const between = text.match(/\bbetween\s+\$?\s*([0-9][0-9,.\s]*[km]?)\s*(?:and|to|-)\s+\$?\s*([0-9][0-9,.\s]*[km]?)\b/i);
  if (between) {
    return {
      minPrice: parseMoneyValue(between[1]),
      maxPrice: parseMoneyValue(between[2]),
    };
  }

  const maxPrice = (() => {
    const match = text.match(/\b(?:under|below|less than|max(?:imum)?|up to|budget(?: of)?|no more than)\s+\$?\s*([0-9][0-9,.\s]*[km]?)\b/i);
    return match ? parseMoneyValue(match[1]) : null;
  })();

  const minPrice = (() => {
    const match = text.match(/\b(?:over|above|more than|min(?:imum)?|at least|starting at)\s+\$?\s*([0-9][0-9,.\s]*[km]?)\b/i);
    return match ? parseMoneyValue(match[1]) : null;
  })();

  return { minPrice, maxPrice };
}

function extractSqft(text) {
  const rangeMatch = text.match(/\b(\d{3,5})\s*(?:-|to)\s*(\d{3,5})\s*(?:sq\.?\s*ft\.?|square feet)\b/i);
  if (rangeMatch) {
    return {
      minSqft: Number.parseInt(rangeMatch[1], 10),
      maxSqft: Number.parseInt(rangeMatch[2], 10),
    };
  }

  const minMatch = text.match(/\b(?:at least|min(?:imum)?|minimum of)\s+(\d{3,5})\s*(?:sq\.?\s*ft\.?|square feet)\b/i);
  if (minMatch) {
    return {
      minSqft: Number.parseInt(minMatch[1], 10),
      maxSqft: null,
    };
  }

  return { minSqft: null, maxSqft: null };
}

function extractPropertyTypes(text) {
  return PROPERTY_TYPE_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([propertyType]) => propertyType);
}

function extractMustHave(text) {
  return MUST_HAVE_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([mustHave]) => mustHave);
}

function detectMode(text) {
  const isRent = /\b(?:rent|lease|for rent|rental)\b/i.test(text)
    || /\b(?:apartment|apartments|studio|loft)\b/i.test(text)
    || /(?:\/mo|per month|monthly)/i.test(text);
  const isSale = /\b(?:buy|purchase|for sale|sale|mortgage|open house)\b/i.test(text);
  if (isRent && !isSale) return 'rent';
  if (isSale && !isRent) return 'sale';
  return 'unknown';
}

function detectSearchType(filters) {
  if (filters.mode === 'rent' || filters.mode === 'sale') {
    return 'listing';
  }
  if (filters.propertyTypes.length > 0 || filters.minBeds !== null || filters.maxPrice !== null || filters.location) {
    return 'listing';
  }
  return 'housing';
}

function hasHousingKeyword(text) {
  return HOUSING_SUBJECT_KEYWORDS.some((keyword) => text.includes(keyword));
}

function hasHousingAction(text) {
  return HOUSING_ACTION_KEYWORDS.some((keyword) => text.includes(keyword));
}

function hasFalsePositive(text) {
  return NON_HOUSING_FALSE_POSITIVES.some((phrase) => text.includes(phrase));
}

function extractMoneyFromText(text) {
  const match = text.match(/\$\s*([0-9][0-9,]*(?:\.\d+)?[km]?)/i);
  if (match) return parseMoneyValue(match[1]);

  const rentMatch = text.match(/\b([0-9][0-9,]*(?:\.\d+)?[km]?)\s*(?:\/mo|per month|monthly)\b/i);
  if (rentMatch) return parseMoneyValue(rentMatch[1]);

  return null;
}

function extractNumericAttribute(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return Number.parseFloat(match[1]);
    }
  }
  return null;
}

function extractAddress(text) {
  const streetMatch = text.match(/\b\d{1,5}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,6}\s(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Terrace|Ter|Circle|Cir)\b[^|]*/i);
  if (streetMatch?.[0]) {
    return normalizeWhitespace(streetMatch[0]);
  }

  const firstChunk = normalizeWhitespace(String(text || '').split(/[|]/)[0]);
  if (/\d/.test(firstChunk) || /,\s*[A-Za-z]{2}\b/.test(firstChunk)) {
    return firstChunk;
  }

  return null;
}

function scoreHousingResult(result) {
  const housing = result.housing || {};
  const extracted = housing.extracted || {};
  return [
    housing.isAllowlistedListing ? 100 : 0,
    (housing.matchedFilters || []).length * 10,
    extracted.price ? 4 : 0,
    extracted.beds !== null ? 3 : 0,
    extracted.baths !== null ? 2 : 0,
    result.rankBias || 0,
  ].reduce((sum, value) => sum + value, 0);
}

function compareMinMax(extracted, min, max) {
  if (min !== null && extracted !== null && extracted < min) return false;
  if (max !== null && extracted !== null && extracted > max) return false;
  return true;
}

function collectFilterMatches(extracted, filters) {
  const matchedFilters = [];
  const unmetFilters = [];

  if (filters.location && extracted.address) {
    const locationLower = filters.location.toLowerCase();
    if (extracted.address.toLowerCase().includes(locationLower)) {
      matchedFilters.push('location');
    } else {
      unmetFilters.push('location');
    }
  }

  if (filters.maxPrice !== null || filters.minPrice !== null) {
    if (extracted.price === null) {
      unmetFilters.push('price');
    } else if (compareMinMax(extracted.price, filters.minPrice, filters.maxPrice)) {
      matchedFilters.push('price');
    } else {
      unmetFilters.push('price');
    }
  }

  if (filters.minBeds !== null || filters.maxBeds !== null) {
    if (extracted.beds === null) {
      unmetFilters.push('beds');
    } else if (compareMinMax(extracted.beds, filters.minBeds, filters.maxBeds)) {
      matchedFilters.push('beds');
    } else {
      unmetFilters.push('beds');
    }
  }

  if (filters.minBaths !== null || filters.maxBaths !== null) {
    if (extracted.baths === null) {
      unmetFilters.push('baths');
    } else if (compareMinMax(extracted.baths, filters.minBaths, filters.maxBaths)) {
      matchedFilters.push('baths');
    } else {
      unmetFilters.push('baths');
    }
  }

  return { matchedFilters, unmetFilters };
}

function summarizeHousingFilters(filters) {
  const parts = [];
  if (filters.mode === 'rent') parts.push('rent');
  if (filters.mode === 'sale') parts.push('sale');
  if (filters.propertyTypes.length > 0) parts.push(filters.propertyTypes.join(', '));
  if (filters.location) parts.push(filters.location);
  if (filters.minBeds !== null && filters.maxBeds !== null && filters.minBeds === filters.maxBeds) {
    parts.push(`${filters.minBeds} bed`);
  } else if (filters.minBeds !== null) {
    parts.push(`${filters.minBeds}+ bed`);
  }
  if (filters.minBaths !== null && filters.maxBaths !== null && filters.minBaths === filters.maxBaths) {
    parts.push(`${filters.minBaths} bath`);
  } else if (filters.minBaths !== null) {
    parts.push(`${filters.minBaths}+ bath`);
  }
  if (filters.maxPrice !== null) parts.push(`max $${filters.maxPrice.toLocaleString('en-US')}`);
  if (filters.minPrice !== null) parts.push(`min $${filters.minPrice.toLocaleString('en-US')}`);
  if (filters.mustHave.length > 0) parts.push(`must have ${filters.mustHave.join(', ')}`);
  return parts.join(' | ');
}

function formatListingDetails(result) {
  const extracted = result?.housing?.extracted || {};
  const parts = [];
  if (extracted.price !== null) {
    parts.push(`price $${extracted.price.toLocaleString('en-US')}`);
  }
  if (extracted.beds !== null) {
    parts.push(`${extracted.beds} bd`);
  }
  if (extracted.baths !== null) {
    parts.push(`${extracted.baths} ba`);
  }
  if (extracted.sqft !== null) {
    parts.push(`${extracted.sqft} sqft`);
  }
  if (result?.housing?.provider?.name) {
    parts.push(`provider ${result.housing.provider.name}`);
  }
  return parts.join(' | ');
}

export function normalizeHousingFilters(message) {
  const rawQuery = normalizeWhitespace(message);
  const mode = detectMode(rawQuery);
  const location = extractLocation(rawQuery);
  const { minBeds, maxBeds } = extractBeds(rawQuery);
  const { minBaths, maxBaths } = extractBaths(rawQuery);
  const { minPrice, maxPrice } = extractPrices(rawQuery);
  const { minSqft, maxSqft } = extractSqft(rawQuery);
  const propertyTypes = extractPropertyTypes(rawQuery);
  const mustHave = extractMustHave(rawQuery);

  return {
    rawQuery,
    mode,
    location,
    postalCode: extractPostalCode(rawQuery),
    propertyTypes,
    mustHave,
    minPrice,
    maxPrice,
    minBeds,
    maxBeds,
    minBaths,
    maxBaths,
    minSqft,
    maxSqft,
    searchType: detectSearchType({
      mode,
      location,
      propertyTypes,
      minBeds,
      maxPrice,
    }),
  };
}

export function detectHousingIntent(message) {
  const rawQuery = normalizeWhitespace(message);
  if (!rawQuery) {
    return {
      isHousing: false,
      reason: 'missing_message',
      filters: normalizeHousingFilters(''),
    };
  }

  const lower = rawQuery.toLowerCase();
  const filters = normalizeHousingFilters(rawQuery);
  const filterSignal = [
    filters.location,
    filters.postalCode,
    filters.minPrice,
    filters.maxPrice,
    filters.minBeds,
    filters.minBaths,
    filters.propertyTypes.length > 0 ? 'property_type' : null,
    filters.mustHave.length > 0 ? 'must_have' : null,
  ].some(Boolean);

  const subjectSignal = hasHousingKeyword(lower);
  const actionSignal = hasHousingAction(lower);
  const queryStartsLikeRequest = /^(?:find|show|need|want|looking for|look for|search)\b/i.test(rawQuery);
  const isHousing =
    !hasFalsePositive(lower) &&
    (
      /(?:for rent|for sale|real estate|open house|rental|listing|mortgage)/i.test(rawQuery) ||
      (subjectSignal && (actionSignal || filterSignal || queryStartsLikeRequest)) ||
      (subjectSignal && Boolean(filters.location))
    );

  return {
    isHousing,
    reason: isHousing ? 'housing_plain_language' : 'housing_no_match',
    search_vertical: isHousing ? 'housing' : 'web',
    searchQuery: rawQuery.replace(/[?!.]+$/, ''),
    filters,
  };
}

export function getHousingListingProvider(url) {
  const hostname = safeHostname(url);
  if (!hostname) return null;

  for (const provider of HOUSING_LISTING_ALLOWLIST) {
    if (provider.domains.some((domain) => matchesDomain(hostname, domain))) {
      return {
        id: provider.id,
        name: provider.name,
        domain: provider.domains[0],
        hostname,
      };
    }
  }

  return null;
}

export function isAllowlistedHousingMediaUrl(url) {
  const hostname = safeHostname(url);
  if (!hostname) return false;

  return HOUSING_LISTING_ALLOWLIST.some((provider) =>
    [...provider.domains, ...(provider.mediaHosts || [])].some((domain) => matchesDomain(hostname, domain))
  );
}

export function enrichHousingResults(results, filters = normalizeHousingFilters('')) {
  const normalizedResults = Array.isArray(results) ? results : [];
  const enrichedResults = normalizedResults
    .map((result) => {
      const provider = getHousingListingProvider(result?.url);
      const combinedText = normalizeWhitespace(`${result?.title || ''} ${result?.snippet || ''}`);
      const extracted = {
        address: extractAddress(result?.title || combinedText),
        price: extractMoneyFromText(combinedText),
        beds: extractNumericAttribute(combinedText, [
          /\b(\d+(?:\.\d+)?)\s*(?:bd|bed|beds|bedroom|bedrooms|br)\b/i,
        ]),
        baths: extractNumericAttribute(combinedText, [
          /\b(\d+(?:\.\d+)?)\s*(?:ba|bath|baths|bathroom|bathrooms)\b/i,
        ]),
        sqft: extractNumericAttribute(combinedText, [
          /\b(\d{3,5})\s*(?:sq\.?\s*ft\.?|square feet)\b/i,
        ]),
      };
      const { matchedFilters, unmetFilters } = collectFilterMatches(extracted, filters);

      return {
        ...result,
        housing: {
          provider,
          isAllowlistedListing: Boolean(provider),
          extracted,
          matchedFilters,
          unmetFilters,
        },
      };
    })
    .sort((left, right) => scoreHousingResult(right) - scoreHousingResult(left));

  const curatedListings = enrichedResults.filter((result) => result?.housing?.isAllowlistedListing);
  const fallbackResults = enrichedResults.filter((result) => !result?.housing?.isAllowlistedListing);

  return {
    filters,
    summary: summarizeHousingFilters(filters),
    results: enrichedResults,
    curatedListings,
    fallbackResults,
    curatedCount: curatedListings.length,
    fallbackUsed: curatedListings.length === 0,
    fallbackReason: curatedListings.length === 0 ? 'no_allowlisted_listing_results' : null,
  };
}

export function buildSearchCitations(results, options = {}) {
  const prefix = options.prefix || 'source';
  return (Array.isArray(results) ? results : []).map((result, index) => ({
    id: `${prefix}-${index + 1}`,
    ordinal: index + 1,
    title: result?.title || `Result ${index + 1}`,
    url: result?.url || '',
    domain: safeHostname(result?.url) || null,
    snippet: result?.snippet || '',
    provider: result?.housing?.provider?.id || options.provider || null,
  }));
}

export function buildSearchPacket({
  query,
  executedQuery,
  provider,
  intent_reason,
  search_vertical = 'web',
  results = [],
  citations = [],
  housing = null,
}) {
  if (search_vertical === 'housing') {
    return {
      op: 'housing.results.v1',
      payload: {
        query,
        total: Array.isArray(results) ? results.length : 0,
        region: housing?.filters?.location || null,
        citations,
        results: (Array.isArray(results) ? results : []).map((result) => ({
          title: result?.title || '',
          listingUrl: result?.url || '',
          description: result?.snippet || '',
          source: result?.housing?.provider?.name || provider || null,
          citationIndices: result?.citationIndices || [result?.citationIndex].filter(Boolean),
          address: result?.housing?.extracted?.address || null,
          price: result?.housing?.extracted?.price ?? null,
          bedrooms: result?.housing?.extracted?.beds ?? null,
          bathrooms: result?.housing?.extracted?.baths ?? null,
          sqft: result?.housing?.extracted?.sqft ?? null,
          propertyType: housing?.filters?.propertyTypes?.[0] || null,
          status: housing?.filters?.mode || null,
          photos: Array.isArray(result?.photos)
            ? result.photos.map((photo) => (typeof photo === 'string' ? { url: photo } : photo))
            : [],
        })),
      },
    };
  }

  return {
    op: 'web.evidence.v1',
    payload: {
      engine: provider || 'web',
      results: (Array.isArray(results) ? results : []).map((result, index) => ({
        id: citations[index]?.id || `web-${index + 1}`,
        title: result?.title || '',
        url: result?.url || '',
        snippet: result?.snippet || '',
        intent_reason,
        executed_query: executedQuery || query,
      })),
    },
  };
}

export function buildSearchContextBlock({ provider, results = [], housing = null }) {
  if (!Array.isArray(results) || results.length === 0) {
    return '';
  }

  let block = `\n\n## Web Search Results (${provider || 'web'})\nThe following search results are relevant to the user's question. Use them to provide accurate, up-to-date information and cite sources using [1], [2], etc.\n`;

  if (housing?.summary) {
    block += `\nNormalized housing filters: ${housing.summary}\n`;
    if (housing.fallbackUsed) {
      block += `Curated listing enrichment fallback: ${housing.fallbackReason}.\n`;
    }
  }

  results.forEach((result, index) => {
    block += `\n[${index + 1}] **${result.title}**\nURL: ${result.url}\n${result.snippet || ''}\n`;
    const listingDetails = formatListingDetails(result);
    if (listingDetails) {
      block += `Listing details: ${listingDetails}\n`;
    }
  });

  return block;
}

export { HOUSING_LISTING_ALLOWLIST };
