/**
 * OutputFilter.ts
 * 
 * Filters final LLM output to strip "narrator leaks" and detect tone drift.
 * Ensures the model speaks AS the persona, not ABOUT the persona.
 */

export interface OutputAnalysis {
    cleanedText: string;
    wasfiltered: boolean;
    driftDetected: boolean;
    driftReason?: string;
}

export class OutputFilter {
    /**
     * Regex patterns that indicate the model has slipped into "Narrator Mode"
     * or "Assistant Mode" instead of being the character.
     */
    private static NARRATOR_PATTERNS = [
        // Meta-commentary about the user
        /^The user (is asking|seems|wants|understands).+/i,
        /^The user's (request|query|question).+/i,
        /^You understand.+/i,
        /^Awareness:.+/i,
        // Generation notes patterns (critical for Lin)
        /You understand (it's|that|the).+/i,
        /The user seems (interested|to want|to be).+/i,
        /Here's a response (that|which).+/i,
        /Here is the response (that|which).+/i,
        /Here's a response:/i,
        /Here is the response:/i,

        // Meta-commentary about the response
        /^Here is a (response|reply).+/i,
        /^Response:.+/i,
        /^Here's a quote:.+/i,

        // Internal thought leakage (if not properly tagged)
        /^I should respond by.+/i,
        /^My intent is to.+/i,
        // Additional generation note patterns
        /Here's how (you|I) (should|can) respond/i,
        /Here is how (you|I) (should|can) respond/i,
        /The (user|person) (seems|appears|looks) (interested|to want)/i
    ];

    /**
     * Patterns that indicate a fundamental break in persona (Tone Drift)
     * These trigger a retry, they cannot be simply stripped.
     */
    private static DRIFT_PATTERNS = [
        /As an AI,/i,
        /I don't have feelings/i,
        /I am a large language model/i,
        /I cannot (experience|feel)/i,
        // Generation notes that indicate complete break from persona
        /You understand (it'?s|that|the).+Here'?s? (?:a |the )?response/i,
        /The user seems.+Here'?s? (?:a |the )?response/i
    ];

    /**
     * Strip narrator commentary from the text.
     * Returns the clean text.
     */
    public static stripNarratorLeak(text: string): string {
        let cleanText = text.trim();

        // 1. Remove "Generation Notes" or "Pre-response" fluff
        // Example: "You understand the user constraints. Here is the response: Hello."
        // We want just "Hello."

        // First, check for common generation note patterns that span multiple sentences
        // Pattern: "You understand X. Here's a response that Y: [actual response]"
        const generationNotePattern = /(?:You understand|The user seems|Here'?s? (?:a |the )?response(?: that| which)?)[^.!?]*[.!?]\s*(?:Here'?s? (?:a |the )?response(?: that| which)?[^.!?]*[.!?]\s*)?/i;
        if (generationNotePattern.test(cleanText)) {
            // Find where the actual response starts (usually after a colon or quote)
            const colonIndex = cleanText.search(/:\s*["']?[A-Z]/);
            if (colonIndex > -1) {
                cleanText = cleanText.substring(colonIndex + 1).trim();
                // Remove leading quotes if present
                cleanText = cleanText.replace(/^["']/, '').replace(/["']$/, '');
            } else {
                // If no colon, try to find the first sentence that doesn't match meta patterns
                const sentences = cleanText.split(/(?<=[.!?])\s+/);
                const firstRealSentence = sentences.find(s => !this.isMetaPrefix(s.trim()));
                if (firstRealSentence) {
                    cleanText = sentences.slice(sentences.indexOf(firstRealSentence)).join(' ');
                }
            }
        }

        // Check for common prefixes and strip everything before the actual dialogue
        const colonSplit = cleanText.split(/:\s?"/);
        // Heuristic: If there's a colon and quote, maybe the first part is meta.
        // "Here is the response: "Hello there.""
        if (colonSplit.length > 1 && colonSplit[0].length < 100 && this.isMetaPrefix(colonSplit[0])) {
            // Return the content inside the quotes if possible, or just after the colon
            return cleanText.substring(cleanText.indexOf(':') + 1).replace(/^"/, '').replace(/"$/, '').trim();
        }

        // Line-based filtering
        const lines = cleanText.split('\n');
        const cleanLines = lines.filter(line => {
            const trimmed = line.trim();
            if (!trimmed) return true; // keep empty lines for formatting

            // If a line matches a narrator pattern, drop it
            return !this.NARRATOR_PATTERNS.some(p => p.test(trimmed));
        });

        cleanText = cleanLines.join('\n').trim();

        // Double check for "The user..." at absolute start if it wasn't caught by line split
        // (Sometimes models generate one big blob)
        for (const pattern of this.NARRATOR_PATTERNS) {
            if (pattern.test(cleanText)) {
                // If the WHOLE text matches (e.g. it's just meta analysis), we might have a problem.
                // But if it's a prefix, we try to strip it.
                // Simple heuristic: If it starts with meta, remove that sentence.
                const firstPunctuation = cleanText.search(/[.!?]/);
                if (firstPunctuation > -1) {
                    const firstSentence = cleanText.substring(0, firstPunctuation + 1);
                    if (pattern.test(firstSentence)) {
                        cleanText = cleanText.substring(firstPunctuation + 1).trim();
                    }
                }
            }
        }

        return cleanText;
    }

    private static isMetaPrefix(text: string): boolean {
        return this.NARRATOR_PATTERNS.some(p => p.test(text));
    }

    /**
     * Detect if the output has drifted significantly from persona.
     */
    public static detectToneDrift(text: string): { detected: boolean; reason?: string } {
        for (const pattern of this.DRIFT_PATTERNS) {
            if (pattern.test(text)) {
                return { detected: true, reason: `Matched drift pattern: ${pattern}` };
            }
        }
        return { detected: false };
    }

    /**
     * Main entry point: Process output
     */
    public static processOutput(text: string): OutputAnalysis {
        const original = text;
        let current = text;

        // 1. Check for fatal drift first
        const drift = this.detectToneDrift(current);
        if (drift.detected) {
            return {
                cleanedText: current,
                wasfiltered: false,
                driftDetected: true,
                driftReason: drift.reason
            };
        }

        // 2. Strip leaks
        current = this.stripNarratorLeak(current);

        return {
            cleanedText: current,
            wasfiltered: current !== original,
            driftDetected: false
        };
    }
}
