/**
 * Procedural halo particles for the cosmic orb. No textures or images.
 * Behavior by state: idle = gentle drift, userSpeaking = accelerated,
 * transcribing = slow vortex, aiSpeaking = pulse-aligned.
 */

export type OrbState = "idle" | "userSpeaking" | "transcribing" | "aiSpeaking";

export interface Particle {
  angle: number;
  radius: number;
  speed: number;
  phase: number;
  size: number;
  alpha: number;
}

const PARTICLE_COUNT = 32;
const BASE_RADIUS = 0.5;

/**
 * Create initial particle set for the halo.
 */
export function createParticles(): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    out.push({
      angle: (i / PARTICLE_COUNT) * Math.PI * 2,
      radius: BASE_RADIUS,
      speed: 0.2 + Math.random() * 0.2,
      phase: Math.random() * Math.PI * 2,
      size: 0.015 + Math.random() * 0.02,
      alpha: 0.3 + Math.random() * 0.4,
    });
  }
  return out;
}

/**
 * Update particle angles (and optionally radius/size) by state and amplitude.
 * Returns updated particles (mutates in place).
 */
export function updateParticles(
  particles: Particle[],
  state: OrbState,
  amplitude: number,
  dt: number,
): void {
  const now = Date.now() / 1000;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    let speed = p.speed;
    if (state === "userSpeaking") {
      speed *= 1 + amplitude * 1.5;
    } else if (state === "transcribing") {
      speed *= 0.6;
    } else if (state === "aiSpeaking") {
      speed *= 0.8 + amplitude * 0.6;
    } else {
      speed *= 0.5;
    }
    p.angle += speed * dt;
    if (p.angle > Math.PI * 2) p.angle -= Math.PI * 2;
    if (p.angle < 0) p.angle += Math.PI * 2;
  }
}

/**
 * Draw particles onto a 2D canvas context. Coordinate system: 0..1 normalized
 * with center 0.5, 0.5. Scale to pixel size in caller.
 */
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  maxR: number,
  particles: Particle[],
  state: OrbState,
  amplitude: number,
): void {
  const now = Date.now() / 1000;
  for (const p of particles) {
    const r = maxR * (p.radius + (state === "userSpeaking" ? amplitude * 0.15 : 0) + 0.05 * Math.sin(now + p.phase));
    const x = cx + Math.cos(p.angle) * r;
    const y = cy + Math.sin(p.angle) * r;
    const size = maxR * p.size * (1 + (state === "aiSpeaking" ? amplitude * 0.5 : 0));
    const alpha = p.alpha * (0.7 + (state === "userSpeaking" ? amplitude * 0.3 : 0));
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(180, 190, 255, ${alpha})`;
    ctx.fill();
  }
}
