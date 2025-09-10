// Large File Intelligence Layer - Production Demo
// Demonstrates end-to-end usage of the large file intelligence system

import { LargeFileIntelligence, LargeFileConfig } from '../lib/largeFileIntelligence';
import { CloudStorageFactory } from '../lib/cloudStorage';
import { VectorStoreFactory } from '../lib/semanticRetrieval';
import { pkt } from '../lib/emit';
import { lexicon as lex } from '../data/lexicon';

// Production configuration
const PRODUCTION_CONFIG: LargeFileConfig = {
  chunking: {
    maxChunkSize: 4000, // ~1000 words per chunk
    overlapSize: 200,   // ~50 words overlap
    semanticBoundaries: true,
    maxChunksPerDocument: 1000
  },
  retrieval: {
    vectorStoreType: 'memory', // Can be 'pinecone', 'weaviate', etc.
    dimensions: 100,
    similarityMetric: 'cosine'
  },
  processing: {
    enableVectorStore: true,
    enableStreaming: true,
    batchSize: 50,
    maxConcurrentFiles: 10
  },
  storage: {
    provider: 'local', // Can be 's3', 'gcs', 'azure'
    maxFileSize: 100 * 1024 * 1024, // 100MB
    allowedFileTypes: ['pdf', 'epub', 'txt', 'docx'],
    compression: false,
    encryption: false
  }
};

/**
 * Large File Intelligence Demo
 * Shows how to use the system for production document processing
 */
export class LargeFileIntelligenceDemo {
  private lfi: LargeFileIntelligence;
  private processedDocuments: Map<string, any> = new Map();
  private packetEmitter?: (packet: any) => void;

  constructor(config?: Partial<LargeFileConfig>) {
    this.lfi = new LargeFileIntelligence({ ...PRODUCTION_CONFIG, ...config });
  }

  /**
   * Initialize the system
   */
  async initialize(packetEmitter?: (packet: any) => void): Promise<void> {
    this.packetEmitter = packetEmitter;
    
    console.log('🚀 Initializing Large File Intelligence System...');
    
    await this.lfi.initialize();
    
    // Emit ready packet
    this.emitPacket(pkt(lex.vectorStoreReady, {
      message: 'Large File Intelligence System Ready',
      config: {
        chunking: this.lfi['config'].chunking,
        retrieval: this.lfi['config'].retrieval,
        processing: this.lfi['config'].processing,
        storage: this.lfi['config'].storage
      }
    }));
    
    console.log('✅ Large File Intelligence System initialized successfully');
  }

  /**
   * Process a document with full pipeline
   */
  async processDocument(file: File): Promise<string> {
    const documentId = crypto.randomUUID();
    
    console.log(`📄 Processing document: ${file.name} (${file.size} bytes)`);
    
    try {
      // Process file with progress tracking
      const result = await this.lfi.processFile(file, {
        onProgress: (progress) => {
          this.handleProcessingProgress(progress, file.name);
        }
      });

      // Store result
      this.processedDocuments.set(documentId, result);
      
      // Emit completion packet
      this.emitPacket(this.lfi.generateProcessingResponse(result));
      
      console.log(`✅ Document processed successfully: ${result.chunkingResult.totalChunks} chunks, ${result.chunkingResult.totalWords} words`);
      
      return documentId;
      
    } catch (error) {
      console.error(`❌ Failed to process document: ${error}`);
      throw error;
    }
  }

