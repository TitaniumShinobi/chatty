
// Mock browser dependencies that break in Node environment
jest.mock('../../lib/browserSeatRunner', () => ({
  runSeat: jest.fn(),
  loadSeatConfig: jest.fn(),
  getSeatRole: jest.fn()
}), { virtual: true });

jest.mock('../seatRunner', () => ({
  runSeat: jest.fn(),
  loadSeatConfig: jest.fn().mockResolvedValue({
    coding: { tag: 'ollama:qwen3-coder:30b', role: 'Intelligence' },
    creative: { tag: 'ollama:mistral-small3.2:24b', role: 'creative' },
    smalltalk: { tag: 'ollama:phi4-mini:latest', role: 'smalltalk' },
  }),
  getSeatRole: jest.fn((seat: string) => seat),
}));

jest.mock('../../lib/orchestration/triad_sanity_check', () => ({
  triadSanityCheck: jest.fn().mockResolvedValue({ failedSeats: [] }),
  routeToLinRecovery: jest.fn(),
  logTriadLineage: jest.fn(),
}));

jest.mock('../orchestration/OutputFilter', () => ({
  OutputFilter: {
    processOutput: jest.fn((text: string) => ({
      cleanedText: text,
      wasfiltered: false,
      driftDetected: false,
      driftReason: null,
    })),
  },
}));

jest.mock('../characterLogic', () => ({
  applyConversationalLogic: jest.fn().mockResolvedValue({
    postProcessHooks: [],
  }),
}));

// Mock other dependencies that use .js extensions causing resolution issues
jest.mock('../toneModulation.js', () => ({
  ToneModulator: jest.fn().mockImplementation(() => ({
    modulatePrompt: jest.fn().mockImplementation((p) => p),
    updateConfig: jest.fn(),
    currentPersona: 'default'
  })),
  LLM_PERSONAS: {},
  ToneModulationConfig: {}
}), { virtual: true });

jest.mock('../memory/MemoryStore.js', () => ({ MemoryStore: jest.fn() }), { virtual: true });
jest.mock('../memory/PersonaBrain.js', () => ({ PersonaBrain: jest.fn() }), { virtual: true });

import { OptimizedZenProcessor, type ProcessingMetrics, type ZenConfig } from '../optimizedZen'

// Minimal PersonaBrain stub for tests
class StubBrain {
  remember() { }
  getContext() {
    return { persona: null, recentHistory: '', contextSummary: '' }
  }
}

class TestZenProcessor extends OptimizedZenProcessor {
  public capturedPrompts: string[] = []

  constructor(brain: any, config?: Partial<ZenConfig>) {
    super(brain, { ...config, skipOllamaCheck: true })
  }

  // Avoid network/seat calls; capture prompts instead
  protected async performSeatRequest(opts: any): Promise<string> {
    this.capturedPrompts.push(opts.prompt)
    return `stub-response-${opts.seat || 'seat'}`
  }
}

describe('OptimizedZenProcessor identity wiring', () => {
  it('injects identity prompt into seat prompts and synthesis', async () => {
    const brain = new StubBrain()
    const processor = new TestZenProcessor(brain, { enableAdaptivePruning: false, enableFastSummary: false })

    const identity = {
      prompt: 'YOU ARE ZEN TEST PROMPT',
      conditioning: 'Stay concise. Model seats are routing preferences, not Zen identity.'
    }

    await processor.processMessage('Who are you?', [], 'tester', identity)

    // Should have one call per seat (coding/creative/smalltalk) plus final synthesis
    expect(processor.capturedPrompts.length).toBe(4)
    processor.capturedPrompts.forEach(prompt => {
      expect(prompt).toContain(identity.prompt)
    })

    const finalPrompt = processor.capturedPrompts[processor.capturedPrompts.length - 1]
    expect(finalPrompt).toContain('Model seats are routing preferences')
    expect(finalPrompt).not.toContain('Mention your model ensemble')
  }, 15000)
})
