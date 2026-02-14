/**
 * MOCR (Motion Optical Character Recognition) Service
 * Professional video text extraction and analysis service
 */

import fs from 'fs';
import { VideoFrameExtractor, VideoFrame, VideoMetadata } from './VideoFrameExtractor';
import { OCRService, OCRResult } from './OCRService';
import { ASRService, ASRResult } from './ASRService';
import { VideoAnalysisPipeline, VideoAnalysisResult } from './VideoAnalysisPipeline';

export interface MOCRConfig {
  // Frame extraction settings
  maxFrames?: number;
  frameInterval?: number; // seconds between frames
  frameQuality?: number; // 1-31, lower = better quality
  
  // OCR settings
  ocrLanguage?: string;
  ocrMinConfidence?: number;
  ocrTimeout?: number;
  
  // ASR settings
  asrLanguage?: string;
  asrModel?: 'tiny' | 'base' | 'small' | 'medium' | 'large';
  asrTimeout?: number;
  
  // Analysis settings
  enableTemporalAnalysis?: boolean;
  enableSceneDetection?: boolean;
  enableTextTracking?: boolean;
  enableSynchronization?: boolean;
  enableContentSummarization?: boolean;
  
  // Performance settings
  maxFileSize?: number; // bytes
  processingTimeout?: number; // milliseconds
  enableCaching?: boolean;
  cacheExpiry?: number; // seconds
}

export interface MOCRJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  fileInfo: {
    name: string;
    size: number;
    type: string;
  };
  config: MOCRConfig;
  result?: MOCRResult;
  error?: string;
  progress: {
    current: number;
    total: number;
    stage: string;
  };
}

export interface MOCRResult {
  success: boolean;
  jobId: string;
  videoMetadata: VideoMetadata;
  mocrAnalysis: {
    framesProcessed: number;
    textExtracted: number;
    averageConfidence: number;
    processingTime: number;
    textContent: Array<{
      timestamp: number;
      frameNumber: number;
      text: string;
      confidence: number;
      sceneType: string;
    }>;
    temporalAnalysis: {
      textSegments: Array<{
        startTime: number;
        endTime: number;
        text: string;
        confidence: number;
        frameCount: number;
        isStable: boolean;
      }>;
      sceneTransitions: Array<{
        timestamp: number;
        type: string;
        description: string;
        confidence: number;
      }>;
      textConsistency: Array<{
        text: string;
        frequency: number;
        averageConfidence: number;
        firstAppearance: number;
        lastAppearance: number;
        stability: number;
      }>;
    };
  };
  asrAnalysis: {
    wordsTranscribed: number;
    averageConfidence: number;
    processingTime: number;
    language: string;
    segments: Array<{
      start: number;
      end: number;
      text: string;
      confidence: number;
    }>;
  };
  synchronizedContent: Array<{
    timestamp: number;
    visualText?: string;
    audioText?: string;
    combinedText: string;
    confidence: number;
    sceneType: string;
  }>;
  contentSummary: {
    title?: string;
    description: string;
    keyTopics: string[];
    visualElements: string[];
    audioElements: string[];
    sceneBreakdown: Array<{
      startTime: number;
      endTime: number;
      type: string;
      description: string;
      confidence: number;
    }>;
  };
  processingTime: number;
  error?: string;
}

export class MOCRService {
  private static readonly DEFAULT_CONFIG: MOCRConfig = {
    maxFrames: 1000,
    frameInterval: 10,
    frameQuality: 5,
    ocrLanguage: 'eng',
    ocrMinConfidence: 30,
    ocrTimeout: 60000,
    asrLanguage: 'en',
    asrModel: 'base',
    asrTimeout: 120000,
    enableTemporalAnalysis: true,
    enableSceneDetection: true,
    enableTextTracking: true,
    enableSynchronization: true,
    enableContentSummarization: true,
    maxFileSize: 4 * 1024 * 1024 * 1024, // 4GB (feature-length movies)
    processingTimeout: 7200000, // 2 hours
    enableCaching: true,
    cacheExpiry: 3600 // 1 hour
  };

  private jobs: Map<string, MOCRJob> = new Map();
  private config: MOCRConfig;

