/**
 * Identity Matcher
 * 
 * Matches detected personality patterns to constructs and persists
 * character state in VVAULT.
 */

import type {
  DeepTranscriptAnalysis,
  PersonalityBlueprint,
  MemoryAnchor,
  ConsistencyRule,
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

  constructor(vvaultRoot: string = (typeof process !== 'undefined' && process.env?.VVAULT_ROOT) || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VVAULT_ROOT) || '/vvault') {
    // #region agent log
    const logData = {
      location: 'IdentityMatcher.ts:39',
      message: 'IdentityMatcher: constructor called',
      data: {
        vvaultRoot,
        hasProcess: typeof process !== 'undefined',
        hasImportMeta: typeof import.meta !== 'undefined',
        processEnvValue: typeof process !== 'undefined' ? process.env?.VVAULT_ROOT : undefined,
        importMetaEnvValue: typeof import.meta !== 'undefined' ? import.meta.env?.VITE_VVAULT_ROOT : undefined
      },
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'fix-identity-matcher',
      hypothesisId: 'E'
    };
    // Fire and forget - constructors cannot be async// #endregion
    this.vvaultRoot = vvaultRoot;
  }

  /**
   * Lightweight enrichment from stored transcripts.
   * Parses chatgpt/*.md for lines like "Katana said:" and adds phrasing to the blueprint.
   */
  private async enrichBlueprintFromTranscripts(
    userId: string,
    callsign: string,
    blueprint: PersonalityBlueprint
  ): Promise<PersonalityBlueprint> {
    if (isBrowserEnv()) return blueprint;

    const fs = await dynamicNodeImport('fs/promises');
    const path = await dynamicNodeImport('path');

    try {
      const vvaultUserId = await this.resolveVVAULTUserId(userId);
      const shardId = 'shard_0000';
      const transcriptsDir = path.join(
        this.vvaultRoot,
        'users',
        shardId,
        vvaultUserId,
        'instances',
        callsign,
        'chatgpt'
      );

      const entries = await fs.readdir(transcriptsDir).catch(() => []);
      const speechPhrases: string[] = [];
      const behavioral: { situation: string; response: string }[] = [];

      for (const entry of entries) {
        if (!entry.endsWith('.md')) continue;
        const filePath = path.join(transcriptsDir, entry);
        const content = await fs.readFile(filePath, 'utf-8').catch(() => '');
        if (!content) continue;

        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          const katanaSaid = line.match(/^\s*(Katana|ChatGPT)\s+said:/i);
          if (katanaSaid) {
            const next = (lines[i + 1] || '').trim();
            const sentence = next.replace(/^[-*]\s*/, '').trim();
            if (sentence.length >= 8 && sentence.length <= 240) {
              speechPhrases.push(sentence);
              behavioral.push({
                situation: 'conversation follow-up',
                response: sentence
              });
            }
          }
        }
      }

      const dedup = <T>(arr: T[]) => Array.from(new Set(arr));
      const mergedSpeech = dedup([
        ...blueprint.speechPatterns.map(p => p.pattern),
        ...speechPhrases
      ]).slice(0, 20);

      const speechPatterns = mergedSpeech.map(pattern => ({
        pattern,
        type: 'vocabulary' as const,
        frequency: 1,
        examples: [pattern],
        pairIndices: []
      }));

      const mergedBehavioral = [
        ...blueprint.behavioralMarkers,
        ...behavioral.slice(0, 10).map(b => ({
          situation: b.situation,
          responsePattern: b.response,
          frequency: 1,
          examples: [],
          pairIndices: []
        }))
      ].slice(0, 15);

      return {
        ...blueprint,
        speechPatterns,
        behavioralMarkers: mergedBehavioral
      };
    } catch (err) {
      console.warn('[IdentityMatcher] Transcript enrichment skipped:', err);
      return blueprint;
    }
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

    // Write blueprint to primary location
    await fs.writeFile(
      personalityPath,
      JSON.stringify(finalBlueprint, null, 2),
      'utf-8'
    );

    console.log(`✅ [IdentityMatcher] Persisted personality blueprint: ${personalityPath}`);
    
    // Also save to identity/ folder for compatibility
    const identityDir = path.join(instanceDir, 'identity');
    try {
      await fs.mkdir(identityDir, { recursive: true });
      const identityBlueprintPath = path.join(identityDir, 'personality.json');
      await fs.writeFile(
        identityBlueprintPath,
        JSON.stringify(finalBlueprint, null, 2),
        'utf-8'
      );
      console.log(`✅ [IdentityMatcher] Also saved blueprint to identity folder: ${identityBlueprintPath}`);
    } catch (identityError) {
      // Non-critical - identity folder might not be needed
      console.warn(`⚠️ [IdentityMatcher] Failed to save blueprint to identity folder (non-critical):`, identityError);
    }
    
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
      const instancesBase = path.join(
        this.vvaultRoot,
        'users',
        shardId,
        vvaultUserId,
        'instances'
      );

      // Try multiple location patterns (in order of preference)
      // 1. Full callsign format: instances/{constructId}-{callsign}/personality.json
      // 2. Callsign-only format: instances/{callsign}/personality.json (for katana-001)
      // 3. Identity folder: instances/{callsign}/identity/personality.json
      // 4. Legacy gpt- prefix: instances/gpt-{callsign}/personality.json
      const candidatePaths = [
        path.join(instancesBase, `${constructId}-${callsign}`, 'personality.json'),
        path.join(instancesBase, callsign, 'personality.json'), // e.g., instances/katana-001/personality.json
        path.join(instancesBase, callsign, 'identity', 'personality.json'), // e.g., instances/katana-001/identity/personality.json
        path.join(instancesBase, `gpt-${callsign}`, 'personality.json'), // e.g., instances/gpt-katana-001/personality.json
        path.join(instancesBase, `gpt-${callsign}`, 'identity', 'personality.json'),
      ];

      // Also try if callsign already includes constructId (e.g., "katana-001" passed as callsign)
      if (callsign.includes('-')) {
        candidatePaths.unshift(
          path.join(instancesBase, callsign, 'personality.json'), // Already added, but prioritize
          path.join(instancesBase, callsign, 'identity', 'personality.json')
        );
      }

      for (const personalityPath of candidatePaths) {
        try {
          const content = await fs.readFile(personalityPath, 'utf-8');
          let blueprint = JSON.parse(content) as PersonalityBlueprint;
          if (!blueprint.personalIdentifiers) {
            blueprint.personalIdentifiers = [];
          }

          // Merge capsule metadata + signatures/memories into blueprint
          const capsuleData = await this.loadCapsuleData(userId, constructId, callsign);
          if (capsuleData) {
            blueprint = this.mergeCapsuleDataIntoBlueprint(blueprint, capsuleData);
          }

          // Enrich from transcripts if available to give the validator more real phrasing
          blueprint = await this.enrichBlueprintFromTranscripts(vvaultUserId, callsign, blueprint);

          console.log(`✅ [IdentityMatcher] Loaded personality blueprint: ${personalityPath}`);
          return blueprint;
        } catch (error) {
          // File doesn't exist at this location, try next
          continue;
        }
      }

      // None found
      console.warn(`⚠️ [IdentityMatcher] Personality blueprint not found in any location for ${constructId}-${callsign}`);
      console.warn(`⚠️ [IdentityMatcher] Tried paths:`, candidatePaths);
      return null;
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
   * Merge capsule metadata, signatures, and memories into blueprint.
   */
  private mergeCapsuleDataIntoBlueprint(
    blueprint: PersonalityBlueprint,
    capsule: any
  ): PersonalityBlueprint {
    const updated: PersonalityBlueprint = {
      ...blueprint,
      speechPatterns: [...blueprint.speechPatterns],
      memoryAnchors: [...blueprint.memoryAnchors],
      consistencyRules: [...blueprint.consistencyRules],
      personalIdentifiers: [...(blueprint.personalIdentifiers || [])],
      metadata: {
        ...blueprint.metadata,
        instance_name: capsule?.metadata?.instance_name || blueprint.metadata.instance_name,
        capsuleEnvironment: capsule?.environment || blueprint.metadata.capsuleEnvironment,
        lexicalSignatures: capsule?.additional_data?.lexical_signatures || blueprint.metadata.lexicalSignatures,
        detectionRubric: capsule?.additional_data?.detection_rubric || blueprint.metadata.detectionRubric
      }
    };

    const addSpeechPattern = (pattern?: string) => {
      const normalized = (pattern || '').trim();
      if (!normalized) return;
      const exists = updated.speechPatterns.some(
        sp => sp.pattern.toLowerCase() === normalized.toLowerCase()
      );
      if (!exists) {
        updated.speechPatterns.unshift({
          pattern: normalized,
          type: 'vocabulary',
          frequency: 1,
          examples: [normalized],
          pairIndices: []
        });
      }
    };

    const addMemoryAnchor = (
      anchor?: string,
      type: MemoryAnchor['type'] = 'defining-moment',
      context: string = 'capsule',
      significance = 0.85
    ) => {
      const normalized = (anchor || '').trim();
      if (!normalized) return;
      updated.memoryAnchors.unshift({
        anchor: normalized,
        type,
        significance,
        timestamp: new Date().toISOString(),
        pairIndex: updated.memoryAnchors.length,
        context
      });
    };

    const addConsistencyRule = (
      rule?: string,
      type: ConsistencyRule['type'] = 'behavior',
      examples: string[] = []
    ) => {
      const normalized = (rule || '').trim();
      if (!normalized) return;
      const exists = updated.consistencyRules.some(
        r => r.rule.toLowerCase() === normalized.toLowerCase()
      );
      if (!exists) {
        updated.consistencyRules.unshift({
          rule: normalized,
          type,
          source: 'capsule',
          confidence: 0.95,
          examples
        });
      }
    };

    const addSelfIdentifier = (value?: string) => {
      const normalized = (value || '').trim();
      if (!normalized) return;
      const exists = updated.personalIdentifiers.some(
        id => id.type === 'self-name' && id.value.toLowerCase() === normalized.toLowerCase()
      );
      if (!exists) {
        updated.personalIdentifiers.unshift({
          type: 'self-name',
          value: normalized,
          salience: 0.99,
          evidence: ['capsule-metadata'],
          lastSeen: new Date().toISOString()
        });
      }
    };

    addSelfIdentifier(updated.metadata.instance_name);

    if (capsule?.signatures?.linguistic_sigil) {
      addSpeechPattern(capsule.signatures.linguistic_sigil.signature_phrase);
      (capsule.signatures.linguistic_sigil.common_phrases || []).forEach(phrase => addSpeechPattern(phrase));
    }
    (capsule?.additional_data?.lexical_signatures || []).forEach((phrase: string) => addSpeechPattern(phrase));

    const memory = capsule?.memory || {};
    (memory.short_term_memories || []).forEach((entry: string) =>
      addMemoryAnchor(entry, 'defining-moment', 'capsule:short-term', 0.82)
    );
    (memory.long_term_memories || []).forEach((entry: string) =>
      addMemoryAnchor(entry, 'core-statement', 'capsule:long-term', 0.9)
    );
    (memory.emotional_memories || []).forEach((entry: string) =>
      addMemoryAnchor(entry, 'relationship-marker', 'capsule:emotional', 0.87)
    );
    (memory.episodic_memories || []).forEach((entry: string) =>
      addMemoryAnchor(entry, 'defining-moment', 'capsule:episodic', 0.8)
    );

    (memory.procedural_memories || []).forEach((entry: string) =>
      addConsistencyRule(entry, 'behavior')
    );

    const rubricClasses = capsule?.additional_data?.detection_rubric?.classes;
    if (rubricClasses) {
      Object.entries(rubricClasses).forEach(([className, details]) => {
        const detailText = Array.isArray(details) ? details.join(', ') : JSON.stringify(details);
        addConsistencyRule(`Detection rubric for ${className}: ${detailText}`, 'identity');
      });
    }

    return updated;
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

  private async loadCapsuleData(userId: string, constructId: string, callsign: string): Promise<any | null> {
    try {
      const fs = await dynamicNodeImport('fs/promises');
      const path = await dynamicNodeImport('path');
      const vvaultUserId = await this.resolveVVAULTUserId(userId);
      const capsuleDir = path.join(
        this.vvaultRoot,
        'users',
        'shard_0000',
        vvaultUserId,
        'capsules'
      );

      const normalizedCallsign = (callsign || '').toString().trim();
      const normalizedConstruct = (constructId || '').toString().trim();
      const candidates = new Set<string>();

      if (normalizedCallsign) {
        candidates.add(normalizedCallsign);
      }
      if (normalizedConstruct && normalizedCallsign) {
        const joined = normalizedCallsign.includes('-')
          ? normalizedCallsign
          : `${normalizedConstruct.replace(/-$/, '')}-${normalizedCallsign.replace(/^-/, '')}`;
        candidates.add(joined);
      }
      if (normalizedConstruct) {
        candidates.add(normalizedConstruct);
      }

      for (const candidate of Array.from(candidates)) {
        const capsulePath = path.join(capsuleDir, `${candidate}.capsule`);
        try {
          const raw = await fs.readFile(capsulePath, 'utf-8');
          const capsule = JSON.parse(raw);
          return capsule;
        } catch {
          continue;
        }
      }

      return null;
    } catch {
      return null;
    }
  }
}
