/**
 * Developer Note:
 * IdentityDriftDetector tracks short-term tone compliance per construct.
 * Use recordMessage after every response; call resetHistory in tests or when clearing state.
 */

const DEFAULT_WINDOW = 10;
const DEFAULT_THRESHOLD = 0.3;

export class IdentityDriftDetector {
  constructor({ windowSize = DEFAULT_WINDOW, driftThreshold = DEFAULT_THRESHOLD } = {}) {
    this.windowSize = windowSize;
    this.driftThreshold = driftThreshold;
    this.history = new Map();
  }

  recordMessage(construct, message) {
    if (!construct) return { driftScore: 0, isDrifting: false };
    const id = construct.id;
    if (!this.history.has(id)) {
      this.history.set(id, []);
    }
    const entry = {
      timestamp: Date.now(),
      content: message || '',
    };
    const entries = this.history.get(id);
    entries.push(entry);
    if (entries.length > this.windowSize) {
      entries.shift();
    }
    const personaKeywords = construct.persona?.keywords || [];
    const complianceRatio = this.computeCompliance(personaKeywords, message || '');
    const driftScore = 1 - complianceRatio;
    const isDrifting = driftScore > this.driftThreshold;
    if (isDrifting) {
      console.warn(
        `[IdentityDrift] Construct ${construct.name} drift score ${driftScore.toFixed(2)} (threshold ${this.driftThreshold})`
      );
    }
    return {
      driftScore,
      complianceRatio,
      isDrifting,
      sampleSize: entries.length,
    };
  }

  computeCompliance(keywords, message) {
    if (!keywords.length) return 1;
    const lower = message.toLowerCase();
    const hits = keywords.reduce((count, keyword) => {
      if (!keyword) return count;
      return lower.includes(keyword.toLowerCase()) ? count + 1 : count;
    }, 0);
    return hits / keywords.length;
  }

  resetHistory(constructId) {
    if (!constructId) {
      this.history.clear();
      return;
    }
    this.history.delete(constructId.toLowerCase());
  }
}

export default IdentityDriftDetector;