  constructor(config: MOCRConfig = {}) {
    this.config = { ...MOCRService.DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new MOCR job from file path (for large files - disk storage, no memory load)
   */
  async createJobFromPath(
    filePath: string,
    originalName: string,
    mimetype: string,
    fileSize: number,
    config: MOCRConfig = {}
  ): Promise<MOCRJob> {
    const jobId = this.generateJobId();
    const mergedConfig = { ...this.config, ...config };
    this.validateFileFromPath(filePath, originalName, mimetype, fileSize, mergedConfig);

    const job: MOCRJob = {
      id: jobId,
      status: 'pending',
      createdAt: new Date(),
      fileInfo: { name: originalName, size: fileSize, type: mimetype },
      config: mergedConfig,
      progress: { current: 0, total: 100, stage: 'Initializing' }
    };

    this.jobs.set(jobId, job);
    this.processJobFromPath(jobId, filePath, originalName, mimetype).catch(error => {
      console.error(`Job ${jobId} failed:`, error);
      const j = this.jobs.get(jobId);
      if (j) {
        j.status = 'failed';
        j.error = error.message;
        j.completedAt = new Date();
      }
    });

    return job;
  }

  /**
   * Create a new MOCR job
   */
  async createJob(
    file: File,
    config: MOCRConfig = {}
  ): Promise<MOCRJob> {
    const jobId = this.generateJobId();
    const mergedConfig = { ...this.config, ...config };

    this.validateFile(file, mergedConfig);

    const job: MOCRJob = {
      id: jobId,
      status: 'pending',
      createdAt: new Date(),
      fileInfo: {
        name: file.name,
        size: file.size,
        type: file.type
      },
      config: mergedConfig,
      progress: {
        current: 0,
        total: 100,
        stage: 'Initializing'
      }
    };

    this.jobs.set(jobId, job);

    this.processJob(jobId, file).catch(error => {
      console.error(`Job ${jobId} failed:`, error);
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error.message;
        job.completedAt = new Date();
      }
    });

    return job;
  }

  /**
   * Get job status
   */
  getJob(jobId: string): MOCRJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get all jobs
   */
  getAllJobs(): MOCRJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (job && job.status === 'pending') {
      job.status = 'failed';
      job.error = 'Job cancelled by user';
      job.completedAt = new Date();
      return true;
    }
    return false;
  }

  /**
   * Delete a job
   */
  deleteJob(jobId: string): boolean {
    return this.jobs.delete(jobId);
  }

