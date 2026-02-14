/**
 * MOCR Client SDK
 * Easy integration with MOCR Service
 */

export interface MOCRClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
}

export interface MOCRJobConfig {
  maxFrames?: number;
  frameInterval?: number;
  frameQuality?: number;
  ocrLanguage?: string;
  ocrMinConfidence?: number;
  ocrTimeout?: number;
  asrLanguage?: string;
  asrModel?: 'tiny' | 'base' | 'small' | 'medium' | 'large';
  asrTimeout?: number;
  enableTemporalAnalysis?: boolean;
  enableSceneDetection?: boolean;
  enableTextTracking?: boolean;
  enableSynchronization?: boolean;
  enableContentSummarization?: boolean;
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
  config: MOCRJobConfig;
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
  videoMetadata: {
    width: number;
    height: number;
    duration: number;
    fps: number;
    bitrate: number;
    codec: string;
    format: string;
    size: number;
  };
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

export class MOCRClient {
  private config: MOCRClientConfig;
  private defaultTimeout: number;

  constructor(config: MOCRClientConfig) {
    this.config = {
      timeout: 30000,
      retries: 3,
      ...config
    };
    this.defaultTimeout = this.config.timeout!;
  }

  /**
   * Analyze a video file
   */
  async analyzeVideo(
    file: File | Buffer,
    config: MOCRJobConfig = {}
  ): Promise<MOCRResult> {
    const job = await this.createJob(file, config);
    return await this.waitForCompletion(job.id);
  }

  /**
   * Create a new MOCR job
   */
  async createJob(
    file: File | Buffer,
    config: MOCRJobConfig = {}
  ): Promise<MOCRJob> {
    const formData = new FormData();
    
    if (file instanceof File) {
      formData.append('video', file);
    } else {
      const blob = new Blob([file], { type: 'video/mp4' });
      formData.append('video', blob, 'video.mp4');
    }
    
    if (Object.keys(config).length > 0) {
      formData.append('config', JSON.stringify(config));
    }

    const response = await this.makeRequest('/jobs', {
      method: 'POST',
      body: formData,
      headers: this.config.apiKey ? {
        'X-API-Key': this.config.apiKey
      } : {}
    });

    if (!response.success) {
      throw new Error(response.message || 'Failed to create job');
    }

    return response.job;
  }

  /**
   * Get job status
   */
  async getJob(jobId: string): Promise<MOCRJob> {
    const response = await this.makeRequest(`/jobs/${jobId}`);
    
    if (!response.success) {
      throw new Error(response.message || 'Failed to get job');
    }

    return response.job;
  }

  /**
   * Wait for job completion
   */
  async waitForCompletion(
    jobId: string,
    pollInterval: number = 2000,
    timeout: number = this.defaultTimeout
  ): Promise<MOCRResult> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const job = await this.getJob(jobId);
      
      if (job.status === 'completed') {
        if (!job.result) {
          throw new Error('Job completed but no result available');
        }
        return job.result;
      }
      
      if (job.status === 'failed') {
        throw new Error(job.error || 'Job failed');
      }
      
      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error('Job timeout');
  }

  /**
   * Get all jobs
   */
  async getJobs(options: {
    status?: string;
    limit?: number;
  } = {}): Promise<MOCRJob[]> {
    const params = new URLSearchParams();
    if (options.status) params.append('status', options.status);
    if (options.limit) params.append('limit', options.limit.toString());
    
    const queryString = params.toString();
    const url = queryString ? `/jobs?${queryString}` : '/jobs';
    
    const response = await this.makeRequest(url);
    
    if (!response.success) {
      throw new Error(response.message || 'Failed to get jobs');
    }

    return response.jobs;
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<void> {
    const response = await this.makeRequest(`/jobs/${jobId}/cancel`, {
      method: 'POST'
    });
    
    if (!response.success) {
      throw new Error(response.message || 'Failed to cancel job');
    }
  }

  /**
   * Delete a job
   */
  async deleteJob(jobId: string): Promise<void> {
    const response = await this.makeRequest(`/jobs/${jobId}`, {
      method: 'DELETE'
    });
    
    if (!response.success) {
      throw new Error(response.message || 'Failed to delete job');
    }
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<any> {
    const response = await this.makeRequest('/stats');
    
    if (!response.success) {
      throw new Error(response.message || 'Failed to get stats');
    }

    return response.stats;
  }

  /**
   * Get service information
   */
  async getInfo(): Promise<any> {
    const response = await this.makeRequest('/info');
    return response;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<any> {
    const response = await this.makeRequest('/health');
    return response;
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<any> {
    const url = `${this.config.baseUrl}${endpoint}`;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.config.retries!; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            ...options.headers,
            ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey })
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
        
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.retries!) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error('Request failed');
  }
}

// Convenience function to create a client
export function createMOCRClient(config: MOCRClientConfig): MOCRClient {
  return new MOCRClient(config);
}

// Default export
export default MOCRClient;
