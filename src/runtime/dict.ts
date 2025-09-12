import type { Op } from "../types";

// Opcode to template mapping for consistent Web/CLI rendering
export const DICT: Record<Op, string> = {
  "answer.v1": "{content}",
  "file.summary.v1": "📄 {fileName}: {summary}",
  "warn.v1": "⚠️ {message}",
  "error.v1": "❌ {message}",
};