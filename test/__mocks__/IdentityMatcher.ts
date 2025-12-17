export class IdentityMatcher {
  constructor(_vvaultRoot?: string) {}
  matchIdentity() {
    return { constructId: 'zen-001', score: 1 };
  }
}
