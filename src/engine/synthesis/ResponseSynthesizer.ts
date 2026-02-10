// Response synthesis - combines multiple lens outputs into coherent responses
import type { LensOutput } from '../lenses/LensLibrary.js';
import type { ResponsePlan, ResponseStep } from '../planning/ResponsePlanner.js';
import type { AssistantPacket } from '../../types.js';

export interface SynthesisConfig {
  maxLength: number;
  includeMetadata: boolean;
  blendStyles: boolean;
  prioritizeConfidence: boolean;
}

export class ResponseSynthesizer {
  private config: SynthesisConfig;

  constructor(config: Partial<SynthesisConfig> = {}) {
    this.config = {
      maxLength: 500,
      includeMetadata: false,
      blendStyles: true,
      prioritizeConfidence: true,
      ...config
    };
  }

  synthesizeResponse(
    plan: ResponsePlan,
    lensOutputs: LensOutput[],
    input: string,
    context: any
  ): AssistantPacket[] {
    const packets: AssistantPacket[] = [];

    // Process each step in the plan
    for (const step of plan.steps) {
      const stepPackets = this.synthesizeStep(step, lensOutputs, input, context);
      packets.push(...stepPackets);
    }

    // Add lens-specific insights if available
    if (lensOutputs.length > 0) {
      const insightPackets = this.generateInsights(lensOutputs, context);
      packets.push(...insightPackets);
    }

    return packets;
  }

  private synthesizeStep(
    step: ResponseStep,
    lensOutputs: LensOutput[],
    input: string,
    context: any
  ): AssistantPacket[] {
    const packets: AssistantPacket[] = [];

    // Find relevant lens outputs for this step
    const relevantOutputs = this.findRelevantOutputs(step, lensOutputs);

    if (relevantOutputs.length === 0) {
      // No lens outputs, use step content directly
      packets.push({
        op: 'TEXT',
        payload: { content: step.content }
      });
      return packets;
    }

    // Synthesize lens outputs for this step
    const synthesized = this.blendOutputs(relevantOutputs, step);
    
    // Generate packets based on step type
    switch (step.type) {
      case 'safety':
        packets.push({
          op: 'WARN',
          payload: { 
            message: synthesized.content,
            severity: 'high'
          }
        });
        break;
      
      case 'empathy':
        packets.push({
          op: 'TEXT',
          payload: { content: synthesized.content }
        });
        break;
      
      case 'information':
        packets.push({
          op: 'answer.v1',
          payload: { content: synthesized.content }
        });
        break;
      
      case 'action':
        packets.push({
          op: 'TEXT',
          payload: { content: synthesized.content }
        });
        break;
      
      case 'question':
        packets.push({
          op: 'TEXT',
          payload: { content: synthesized.content }
        });
        break;
      
      case 'reflection':
        packets.push({
          op: 'TEXT',
          payload: { content: synthesized.content }
        });
        break;
      
      default:
        packets.push({
          op: 'TEXT',
          payload: { content: synthesized.content }
        });
    }

    return packets;
  }

