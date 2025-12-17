/**
 * TriadGate.ts
 * 
 * Enforces atomic execution for the reasoning triad (DeepSeek, Phi-3, Mistral).
 * If ANY seat is unavailable or failing, this gate blocks the conversation.
 * 
 * Core Rule: NO TRIAD → NO RESPONSE
 */

import { seatRunner } from '../seats/seatRunner.js';

export interface TriadStatus {
    healthy: boolean;
    failedSeats: string[];
    latency: Record<string, number>;
    timestamp: number;
}

export class TriadGate {
    private static instance: TriadGate;

    // Timeout for health check (fast fail)
    private readonly HEALTH_CHECK_TIMEOUT = 2000;

    // Required models for the triad
    private readonly TRIAD_SEATS = [
        'deepseek-coder:6.7b', // Logic/Coding Seat
        'phi3:latest',         // Synthesis/Routing Seat
        'mistral:latest'       // Creative/Persona Seat
    ];

    private constructor() { }

    public static getInstance(): TriadGate {
        if (!TriadGate.instance) {
            TriadGate.instance = new TriadGate();
        }
        return TriadGate.instance;
    }

    /**
     * Check if all members of the triad are available and responsive.
     * Fails fast if any model is missing.
     */
    public async checkTriadAvailability(): Promise<TriadStatus> {
        const status: TriadStatus = {
            healthy: true,
            failedSeats: [],
            latency: {},
            timestamp: Date.now()
        };

        console.log('🔒 [TriadGate] Verifying atomic triad availability...', this.TRIAD_SEATS);

        // Run checks in parallel
        const checks = this.TRIAD_SEATS.map(async (modelName) => {
            const start = Date.now();
            try {
                // We use a very simplified prompt just to check "are you there"
                // Using a 1 token max output ideally, but seatRunner might not expose that easily
                // We'll rely on a simple 'ping' behavior if available, or just a trivial prompt

                // Note: In a real prod env, we'd hit /api/tags or /api/ps to check loaded models first
                // Here we'll try a fast generation with a short timeout

                // NOTE: We are assuming seatRunner has a mechanism or we rely on Ollama direct check
                // For now, let's assume we can query seatRunner. If not, we fall back to fetch
                const isAvailable = await this.pingModel(modelName);

                const latency = Date.now() - start;
                status.latency[modelName] = latency;
                console.log(`🛰️ [TriadGate] Seat ${modelName} responded in ${latency}ms (available: ${isAvailable})`);

                if (!isAvailable) {
                    status.failedSeats.push(modelName);
                    status.healthy = false;
                }
            } catch (error) {
                status.failedSeats.push(modelName);
                console.warn(`⚠️ [TriadGate] Seat failed: ${modelName}`, error);
                status.healthy = false;
            }
        });

        await Promise.all(checks);

        console.log(
            '🔁 [TriadGate] Triad check complete',
            `healthy=${status.healthy}`,
            `failedSeats=${status.failedSeats.join(', ') || 'none'}`
        );

        if (!status.healthy) {
            console.error('⛔ [TriadGate] Triad BROKEN. Blocking outcome generation.', status.failedSeats);
        } else {
            console.log('✅ [TriadGate] Triad HEALTHY. Proceeding.');
        }

        return status;
    }

    /**
     * Ping a model to see if it's responsive.
     * Uses direct Ollama API for speed, bypassing heavy SeatRunner logic if possible.
     */
    private async pingModel(model: string): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.HEALTH_CHECK_TIMEOUT);

            // Default Ollama host
            const host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

            const response = await fetch(`${host}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    prompt: 'ping',
                    stream: false,
                    options: { num_predict: 1 } // Generate max 1 token for speed
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }
}

export const triadGate = TriadGate.getInstance();
