// Large File Intelligence Layer - Chunking Engine
// Production-grade chunking for PDF, EPUB, TXT with semantic boundaries

export interface Chunk {
  id: string;
  content: string;
  startIndex: number;
  endIndex: number;
  pageNumber?: number;
  chapterNumber?: number;
  metadata: {
    wordCount: number;
    characterCount: number;
    keywords: string[];
    summary?: string;
    semanticScore?: number;
    // Enhanced metadata for memory integration
    memoryLinked?: boolean;
    memoryIds?: string[];
    anchorPoints?: string[];
    motifs?: string[];
    documentId?: string;
    fileName?: string;
    fileType?: string;
  };
  context: {
    previousChunk?: string;
    nextChunk?: string;
    documentSection?: string;
  };
}

export interface ChunkingConfig {
  maxChunkSize: number; // characters
  overlapSize: number; // characters
  minChunkSize: number; // characters
  semanticBoundaries: boolean;
  preserveParagraphs: boolean;
  preserveChapters: boolean;
  maxChunksPerDocument: number;
}

export interface ChunkingResult {
  chunks: Chunk[];
  totalChunks: number;
  totalWords: number;
  totalCharacters: number;
  processingTime: number;
  metadata: {
    documentType: string;
    estimatedPages: number;
    language: string;
    complexity: 'low' | 'medium' | 'high';
  };
}

export class ChunkingEngine {
  private config: ChunkingConfig;
  private readonly DEFAULT_CONFIG: ChunkingConfig = {
    maxChunkSize: 4000, // ~1000 words
    overlapSize: 200, // ~50 words overlap
    minChunkSize: 500, // ~125 words minimum
    semanticBoundaries: true,
    preserveParagraphs: true,
    preserveChapters: true,
    maxChunksPerDocument: 1000
  };

  constructor(config?: Partial<ChunkingConfig>) {
    this.config = { ...this.DEFAULT_CONFIG, ...config };
  }

