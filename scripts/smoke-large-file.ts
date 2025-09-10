#!/usr/bin/env tsx

// Smoke test for large file intelligence system
import { LargeFileIntelligence } from '../src/lib/largeFileIntelligence';

async function testLargeFileIntelligence() {
  console.log('🧪 Testing large file intelligence system...\n');
  
  // Mock browser APIs for Node.js environment
  global.FileReader = class MockFileReader {
    onload: ((e: any) => void) | null = null;
    onerror: (() => void) | null = null;
    
    readAsText(file: File) {
      setTimeout(() => {
        if (this.onload) {
          this.onload({ target: { result: file.name.includes('large') ? largeContent : smallContent } });
        }
      }, 0);
    }
    
    readAsDataURL(file: File) {
      setTimeout(() => {
        if (this.onload) {
          this.onload({ target: { result: 'data:text/plain;base64,' + Buffer.from(file.name.includes('large') ? largeContent : smallContent).toString('base64') } });
        }
      }, 0);
    }
  } as any;
  
  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0
  } as any;
  
  // Create test content
  const smallContent = `
    This is a small test document.
    It contains basic information for testing.
    The document has multiple paragraphs.
    Each paragraph contains relevant content.
    This should be processed as a single chunk.
  `;
  
  const largeContent = `
    Chapter 1: Introduction
    
    This is a large test document that simulates a book or research paper.
    It contains multiple chapters and sections to test the chunking engine.
    The document is designed to be processed into multiple chunks for semantic analysis.
    
    The chunking engine should identify chapter boundaries and create semantic chunks.
    Each chunk should maintain context and be suitable for vector embedding.
    The system should handle large documents efficiently without blocking the UI.
    
    Chapter 2: Methodology
    
    The methodology section describes the approach used in this research.
    We employ advanced natural language processing techniques.
    The chunking algorithm uses semantic boundaries to preserve meaning.
    Vector embeddings are created for each chunk to enable similarity search.
    
    Chapter 3: Results
    
    The results demonstrate the effectiveness of the large file intelligence system.
    Processing time scales linearly with document size.
    Chunk quality is maintained through semantic boundary detection.
    Context assembly provides relevant information for queries.
    
    Chapter 4: Discussion
    
    The discussion explores the implications of our findings.
    Large file processing enables new capabilities in AI systems.
    Semantic retrieval improves query relevance and accuracy.
    The modular architecture supports various vector store backends.
    
    Chapter 5: Conclusion
    
    In conclusion, the large file intelligence system provides robust document processing.
    It enables efficient handling of books, research papers, and other large documents.
    The system maintains packet-only architecture while adding powerful capabilities.
    Future work will focus on optimizing performance and adding more document types.
  `;
  
  // Create test files
  const smallFile = new File([smallContent], 'small-document.txt', { type: 'text/plain' });
  const largeFile = new File([largeContent], 'large-document.txt', { type: 'text/plain' });
  
  console.log('1️⃣ Initializing large file intelligence system...');
  
  const lfi = new LargeFileIntelligence({
    chunking: {
      maxChunkSize: 1000, // Smaller chunks for testing
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
  });
  
  await lfi.initialize();
  console.log('✅ System initialized');
  console.log('');
  
  console.log('2️⃣ Processing small document...');
  const smallResult = await lfi.processFile(smallFile, {
    onProgress: (progress) => {
      console.log(`📊 Progress: ${Math.round(progress.progress * 100)}% - ${progress.message}`);
    }
  });
  
  console.log('✅ Small document processed');
  console.log('- Document ID:', smallResult.documentId);
  console.log('- Chunks:', smallResult.chunkingResult.totalChunks);
  console.log('- Words:', smallResult.chunkingResult.totalWords);
  console.log('- Processing time:', smallResult.processingTime + 'ms');
  console.log('- Indexed:', smallResult.indexed);
  console.log('');
  
  console.log('3️⃣ Processing large document...');
  const largeResult = await lfi.processFile(largeFile, {
    onProgress: (progress) => {
      console.log(`📊 Progress: ${Math.round(progress.progress * 100)}% - ${progress.message}`);
    }
  });
  
  console.log('✅ Large document processed');
  console.log('- Document ID:', largeResult.documentId);
  console.log('- Chunks:', largeResult.chunkingResult.totalChunks);
  console.log('- Words:', largeResult.chunkingResult.totalWords);
  console.log('- Processing time:', largeResult.processingTime + 'ms');
  console.log('- Indexed:', largeResult.indexed);
  console.log('');
  
  console.log('4️⃣ Testing query functionality...');
  const queryResult = await lfi.query(
    'methodology and results',
    [smallResult.documentId, largeResult.documentId],
    {
      maxChunks: 5,
      similarityThreshold: 0.2,
      enableSemanticSearch: true
    }
  );
  
  console.log('✅ Query completed');
  console.log('- Query:', queryResult.query);
  console.log('- Context chunks:', queryResult.context.totalChunks);
  console.log('- Context words:', queryResult.context.totalWords);
  console.log('- Processing time:', queryResult.processingTime + 'ms');
  console.log('- Summary:', queryResult.context.summary);
  console.log('');
  
  console.log('5️⃣ Testing streaming query...');
  let streamCount = 0;
  for await (const result of lfi.streamQuery(
    'chunking and semantic',
    [largeResult.documentId],
    { maxChunks: 3 }
  )) {
    streamCount++;
    console.log(`📊 Stream result ${streamCount}: similarity ${(result.similarity * 100).toFixed(1)}%`);
  }
  console.log('✅ Streaming query completed');
  console.log('');
  
  console.log('6️⃣ Getting system statistics...');
  const stats = await lfi.getStats();
  console.log('✅ System statistics retrieved');
  console.log('- Documents:', stats.documents);
  console.log('- Active files:', stats.processing.activeFiles);
  console.log('- Max concurrent files:', stats.processing.maxConcurrentFiles);
  if (stats.vectorStore) {
    console.log('- Vector store vectors:', stats.vectorStore.totalVectors);
    console.log('- Vector store dimensions:', stats.vectorStore.dimensions);
  }
  console.log('');
  
  // Assertions
  const assertions = [
    {
      name: 'Small document processed successfully',
      passed: !smallResult.error && smallResult.chunkingResult.totalChunks > 0,
      expected: 'no error and chunks > 0',
      actual: smallResult.error ? `error: ${smallResult.error}` : `${smallResult.chunkingResult.totalChunks} chunks`
    },
    {
      name: 'Large document processed successfully',
      passed: !largeResult.error && largeResult.chunkingResult.totalChunks > 1,
      expected: 'no error and chunks > 1',
      actual: largeResult.error ? `error: ${largeResult.error}` : `${largeResult.chunkingResult.totalChunks} chunks`
    },
    {
      name: 'Large document has more chunks than small',
      passed: largeResult.chunkingResult.totalChunks > smallResult.chunkingResult.totalChunks,
      expected: 'large chunks > small chunks',
      actual: `${largeResult.chunkingResult.totalChunks} > ${smallResult.chunkingResult.totalChunks}`
    },
    {
      name: 'Query returned relevant results',
      passed: queryResult.context.totalChunks > 0,
      expected: 'context chunks > 0',
      actual: `${queryResult.context.totalChunks} chunks`
    },
    {
      name: 'Streaming query worked',
      passed: streamCount > 0,
      expected: 'stream results > 0',
      actual: `${streamCount} results`
    },
    {
      name: 'Vector store is active',
      passed: stats.vectorStore && stats.vectorStore.totalVectors > 0,
      expected: 'vector store with vectors > 0',
      actual: stats.vectorStore ? `${stats.vectorStore.totalVectors} vectors` : 'no vector store'
    }
  ];
  
  console.log('✅ Assertions:');
  assertions.forEach(assertion => {
    const status = assertion.passed ? '✅' : '❌';
    console.log(`${status} ${assertion.name}: ${assertion.expected} (got ${assertion.actual})`);
  });
  
  const allPassed = assertions.every(a => a.passed);
  console.log(`\n${allPassed ? '🎉 All tests passed!' : '❌ Some tests failed!'}`);
  
  return allPassed;
}

// Run the test
testLargeFileIntelligence().catch(console.error);
