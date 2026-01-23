export interface ConnectorConfig {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  userId?: string;
}

export interface Character {
  id: string;
  name: string;
  description?: string;
  backstory?: string;
  voice?: string;
  avatar?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncResult {
  success: boolean;
  charactersFound: number;
  charactersSynced: number;
  errors?: string[];
}

export abstract class BaseConnector {
  protected config: ConnectorConfig;
  protected platformName: string;
  
  constructor(platformName: string, config: ConnectorConfig) {
    this.platformName = platformName;
    this.config = config;
  }
  
  abstract testConnection(): Promise<{ connected: boolean; message: string }>;
  
  abstract listCharacters(): Promise<Character[]>;
  
  abstract getCharacter(characterId: string): Promise<Character | null>;
  
  abstract createCharacter(character: Partial<Character>): Promise<Character>;
  
  abstract updateCharacter(characterId: string, updates: Partial<Character>): Promise<Character>;
  
  abstract deleteCharacter(characterId: string): Promise<boolean>;
  
  abstract syncToLocal(characterId: string): Promise<SyncResult>;
  
  abstract syncFromLocal(localGptId: string, characterId?: string): Promise<SyncResult>;
  
  getPlatformName(): string {
    return this.platformName;
  }
  
  isConfigured(): boolean {
    return !!(this.config.apiKey || this.config.accessToken);
  }
}

export type ConnectorType = 'convai' | 'inworld' | 'gemini';

export const CONNECTOR_METADATA: Record<ConnectorType, { 
  name: string; 
  icon: string; 
  requiresOAuth: boolean;
  apiKeyName?: string;
  docsUrl: string;
}> = {
  convai: {
    name: 'Convai',
    icon: '🎭',
    requiresOAuth: false,
    apiKeyName: 'CONVAI_API_KEY',
    docsUrl: 'https://docs.convai.com/api-docs/',
  },
  inworld: {
    name: 'Inworld AI',
    icon: '🌐',
    requiresOAuth: false,
    apiKeyName: 'INWORLD_API_KEY',
    docsUrl: 'https://docs.inworld.ai/',
  },
  gemini: {
    name: 'Google Gemini',
    icon: '✨',
    requiresOAuth: true,
    docsUrl: 'https://ai.google.dev/gemini-api/docs/oauth',
  },
};
