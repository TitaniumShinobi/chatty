import { detectTone, ToneLabel, ToneDetectionResult, TONE_LABELS } from './toneDetector';

type Fetcher = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

export interface MemoryRetrievalOptions {
  constructCallsign: string;
  semanticQuery: string;
  toneHints?: ToneLabel[];
  limit?: number;
  minToneConfidence?: number;
  metadataTags?: string[];
  includeDiagnostics?: boolean;
  // Anchor-based query options
  queryMode?: 'semantic' | 'anchor';
  anchorTypes?: Array<'claim' | 'vow' | 'boundary' | 'core-statement' | 'defining-moment' | 'relationship-marker'>;
  minSignificance?: number;
  relationshipPatterns?: string[];
  emotionalState?: string;
}

export interface VVAULTMemoryHit {
  id?: string;
  context?: string;
  response?: string;
  metadata?: Record<string, any>;
  relevance?: number;
  detectedTone?: ToneDetectionResult;
}

export interface MemoryRetrievalResult {
  memories: VVAULTMemoryHit[];
  diagnostics?: {
    requestUrl: string;
    rawCount: number;
    filteredCount: number;
    toneHints?: ToneLabel[];
  };
}

interface VVAULTQueryResponse {
  ok: boolean;
  memories?: Array<{
    id?: string;
    context?: string;
    response?: string;
    metadata?: Record<string, any>;
    relevance?: number;
    tags?: string[];
  }>;
  error?: string;
}

export class VVAULTRetrievalWrapper {
  private fetcher: Fetcher;
  private baseUrl: string;

  constructor(options: { baseUrl?: string; fetcher?: Fetcher } = {}) {
    this.baseUrl = options.baseUrl || '/api/vvault/identity';
    this.fetcher = options.fetcher || fetch;
  }

  async retrieveMemories(options: MemoryRetrievalOptions): Promise<MemoryRetrievalResult> {
    const { 
      constructCallsign, 
      semanticQuery, 
      toneHints = [], 
      limit = 20, 
      minToneConfidence = 0.35, 
      metadataTags = [], 
      includeDiagnostics,
      queryMode = 'semantic',
      anchorTypes = [],
      minSignificance = 0,
      relationshipPatterns = [],
      emotionalState
    } = options;

    if (!constructCallsign) {
      throw new Error('constructCallsign is required for VVAULT retrieval');
    }

    const queryParts = [semanticQuery.trim()];
    if (toneHints.length) {
      queryParts.push(`tone ${toneHints.join(' ')}`);
    }
    if (metadataTags.length) {
      queryParts.push(`tags ${metadataTags.join(' ')}`);
    }

    const query = queryParts.filter(Boolean).join(' ').trim() || '*';

    // Build query URL with anchor-based parameters
    const params = new URLSearchParams({
      constructCallsign,
      query,
      limit: limit.toString(),
    });
    
    if (queryMode === 'anchor') {
      params.append('queryMode', 'anchor');
      if (anchorTypes.length > 0) {
        params.append('anchorTypes', anchorTypes.join(','));
      }
      if (minSignificance > 0) {
        params.append('minSignificance', minSignificance.toString());
      }
      if (relationshipPatterns.length > 0) {
        params.append('relationshipPatterns', relationshipPatterns.join(','));
      }
      if (emotionalState) {
        params.append('emotionalState', emotionalState);
      }
    }

    const requestUrl = `${this.baseUrl}/query?${params.toString()}`;
    const response = await this.fetcher(requestUrl, { method: 'GET', credentials: 'include' });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`VVAULT retrieval failed: ${response.status} ${errorText}`);
    }

    const payload = (await response.json()) as VVAULTQueryResponse;
    if (!payload.ok || !payload.memories) {
      return { memories: [], diagnostics: includeDiagnostics ? { requestUrl, rawCount: 0, filteredCount: 0, toneHints } : undefined };
    }

    const rawMemories = payload.memories;
    const filtered: VVAULTMemoryHit[] = [];

    for (const memory of rawMemories) {
      const toneMatch = this.matchTone(memory, toneHints, minToneConfidence);
      if (toneHints.length && !toneMatch.match) {
        continue;
      }

      filtered.push({
        id: memory.id,
        context: memory.context,
        response: memory.response,
        metadata: memory.metadata,
        relevance: memory.relevance,
        detectedTone: toneMatch.detectedTone,
      });

      if (filtered.length >= limit) {
        break;
      }
    }

    const diagnostics = includeDiagnostics
      ? {
          requestUrl,
          rawCount: rawMemories.length,
          filteredCount: filtered.length,
          toneHints,
        }
      : undefined;

    return { memories: filtered, diagnostics };
  }

  private matchTone(
    memory: {
      response?: string;
      context?: string;
      metadata?: Record<string, any>;
      tags?: string[];
    },
    toneHints: ToneLabel[],
    minConfidence: number
  ): { match: boolean; detectedTone?: ToneDetectionResult } {
    if (!toneHints.length) {
      return { match: true };
    }

    const metadataTone = this.extractToneFromMetadata(memory);
    if (metadataTone && toneHints.includes(metadataTone)) {
      return {
        match: true,
        detectedTone: { tone: metadataTone, confidence: 0.99, evidence: ['metadata'] },
      };
    }

    const combinedText = `${memory.response ?? ''} ${memory.context ?? ''}`.trim();
    if (!combinedText) {
      return { match: false };
    }

    const detectedTone = detectTone({ text: combinedText });
    if (toneHints.includes(detectedTone.tone) && detectedTone.confidence >= minConfidence) {
      return { match: true, detectedTone };
    }

    return { match: false, detectedTone };
  }

  private extractToneFromMetadata(memory: {
    metadata?: Record<string, any>;
    tags?: string[];
  }): ToneLabel | null {
    const explicitTone = memory.metadata?.tone || memory.metadata?.toneLabel || memory.metadata?.toneSignature;
    if (explicitTone && (TONE_LABELS as readonly string[]).includes(explicitTone)) {
      return explicitTone as ToneLabel;
    }

    const tags = memory.metadata?.tags || memory.tags;
    if (Array.isArray(tags)) {
      for (const tag of tags) {
        const normalized = String(tag).toLowerCase();
        if (normalized.startsWith('tone:')) {
          const tagTone = normalized.replace('tone:', '') as ToneLabel;
          if ((TONE_LABELS as readonly string[]).includes(tagTone)) {
            return tagTone;
          }
        }
      }
    }

    return null;
  }
}
