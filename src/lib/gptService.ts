// GPT Service - Frontend API client for GPT Creator
export interface GPTFile {
  id: string;
  gptId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  content: string;
  uploadedAt: string;
  isActive: boolean;
  // Temporary file reference for local state before upload
  _file?: File;
}

export interface GPTAction {
  id: string;
  gptId: string;
  name: string;
  description: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  parameters: Record<string, any>;
  isActive: boolean;
  createdAt: string;
}

export interface GPTConfig {
  id: string;
  name: string;
  description: string;
  instructions: string;
  conversationStarters: string[];
  avatar?: string;
  capabilities: {
    webSearch: boolean;
    canvas: boolean;
    imageGeneration: boolean;
    codeInterpreter: boolean;
  };
  modelId: string;
  conversationModel?: string;
  creativeModel?: string;
  codingModel?: string;
  files: GPTFile[];
  actions: GPTAction[];
  hasPersistentMemory: boolean; // VVAULT integration - defaults to true
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  userId: string;
}

export interface GPTResponse {
  content: string;
  context: string;
  files: string[];
  actions: string[];
  model: string;
  timestamp: string;
}

export class GPTService {
  private static instance: GPTService;
  private baseUrl: string;

  private constructor() {
    this.baseUrl = '/api/gpts';
  }

  static getInstance(): GPTService {
    if (!GPTService.instance) {
      GPTService.instance = new GPTService();
    }
    return GPTService.instance;
  }

  // GPT CRUD Operations
  async getAllGPTs(): Promise<GPTConfig[]> {
    const response = await fetch(this.baseUrl);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch GPTs');
    }
    
    return data.gpts;
  }

  async getGPT(id: string): Promise<GPTConfig> {
    const response = await fetch(`${this.baseUrl}/${id}`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch GPT');
    }
    
    return data.gpt;
  }

  async createGPT(config: Omit<GPTConfig, 'id' | 'createdAt' | 'updatedAt' | 'files' | 'actions' | 'userId'>): Promise<GPTConfig> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to create GPT');
    }
    
    return data.gpt;
  }

  async updateGPT(id: string, updates: Partial<Omit<GPTConfig, 'id' | 'createdAt' | 'files' | 'actions' | 'userId'>>): Promise<GPTConfig> {
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to update GPT');
    }
    
    return data.gpt;
  }

  async deleteGPT(id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${id}`, {
      method: 'DELETE',
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to delete GPT');
    }
  }

  // File Operations
  async uploadFile(gptId: string, file: File): Promise<GPTFile> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/${gptId}/files`, {
      method: 'POST',
      body: formData,
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to upload file');
    }
    
    return data.file;
  }

  async getFiles(gptId: string): Promise<GPTFile[]> {
    const response = await fetch(`${this.baseUrl}/${gptId}/files`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch files');
    }
    
    return data.files;
  }

  async deleteFile(fileId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}`, {
      method: 'DELETE',
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to delete file');
    }
  }

  async updateFileGPTId(fileId: string, newGptId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}/gpt`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ gptId: newGptId }),
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to update file GPT ID');
    }
  }

  // Action Operations
  async createAction(gptId: string, action: Omit<GPTAction, 'id' | 'gptId' | 'createdAt'>): Promise<GPTAction> {
    const response = await fetch(`${this.baseUrl}/${gptId}/actions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(action),
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to create action');
    }
    
    return data.action;
  }

  async getActions(gptId: string): Promise<GPTAction[]> {
    const response = await fetch(`${this.baseUrl}/${gptId}/actions`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch actions');
    }
    
    return data.actions;
  }

  async deleteAction(actionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/actions/${actionId}`, {
      method: 'DELETE',
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to delete action');
    }
  }

  async executeAction(actionId: string, parameters: Record<string, any> = {}): Promise<any> {
    const response = await fetch(`${this.baseUrl}/actions/${actionId}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parameters),
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to execute action');
    }
    
    return data.result;
  }

  // Avatar Operations
  async generateAvatar(name: string, description: string): Promise<string> {
    // Generate avatar locally since we don't have a GPT ID yet
    const initials = name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
    const color = colors[name.length % colors.length];

    const svg = `
      <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <rect width="64" height="64" fill="${color}" rx="32"/>
        <text x="32" y="40" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="20" font-weight="bold">${initials}</text>
      </svg>
    `;

    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  // Runtime Operations
  async loadGPT(gptId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/${gptId}/load`, {
      method: 'POST',
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to load GPT');
    }
    
    return data.runtime;
  }

  async getContext(gptId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/${gptId}/context`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch context');
    }
    
    return data.context;
  }

  async updateContext(gptId: string, context: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${gptId}/context`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ context }),
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to update context');
    }
  }

  // Utility Methods
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('text/')) return '📄';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('word')) return '📘';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📗';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📙';
    if (mimeType.includes('json')) return '🔧';
    if (mimeType.includes('csv')) return '📊';
    return '📁';
  }

  validateGPTConfig(config: Partial<GPTConfig>): string[] {
    const errors: string[] = [];
    
    if (!config.name || config.name.trim().length === 0) {
      errors.push('Name is required');
    }
    
    if (!config.description || config.description.trim().length === 0) {
      errors.push('Description is required');
    }
    
    if (!config.instructions || config.instructions.trim().length === 0) {
      errors.push('Instructions are required');
    }
    
    if (!config.modelId) {
      errors.push('Model selection is required');
    }
    
    return errors;
  }
}
