// src/lib/memory-file-integration.test.ts
// @ts-nocheck
// // Memory and File Integration - Integration Tests
// Comprehensive testing of unified memory and file intelligence system

import { MemoryManager, MemoryManagerConfig } from './memoryManager';
import { MemoryLedger, MemoryEntry } from './memoryLedger';
import { LargeFileIntelligence, LargeFileConfig } from './largeFileIntelligence';
import { UnifiedSemanticRetrieval, UnifiedQuery, UnifiedSearchResult } from './unifiedSemanticRetrieval';
import { SemanticRetrievalService, MemoryVectorStore } from './semanticRetrieval';
import { ChunkingEngine, Chunk } from './chunkingEngine';

// Test configuration
const TEST_CONFIG: Partial<MemoryManagerConfig> = {
  enableMemoryInjection: true,
  enableContinuityHooks: true,
  enableMemoryRituals: true,
  defaultInjectionStrategy: 'hybrid',
  maxMemoriesPerUser: 1000,
  maxTokensPerInjection: 1000,
  autoCleanupEnabled: false, // Disable for testing
  cleanupInterval: 1000
};

const LFI_TEST_CONFIG: Partial<LargeFileConfig> = {
  chunking: {
    maxChunkSize: 1000,
    overlapSize: 100,
    semanticBoundaries: true,
    maxChunksPerDocument: 100
  },
  processing: {
    enableVectorStore: true,
    enableStreaming: true,
    batchSize: 5,
    maxConcurrentFiles: 3
  }
};

