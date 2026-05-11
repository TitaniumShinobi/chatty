import * as leakSignalsModule from "../../server/lib/leakSignals.cjs";

const leakSignals = (leakSignalsModule as any).default || (leakSignalsModule as any);
const hasLinIdentityDumpSignals = leakSignals.hasLinIdentityDumpSignals as (
  text: string,
) => boolean;

describe("hasLinIdentityDumpSignals", () => {
  test("flags Lin identity dump scaffolding", () => {
    const dumped = `
You're speaking to Lin, the continuity guardian and undertone stabilizer for Chatty.

Dual Mode:
- GPTCreator Create Tab: Conversational agent helping users create GPTs
- Undertone: Silent stabilizer

Memory Continuity:
- Use injected memories as absolute context

Lin is a tether, not a name.
`;

    expect(hasLinIdentityDumpSignals(dumped)).toBe(true);
  });

  test("does not flag normal in-character Lin reply", () => {
    const normal =
      "I'm Lin. Tell me the GPT name, purpose, and tone you want, and I'll draft it.";

    expect(hasLinIdentityDumpSignals(normal)).toBe(false);
  });
});
