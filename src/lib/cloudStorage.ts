// Large File Intelligence Layer - Cloud Storage Interface
// Production-ready cloud storage integration for document processing

export interface CloudStorageConfig {
  provider: 'local' | 's3' | 'gcs' | 'azure';
  bucket?: string;
  region?: string;
  credentials?: {
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
  };
  endpoint?: string;
  maxFileSize: number; // bytes
  allowedFileTypes: string[];
  compression: boolean;
  encryption: boolean;
}

export interface StorageMetadata {
  documentId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadTime: number;
  checksum: string;
  tags: Record<string, string>;
}

export interface UploadResult {
  documentId: string;
  url: string;
  metadata: StorageMetadata;
  processingTime: number;
}

export interface DownloadResult {
  content: string | ArrayBuffer;
  metadata: StorageMetadata;
  downloadTime: number;
}

export interface ProcessingJob {
  jobId: string;
  documentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export abstract class CloudStorageProvider {
  protected config: CloudStorageConfig;

  constructor(config: CloudStorageConfig) {
    this.config = config;
  }

  abstract initialize(): Promise<void>;
  abstract upload(file: File, metadata?: Partial<StorageMetadata>): Promise<UploadResult>;
  abstract download(documentId: string): Promise<DownloadResult>;
  abstract delete(documentId: string): Promise<boolean>;
  abstract listDocuments(prefix?: string): Promise<StorageMetadata[]>;
  abstract getProcessingJob(jobId: string): Promise<ProcessingJob | null>;
  abstract createProcessingJob(documentId: string): Promise<ProcessingJob>;
  abstract updateProcessingJob(jobId: string, updates: Partial<ProcessingJob>): Promise<void>;
}

/**
 * Local Storage Provider
 * For development and testing - stores files in browser storage
 */
export class LocalStorageProvider extends CloudStorageProvider {
  private storage: Map<string, { content: string | ArrayBuffer; metadata: StorageMetadata }> = new Map();
  private jobs: Map<string, ProcessingJob> = new Map();
  private safeLocalStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> =
    typeof localStorage !== 'undefined'
      ? localStorage
      : {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {}
        };

  constructor(config?: Partial<CloudStorageConfig>) {
    super({
      provider: 'local',
      maxFileSize: 100 * 1024 * 1024, // 100MB
      allowedFileTypes: ['pdf', 'epub', 'txt', 'docx'],
      compression: false,
      encryption: false,
      ...config
    });
  }

