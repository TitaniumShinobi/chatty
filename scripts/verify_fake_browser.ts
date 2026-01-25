
// Simulate environment where window is defined (e.g. jsdom or accidental leak)
(global as any).window = {
    fetch: global.fetch
};

async function verify() {
    console.log("=== STARTING FAKE BROWSER VERIFICATION ===");
    console.log("Mocked window object present.");

    try {
        // Dynamic import to pick up the mocked window
        const { runSeat, loadSeatConfig } = await import('./src/engine/seatRunner');

        console.log("1. Testing loadSeatConfig() in fake browser...");
        const config = await loadSeatConfig();
        console.log("   Config loaded (expect defaults):", JSON.stringify(config, null, 2));

        console.log("\n2. Testing runSeat('smalltalk') in fake browser...");
        const response = await runSeat({
            seat: 'smalltalk',
            prompt: 'Ping check. Reply with "Pong".',
            timeout: 5000
        });
        console.log("   Response:", response);
    } catch (e) {
        console.error("   FAKE BROWSER VERIFICATION FAILED:", e);
        if (e instanceof Error) {
            console.error("   Error:", e.message);
        }
    }
}

verify().catch(console.error);