  /**
   * Process a job from file path (large files, no memory load)
   */
  private async processJobFromPath(
    jobId: string,
    filePath: string,
    _originalName: string,
    _mimetype: string
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    try {
      job.status = 'processing';
      job.startedAt = new Date();
      job.progress = { current: 10, total: 100, stage: 'Analyzing video content' };

      console.log(`🎬 Starting MOCR job ${jobId} (path-based, feature-length support)`);

      const analysisResult = await VideoAnalysisPipeline.analyzeVideoFromPath(filePath, {
        enableMOCR: true,
        enableASR: true,
        enableSynchronization: job.config.enableSynchronization,
        enableContentSummarization: job.config.enableContentSummarization,
        enableSceneAnalysis: job.config.enableSceneDetection,
        mocr: {
          maxFrames: job.config.maxFrames,
          frameInterval: job.config.frameInterval,
          ocrLanguage: job.config.ocrLanguage,
          minConfidence: job.config.ocrMinConfidence,
          enableTemporalAnalysis: job.config.enableTemporalAnalysis,
          enableSceneDetection: job.config.enableSceneDetection,
          enableTextTracking: job.config.enableTextTracking
        },
        asr: {
          language: job.config.asrLanguage,
          model: job.config.asrModel,
          enableTimestamps: true
        }
      });

      job.progress = { current: 90, total: 100, stage: 'Finalizing results' };

      const result: MOCRResult = {
        success: analysisResult.success,
        jobId,
        videoMetadata: analysisResult.videoMetadata,
        mocrAnalysis: {
          framesProcessed: analysisResult.mocrResult?.frameCount || 0,
          textExtracted: analysisResult.mocrResult?.totalTextExtracted || 0,
          averageConfidence: analysisResult.mocrResult?.averageConfidence || 0,
          processingTime: analysisResult.mocrResult?.processingTime || 0,
          textContent: (analysisResult.mocrResult?.textContent || []).map(tc => ({
            ...tc,
            sceneType: tc.sceneType ?? 'content'
          })),
          temporalAnalysis: analysisResult.mocrResult?.temporalAnalysis || {
            textSegments: [],
            sceneTransitions: [],
            textConsistency: []
          }
        },
        asrAnalysis: {
          wordsTranscribed: analysisResult.asrResult?.wordCount || 0,
          averageConfidence: analysisResult.asrResult?.averageConfidence || 0,
          processingTime: analysisResult.asrResult?.processingTime || 0,
          language: analysisResult.asrResult?.language || 'en',
          segments: (analysisResult.asrResult?.segments || []).map(s => ({
            start: s.start,
            end: s.end,
            text: s.text,
            confidence: s.confidence ?? 0
          }))
        },
        synchronizedContent: (analysisResult.synchronizedContent || []).map(sc => ({
          ...sc,
          sceneType: sc.sceneType ?? ''
        })),
        contentSummary: analysisResult.contentSummary,
        processingTime: analysisResult.processingTime,
        error: analysisResult.error
      };

      job.result = result;
      job.status = analysisResult.success ? 'completed' : 'failed';
      job.completedAt = new Date();
      job.progress = { current: 100, total: 100, stage: analysisResult.success ? 'Completed' : 'Failed' };
      if (!analysisResult.success) job.error = result.error || 'Video analysis failed';

      if (analysisResult.success) {
        console.log(`✅ MOCR job ${jobId} completed successfully`);
      } else {
        console.log(`❌ MOCR job ${jobId} failed: ${job.error}`);
      }
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.completedAt = new Date();
      job.progress = { current: 0, total: 100, stage: 'Failed' };
      console.error(`❌ MOCR job ${jobId} failed:`, error);
    } finally {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) {
        console.warn(`Could not remove upload temp: ${filePath}`, e);
      }
    }
  }

  /**
   * Process a job
   */
  private async processJob(jobId: string, file: File): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    try {
      job.status = 'processing';
      job.startedAt = new Date();
      job.progress = { current: 0, total: 100, stage: 'Starting analysis' };

      console.log(`🎬 Starting MOCR job ${jobId} for: ${file.name}`);

      // Step 1: Video Analysis
      job.progress = { current: 10, total: 100, stage: 'Analyzing video content' };
      const analysisResult = await VideoAnalysisPipeline.analyzeVideo(file, {
        enableMOCR: true,
        enableASR: true,
        enableSynchronization: job.config.enableSynchronization,
        enableContentSummarization: job.config.enableContentSummarization,
        enableSceneAnalysis: job.config.enableSceneDetection,
        mocr: {
          maxFrames: job.config.maxFrames,
          frameInterval: job.config.frameInterval,
          ocrLanguage: job.config.ocrLanguage,
          minConfidence: job.config.ocrMinConfidence,
          enableTemporalAnalysis: job.config.enableTemporalAnalysis,
          enableSceneDetection: job.config.enableSceneDetection,
          enableTextTracking: job.config.enableTextTracking
        },
        asr: {
          language: job.config.asrLanguage,
          model: job.config.asrModel,
          enableTimestamps: true
        }
      });

      job.progress = { current: 90, total: 100, stage: 'Finalizing results' };

      // Convert to MOCR result format
      const result: MOCRResult = {
        success: analysisResult.success,
        jobId,
        videoMetadata: analysisResult.videoMetadata,
        mocrAnalysis: {
          framesProcessed: analysisResult.mocrResult?.frameCount || 0,
          textExtracted: analysisResult.mocrResult?.totalTextExtracted || 0,
          averageConfidence: analysisResult.mocrResult?.averageConfidence || 0,
          processingTime: analysisResult.mocrResult?.processingTime || 0,
          textContent: (analysisResult.mocrResult?.textContent || []).map(tc => ({
            ...tc,
            sceneType: tc.sceneType ?? 'content'
          })),
          temporalAnalysis: analysisResult.mocrResult?.temporalAnalysis || {
            textSegments: [],
            sceneTransitions: [],
            textConsistency: []
          }
        },
        asrAnalysis: {
          wordsTranscribed: analysisResult.asrResult?.wordCount || 0,
          averageConfidence: analysisResult.asrResult?.averageConfidence || 0,
          processingTime: analysisResult.asrResult?.processingTime || 0,
          language: analysisResult.asrResult?.language || 'en',
          segments: (analysisResult.asrResult?.segments || []).map(s => ({
            start: s.start,
            end: s.end,
            text: s.text,
            confidence: s.confidence ?? 0
          }))
        },
        synchronizedContent: (analysisResult.synchronizedContent || []).map(sc => ({
          ...sc,
          sceneType: sc.sceneType ?? ''
        })),
        contentSummary: analysisResult.contentSummary,
        processingTime: analysisResult.processingTime,
        error: analysisResult.error
      };

      job.result = result;
      job.status = analysisResult.success ? 'completed' : 'failed';
      job.completedAt = new Date();
      job.progress = { current: 100, total: 100, stage: analysisResult.success ? 'Completed' : 'Failed' };
      if (!analysisResult.success) {
        job.error = result.error || 'Video analysis failed';
      }

      if (analysisResult.success) {
        console.log(`✅ MOCR job ${jobId} completed successfully`);
      } else {
        console.log(`❌ MOCR job ${jobId} failed: ${job.error}`);
      }

    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.completedAt = new Date();
      job.progress = { current: 0, total: 100, stage: 'Failed' };

      console.error(`❌ MOCR job ${jobId} failed:`, error);
    }
  }

  /**
   * Validate file from path
   */
  private validateFileFromPath(
    filePath: string,
    _originalName: string,
    mimetype: string,
    fileSize: number,
    config: MOCRConfig
  ): void {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }
    if (fileSize > config.maxFileSize!) {
      throw new Error(`File too large: ${fileSize} bytes. Maximum size is ${config.maxFileSize} bytes.`);
    }
    if (!mimetype.startsWith('video/')) {
      throw new Error(`Unsupported file type: ${mimetype}. Only video files are supported.`);
    }
    const supported = [
      'video/mp4', 'video/avi', 'video/quicktime', 'video/x-matroska',
      'video/webm', 'video/x-flv', 'video/x-ms-wmv', 'video/mp2t',
      'video/3gpp', 'video/ogg'
    ];
    if (!supported.includes(mimetype)) {
      throw new Error(`Unsupported video format: ${mimetype}`);
    }
  }

  /**
   * Validate file
   */
  private validateFile(file: File, config: MOCRConfig): void {
    if (file.size > config.maxFileSize!) {
      throw new Error(`File too large: ${file.size} bytes. Maximum size is ${config.maxFileSize} bytes.`);
    }

    if (!file.type.startsWith('video/')) {
      throw new Error(`Unsupported file type: ${file.type}. Only video files are supported.`);
    }

    const supportedFormats = [
      'video/mp4', 'video/avi', 'video/quicktime', 'video/x-matroska',
      'video/webm', 'video/x-flv', 'video/x-ms-wmv', 'video/mp2t',
      'video/3gpp', 'video/ogg'
    ];

    if (!supportedFormats.includes(file.type)) {
      throw new Error(`Unsupported video format: ${file.type}. Supported formats: ${supportedFormats.join(', ')}`);
    }
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `mocr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get service statistics
   */
  getStats(): {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    pendingJobs: number;
    processingJobs: number;
    averageProcessingTime: number;
  } {
    const jobs = Array.from(this.jobs.values());
    const completedJobs = jobs.filter(job => job.status === 'completed');
    const averageProcessingTime = completedJobs.length > 0
      ? completedJobs.reduce((sum, job) => {
          const processingTime = job.completedAt && job.startedAt
            ? job.completedAt.getTime() - job.startedAt.getTime()
            : 0;
          return sum + processingTime;
        }, 0) / completedJobs.length
      : 0;

    return {
      totalJobs: jobs.length,
      completedJobs: jobs.filter(job => job.status === 'completed').length,
      failedJobs: jobs.filter(job => job.status === 'failed').length,
      pendingJobs: jobs.filter(job => job.status === 'pending').length,
      processingJobs: jobs.filter(job => job.status === 'processing').length,
      averageProcessingTime
    };
  }

  /**
   * Clean up old jobs
   */
  cleanupOldJobs(maxAge: number = 24 * 60 * 60 * 1000): number { // 24 hours
    const cutoff = new Date(Date.now() - maxAge);
    let cleaned = 0;

    for (const [jobId, job] of this.jobs.entries()) {
      if (job.createdAt < cutoff && (job.status === 'completed' || job.status === 'failed')) {
        this.jobs.delete(jobId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MOCRConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): MOCRConfig {
    return { ...this.config };
  }
}
