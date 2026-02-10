/**
 * Video Content Analysis Pipeline
 * Combines MOCR (Moving OCR) and ASR (Automatic Speech Recognition) for comprehensive video understanding
 */

import { MOCRService, MOCRResult, MOCROptions } from './mocrService';
import { ASRService, ASRResult, ASROptions } from './asrService';
import { VideoFrameExtractor, VideoMetadata } from './videoFrameExtractor';
import path from 'path';

export interface VideoAnalysisOptions {
  // MOCR options
  mocr?: MOCROptions;
  // ASR options
  asr?: ASROptions;
  // Pipeline options
  enableMOCR?: boolean;
  enableASR?: boolean;
  enableSynchronization?: boolean;
  enableContentSummarization?: boolean;
  enableSceneAnalysis?: boolean;
}

export interface SynchronizedContent {
  timestamp: number;
  visualText?: string;
  audioText?: string;
  combinedText: string;
  confidence: number;
  sceneType?: string;
}

export interface VideoContentSummary {
  title?: string;
  description: string;
  keyTopics: string[];
  visualElements: string[];
  audioElements: string[];
  sceneBreakdown: SceneBreakdown[];
  totalDuration: number;
  processingTime: number;
}

export interface SceneBreakdown {
  startTime: number;
  endTime: number;
  type: 'intro' | 'content' | 'demo' | 'outro' | 'transition' | 'unknown';
  description: string;
  visualText?: string;
  audioText?: string;
  confidence: number;
}

export interface VideoAnalysisResult {
  success: boolean;
  videoMetadata: VideoMetadata;
  mocrResult?: MOCRResult;
  asrResult?: ASRResult;
  synchronizedContent: SynchronizedContent[];
  contentSummary: VideoContentSummary;
  processingTime: number;
  error?: string;
}

export class VideoAnalysisPipeline {
  private static readonly DEFAULT_OPTIONS: VideoAnalysisOptions = {
    enableMOCR: true,
    enableASR: true,
    enableSynchronization: true,
    enableContentSummarization: true,
    enableSceneAnalysis: true,
    mocr: {
      maxFrames: 30,
      frameInterval: 2,
      ocrLanguage: 'eng',
      minConfidence: 30,
      enableTemporalAnalysis: true,
      enableSceneDetection: true,
      enableTextTracking: true
    },
    asr: {
      language: 'en',
      model: 'base',
      enableTimestamps: true,
      enableWordTimestamps: false,
      enableSpeakerDetection: false
    }
  };

