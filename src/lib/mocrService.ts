/**
 * MOCR (Moving Optical Character Recognition) Service
 * Processes video content by extracting frames and performing OCR on temporal sequences
 */

import { VideoFrameExtractor, VideoFrame, VideoMetadata } from './videoFrameExtractor';
import { OCRService, OCRResult } from './ocrService';
import Tesseract from 'tesseract.js';
import fs from 'fs';
import path from 'path';

export interface MOCROptions {
  maxFrames?: number;
  frameInterval?: number; // seconds between frames
  ocrLanguage?: string;
  minConfidence?: number;
  enableTemporalAnalysis?: boolean;
  enableSceneDetection?: boolean;
  enableTextTracking?: boolean;
}

export interface VideoTextContent {
  timestamp: number;
  frameNumber: number;
  text: string;
  confidence: number;
  boundingBoxes?: TextBoundingBox[];
  sceneType?: string;
}

export interface TextBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  confidence: number;
}

export interface TemporalTextAnalysis {
  textSegments: VideoTextSegment[];
  sceneTransitions: SceneTransition[];
  textConsistency: TextConsistency[];
  summary: string;
}

export interface VideoTextSegment {
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
  frameCount: number;
  isStable: boolean; // text appears consistently across frames
}

export interface SceneTransition {
  timestamp: number;
  type: 'text_change' | 'scene_change' | 'text_appearance' | 'text_disappearance';
  description: string;
  confidence: number;
}

export interface TextConsistency {
  text: string;
  frequency: number;
  averageConfidence: number;
  firstAppearance: number;
  lastAppearance: number;
  stability: number; // 0-1, how consistent the text appears
}

export interface MOCRResult {
  success: boolean;
  videoMetadata: VideoMetadata;
  textContent: VideoTextContent[];
  temporalAnalysis: TemporalTextAnalysis;
  processingTime: number;
  frameCount: number;
  totalTextExtracted: number;
  averageConfidence: number;
  error?: string;
}

export class MOCRService {
  private static readonly DEFAULT_MAX_FRAMES = 30;
  private static readonly DEFAULT_FRAME_INTERVAL = 2;
  private static readonly DEFAULT_MIN_CONFIDENCE = 30;
  private static readonly DEFAULT_OCR_LANGUAGE = 'eng';

