
// Ensure we don't import the module statically
// import { OptimizedZenProcessor } from '../optimizedZen';

// Mock dependencies (Node version)
const mockRunSeat = jest.fn();
jest.mock('../seatRunner', () => ({
    runSeat: (...args: any[]) => mockRunSeat(...args),
    loadSeatConfig: () => ({
        coding: { tag: 'deepseek-coder' },
        creative: { tag: 'mistral' },
        smalltalk: { tag: 'phi3' }
    }),
    getSeatRole: (seat: string) => seat
}));

describe('OptimizedZenProcessor', () => {
    let OptimizedZenProcessor: any;
    let processor: any;
    let mockBrain: any;

    beforeEach(() => {
        jest.resetModules(); // Reset cache to ensure mocks apply

        // Mock the browser runner explicitly before loading module
        jest.mock('../../lib/browserSeatRunner', () => ({
            runSeat: jest.fn(),
            loadSeatConfig: jest.fn(),
            getSeatRole: jest.fn()
        }));

        // Re-mock seatRunner because resetModules cleared it
        jest.mock('../seatRunner', () => ({
            runSeat: (...args: any[]) => mockRunSeat(...args),
            loadSeatConfig: () => ({
                coding: { tag: 'deepseek-coder' },
                creative: { tag: 'mistral' },
                smalltalk: { tag: 'phi3' }
            }),
            getSeatRole: (seat: string) => seat
        }));

        // Mock other dependencies that use .js extensions causing resolution issues
        jest.mock('../toneModulation.js', () => ({
            ToneModulator: jest.fn().mockImplementation(() => ({
                modulatePrompt: jest.fn().mockImplementation((p) => p),
                currentPersona: 'default'
            })),
            LLM_PERSONAS: {},
            ToneModulationConfig: {}
        }), { virtual: true });

        jest.mock('../memory/MemoryStore.js', () => ({ MemoryStore: jest.fn() }), { virtual: true });
        jest.mock('../memory/PersonaBrain.js', () => ({ PersonaBrain: jest.fn() }), { virtual: true });

        // Now require the module
        const mod = require('../optimizedZen');
        OptimizedZenProcessor = mod.OptimizedZenProcessor;

        mockBrain = {
            remember: jest.fn(),
            getContext: jest.fn().mockReturnValue({}),
        };

        // Subclass for testing to override performSeatRequest
        class TestableZenProcessor extends OptimizedZenProcessor {
            public callHistory: any[] = [];
            public forceFailure: string | null = null;

            protected async performSeatRequest(opts: any): Promise<string> {
                this.callHistory.push(opts);
                if (this.forceFailure === opts.seat) {
                    throw new Error("Simulated failure");
                }
                if (opts.prompt.includes('Synthesize')) return "Final Synthesized Response";
                return `${opts.seat} response`;
            }
        }

        processor = new TestableZenProcessor(mockBrain, {
            skipOllamaCheck: true,
            enableAdaptivePruning: false,
            enableFastSummary: false,
            timeoutMs: 5000
        });

        // Stub out identity loading
        processor.loadZenIdentity = jest.fn().mockResolvedValue(true);

        mockRunSeat.mockClear();
    });

    it('runs strict 3-seat parallel flow', async () => {
        const result = await processor.processMessage(
            "How do I code binary search?",
            [],
            "test-user"
        );

        const seatsCalled = processor.callHistory.map((c: any) => c.seat);
        expect(seatsCalled).toContain('coding');
        expect(seatsCalled).toContain('creative');
        expect(seatsCalled).toContain('smalltalk');

        const synthCall = processor.callHistory.find((c: any) =>
            c.seat === 'smalltalk' && c.prompt.includes('Synthesize')
        );
        expect(synthCall).toBeTruthy();
        expect(synthCall.prompt).toContain('### Coding Expert\ncoding response');

        expect(result.response).toBe("Final Synthesized Response");
    });

    it('injects identity correctly', async () => {
        await processor.processMessage(
            "Hi",
            [],
            "test-user",
            { prompt: "I am Zen", conditioning: "Be zen" }
        );

        const synthCall = processor.callHistory.find((c: any) =>
            c.seat === 'smalltalk' && c.prompt.includes('Synthesize')
        );

        expect(synthCall.prompt).toContain("I am Zen");
    });

    it('handles seat failure gracefully', async () => {
        processor.forceFailure = 'coding';
        await processor.processMessage("Help", [], "test-user");

        const synthCall = processor.callHistory.find((c: any) =>
            c.prompt.includes('Synthesize')
        );
        expect(synthCall.prompt).toContain("### Coding Expert\n[coding expert failed to respond]");
    });
});
