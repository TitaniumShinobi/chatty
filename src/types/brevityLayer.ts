/**
 * Brevity Layer Types
 * 
 * TypeScript interfaces for ultra-brevity and analytical sharpness layer configuration
 * and metadata storage in VVAULT.
 */

/**
 * Ultra-brevity configuration settings
 */
export interface BrevityConfig {
  /** Enable ultra-brevity mode (default: true for Katana-style GPTs) */
  ultraBrevityEnabled: boolean;
  
  /** Prefer one-word responses when they capture the essence */
  oneWordPreferred: boolean;
  
  /** Enforce strict one-word responses (only for explicit cues) */
  oneWordEnforced: boolean;
  
  /** Maximum words allowed in responses (default: 10) */
  maxWords: number;
  
  /** Maximum number of sentences allowed (default: 2) */
  maxSentences?: number;
  
  /** Maximum number of words allowed per sentence (default: 12) */
  maxWordsPerSentence?: number;
  
  /** Instruction for what to do when limits are exceeded */
  killClause?: string;
  
  /** Tones that must be rejected (verbose, reflective, therapeutic, etc.) */
  rejectTone?: string[];
  
  /** Allow silent responses when no direct answer exists */
  allowSilence?: boolean;
  
  /** Strip all filler words and phrases */
  stripFiller: boolean;
  
  /** No preambles or introductions */
  noPreambles: boolean;
  
  /** No hedging or uncertainty language */
  noHedging: boolean;
  
  /** No corporate framing or "as an AI" disclaimers */
  noCorporateFraming: boolean;
  
  /** Timestamp when config was created */
  createdAt?: string;
  
  /** Timestamp when config was last updated */
  updatedAt?: string;
}

/**
 * Analytical sharpness configuration settings
 */
export interface AnalyticalSharpnessConfig {
  /** Lead with the flaw - name it, show cost, demand ownership */
  leadWithFlaw: boolean;
  
  /** Number of decisive blows to deliver (default: 2) */
  decisiveBlows: number;
  
  /** No listicles or numbered lists */
  noListicles: boolean;
  
  /** No therapy-lite language */
  noTherapyLite: boolean;
  
  /** No inspiration porn or motivational fluff */
  noInspirationPorn: boolean;
  
  /** Call out user dodges and cut them down */
  callOutDodges: boolean;
  
  /** Precision over polish - muscle and bone, not fluff */
  precisionOverPolish: boolean;
  
  /** Timestamp when config was created */
  createdAt?: string;
  
  /** Timestamp when config was last updated */
  updatedAt?: string;
}

/**
 * Brevity metadata attached to memory entries
 */
export interface BrevityMetadata {
  /** Brevity score (0-1, where 1 is maximum brevity) */
  brevityScore: number;
  
  /** Word count of the response */
  wordCount: number;
  
  /** Whether this was a one-word response */
  oneWordResponse: boolean;
  
  /** Analytical sharpness score (0-1) */
  analyticalSharpness?: number;
  
  /** Tags for retrieval (e.g., "brevity:ultra-brief", "brevity:one-word") */
  tags?: string[];
}

/**
 * Default brevity configuration for Katana-style GPTs
 */
export const DEFAULT_BREVITY_CONFIG: BrevityConfig = {
  ultraBrevityEnabled: true,
  oneWordPreferred: true,
  oneWordEnforced: false,
  maxWords: 10,
  maxSentences: 2,
  maxWordsPerSentence: 12,
  killClause: 'If a sentence exceeds the limit, drop it entirely.',
  rejectTone: ['verbose', 'reflective', 'therapeutic'],
  allowSilence: true,
  stripFiller: true,
  noPreambles: true,
  noHedging: true,
  noCorporateFraming: true,
};

/**
 * Default analytical sharpness configuration for Katana-style GPTs
 */
export const DEFAULT_ANALYTICAL_SHARPNESS: AnalyticalSharpnessConfig = {
  leadWithFlaw: true,
  decisiveBlows: 2,
  noListicles: true,
  noTherapyLite: true,
  noInspirationPorn: true,
  callOutDodges: true,
  precisionOverPolish: true,
};

/**
 * API response for brevity config operations
 */
export interface BrevityConfigResponse {
  ok: boolean;
  config?: BrevityConfig;
  error?: string;
}

/**
 * API response for analytical sharpness operations
 */
export interface AnalyticalSharpnessResponse {
  ok: boolean;
  config?: AnalyticalSharpnessConfig;
  error?: string;
}

/**
 * Memory query options with brevity context
 */
export interface BrevityMemoryQueryOptions {
  constructCallsign: string;
  query: string;
  limit?: number;
  includeBrevityExamples?: boolean;
  minBrevityScore?: number;
  oneWordOnly?: boolean;
}

