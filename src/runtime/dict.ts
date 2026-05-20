import type { Op } from "../types";

// Opcode to template mapping for consistent Web/CLI rendering
export const DICT: Record<Op, string> = {
  "answer.v1": "{content}",
  "housing.results.v1": "{results}",
  "file.summary.v1": "📄 {fileName}: {summary}",
  "warn.v1": "⚠️ {message}",
  "error.v1": "❌ {message}",
  "thought.v1": "{notes}",
  "evidence.v1": "{items}",
  "plan.v1": "{steps}",
  "web.evidence.v1": "{results}",
  "story.v1": "{title}\n{content}",
  "insight.v1": "{note}",
};
