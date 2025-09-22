// src/engine/selfupdater/SelfLearner.ts
// Self-improving system for pattern extraction and skill acquisition

import { Pattern, Symbol } from '../parser/SymbolicParser';
import { Memory } from '../memory/PersonaBrain';
import { Goal, Strategy } from '../planning/RecursivePlanner';

export interface Skill {
  id: string;
  name: string;
  domain: 'language' | 'reasoning' | 'emotional' | 'creative' | 'social' | 'metacognitive';
  proficiency: number; // 0-1
  components: SkillComponent[];
  prerequisites: string[]; // Skill IDs
  applications: number; // Times used
  successRate: number;
  lastPracticed: number;
  growthRate: number;
}

export interface SkillComponent {
  type: 'pattern' | 'rule' | 'heuristic' | 'template';
  content: any;
  confidence: number;
  source: 'learned' | 'discovered' | 'taught' | 'inferred';
}

export interface LearningCycle {
  id: string;
  startTime: number;
  endTime?: number;
  focus: string;
  observations: Observation[];
  hypotheses: Hypothesis[];
  experiments: Experiment[];
  conclusions: Conclusion[];
}

export interface Observation {
  timestamp: number;
  context: string;
  pattern?: Pattern;
  outcome: 'success' | 'failure' | 'neutral';
  significance: number;
}

export interface Hypothesis {
  id: string;
  statement: string;
  confidence: number;
  evidence: string[];
  counterEvidence: string[];
  status: 'testing' | 'confirmed' | 'rejected' | 'refined';
}

export interface Experiment {
  hypothesis: string;
  method: string;
  expectedOutcome: string;
  actualOutcome?: string;
  success?: boolean;
}

export interface Conclusion {
  hypothesis: string;
  finding: string;
  confidence: number;
  implications: string[];
  newSkills?: string[];
}

export class SelfLearner {
  private skills: Map<string, Skill> = new Map();
  private learningCycles: Map<string, LearningCycle> = new Map();
  private activeCycle: LearningCycle | null = null;
  private knowledgeGraph: Map<string, Set<string>> = new Map(); // Skill relationships
  
  // Learning parameters
  private curiosityThreshold: number = 0.6;
  private confidenceThreshold: number = 0.7;
  private practiceDecay: number = 0.95;
  private minObservations: number = 3;
  
  constructor() {
    this.initializeBaseSkills();
  }
  
  private initializeBaseSkills(): void {
    // Foundation skills that enable learning
    const baseSkills: Skill[] = [
      {
        id: 'pattern_recognition',
        name: 'Pattern Recognition',
        domain: 'metacognitive',
        proficiency: 0.6,
        components: [
          {
            type: 'rule',
            content: 'Identify repeating sequences in input',
            confidence: 0.8,
            source: 'taught'
          }
        ],
        prerequisites: [],
        applications: 0,
        successRate: 0.7,
        lastPracticed: Date.now(),
        growthRate: 0.1
      },
      {
        id: 'hypothesis_formation',
        name: 'Hypothesis Formation',
        domain: 'reasoning',
        proficiency: 0.5,
        components: [
          {
            type: 'heuristic',
            content: 'If pattern repeats 3+ times, form hypothesis',
            confidence: 0.7,
            source: 'taught'
          }
        ],
        prerequisites: ['pattern_recognition'],
        applications: 0,
        successRate: 0.6,
        lastPracticed: Date.now(),
        growthRate: 0.15
      },
      {
        id: 'response_generation',
        name: 'Response Generation',
        domain: 'language',
        proficiency: 0.7,
        components: [
          {
            type: 'template',
            content: {
              greeting: ['Hello', 'Hi', 'Greetings'],
              acknowledgment: ['I understand', 'I see', 'Got it'],
              uncertainty: ['I\'m not sure', 'Let me think', 'That\'s interesting']
            },
            confidence: 0.9,
            source: 'taught'
          }
        ],
        prerequisites: [],
        applications: 0,
        successRate: 0.8,
        lastPracticed: Date.now(),
        growthRate: 0.05
      }
    ];
    
    for (const skill of baseSkills) {
      this.skills.set(skill.id, skill);
      this.knowledgeGraph.set(skill.id, new Set(skill.prerequisites));
    }
  }
  
