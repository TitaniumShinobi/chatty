// SymbolicParser.ts
// Lightweight rule-based parser that converts natural-language clauses
// into (subject, predicate, object) triples suitable for symbolic reasoning.
// No external NLP library – uses regex heuristics.

export interface Triple {
  subject: string;
  predicate: string;
  object: string;
  confidence: number; // 0–1 heuristic confidence
}

/**
 * SymbolicParser
 * Examples:
 *  "The moon orbits the Earth" -> {subject:"moon", predicate:"orbits", object:"Earth"}
 *  "Alice likes Bob"           -> {subject:"Alice", predicate:"likes",  object:"Bob"}
 *  "Water is wet"             -> {subject:"Water", predicate:"is",    object:"wet"}
 */
export class SymbolicParser {
  private patterns: Array<{ regex: RegExp; groups: [number, number, number] }>; // subject, predicate, object

  constructor() {
    // Patterns are evaluated in order; groups array specifies capture group indexes.
    this.patterns = [
      // X is Y / X are Y
      { regex: /(\b[A-Z][\w\s]*?)\s+(is|are|was|were)\s+([a-zA-Z][\w\s]*?)(\.|$)/i, groups: [1, 2, 3] },
      // X has Y
      { regex: /(\b[A-Z][\w\s]*?)\s+(has|have|had)\s+([a-zA-Z][\w\s]*?)(\.|$)/i, groups: [1, 2, 3] },
      // X likes Y / X loves Y
      { regex: /(\b[A-Z][\w\s]*?)\s+(likes?|loves?)\s+([A-Z][\w\s]*?)(\.|$)/i, groups: [1, 2, 3] },
      // X <verb> the Y (e.g., orbits, surrounds)
      { regex: /(\b[A-Z][\w\s]*?)\s+([a-z]+s)\s+(?:the\s+)?([A-Z][\w\s]*?)(\.|$)/, groups: [1, 2, 3] },
    ];
  }

  /** Parse input into triples */
  parse(text: string): Triple[] {
    const triples: Triple[] = [];

    for (const pattern of this.patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        const [sIdx, pIdx, oIdx] = pattern.groups;
        const subj = match[sIdx].trim();
        const pred = match[pIdx].trim().toLowerCase();
        const obj = match[oIdx].trim();
        triples.push({ subject: subj, predicate: pred, object: obj, confidence: 0.8 });
      }
    }

    // If nothing matched, return an empty array
    return triples;
  }
}
