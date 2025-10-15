// Comprehensive File Parser - Handles ANY file type
// Supports: PNG, PDF, TXT, PY, TSX, JS, HTML, CSS, JSON, XML, CSV, MD, and more!

export interface ParsedFileContent {
  name: string;
  type: string;
  size: number;
  content: string; // Base64 encoded for storage
  extractedText: string; // Plain text for AI processing
  metadata: {
    pageCount?: number;
    wordCount?: number;
    language?: string;
    keywords?: string[];
    encoding?: string;
    lastModified?: string;
    fileCategory?: string;
    programmingLanguage?: string;
    hasImages?: boolean;
    hasCode?: boolean;
    complexity?: 'simple' | 'moderate' | 'complex';
  };
}

export interface FileParseOptions {
  maxSize?: number;
  extractText?: boolean;
  generateSummary?: boolean;
  storeContent?: boolean;
  detectLanguage?: boolean;
  extractKeywords?: boolean;
}

export class ComprehensiveFileParser {
  private static readonly DEFAULT_MAX_SIZE = 50 * 1024 * 1024; // 50MB
  // Removed unused MAX_TEXT_SIZE constant

  // Comprehensive file type mappings
  private static readonly FILE_TYPE_MAPPINGS: { [key: string]: { category: string; language: string; extensions: string[] } } = {
    // Programming Languages
    'text/javascript': { category: 'code', language: 'javascript', extensions: ['.js', '.mjs', '.cjs'] },
    'text/typescript': { category: 'code', language: 'typescript', extensions: ['.ts', '.tsx'] },
    'text/x-python': { category: 'code', language: 'python', extensions: ['.py', '.pyw', '.pyc'] },
    'text/x-java': { category: 'code', language: 'java', extensions: ['.java'] },
    'text/x-c': { category: 'code', language: 'c', extensions: ['.c', '.h'] },
    'text/x-c++': { category: 'code', language: 'cpp', extensions: ['.cpp', '.cc', '.cxx', '.hpp'] },
    'text/x-csharp': { category: 'code', language: 'csharp', extensions: ['.cs'] },
    'text/x-ruby': { category: 'code', language: 'ruby', extensions: ['.rb'] },
    'text/x-php': { category: 'code', language: 'php', extensions: ['.php'] },
    'text/x-go': { category: 'code', language: 'go', extensions: ['.go'] },
    'text/x-rust': { category: 'code', language: 'rust', extensions: ['.rs'] },
    'text/x-swift': { category: 'code', language: 'swift', extensions: ['.swift'] },
    'text/x-kotlin': { category: 'code', language: 'kotlin', extensions: ['.kt'] },
    'text/x-scala': { category: 'code', language: 'scala', extensions: ['.scala'] },
    'text/x-clojure': { category: 'code', language: 'clojure', extensions: ['.clj'] },
    'text/x-haskell': { category: 'code', language: 'haskell', extensions: ['.hs'] },
    'text/x-lua': { category: 'code', language: 'lua', extensions: ['.lua'] },
    'text/x-perl': { category: 'code', language: 'perl', extensions: ['.pl', '.pm'] },
    'text/x-shellscript': { category: 'code', language: 'bash', extensions: ['.sh', '.bash'] },
    'text/x-powershell': { category: 'code', language: 'powershell', extensions: ['.ps1'] },
    'text/x-batch': { category: 'code', language: 'batch', extensions: ['.bat', '.cmd'] },
    'text/x-dockerfile': { category: 'code', language: 'dockerfile', extensions: ['.dockerfile', 'Dockerfile'] },
    'text/x-yaml': { category: 'config', language: 'yaml', extensions: ['.yml', '.yaml'] },
    'text/x-toml': { category: 'config', language: 'toml', extensions: ['.toml'] },
    'text/x-ini': { category: 'config', language: 'ini', extensions: ['.ini', '.cfg'] },
    'text/x-properties': { category: 'config', language: 'properties', extensions: ['.properties'] },
    'text/x-env': { category: 'config', language: 'env', extensions: ['.env'] },

    // Web Technologies
    'text/html': { category: 'web', language: 'html', extensions: ['.html', '.htm'] },
    'text/css': { category: 'web', language: 'css', extensions: ['.css'] },
    'text/x-sass': { category: 'web', language: 'sass', extensions: ['.sass'] },
    'text/x-scss': { category: 'web', language: 'scss', extensions: ['.scss'] },
    'text/x-less': { category: 'web', language: 'less', extensions: ['.less'] },
    'text/x-stylus': { category: 'web', language: 'stylus', extensions: ['.styl'] },
    'text/x-vue': { category: 'web', language: 'vue', extensions: ['.vue'] },
    'text/x-svelte': { category: 'web', language: 'svelte', extensions: ['.svelte'] },
    'text/x-jsx': { category: 'web', language: 'jsx', extensions: ['.jsx'] },

    // Data Formats
    'application/json': { category: 'data', language: 'json', extensions: ['.json'] },
    'application/xml': { category: 'data', language: 'xml', extensions: ['.xml'] },
    'text/xml': { category: 'data', language: 'xml', extensions: ['.xml'] },
    'text/csv': { category: 'data', language: 'csv', extensions: ['.csv'] },
    'text/tab-separated-values': { category: 'data', language: 'tsv', extensions: ['.tsv'] },
    'application/x-sql': { category: 'data', language: 'sql', extensions: ['.sql'] },
    'text/x-graphql': { category: 'data', language: 'graphql', extensions: ['.graphql', '.gql'] },

    // Documents
    'text/plain': { category: 'document', language: 'text', extensions: ['.txt'] },
    'text/markdown': { category: 'document', language: 'markdown', extensions: ['.md', '.markdown'] },
    'text/x-rst': { category: 'document', language: 'rst', extensions: ['.rst'] },
    'text/x-asciidoc': { category: 'document', language: 'asciidoc', extensions: ['.adoc', '.asciidoc'] },
    'application/rtf': { category: 'document', language: 'rtf', extensions: ['.rtf'] },
    'application/pdf': { category: 'document', language: 'pdf', extensions: ['.pdf'] },

    // Office Documents
    'application/msword': { category: 'office', language: 'word', extensions: ['.doc'] },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { category: 'office', language: 'word', extensions: ['.docx'] },
    'application/vnd.ms-excel': { category: 'office', language: 'excel', extensions: ['.xls'] },
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { category: 'office', language: 'excel', extensions: ['.xlsx'] },
    'application/vnd.ms-powerpoint': { category: 'office', language: 'powerpoint', extensions: ['.ppt'] },
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': { category: 'office', language: 'powerpoint', extensions: ['.pptx'] },

    // Images
    'image/jpeg': { category: 'image', language: 'jpeg', extensions: ['.jpg', '.jpeg'] },
    'image/png': { category: 'image', language: 'png', extensions: ['.png'] },
    'image/gif': { category: 'image', language: 'gif', extensions: ['.gif'] },
    'image/webp': { category: 'image', language: 'webp', extensions: ['.webp'] },
    'image/svg+xml': { category: 'image', language: 'svg', extensions: ['.svg'] },
    'image/bmp': { category: 'image', language: 'bmp', extensions: ['.bmp'] },
    'image/tiff': { category: 'image', language: 'tiff', extensions: ['.tiff', '.tif'] },
    'image/x-icon': { category: 'image', language: 'icon', extensions: ['.ico'] },

    // Archives
    'application/zip': { category: 'archive', language: 'zip', extensions: ['.zip'] },
    'application/x-tar': { category: 'archive', language: 'tar', extensions: ['.tar'] },
    'application/gzip': { category: 'archive', language: 'gzip', extensions: ['.gz'] },
    'application/x-7z-compressed': { category: 'archive', language: '7z', extensions: ['.7z'] },
    'application/x-rar-compressed': { category: 'archive', language: 'rar', extensions: ['.rar'] },

    // Video Files
    'video/mp4': { category: 'video', language: 'mp4', extensions: ['.mp4'] },
    'video/avi': { category: 'video', language: 'avi', extensions: ['.avi'] },
    'video/quicktime': { category: 'video', language: 'mov', extensions: ['.mov'] },
    'video/x-matroska': { category: 'video', language: 'mkv', extensions: ['.mkv'] },
    'video/webm': { category: 'video', language: 'webm', extensions: ['.webm'] },
    'video/x-flv': { category: 'video', language: 'flv', extensions: ['.flv'] },
    'video/x-ms-wmv': { category: 'video', language: 'wmv', extensions: ['.wmv'] },
    'video/mp2t': { category: 'video', language: 'ts', extensions: ['.ts'] },
    'video/3gpp': { category: 'video', language: '3gp', extensions: ['.3gp'] },
    'video/ogg': { category: 'video', language: 'ogv', extensions: ['.ogv'] },

    // Audio
    'audio/mpeg': { category: 'audio', language: 'mp3', extensions: ['.mp3'] },
    'audio/wav': { category: 'audio', language: 'wav', extensions: ['.wav'] },
    'audio/ogg': { category: 'audio', language: 'ogg', extensions: ['.ogg'] },
    'audio/mp4': { category: 'audio', language: 'm4a', extensions: ['.m4a'] },
    'audio/flac': { category: 'audio', language: 'flac', extensions: ['.flac'] },

    // Video (duplicate removed)
    'video/x-msvideo': { category: 'video', language: 'avi', extensions: ['.avi'] },
    'video/webm': { category: 'video', language: 'webm', extensions: ['.webm'] },

    // Fonts
    'font/ttf': { category: 'font', language: 'ttf', extensions: ['.ttf'] },
    'font/woff': { category: 'font', language: 'woff', extensions: ['.woff'] },
    'font/woff2': { category: 'font', language: 'woff2', extensions: ['.woff2'] },
    'font/otf': { category: 'font', language: 'otf', extensions: ['.otf'] },

    // 3D Models
    'model/obj': { category: '3d', language: 'obj', extensions: ['.obj'] },
    'model/stl': { category: '3d', language: 'stl', extensions: ['.stl'] },
    'model/gltf+json': { category: '3d', language: 'gltf', extensions: ['.gltf'] },
    'model/gltf-binary': { category: '3d', language: 'glb', extensions: ['.glb'] }
  };

