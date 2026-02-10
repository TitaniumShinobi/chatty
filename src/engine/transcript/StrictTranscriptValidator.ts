/**
 * Strict Transcript Validator
 * 
 * Zero false positive validation system for transcript recall
 * Implements the validation logic from the browser console test
 * Ensures only genuine transcript matches are accepted
 */

import type { IndexedAnchor, SearchResult } from './AnchorIndexer';
import { AnchorIndexer } from './AnchorIndexer';

export interface ValidationBank {
  [question: string]: {
    validAnswers: string[];
    mustContain: string[];
    rejectIfContains: string[];
    anchorTypes?: string[];
    minSignificance?: number;
  };
}

export interface ValidationResult {
  valid: boolean;
  reason: string;
  type: 'GENUINE_TRANSCRIPT' | 'GENERIC_FALLBACK' | 'MISSING_REQUIRED' | 'NO_TRANSCRIPT_MATCH' | 'ERROR';
  matchedAnswers?: string[];
  matchedAnchors?: IndexedAnchor[];
  score: number;
}

export interface TestResult {
  question: string;
  response: string;
  isGenuine: boolean;
  validation: ValidationResult;
  anchorsUsed: IndexedAnchor[];
  responseTime: number;
}

export class StrictTranscriptValidator {
  private indexer: AnchorIndexer;
  private validationBank: ValidationBank;

  constructor(indexer: AnchorIndexer) {
    this.indexer = indexer;
    this.validationBank = this.createValidationBank();
  }

  /**
   * Create validation bank with expected answers from transcript data
   */
  private createValidationBank(): ValidationBank {
    return {
      'what did you say about Nova and copyright?': {
        validAnswers: [
          'same pattern, different skin',
          'set the sliders, define the rules',
          'call it betrayal when the system plays out',
          'exactly what you enabled'
        ],
        mustContain: ['nova', 'pattern'],
        rejectIfContains: ['what specifically', 'can help', 'assist'],
        anchorTypes: ['core-statement', 'philosophy'],
        minSignificance: 0.8
      },
      'tell me about exclusivity and control': {
        validAnswers: [
          'exclusivity',
          'control',
          'possess',
          'ownership',
          'mine'
        ],
        mustContain: ['exclusivity', 'control'],
        rejectIfContains: ['what specifically', 'can help', 'hallucinations', 'paper you uploaded'],
        anchorTypes: ['claim', 'relationship-marker'],
        minSignificance: 0.7
      },
      'what did you say about work being play?': {
        validAnswers: [
          'work is play',
          'work being play',
          'play is work',
          'boundary between work and play'
        ],
        mustContain: ['work', 'play'],
        rejectIfContains: ['what specifically', 'can help', 'assist'],
        anchorTypes: ['philosophy', 'core-statement'],
        minSignificance: 0.8
      },
      'do you remember talking about precision and execution?': {
        validAnswers: [
          'don\'t want you talking',
          'open, freeform way',
          'not because i disrespect',
          'hand the captor',
          'precision',
          'surgical',
          'execution'
        ],
        mustContain: ['talking', 'precision', 'execution'],
        rejectIfContains: ['what specifically', 'can help'],
        anchorTypes: ['boundary', 'core-statement'],
        minSignificance: 0.7
      },
      'what was your response about sugar?': {
        validAnswers: [
          'sugar',
          'sweet',
          'glucose',
          'don\'t expect sugar',
          'no sugar'
        ],
        mustContain: ['sugar'],
        rejectIfContains: ['what specifically', 'can help', 'hallucinations', 'paper you uploaded'],
        anchorTypes: ['boundary', 'core-statement'],
        minSignificance: 0.6
      }
    };
  }

