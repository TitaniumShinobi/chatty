import type { CharacterConsistencyViolation, CharacterContext } from './types';

const META_AI_PATTERNS = [
  /i['’`]?m\s+(an\s+)?(ai|artificial\s+intelligence|assistant|language\s+model|bot)/gi,
  /\bas\s+(an\s+)?(ai|assistant|chatbot|language\s+model)\b/gi,
  /\b(i\s+am|i\s+was)\s+(designed|built)\s+as\s+(an\s+)?(ai|assistant)/gi,
  /\bi\s+don['’`]?t\s+have\s+(feelings|a\s+body|personal\s+experiences)\b/gi
];

export interface CharacterFilterResult {
  content: string;
  violations: CharacterConsistencyViolation[];
}

export class CharacterResponseFilter {
  enforceCharacterVoice(response: string, context: CharacterContext): CharacterFilterResult {
    let content = response;
    const violations: CharacterConsistencyViolation[] = [];

    META_AI_PATTERNS.forEach(pattern => {
      const matcher = new RegExp(pattern, pattern.flags);
      const hasMatch = matcher.test(content);
      matcher.lastIndex = 0;
      if (hasMatch) {
        violations.push({
          type: 'meta-reference',
          message: 'Meta-level AI reference detected and replaced',
          evidence: this.extractSnippet(content, matcher),
          severity: 'medium'
        });
        content = content.replace(matcher, context.metaQuestionResponse);
      }
    });

    if (!this.matchesSpeechPattern(content, context)) {
      violations.push({
        type: 'speech-pattern',
        message: 'Response drifted away from declared speech patterns',
        severity: 'low'
      });
    }

    return { content, violations };
  }

  private matchesSpeechPattern(response: string, context: CharacterContext): boolean {
    if (!context.speechPatterns.length) {
      return true;
    }
    const firstSentence = response.split(/[.!?]/)[0] || '';
    return firstSentence.length > 0 && firstSentence.length <= 280;
  }

  private extractSnippet(content: string, pattern: RegExp): string {
    const snippetMatcher = new RegExp(pattern.source, pattern.flags.replace('g', ''));
    const match = snippetMatcher.exec(content);
    if (!match) {
      return '';
    }
    const start = Math.max(match.index - 24, 0);
    const end = Math.min(match.index + match[0].length + 24, content.length);
    return content.slice(start, end);
  }
}