  /**
   * Parse any file type with comprehensive support
   */
  static async parseFile(file: File, options: FileParseOptions = {}): Promise<ParsedFileContent> {
    const {
      maxSize = this.DEFAULT_MAX_SIZE,
      extractText = true,
      storeContent = true,
      detectLanguage = true,
      extractKeywords = true
    } = options;

    // Enhanced validation
    this.validateFile(file, maxSize);

    const baseInfo = {
      name: file.name,
      type: file.type,
      size: file.size,
      content: '',
      extractedText: '',
      metadata: {
        lastModified: new Date(file.lastModified).toISOString(),
        fileCategory: ComprehensiveFileParser.getFileCategory(file),
        programmingLanguage: this.getProgrammingLanguage(file),
        complexity: this.assessComplexity(file)
      }
    };

    try {
      // Get file content as Base64 for storage
      const content = storeContent ? await this.fileToBase64(file) : '';

      // Extract text content based on file type
      const extractedText = extractText ? await this.extractTextContent(file) : '';

      // Generate comprehensive metadata
      const metadata = await this.generateMetadata(file, extractedText, {
        detectLanguage,
        extractKeywords
      });

      return {
        ...baseInfo,
        content,
        extractedText,
        metadata: { ...baseInfo.metadata, ...metadata }
      };
    } catch (error) {
      console.error(`Error parsing file ${file.name}:`, error);
      return {
        ...baseInfo,
        content: '',
        extractedText: `Error parsing file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: { ...baseInfo.metadata }
      };
    }
  }

  /**
   * Parse multiple files in parallel
   */
  static async parseFiles(files: File[], options: FileParseOptions = {}): Promise<ParsedFileContent[]> {
    const parsePromises = files.map(file => this.parseFile(file, options));
    return Promise.all(parsePromises);
  }

  /**
   * Get programming language based on MIME type
   */
  private static getProgrammingLanguage(file: File): string | undefined {
    const mapping = this.FILE_TYPE_MAPPINGS[file.type];
    return mapping?.language;
  }

  /**
   * Assess file complexity
   */
  private static assessComplexity(file: File): 'simple' | 'moderate' | 'complex' {
    const category = ComprehensiveFileParser.getFileCategory(file);
    const size = file.size;

    if (category === 'image' || category === 'audio' || category === 'video') {
      return size > 10 * 1024 * 1024 ? 'complex' : 'moderate';
    }

    if (category === 'code') {
      return size > 100 * 1024 ? 'complex' : size > 10 * 1024 ? 'moderate' : 'simple';
    }

    if (category === 'document') {
      return size > 5 * 1024 * 1024 ? 'complex' : size > 500 * 1024 ? 'moderate' : 'simple';
    }

    return 'simple';
  }

  /**
   * Extract text content based on file type
   */
  private static async extractTextContent(file: File): Promise<string> {
    const category = ComprehensiveFileParser.getFileCategory(file);
    const language = this.getProgrammingLanguage(file);

    switch (category) {
      case 'code':
        return await this.extractCodeContent(file, language);
      
      case 'document':
        return await this.extractDocumentContent(file);
      
      case 'data':
        return await this.extractDataContent(file);
      
      case 'web':
        return await this.extractWebContent(file);
      
      case 'config':
        return await this.extractConfigContent(file);
      
      case 'image':
        return await this.extractImageContent(file);
      
      case 'archive':
        return await this.extractArchiveContent(file);
      
      case 'audio':
        return await this.extractAudioContent(file);
      
      case 'video':
        return await this.extractVideoContent(file);
      
      default:
        return await this.extractGenericContent(file);
    }
  }

  /**
   * Extract content from code files
   */
  private static async extractCodeContent(file: File, language?: string): Promise<string> {
    try {
      const content = await this.readFileAsText(file);
      
      // Add language-specific analysis
      const analysis = this.analyzeCodeContent(content, language);
      
      return `${analysis}\n\n${content}`;
    } catch (error) {
      return `Code file: ${file.name} (${language || 'unknown language'}, ${this.formatFileSize(file.size)})`;
    }
  }

  /**
   * Analyze code content for structure and complexity
   */
  private static analyzeCodeContent(content: string, language?: string): string {
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    
    const analysis = {
      totalLines: lines.length,
      codeLines: nonEmptyLines.length,
      language: language || 'unknown',
      hasComments: content.includes('//') || content.includes('/*') || content.includes('#'),
      hasFunctions: content.includes('function') || content.includes('def ') || content.includes('class '),
      hasImports: content.includes('import ') || content.includes('require(') || content.includes('from '),
      complexity: nonEmptyLines.length > 1000 ? 'complex' : nonEmptyLines.length > 100 ? 'moderate' : 'simple'
    };

    return `Code Analysis:
- Language: ${analysis.language}
- Total Lines: ${analysis.totalLines}
- Code Lines: ${analysis.codeLines}
- Has Comments: ${analysis.hasComments ? 'Yes' : 'No'}
- Has Functions/Classes: ${analysis.hasFunctions ? 'Yes' : 'No'}
- Has Imports: ${analysis.hasImports ? 'Yes' : 'No'}
- Complexity: ${analysis.complexity}`;
  }

  /**
   * Extract content from document files
   */
  private static async extractDocumentContent(file: File): Promise<string> {
    if (file.type === 'application/pdf') {
      return await this.extractPDFContent(file);
    }
    
    try {
      const content = await this.readFileAsText(file);
      return this.cleanText(content);
    } catch (error) {
      return `Document: ${file.name} (${file.type}, ${this.formatFileSize(file.size)})`;
    }
  }

  /**
   * Extract content from data files
   */
  private static async extractDataContent(file: File): Promise<string> {
    try {
      const content = await this.readFileAsText(file);
      
      if (file.type === 'application/json') {
        return this.analyzeJSONContent(content);
      } else if (file.type === 'text/csv') {
        return this.analyzeCSVContent(content);
      } else if (file.type.includes('xml')) {
        return this.analyzeXMLContent(content);
      }
      
      return this.cleanText(content);
    } catch (error) {
      return `Data file: ${file.name} (${file.type}, ${this.formatFileSize(file.size)})`;
    }
  }

  /**
   * Extract content from web files
   */
  private static async extractWebContent(file: File): Promise<string> {
    try {
      const content = await this.readFileAsText(file);
      
      if (file.type === 'text/html') {
        return this.analyzeHTMLContent(content);
      } else if (file.type === 'text/css') {
        return this.analyzeCSSContent(content);
      }
      
      return this.cleanText(content);
    } catch (error) {
      return `Web file: ${file.name} (${file.type}, ${this.formatFileSize(file.size)})`;
    }
  }

  /**
   * Extract content from config files
   */
  private static async extractConfigContent(file: File): Promise<string> {
    try {
      const content = await this.readFileAsText(file);
      return this.cleanText(content);
    } catch (error) {
      return `Config file: ${file.name} (${file.type}, ${this.formatFileSize(file.size)})`;
    }
  }

  /**
   * Extract content from image files with OCR capability
   */
  private static async extractImageContent(file: File): Promise<string> {
    const baseInfo = `Image file: ${file.name} (${file.type}, ${this.formatFileSize(file.size)}). This appears to be a ${file.type.split('/')[1].toUpperCase()} image.`;
    
    try {
      // Import OCR service dynamically to avoid bundling issues
      const { OCRService } = await import('./ocrService');
      
      // Check if this is an image file that can be processed by OCR
      if (OCRService.isImageFile(file)) {
        console.log(`🔍 Attempting OCR extraction for: ${file.name}`);
        
        // Extract text using OCR
        const ocrResult = await OCRService.extractTextFromImage(file, {
          language: 'eng',
          logger: (m: any) => console.log(`OCR Progress for ${file.name}:`, m),
          timeout: 30000 // 30 second timeout
        });
        
        if (ocrResult.success && ocrResult.text.length > 0) {
          const reliability = OCRService.isReliableResult(ocrResult) ? '✅ Reliable' : '⚠️ Low confidence';
          
          return `${baseInfo}

${reliability} OCR Text Extraction (${ocrResult.confidence}% confidence, ${ocrResult.wordCount} words, ${ocrResult.processingTime}ms):

${ocrResult.text}

This image contains readable text that can be used as knowledge.`;
        } else if (ocrResult.success && ocrResult.text.length === 0) {
          return `${baseInfo}

No readable text detected in this image (${ocrResult.confidence}% confidence).
This image may not contain text or the text may not be clearly visible.`;
        } else {
          return `${baseInfo}

OCR processing failed: ${ocrResult.error || 'Unknown error'}.
This image could not be processed for text extraction.`;
        }
      } else {
        return `${baseInfo}

This image format is not supported for OCR text extraction.
Supported formats: ${OCRService.getSupportedFormats().join(', ')}.`;
      }
    } catch (error) {
      console.error(`OCR processing error for ${file.name}:`, error);
      return `${baseInfo}

OCR processing encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}.
This image could not be processed for text extraction.`;
    }
  }

  /**
   * Extract content from video files using external MOCR service
   */
  private static async extractVideoContent(file: File): Promise<string> {
    const baseInfo = `Video file: ${file.name} (${file.type}, ${this.formatFileSize(file.size)}). This appears to be a video file.`;
    
    try {
      // Import MOCR client dynamically
      const { default: mocrClient } = await import('./mocrClient');
      
      // Check if this is a video file that can be processed
      if (this.isVideoFile(file)) {
        console.log(`🎬 Attempting video analysis for: ${file.name}`);
        
        // Check if MOCR service is available
        const isAvailable = await mocrClient.isAvailable();
        if (!isAvailable) {
          return `${baseInfo}

MOCR service is not available. Please ensure the MOCR service is running.
This video could not be processed for content extraction.`;
        }
        
        // Analyze video content using external MOCR service
        const analysisResult = await mocrClient.analyzeVideo(file, {
          maxFrames: 20, // Limit frames for performance
          frameInterval: 3, // 3-second intervals
          ocrLanguage: 'eng',
          asrLanguage: 'en',
          enableTemporalAnalysis: true,
          enableSceneDetection: true,
          enableSynchronization: true
        });
        
        if (analysisResult.success) {
          const visualText = analysisResult.mocrAnalysis.textExtracted;
          const audioText = analysisResult.asrAnalysis.wordsTranscribed;
          const synchronized = analysisResult.synchronizedContent.length;
          
          return `${baseInfo}

🎬 MOCR Video Analysis Complete (${analysisResult.processingTime}ms):
📊 Resolution: ${analysisResult.videoMetadata.width}x${analysisResult.videoMetadata.height}
⏱️  Duration: ${this.formatDuration(analysisResult.videoMetadata.duration)}
🎬 MOCR (Visual Text): ✅ ${visualText} characters extracted
🎤 ASR (Audio): ✅ ${audioText} words transcribed
🔄 Synchronized Content: ${synchronized} time-synchronized segments

${analysisResult.contentSummary.title ? `Title: ${analysisResult.contentSummary.title}\n` : ''}
Description: ${analysisResult.contentSummary.description}

Key Topics: ${analysisResult.contentSummary.keyTopics.join(', ') || 'None detected'}

${analysisResult.synchronizedContent.length > 0 ? `Sample Content (first 3 segments):\n${analysisResult.synchronizedContent.slice(0, 3).map(content => 
  `[${this.formatDuration(content.timestamp)}s] ${content.combinedText.substring(0, 100)}${content.combinedText.length > 100 ? '...' : ''}`
).join('\n')}` : 'No synchronized content available.'}

This video has been analyzed using the external MOCR (Motion Optical Character Recognition) service for both visual text and audio content, making it searchable and referenceable in conversations.`;
        } else {
          return `${baseInfo}

MOCR video analysis failed: ${analysisResult.error || 'Unknown error'}.
This video could not be processed for content extraction.`;
        }
      } else {
        return `${baseInfo}

This video format is not supported for content analysis.
Supported formats: MP4, AVI, MOV, MKV, WebM, FLV, WMV, M4V, 3GP, OGV.`;
      }
    } catch (error) {
      console.error(`MOCR video analysis error for ${file.name}:`, error);
      return `${baseInfo}

MOCR video analysis encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}.
This video could not be processed for content extraction.`;
    }
  }

  /**
   * Extract content from archive files
   */
  private static async extractArchiveContent(file: File): Promise<string> {
    return `Archive file: ${file.name} (${file.type}, ${this.formatFileSize(file.size)}). This appears to be a compressed archive.`;
  }

  /**
   * Extract content from media files
   */
  private static async extractMediaContent(file: File): Promise<string> {
    const category = ComprehensiveFileParser.getFileCategory(file);
    return `${category.charAt(0).toUpperCase() + category.slice(1)} file: ${file.name} (${file.type}, ${this.formatFileSize(file.size)}). This appears to be a ${category} file.`;
  }

  /**
   * Extract content from generic files
   */
  private static async extractGenericContent(file: File): Promise<string> {
    return `File: ${file.name} (${file.type}, ${this.formatFileSize(file.size)}). This file type may not be directly readable.`;
  }

  /**
   * Read file as text with proper encoding detection
   */
  private static async readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const result = e.target?.result as string;
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  /**
   * Convert file to Base64 string
   */
  private static async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Extract PDF content (enhanced version)
   */
  private static async extractPDFContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Try multiple PDF text extraction methods
          let textContent = '';
          
          // Method 1: UTF-8 decoding
          try {
            const textDecoder = new TextDecoder('utf-8');
            const pdfString = textDecoder.decode(uint8Array);
            textContent = this.extractReadableTextFromPDF(pdfString);
          } catch (error) {
            console.log('UTF-8 decoding failed, trying other methods...');
          }
          
          // Method 2: Latin-1 decoding
          if (!textContent || textContent.length < 50) {
            try {
              const textDecoder = new TextDecoder('latin1');
              const pdfString = textDecoder.decode(uint8Array);
              textContent = this.extractReadableTextFromPDF(pdfString);
            } catch (error) {
              console.log('Latin-1 decoding failed...');
            }
          }
          
          // Method 3: Text streams
          if (!textContent || textContent.length < 50) {
            textContent = this.extractPDFTextStreams(uint8Array);
          }
          
          // Method 4: Basic character extraction
          if (!textContent || textContent.length < 50) {
            textContent = this.extractBasicTextFromPDF(uint8Array);
          }
          
          if (!textContent || textContent.length < 50) {
            textContent = `PDF document "${file.name}" (${this.formatFileSize(file.size)}). This appears to be a PDF file that may contain text, images, or other content. The text content could not be automatically extracted.`;
          }
          
          resolve(textContent);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read PDF file'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Extract readable text from PDF string
   */
  private static extractReadableTextFromPDF(pdfString: string): string {
    let textContent = '';
    
    const patterns = [
      /\(([^)]{3,})\)/g,
      /\[([^\]]{3,})\]/g,
      /BT\s*([^E]+?)ET/g,
      /Tj\s*\(([^)]+)\)/g,
      /TJ\s*\[([^\]]+)\]/g
    ];
    
    for (const pattern of patterns) {
      const matches = pdfString.match(pattern);
      if (matches) {
        const extracted = matches
          .map(match => {
            const content = match.replace(/^[^([]*[(\[]/, '').replace(/[)\]]$/, '');
            return content;
          })
          .filter(text => text.length > 3 && this.isReadableText(text))
          .join(' ');
        
        if (extracted.length > textContent.length) {
          textContent = extracted;
        }
      }
    }
    
    return this.cleanText(textContent);
  }

  /**
   * Extract text from PDF text streams
   */
  private static extractPDFTextStreams(uint8Array: Uint8Array): string {
    const pdfString = new TextDecoder('latin1').decode(uint8Array);
    let textContent = '';
    
    const streamMatches = pdfString.match(/stream\s*([\s\S]*?)\s*endstream/g);
    if (streamMatches) {
      for (const stream of streamMatches) {
        const streamContent = stream.replace(/^stream\s*/, '').replace(/\s*endstream$/, '');
        const readableText = streamContent
          .replace(/[^\w\s\-.,;:!?()]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (readableText.length > 50 && this.isReadableText(readableText)) {
          textContent += readableText + ' ';
        }
      }
    }
    
    return this.cleanText(textContent);
  }

  /**
   * Extract basic text by filtering readable characters
   */
  private static extractBasicTextFromPDF(uint8Array: Uint8Array): string {
    const pdfString = new TextDecoder('latin1').decode(uint8Array);
    
    const chunks = pdfString.split(/\s+/);
    const readableChunks = chunks
      .map(chunk => {
        const readableChars = chunk.replace(/[^\w\s\-.,;:!?()]/g, '').length;
        const totalChars = chunk.length;
        
        if (totalChars > 0 && readableChars / totalChars > 0.3) {
          return chunk.replace(/[^\w\s\-.,;:!?()]/g, ' ');
        }
        return '';
      })
      .filter(chunk => chunk.length > 2)
      .join(' ');
    
    const textContent = readableChunks
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 2000);
    
    return this.cleanText(textContent);
  }

  /**
   * Analyze JSON content
   */
  private static analyzeJSONContent(content: string): string {
    try {
      const parsed = JSON.parse(content);
      const analysis = {
        type: Array.isArray(parsed) ? 'array' : typeof parsed,
        size: content.length,
        keys: typeof parsed === 'object' && parsed !== null ? Object.keys(parsed).length : 0,
        valid: true
      };
      
      return `JSON Analysis:
- Type: ${analysis.type}
- Size: ${analysis.size} characters
- Keys: ${analysis.keys}
- Valid: ${analysis.valid ? 'Yes' : 'No'}

Content:
${content.substring(0, 1000)}${content.length > 1000 ? '...' : ''}`;
    } catch (error) {
      return `Invalid JSON file: ${content.substring(0, 500)}`;
    }
  }

  /**
   * Analyze CSV content
   */
  private static analyzeCSVContent(content: string): string {
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    const headers = nonEmptyLines[0]?.split(',') || [];
    
    const analysis = {
      rows: nonEmptyLines.length,
      columns: headers.length,
      headers: headers.slice(0, 10) // First 10 headers
    };
    
    return `CSV Analysis:
- Rows: ${analysis.rows}
- Columns: ${analysis.columns}
- Headers: ${analysis.headers.join(', ')}

Content Preview:
${content.substring(0, 1000)}${content.length > 1000 ? '...' : ''}`;
  }

  /**
   * Analyze XML content
   */
  private static analyzeXMLContent(content: string): string {
    const analysis = {
      size: content.length,
      hasRoot: content.includes('<') && content.includes('>'),
      elements: (content.match(/<[^/][^>]*>/g) || []).length,
      attributes: (content.match(/<[^>]+\s+[^=]+="[^"]*"/g) || []).length
    };
    
    return `XML Analysis:
- Size: ${analysis.size} characters
- Has Root Element: ${analysis.hasRoot ? 'Yes' : 'No'}
- Elements: ${analysis.elements}
- Attributes: ${analysis.attributes}

Content Preview:
${content.substring(0, 1000)}${content.length > 1000 ? '...' : ''}`;
  }

  /**
   * Analyze HTML content
   */
  private static analyzeHTMLContent(content: string): string {
    const analysis = {
      size: content.length,
      hasDoctype: content.includes('<!DOCTYPE'),
      hasTitle: content.includes('<title>'),
      hasHead: content.includes('<head>'),
      hasBody: content.includes('<body>'),
      scripts: (content.match(/<script/g) || []).length,
      styles: (content.match(/<style/g) || []).length,
      links: (content.match(/<a\s+href/g) || []).length,
      images: (content.match(/<img/g) || []).length
    };
    
    return `HTML Analysis:
- Size: ${analysis.size} characters
- Has DOCTYPE: ${analysis.hasDoctype ? 'Yes' : 'No'}
- Has Title: ${analysis.hasTitle ? 'Yes' : 'No'}
- Has Head: ${analysis.hasHead ? 'Yes' : 'No'}
- Has Body: ${analysis.hasBody ? 'Yes' : 'No'}
- Scripts: ${analysis.scripts}
- Styles: ${analysis.styles}
- Links: ${analysis.links}
- Images: ${analysis.images}

Content Preview:
${content.substring(0, 1000)}${content.length > 1000 ? '...' : ''}`;
  }

  /**
   * Analyze CSS content
   */
  private static analyzeCSSContent(content: string): string {
    const analysis = {
      size: content.length,
      selectors: (content.match(/[^{}]+{/g) || []).length,
      properties: (content.match(/[a-zA-Z-]+:/g) || []).length,
      mediaQueries: (content.match(/@media/g) || []).length,
      imports: (content.match(/@import/g) || []).length,
      keyframes: (content.match(/@keyframes/g) || []).length
    };
    
    return `CSS Analysis:
- Size: ${analysis.size} characters
- Selectors: ${analysis.selectors}
- Properties: ${analysis.properties}
- Media Queries: ${analysis.mediaQueries}
- Imports: ${analysis.imports}
- Keyframes: ${analysis.keyframes}

Content Preview:
${content.substring(0, 1000)}${content.length > 1000 ? '...' : ''}`;
  }

  /**
   * Generate comprehensive metadata
   */
  private static async generateMetadata(file: File, extractedText: string, options: { detectLanguage: boolean; extractKeywords: boolean }): Promise<ParsedFileContent['metadata']> {
    const metadata: ParsedFileContent['metadata'] = {
      lastModified: new Date(file.lastModified).toISOString(),
      fileCategory: this.getFileCategory(file),
      programmingLanguage: this.getProgrammingLanguage(file),
      complexity: this.assessComplexity(file)
    };

    if (extractedText && options.detectLanguage) {
      metadata.wordCount = extractedText.split(/\s+/).length;
      metadata.language = this.detectLanguage(extractedText);
    }

    if (extractedText && options.extractKeywords) {
      metadata.keywords = this.extractKeywords(extractedText);
    }

    if (file.type === 'application/pdf') {
      metadata.pageCount = this.estimatePageCount(file.size);
    }

    if (this.getFileCategory(file) === 'code') {
      metadata.hasCode = true;
    }

    if (this.getFileCategory(file) === 'image') {
      metadata.hasImages = true;
    }

    return metadata;
  }

  /**
   * Validate file before processing
   */
  private static validateFile(file: File, maxSize: number): void {
    if (file.size > maxSize) {
      throw new Error(`File ${file.name} is too large. Maximum size allowed is ${this.formatFileSize(maxSize)}.`);
    }

    if (file.size === 0) {
      throw new Error(`File ${file.name} is empty.`);
    }
  }

  /**
   * Check if text is readable
   */
  private static isReadableText(text: string): boolean {
    if (text.length < 10) return false;
    
    const readableChars = text.replace(/[^\w\s\-.,;:!?()]/g, '').length;
    const totalChars = text.length;
    
    return readableChars / totalChars > 0.5;
  }

  /**
   * Clean and format text
   */
  private static cleanText(text: string): string {
    if (!text) return '';
    
    return text
      .replace(/\s+/g, ' ')
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
      .replace(/[^\w\s\-.,;:!?()]/g, ' ')
      .replace(/\s*([.,;:!?])\s*/g, '$1 ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract keywords from text
   */
  private static extractKeywords(text: string): string[] {
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
   * Detect language of text
   */
  private static detectLanguage(text: string): string {
    const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    const spanishWords = ['el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'es', 'se', 'no', 'te'];
    
    const words = text.toLowerCase().split(/\s+/);
    const englishCount = words.filter(word => englishWords.includes(word)).length;
    const spanishCount = words.filter(word => spanishWords.includes(word)).length;
    
    if (englishCount > spanishCount) return 'en';
    if (spanishCount > englishCount) return 'es';
    return 'unknown';
  }

  /**
   * Estimate page count for PDFs
   */
  private static estimatePageCount(fileSize: number): number {
    return Math.max(1, Math.round(fileSize / 2048));
  }

  /**
   * Format file size
   */
  private static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get file icon based on type
   */
  static getFileIcon(mimeType: string): string {
    const category = this.getFileCategory({ type: mimeType } as File);
    
    switch (category) {
      case 'code': return '💻';
      case 'web': return '🌐';
      case 'data': return '📊';
      case 'document': return '📄';
      case 'image': return '🖼️';
      case 'audio': return '🎵';
      case 'video': return '🎬';
      case 'archive': return '📦';
      case 'font': return '🔤';
      case '3d': return '🎨';
      case 'config': return '⚙️';
      default: return '📁';
    }
  }

  /**
   * Get file category (static method)
   */
  static getFileCategory(file: { type: string }): string {
    const mapping = this.FILE_TYPE_MAPPINGS[file.type];
    return mapping?.category || 'unknown';
  }

  /**
   * Check if file type is supported
   */
  static isSupportedType(mimeType: string): boolean {
    return mimeType in this.FILE_TYPE_MAPPINGS || mimeType.startsWith('text/') || mimeType.startsWith('application/');
  }

  /**
   * Get all supported file types
   */
  static getSupportedTypes(): string[] {
    return Object.keys(this.FILE_TYPE_MAPPINGS);
  }

  /**
   * Generate summary of file content
   */
  static generateSummary(parsedContent: ParsedFileContent): string {
    const { name, extractedText, metadata } = parsedContent;
    const category = metadata.fileCategory || 'unknown';
    const language = metadata.programmingLanguage || metadata.language || 'unknown';

    let summary = `File: ${name} (${category}, ${language})`;

    if (metadata.wordCount) {
      summary += ` - ${metadata.wordCount} words`;
    }

    if (metadata.pageCount) {
      summary += ` - ${metadata.pageCount} pages`;
    }

    if (extractedText && extractedText.length > 0) {
      const preview = extractedText.substring(0, 200);
      summary += `\n\nContent Preview:\n${preview}${extractedText.length > 200 ? '...' : ''}`;
    }

    return summary;
  }

  /**
   * Check if file is a video
   */
  private static isVideoFile(file: File): boolean {
    return file.type.startsWith('video/') || 
           this.FILE_TYPE_MAPPINGS[file.type]?.category === 'video';
  }

  /**
   * Format duration for display
   */
  private static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }
}
