import type { CouncilPacket } from "./seatRunner.js";
import type { ContextFrame } from "../../brain/reasoner.js";

/**
 * Very naive blender – prefers seat that matches leading intent, otherwise returns
 * the first coding-seat answer (fallback) or joins responses with separators.
 */
export function blendCouncilResponses(
  packets: CouncilPacket[],
  intents: string[],
  ctx: Partial<ContextFrame> | undefined
): string {
  if (!packets.length) return "(no council output)";
  // Always use Phi-3 (smalltalk) as primary voice
  const base = packets.find(p => p.seat === "smalltalk");
  let result = base ? base.content : "";

  // Append specialist answers if they exist
  if (intents.includes("coding")) {
    const code = packets.find(p => p.seat === "coding");
    if (code) result += `\n\n—— Technical detail ———\n${code.content}`;
  }
  if (intents.includes("creative")) {
    const creative = packets.find(p => p.seat === "creative");
    if (creative) result += `\n\n—— Creative draft ———\n${creative.content}`;
  }

  return result.trim();
}
