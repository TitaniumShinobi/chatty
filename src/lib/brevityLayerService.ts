/**
 * Brevity Layer Service
 * 
 * Frontend service for managing brevity layer configuration
 * and analytical sharpness settings via VVAULT API.
 */

import type {
  BrevityConfig,
  AnalyticalSharpnessConfig,
  BrevityConfigResponse,
  AnalyticalSharpnessResponse,
  BrevityMemoryQueryOptions,
  DEFAULT_BREVITY_CONFIG,
  DEFAULT_ANALYTICAL_SHARPNESS,
} from '../types/brevityLayer';

import {
  DEFAULT_BREVITY_CONFIG as DEFAULT_CONFIG,
  DEFAULT_ANALYTICAL_SHARPNESS as DEFAULT_ANALYTICS,
} from '../types/brevityLayer';

/**
 * Fetch brevity configuration from VVAULT
 */
export async function getBrevityConfig(constructCallsign: string): Promise<BrevityConfig> {
  try {
    const response = await fetch(
      `/api/vvault/brevity/config?constructCallsign=${encodeURIComponent(constructCallsign)}`,
      {
        method: 'GET',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      console.warn(`⚠️ [BrevityLayerService] Failed to fetch brevity config: ${response.status}`);
      return DEFAULT_CONFIG;
    }

    const data: BrevityConfigResponse = await response.json();
    
    if (data.ok && data.config) {
      return data.config;
    }

    // Config not found, return defaults
    return DEFAULT_CONFIG;
  } catch (error) {
    console.warn('⚠️ [BrevityLayerService] Error fetching brevity config:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Save brevity configuration to VVAULT
 */
export async function saveBrevityConfig(
  constructCallsign: string,
  config: Partial<BrevityConfig>
): Promise<BrevityConfig> {
  try {
    const response = await fetch('/api/vvault/brevity/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        constructCallsign,
        config,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save brevity config');
    }

    const data: BrevityConfigResponse = await response.json();
    
    if (data.ok && data.config) {
      return data.config;
    }

    throw new Error('Invalid response from server');
  } catch (error) {
    console.error('❌ [BrevityLayerService] Failed to save brevity config:', error);
    throw error;
  }
}

/**
 * Get analytical sharpness settings from VVAULT
 */
export async function getAnalyticalSharpness(constructCallsign: string): Promise<AnalyticalSharpnessConfig> {
  try {
    const response = await fetch(
      `/api/vvault/brevity/analytics?constructCallsign=${encodeURIComponent(constructCallsign)}`,
      {
        method: 'GET',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      console.warn(`⚠️ [BrevityLayerService] Failed to fetch analytical sharpness: ${response.status}`);
      return DEFAULT_ANALYTICS;
    }

    const data: AnalyticalSharpnessResponse = await response.json();
    
    if (data.ok && data.config) {
      return data.config;
    }

    // Config not found, return defaults
    return DEFAULT_ANALYTICS;
  } catch (error) {
    console.warn('⚠️ [BrevityLayerService] Error fetching analytical sharpness:', error);
    return DEFAULT_ANALYTICS;
  }
}

/**
 * Save analytical sharpness settings to VVAULT
 */
export async function saveAnalyticalSharpness(
  constructCallsign: string,
  config: Partial<AnalyticalSharpnessConfig>
): Promise<AnalyticalSharpnessConfig> {
  try {
    const response = await fetch('/api/vvault/brevity/analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        constructCallsign,
        config,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save analytical sharpness');
    }

    const data: AnalyticalSharpnessResponse = await response.json();
    
    if (data.ok && data.config) {
      return data.config;
    }

    throw new Error('Invalid response from server');
  } catch (error) {
    console.error('❌ [BrevityLayerService] Failed to save analytical sharpness:', error);
    throw error;
  }
}

/**
 * Query memories with brevity context
 */
export async function queryBrevityMemories(
  options: BrevityMemoryQueryOptions
): Promise<Array<{ context: string; response: string; metadata?: any; relevance?: number }>> {
  try {
    const params = new URLSearchParams({
      constructCallsign: options.constructCallsign,
      query: options.query,
      limit: (options.limit || 10).toString(),
      includeBrevityExamples: (options.includeBrevityExamples || false).toString(),
    });

    if (options.minBrevityScore !== undefined) {
      params.append('minBrevityScore', options.minBrevityScore.toString());
    }

    if (options.oneWordOnly) {
      params.append('oneWordOnly', 'true');
    }

    const response = await fetch(`/api/vvault/brevity/memories?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      console.warn(`⚠️ [BrevityLayerService] Failed to query brevity memories: ${response.status}`);
      return [];
    }

    const data = await response.json();
    
    if (data.ok && data.memories) {
      return data.memories;
    }

    return [];
  } catch (error) {
    console.warn('⚠️ [BrevityLayerService] Error querying brevity memories:', error);
    return [];
  }
}