  /**
   * Analyze video content comprehensively
   */
  static async analyzeVideo(
    videoFile: File,
    options: VideoAnalysisOptions = {}
  ): Promise<VideoAnalysisResult> {
    const startTime = Date.now();
    const mergedOptions = { ...this.DEFAULT_OPTIONS, ...options };

    try {
      console.log(`🎬 Starting comprehensive video analysis for: ${videoFile.name}`);

      // Get video metadata
      const tempVideoPath = await this.saveTempFile(videoFile);
      let videoMetadata: VideoMetadata;
      
      try {
        videoMetadata = await VideoFrameExtractor.getVideoMetadata(tempVideoPath);
        console.log(`📊 Video metadata: ${videoMetadata.width}x${videoMetadata.height}, ${VideoFrameExtractor.formatDuration(videoMetadata.duration)}s`);
      } finally {
        this.cleanupTempFile(tempVideoPath);
      }

      // Run MOCR and ASR in parallel
      const [mocrResult, asrResult] = await Promise.allSettled([
        mergedOptions.enableMOCR ? MOCRService.processVideo(videoFile, mergedOptions.mocr) : Promise.resolve(null),
        mergedOptions.enableASR ? ASRService.transcribeVideo(videoFile, mergedOptions.asr) : Promise.resolve(null)
      ]);

      // Process results
      const mocr = mocrResult.status === 'fulfilled' ? mocrResult.value : null;
      const asr = asrResult.status === 'fulfilled' ? asrResult.value : null;

      // Synchronize content if both MOCR and ASR are available
      let synchronizedContent: SynchronizedContent[] = [];
      if (mergedOptions.enableSynchronization && mocr && asr) {
        synchronizedContent = this.synchronizeContent(mocr, asr);
      }

      // Generate content summary
      const contentSummary = this.generateContentSummary(
        videoMetadata,
        mocr,
        asr,
        synchronizedContent,
        Date.now() - startTime
      );

      const processingTime = Date.now() - startTime;

      console.log(`✅ Video analysis completed: ${processingTime}ms`);

      return {
        success: true,
        videoMetadata,
        mocrResult: mocr,
        asrResult: asr,
        synchronizedContent,
        contentSummary,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ Video analysis failed:`, error);

      return {
        success: false,
        videoMetadata: {} as VideoMetadata,
        synchronizedContent: [],
        contentSummary: this.createEmptySummary(processingTime),
        processingTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Synchronize visual and audio content
   */
  private static synchronizeContent(
    mocrResult: MOCRResult,
    asrResult: ASRResult
  ): SynchronizedContent[] {
    const synchronized: SynchronizedContent[] = [];
    const timeWindow = 5; // 5-second window for synchronization

    // Create time-based buckets
    const timeBuckets = new Map<number, {
      visualTexts: string[];
      audioTexts: string[];
      confidences: number[];
    }>();

    // Add visual text to buckets
    if (mocrResult.success && mocrResult.textContent) {
      for (const content of mocrResult.textContent) {
        const bucketTime = Math.floor(content.timestamp / timeWindow) * timeWindow;
        if (!timeBuckets.has(bucketTime)) {
          timeBuckets.set(bucketTime, { visualTexts: [], audioTexts: [], confidences: [] });
        }
        const bucket = timeBuckets.get(bucketTime)!;
        bucket.visualTexts.push(content.text);
        bucket.confidences.push(content.confidence);
      }
    }

    // Add audio text to buckets
    if (asrResult.success && asrResult.segments) {
      for (const segment of asrResult.segments) {
        const bucketTime = Math.floor(segment.start / timeWindow) * timeWindow;
        if (!timeBuckets.has(bucketTime)) {
          timeBuckets.set(bucketTime, { visualTexts: [], audioTexts: [], confidences: [] });
        }
        const bucket = timeBuckets.get(bucketTime)!;
        bucket.audioTexts.push(segment.text);
        bucket.confidences.push(segment.confidence || 85);
      }
    }

    // Create synchronized content
    for (const [timestamp, bucket] of timeBuckets) {
      const visualText = bucket.visualTexts.join(' ').trim();
      const audioText = bucket.audioTexts.join(' ').trim();
      const combinedText = [visualText, audioText].filter(Boolean).join(' | ');
      
      if (combinedText) {
        const averageConfidence = bucket.confidences.length > 0 
          ? bucket.confidences.reduce((sum, conf) => sum + conf, 0) / bucket.confidences.length 
          : 0;

        synchronized.push({
          timestamp,
          visualText: visualText || undefined,
          audioText: audioText || undefined,
          combinedText,
          confidence: averageConfidence,
          sceneType: this.detectSceneType(visualText, audioText)
        });
      }
    }

    return synchronized.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Generate comprehensive content summary
   */
  private static generateContentSummary(
    videoMetadata: VideoMetadata,
    mocrResult: MOCRResult | null,
    asrResult: ASRResult | null,
    synchronizedContent: SynchronizedContent[],
    processingTime: number
  ): VideoContentSummary {
    const visualElements: string[] = [];
    const audioElements: string[] = [];
    const keyTopics: string[] = [];
    const sceneBreakdown: SceneBreakdown[] = [];

    // Extract visual elements from MOCR
    if (mocrResult?.success && mocrResult.textContent) {
      for (const content of mocrResult.textContent) {
        if (content.text.trim()) {
          visualElements.push(content.text);
        }
      }
    }

    // Extract audio elements from ASR
    if (asrResult?.success && asrResult.segments) {
      for (const segment of asrResult.segments) {
        if (segment.text.trim()) {
          audioElements.push(segment.text);
        }
      }
    }

    // Extract key topics from combined content
    const allText = [
      ...visualElements,
      ...audioElements,
      ...synchronizedContent.map(content => content.combinedText)
    ].join(' ').toLowerCase();

    keyTopics.push(...this.extractKeyTopics(allText));

    // Generate scene breakdown
    sceneBreakdown.push(...this.generateSceneBreakdown(synchronizedContent, videoMetadata.duration));

    // Generate description
    const description = this.generateDescription(visualElements, audioElements, keyTopics);

    return {
      title: this.generateTitle(visualElements, audioElements),
      description,
      keyTopics,
      visualElements,
      audioElements,
      sceneBreakdown,
      totalDuration: videoMetadata.duration,
      processingTime
    };
  }

  /**
   * Extract key topics from text content
   */
  private static extractKeyTopics(text: string): string[] {
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those'
    ]);

    const words = text.split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word))
      .map(word => word.replace(/[^\w]/g, ''))
      .filter(word => word.length > 0);

    const wordCount = new Map<string, number>();
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });

    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Generate scene breakdown
   */
  private static generateSceneBreakdown(
    synchronizedContent: SynchronizedContent[],
    totalDuration: number
  ): SceneBreakdown[] {
    const scenes: SceneBreakdown[] = [];
    const sceneDuration = totalDuration / 5; // Divide into 5 scenes

    for (let i = 0; i < 5; i++) {
      const startTime = i * sceneDuration;
      const endTime = Math.min((i + 1) * sceneDuration, totalDuration);
      
      const contentInScene = synchronizedContent.filter(
        content => content.timestamp >= startTime && content.timestamp < endTime
      );

      const sceneType = this.determineSceneType(contentInScene, i, 5);
      const description = this.generateSceneDescription(contentInScene, sceneType);
      const visualText = contentInScene.map(c => c.visualText).filter(Boolean).join(' ');
      const audioText = contentInScene.map(c => c.audioText).filter(Boolean).join(' ');
      const confidence = contentInScene.length > 0 
        ? contentInScene.reduce((sum, c) => sum + c.confidence, 0) / contentInScene.length 
        : 0;

      scenes.push({
        startTime,
        endTime,
        type: sceneType,
        description,
        visualText: visualText || undefined,
        audioText: audioText || undefined,
        confidence
      });
    }

    return scenes;
  }

  /**
   * Determine scene type based on content
   */
  private static determineSceneType(
    content: SynchronizedContent[],
    sceneIndex: number,
    totalScenes: number
  ): SceneBreakdown['type'] {
    if (sceneIndex === 0) return 'intro';
    if (sceneIndex === totalScenes - 1) return 'outro';
    
    const allText = content.map(c => c.combinedText).join(' ').toLowerCase();
    
    if (allText.includes('demo') || allText.includes('example') || allText.includes('show')) {
      return 'demo';
    }
    
    if (allText.includes('transition') || allText.includes('next') || allText.includes('moving')) {
      return 'transition';
    }
    
    return 'content';
  }

  /**
   * Generate scene description
   */
  private static generateSceneDescription(
    content: SynchronizedContent[],
    sceneType: SceneBreakdown['type']
  ): string {
    if (content.length === 0) {
      return `No content detected in this ${sceneType} scene.`;
    }

    const text = content.map(c => c.combinedText).join(' ').substring(0, 200);
    return `${sceneType.charAt(0).toUpperCase() + sceneType.slice(1)} scene: ${text}${text.length >= 200 ? '...' : ''}`;
  }

  /**
   * Generate video title
   */
  private static generateTitle(visualElements: string[], audioElements: string[]): string {
    const allText = [...visualElements, ...audioElements].join(' ').toLowerCase();
    
    // Look for title-like patterns
    const titlePatterns = [
      /title[:\s]+([^.]+)/i,
      /welcome to ([^.]+)/i,
      /introduction to ([^.]+)/i,
      /tutorial on ([^.]+)/i
    ];

    for (const pattern of titlePatterns) {
      const match = allText.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // Fallback: use first significant text
    const firstSignificant = [...visualElements, ...audioElements]
      .find(text => text.length > 10 && text.length < 100);
    
    return firstSignificant || 'Untitled Video';
  }

  /**
   * Generate video description
   */
  private static generateDescription(
    visualElements: string[],
    audioElements: string[],
    keyTopics: string[]
  ): string {
    const hasVisual = visualElements.length > 0;
    const hasAudio = audioElements.length > 0;
    const topics = keyTopics.slice(0, 5).join(', ');

    let description = `This video contains `;
    
    if (hasVisual && hasAudio) {
      description += `both visual text elements and audio content`;
    } else if (hasVisual) {
      description += `visual text elements`;
    } else if (hasAudio) {
      description += `audio content`;
    } else {
      description += `limited detectable content`;
    }

    if (topics) {
      description += `. Key topics include: ${topics}`;
    }

    description += `.`;

    return description;
  }

  /**
   * Detect scene type from text content
   */
  private static detectSceneType(visualText: string, audioText: string): string {
    const combinedText = `${visualText} ${audioText}`.toLowerCase();
    
    if (combinedText.includes('title') || combinedText.includes('heading')) return 'title';
    if (combinedText.includes('menu') || combinedText.includes('button')) return 'interface';
    if (combinedText.includes('error') || combinedText.includes('warning')) return 'error';
    if (combinedText.includes('loading') || combinedText.includes('please wait')) return 'loading';
    if (combinedText.includes('copyright') || combinedText.includes('©')) return 'credits';
    if (combinedText.includes('chapter') || combinedText.includes('part')) return 'chapter';
    
    return 'content';
  }

  /**
   * Save file temporarily for processing
   */
  private static async saveTempFile(file: File): Promise<string> {
    const tempDir = path.join(process.cwd(), 'temp-video-analysis');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempPath = path.join(tempDir, `temp_${Date.now()}_${file.name}`);
    const arrayBuffer = await file.arrayBuffer();
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
   * Create empty summary
   */
  private static createEmptySummary(processingTime: number): VideoContentSummary {
    return {
      description: 'Video analysis failed or no content detected.',
      keyTopics: [],
      visualElements: [],
      audioElements: [],
      sceneBreakdown: [],
      totalDuration: 0,
      processingTime
    };
  }

  /**
   * Format video analysis result for display
   */
  static formatVideoAnalysisResult(result: VideoAnalysisResult): string {
    if (!result.success) {
      return `❌ Video analysis failed: ${result.error || 'Unknown error'}`;
    }

    return `✅ Video Analysis Complete
📊 Video: ${result.videoMetadata.width}x${result.videoMetadata.height}, ${VideoFrameExtractor.formatDuration(result.videoMetadata.duration)}s
🎬 MOCR: ${result.mocrResult?.success ? '✅' : '❌'} ${result.mocrResult?.totalTextExtracted || 0} characters
🎤 ASR: ${result.asrResult?.success ? '✅' : '❌'} ${result.asrResult?.wordCount || 0} words
🔄 Synchronized: ${result.synchronizedContent.length} segments
⏱️  Processing Time: ${result.processingTime}ms

${result.contentSummary.title ? `Title: ${result.contentSummary.title}\n` : ''}
Description: ${result.contentSummary.description}

Key Topics: ${result.contentSummary.keyTopics.join(', ') || 'None detected'}

Scene Breakdown:
${result.contentSummary.sceneBreakdown.map(scene => 
  `[${VideoFrameExtractor.formatDuration(scene.startTime)} - ${VideoFrameExtractor.formatDuration(scene.endTime)}] ${scene.type}: ${scene.description}`
).join('\n')}`;
  }
}
