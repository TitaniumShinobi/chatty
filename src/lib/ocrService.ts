/**
 * OCR Service for extracting text from images
 * Uses Tesseract.js for browser-based optical character recognition
 */

import Tesseract from 'tesseract.js';

export interface OCROptions {
  language?: string;
  logger?: (m: any) => void;
  timeout?: number;
}

export interface OCRResult {
  text: string;
  confidence: number;
  processingTime: number;
  wordCount: number;
  success: boolean;
  error?: string;
}

export class OCRService {
  private static readonly DEFAULT_LANGUAGE = 'eng';
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private static readonly MIN_CONFIDENCE = 30; // Minimum confidence threshold

  /**
   * Extract text from an image file using OCR
   */
  static async extractTextFromImage(
    file: File, 
    options: OCROptions = {}
  ): Promise<OCRResult> {
    const startTime = Date.now();
    const {
      language = this.DEFAULT_LANGUAGE,
      logger = (m: any) => console.log('OCR Progress:', m),
      timeout = this.DEFAULT_TIMEOUT
    } = options;

    try {
      // Validate file type
      if (!this.isImageFile(file)) {
        throw new Error(`Unsupported file type: ${file.type}. Only image files are supported.`);
      }

      // Validate file size (limit to 10MB for performance)
      if (file.size > 10 * 1024 * 1024) {
        throw new Error(`File too large: ${file.size} bytes. Maximum size is 10MB.`);
      }

      console.log(`🔍 Starting OCR processing for: ${file.name} (${file.type})`);

      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('OCR processing timeout')), timeout);
      });

      // Process the image with Tesseract
      const ocrPromise = Tesseract.recognize(file, language, {
        logger: logger,
        // Optimize for better accuracy
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?;:()[]{}"\'@#$%^&*+-=<>/\\|`~_',
        // Improve text detection
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        // Better for mixed text
        tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY
      });

      // Race between OCR processing and timeout
      const { data } = await Promise.race([ocrPromise, timeoutPromise]);

      const processingTime = Date.now() - startTime;
      const extractedText = data.text.trim();
      const wordCount = extractedText.split(/\s+/).filter(word => word.length > 0).length;

      console.log(`✅ OCR completed for ${file.name}: ${wordCount} words, ${data.confidence}% confidence, ${processingTime}ms`);

      return {
        text: extractedText,
        confidence: data.confidence,
        processingTime,
        wordCount,
        success: true
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown OCR error';

      console.error(`❌ OCR failed for ${file.name}:`, errorMessage);

      return {
        text: '',
        confidence: 0,
        processingTime,
        wordCount: 0,
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Extract text from multiple images
   */
  static async extractTextFromImages(
    files: File[], 
    options: OCROptions = {}
  ): Promise<OCRResult[]> {
    const results: OCRResult[] = [];

    for (const file of files) {
      if (this.isImageFile(file)) {
        const result = await this.extractTextFromImage(file, options);
        results.push(result);
      } else {
        results.push({
          text: '',
          confidence: 0,
          processingTime: 0,
          wordCount: 0,
          success: false,
          error: `Unsupported file type: ${file.type}`
        });
      }
    }

    return results;
  }

  /**
   * Check if a file is an image that can be processed by OCR
   */
  static isImageFile(file: File): boolean {
    const supportedTypes = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/bmp',
      'image/tiff',
      'image/webp'
    ];

    return supportedTypes.includes(file.type.toLowerCase());
  }

  /**
   * Get supported image formats
   */
  static getSupportedFormats(): string[] {
    return [
      'PNG', 'JPEG', 'JPG', 'GIF', 'BMP', 'TIFF', 'WEBP'
    ];
  }

  /**
   * Check if OCR result is reliable based on confidence score
   */
  static isReliableResult(result: OCRResult): boolean {
    return result.success && result.confidence >= this.MIN_CONFIDENCE;
  }

  /**
   * Format OCR result for display
   */
  static formatResult(result: OCRResult, fileName: string): string {
    if (!result.success) {
      return `OCR failed for ${fileName}: ${result.error || 'Unknown error'}`;
    }

    if (result.text.length === 0) {
      return `No text detected in ${fileName} (${result.confidence}% confidence)`;
    }

    const reliability = this.isReliableResult(result) ? '✅ Reliable' : '⚠️ Low confidence';
    
    return `Text extracted from ${fileName} (${result.confidence}% confidence, ${result.wordCount} words, ${result.processingTime}ms)
${reliability}

Extracted Text:
${result.text}`;
  }

  /**
   * Get OCR processing statistics
   */
  static getStats(results: OCRResult[]): {
    totalFiles: number;
    successful: number;
    failed: number;
    totalWords: number;
    averageConfidence: number;
    averageProcessingTime: number;
  } {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    return {
      totalFiles: results.length,
      successful: successful.length,
      failed: failed.length,
      totalWords: successful.reduce((sum, r) => sum + r.wordCount, 0),
      averageConfidence: successful.length > 0 
        ? successful.reduce((sum, r) => sum + r.confidence, 0) / successful.length 
        : 0,
      averageProcessingTime: results.length > 0
        ? results.reduce((sum, r) => sum + r.processingTime, 0) / results.length
        : 0
    };
  }
}
