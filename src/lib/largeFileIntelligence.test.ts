// Large File Intelligence Layer - Integration Tests
// Comprehensive testing of chunking, context assembly, and semantic retrieval

import { LargeFileIntelligence, LargeFileConfig } from './largeFileIntelligence';
import { ChunkingEngine } from './chunkingEngine';
import { ContextAssembler } from './contextAssembler';
import { SemanticRetrievalService } from './semanticRetrieval';
import { CloudStorageService } from './cloudStorage';

// Mock file for testing
function createMockFile(content: string, name: string = 'test.pdf'): File {
  const blob = new Blob([content], { type: 'application/pdf' });
  return new File([blob], name, { type: 'application/pdf' });
}

// Test configuration
const TEST_CONFIG: Partial<LargeFileConfig> = {
  chunking: {
    maxChunkSize: 2000,
    overlapSize: 100,
    semanticBoundaries: true,
    maxChunksPerDocument: 100
  },
  retrieval: {
    vectorStoreType: 'memory',
    dimensions: 50,
    similarityMetric: 'cosine'
  },
  processing: {
    enableVectorStore: true,
    enableStreaming: true,
    batchSize: 5,
    maxConcurrentFiles: 3
  },
  storage: {
    provider: 'local',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedFileTypes: ['pdf', 'epub', 'txt', 'docx'],
    compression: false,
    encryption: false
  }
};

