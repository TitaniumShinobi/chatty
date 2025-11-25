/**
 * Identity Matcher
 * 
 * Matches detected personality patterns to constructs and persists
 * character state in VVAULT.
 */

import type {
  DeepTranscriptAnalysis,
  PersonalityBlueprint,
} from '../transcript/types';
import type { Construct } from '../../types';

interface ConstructInfo {
  constructId: string;
  callsign: string;
  name?: string;
}

function isBrowserEnv(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

async function dynamicNodeImport(specifier: string): Promise<any> {
  // Avoid Vite/webpack static analysis by using an indirect dynamic import.
  // In browser environments this should never be called (guarded above).
  const loader = new Function('s', 'return import(s);');
  return loader(specifier);
}

/**
 * Match transcript patterns to constructs and persist personality blueprints
 */
export class IdentityMatcher {
  private readonly vvaultRoot: string;

  constructor(vvaultRoot: string = process.env.VVAULT_ROOT || '/vvault') {
    this.vvaultRoot = vvaultRoot;
  }

  /**
   * Match transcript analysis to available constructs
   */
  async matchTranscriptToConstruct(
    transcriptAnalysis: DeepTranscriptAnalysis,
    availableConstructs: ConstructInfo[]
  ): Promise<ConstructInfo | null> {
    // First, try exact match by construct ID
    const exactMatch = availableConstructs.find(
      c => c.constructId === transcriptAnalysis.constructId
    );
    if (exactMatch) {
      return exactMatch;
    }

    // Try to extract construct ID from transcript path
    const pathMatch = this.extractConstructFromPath(transcriptAnalysis.transcriptPath);
    if (pathMatch) {
      const pathConstruct = availableConstructs.find(
        c => c.constructId === pathMatch.constructId || c.callsign === pathMatch.callsign
      );
      if (pathConstruct) {
        return pathConstruct;
      }
    }

    // Try fuzzy matching by name patterns in transcript
    const namePatterns = this.extractNamePatterns(transcriptAnalysis);
    for (const pattern of namePatterns) {
      const fuzzyMatch = availableConstructs.find(
        c => c.name?.toLowerCase().includes(pattern.toLowerCase()) ||
             c.constructId.toLowerCase().includes(pattern.toLowerCase())
      );
      if (fuzzyMatch) {
        return fuzzyMatch;
      }
    }

    // Default: use construct ID from analysis
    return {
      constructId: transcriptAnalysis.constructId,
      callsign: this.extractCallsign(transcriptAnalysis.constructId),
    };
  }

  /**
   * Extract construct ID and callsign from file path
   */
  private extractConstructFromPath(path: string): { constructId: string; callsign: string } | null {
    // Pattern: .../instances/{construct-callsign}/...
    const instanceMatch = path.match(/instances[\/\\]([^\/\\]+)/);
    if (instanceMatch) {
      const fullId = instanceMatch[1];
      const callsignMatch = fullId.match(/-(\d+)$/);
      const constructId = callsignMatch ? fullId.substring(0, fullId.lastIndexOf('-')) : fullId;
      const callsign = callsignMatch ? callsignMatch[1] : '001';
      return { constructId, callsign };
    }

    // Pattern: .../{construct}-{callsign}/...
    const directMatch = path.match(/([a-z]+)-(\d+)/i);
    if (directMatch) {
      return {
        constructId: directMatch[1],
        callsign: directMatch[2],
      };
    }

    return null;
  }

  /**
   * Extract name patterns from transcript (mentions of construct name)
   */
  private extractNamePatterns(analysis: DeepTranscriptAnalysis): string[] {
    const patterns: string[] = [];
    const constructId = analysis.constructId.toLowerCase();

    // Check conversation pairs for name mentions
    analysis.conversationPairs.forEach(pair => {
      const text = (pair.user + ' ' + pair.assistant).toLowerCase();
      
      // Look for "said:" patterns
      const saidMatch = text.match(/(\w+)\s+said:/);
      if (saidMatch && saidMatch[1] !== 'you' && saidMatch[1] !== 'user') {
        patterns.push(saidMatch[1]);
      }

      // Look for direct mentions
      if (text.includes(constructId)) {
        patterns.push(constructId);
      }
    });

    return Array.from(new Set(patterns));
  }

  /**
   * Extract callsign from construct ID
   */
  private extractCallsign(constructId: string): string {
    const match = constructId.match(/-(\d+)$/);
    return match ? match[1] : '001';
  }

  /**
   * Persist personality blueprint to VVAULT
   */
  async persistPersonalityBlueprint(
    userId: string,
    constructId: string,
    callsign: string,
    blueprint: PersonalityBlueprint
  ): Promise<string> {
    if (isBrowserEnv()) {
      console.warn('[IdentityMatcher] persistPersonalityBlueprint skipped in browser');
      return '';
    }

    const fs = await dynamicNodeImport('fs/promises');
    const path = await dynamicNodeImport('path');

    // Resolve VVAULT user ID (would need to call resolve function)
    const vvaultUserId = await this.resolveVVAULTUserId(userId);
    const shardId = 'shard_0000';

    // Build path: /vvault/users/shard_0000/{user_id}/instances/{construct-callsign}/personality.json
    const instanceDir = path.join(
      this.vvaultRoot,
      'users',
      shardId,
      vvaultUserId,
      'instances',
      `${constructId}-${callsign}`
    );

    await fs.mkdir(instanceDir, { recursive: true });

    const personalityPath = path.join(instanceDir, 'personality.json');

    // Read existing blueprint if it exists to merge
    let existingBlueprint: PersonalityBlueprint | null = null;
    try {
      const existingContent = await fs.readFile(personalityPath, 'utf-8');
      existingBlueprint = JSON.parse(existingContent);
    } catch {
      // File doesn't exist, that's fine
    }

    // Merge with existing if present
    const finalBlueprint = existingBlueprint
      ? this.mergeBlueprints(existingBlueprint, blueprint)
      : blueprint;

    // Write blueprint
    await fs.writeFile(
      personalityPath,
      JSON.stringify(finalBlueprint, null, 2),
      'utf-8'
    );

    console.log(`✅ [IdentityMatcher] Persisted personality blueprint: ${personalityPath}`);
    return personalityPath;
  }

  /**
   * Load personality blueprint from VVAULT
   */
  async loadPersonalityBlueprint(
    userId: string,
    constructId: string,
    callsign: string
  ): Promise<PersonalityBlueprint | null> {
    if (isBrowserEnv()) {
      console.warn('[IdentityMatcher] loadPersonalityBlueprint skipped in browser');
      return null;
    }

    const fs = await dynamicNodeImport('fs/promises');
    const path = await dynamicNodeImport('path');

    try {
      const vvaultUserId = await this.resolveVVAULTUserId(userId);
      const shardId = 'shard_0000';

      const personalityPath = path.join(
        this.vvaultRoot,
        'users',
        shardId,
        vvaultUserId,
        'instances',
        `${constructId}-${callsign}`,
        'personality.json'
      );

      const content = await fs.readFile(personalityPath, 'utf-8');
      const blueprint = JSON.parse(content) as PersonalityBlueprint;
      if (!blueprint.personalIdentifiers) {
        blueprint.personalIdentifiers = [];
      }

      console.log(`✅ [IdentityMatcher] Loaded personality blueprint: ${personalityPath}`);
      return blueprint;
    } catch (error) {
      console.warn(`⚠️ [IdentityMatcher] Failed to load personality blueprint:`, error);
      return null;
    }
  }

  /**
   * Merge two personality blueprints
   */
  private mergeBlueprints(
    existing: PersonalityBlueprint,
    newBlueprint: PersonalityBlueprint
  ): PersonalityBlueprint {
    return {
      ...newBlueprint,
      constructId: existing.constructId,
      callsign: existing.callsign,
      coreTraits: Array.from(new Set([...existing.coreTraits, ...newBlueprint.coreTraits])),
      speechPatterns: [
        ...existing.speechPatterns,
        ...newBlueprint.speechPatterns,
      ].slice(0, 20),
      behavioralMarkers: [
        ...existing.behavioralMarkers,
        ...newBlueprint.behavioralMarkers,
      ].slice(0, 15),
      worldview: [
        ...existing.worldview,
        ...newBlueprint.worldview,
      ].slice(0, 10),
      memoryAnchors: [
        ...existing.memoryAnchors,
        ...newBlueprint.memoryAnchors,
      ]
        .sort((a, b) => b.significance - a.significance)
        .slice(0, 20),
      personalIdentifiers: this.mergePersonalIdentifiers(
        existing.personalIdentifiers || [],
        newBlueprint.personalIdentifiers || []
      ),
      consistencyRules: [
        ...existing.consistencyRules,
        ...newBlueprint.consistencyRules,
      ].slice(0, 20),
      metadata: {
        ...newBlueprint.metadata,
        sourceTranscripts: Array.from(
          new Set([
            ...existing.metadata.sourceTranscripts,
            ...newBlueprint.metadata.sourceTranscripts,
          ])
        ),
        mergedWithExisting: true,
      },
    };
  }

  private mergePersonalIdentifiers(
    existing: PersonalityBlueprint['personalIdentifiers'],
    incoming: PersonalityBlueprint['personalIdentifiers']
  ): PersonalityBlueprint['personalIdentifiers'] {
    const merged = new Map<string, PersonalityBlueprint['personalIdentifiers'][number]>();

    const add = (id: PersonalityBlueprint['personalIdentifiers'][number]) => {
      const key = `${id.type}:${id.value.toLowerCase()}`;
      const existingEntry = merged.get(key);
      if (!existingEntry || id.salience > existingEntry.salience) {
        merged.set(key, {
          ...id,
          evidence: Array.from(new Set([...(existingEntry?.evidence || []), ...id.evidence])).slice(0, 3),
          salience: Math.min(1, id.salience),
        });
      }
    };

    [...existing, ...incoming].forEach(add);

    return Array.from(merged.values())
      .sort((a, b) => b.salience - a.salience)
      .slice(0, 12);
  }

  /**
   * Resolve VVAULT user ID from Chatty user ID
   */
  private async resolveVVAULTUserId(userId: string): Promise<string> {
    // In browser context, userId is typically already vvaultUserId
    // In server context, we'd need to resolve it
    // For now, assume userId is vvaultUserId or use a simple mapping
    try {
      // Try to use VVAULTConversationManager's resolveUserId if available
      const { VVAULTConversationManager } = await import('../../lib/vvaultConversationManager');
      const manager = VVAULTConversationManager.getInstance();
      // If manager has a resolveUserId method, use it
      if (typeof (manager as any).resolveUserId === 'function') {
        return await (manager as any).resolveUserId(userId);
      }
    } catch {
      // Ignore
    }
    
    // Fallback: assume userId is vvaultUserId
    return userId;
  }
}
