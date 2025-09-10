import { R } from "./render";
import { lexicon as lex } from "../data/lexicon";

export function buildPrompt_QA(topicId: number) {
  return R(
    { join: [lex.tokens.qaReady] },
    { br: true },
    // minimal, still derived from ids:
    { join: [/* you can add other ids here */] }
  );
}