  // Main learning loop
  learn(
    observations: Array<{ pattern: Pattern; memory: Memory; goal?: Goal }>,
    feedback?: { success: boolean; quality: number }
  ): void {
    // Start or continue learning cycle
    if (!this.activeCycle) {
      this.activeCycle = this.startLearningCycle('continuous_learning');
    }
    
    // Process observations
    for (const obs of observations) {
      this.processObservation(obs, feedback);
    }
    
    // Form hypotheses from observations
    if (this.activeCycle.observations.length >= this.minObservations) {
      this.formHypotheses();
    }
    
    // Test hypotheses
    this.testHypotheses();
    
    // Draw conclusions and create skills
    this.drawConclusions();
    
    // Practice existing skills
    this.practiceSkills(observations);
    
    // Meta-learning: learn about learning
    this.metaLearn();
  }
  
  private startLearningCycle(focus: string): LearningCycle {
    const cycle: LearningCycle = {
      id: this.generateCycleId(),
      startTime: Date.now(),
      focus,
      observations: [],
      hypotheses: [],
      experiments: [],
      conclusions: []
    };
    
    this.learningCycles.set(cycle.id, cycle);
    return cycle;
  }
  
  private processObservation(
    obs: { pattern: Pattern; memory: Memory; goal?: Goal },
    feedback?: { success: boolean; quality: number }
  ): void {
    if (!this.activeCycle) return;
    
    const significance = this.calculateSignificance(obs, feedback);
    
    const observation: Observation = {
      timestamp: Date.now(),
      context: obs.memory.content,
      pattern: obs.pattern,
      outcome: feedback ? (feedback.success ? 'success' : 'failure') : 'neutral',
      significance
    };
    
    this.activeCycle.observations.push(observation);
    
    // Learn from immediate feedback
    if (feedback) {
      this.reinforceRelatedSkills(obs.pattern, feedback);
    }
  }
  
  private calculateSignificance(
    obs: { pattern: Pattern; memory: Memory },
    feedback?: { success: boolean; quality: number }
  ): number {
    let significance = 0.5;
    
    // Novel patterns are significant
    if (obs.pattern.frequency === 1) {
      significance += 0.2;
    }
    
    // Important memories are significant
    significance += obs.memory.importance * 0.2;
    
    // Strong feedback is significant
    if (feedback) {
      significance += Math.abs(feedback.quality - 0.5) * 0.3;
    }
    
    return Math.min(1, significance);
  }
  
  private formHypotheses(): void {
    if (!this.activeCycle) return;
    
    // Group observations by pattern similarity
    const patternGroups = this.groupObservationsByPattern(this.activeCycle.observations);
    
    for (const [patternKey, observations] of patternGroups) {
      if (observations.length >= 2) {
        // Look for correlations
        const outcomes = observations.map(o => o.outcome);
        const successRate = outcomes.filter(o => o === 'success').length / outcomes.length;
        
        if (Math.abs(successRate - 0.5) > 0.3) {
          // Strong correlation found
          const hypothesis: Hypothesis = {
            id: this.generateHypothesisId(),
            statement: `Pattern "${patternKey}" leads to ${successRate > 0.5 ? 'positive' : 'negative'} outcomes`,
            confidence: Math.abs(successRate - 0.5),
            evidence: observations.filter(o => 
              (successRate > 0.5 && o.outcome === 'success') ||
              (successRate <= 0.5 && o.outcome === 'failure')
            ).map(o => o.context),
            counterEvidence: observations.filter(o => 
              (successRate > 0.5 && o.outcome !== 'success') ||
              (successRate <= 0.5 && o.outcome !== 'failure')
            ).map(o => o.context),
            status: 'testing'
          };
          
          this.activeCycle.hypotheses.push(hypothesis);
        }
      }
    }
    
    // Look for meta-patterns
    this.formMetaHypotheses();
  }
  
