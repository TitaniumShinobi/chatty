/**
 * Transcript Memory System - Main Export
 * 
 * Complete automated transcript memory anchor extraction and recall system
 * Designed to achieve perfect transcript recall with zero false positives
 */

// Import classes for both export and internal use
import { EnhancedAnchorExtractor } from './EnhancedAnchorExtractor';
import { AnchorIndexer } from './AnchorIndexer';
import { StrictTranscriptValidator } from './StrictTranscriptValidator';
import { TranscriptMemoryOrchestrator } from './TranscriptMemoryOrchestrator';
import { DeepTranscriptParser } from './DeepTranscriptParser';

// Re-export for external use
export { EnhancedAnchorExtractor, AnchorIndexer, StrictTranscriptValidator, TranscriptMemoryOrchestrator, DeepTranscriptParser };

export type { 
  ExtractedAnchor, 
  AnchorPattern 
} from './EnhancedAnchorExtractor';

export type { 
  IndexedAnchor, 
  SearchQuery, 
  SearchResult 
} from './AnchorIndexer';

export type { 
  ValidationResult, 
  TestResult, 
  ValidationBank 
} from './StrictTranscriptValidator';

export type { 
  MemoryContext, 
  PromptInjection, 
  OrchestrationConfig 
} from './TranscriptMemoryOrchestrator';

/**
 * Simple factory function for creating a complete transcript memory system
 */
export function createTranscriptMemorySystem(config?: {
  maxAnchorsPerResponse?: number;
  minAnchorSignificance?: number;
  enableFuzzyMatching?: boolean;
  strictValidation?: boolean;
}) {
  return new TranscriptMemoryOrchestrator(config);
}

/**
 * Quick setup function for existing Chatty integration
 */
export async function setupTranscriptMemory(
  transcriptContent: string,
  constructId: string,
  config?: Parameters<typeof createTranscriptMemorySystem>[0]
) {
  const orchestrator = createTranscriptMemorySystem(config);
  await orchestrator.initialize(transcriptContent, constructId);
  return orchestrator;
}
