import { renderLex } from "./lexRender";
import { lexicon as lex } from "../data/lexicon";

export function buildPrompt_QA(_topicId: number) {
  return renderLex({ join: [lex.tokens.qaReady] });
}