  private groupObservationsByPattern(observations: Observation[]): Map<string, Observation[]> {
    const groups = new Map<string, Observation[]>();
    
    for (const obs of observations) {
      if (obs.pattern) {
        const key = obs.pattern.symbols.map(s => `${s.type}:${s.value}`).join('|');
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(obs);
      }
    }
    
    return groups;
  }
  
  private formMetaHypotheses(): void {
    if (!this.activeCycle) return;
    
    // Hypothesis: Certain domains require specific skills
    const domainObservations = new Map<string, number>();
    const domainSuccesses = new Map<string, number>();
    
    for (const obs of this.activeCycle.observations) {
      if (obs.pattern) {
        const domain = this.identifyDomain(obs.pattern);
        domainObservations.set(domain, (domainObservations.get(domain) || 0) + 1);
        if (obs.outcome === 'success') {
          domainSuccesses.set(domain, (domainSuccesses.get(domain) || 0) + 1);
        }
      }
    }
    
    for (const [domain, count] of domainObservations) {
      const successCount = domainSuccesses.get(domain) || 0;
      const successRate = successCount / count;
      
      if (count >= 3 && successRate < 0.4) {
        this.activeCycle.hypotheses.push({
          id: this.generateHypothesisId(),
          statement: `Need to improve ${domain} skills`,
          confidence: 0.7,
          evidence: [`Low success rate: ${successRate.toFixed(2)}`],
          counterEvidence: [],
          status: 'testing'
        });
      }
    }
  }
  
  private identifyDomain(pattern: Pattern): string {
    const symbolTypes = pattern.symbols.map(s => s.type);
    
    if (symbolTypes.includes('emotion')) return 'emotional';
    if (symbolTypes.includes('action') && symbolTypes.includes('entity')) return 'reasoning';
    if (symbolTypes.filter(t => t === 'entity').length > 2) return 'social';
    if (symbolTypes.includes('concept')) return 'creative';
    
    return 'language';
  }
  
  private testHypotheses(): void {
    if (!this.activeCycle) return;
    
    for (const hypothesis of this.activeCycle.hypotheses) {
      if (hypothesis.status === 'testing') {
        const experiment: Experiment = {
          hypothesis: hypothesis.id,
          method: 'observe_correlation',
          expectedOutcome: hypothesis.statement
        };
        
        // Simple test: check if evidence outweighs counter-evidence significantly
        const evidenceRatio = hypothesis.evidence.length / 
          (hypothesis.evidence.length + hypothesis.counterEvidence.length);
        
        if (evidenceRatio > 0.7 && hypothesis.evidence.length >= 5) {
          experiment.actualOutcome = 'confirmed';
          experiment.success = true;
          hypothesis.status = 'confirmed';
          hypothesis.confidence = Math.min(0.9, hypothesis.confidence * 1.2);
        } else if (evidenceRatio < 0.3 && hypothesis.counterEvidence.length >= 5) {
          experiment.actualOutcome = 'rejected';
          experiment.success = false;
          hypothesis.status = 'rejected';
        } else {
          experiment.actualOutcome = 'needs_more_data';
          // Keep testing
        }
        
        this.activeCycle.experiments.push(experiment);
      }
    }
  }
  
