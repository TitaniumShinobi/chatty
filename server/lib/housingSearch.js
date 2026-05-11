import { Buffer } from 'node:buffer';

const HOUSING_ALLOWLIST = [
  { domain: 'zillow.com', label: 'Zillow' },
  { domain: 'realtor.com', label: 'Realtor.com' },
  { domain: 'apartments.com', label: 'Apartments.com' },
  { domain: 'redfin.com', label: 'Redfin' },
  { domain: 'loopnet.com', label: 'LoopNet' },
  { domain: 'seniorhousingnet.com', label: 'SeniorHousingNet' },
];

const LISTING_CACHE_TTL_MS = 15 * 60 * 1000;
const MEDIA_CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_HOUSING_RESULTS = 6;
const listingCache = new Map();
const mediaCache = new Map();

const PROPERTY_TYPE_PATTERNS = [
  { type: 'senior', pattern: /\b(?:senior|55\+|retirement|assisted living|independent living)\b/i },
  { type: 'commercial', pattern: /\b(?:commercial|office|retail|warehouse|industrial|storefront|land)\b/i },
  { type: 'multi-family', pattern: /\b(?:multi[-\s]?family|duplex|triplex|quadplex|fourplex)\b/i },
  { type: 'townhome', pattern: /\b(?:townhome|townhouse)\b/i },
  { type: 'condo', pattern: /\b(?:condo|condominium)\b/i },
  { type: 'apartment', pattern: /\b(?:apartment|apartments|studio|loft|rental|rentals|flat)\b/i },
  { type: 'single-family', pattern: /\b(?:single[-\s]?family|house|houses|home|homes)\b/i },
];

const HOUSING_KEYWORD_PATTERN = /\b(?:housing|home|homes|house|houses|apartment|apartments|condo|condos|townhome|townhouse|multi[-\s]?family|duplex|triplex|commercial|office|retail|warehouse|senior|retirement|assisted living|independent living|for rent|for sale|lease|listing|listings|real estate)\b/i;

function normalizeDomain(value) {
  if (!value || typeof value !== 'string') return '';
  return value.toLowerCase().replace(/^www\./, '');
}

function getUrlHostname(url) {
  try {
    return normalizeDomain(new URL(url).hostname);
  } catch {
    return '';
  }
}

function getAllowlistEntry(url) {
  const hostname = getUrlHostname(url);
  return HOUSING_ALLOWLIST.find((entry) => hostname === entry.domain || hostname.endsWith(`.${entry.domain}`)) || null;
}

function isAllowlistedListing(url) {
  return Boolean(getAllowlistEntry(url));
}

function canonicalizeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = '';
    const removableParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'gclid',
      'fbclid',
      'msclkid',
      'searchQueryState',
      'from',
    ];
    removableParams.forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function buildMediaProxyPath(url) {
  return `/api/search/media?url=${encodeURIComponent(url)}`;
}

