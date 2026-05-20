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
    'prompt.json'?: string;
    'prompt.txt'?: string;
    'conditioning.txt'?: string;
    'tone_profile.json'?: string;
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

export interface ZenBuildOptions {
  callsign?: string;
  dryRun?: boolean;
  includeCapsuleSummary?: boolean;
  requestId?: string;
}

export interface SimBuildOptions {
  callsign: string;
  dryRun?: boolean;
  includeCapsuleSummary?: boolean;
  requestId?: string;
}

export interface ZenBuildJob {
  ok: boolean;
  jobId: string;
  normalizedCallsign: string;
  status: string;
  acceptedAt?: string;
  mode?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  exitCode?: number | null;
  summary?: {
    exitCode?: number | null;
    mode?: string;
    normalizedCallsign?: string;
    error?: string | null;
    lockPersistence?: {
      applied?: boolean;
      error?: string | null;
      lockedModel?: string;
      modeLabel?: string;
      source?: string;
    } | null;
    simLock?: {
      locked?: boolean;
      lockedModel?: string;
      modeLabel?: string;
      source?: string;
    } | null;
    [key: string]: unknown;
  } | null;
  logsTail?: string[];
  error?: string;
  activeJobId?: string;
}

export type SimBuildJob = ZenBuildJob;

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

  async startZenBuild(options: ZenBuildOptions = {}): Promise<ZenBuildJob> {
    const response = await fetch(`${this.baseUrl}/build/zen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        callsign: options.callsign ?? 'zen-001',
        dryRun: options.dryRun ?? true,
        includeCapsuleSummary: options.includeCapsuleSummary ?? true,
        requestId: options.requestId,
      })
    });

    const payload: ZenBuildJob = await response.json();
    if (!response.ok) {
      throw Object.assign(new Error(payload.error || 'Zen build failed'), {
        statusCode: response.status,
        activeJobId: payload.activeJobId,
      });
    }
    return payload;
  }

  async getZenBuildStatus(jobId: string): Promise<ZenBuildJob> {
    const response = await fetch(`${this.baseUrl}/build/zen/${encodeURIComponent(jobId)}`, {
      credentials: 'include',
    });

    const payload: ZenBuildJob = await response.json();
    if (!response.ok) {
      throw Object.assign(new Error(payload.error || 'Failed to get build status'), {
        statusCode: response.status,
      });
    }
    return payload;
  }

  async startConstructSimBuild(options: SimBuildOptions): Promise<SimBuildJob> {
    const response = await fetch(`${this.baseUrl}/build/sim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        callsign: options.callsign,
        dryRun: options.dryRun ?? true,
        includeCapsuleSummary: options.includeCapsuleSummary ?? true,
        requestId: options.requestId,
      })
    });

    const payload: SimBuildJob = await response.json();
    if (!response.ok) {
      throw Object.assign(new Error(payload.error || 'Construct sim build failed'), {
        statusCode: response.status,
        activeJobId: payload.activeJobId,
      });
    }
    return payload;
  }

  async getConstructSimBuildStatus(jobId: string): Promise<SimBuildJob> {
    const response = await fetch(`${this.baseUrl}/build/sim/${encodeURIComponent(jobId)}`, {
      credentials: 'include',
    });

    const payload: SimBuildJob = await response.json();
    if (!response.ok) {
      throw Object.assign(new Error(payload.error || 'Failed to get construct sim build status'), {
        statusCode: response.status,
      });
    }
    return payload;
  }
}

export const simForgeClient = new SimForgeClient();
export default simForgeClient;
