/**
 * Capsule Service - Frontend API client for CapsuleForge integration
 */

export interface CapsuleGenerationRequest {
  constructCallsign: string;
  gptConfig?: {
    traits?: Record<string, number>;
    personalityType?: string;
    [key: string]: any;
  };
  transcriptData?: {
    memoryLog?: string[];
    [key: string]: any;
  };
}

export interface CapsuleGenerationResponse {
  ok: boolean;
  capsulePath?: string;
  instanceName?: string;
  fingerprint?: string;
  error?: string;
  details?: string;
}

/**
 * Generate a capsule for a GPT construct
 */
export async function generateCapsule(
  request: CapsuleGenerationRequest
): Promise<CapsuleGenerationResponse> {
  try {
    const response = await fetch('/api/vvault/capsules/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ [CapsuleService] Failed to generate capsule:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if a capsule exists for a construct
 */
export async function checkCapsuleExists(
  constructCallsign: string
): Promise<boolean> {
  try {
    // This would require a new endpoint to check capsule existence
    // For now, return false (capsules will be generated on-demand)
    return false;
  } catch (error) {
    console.error('❌ [CapsuleService] Failed to check capsule existence:', error);
    return false;
  }
}