  private drawConclusions(): void {
    if (!this.activeCycle) return;
    
    const confirmedHypotheses = this.activeCycle.hypotheses.filter(h => h.status === 'confirmed');
    
    for (const hypothesis of confirmedHypotheses) {
      const conclusion: Conclusion = {
        hypothesis: hypothesis.id,
        finding: hypothesis.statement,
        confidence: hypothesis.confidence,
        implications: this.deriveImplications(hypothesis),
        newSkills: []
      };
      
      // Create new skills from conclusions
      const newSkill = this.createSkillFromHypothesis(hypothesis);
      if (newSkill) {
        this.skills.set(newSkill.id, newSkill);
        conclusion.newSkills = [newSkill.id];
      }
      
      this.activeCycle.conclusions.push(conclusion);
    }
    
    // End cycle if we have drawn conclusions
    if (this.activeCycle.conclusions.length > 0) {
      this.activeCycle.endTime = Date.now();
      this.activeCycle = null;
    }
  }
  
  private deriveImplications(hypothesis: Hypothesis): string[] {
    const implications: string[] = [];
    
    if (hypothesis.statement.includes('leads to positive')) {
      implications.push('Should use this pattern more often');
      implications.push('Can build upon this success');
    } else if (hypothesis.statement.includes('leads to negative')) {
      implications.push('Should avoid or modify this pattern');
      implications.push('Need alternative approaches');
    }
    
    if (hypothesis.statement.includes('improve')) {
      implications.push('Focus learning efforts on this area');
      implications.push('Seek patterns in successful examples');
    }
    
    return implications;
  }
  
  private createSkillFromHypothesis(hypothesis: Hypothesis): Skill | null {
    // Extract skill components from hypothesis
    const patternMatch = hypothesis.statement.match(/Pattern "([^"]+)"/);
    if (!patternMatch) return null;
    
    const patternKey = patternMatch[1];
    const isPositive = hypothesis.statement.includes('positive');
    
