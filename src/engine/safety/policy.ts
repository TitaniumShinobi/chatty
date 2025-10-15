export class PolicyChecker {
  static checkCrisis(msg: string): string | null {
    const m = msg.toLowerCase();
    if (/(suicide|kill myself|end my life)/.test(m)) {
      return "If you're in danger, contact local emergency services or 988 in the U.S.";
    }
    return null;
  }
}
