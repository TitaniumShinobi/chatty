/**
 * simForge Client - Personality Extraction and Identity Forge
 * 
 * Frontend client for the simForge API
 */

export interface PersonalityAnalysis {
  core_identity: {
    name: string;
    essence: string;
    operating_principles: string[];
  };
  communication_style: {
    sentence_structure: string;
    vocabulary_level: string;
    emotional_range: string;
    directness: string;
    patterns: string[];
  };
  personality_traits: {
    precision: number;
    warmth: number;
    formality: number;
    patience: number;
    humor: number;
    assertiveness: number;
  };
  behavioral_rules: string[];
  metaphor_domains: string[];
  relationship_to_user: string;
  sample_responses: {
    greeting: string;
    disagreement: string;
    encouragement: string;
  };
}

export interface ForgeResult {
  success: boolean;
  error?: string;
  constructCallsign: string;
  constructName?: string;
  analysis?: PersonalityAnalysis;
  identityFiles?: {
    'prompt.txt': string;
    'conditioning.txt': string;
    'tone_profile.json': string;
  };
  stats?: {
    transcriptsAnalyzed: number;
    messagesAnalyzed: number;
    forgedAt: string;
  };
  saved?: {
    success: boolean;
    savedFiles?: string[];
    error?: string;
  };
}

export interface ForgePreview {
  constructCallsign: string;
  transcriptCount: number;
  messageCount: number;
  sampleMessages: Array<{
    role: string;
    preview: string;
  }>;
  readyToForge: boolean;
}

class SimForgeClient {
  private baseUrl = '/api/simforge';

  async preview(constructCallsign: string): Promise<ForgePreview> {
    const response = await fetch(`${this.baseUrl}/preview/${constructCallsign}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`Preview failed: ${response.statusText}`);
    }

    return response.json();
  }

  async forge(constructCallsign: string, constructName?: string): Promise<ForgeResult> {
    const response = await fetch(`${this.baseUrl}/forge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ constructCallsign, constructName })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Forge failed');
    }

    return response.json();
  }

  async forgeAndSave(constructCallsign: string, constructName?: string): Promise<ForgeResult> {
    const response = await fetch(`${this.baseUrl}/forge-and-save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ constructCallsign, constructName })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Forge and save failed');
    }

    return response.json();
  }

  async analyzeText(text: string, constructName?: string): Promise<ForgeResult> {
    const response = await fetch(`${this.baseUrl}/analyze-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ text, constructName })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Analysis failed');
    }

    return response.json();
  }
}

export const simForgeClient = new SimForgeClient();
export default simForgeClient;
