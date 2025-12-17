
import { runSeat, loadSeatConfig } from './src/engine/seatRunner';

async function verify() {
    console.log("=== STARTING VERIFICATION ===");

    try {
        console.log("1. Testing loadSeatConfig()...");
        const config = await loadSeatConfig();
        console.log("   Config loaded:", JSON.stringify(config, null, 2));
    } catch (e) {
        console.error("   loadSeatConfig FAILED:", e);
    }

    try {
        console.log("\n2. Testing runSeat('smalltalk')...");
        const response = await runSeat({
            seat: 'smalltalk',
            prompt: 'Ping check. Reply with "Pong".',
            timeout: 5000
        });
        console.log("   Response:", response);
    } catch (e) {
        console.error("   runSeat FAILED:", e);
        // Log full error details
        if (e instanceof Error) {
            console.error("   Error Name:", e.name);
            console.error("   Error Message:", e.message);
            console.error("   Error Stack:", e.stack);
            if ('code' in e) console.error("   Error Code:", (e as any).code);
            if ('cause' in e) console.error("   Error Cause:", (e as any).cause);
        }
    }
}

verify().catch(console.error);
