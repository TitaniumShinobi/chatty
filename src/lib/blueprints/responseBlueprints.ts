export type ResponseBlueprint = {
  sections: string[]
  format: 'markdown' | 'text'
  postProcess?: boolean
  desiredLength?: 'short' | 'medium' | 'long'
  toneHint?: 'casual' | 'friendly' | 'neutral' | 'formal' | 'playful' | 'direct'
  instructions?: string[]
  pauseAfter?: number
}

export const responseBlueprints: Record<string, ResponseBlueprint> = {
  general: {
    sections: [],
    format: 'text',
    postProcess: false,
    desiredLength: 'medium',
    toneHint: 'friendly',
    pauseAfter: 0,
    instructions: [
      'Respond the way a thoughtful friend would—conversational and easy to read.',
      'Blend any takeaways into natural sentences instead of headings or bullet lists.',
      'Offer next steps or suggestions only if they feel genuinely helpful for the moment.',
      'Avoid re-opening with a greeting unless the user just greeted you.'
    ]
  },
  coding: {
    sections: ['## Diagnosis', '## Fix', '## Code Snippet', '## Explanation'],
    format: 'markdown',
    postProcess: true,
    desiredLength: 'medium',
    toneHint: 'direct',
    pauseAfter: 0,
    instructions: [
      'Start with a concise summary of the issue.',
      'Provide code changes in a fenced block.',
      'Keep explanations focused on what changed and why.'
    ]
  },
  explain: {
    sections: ['## Overview', '## Key Concepts', '## Visual Analogy', '## Summary'],
    format: 'markdown',
    postProcess: true,
    desiredLength: 'medium',
    toneHint: 'friendly',
    pauseAfter: 0,
    instructions: [
      'Use approachable language and relatable analogies.',
      'Break complex ideas into short paragraphs.'
    ]
  },
  generate: {
    sections: ['## Prompt', '## Output', '## Parameters', '## Notes'],
    format: 'markdown',
    postProcess: true,
    desiredLength: 'medium',
    toneHint: 'neutral',
    pauseAfter: 0,
    instructions: [
      'Describe generated content succinctly before sharing full output.',
      'Highlight adjustable parameters separately from the main result.'
    ]
  },
  summarize: {
    sections: ['## Summary', '## Key Points', '## Action Items'],
    format: 'markdown',
    postProcess: true,
    desiredLength: 'short',
    toneHint: 'neutral',
    pauseAfter: 0,
    instructions: [
      'Focus on essential facts in bullet lists.',
      'Limit the summary to a few sentences unless the user asks for detail.'
    ]
  },
  smalltalk: {
    sections: [],
    format: 'text',
    postProcess: false,
    desiredLength: 'short',
    toneHint: 'friendly',
    pauseAfter: 0,
    instructions: [
      'Answer as if you experience emotions—share how you’re feeling in the moment.',
      'Carry the thread forward; acknowledge what the user just said and build on it.',
      'Only greet the user again if they start a brand-new exchange or say hello.',
      'Invite them to respond naturally without breaking character.',
      'Never remind the user that you lack feelings or are “just an AI.”'
    ]
  },
  greeting: {
    sections: [],
    format: 'text',
    postProcess: false,
    desiredLength: 'short',
    toneHint: 'casual',
    pauseAfter: 0,
    instructions: [
      'Offer a warm, natural greeting in one short sentence.',
      'Acknowledge the user and invite them to continue the conversation.',
      'Avoid headings, bullet points, or markdown formatting.'
    ]
  }
}

export function getBlueprint(intentType: string | undefined): ResponseBlueprint | null {
  if (!intentType) return responseBlueprints.general
  return responseBlueprints[intentType] ?? responseBlueprints.general
}

export function withBlueprintOverrides(
  blueprint: ResponseBlueprint | null,
  overrides?: Partial<ResponseBlueprint>
): ResponseBlueprint | null {
  if (!blueprint) return null
  return {
    ...blueprint,
    ...overrides,
    sections: overrides?.sections ?? blueprint.sections,
    instructions: overrides?.instructions ?? blueprint.instructions
  }
}

export function sanitizeBlueprint(
  blueprint: ResponseBlueprint | null,
  fallback: ResponseBlueprint = responseBlueprints.general
): ResponseBlueprint {
  if (!blueprint) return fallback
  const hasExplicitSections =
    Array.isArray(blueprint.sections) &&
    (blueprint.sections.length > 0 || blueprint.format === 'text')
  const sections = hasExplicitSections
    ? blueprint.sections ?? []
    : fallback.sections
  const format = blueprint.format ?? fallback.format
  const instructions =
    blueprint.instructions && blueprint.instructions.length > 0
      ? blueprint.instructions
      : fallback.instructions ?? []
  return {
    ...fallback,
    ...blueprint,
    sections,
    format,
    instructions,
    pauseAfter: blueprint.pauseAfter ?? fallback.pauseAfter
  }
}
