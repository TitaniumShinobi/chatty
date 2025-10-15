/**
 * MOCR Client Integration for Chatty
 * Connects to external MOCR Service for video analysis
 */

export interface MOCRClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

export interface MOCRJobConfig {
  maxFrames?: number;
  frameInterval?: number;
  ocrLanguage?: string;
  asrLanguage?: string;
  enableTemporalAnalysis?: boolean;
  enableSceneDetection?: boolean;
  enableSynchronization?: boolean;
}

export interface MOCRResult {
  success: boolean;
  jobId: string;
  videoMetadata: {
    width: number;
    height: number;
    duration: number;
    fps: number;
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

export class ChattyMOCRClient {
  private config: MOCRClientConfig;
  private defaultTimeout: number;

  constructor(config: MOCRClientConfig) {
    this.config = {
      baseUrl: 'http://localhost:3001',
      timeout: 300000, // 5 minutes for video processing
      ...config
    };
    this.defaultTimeout = this.config.timeout!;
  }

  /**
   * Analyze a video file using external MOCR service
   */
  async analyzeVideo(
    file: File,
    config: MOCRJobConfig = {}
  ): Promise<MOCRResult> {
    try {
      console.log(`🎬 Sending video to MOCR service: ${file.name}`);

      // Create form data
      const formData = new FormData();
      formData.append('video', file);
      
      if (Object.keys(config).length > 0) {
        formData.append('config', JSON.stringify(config));
      }

      // Create job
      const createResponse = await this.makeRequest('/jobs', {
        method: 'POST',
        body: formData,
        headers: this.config.apiKey ? {
          'X-API-Key': this.config.apiKey
        } : {}
      });

      if (!createResponse.success) {
        throw new Error(createResponse.message || 'Failed to create MOCR job');
      }

      const jobId = createResponse.job.id;
      console.log(`📋 MOCR job created: ${jobId}`);

      // Wait for completion
      return await this.waitForCompletion(jobId);

    } catch (error) {
      console.error('❌ MOCR analysis failed:', error);
      throw error;
    }
  }

  /**
   * Wait for job completion with progress updates
   */
  private async waitForCompletion(
    jobId: string,
    pollInterval: number = 3000
  ): Promise<MOCRResult> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < this.defaultTimeout) {
      try {
        const jobResponse = await this.makeRequest(`/jobs/${jobId}`);
        
        if (!jobResponse.success) {
          throw new Error(jobResponse.message || 'Failed to get job status');
        }

        const job = jobResponse.job;
        
        // Log progress
        if (job.progress) {
          console.log(`📊 MOCR Progress: ${job.progress.current}/${job.progress.total} - ${job.progress.stage}`);
        }
        
        if (job.status === 'completed') {
          if (!job.result) {
            throw new Error('Job completed but no result available');
          }
          console.log(`✅ MOCR analysis completed: ${jobId}`);
          return job.result;
        }
        
        if (job.status === 'failed') {
          throw new Error(job.error || 'MOCR job failed');
        }
        
        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        console.error('Error polling MOCR job:', error);
        throw error;
      }
    }
    
    throw new Error('MOCR job timeout');
  }

  /**
   * Check if MOCR service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.makeRequest('/health', {
        method: 'GET'
      });
      return response.status === 'healthy';
    } catch (error) {
      console.warn('MOCR service not available:', error);
      return false;
    }
  }

  /**
   * Get MOCR service information
   */
  async getServiceInfo(): Promise<any> {
    try {
      const response = await this.makeRequest('/info');
      return response;
    } catch (error) {
      console.error('Failed to get MOCR service info:', error);
      throw error;
    }
  }

  /**
   * Make HTTP request to MOCR service
   */
  private async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<any> {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    
    try {
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
      clearTimeout(timeoutId);
      throw error;
    }
  }
}

// Create default client instance
const defaultMOCRClient = new ChattyMOCRClient({
  baseUrl: import.meta.env.VITE_MOCR_SERVICE_URL || 'http://localhost:3001',
  apiKey: import.meta.env.VITE_MOCR_API_KEY
});

export default defaultMOCRClient;