  /**
   * Query documents with semantic search
   */
  async queryDocuments(query: string, documentIds?: string[]): Promise<any> {
    console.log(`🔍 Querying documents: "${query}"`);
    
    try {
      // Use all documents if none specified
      const docsToQuery = documentIds || Array.from(this.processedDocuments.keys());
      
      if (docsToQuery.length === 0) {
        throw new Error('No documents available for querying');
      }

      // Perform query
      const result = await this.lfi.query(query, docsToQuery, {
        maxChunks: 10,
        similarityThreshold: 0.3,
        enableSemanticSearch: true,
        onProgress: (progress) => {
          console.log(`Query progress: ${Math.round(progress * 100)}%`);
        }
      });

      // Emit query result packet
      this.emitPacket(this.lfi.generateQueryResponse(result));
      
      console.log(`✅ Query completed: ${result.context.totalChunks} relevant chunks found`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ Query failed: ${error}`);
      throw error;
    }
  }

  /**
   * Stream query results for real-time feedback
   */
  async *streamQueryResults(query: string, documentIds?: string[]): AsyncGenerator<any, void, unknown> {
    console.log(`🌊 Streaming query results: "${query}"`);
    
    const docsToQuery = documentIds || Array.from(this.processedDocuments.keys());
    
    if (docsToQuery.length === 0) {
      throw new Error('No documents available for querying');
    }

    let resultCount = 0;
    
    for await (const result of this.lfi.streamQuery(query, docsToQuery, {
      maxChunks: 20,
      similarityThreshold: 0.2,
      onProgress: (progress) => {
        console.log(`Stream progress: ${Math.round(progress * 100)}%`);
      }
    })) {
      resultCount++;
      
      // Emit streaming result packet
      this.emitPacket(pkt(lex.contextQueryProgress, {
        query,
        resultCount,
        chunk: {
          id: result.chunk.id,
          content: result.chunk.content.substring(0, 200) + '...',
          similarity: result.similarity
        }
      }));
      
      yield result;
    }
    
    console.log(`✅ Stream completed: ${resultCount} results yielded`);
  }

  /**
   * Get system statistics
   */
  async getSystemStats(): Promise<any> {
    const stats = await this.lfi.getStats();
    
    console.log('📊 System Statistics:', stats);
    
    return {
      ...stats,
      processedDocuments: this.processedDocuments.size,
      documentIds: Array.from(this.processedDocuments.keys())
    };
  }

  /**
   * Remove a document from the system
   */
  async removeDocument(documentId: string): Promise<boolean> {
    console.log(`🗑️ Removing document: ${documentId}`);
    
    const removed = await this.lfi.removeDocument(documentId);
    this.processedDocuments.delete(documentId);
    
    if (removed) {
      console.log(`✅ Document removed successfully`);
    } else {
      console.log(`⚠️ Document not found or already removed`);
    }
    
    return removed;
  }

  /**
   * Clear all documents from the system
   */
  async clearAllDocuments(): Promise<void> {
    console.log('🧹 Clearing all documents...');
    
    await this.lfi.clear();
    this.processedDocuments.clear();
    
    console.log('✅ All documents cleared');
  }

  /**
   * Handle processing progress updates
   */
  private handleProcessingProgress(progress: any, fileName: string): void {
    console.log(`📈 ${fileName}: ${progress.stage} - ${Math.round(progress.progress * 100)}%`);
    
    // Emit progress packets
    const packets = this.lfi.generateProgressPackets(progress);
    packets.forEach(packet => this.emitPacket(packet));
  }

  /**
   * Emit packet if emitter is available
   */
  private emitPacket(packet: any): void {
    if (this.packetEmitter) {
      this.packetEmitter(packet);
    }
  }
}

/**
 * Example usage scenarios
 */
export async function demonstrateLargeFileIntelligence() {
  console.log('🎯 Large File Intelligence Demo Starting...\n');
  
  // Create demo instance
  const demo = new LargeFileIntelligenceDemo();
  
  // Initialize with packet emitter
  await demo.initialize((packet) => {
    console.log('📦 Packet emitted:', packet.op);
  });
  
  // Create sample documents
  const sampleDocuments = [
    createSampleDocument('AI_Research_Paper.pdf', `
      Artificial Intelligence: A Comprehensive Overview
      
      Chapter 1: Introduction to AI
      Artificial Intelligence (AI) is a branch of computer science that aims to create intelligent machines capable of performing tasks that typically require human intelligence. These tasks include learning, reasoning, problem-solving, perception, and language understanding.
      
      Chapter 2: Machine Learning Fundamentals
      Machine Learning is a subset of AI that focuses on the development of algorithms that can learn from and make predictions on data. The field has seen tremendous growth in recent years, with applications ranging from recommendation systems to autonomous vehicles.
      
      Chapter 3: Deep Learning and Neural Networks
      Deep Learning represents a subset of machine learning that uses neural networks with multiple layers to model and understand complex patterns in data. This approach has revolutionized fields such as computer vision, natural language processing, and speech recognition.
      
      Chapter 4: Applications and Future Directions
      AI applications are becoming increasingly prevalent in our daily lives, from virtual assistants to medical diagnosis systems. The future of AI holds promise for solving complex global challenges while also raising important ethical considerations.
    `),
    
    createSampleDocument('Machine_Learning_Guide.txt', `
      Machine Learning: A Practical Guide
      
      Section 1: Getting Started with ML
      Machine Learning is transforming industries across the globe. This guide provides practical insights into implementing ML solutions for real-world problems.
      
      Section 2: Supervised Learning
      Supervised learning involves training models on labeled data to make predictions. Common algorithms include linear regression, decision trees, and support vector machines.
      
      Section 3: Unsupervised Learning
      Unsupervised learning finds hidden patterns in unlabeled data. Clustering and dimensionality reduction are key techniques in this area.
      
      Section 4: Model Evaluation and Deployment
      Proper model evaluation is crucial for successful ML projects. This section covers metrics, validation techniques, and deployment strategies.
    `),
    
    createSampleDocument('Data_Science_Handbook.epub', `
      The Complete Data Science Handbook
      
      Part 1: Data Collection and Preparation
      Data science begins with proper data collection and preparation. This includes data cleaning, transformation, and feature engineering.
      
      Part 2: Statistical Analysis
      Statistical analysis forms the foundation of data science. Understanding probability, hypothesis testing, and regression analysis is essential.
      
      Part 3: Data Visualization
      Effective data visualization communicates insights clearly. This section covers various visualization techniques and best practices.
      
      Part 4: Predictive Modeling
      Predictive modeling uses historical data to forecast future outcomes. This involves selecting appropriate algorithms and tuning model parameters.
    `)
  ];
  
  // Process documents
  console.log('\n📚 Processing sample documents...\n');
  
  const documentIds: string[] = [];
  
  for (const doc of sampleDocuments) {
    try {
      const docId = await demo.processDocument(doc);
      documentIds.push(docId);
      console.log(`✅ Processed: ${doc.name}`);
    } catch (error) {
      console.error(`❌ Failed to process ${doc.name}:`, error);
    }
  }
  
  // Wait a moment for processing to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Get system stats
  console.log('\n📊 System Statistics:');
  const stats = await demo.getSystemStats();
  console.log(JSON.stringify(stats, null, 2));
  
  // Perform queries
  console.log('\n🔍 Performing queries...\n');
  
  const queries = [
    'machine learning algorithms',
    'artificial intelligence applications',
    'data science techniques',
    'neural networks and deep learning'
  ];
  
  for (const query of queries) {
    try {
      console.log(`\nQuery: "${query}"`);
      const result = await demo.queryDocuments(query, documentIds);
      console.log(`Found ${result.context.totalChunks} relevant chunks`);
      console.log(`Summary: ${result.context.summary}`);
    } catch (error) {
      console.error(`Query failed: ${error}`);
    }
  }
  
  // Demonstrate streaming
  console.log('\n🌊 Demonstrating streaming query...\n');
  
  try {
    const streamQuery = 'AI and machine learning';
    console.log(`Streaming query: "${streamQuery}"`);
    
    let streamCount = 0;
    for await (const result of demo.streamQueryResults(streamQuery, documentIds)) {
      streamCount++;
      console.log(`Stream result ${streamCount}: Similarity ${result.similarity.toFixed(3)}`);
    }
  } catch (error) {
    console.error(`Streaming failed: ${error}`);
  }
  
  console.log('\n🎉 Demo completed successfully!');
}

/**
 * Create a sample document for testing
 */
function createSampleDocument(name: string, content: string): File {
  const blob = new Blob([content], { type: 'text/plain' });
  return new File([blob], name, { type: 'text/plain' });
}

// Export for use in other modules
export { PRODUCTION_CONFIG };
