/**
 * MOCR Visual Processor
 * Extracts text from video frames via OCR for pipeline consumption
 */

import fs from 'fs';
import path from 'path';
import { VideoFrameExtractor } from './VideoFrameExtractor';
import { OCRService } from './OCRService';

export interface MOCROptions {
  maxFrames?: number;
  frameInterval?: number;
  ocrLanguage?: string;
  minConfidence?: number;
  enableTemporalAnalysis?: boolean;
  enableSceneDetection?: boolean;
  enableTextTracking?: boolean;
}

export interface MOCRVisualResult {
  success: boolean;
  textContent: Array<{
    timestamp: number;
    frameNumber: number;
    text: string;
    confidence: number;
    sceneType?: string;
  }>;
  frameCount: number;
  totalTextExtracted: number;
  averageConfidence: number;
  processingTime: number;
  temporalAnalysis?: {
    textSegments: Array<{ startTime: number; endTime: number; text: string; confidence: number; frameCount: number; isStable: boolean }>;
    sceneTransitions: Array<{ timestamp: number; type: string; description: string; confidence: number }>;
    textConsistency: Array<{ text: string; frequency: number; averageConfidence: number; firstAppearance: number; lastAppearance: number; stability: number }>;
  };
}

export class MOCRVisualProcessor {
  /**
   * Process video from file path (for large files - avoids loading into memory)
   */
  static async processVideoFromPath(
    videoPath: string,
    options: MOCROptions = {}
  ): Promise<MOCRVisualResult> {
    return this.processVideoInternal(videoPath, null, options);
  }

  /**
   * Process video for visual text extraction (OCR on frames)
   */
  static async processVideo(
    videoFile: File,
    options: MOCROptions = {}
  ): Promise<MOCRVisualResult> {
    const tempDir = path.join(process.cwd(), 'temp-video-analysis');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempPath = path.join(tempDir, `temp_${Date.now()}_${videoFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
    try {
      const arrayBuffer = await videoFile.arrayBuffer();
      fs.writeFileSync(tempPath, Buffer.from(arrayBuffer));
      return this.processVideoInternal(tempPath, videoFile.name, options);
    } finally {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (e) {
        console.warn('Failed to clean temp:', e);
      }
    }
  }

  private static async processVideoInternal(
    videoPath: string,
    _logName: string | null,
    options: MOCROptions = {}
  ): Promise<MOCRVisualResult> {
    const startTime = Date.now();
    const {
      maxFrames = 1000,
      frameInterval = 10,
      ocrLanguage = 'eng',
      minConfidence = 30
    } = options;

    try {
      const frames = await VideoFrameExtractor.extractFrames(videoPath, {
        maxFrames,
        interval: frameInterval,
        quality: 5
      });

      const textContent: MOCRVisualResult['textContent'] = [];
      let totalChars = 0;
      let totalConfidence = 0;
      let confidenceCount = 0;

      const ocrTempDir = path.join(process.cwd(), 'temp-ocr-frames');
      if (!fs.existsSync(ocrTempDir)) fs.mkdirSync(ocrTempDir, { recursive: true });

      for (const frame of frames) {
        const framePath = path.join(ocrTempDir, `frame_${frame.frameNumber}.jpg`);
        fs.writeFileSync(framePath, frame.imageData);
        try {
          const ocrResult = await OCRService.extractTextFromPath(framePath, {
            language: ocrLanguage,
            timeout: 15000
          });

          if (ocrResult.success && ocrResult.text.trim()) {
            const text = ocrResult.text.trim();
            if (ocrResult.confidence >= minConfidence) {
              textContent.push({
                timestamp: frame.timestamp,
                frameNumber: frame.frameNumber,
                text,
                confidence: ocrResult.confidence,
                sceneType: 'content'
              });
              totalChars += text.length;
              totalConfidence += ocrResult.confidence;
              confidenceCount++;
            }
          }
        } finally {
          try { if (fs.existsSync(framePath)) fs.unlinkSync(framePath); } catch (_) {}
        }
      }

      try {
        if (fs.existsSync(ocrTempDir)) {
          const remaining = fs.readdirSync(ocrTempDir);
          remaining.forEach(f => { try { fs.unlinkSync(path.join(ocrTempDir, f)); } catch (_) {} });
          fs.rmdirSync(ocrTempDir);
        }
      } catch (_) {}

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        textContent,
        frameCount: frames.length,
        totalTextExtracted: totalChars,
        averageConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
        processingTime,
        temporalAnalysis: {
          textSegments: [],
          sceneTransitions: [],
          textConsistency: []
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('MOCR visual processing failed:', error);
      return {
        success: false,
        textContent: [],
        frameCount: 0,
        totalTextExtracted: 0,
        averageConfidence: 0,
        processingTime,
        temporalAnalysis: {
          textSegments: [],
          sceneTransitions: [],
          textConsistency: []
        }
      };
    }
  }
}