function formatCompactPrice(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

function parseMagnitude(rawValue) {
  if (rawValue == null) return null;
  const text = String(rawValue).trim().toLowerCase().replace(/[$,\s]/g, '');
  if (!text) return null;
  const multiplier = text.endsWith('m') ? 1_000_000 : text.endsWith('k') ? 1_000 : 1;
  const base = multiplier === 1 ? text : text.slice(0, -1);
  const parsed = Number(base);
  if (!Number.isFinite(parsed)) return null;
  return parsed * multiplier;
}

function cleanLocationText(value) {
  if (!value) return null;
  return String(value)
    .replace(/\b(?:under|below|over|above|max(?:imum)?|min(?:imum)?|with|priced|budget|cheap|affordable|luxury|nearby)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim() || null;
}

function parseHousingLocation(text) {
  if (!text) return null;
  const locationMatch = text.match(/\b(?:in|near|around|at)\s+([a-z0-9\s.'-]+(?:,\s*[a-z]{2})?)/i);
  if (!locationMatch) return null;
  return cleanLocationText(locationMatch[1]);
}

function extractNumericMatch(text, pattern) {
  const match = text.match(pattern);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferPropertyType(text) {
  for (const entry of PROPERTY_TYPE_PATTERNS) {
    if (entry.pattern.test(text)) return entry.type;
  }
  return 'other';
}

function inferListingMode(text, propertyType) {
  if (propertyType === 'commercial') return 'commercial';
  if (propertyType === 'senior') return 'senior';
  if (/\b(?:rent|rental|rentals|lease|for rent)\b/i.test(text)) return 'rent';
  if (/\b(?:buy|purchase|purchasing|for sale|sale|own|ownership)\b/i.test(text)) return 'buy';
  if (propertyType === 'apartment') return 'rent';
  if (propertyType === 'single-family' || propertyType === 'multi-family' || propertyType === 'condo' || propertyType === 'townhome') {
    return 'buy';
  }
  return 'other';
}

function parsePriceFilters(text) {
  const maxMatch = text.match(/\b(?:under|below|max(?:imum)?|up to|less than)\s+\$?([\d.,]+(?:k|m)?)\b/i);
  const minMatch = text.match(/\b(?:over|above|min(?:imum)?|at least|more than)\s+\$?([\d.,]+(?:k|m)?)\b/i);
  return {
    max: parseMagnitude(maxMatch?.[1]),
    min: parseMagnitude(minMatch?.[1]),
    hint: /\b(?:cheap|cheapest|budget|affordable|low cost)\b/i.test(text)
      ? 'budget'
      : /\b(?:luxury|upscale|premium)\b/i.test(text)
      ? 'luxury'
      : null,
  };
}

function normalizePropertyTypeLabel(propertyType) {
  switch (propertyType) {
    case 'single-family':
      return 'single family home';
    case 'multi-family':
      return 'multi family property';
    case 'townhome':
      return 'townhome';
    case 'condo':
      return 'condo';
    case 'apartment':
      return 'apartment';
    case 'commercial':
      return 'commercial property';
    case 'senior':
      return 'senior housing';
    default:
      return 'housing';
  }
}

function normalizeHousingSearch(message) {
  if (!message || typeof message !== 'string') {
    return {
      isHousing: false,
      normalizedQuery: null,
      filters: null,
    };
  }

  const lower = message.toLowerCase();
  const propertyType = inferPropertyType(lower);
  const listingMode = inferListingMode(lower, propertyType);
  const beds = extractNumericMatch(lower, /\b(\d+(?:\.\d+)?)\s*(?:bed|beds|bedroom|bedrooms|br)\b/i);
  const baths = extractNumericMatch(lower, /\b(\d+(?:\.\d+)?)\s*(?:bath|baths|bathroom|bathrooms|ba)\b/i);
  const location = parseHousingLocation(lower);
  const price = parsePriceFilters(lower);

  const filters = {
    listingMode,
    propertyType,
    beds,
    baths,
    location,
    price,
  };

  const hasHousingSignal =
    HOUSING_KEYWORD_PATTERN.test(lower) ||
    propertyType !== 'other' ||
    beds != null ||
    baths != null;
  const hasSearchableScope =
    Boolean(location) ||
    beds != null ||
    baths != null ||
    listingMode !== 'other' ||
    Boolean(price.max || price.min || price.hint);

  if (!hasHousingSignal || !hasSearchableScope) {
    return {
      isHousing: false,
      normalizedQuery: null,
      filters,
    };
  }

  const normalizedParts = [];
  if (beds != null) normalizedParts.push(`${beds} bedroom`);
  if (baths != null) normalizedParts.push(`${baths} bathroom`);
  normalizedParts.push(normalizePropertyTypeLabel(propertyType));

  if (listingMode === 'rent') normalizedParts.push('for rent');
  if (listingMode === 'buy') normalizedParts.push('for sale');
  if (listingMode === 'commercial') normalizedParts.push('commercial real estate');
  if (listingMode === 'senior') normalizedParts.push('senior living');
  if (location) normalizedParts.push(`in ${location}`);
  if (price.max) normalizedParts.push(`under ${formatCompactPrice(price.max)}`);
  if (price.min) normalizedParts.push(`over ${formatCompactPrice(price.min)}`);
  if (price.hint === 'budget') normalizedParts.push('affordable');
  if (price.hint === 'luxury') normalizedParts.push('luxury');

  return {
    isHousing: true,
    normalizedQuery: normalizedParts.join(' ').replace(/\s+/g, ' ').trim(),
    filters,
  };
}

function selectAllowlistDomains(filters) {
  if (filters.propertyType === 'commercial' || filters.listingMode === 'commercial') {
    return ['loopnet.com', 'realtor.com', 'redfin.com'];
  }
  if (filters.propertyType === 'senior' || filters.listingMode === 'senior') {
    return ['seniorhousingnet.com', 'zillow.com', 'realtor.com'];
  }
  if (filters.listingMode === 'rent' || filters.propertyType === 'apartment') {
    return ['apartments.com', 'zillow.com', 'realtor.com'];
  }
  return ['zillow.com', 'realtor.com', 'redfin.com'];
}

function buildHousingQueries(message, normalizedQuery, filters) {
  const queries = [];
  const baseQuery = normalizedQuery || message.trim();
  queries.push(baseQuery);

  const domainQueries = selectAllowlistDomains(filters).map((domain) => `${baseQuery} site:${domain}`);
  queries.push(...domainQueries);

  if (filters.location && filters.propertyType === 'apartment') {
    queries.push(`apartments in ${filters.location} site:apartments.com`);
  }
  if (filters.location && filters.propertyType === 'commercial') {
    queries.push(`commercial property in ${filters.location} site:loopnet.com`);
  }
  if (filters.location && filters.propertyType === 'senior') {
    queries.push(`senior living in ${filters.location} site:seniorhousingnet.com`);
  }

  return Array.from(new Set(queries)).slice(0, 4);
}

function isLikelyListingResult(result, filters) {
  const haystack = `${result.title || ''} ${result.snippet || ''} ${result.url || ''}`.toLowerCase();
  if (filters.propertyType === 'commercial' && /\b(?:commercial|office|retail|warehouse|industrial)\b/.test(haystack)) return true;
  if (filters.propertyType === 'senior' && /\b(?:senior|retirement|assisted living|independent living)\b/.test(haystack)) return true;
  if (filters.listingMode === 'rent' && /\b(?:rent|rental|lease|apartment|apartments)\b/.test(haystack)) return true;
  if (filters.listingMode === 'buy' && /\b(?:sale|for sale|home|house|condo|townhome)\b/.test(haystack)) return true;
  return true;
}

function dedupeSearchResults(results) {
  const seen = new Set();
  const deduped = [];
  for (const result of results) {
    const canonicalUrl = canonicalizeUrl(result.url);
    if (!canonicalUrl || seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);
    deduped.push({ ...result, canonicalUrl });
  }
  return deduped;
}

function safeJsonParse(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function collectJsonLdNodes(node, bucket) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((entry) => collectJsonLdNodes(entry, bucket));
    return;
  }
  if (typeof node !== 'object') return;
  bucket.push(node);
  if (Array.isArray(node['@graph'])) {
    node['@graph'].forEach((entry) => collectJsonLdNodes(entry, bucket));
  }
}

function parseJsonLdNodes(html) {
  const nodes = [];
  const matches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of matches) {
    const parsed = safeJsonParse(match[1].trim());
    if (parsed) collectJsonLdNodes(parsed, nodes);
  }
  return nodes;
}

function extractStringValues(value) {
  if (Array.isArray(value)) return value.flatMap((entry) => extractStringValues(entry));
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') {
    return [
      value.url,
      value.contentUrl,
      value.src,
    ].flatMap((entry) => extractStringValues(entry));
  }
  return [];
}

function formatAddress(address) {
  if (!address) return null;
  if (typeof address === 'string') return address.trim();
  if (typeof address !== 'object') return null;
  const parts = [
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
    address.postalCode,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function firstDefined(...values) {
  return values.find((value) => value != null && value !== '');
}

function extractListingMetadataFromHtml(html, listingUrl) {
  const jsonLdNodes = parseJsonLdNodes(html);
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const ogDescriptionMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const ogImageMatches = Array.from(html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi)).map((match) => match[1]);

  const metadata = {
    canonicalUrl: canonicalMatch?.[1] ? canonicalizeUrl(canonicalMatch[1]) : canonicalizeUrl(listingUrl),
    title: ogTitleMatch?.[1] || null,
    snippet: ogDescriptionMatch?.[1] || null,
    address: null,
    priceText: null,
    beds: null,
    baths: null,
    propertyType: null,
    photoUrls: ogImageMatches,
  };

  for (const node of jsonLdNodes) {
    metadata.title = firstDefined(metadata.title, node.name, node.headline);
    metadata.address = firstDefined(metadata.address, formatAddress(node.address));
    metadata.propertyType = firstDefined(
      metadata.propertyType,
      node.accommodationCategory,
      node.additionalType,
      typeof node['@type'] === 'string' ? node['@type'] : null,
    );
    metadata.beds = firstDefined(
      metadata.beds,
      node.numberOfBedrooms,
      node.numberOfRooms,
      node.numberOfBedroomsTotal,
    );
    metadata.baths = firstDefined(
      metadata.baths,
      node.numberOfBathroomsTotal,
      node.numberOfBathrooms,
    );

    const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
    const priceValue = firstDefined(offer?.price, node.price);
    if (metadata.priceText == null && priceValue != null) {
      metadata.priceText = typeof priceValue === 'number' || /^\d/.test(String(priceValue))
        ? formatCompactPrice(Number(priceValue)) || String(priceValue)
        : String(priceValue);
    }

    metadata.photoUrls.push(...extractStringValues(node.image));
    if (offer?.url && !metadata.canonicalUrl) {
      metadata.canonicalUrl = canonicalizeUrl(offer.url);
    }
  }

  const titleAddressMatch = metadata.title?.match(/^([^|,-]+(?:,\s*[A-Z]{2})?)/);
  metadata.address = metadata.address || titleAddressMatch?.[1]?.trim() || null;

  const photoUrls = Array.from(new Set(metadata.photoUrls))
    .filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url))
    .slice(0, 8);

  return {
    ...metadata,
    photoUrls,
  };
}

async function fetchWithTimeout(url, init = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function guessMimeType(url) {
  const lower = String(url || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function buildFallbackListing(result, filters, citationIndex) {
  const allowlistEntry = getAllowlistEntry(result.url);
  const domain = getUrlHostname(result.url);
  const haystack = `${result.title || ''} ${result.snippet || ''}`;
  const beds = extractNumericMatch(haystack, /\b(\d+(?:\.\d+)?)\s*(?:bed|beds|bedroom|bedrooms|br)\b/i);
  const baths = extractNumericMatch(haystack, /\b(\d+(?:\.\d+)?)\s*(?:bath|baths|bathroom|bathrooms|ba)\b/i);
  const priceMatch = haystack.match(/\$[\d,.]+(?:\/mo)?/);

  return {
    id: `listing-${citationIndex}`,
    url: canonicalizeUrl(result.url),
    domain,
    title: result.title || allowlistEntry?.label || domain || 'Property listing',
    address: null,
    priceText: priceMatch?.[0] || null,
    beds,
    baths,
    propertyType: filters.propertyType,
    listingMode: filters.listingMode,
    snippet: result.snippet || '',
    photos: [],
    citationIndexes: [citationIndex],
    enrichmentStatus: 'fallback',
  };
}

async function enrichListingResult(result, filters, citationIndex) {
  const allowlistEntry = getAllowlistEntry(result.url);
  if (!allowlistEntry) {
    return buildFallbackListing(result, filters, citationIndex);
  }

  const canonicalUrl = canonicalizeUrl(result.url);
  const cached = listingCache.get(canonicalUrl);
  if (cached && Date.now() - cached.timestamp < LISTING_CACHE_TTL_MS) {
    return {
      ...cached.value,
      citationIndexes: [citationIndex],
    };
  }

  try {
    const response = await fetchWithTimeout(canonicalUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(`Listing HTML fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const metadata = extractListingMetadataFromHtml(html, canonicalUrl);
    const listing = {
      id: `listing-${citationIndex}`,
      url: metadata.canonicalUrl || canonicalUrl,
      domain: normalizeDomain(allowlistEntry.domain),
      title: metadata.title || result.title || allowlistEntry.label || 'Property listing',
      address: metadata.address || null,
      priceText: metadata.priceText || null,
      beds: metadata.beds != null ? Number(metadata.beds) : null,
      baths: metadata.baths != null ? Number(metadata.baths) : null,
      propertyType: metadata.propertyType || filters.propertyType,
      listingMode: filters.listingMode,
      snippet: metadata.snippet || result.snippet || '',
      photos: metadata.photoUrls.map((url, index) => ({
        id: `listing-${citationIndex}-photo-${index + 1}`,
        url: buildMediaProxyPath(url),
        sourceUrl: url,
        alt: metadata.title || result.title || `Listing photo ${index + 1}`,
        mimeType: guessMimeType(url),
      })),
      citationIndexes: [citationIndex],
      enrichmentStatus: metadata.photoUrls.length > 0 ? 'enriched' : 'metadata_only',
    };

    listingCache.set(canonicalUrl, {
      timestamp: Date.now(),
      value: listing,
    });

    return listing;
  } catch (error) {
    return {
      ...buildFallbackListing(result, filters, citationIndex),
      enrichmentStatus: 'fallback_error',
      enrichmentError: error.message,
    };
  }
}

async function performHousingSearch(message, performSearch, options = {}) {
  const normalized = normalizeHousingSearch(message);
  if (!normalized.isHousing) return null;

  const queries = buildHousingQueries(message, normalized.normalizedQuery, normalized.filters);
  const searchResponses = await Promise.all(
    queries.map(async (query) => {
      try {
        const response = await performSearch(query, options.numResults || 5);
        return {
          query,
          ...response,
        };
      } catch (error) {
        return {
          query,
          source: 'error',
          results: [],
          error: error.message,
        };
      }
    }),
  );

  const flattenedResults = searchResponses.flatMap((response) =>
    (response.results || []).map((result) => ({
      ...result,
      query: response.query,
      searchSource: response.source,
    })),
  );

  const candidateResults = dedupeSearchResults(flattenedResults)
    .filter((result) => isLikelyListingResult(result, normalized.filters))
    .sort((left, right) => {
      const leftAllowlisted = isAllowlistedListing(left.url) ? 1 : 0;
      const rightAllowlisted = isAllowlistedListing(right.url) ? 1 : 0;
      return rightAllowlisted - leftAllowlisted;
    })
    .slice(0, MAX_HOUSING_RESULTS);

  const citations = candidateResults.map((result, index) => ({
    index: index + 1,
    title: result.title || getUrlHostname(result.url) || `Result ${index + 1}`,
    url: canonicalizeUrl(result.url),
    domain: getUrlHostname(result.url),
  }));

  const enrichedResults = await Promise.all(
    candidateResults.map((result, index) => enrichListingResult(result, normalized.filters, index + 1)),
  );

  return {
    query: message.trim(),
    normalizedQuery: normalized.normalizedQuery,
    mode: normalized.filters.listingMode,
    filters: normalized.filters,
    queries,
    citations,
    results: enrichedResults,
    enrichedCount: enrichedResults.filter((result) => result.enrichmentStatus === 'enriched').length,
  };
}

function extractStructuredCitations(content, fallbackResults = []) {
  if (!content || typeof content !== 'string') {
    return { content: '', citations: [] };
  }

  const citations = [];
  const sourceBlockRegex = /\n---\n\s*\*\*Sources:?\*\*\s*\n([\s\S]*?)$/i;
  const altSourceRegex = /\n\s*(?:Sources|References):?\s*\n((?:\s*\[\d+\].*\n?)+)$/i;
  const blockMatch = content.match(sourceBlockRegex) || content.match(altSourceRegex);
  let cleanContent = content;

  if (blockMatch) {
    cleanContent = content.slice(0, blockMatch.index).trimEnd();
    const sourceLines = blockMatch[1].trim().split('\n');
    for (const line of sourceLines) {
      const match = line.match(/\[(\d+)\]\s*\[?(.*?)\]?\s*(?:\((https?:\/\/[^\s)]+)\))?/);
      if (!match) continue;
      citations.push({
        index: Number(match[1]),
        title: match[2].replaceAll('[', '').replaceAll(']', '').trim() || `Source ${match[1]}`,
        url: match[3] || '',
        domain: getUrlHostname(match[3] || ''),
      });
    }
  }

  if (citations.length === 0 && Array.isArray(fallbackResults) && fallbackResults.length > 0) {
    return {
      content: cleanContent,
      citations: fallbackResults.slice(0, 5).map((result, index) => ({
        index: index + 1,
        title: result.title || `Source ${index + 1}`,
        url: result.url || result.link || '',
        domain: getUrlHostname(result.url || result.link || ''),
      })),
    };
  }

  return { content: cleanContent, citations };
}

function buildSearchResponsePackets({ aiResponse, searchResults = [], housingSearch = null }) {
  if (!aiResponse || typeof aiResponse !== 'string') return null;

  const fallbackCitations = housingSearch?.citations?.length
    ? housingSearch.citations
    : searchResults;
  const normalizedAnswer = extractStructuredCitations(aiResponse, fallbackCitations);
  const citations = normalizedAnswer.citations || [];
  const cleanContent = normalizedAnswer.content || aiResponse;

  const packets = [];

  if (housingSearch?.results?.length) {
    const housingResults = housingSearch.results.map((result) => ({
      ...result,
      citationIndexes: Array.isArray(result.citationIndexes) && result.citationIndexes.length > 0
        ? result.citationIndexes
        : [citations.find((citation) => canonicalizeUrl(citation.url) === canonicalizeUrl(result.url))?.index].filter(Boolean),
    }));

    packets.push({
      op: 'housing.results.v1',
      payload: {
        query: housingSearch.query,
        normalizedQuery: housingSearch.normalizedQuery,
        mode: housingSearch.mode,
        filters: housingSearch.filters,
        results: housingResults,
        citations,
      },
    });
  }

  packets.push({
    op: 'answer.v1',
    payload: {
      content: cleanContent,
      ...(citations.length > 0 ? { citations } : {}),
    },
  });

  return {
    content: cleanContent,
    citations,
    packets,
  };
}

async function fetchSearchMedia(url) {
  const canonicalUrl = canonicalizeUrl(url);
  const cached = mediaCache.get(canonicalUrl);
  if (cached && Date.now() - cached.timestamp < MEDIA_CACHE_TTL_MS) {
    return cached.value;
  }

  const response = await fetchWithTimeout(canonicalUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Media fetch failed: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || guessMimeType(canonicalUrl);
  const cacheControl = response.headers.get('cache-control') || `private, max-age=${Math.floor(MEDIA_CACHE_TTL_MS / 1000)}`;
  const buffer = Buffer.from(await response.arrayBuffer());
  const value = { buffer, contentType, cacheControl };
  mediaCache.set(canonicalUrl, {
    timestamp: Date.now(),
    value,
  });
  return value;
}

export {
  HOUSING_ALLOWLIST,
  buildSearchResponsePackets,
  buildMediaProxyPath,
  canonicalizeUrl,
  extractListingMetadataFromHtml,
  extractStructuredCitations,
  fetchSearchMedia,
  normalizeHousingSearch,
  performHousingSearch,
};