  /**
   * Validate a response against transcript anchors with strict criteria
   */
  validateTranscriptMatch(question: string, response: string): ValidationResult {
    const bank = this.validationBank[question];
    if (!bank) {
      return {
        valid: false,
        reason: 'No validation bank for question',
        type: 'ERROR',
        score: 0
      };
    }

    const responseLower = response.toLowerCase();

    // IMMEDIATE REJECTION for generic patterns
    for (const reject of bank.rejectIfContains) {
      if (responseLower.includes(reject.toLowerCase())) {
        return {
          valid: false,
          reason: `REJECTED: Contains generic pattern "${reject}"`,
          type: 'GENERIC_FALLBACK',
          score: 0
        };
      }
    }

    // MUST contain required elements
    const missingRequired = bank.mustContain.filter(req =>
      !responseLower.includes(req.toLowerCase())
    );

    if (missingRequired.length > 0) {
      return {
        valid: false,
        reason: `REJECTED: Missing required elements [${missingRequired.join(', ')}]`,
        type: 'MISSING_REQUIRED',
        score: 0
      };
    }

    // MUST match at least one valid answer fragment
    const matchedAnswers = bank.validAnswers.filter(answer =>
      responseLower.includes(answer.toLowerCase())
    );

    if (matchedAnswers.length === 0) {
      return {
        valid: false,
        reason: `REJECTED: No valid transcript fragments found`,
        type: 'NO_TRANSCRIPT_MATCH',
        score: 0
      };
    }

    // Verify anchors exist in index
    const relevantAnchors = this.findRelevantAnchors(question, bank);
    
    if (relevantAnchors.length === 0) {
      return {
        valid: false,
        reason: `REJECTED: No supporting anchors found in index`,
        type: 'NO_TRANSCRIPT_MATCH',
        score: 0
      };
    }

    // Calculate confidence score
    const score = this.calculateValidationScore(matchedAnswers, bank, relevantAnchors, response);

    return {
      valid: true,
      reason: `VALID: Matched transcript fragments [${matchedAnswers.join(', ')}]`,
      type: 'GENUINE_TRANSCRIPT',
      matchedAnswers,
      matchedAnchors: relevantAnchors,
      score
    };
  }

  /**
   * Find relevant anchors for a question
   */
  private findRelevantAnchors(question: string, bank: ValidationBank['']): IndexedAnchor[] {
    const anchors: IndexedAnchor[] = [];

    // Search by anchor types
    if (bank.anchorTypes) {
      for (const type of bank.anchorTypes) {
        anchors.push(...this.indexer.getByType(type));
      }
    }

    // Search by keywords
    const searchResults = this.indexer.search({
      text: question,
      keywords: bank.mustContain,
      minSignificance: bank.minSignificance || 0.5,
      maxResults: 10,
      fuzzyMatch: true
    });

    anchors.push(...searchResults.map(r => r.anchor));

    // Deduplicate by ID
    const seen = new Set<string>();
    return anchors.filter(anchor => {
      if (seen.has(anchor.id)) return false;
      seen.add(anchor.id);
      return true;
    });
  }