  /**
   * Process video content with MOCR
   */
  static async processVideo(
    videoFile: File,
    options: MOCROptions = {}
  ): Promise<MOCRResult> {
    const startTime = Date.now();
    const {
      maxFrames = this.DEFAULT_MAX_FRAMES,
      frameInterval = this.DEFAULT_FRAME_INTERVAL,
      ocrLanguage = this.DEFAULT_OCR_LANGUAGE,
      minConfidence = this.DEFAULT_MIN_CONFIDENCE,
      enableTemporalAnalysis = true,
      enableSceneDetection = true,
      enableTextTracking = true
    } = options;

    try {
      console.log(`🎬 Starting MOCR processing for: ${videoFile.name}`);

      // Validate video file
      if (!VideoFrameExtractor.isVideoFile(videoFile)) {
        throw new Error(`Unsupported video format: ${videoFile.type}`);
      }

      // Save video file temporarily for processing
      const tempVideoPath = await this.saveTempVideo(videoFile);
      
      try {
        // Get video metadata
        const videoMetadata = await VideoFrameExtractor.getVideoMetadata(tempVideoPath);
        console.log(`📊 Video metadata: ${videoMetadata.width}x${videoMetadata.height}, ${VideoFrameExtractor.formatDuration(videoMetadata.duration)}s`);

        // Extract frames
        console.log(`🖼️  Extracting frames (max: ${maxFrames}, interval: ${frameInterval}s)...`);
        const frames = await VideoFrameExtractor.extractFrames(tempVideoPath, {
          maxFrames,
          interval: frameInterval,
          quality: 5
        });

        console.log(`✅ Extracted ${frames.length} frames`);

        // Process frames with OCR
        console.log(`🔍 Processing frames with OCR...`);
        const textContent = await this.processFramesWithOCR(frames, {
          language: ocrLanguage,
          minConfidence
        });

        // Perform temporal analysis
        let temporalAnalysis: TemporalTextAnalysis | null = null;
        if (enableTemporalAnalysis && textContent.length > 0) {
          console.log(`⏱️  Performing temporal analysis...`);
          temporalAnalysis = await this.performTemporalAnalysis(textContent, videoMetadata);
        }

        const processingTime = Date.now() - startTime;
        const totalTextExtracted = textContent.reduce((sum, content) => sum + content.text.length, 0);
        const averageConfidence = textContent.length > 0 
          ? textContent.reduce((sum, content) => sum + content.confidence, 0) / textContent.length 
          : 0;

        console.log(`✅ MOCR processing completed: ${totalTextExtracted} characters, ${processingTime}ms`);

        return {
          success: true,
          videoMetadata,
          textContent,
          temporalAnalysis: temporalAnalysis || this.createEmptyTemporalAnalysis(),
          processingTime,
          frameCount: frames.length,
          totalTextExtracted,
          averageConfidence
        };

      } finally {
        // Clean up temp video file
        this.cleanupTempFile(tempVideoPath);
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ MOCR processing failed:`, error);

      return {
        success: false,
        videoMetadata: {} as VideoMetadata,
        textContent: [],
        temporalAnalysis: this.createEmptyTemporalAnalysis(),
        processingTime,
        frameCount: 0,
        totalTextExtracted: 0,
        averageConfidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process frames with OCR
   */
  private static async processFramesWithOCR(
    frames: VideoFrame[],
    options: { language: string; minConfidence: number }
  ): Promise<VideoTextContent[]> {
    const textContent: VideoTextContent[] = [];

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      console.log(`🔍 Processing frame ${i + 1}/${frames.length} (${frame.timestamp}s)`);

      try {
        // Convert frame to File-like object for OCR
        const frameFile = new File([frame.imageData], `frame_${frame.frameNumber}.jpg`, {
          type: 'image/jpeg'
        });

        // Perform OCR on frame
        const ocrResult = await OCRService.extractTextFromImage(frameFile, {
          language: options.language,
          timeout: 30000
        });

        if (ocrResult.success && ocrResult.text.length > 0 && ocrResult.confidence >= options.minConfidence) {
          textContent.push({
            timestamp: frame.timestamp,
            frameNumber: frame.frameNumber,
            text: ocrResult.text,
            confidence: ocrResult.confidence,
            sceneType: this.detectSceneType(ocrResult.text)
          });
        }

      } catch (error) {
        console.warn(`⚠️  OCR failed for frame ${frame.frameNumber}:`, error);
      }
    }

    return textContent;
  }

  /**
   * Perform temporal analysis on extracted text
   */
  private static async performTemporalAnalysis(
    textContent: VideoTextContent[],
    videoMetadata: VideoMetadata
  ): Promise<TemporalTextAnalysis> {
    const textSegments: VideoTextSegment[] = [];
    const sceneTransitions: SceneTransition[] = [];
    const textConsistency: TextConsistency[] = [];

    // Group text by temporal segments
    const segments = this.groupTextBySegments(textContent);
    textSegments.push(...segments);

    // Detect scene transitions
    const transitions = this.detectSceneTransitions(textContent);
    sceneTransitions.push(...transitions);

    // Analyze text consistency
    const consistency = this.analyzeTextConsistency(textContent);
    textConsistency.push(...consistency);

    // Generate summary
    const summary = this.generateVideoSummary(textContent, videoMetadata);

    return {
      textSegments,
      sceneTransitions,
      textConsistency,
      summary
    };
  }

  /**
   * Group text content by temporal segments
   */
  private static groupTextBySegments(textContent: VideoTextContent[]): VideoTextSegment[] {
    const segments: VideoTextSegment[] = [];
    let currentSegment: VideoTextSegment | null = null;
    const segmentThreshold = 3; // seconds

    for (const content of textContent) {
      if (!currentSegment) {
        currentSegment = {
          startTime: content.timestamp,
          endTime: content.timestamp,
          text: content.text,
          confidence: content.confidence,
          frameCount: 1,
          isStable: true
        };
      } else if (content.timestamp - currentSegment.endTime <= segmentThreshold) {
        // Extend current segment
        currentSegment.endTime = content.timestamp;
        currentSegment.text += ` ${content.text}`;
        currentSegment.confidence = (currentSegment.confidence + content.confidence) / 2;
        currentSegment.frameCount++;
        
        // Check if text is stable (similar content across frames)
        currentSegment.isStable = this.isTextStable(currentSegment.text, content.text);
      } else {
        // Start new segment
        segments.push(currentSegment);
        currentSegment = {
          startTime: content.timestamp,
          endTime: content.timestamp,
          text: content.text,
          confidence: content.confidence,
          frameCount: 1,
          isStable: true
        };
      }
    }

    if (currentSegment) {
      segments.push(currentSegment);
    }

    return segments;
  }

  /**
   * Detect scene transitions based on text changes
   */
  private static detectSceneTransitions(textContent: VideoTextContent[]): SceneTransition[] {
    const transitions: SceneTransition[] = [];

    for (let i = 1; i < textContent.length; i++) {
      const prev = textContent[i - 1];
      const curr = textContent[i - 1];

      // Detect text appearance
      if (prev.text.length === 0 && curr.text.length > 0) {
        transitions.push({
          timestamp: curr.timestamp,
          type: 'text_appearance',
          description: `Text appears: "${curr.text.substring(0, 50)}..."`,
          confidence: curr.confidence
        });
      }

      // Detect text disappearance
      if (prev.text.length > 0 && curr.text.length === 0) {
        transitions.push({
          timestamp: curr.timestamp,
          type: 'text_disappearance',
          description: `Text disappears: "${prev.text.substring(0, 50)}..."`,
          confidence: prev.confidence
        });
      }

      // Detect significant text changes
      if (prev.text.length > 0 && curr.text.length > 0) {
        const similarity = this.calculateTextSimilarity(prev.text, curr.text);
        if (similarity < 0.3) { // Less than 30% similar
          transitions.push({
            timestamp: curr.timestamp,
            type: 'text_change',
            description: `Text changes significantly`,
            confidence: Math.min(prev.confidence, curr.confidence)
          });
        }
      }
    }

    return transitions;
  }

  /**
   * Analyze text consistency across frames
   */
  private static analyzeTextConsistency(textContent: VideoTextContent[]): TextConsistency[] {
    const textMap = new Map<string, {
      appearances: number[];
      confidences: number[];
      timestamps: number[];
    }>();

    // Group text by content
    for (const content of textContent) {
      const key = content.text.trim().toLowerCase();
      if (key.length === 0) continue;

      if (!textMap.has(key)) {
        textMap.set(key, { appearances: [], confidences: [], timestamps: [] });
      }

      const entry = textMap.get(key)!;
      entry.appearances.push(1);
      entry.confidences.push(content.confidence);
      entry.timestamps.push(content.timestamp);
    }

    // Convert to TextConsistency objects
    const consistency: TextConsistency[] = [];
    for (const [text, data] of textMap) {
      const frequency = data.appearances.length;
      const averageConfidence = data.confidences.reduce((sum, conf) => sum + conf, 0) / data.confidences.length;
      const firstAppearance = Math.min(...data.timestamps);
      const lastAppearance = Math.max(...data.timestamps);
      
      // Calculate stability (how consistently the text appears)
      const timeSpan = lastAppearance - firstAppearance;
      const expectedAppearances = timeSpan / 2; // Assuming 2-second intervals
      const stability = Math.min(frequency / expectedAppearances, 1);

      consistency.push({
        text,
        frequency,
        averageConfidence,
        firstAppearance,
        lastAppearance,
        stability
      });
    }

    return consistency.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Generate video summary
   */
  private static generateVideoSummary(
    textContent: VideoTextContent[],
    videoMetadata: VideoMetadata
  ): string {
    const totalFrames = textContent.length;
    const totalText = textContent.reduce((sum, content) => sum + content.text.length, 0);
    const averageConfidence = textContent.length > 0 
      ? textContent.reduce((sum, content) => sum + content.confidence, 0) / textContent.length 
      : 0;

    const uniqueTexts = new Set(textContent.map(content => content.text.trim().toLowerCase()));
    const sceneTypes = new Set(textContent.map(content => content.sceneType).filter(Boolean));

    return `Video Analysis Summary:
- Duration: ${VideoFrameExtractor.formatDuration(videoMetadata.duration)}
- Resolution: ${videoMetadata.width}x${videoMetadata.height}
- Frames Processed: ${totalFrames}
- Total Text Extracted: ${totalText} characters
- Average OCR Confidence: ${averageConfidence.toFixed(1)}%
- Unique Text Segments: ${uniqueTexts.size}
- Scene Types Detected: ${Array.from(sceneTypes).join(', ') || 'None'}

${textContent.length > 0 ? 'Key Text Content:' : 'No readable text detected in video.'}
${textContent.slice(0, 5).map(content => 
  `[${content.timestamp}s] ${content.text.substring(0, 100)}${content.text.length > 100 ? '...' : ''}`
).join('\n')}`;
  }

  /**
   * Detect scene type based on text content
   */
  private static detectSceneType(text: string): string {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('title') || lowerText.includes('heading')) return 'title';
    if (lowerText.includes('menu') || lowerText.includes('button')) return 'interface';
    if (lowerText.includes('error') || lowerText.includes('warning')) return 'error';
    if (lowerText.includes('loading') || lowerText.includes('please wait')) return 'loading';
    if (lowerText.includes('copyright') || lowerText.includes('©')) return 'credits';
    if (lowerText.includes('chapter') || lowerText.includes('part')) return 'chapter';
    
    return 'content';
  }

  /**
   * Check if text is stable across frames
   */
  private static isTextStable(previousText: string, currentText: string): boolean {
    const similarity = this.calculateTextSimilarity(previousText, currentText);
    return similarity > 0.7; // 70% similarity threshold
  }

  /**
   * Calculate text similarity using simple word overlap
   */
  private static calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Save video file temporarily for processing
   */
  private static async saveTempVideo(videoFile: File): Promise<string> {
    const tempDir = path.join(process.cwd(), 'temp-videos');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempPath = path.join(tempDir, `temp_${Date.now()}_${videoFile.name}`);
    const arrayBuffer = await videoFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    fs.writeFileSync(tempPath, buffer);
    return tempPath;
  }

  /**
   * Clean up temporary file
   */
  private static cleanupTempFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.warn('Warning: Could not clean up temp file:', error);
    }
  }

  /**
   * Create empty temporal analysis
   */
  private static createEmptyTemporalAnalysis(): TemporalTextAnalysis {
    return {
      textSegments: [],
      sceneTransitions: [],
      textConsistency: [],
      summary: 'No temporal analysis available.'
    };
  }

  /**
   * Format MOCR result for display
   */
  static formatMOCRResult(result: MOCRResult): string {
    if (!result.success) {
      return `❌ MOCR processing failed: ${result.error || 'Unknown error'}`;
    }

    return `✅ MOCR Processing Complete
📊 Video: ${result.videoMetadata.width}x${result.videoMetadata.height}, ${VideoFrameExtractor.formatDuration(result.videoMetadata.duration)}s
🖼️  Frames Processed: ${result.frameCount}
📝 Text Extracted: ${result.totalTextExtracted} characters
🎯 Average Confidence: ${result.averageConfidence.toFixed(1)}%
⏱️  Processing Time: ${result.processingTime}ms

${result.temporalAnalysis.summary}`;
  }
}