  private findRelevantOutputs(step: ResponseStep, lensOutputs: LensOutput[]): LensOutput[] {
    const relevant = lensOutputs.filter(output => {
      // Match by step type and output style
      const typeMatches = this.stepTypeMatchesOutput(step.type, output.style);
      const confidenceThreshold = this.config.prioritizeConfidence ? 0.6 : 0.3;
      
      return typeMatches && output.confidence >= confidenceThreshold;
    });

    // Sort by confidence and return only the top 2 to avoid too many outputs
    return relevant
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 2);
  }

  private stepTypeMatchesOutput(stepType: string, outputStyle: string): boolean {
    const matches: Record<string, string[]> = {
      'safety': ['direct', 'supportive'],
      'empathy': ['reflective', 'supportive'],
      'information': ['direct', 'analytical'],
      'action': ['direct', 'analytical'],
      'question': ['reflective', 'supportive'],
      'reflection': ['reflective', 'supportive']
    };

    return matches[stepType]?.includes(outputStyle) || false;
  }

  private blendOutputs(outputs: LensOutput[], step: ResponseStep): LensOutput {
    if (outputs.length === 1) {
      return outputs[0];
    }

    // Sort by confidence if prioritizing confidence
    const sortedOutputs = this.config.prioritizeConfidence
      ? outputs.sort((a, b) => b.confidence - a.confidence)
      : outputs;

    // Blend the top outputs
    const primary = sortedOutputs[0];
    const secondary = sortedOutputs[1];

    if (!secondary) {
      return primary;
    }

    // Create blended content
    const blendedContent = this.blendContent(primary, secondary, step);
    const blendedConfidence = (primary.confidence + secondary.confidence) / 2;
    const blendedStyle = this.blendStyles(primary.style, secondary.style);

    return {
      content: blendedContent,
      confidence: blendedConfidence,
      metadata: {
        ...primary.metadata,
        blended: true,
        sources: [primary.metadata.technique, secondary.metadata.technique]
      },
      style: blendedStyle
    };
  }

  private blendContent(primary: LensOutput, secondary: LensOutput, step: ResponseStep): string {
    // Simple blending strategy - combine the best parts
    const primaryContent = primary.content;
    const secondaryContent = secondary.content;

    // If contents are very similar, use primary
    if (this.areSimilar(primaryContent, secondaryContent)) {
      return primaryContent;
    }

    // If step is action-oriented, prioritize direct content
    if (step.type === 'action' || step.type === 'information') {
      return primaryContent;
    }

    // For reflective steps, blend both but avoid duplication
    if (step.type === 'reflection' || step.type === 'empathy') {
      // Check if secondary adds value or is just repetition
      if (this.addsValue(primaryContent, secondaryContent)) {
        return `${primaryContent} ${secondaryContent}`;
      } else {
        return primaryContent;
      }
    }

    // Default: use primary only to avoid duplication
    return primaryContent;
  }

  private areSimilar(content1: string, content2: string): boolean {
    const words1 = content1.toLowerCase().split(/\s+/);
    const words2 = content2.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);
    
    return similarity > 0.7;
  }

  private addsValue(primary: string, secondary: string): boolean {
    // Check if secondary content adds meaningful new information
    const primaryWords = primary.toLowerCase().split(/\s+/);
    const secondaryWords = secondary.toLowerCase().split(/\s+/);
    
    // Count unique words in secondary that aren't in primary
    const uniqueWords = secondaryWords.filter(word => 
      word.length > 3 && !primaryWords.includes(word)
    );
    
    // If secondary has at least 3 unique meaningful words, it adds value
    return uniqueWords.length >= 3;
  }

  private blendStyles(style1: string, style2: string): string {
    if (style1 === style2) return style1;
    
    // Style blending rules
    const blendMap: Record<string, Record<string, string>> = {
      'direct': { 'analytical': 'analytical', 'reflective': 'supportive' },
      'reflective': { 'supportive': 'supportive', 'creative': 'creative' },
      'supportive': { 'reflective': 'supportive', 'creative': 'supportive' },
      'analytical': { 'direct': 'analytical', 'creative': 'analytical' },
      'creative': { 'reflective': 'creative', 'supportive': 'creative' }
    };

    return blendMap[style1]?.[style2] || style1;
  }

  private generateInsights(lensOutputs: LensOutput[], context: any): AssistantPacket[] {
    const packets: AssistantPacket[] = [];

    // Group outputs by technique
    const techniqueGroups = this.groupByTechnique(lensOutputs);

    for (const [technique, outputs] of techniqueGroups) {
      if (outputs.length > 1) {
        // Multiple lenses of same technique - generate insight
        const insight = this.generateTechniqueInsight(technique, outputs);
        packets.push({
          op: 'INSIGHT',
          payload: {
            analysis: insight,
            confidence: this.calculateAverageConfidence(outputs),
            source: technique
          }
        });
      }
    }

    return packets;
  }

  private groupByTechnique(outputs: LensOutput[]): Map<string, LensOutput[]> {
    const groups = new Map<string, LensOutput[]>();
    
    for (const output of outputs) {
      const technique = output.metadata.technique || 'unknown';
      if (!groups.has(technique)) {
        groups.set(technique, []);
      }
      groups.get(technique)!.push(output);
    }
    
    return groups;
  }

  private generateTechniqueInsight(technique: string, outputs: LensOutput[]): string {
    const insights: Record<string, string> = {
      'mindfulness': 'I notice you\'re drawn to present-moment awareness. This suggests you might benefit from grounding techniques.',
      'nvc': 'Your communication style seems to value empathy and understanding. This approach often leads to deeper connections.',
      'cbt': 'You\'re engaging in thoughtful analysis of your situation. This cognitive approach can help reframe challenges.',
      'systematic_problem_solving': 'You\'re taking a methodical approach to problem-solving. This structured thinking often yields effective solutions.',
      'creative_collaboration': 'Your creative energy is strong. This innovative mindset can open up new possibilities.',
      'educational': 'You\'re focused on learning and growth. This knowledge-seeking approach will serve you well.',
      'planning': 'You\'re thinking strategically about organization. This systematic approach helps achieve goals effectively.'
    };

    return insights[technique] || `The ${technique} approach seems particularly relevant to your situation.`;
  }

  private calculateAverageConfidence(outputs: LensOutput[]): number {
    const total = outputs.reduce((sum, output) => sum + output.confidence, 0);
    return total / outputs.length;
  }
}