describe('Large File Intelligence Layer', () => {
  let lfi: LargeFileIntelligence;
  let chunkingEngine: ChunkingEngine;
  let contextAssembler: ContextAssembler;
  let semanticRetrieval: SemanticRetrievalService;
  let cloudStorage: CloudStorageService;

  beforeEach(async () => {
    lfi = new LargeFileIntelligence(TEST_CONFIG);
    await lfi.initialize();
    
    // Get internal components for testing
    chunkingEngine = (lfi as any).chunkingEngine;
    contextAssembler = (lfi as any).contextAssembler;
    semanticRetrieval = (lfi as any).semanticRetrieval;
    cloudStorage = (lfi as any).cloudStorage;
  });

  describe('Chunking Engine', () => {
    it('should chunk a large document into semantic pieces', async () => {
      const content = `
        Chapter 1: Introduction
        
        This is the first chapter of our document. It contains important information about the topic.
        The content is structured in a way that makes it easy to understand and process.
        
        Chapter 2: Main Content
        
        Here we have the main content of the document. This section contains detailed information
        about various aspects of the subject matter. The content is comprehensive and well-organized.
        
        Chapter 3: Conclusion
        
        Finally, we conclude our document with a summary of the key points and final thoughts.
        This section ties everything together and provides closure to the discussion.
      `;

      const result = await chunkingEngine.chunkDocument(content, 'txt');
      
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.totalChunks).toBeGreaterThan(0);
      expect(result.totalWords).toBeGreaterThan(0);
      expect(result.metadata.documentType).toBe('txt');
      expect(result.metadata.complexity).toBeDefined();
    });

    it('should preserve semantic boundaries', async () => {
      const content = 'Sentence one. Sentence two. Sentence three.';
      
      const result = await chunkingEngine.chunkDocument(content, 'txt');
      
      for (const chunk of result.chunks) {
        expect(chunk.content).toMatch(/^[A-Z].*[.!?]$/); // Starts with capital, ends with punctuation
      }
    });

    it('should handle progress callbacks', async () => {
      const content = 'A'.repeat(10000); // Large content
      const progressUpdates: number[] = [];
      
      await chunkingEngine.chunkDocument(content, 'txt', {
        onProgress: (progress) => progressUpdates.push(progress)
      });
      
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0]).toBeGreaterThanOrEqual(0);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(1);
    });
  });

  describe('Context Assembler', () => {
    it('should assemble context from multiple documents', async () => {
      const content1 = 'Document one contains information about AI and machine learning.';
      const content2 = 'Document two discusses neural networks and deep learning.';
      
      const result1 = await chunkingEngine.chunkDocument(content1, 'txt');
      const result2 = await chunkingEngine.chunkDocument(content2, 'txt');
      
      contextAssembler.registerDocument('doc1', result1);
      contextAssembler.registerDocument('doc2', result2);
      
      const query = {
        query: 'machine learning',
        maxChunks: 5,
        similarityThreshold: 0.1,
        includeMetadata: true,
        contextWindow: 1
      };
      
      const context = await contextAssembler.assembleContext(query, ['doc1', 'doc2']);
      
      expect(context.chunks.length).toBeGreaterThan(0);
      expect(context.totalChunks).toBeGreaterThan(0);
      expect(context.summary).toBeDefined();
    });

    it('should stream context assembly', async () => {
      const content = 'This document contains information about artificial intelligence and its applications.';
      const result = await chunkingEngine.chunkDocument(content, 'txt');
      
      contextAssembler.registerDocument('doc1', result);
      
      const query = {
        query: 'artificial intelligence',
        maxChunks: 3,
        similarityThreshold: 0.1,
        includeMetadata: true,
        contextWindow: 1
      };
      
      const matches: any[] = [];
      for await (const match of contextAssembler.streamContext(query, ['doc1'])) {
        matches.push(match);
      }
      
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  describe('Semantic Retrieval', () => {
    it('should index and search chunks semantically', async () => {
      const content = 'This document discusses machine learning algorithms and their applications.';
      const result = await chunkingEngine.chunkDocument(content, 'txt');
      
      await semanticRetrieval.indexChunks(result.chunks, 'doc1');
      
      const searchResult = await semanticRetrieval.search({
        query: 'machine learning',
        options: {
          topK: 3,
          similarityThreshold: 0.1,
          includeMetadata: true,
          rerank: false
        }
      });
      
      expect(searchResult.matches.length).toBeGreaterThan(0);
      expect(searchResult.totalFound).toBeGreaterThan(0);
    });

    it('should handle batch indexing with progress', async () => {
      const content = 'A'.repeat(5000); // Large content for multiple chunks
      const result = await chunkingEngine.chunkDocument(content, 'txt');
      
      const progressUpdates: number[] = [];
      
      await semanticRetrieval.indexChunks(result.chunks, 'doc1', {
        onProgress: (progress) => progressUpdates.push(progress),
        batchSize: 2
      });
      
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(1);
    });
  });

  describe('Cloud Storage', () => {
    it('should upload and download files', async () => {
      const content = 'Test document content';
      const file = createMockFile(content, 'test.txt');
      
      const uploadResult = await cloudStorage.uploadFile(file);
      
      expect(uploadResult.documentId).toBeDefined();
      expect(uploadResult.metadata.fileName).toBe('test.txt');
      
      const downloadResult = await cloudStorage.downloadFile(uploadResult.documentId);
      
      expect(downloadResult.metadata.documentId).toBe(uploadResult.documentId);
      expect(typeof downloadResult.content).toBe('string');
    });

    it('should list uploaded files', async () => {
      const file1 = createMockFile('Content 1', 'doc1.txt');
      const file2 = createMockFile('Content 2', 'doc2.txt');
      
      await cloudStorage.uploadFile(file1);
      await cloudStorage.uploadFile(file2);
      
      const files = await cloudStorage.listFiles();
      
      expect(files.length).toBeGreaterThanOrEqual(2);
      expect(files.some(f => f.fileName === 'doc1.txt')).toBe(true);
      expect(files.some(f => f.fileName === 'doc2.txt')).toBe(true);
    });

    it('should handle processing jobs', async () => {
      const job = await cloudStorage.createProcessingJob('test-doc');
      
      expect(job.jobId).toBeDefined();
      expect(job.status).toBe('pending');
      
      await cloudStorage.updateProcessingJob(job.jobId, {
        status: 'processing',
        progress: 0.5
      });
      
      const updatedJob = await cloudStorage.getProcessingJob(job.jobId);
      expect(updatedJob?.status).toBe('processing');
      expect(updatedJob?.progress).toBe(0.5);
    });
  });

  describe('Large File Intelligence Integration', () => {
    it('should process a file end-to-end', async () => {
      const content = `
        Chapter 1: Introduction to AI
        
        Artificial Intelligence is a field of computer science that aims to create intelligent machines.
        These machines can perform tasks that typically require human intelligence.
        
        Chapter 2: Machine Learning
        
        Machine Learning is a subset of AI that focuses on algorithms that can learn from data.
        It includes supervised learning, unsupervised learning, and reinforcement learning.
        
        Chapter 3: Deep Learning
        
        Deep Learning is a subset of machine learning that uses neural networks with multiple layers.
        It has revolutionized fields like computer vision and natural language processing.
      `;
      
      const file = createMockFile(content, 'ai_document.pdf');
      const progressUpdates: any[] = [];
      
      const result = await lfi.processFile(file, {
        onProgress: (progress) => progressUpdates.push(progress)
      });
      
      expect(result.documentId).toBeDefined();
      expect(result.fileName).toBe('ai_document.pdf');
      expect(result.chunkingResult.totalChunks).toBeGreaterThan(0);
      expect(result.indexed).toBe(true);
      expect(progressUpdates.length).toBeGreaterThan(0);
    });

    it('should query processed documents', async () => {
      const content = 'This document contains information about neural networks and deep learning algorithms.';
      const file = createMockFile(content, 'neural_networks.pdf');
      
      const processResult = await lfi.processFile(file);
      
      const queryResult = await lfi.query('neural networks', [processResult.documentId]);
      
      expect(queryResult.query).toBe('neural networks');
      expect(queryResult.context.totalChunks).toBeGreaterThan(0);
      expect(queryResult.processingTime).toBeGreaterThan(0);
    });

    it('should stream query results', async () => {
      const content = 'This document discusses various machine learning algorithms including decision trees, random forests, and support vector machines.';
      const file = createMockFile(content, 'ml_algorithms.pdf');
      
      const processResult = await lfi.processFile(file);
      
      const results: any[] = [];
      for await (const result of lfi.streamQuery('machine learning', [processResult.documentId])) {
        results.push(result);
      }
      
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle multiple concurrent files', async () => {
      const files = [
        createMockFile('Document 1 content', 'doc1.pdf'),
        createMockFile('Document 2 content', 'doc2.pdf'),
        createMockFile('Document 3 content', 'doc3.pdf')
      ];
      
      const results = await Promise.all(
        files.map(file => lfi.processFile(file))
      );
      
      expect(results.length).toBe(3);
      results.forEach(result => {
        expect(result.documentId).toBeDefined();
        expect(result.chunkingResult.totalChunks).toBeGreaterThan(0);
      });
    });

    it('should generate proper packet responses', () => {
      const mockResult = {
        documentId: 'test-id',
        fileName: 'test.pdf',
        fileType: 'pdf',
        chunkingResult: {
          totalChunks: 5,
          totalWords: 100,
          totalCharacters: 500,
          processingTime: 1000,
          chunks: [] as any[],
          metadata: {
            documentType: 'pdf',
            estimatedPages: 2,
            language: 'en',
            complexity: 'medium' as const
          }
        },
        indexed: true,
        processingTime: 1500
      };
      // Add required 'chunks' property to chunkingResult to match ChunkingResult type
      mockResult.chunkingResult.chunks = [
        { chunkId: 'chunk-1', start: 0, end: 99, text: '...' },
        { chunkId: 'chunk-2', start: 100, end: 199, text: '...' },
        { chunkId: 'chunk-3', start: 200, end: 299, text: '...' },
        { chunkId: 'chunk-4', start: 300, end: 399, text: '...' },
        { chunkId: 'chunk-5', start: 400, end: 499, text: '...' }
      ];

      const response = lfi.generateProcessingResponse(mockResult as any);

      expect(response).toBeDefined();
      expect(response.op).toBeDefined();
      expect(response.payload).toBeDefined();
      expect(response.payload.documentId).toBe(mockResult.documentId);
      expect(response.payload.fileName).toBe(mockResult.fileName);
      expect(response.payload.chunkingResult.chunks.length).toBe(5);
    });
  });

  describe('Error Handling', () => {
    it('should handle file processing errors gracefully', async () => {
      const invalidFile = createMockFile('', 'invalid.txt');
      Object.defineProperty(invalidFile, 'size', { value: 200 * 1024 * 1024 }); // 200MB
      
      const result = await lfi.processFile(invalidFile);
      
      expect(result.error).toBeDefined();
      expect(result.chunkingResult.totalChunks).toBe(0);
    });

    it('should handle abort signals', async () => {
      const content = 'A'.repeat(100000); // Very large content
      const file = createMockFile(content, 'large.pdf');
      const controller = new AbortController();
      
      // Abort after a short delay
      setTimeout(() => controller.abort(), 100);
      
      await expect(
        lfi.processFile(file, { abortSignal: controller.signal })
      ).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    it('should handle large documents efficiently', async () => {
      const content = 'A'.repeat(50000); // 50KB content
      const file = createMockFile(content, 'large_document.pdf');
      
      const startTime = Date.now();
      const result = await lfi.processFile(file);
      const processingTime = Date.now() - startTime;
      
      expect(result.chunkingResult.totalChunks).toBeGreaterThan(0);
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should maintain memory efficiency', async () => {
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
      
      // Process multiple documents
      const files = Array.from({ length: 10 }, (_, i) => 
        createMockFile(`Document ${i} content`, `doc${i}.pdf`)
      );
      
      await Promise.all(files.map(file => lfi.processFile(file)));
      
      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });
});
