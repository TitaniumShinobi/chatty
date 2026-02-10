
import { VVAULTConversationManager } from '../vvaultConversationManager';

describe('VVAULTConversationManager Logging', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeAll(() => {
        originalEnv = { ...process.env };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset instance to clean state
        (VVAULTConversationManager as any).instance = null;
    });

    it('should not log debug messages by default', () => {
        delete process.env.VVAULT_DEBUG_LOG;
        // Force new instance
        const manager = new (VVAULTConversationManager as any)();

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => { });

        // Access private logDebug
        (manager as any).logDebug('test debug message');

        expect(consoleSpy).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('should log debug messages when VVAULT_DEBUG_LOG is true', () => {
        process.env.VVAULT_DEBUG_LOG = 'true';
        // Force new instance
        const manager = new (VVAULTConversationManager as any)();

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => { });

        (manager as any).logDebug('test debug message');

        expect(consoleSpy).toHaveBeenCalledWith('test debug message');
        consoleSpy.mockRestore();
    });

    it('isBrowserEnv return false in test (node) environment', () => {
        const manager = VVAULTConversationManager.getInstance();
        expect((manager as any).isBrowserEnv()).toBe(false);
    });
});
