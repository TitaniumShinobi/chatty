import { STR } from "./dict";

export type Seg = number | { join: number[] } | { br: true };

export function R(packetOrArray: any): string {
  // Handle packet objects from conversationAI
  if (packetOrArray && typeof packetOrArray === 'object' && 'op' in packetOrArray) {
    const op = packetOrArray.op;
    const text = STR[op];
    if (!text) {
      return `[MISSING:${op}]`;
    }
    // Replace placeholders with payload values
    return text.replace(/\{(\w+)\}/g, (_, key) => {
      return String(packetOrArray.payload?.[key] ?? '');
    });
  }
  
  // Handle arrays of segments (original functionality)
  const segs = Array.isArray(packetOrArray) ? packetOrArray : [packetOrArray];
  const out: string[] = [];
  for (const s of segs) {
    if (typeof s === "number") {
      const text = STR[s];
      if (!text) {
        // visible, non-prose fallback so you catch gaps
        out.push(`[MISSING:${s}]`);
      } else {
        out.push(text);
      }
    }
    else if ("join" in s) out.push(s.join.map(id => STR[id] ?? `⟂${id}`).join(" "));
    else if ("br" in s) out.push("\n");
  }
  return out.join(" ");
}
