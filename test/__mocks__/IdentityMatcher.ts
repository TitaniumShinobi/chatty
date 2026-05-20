// jest mock for IdentityMatcher used by tests that import PersonalityOrchestrator
// the real implementation touches the filesystem/VVAULT and may use import.meta.

export class IdentityMatcher {
  constructor() {}
  async loadPersonalityBlueprint(userId: string, constructId: string, callsign: string) {
    // by default return null so orchestrator can exercise its fallback logic
    return null;
  }
}