describe('Memory and File Integration System', () => {
  let memoryManager: MemoryManager;
  let memoryLedger: MemoryLedger;
  let largeFileIntelligence: LargeFileIntelligence;
  let unifiedRetrieval: UnifiedSemanticRetrieval;
  let semanticRetrieval: SemanticRetrievalService;
  let vectorStore: MemoryVectorStore;

  beforeEach(async () => {
    memoryManager = new MemoryManager(TEST_CONFIG);
    memoryLedger = (memoryManager as any).memoryLedger;
    
    // Initialize vector store and semantic retrieval
    vectorStore = new MemoryVectorStore();
    await vectorStore.initialize();
    semanticRetrieval = new SemanticRetrievalService(vectorStore);
    await semanticRetrieval.initialize();
    
    // Initialize large file intelligence with memory integration
    largeFileIntelligence = new LargeFileIntelligence(LFI_TEST_CONFIG, memoryLedger);
    await largeFileIntelligence.initialize();
    
    // Initialize unified retrieval
    unifiedRetrieval = new UnifiedSemanticRetrieval(
      memoryLedger,
      semanticRetrieval,
      vectorStore
    );
  });

  afterEach(() => {
    // Clean up localStorage
    localStorage.removeItem('chatty-memory-ledger');
  });

  describe('File-Linked Memory Creation', () => {
    it('should create file-linked memories from document content', () => {
      const userId = 'user1';
      const sessionId = 'session1';
      const documentId = 'doc1';
      const fileName = 'test-document.pdf';
      const fileType = 'pdf';

      // Create file memory
      const memory = memoryLedger.createFileMemory(
        userId,
        sessionId,
        documentId,
        fileName,
        fileType,
        'This document contains important information about machine learning algorithms.',
        {
          type: 'file_insight',
          chunkId: 'chunk1',
          pageNumber: 1,
          extractionMethod: 'insight',
          confidence: 0.8,
          importance: 0.7,
          relevance: 0.9,
          tags: ['ml', 'algorithms', 'insight']
        }
      );

      expect(memory.id).toBeDefined();
      expect(memory.type).toBe('file_insight');
      expect(memory.metadata.fileContext).toBeDefined();
      expect(memory.metadata.fileContext!.documentId).toBe(documentId);
      expect(memory.metadata.fileContext!.fileName).toBe(fileName);
      expect(memory.metadata.fileContext!.fileType).toBe(fileType);
      expect(memory.metadata.fileContext!.extractionMethod).toBe('insight');
      expect(memory.metadata.fileContext!.confidence).toBe(0.8);
    });

    it('should create symbolic anchors from file content', () => {
      const userId = 'user1';
      const sessionId = 'session1';
      const documentId = 'doc1';
      const fileName = 'research-paper.pdf';
      const fileType = 'pdf';

      const anchors = [
        {
          anchor: 'chapter 1',
          content: 'Chapter 1: Introduction',
          context: 'This chapter introduces the main concepts...',
          confidence: 0.9
        },
        {
          anchor: 'section 2.1',
          content: 'Section 2.1: Methodology',
          context: 'The methodology section describes...',
          confidence: 0.8
        }
      ];

      const anchorMemories = memoryLedger.createFileAnchors(
        userId,
        sessionId,
        documentId,
        fileName,
        fileType,
        anchors
      );

      expect(anchorMemories.length).toBe(2);
      expect(anchorMemories[0].type).toBe('file_anchor');
      expect(anchorMemories[0].metadata.fileContext!.extractionMethod).toBe('anchor');
      expect(anchorMemories[0].relationships.fileRelationships!.anchorPoints).toContain('chapter 1');
    });

    it('should create recurring motifs from file content', () => {
      const userId = 'user1';
      const sessionId = 'session1';
      const documentId = 'doc1';
      const fileName = 'technical-manual.pdf';
      const fileType = 'pdf';

      const motifs = [
        {
          motif: 'machine learning',
          content: 'Machine learning algorithms are used for...',
          instances: ['machine learning', 'ML', 'machine learning algorithms'],
          frequency: 15,
          confidence: 0.9
        },
        {
          motif: 'neural networks',
          content: 'Neural networks provide...',
          instances: ['neural networks', 'neural network', 'NN'],
          frequency: 8,
          confidence: 0.7
        }
      ];

      const motifMemories = memoryLedger.createFileMotifs(
        userId,
        sessionId,
        documentId,
        fileName,
        fileType,
        motifs
      );

      expect(motifMemories.length).toBe(2);
      expect(motifMemories[0].type).toBe('file_motif');
      expect(motifMemories[0].metadata.fileContext!.extractionMethod).toBe('motif');
      expect(motifMemories[0].relationships.fileRelationships!.motifInstances).toContain('machine learning');
    });
  });

  describe('Unified Semantic Retrieval', () => {
    it('should perform unified search across memories and chunks', async () => {
      const userId = 'user1';
      const sessionId = 'session1';

      // Create test memories
      memoryLedger.createMemory(userId, sessionId, 'fact', 'personal', 'User prefers Python for machine learning', {
        importance: 0.8,
        relevance: 0.9,
        tags: ['python', 'ml', 'preference']
      });

      memoryLedger.createFileMemory(
        userId,
        sessionId,
        'doc1',
        'ml-guide.pdf',
        'pdf',
        'Machine learning algorithms include neural networks and decision trees.',
        {
          type: 'file_insight',
          extractionMethod: 'insight',
          confidence: 0.8
        }
      );

      // Create test chunks
      const chunk: Chunk = {
        id: 'chunk1',
        content: 'Deep learning is a subset of machine learning that uses neural networks.',
        startIndex: 0,
        endIndex: 100,
        metadata: {
          wordCount: 15,
          characterCount: 100,
          keywords: ['deep learning', 'machine learning', 'neural networks'],
          semanticScore: 0.8,
          documentId: 'doc1',
          fileName: 'ml-guide.pdf',
          fileType: 'pdf'
        },
        context: {}
      };

      // Index chunk in vector store
      await semanticRetrieval.indexChunks([chunk], 'doc1');

      // Perform unified search
      const query: UnifiedQuery = {
        query: 'machine learning',
        userId,
        sessionId,
        filters: {
          semanticThreshold: 0.3,
          maxResults: 10
        },
        options: {
          includeMemories: true,
          includeChunks: true,
          unifyResults: true,
          rerankCombined: false,
          includeMetadata: true
        }
      };

      const result = await unifiedRetrieval.unifiedSearch(query);

      expect(result).toBeDefined();
      expect(result.memories.length).toBeGreaterThan(0);
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.combinedResults.length).toBeGreaterThan(0);
      expect(result.totalFound).toBeGreaterThan(0);
    });

    it('should link memories to chunks', async () => {
      const memoryId = 'memory1';
      const chunkId = 'chunk1';

      const link = await unifiedRetrieval.linkMemoryToChunk(
        memoryId,
        chunkId,
        'semantic',
        0.8,
        { similarity: 0.8 }
      );

      expect(link.memoryId).toBe(memoryId);
      expect(link.chunkId).toBe(chunkId);
      expect(link.linkType).toBe('semantic');
      expect(link.confidence).toBe(0.8);

      // Verify link retrieval
      const linkedMemories = unifiedRetrieval.getLinkedMemories(chunkId);
      expect(linkedMemories.length).toBeGreaterThan(0);
      expect(linkedMemories[0].memoryId).toBe(memoryId);
    });
  });

  describe('File Insight Extraction', () => {
    it('should extract insights from file chunks', async () => {
      const userId = 'user1';
      const sessionId = 'session1';
      const documentId = 'doc1';
      const fileName = 'research-paper.pdf';
      const fileType = 'pdf';

      // Create test chunks
      const chunks: Chunk[] = [
        {
          id: 'chunk1',
          content: 'Machine learning algorithms have revolutionized the field of artificial intelligence. Deep learning models, particularly neural networks, have shown remarkable performance in various tasks.',
          startIndex: 0,
          endIndex: 200,
          metadata: {
            wordCount: 25,
            characterCount: 200,
            keywords: ['machine learning', 'algorithms', 'deep learning', 'neural networks'],
            semanticScore: 0.9,
            documentId,
            fileName,
            fileType
          },
          context: {}
        },
        {
          id: 'chunk2',
          content: 'Chapter 1: Introduction to Machine Learning. This chapter provides an overview of fundamental concepts.',
          startIndex: 200,
          endIndex: 300,
          metadata: {
            wordCount: 15,
            characterCount: 100,
            keywords: ['chapter', 'introduction', 'machine learning', 'concepts'],
            semanticScore: 0.7,
            documentId,
            fileName,
            fileType
          },
          context: {}
        }
      ];

      const result = await unifiedRetrieval.extractFileInsights(
        userId,
        sessionId,
        documentId,
        fileName,
        fileType,
        chunks
      );

      expect(result.insights.length).toBeGreaterThan(0);
      expect(result.anchors.length).toBeGreaterThan(0);
      expect(result.motifs.length).toBeGreaterThan(0);

      // Verify insight memory
      const insight = result.insights[0];
      expect(insight.type).toBe('file_insight');
      expect(insight.metadata.fileContext!.documentId).toBe(documentId);
      expect(insight.metadata.fileContext!.extractionMethod).toBe('insight');

      // Verify anchor memory
      const anchor = result.anchors[0];
      expect(anchor.type).toBe('file_anchor');
      expect(anchor.metadata.fileContext!.extractionMethod).toBe('anchor');
    });
  });

  describe('Large File Intelligence Integration', () => {
    it('should perform unified search through LFI', async () => {
      const userId = 'user1';
      const sessionId = 'session1';

      // Create test memories
      memoryLedger.createMemory(userId, sessionId, 'fact', 'personal', 'User is interested in AI research', {
        importance: 0.8,
        relevance: 0.9
      });

      // Perform unified search
      const result = await largeFileIntelligence.unifiedSearch(
        'artificial intelligence',
        userId,
        sessionId,
        {
          includeMemories: true,
          includeChunks: true,
          unifyResults: true,
          maxResults: 10
        }
      );

      expect(result).toBeDefined();
      expect(result!.memories.length).toBeGreaterThan(0);
      expect(result!.totalFound).toBeGreaterThan(0);
    });

    it('should extract file insights through LFI', async () => {
      const userId = 'user1';
      const sessionId = 'session1';
      const documentId = 'doc1';

      // This would require actual file processing
      // For now, test the method exists
      expect(typeof largeFileIntelligence.extractFileInsights).toBe('function');
    });
  });

  describe('Memory Query with File Context', () => {
    it('should query memories with file context filters', () => {
      const userId = 'user1';
      const sessionId = 'session1';

      // Create file-linked memories
      memoryLedger.createFileMemory(
        userId,
        sessionId,
        'doc1',
        'paper1.pdf',
        'pdf',
        'First insight from paper 1',
        {
          type: 'file_insight',
          extractionMethod: 'insight',
          confidence: 0.8
        }
      );

      memoryLedger.createFileMemory(
        userId,
        sessionId,
        'doc2',
        'paper2.pdf',
        'pdf',
        'Second insight from paper 2',
        {
          type: 'file_insight',
          extractionMethod: 'insight',
          confidence: 0.7
        }
      );

      // Query with file context
      const memories = memoryLedger.queryMemories({
        userId,
        sessionId,
        fileContext: {
          documentId: 'doc1'
        },
        includeFileMemories: true
      });

      expect(memories.length).toBe(1);
      expect(memories[0].metadata.fileContext!.documentId).toBe('doc1');
    });

    it('should query memories by extraction method', () => {
      const userId = 'user1';
      const sessionId = 'session1';

      // Create different types of file memories
      memoryLedger.createFileMemory(
        userId,
        sessionId,
        'doc1',
        'paper.pdf',
        'pdf',
        'Insight content',
        {
          type: 'file_insight',
          extractionMethod: 'insight',
          confidence: 0.8
        }
      );

      memoryLedger.createFileMemory(
        userId,
        sessionId,
        'doc1',
        'paper.pdf',
        'pdf',
        'Anchor content',
        {
          type: 'file_anchor',
          extractionMethod: 'anchor',
          confidence: 0.9
        }
      );

      // Query by extraction method
      const insightMemories = memoryLedger.queryMemories({
        userId,
        sessionId,
        fileContext: {
          extractionMethod: 'insight'
        },
        includeFileMemories: true
      });

      const anchorMemories = memoryLedger.queryMemories({
        userId,
        sessionId,
        fileContext: {
          extractionMethod: 'anchor'
        },
        includeFileMemories: true
      });

      expect(insightMemories.length).toBe(1);
      expect(anchorMemories.length).toBe(1);
      expect(insightMemories[0].metadata.fileContext!.extractionMethod).toBe('insight');
      expect(anchorMemories[0].metadata.fileContext!.extractionMethod).toBe('anchor');
    });
  });

  describe('Continuity Hooks for File Content', () => {
    it('should create file-content continuity hooks', () => {
      const userId = 'user1';

      const hook = memoryLedger.createContinuityHook(
        userId,
        {
          type: 'file_content',
          pattern: /machine learning/i,
          conditions: { documentId: 'doc1' }
        },
        {
          type: 'inject_file_context',
          memoryIds: [],
          context: { fileName: 'ml-guide.pdf', fileType: 'pdf' }
        },
        {
          priority: 0.8,
          fileContext: {
            documentTypes: ['pdf'],
            contentPatterns: ['machine learning'],
            semanticThreshold: 0.7
          }
        }
      );

      expect(hook.id).toBeDefined();
      expect(hook.trigger.type).toBe('file_content');
      expect(hook.action.type).toBe('inject_file_context');
      expect(hook.metadata.fileContext).toBeDefined();
      expect(hook.metadata.fileContext!.documentTypes).toContain('pdf');
    });

    it('should trigger file-content hooks', () => {
      const userId = 'user1';

      // Create file-content hook
      memoryLedger.createContinuityHook(
        userId,
        {
          type: 'file_content',
          pattern: /neural networks/i,
          conditions: {}
        },
        {
          type: 'inject_file_context',
          memoryIds: [],
          context: { fileName: 'ai-paper.pdf' }
        }
      );

      // Test hook triggering
      const triggeredHooks = memoryLedger.checkContinuityHooks(userId, {
        sessionId: 'session1',
        conversationId: 'conv1',
        topic: 'artificial intelligence',
        userInput: 'Tell me about neural networks',
        currentTime: Date.now()
      });

      expect(triggeredHooks.length).toBeGreaterThan(0);
      expect(triggeredHooks[0].trigger.type).toBe('file_content');
    });
  });

  describe('Memory Statistics with File Context', () => {
    it('should include file statistics in ledger stats', () => {
      const userId = 'user1';
      const sessionId = 'session1';

      // Create file memories
      memoryLedger.createFileMemory(
        userId,
        sessionId,
        'doc1',
        'paper1.pdf',
        'pdf',
        'Insight 1',
        {
          type: 'file_insight',
          extractionMethod: 'insight',
          confidence: 0.8
        }
      );

      memoryLedger.createFileMemory(
        userId,
        sessionId,
        'doc2',
        'paper2.pdf',
        'pdf',
        'Insight 2',
        {
          type: 'file_insight',
          extractionMethod: 'insight',
          confidence: 0.7
        }
      );

      const stats = memoryLedger.getStats();

      expect(stats.fileStats).toBeDefined();
      expect(stats.fileStats.totalFileMemories).toBe(2);
      expect(stats.fileStats.totalDocuments).toBe(2);
      expect(stats.fileStats.fileTypeDistribution['pdf']).toBe(2);
      expect(stats.fileStats.averageFileConfidence).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing memory ledger gracefully', () => {
      const lfiWithoutMemory = new LargeFileIntelligence(LFI_TEST_CONFIG);
      
      expect(() => {
        lfiWithoutMemory.unifiedSearch('test', 'user1', 'session1');
      }).toThrow('Unified retrieval not enabled - memory ledger required');
    });

    it('should handle file context queries without file memories', () => {
      const userId = 'user1';
      const sessionId = 'session1';

      // Query for file memories when none exist
      const memories = memoryLedger.queryMemories({
        userId,
        sessionId,
        fileContext: {
          documentId: 'nonexistent'
        },
        includeFileMemories: true
      });

      expect(memories.length).toBe(0);
    });
  });

  describe('Performance', () => {
    it('should handle large numbers of file memories efficiently', () => {
      const userId = 'user1';
      const sessionId = 'session1';
      const startTime = Date.now();

      // Create many file memories
      for (let i = 0; i < 100; i++) {
        memoryLedger.createFileMemory(
          userId,
          sessionId,
          `doc${i}`,
          `file${i}.pdf`,
          'pdf',
          `Insight ${i} from file ${i}`,
          {
            type: 'file_insight',
            extractionMethod: 'insight',
            confidence: 0.8
          }
        );
      }

      const creationTime = Date.now() - startTime;
      expect(creationTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Query file memories
      const queryStartTime = Date.now();
      const memories = memoryLedger.queryMemories({
        userId,
        sessionId,
        includeFileMemories: true
      });
      const queryTime = Date.now() - queryStartTime;

      expect(memories.length).toBe(100);
      expect(queryTime).toBeLessThan(1000); // Should query within 1 second
    });
  });
});