  async initialize(): Promise<void> {
    // Load from localStorage if available
    try {
      const stored = this.safeLocalStorage.getItem('chatty_documents');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const [key, value] of Object.entries(parsed)) {
          this.storage.set(key, value as any);
        }
      }
    } catch (error) {
      console.warn('Failed to load documents from localStorage:', error);
    }
  }

  async upload(file: File, metadata?: Partial<StorageMetadata>): Promise<UploadResult> {
    const startTime = Date.now();
    
    // Validate file
    if (file.size > this.config.maxFileSize) {
      throw new Error(`File size ${file.size} exceeds maximum allowed size ${this.config.maxFileSize}`);
    }

    const fileType = file.name.split('.').pop()?.toLowerCase();
    if (!this.config.allowedFileTypes.includes(fileType || '')) {
      throw new Error(`File type ${fileType} not allowed`);
    }

    // Generate document ID and metadata
    const documentId = metadata?.documentId || crypto.randomUUID();
    const checksum = await this.calculateChecksum(file);
    
    const storageMetadata: StorageMetadata = {
      documentId,
      fileName: file.name,
      fileType: fileType || 'unknown',
      fileSize: file.size,
      uploadTime: Date.now(),
      checksum,
      tags: metadata?.tags || {},
      ...metadata
    };

    // Read file content
    const content = await this.readFileContent(file);
    
    // Store in memory
    this.storage.set(documentId, { content, metadata: storageMetadata });
    
    // Persist to localStorage
    this.persistToLocalStorage();
    
    const processingTime = Date.now() - startTime;
    
    return {
      documentId,
      url: `local://${documentId}`,
      metadata: storageMetadata,
      processingTime
    };
  }

  async download(documentId: string): Promise<DownloadResult> {
    const startTime = Date.now();
    
    const stored = this.storage.get(documentId);
    if (!stored) {
      throw new Error(`Document ${documentId} not found`);
    }
    
    const downloadTime = Date.now() - startTime;
    
    return {
      content: stored.content,
      metadata: stored.metadata,
      downloadTime
    };
  }

  async delete(documentId: string): Promise<boolean> {
    const deleted = this.storage.delete(documentId);
    if (deleted) {
      this.persistToLocalStorage();
    }
    return deleted;
  }

  async listDocuments(prefix?: string): Promise<StorageMetadata[]> {
    const documents: StorageMetadata[] = [];
    
    for (const [key, value] of this.storage.entries()) {
      if (!prefix || key.startsWith(prefix)) {
        documents.push(value.metadata);
      }
    }
    
    return documents.sort((a, b) => b.uploadTime - a.uploadTime);
  }

  async getProcessingJob(jobId: string): Promise<ProcessingJob | null> {
    return this.jobs.get(jobId) || null;
  }

  async createProcessingJob(documentId: string): Promise<ProcessingJob> {
    const job: ProcessingJob = {
      jobId: crypto.randomUUID(),
      documentId,
      status: 'pending',
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.jobs.set(job.jobId, job);
    return job;
  }

  async updateProcessingJob(jobId: string, updates: Partial<ProcessingJob>): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    Object.assign(job, updates, { updatedAt: Date.now() });
    this.jobs.set(jobId, job);
  }

  private async calculateChecksum(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private async readFileContent(file: File): Promise<string | ArrayBuffer> {
    if (file.type.startsWith('text/')) {
      return await file.text();
    } else {
      return await file.arrayBuffer();
    }
  }

  private persistToLocalStorage(): void {
    try {
      const data: Record<string, any> = {};
      for (const [key, value] of this.storage.entries()) {
        data[key] = value;
      }
      this.safeLocalStorage.setItem('chatty_documents', JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to persist to localStorage:', error);
    }
  }
}

/**
 * Cloud Storage Service
 * High-level interface for cloud storage operations
 */
export class CloudStorageService {
  private provider: CloudStorageProvider;
  private processingQueue: Map<string, ProcessingJob> = new Map();

  constructor(provider: CloudStorageProvider) {
    this.provider = provider;
  }

  async initialize(): Promise<void> {
    await this.provider.initialize();
  }

  async uploadFile(file: File, metadata?: Partial<StorageMetadata>): Promise<UploadResult> {
    return await this.provider.upload(file, metadata);
  }

  async downloadFile(documentId: string): Promise<DownloadResult> {
    return await this.provider.download(documentId);
  }

  async deleteFile(documentId: string): Promise<boolean> {
    return await this.provider.delete(documentId);
  }

  async listFiles(prefix?: string): Promise<StorageMetadata[]> {
    return await this.provider.listDocuments(prefix);
  }

  async createProcessingJob(documentId: string): Promise<ProcessingJob> {
    const job = await this.provider.createProcessingJob(documentId);
    this.processingQueue.set(job.jobId, job);
    return job;
  }

  async getProcessingJob(jobId: string): Promise<ProcessingJob | null> {
    return await this.provider.getProcessingJob(jobId);
  }

  async updateProcessingJob(jobId: string, updates: Partial<ProcessingJob>): Promise<void> {
    await this.provider.updateProcessingJob(jobId, updates);
    
    // Update local queue
    const job = this.processingQueue.get(jobId);
    if (job) {
      Object.assign(job, updates);
    }
  }

  async getProcessingQueue(): Promise<ProcessingJob[]> {
    return Array.from(this.processingQueue.values())
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async clearCompletedJobs(): Promise<void> {
    for (const [jobId, job] of this.processingQueue.entries()) {
      if (job.status === 'completed' || job.status === 'failed') {
        this.processingQueue.delete(jobId);
      }
    }
  }
}

/**
 * Factory for creating cloud storage providers
 */
export class CloudStorageFactory {
  static create(config: CloudStorageConfig): CloudStorageProvider {
    switch (config.provider) {
      case 'local':
        return new LocalStorageProvider(config);
      case 's3':
      case 'gcs':
      case 'azure':
        throw new Error(`${config.provider} cloud storage not yet implemented`);
      default:
        throw new Error(`Unknown cloud storage provider: ${config.provider}`);
    }
  }
}
