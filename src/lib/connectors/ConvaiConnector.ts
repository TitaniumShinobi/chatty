import { BaseConnector, ConnectorConfig, Character, SyncResult } from './BaseConnector';

const CONVAI_API_BASE = 'https://api.convai.com';

interface ConvaiCharacter {
  charID?: string;
  character_id?: string;
  charName?: string;
  character_name?: string;
  backstory?: string;
  voiceType?: string;
  voice_type?: string;
  timestamp?: string;
}

export class ConvaiConnector extends BaseConnector {
  constructor(config: ConnectorConfig) {
    super('Convai', config);
  }
  
  private getHeaders(): HeadersInit {
    return {
      'CONVAI-API-KEY': this.config.apiKey || '',
      'Content-Type': 'application/json',
    };
  }
  
  async testConnection(): Promise<{ connected: boolean; message: string }> {
    if (!this.config.apiKey) {
      return { connected: false, message: 'No API key configured' };
    }
    
    try {
      const response = await fetch(`${CONVAI_API_BASE}/character/list`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      
      if (response.ok) {
        return { connected: true, message: 'Successfully connected to Convai' };
      } else if (response.status === 401) {
        return { connected: false, message: 'Invalid API key' };
      } else {
        return { connected: false, message: `Connection failed: ${response.status}` };
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { connected: false, message: `Connection error: ${message}` };
    }
  }
  
  async listCharacters(): Promise<Character[]> {
    if (!this.config.apiKey) {
      throw new Error('Convai API key not configured');
    }
    
    const response = await fetch(`${CONVAI_API_BASE}/character/list`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to list characters: ${response.status}`);
    }
    
    const data = await response.json();
    const characters: ConvaiCharacter[] = data.characters || [];
    
    return characters.map((c: ConvaiCharacter) => ({
      id: c.charID || c.character_id || '',
      name: c.charName || c.character_name || 'Unnamed',
      backstory: c.backstory,
      voice: c.voiceType || c.voice_type,
      metadata: {
        platform: 'convai',
        timestamp: c.timestamp,
      },
    }));
  }
  
  async getCharacter(characterId: string): Promise<Character | null> {
    if (!this.config.apiKey) {
      throw new Error('Convai API key not configured');
    }
    
    const response = await fetch(`${CONVAI_API_BASE}/character/get`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ charID: characterId }),
    });
    
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to get character: ${response.status}`);
    }
    
    const c: ConvaiCharacter = await response.json();
    
    return {
      id: c.charID || c.character_id || characterId,
      name: c.charName || c.character_name || 'Unnamed',
      backstory: c.backstory,
      voice: c.voiceType || c.voice_type,
      metadata: {
        platform: 'convai',
        timestamp: c.timestamp,
      },
    };
  }
  
  async createCharacter(character: Partial<Character>): Promise<Character> {
    if (!this.config.apiKey) {
      throw new Error('Convai API key not configured');
    }
    
    const response = await fetch(`${CONVAI_API_BASE}/character/create`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        charName: character.name,
        voiceType: character.voice || 'MALE',
        backstory: character.backstory || character.description || '',
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create character: ${errorText}`);
    }
    
    const data = await response.json();
    
    return {
      id: data.charID,
      name: character.name || 'Unnamed',
      backstory: character.backstory,
      voice: character.voice || 'MALE',
      metadata: {
        platform: 'convai',
        createdAt: new Date().toISOString(),
      },
    };
  }
  
  async updateCharacter(characterId: string, updates: Partial<Character>): Promise<Character> {
    if (!this.config.apiKey) {
      throw new Error('Convai API key not configured');
    }
    
    const payload: Record<string, unknown> = { charID: characterId };
    if (updates.backstory) payload.backstory = updates.backstory;
    if (updates.voice) payload.voiceType = updates.voice;
    
    const response = await fetch(`${CONVAI_API_BASE}/character/update`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update character: ${errorText}`);
    }
    
    const updated = await this.getCharacter(characterId);
    if (!updated) {
      throw new Error('Character not found after update');
    }
    
    return updated;
  }
  
  async deleteCharacter(characterId: string): Promise<boolean> {
    if (!this.config.apiKey) {
      throw new Error('Convai API key not configured');
    }
    
    const response = await fetch(`${CONVAI_API_BASE}/character/delete`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ charID: characterId }),
    });
    
    return response.ok;
  }
  
  async syncToLocal(_characterId: string): Promise<SyncResult> {
    return {
      success: false,
      charactersFound: 0,
      charactersSynced: 0,
      errors: ['syncToLocal not yet implemented for Convai'],
    };
  }
  
  async syncFromLocal(_localGptId: string, _characterId?: string): Promise<SyncResult> {
    return {
      success: false,
      charactersFound: 0,
      charactersSynced: 0,
      errors: ['syncFromLocal not yet implemented for Convai'],
    };
  }
}
