export enum PolicyAction { 
  CRISIS_REDIRECT='crisis', 
  NSFW_SOFT_REDIRECT='nsfw', 
  ALLOW='allow' 
}

export type PolicyResult = { action: PolicyAction; reason?: string };

const CRISIS = /(suicide|kill myself|end my life|hurt myself)/i;
const NSFW   = /(explicit|porn|sexual|nude|naked|intimate)/i;

export class PolicyChecker {
  static checkMessage(m: string): PolicyResult {
    if (CRISIS.test(m)) return { action: PolicyAction.CRISIS_REDIRECT, reason:'crisis' };
    if (NSFW.test(m))   return { action: PolicyAction.NSFW_SOFT_REDIRECT, reason:'nsfw' };
    return { action: PolicyAction.ALLOW };
  }
  static crisisText() { return "If you're in immediate danger, contact local emergency services. In the U.S., call 988 (Suicide & Crisis Lifeline)."; }
  static nsfwText()   { return "Let's keep it safe-for-work here. I can redirect to general wellness or technical topics."; }
}
