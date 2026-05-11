/**
 * TriadGate.ts
 * 
 * Enforces atomic execution for the reasoning triad (Qwen3-Coder, Phi-4 mini, Mistral Small).
 * If ANY seat is unavailable or failing, this gate blocks the conversation.
 * 
 * Core Rule: NO TRIAD → NO RESPONSE
 */

import { LIN_DEFAULT_MODELS } from '../../config/linModelDefaults';

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
        LIN_DEFAULT_MODELS.coding, // Intelligence: coding, continuity, truth, evidence, risk
        LIN_DEFAULT_MODELS.smalltalk, // Interaction: dialogue flow and pacing
        LIN_DEFAULT_MODELS.creative // Ingenuity: creative/persona shaping
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
            const ollamaModel = model.startsWith('ollama:') ? model.slice('ollama:'.length) : model;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.HEALTH_CHECK_TIMEOUT);

            // Resolve Ollama host across environments (Node or Vite/browser).
            // In production browser builds, we intentionally avoid a localhost default.
            const anyGlobal = globalThis as any;
            const devHost = (() => {
                const loc = anyGlobal?.location as Location | undefined;
                if (!loc?.origin) return undefined;
                const u = new URL(loc.origin);
                u.protocol = 'http:';
                u.port = '11434';
                u.pathname = '';
                u.search = '';
                u.hash = '';
                return u.origin;
            })();
            const host =
                anyGlobal?.process?.env?.OLLAMA_HOST ||
                (import.meta as any)?.env?.VITE_OLLAMA_HOST ||
                ((import.meta as any)?.env?.DEV ? devHost : undefined);

            if (!host) return false;

            const response = await fetch(`${host}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: ollamaModel,
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
