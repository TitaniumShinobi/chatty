import { VVAULTConversationManager } from '../../lib/vvaultConversationManager';
import { DEFAULT_CHARACTER_PROFILES } from './defaultProfiles';
import type { CharacterContext, CharacterProfile } from './types';
import { IdentityMatcher } from './IdentityMatcher';
import type { PersonalityBlueprint } from '../transcript/types';

export interface CharacterContextRequest {
  constructId: string;
  callsign?: string | number;
  runtimeMode?: 'lin' | 'synth';
  profileOverride?: Partial<CharacterProfile>;
  userId?: string; // Added for personality blueprint loading
}

export class CharacterContextBuilder {
  private cache = new Map<string, CharacterContext>();
  private vvaultManager = VVAULTConversationManager.getInstance();
  private identityMatcher: IdentityMatcher | null = null;

  constructor() {
    // Initialize IdentityMatcher if VVAULT_ROOT is available
    try {
      const vvaultRoot = process.env.VVAULT_ROOT || '/vvault';
      this.identityMatcher = new IdentityMatcher(vvaultRoot);
    } catch (error) {
      console.warn('[CharacterContextBuilder] Failed to initialize IdentityMatcher:', error);
    }
  }

  async getCharacterContext(request: CharacterContextRequest): Promise<CharacterContext | null> {
    const constructId = request.constructId || 'lin';
    const callsign = this.formatCallsign(request.callsign);
    const cacheKey = `${constructId}:${callsign}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const profile = await this.loadProfile(constructId, callsign, request.profileOverride);
    if (!profile) {
      return null;
    }

    // Try to load personality blueprint and merge with profile
    let personalityBlueprint: PersonalityBlueprint | null = null;
    if (request.userId && this.identityMatcher) {
      try {
        personalityBlueprint = await this.identityMatcher.loadPersonalityBlueprint(
          request.userId,
          constructId,
          callsign
        );
      } catch (error) {
        console.warn('[CharacterContextBuilder] Failed to load personality blueprint:', error);
      }
    }

    // Merge personality blueprint data into profile
    if (personalityBlueprint) {
      profile.personalityTraits = [
        ...this.ensureList(profile.personalityTraits),
        ...personalityBlueprint.coreTraits,
      ];
      profile.behavioralMarkers = [
        ...this.ensureList(profile.behavioralMarkers),
        ...personalityBlueprint.behavioralMarkers.map(m => m.responsePattern),
      ];
      profile.speechPatterns = [
        ...this.ensureList(profile.speechPatterns),
        ...personalityBlueprint.speechPatterns.map(p => p.pattern),
      ];
      profile.memoryAnchors = [
        ...this.ensureList(profile.memoryAnchors),
        ...personalityBlueprint.memoryAnchors.map(a => a.anchor),
      ];
      profile.consistencyRules = [
        ...this.ensureList(profile.consistencyRules),
        ...personalityBlueprint.consistencyRules.map(r => r.rule),
      ];
    }

    const context: CharacterContext = {
      constructId,
      callsign,
      name: profile.name || constructId.toUpperCase(),
      backstory: profile.backstory,
      personalityTraits: this.ensureList(profile.personalityTraits),
      behavioralMarkers: this.ensureList(profile.behavioralMarkers),
      speechPatterns: this.ensureList(profile.speechPatterns),
      metaQuestionResponse: profile.metaQuestionResponse || "I don't answer questions about that anymore.",
      memoryAnchors: this.ensureList(profile.memoryAnchors),
      consistencyRules: this.ensureList(profile.consistencyRules),
      defaultPersona: profile.defaultPersona
    };

    this.cache.set(cacheKey, context);
    return context;
  }

  private async loadProfile(
    constructId: string,
    callsign: string,
    profileOverride?: Partial<CharacterProfile>
  ): Promise<CharacterProfile | null> {
    try {
      // Try loading from VVAULT first
      let profile = await this.vvaultManager.loadCharacterProfile(constructId, callsign);
      
      // If no profile found and this is Lin, try character adoption from conversation history
      if (!profile && constructId === 'lin-001') {
        const { characterAdoptionEngine } = await import('./CharacterAdoptionEngine');
        // Try to get userId from context (would need to be passed in)
        // For now, attempt adoption if we can get userId somehow
        // This is a placeholder - userId would need to be passed through the request
        console.log('[CharacterContextBuilder] Attempting character adoption for Lin...');
        // Note: userId would need to be available in the request context
        // This is a future enhancement - for now we use default profile
      }
      
      if (profile || profileOverride) {
        return this.mergeProfiles(
          profile ?? DEFAULT_CHARACTER_PROFILES[constructId],
          profileOverride
        );
      }
      return DEFAULT_CHARACTER_PROFILES[constructId] ?? null;
    } catch (error) {
      console.warn('[CharacterContextBuilder] Failed to load character profile, using defaults:', error);
      return this.mergeProfiles(DEFAULT_CHARACTER_PROFILES[constructId], profileOverride);
    }
  }

  private mergeProfiles(
    base: CharacterProfile | undefined | null,
    override?: Partial<CharacterProfile>
  ): CharacterProfile | null {
    if (!base && !override) {
      return null;
    }
    return {
      ...(base ?? {}),
      ...(override ?? {})
    };
  }

  private formatCallsign(callsign?: string | number): string {
    if (!callsign && callsign !== 0) {
      return '001';
    }
    if (typeof callsign === 'number') {
      return String(callsign).padStart(3, '0');
    }
    const trimmed = callsign.trim();
    const numeric = parseInt(trimmed, 10);
    if (Number.isFinite(numeric)) {
      return String(numeric).padStart(3, '0');
    }
    return trimmed.padStart(3, '0');
  }

  private ensureList(value?: string[]): string[] {
    if (!value || !Array.isArray(value)) {
      return [];
    }
    return value
      .map(entry => (entry || '').trim())
      .filter(Boolean);
  }
}