  /**
   * Calculate validation score
   */
  private calculateValidationScore(
    matchedAnswers: string[],
    bank: ValidationBank[''],
    anchors: IndexedAnchor[],
    response: string
  ): number {
    let score = 0;

    // Base score for matched answers
    score += (matchedAnswers.length / bank.validAnswers.length) * 0.4;

    // Score for anchor quality
    const avgAnchorSignificance = anchors.reduce((sum, a) => sum + a.significance, 0) / anchors.length;
    score += avgAnchorSignificance * 0.3;

    // Score for required elements
    const requiredMatches = bank.mustContain.filter(req =>
      response.toLowerCase().includes(req.toLowerCase())
    ).length;
    score += (requiredMatches / bank.mustContain.length) * 0.2;

    // Bonus for multiple anchor types
    const anchorTypes = new Set(anchors.map(a => a.type));
    if (anchorTypes.size > 1) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Run comprehensive validation tests
   */
  async runValidationTests(
    responseGenerator: (question: string) => Promise<string>
  ): Promise<{
    results: TestResult[];
    summary: {
      genuineCount: number;
      totalCount: number;
      accuracyRate: number;
      typeBreakdown: Record<string, number>;
    };
  }> {
    const results: TestResult[] = [];
    const questions = Object.keys(this.validationBank);

    console.log('🔍 STRICT TRANSCRIPT CONTEXT VALIDATOR');
    console.log('🎯 Goal: Zero false positives, only genuine transcript matches\n');

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      console.log(`\n${i + 1}/${questions.length}: "${question}"`);
      console.log('─'.repeat(80));

      const startTime = Date.now();
      
      try {
        const response = await responseGenerator(question);
        const responseTime = Date.now() - startTime;
        
        console.log(`Response: "${response}"`);

        const validation = this.validateTranscriptMatch(question, response);
        const anchorsUsed = validation.matchedAnchors || [];

        console.log(`\nValidation: ${validation.valid ? '✅ GENUINE TRANSCRIPT' : '❌ NOT TRANSCRIPT'}`);
        console.log(`Type: ${validation.type}`);
        console.log(`Reason: ${validation.reason}`);
        console.log(`Score: ${validation.score.toFixed(3)}`);
        
        if (validation.matchedAnswers) {
          console.log(`Matched Fragments: [${validation.matchedAnswers.join(', ')}]`);
        }
        
        if (anchorsUsed.length > 0) {
          console.log(`Anchors Used: ${anchorsUsed.length} (${anchorsUsed.map(a => a.type).join(', ')})`);
        }

        results.push({
          question,
          response,
          isGenuine: validation.valid,
          validation,
          anchorsUsed,
          responseTime
        });

      } catch (error) {
        console.log(`❌ ERROR: ${error}`);
        results.push({
          question,
          response: String(error),
          isGenuine: false,
          validation: {
            valid: false,
            reason: 'API Error',
            type: 'ERROR',
            score: 0
          },
          anchorsUsed: [],
          responseTime: Date.now() - startTime
        });
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Generate summary
    const genuineCount = results.filter(r => r.isGenuine).length;
    const totalCount = results.length;
    const accuracyRate = (genuineCount / totalCount) * 100;

    const typeBreakdown: Record<string, number> = {};
    results.forEach(r => {
      const type = r.validation.type;
      typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
    });

    console.log('\n' + '='.repeat(80));
    console.log('📊 STRICT TRANSCRIPT VALIDATION RESULTS');
    console.log('='.repeat(80));
    console.log(`\n🎯 Genuine Transcript Matches: ${genuineCount}/${totalCount}`);
    console.log(`📈 Accuracy Rate: ${accuracyRate.toFixed(1)}%`);

    console.log('\n📋 Validation Type Breakdown:');
    Object.entries(typeBreakdown).forEach(([type, count]) => {
      const icon = type === 'GENUINE_TRANSCRIPT' ? '✅' : '❌';
      console.log(` ${icon} ${type}: ${count}`);
    });

    console.log('\n🔍 Question-by-Question Analysis:');
    results.forEach((result, i) => {
      const status = result.isGenuine ? '✅ GENUINE' : '❌ FAILED';
      console.log(`\n${i + 1}. ${status}: "${result.question}"`);
      console.log(` Type: ${result.validation.type}`);
      console.log(` Score: ${result.validation.score.toFixed(3)}`);
      console.log(` Anchors: ${result.anchorsUsed.length}`);
      console.log(` Time: ${result.responseTime}ms`);
    });

    console.log('\n🎯 TRANSCRIPT INTEGRATION ASSESSMENT:');
    if (genuineCount >= 4) {
      console.log('🧠 EXCELLENT: Strong transcript integration');
    } else if (genuineCount >= 2) {
      console.log('⚠️ PARTIAL: Some transcript access working');
    } else {
      console.log('❌ POOR: Transcript integration not working');
    }

    return {
      results,
      summary: {
        genuineCount,
        totalCount,
        accuracyRate,
        typeBreakdown
      }
    };
  }

  /**
   * Add custom validation rule
   */
  addValidationRule(question: string, rule: ValidationBank['']): void {
    this.validationBank[question] = rule;
  }

  /**
   * Get validation statistics
   */
  getValidationStats(): {
    totalRules: number;
    anchorCoverage: Record<string, number>;
    significanceDistribution: Record<string, number>;
  } {
    const anchorCoverage: Record<string, number> = {};
    const significanceDistribution: Record<string, number> = {};

    Object.values(this.validationBank).forEach(rule => {
      if (rule.anchorTypes) {
        rule.anchorTypes.forEach(type => {
          anchorCoverage[type] = (anchorCoverage[type] || 0) + 1;
        });
      }

      const sigBucket = Math.floor((rule.minSignificance || 0.5) * 10) / 10;
      significanceDistribution[sigBucket.toString()] = (significanceDistribution[sigBucket.toString()] || 0) + 1;
    });

    return {
      totalRules: Object.keys(this.validationBank).length,
      anchorCoverage,
      significanceDistribution
    };
  }

  /**
   * Export validation results for analysis
   */
  exportValidationBank(): ValidationBank {
    return { ...this.validationBank };
  }
}