    const skill: Skill = {
      id: `learned_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: `Handle ${patternKey} pattern`,
      domain: 'reasoning',
      proficiency: hypothesis.confidence * 0.7,
      components: [
        {
          type: 'pattern',
          content: patternKey,
          confidence: hypothesis.confidence,
          source: 'discovered'
        },
        {
          type: 'rule',
          content: isPositive ? `Use ${patternKey} for positive outcomes` : `Avoid ${patternKey}`,
          confidence: hypothesis.confidence,
          source: 'learned'
        }
      ],
      prerequisites: ['pattern_recognition'],
      applications: 0,
      successRate: isPositive ? 0.7 : 0.3,
      lastPracticed: Date.now(),
      growthRate: 0.2
    };
    
    return skill;
  }
  
  private practiceSkills(observations: Array<{ pattern: Pattern; memory: Memory }>): void {
    // Identify which skills were used
    const usedSkills = new Set<string>();
    
    for (const obs of observations) {
      for (const [skillId, skill] of this.skills) {
        if (this.skillApplies(skill, obs.pattern)) {
          usedSkills.add(skillId);
        }
      }
    }
    
    // Update skill proficiency
    for (const skillId of usedSkills) {
      const skill = this.skills.get(skillId)!;
      skill.applications++;
      skill.lastPracticed = Date.now();
      
      // Skill growth based on practice
      skill.proficiency = Math.min(1, skill.proficiency + skill.growthRate * 0.1);
    }
    
    // Decay unused skills
    this.decayUnusedSkills();
  }
  
  private skillApplies(skill: Skill, pattern: Pattern): boolean {
    for (const component of skill.components) {
      if (component.type === 'pattern') {
        const skillPattern = component.content as string;
        const patternKey = pattern.symbols.map(s => `${s.type}:${s.value}`).join('|');
        
        if (skillPattern === patternKey || patternKey.includes(skillPattern)) {
          return true;
        }
      }
    }
    return false;
  }
  
  private reinforceRelatedSkills(pattern: Pattern, feedback: { success: boolean; quality: number }): void {
    for (const [skillId, skill] of this.skills) {
      if (this.skillApplies(skill, pattern)) {
        // Update success rate
        const weight = 0.1;
        skill.successRate = skill.successRate * (1 - weight) + (feedback.success ? 1 : 0) * weight;
        
        // Adjust growth rate based on feedback
        if (feedback.success && feedback.quality > 0.7) {
          skill.growthRate = Math.min(0.3, skill.growthRate * 1.05);
        } else if (!feedback.success) {
          skill.growthRate = Math.max(0.05, skill.growthRate * 0.95);
        }
      }
    }
  }
  
  private decayUnusedSkills(): void {
    const now = Date.now();
    const decayPeriod = 1000 * 60 * 60 * 24; // 1 day
    
    for (const [_, skill] of this.skills) {
      const timeSinceUse = now - skill.lastPracticed;
      if (timeSinceUse > decayPeriod) {
        const periods = Math.floor(timeSinceUse / decayPeriod);
        skill.proficiency *= Math.pow(this.practiceDecay, periods);
      }
    }
  }
  
  private metaLearn(): void {
    // Learn about the learning process itself
    const recentCycles = Array.from(this.learningCycles.values())
      .filter(c => c.endTime && c.endTime > Date.now() - 1000 * 60 * 60)
      .slice(-5);
    
    if (recentCycles.length >= 3) {
      // Analyze learning effectiveness
      const avgConclusionsPerCycle = recentCycles.reduce((sum, c) => sum + c.conclusions.length, 0) / recentCycles.length;
      const avgConfidence = recentCycles.flatMap(c => c.conclusions)
        .reduce((sum, c) => sum + c.confidence, 0) / recentCycles.length;
      
      // Adjust learning parameters
      if (avgConclusionsPerCycle < 1) {
        // Not learning enough, be more curious
        this.curiosityThreshold = Math.max(0.4, this.curiosityThreshold - 0.05);
        this.minObservations = Math.max(2, this.minObservations - 1);
      } else if (avgConfidence < 0.6) {
        // Low confidence, need more evidence
        this.confidenceThreshold = Math.min(0.8, this.confidenceThreshold + 0.05);
        this.minObservations = Math.min(5, this.minObservations + 1);
      }
    }
  }
  
  // Public interface
  getSkills(domain?: Skill['domain']): Skill[] {
    const skills = Array.from(this.skills.values());
    
    if (domain) {
      return skills.filter(s => s.domain === domain);
    }
    
    return skills;
  }
  
  getSkillProficiency(skillId: string): number {
    return this.skills.get(skillId)?.proficiency || 0;
  }
  
  canLearnSkill(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) return false;
    
    // Check prerequisites
    for (const prereq of skill.prerequisites) {
      if (this.getSkillProficiency(prereq) < 0.5) {
        return false;
      }
    }
    
    return true;
  }
  
  getLearningSummary(): {
    totalSkills: number;
    averageProficiency: number;
    strongestDomain: string;
    recentLearning: string[];
    activeHypotheses: number;
  } {
    const skills = Array.from(this.skills.values());
    const domainProficiency = new Map<string, { total: number; count: number }>();
    
    for (const skill of skills) {
      const domain = domainProficiency.get(skill.domain) || { total: 0, count: 0 };
      domain.total += skill.proficiency;
      domain.count++;
      domainProficiency.set(skill.domain, domain);
    }
    
    let strongestDomain = 'none';
    let highestAvg = 0;
    
    for (const [domain, stats] of domainProficiency) {
      const avg = stats.total / stats.count;
      if (avg > highestAvg) {
        highestAvg = avg;
        strongestDomain = domain;
      }
    }
    
    const recentLearning = Array.from(this.learningCycles.values())
      .filter(c => c.conclusions.length > 0)
      .slice(-3)
      .flatMap(c => c.conclusions.map(con => con.finding));
    
    return {
      totalSkills: skills.length,
      averageProficiency: skills.reduce((sum, s) => sum + s.proficiency, 0) / skills.length,
      strongestDomain,
      recentLearning,
      activeHypotheses: this.activeCycle?.hypotheses.filter(h => h.status === 'testing').length || 0
    };
  }
  
  private generateCycleId(): string {
    return `cycle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateHypothesisId(): string {
    return `hyp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}