  /**
   * Chunk a large document into semantic pieces
   */
  async chunkDocument(
    content: string,
    documentType: 'pdf' | 'epub' | 'txt' | 'docx',
    options?: {
      onProgress?: (progress: number) => void;
      abortSignal?: AbortSignal;
    }
  ): Promise<ChunkingResult> {
    const startTime = Date.now();
    
    try {
      // Preprocess content based on document type
      const processedContent = await this.preprocessContent(content, documentType);
      
      // Detect document structure
      const structure = this.detectStructure(processedContent, documentType);
      
      // Create chunks with semantic boundaries
      const chunks = await this.createSemanticChunks(processedContent, structure, options);
      
      // Post-process chunks (add metadata, context)
      const enrichedChunks = await this.enrichChunks(chunks, processedContent);
      
      const processingTime = Date.now() - startTime;
      
      return {
        chunks: enrichedChunks,
        totalChunks: enrichedChunks.length,
        totalWords: processedContent.split(/\s+/).length,
        totalCharacters: processedContent.length,
        processingTime,
        metadata: {
          documentType,
          estimatedPages: this.estimatePages(processedContent, documentType),
          language: this.detectLanguage(processedContent),
          complexity: this.assessComplexity(processedContent)
        }
      };
    } catch (error) {
      throw new Error(`Chunking failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Preprocess content based on document type
   */
  private async preprocessContent(content: string, documentType: string): Promise<string> {
    switch (documentType) {
      case 'pdf':
        return this.preprocessPDF(content);
      case 'epub':
        return this.preprocessEPUB(content);
      case 'txt':
        return this.preprocessTXT(content);
      case 'docx':
        return this.preprocessDOCX(content);
      default:
        return this.preprocessGeneric(content);
    }
  }



  private preprocessPDF(content: string): string {
    // Enhanced PDF text cleaning with better structure preservation
    return content
      .replace(/\f/g, '\n\n') // Form feeds to double newlines
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s\-.,;:!?()\[\]{}"'`~@#$%^&*+=|\\/<>]/g, ' ') // Remove control chars
      .replace(/([.!?])\s*([A-Z])/g, '$1\n\n$2') // Ensure proper sentence breaks
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
      .replace(/^\s+|\s+$/gm, '') // Trim lines
      .trim();
  }

  private preprocessEPUB(content: string): string {
    // Handle EPUB structure (chapters, sections)
    return content
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ')
      .trim();
  }

  private preprocessTXT(content: string): string {
    // Simple text preprocessing
    return content
      .replace(/\r\n/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private preprocessDOCX(content: string): string {
    // Handle DOCX structure
    return content
      .replace(/\s+/g, ' ')
      .trim();
  }

  private preprocessGeneric(content: string): string {
    return content.trim();
  }

  /**
   * Detect document structure (chapters, sections, etc.)
   */
  private detectStructure(content: string, documentType: string): {
    chapters: Array<{ start: number; end: number; title: string }>;
    sections: Array<{ start: number; end: number; title: string }>;
    paragraphs: Array<{ start: number; end: number }>;
  } {
    const chapters: Array<{ start: number; end: number; title: string }> = [];
    const sections: Array<{ start: number; end: number; title: string }> = [];
    const paragraphs: Array<{ start: number; end: number }> = [];

    // Detect chapters (common patterns)
    const chapterPatterns = [
      /^Chapter\s+\d+/im,
      /^CHAPTER\s+\d+/im,
      /^\d+\.\s+[A-Z]/im,
      /^[IVX]+\.\s+[A-Z]/im
    ];

    const lines = content.split('\n');
    let currentChapter = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineStart = content.indexOf(line);
      
      // Detect chapters
      if (chapterPatterns.some(pattern => pattern.test(line))) {
        if (currentChapter > 0) {
          chapters[currentChapter - 1].end = lineStart;
        }
        chapters.push({
          start: lineStart,
          end: content.length,
          title: line.trim()
        });
        currentChapter++;
      }

      // Detect paragraphs (non-empty lines)
      if (line.trim().length > 0) {
        const paragraphStart = lineStart;
        let paragraphEnd = lineStart + line.length;
        
        // Find paragraph end (next empty line or end of content)
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim().length === 0) {
            paragraphEnd = content.indexOf(lines[j]);
            break;
          }
          paragraphEnd = content.indexOf(lines[j]) + lines[j].length;
        }
        
        paragraphs.push({ start: paragraphStart, end: paragraphEnd });
      }
    }

    return { chapters, sections, paragraphs };
  }

  /**
   * Create semantic chunks with proper boundaries
   */
  private async createSemanticChunks(
    content: string,
    structure: any,
    options?: { onProgress?: (progress: number) => void; abortSignal?: AbortSignal }
  ): Promise<Chunk[]> {
    const chunks: Chunk[] = [];
    const { maxChunkSize, overlapSize, minChunkSize, semanticBoundaries } = this.config;

    if (content.length <= maxChunkSize) {
      // Single chunk for small documents
      chunks.push({
        id: crypto.randomUUID(),
        content: content,
        startIndex: 0,
        endIndex: content.length,
        metadata: {
          wordCount: content.split(/\s+/).length,
          characterCount: content.length,
          keywords: this.extractKeywords(content)
        },
        context: {}
      });
      return chunks;
    }

    // Multi-chunk processing for large documents
    let currentIndex = 0;
    let chunkIndex = 0;

    while (currentIndex < content.length && chunkIndex < this.config.maxChunksPerDocument) {
      options?.abortSignal?.throwIfAborted();

      const chunkStart = currentIndex;
      let chunkEnd = Math.min(chunkStart + maxChunkSize, content.length);

      // Find semantic boundary
      if (semanticBoundaries) {
        chunkEnd = this.findSemanticBoundary(content, chunkStart, chunkEnd);
      }

      // Ensure minimum chunk size
      if (chunkEnd - chunkStart < minChunkSize && chunkEnd < content.length) {
        chunkEnd = Math.min(chunkStart + minChunkSize, content.length);
      }

      const chunkContent = content.substring(chunkStart, chunkEnd);
      
      chunks.push({
        id: crypto.randomUUID(),
        content: chunkContent,
        startIndex: chunkStart,
        endIndex: chunkEnd,
        metadata: {
          wordCount: chunkContent.split(/\s+/).length,
          characterCount: chunkContent.length,
          keywords: this.extractKeywords(chunkContent)
        },
        context: {}
      });

      // Move to next chunk with overlap
      currentIndex = chunkEnd - overlapSize;
      chunkIndex++;

      // Report progress
      options?.onProgress?.(Math.min(chunkIndex / Math.ceil(content.length / maxChunkSize), 1));
    }

    return chunks;
  }

  /**
   * Find semantic boundary (end of sentence, paragraph, etc.)
   */
  private findSemanticBoundary(content: string, start: number, maxEnd: number): number {
    const searchText = content.substring(start, maxEnd);
    
    // Prefer paragraph boundaries
    const paragraphEnd = searchText.lastIndexOf('\n\n');
    if (paragraphEnd > searchText.length * 0.7) {
      return start + paragraphEnd + 2;
    }

    // Prefer sentence boundaries
    const sentenceEnd = searchText.lastIndexOf('. ');
    if (sentenceEnd > searchText.length * 0.7) {
      return start + sentenceEnd + 2;
    }

    // Fallback to word boundary
    const wordEnd = searchText.lastIndexOf(' ');
    if (wordEnd > searchText.length * 0.8) {
      return start + wordEnd + 1;
    }

    return maxEnd;
  }

  /**
   * Enrich chunks with additional metadata and context
   */
  private async enrichChunks(chunks: Chunk[], fullContent: string): Promise<Chunk[]> {
    return chunks.map((chunk, index) => {
      // Add context from adjacent chunks
      const context: Chunk['context'] = {};
      
      if (index > 0) {
        context.previousChunk = chunks[index - 1].content.substring(-200); // Last 200 chars
      }
      
      if (index < chunks.length - 1) {
        context.nextChunk = chunks[index + 1].content.substring(0, 200); // First 200 chars
      }

      // Add document section info
      const chunkMiddle = (chunk.startIndex + chunk.endIndex) / 2;
      const progress = chunkMiddle / fullContent.length;
      
      if (progress < 0.25) {
        context.documentSection = 'introduction';
      } else if (progress < 0.75) {
        context.documentSection = 'main_content';
      } else {
        context.documentSection = 'conclusion';
      }

      return {
        ...chunk,
        context
      };
    });
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);

    const wordFreq: { [key: string]: number } = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    return Object.entries(wordFreq)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Estimate page count based on content length and type
   */
  private estimatePages(content: string, documentType: string): number {
    const wordsPerPage = documentType === 'pdf' ? 250 : 300;
    const wordCount = content.split(/\s+/).length;
    return Math.max(1, Math.ceil(wordCount / wordsPerPage));
  }

  /**
   * Detect language of content
   */
  private detectLanguage(content: string): string {
    // Simple language detection
    const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    const words = content.toLowerCase().split(/\s+/);
    const englishCount = words.filter(word => englishWords.includes(word)).length;
    
    return englishCount > words.length * 0.1 ? 'en' : 'unknown';
  }

  /**
   * Assess content complexity
   */
  private assessComplexity(content: string): 'low' | 'medium' | 'high' {
    const words = content.split(/\s+/);
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    const sentenceCount = (content.match(/[.!?]+/g) || []).length;
    const avgSentenceLength = words.length / sentenceCount;

    if (avgWordLength > 6 || avgSentenceLength > 20) return 'high';
    if (avgWordLength > 5 || avgSentenceLength > 15) return 'medium';
    return 'low';
  }
}
