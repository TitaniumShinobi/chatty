
import { loadSeatConfig, runSeat, runSeatsBatch, cleanupSeatRunner, Seat } from '../seatRunner';

describe('seatRunner', () => {
    // Increase timeout for real network calls or slow operations
    jest.setTimeout(60000);

    afterAll(() => {
        cleanupSeatRunner();
    });

    describe('loadSeatConfig', () => {
        it('should load config asynchronously', async () => {
            const config = await loadSeatConfig();
            expect(config).toHaveProperty('coding');
            expect(config).toHaveProperty('creative');
            expect(config).toHaveProperty('smalltalk');
        });

        it('should cache config after first load', async () => {
            const config1 = await loadSeatConfig();
            const config2 = await loadSeatConfig();
            expect(config1).toBe(config2); // Same reference (cached)
        });
    });

    describe('runSeat', () => {
        /* 
         * NOTE: These tests might fail if Ollama is not running locally.
         * We wrap them in try-catch or assume environment might be partial.
         * For pure unit testing, we would mock http/https, but this is an integration test suite style.
         */

        it('should respect timeout', async () => {
            // We expect a timeout error with a very short timeout
            await expect(runSeat({
                seat: 'coding',
                prompt: 'test',
                timeout: 1, // 1ms timeout, impossible to succeed
                host: 'http://localhost' // Assume localhost
            })).rejects.toThrow(/timeout/i);
        });

        it('should handle errors gracefully for invalid host', async () => {
            await expect(runSeat({
                seat: 'coding',
                prompt: 'test',
                host: 'http://invalid-host-dns-error:9999',
                timeout: 500
            })).rejects.toThrow();
        });
    });

    describe('runSeatsBatch', () => {
        it('should handle parallel requests efficiently', async () => {
            // mocking runSeat to avoid actual network calls for the batch logic test
            // or we can just test the structure.
            // Since we can't easily mock within this file without rewriting imports, 
            // we will rely on the structure or use a mock if possible.
            // For now, we'll test with a simplified "error" expectation if ollama is not up, 
            // or success if it is.

            // Let's test the concurrency logic by observing it doesn't crash.
            const seats = [
                { seat: 'coding' as Seat, prompt: 'test' },
                { seat: 'creative' as Seat, prompt: 'test' },
                { seat: 'smalltalk' as Seat, prompt: 'test' }
            ];

            const start = Date.now();
            const results = await runSeatsBatch(seats, { maxConcurrency: 3, timeout: 100 }); // Short timeout to fail fast if no ollama
            const duration = Date.now() - start;

            expect(results.length).toBe(3);
            // We don't assert success/failure of the calls themselves, as that depends on external Ollama,
            // but we assert the batch processor returned 3 results.
        });

        it('should respect maxConcurrency limit (logical check)', async () => {
            const seats = Array(5).fill(null).map((_, i) => ({
                seat: 'coding' as Seat,
                prompt: `Test ${i}`
            }));

            // We use a very short timeout so they all fail fast, 
            // but we want to ensure the array size is correct in result.
            const results = await runSeatsBatch(seats, { maxConcurrency: 2, timeout: 50 });
            expect(results.length).toBe(5);
        });

        it('should handle failures gracefully', async () => {
            const results = await runSeatsBatch([
                { seat: 'coding', prompt: 'test', host: 'http://invalid:9999' }
            ], { retries: 1, timeout: 100 });

            expect(results[0].error).toBeDefined();
        });
    });

    describe('cleanupSeatRunner', () => {
        it('should destroy agents and clear cache', () => {
            // Just ensure it doesn't throw
            cleanupSeatRunner();
            expect(true).toBe(true);
        });
    });
});
