/**
 * Rain Overlay Layer
 * PRD Section 23: Animated overlay system — initial Rain example.
 * PRD Section 29: Must be deterministic (seeded random, same project = same output).
 */

import type { MotionLayer, LayerPrepareContext, LayerRenderContext } from '../render/motion-layer';
import { LAYER_ZINDEX } from '../render/motion-layer';

/** Seeded pseudo-random number generator (LCG). */
function seededRng(seed: number) {
  let s = seed | 0;
  return function next(): number {
    s = (Math.imul(1664525, s) + 1013904223) | 0;
    return (s >>> 0) / 0xffffffff;
  };
}

export interface RainParticle {
  x: number;       // 0..1 normalized
  y: number;       // 0..1 normalized (wraps)
  speed: number;   // vertical speed (normalized units/sec)
  length: number;  // streak length (normalized)
  opacity: number; // individual droplet opacity
}

export interface RainOverlayConfig {
  id: string;
  enabled: boolean;
  startTime: number;
  endTime: number;
  /** Number of rain particles (50–300). Default 120. */
  density: number;
  /** Normalized fall speed multiplier. Default 1.0. */
  speed: number;
  /** Angle in degrees from vertical (0 = straight down). Default 5. */
  direction: number;
  /** Layer opacity 0..1. Default 0.35. */
  opacity: number;
  /** Streak size multiplier. Default 1.0. */
  size: number;
  /** Blend mode. Default 'screen'. */
  blendMode: GlobalCompositeOperation;
  /** Seed for deterministic output. Default 42. */
  seed: number;
}

export const DEFAULT_RAIN_CONFIG: RainOverlayConfig = {
  id: 'rain-overlay',
  enabled: false,
  startTime: 0,
  endTime: Infinity,
  density: 120,
  speed: 1.0,
  direction: 5,
  opacity: 0.35,
  size: 1.0,
  blendMode: 'screen',
  seed: 42,
};

/**
 * Rain overlay layer implementing MotionLayer.
 * PRD Section 23: particle simulation with deterministic seed.
 * PRD Section 27: if disabled, no calculation or allocation occurs.
 */
export class RainOverlayLayer implements MotionLayer {
  readonly id: string;
  readonly type = 'overlay' as const;
  readonly zIndex = LAYER_ZINDEX['overlay'];

  startTime: number;
  endTime: number;
  enabled: boolean;

  private config: RainOverlayConfig;
  private particles: RainParticle[] = [];

  constructor(config: Partial<RainOverlayConfig> = {}) {
    this.config = { ...DEFAULT_RAIN_CONFIG, ...config };
    this.id = this.config.id;
    this.enabled = this.config.enabled;
    this.startTime = this.config.startTime;
    this.endTime = this.config.endTime;
  }

  /** PRD Section 23: Pre-compute particle trajectories from seed. */
  prepare(_ctx: LayerPrepareContext): void {
    if (!this.enabled) return;
    this.initParticles();
  }

  private initParticles(): void {
    const rng = seededRng(this.config.seed);
    this.particles = [];
    const count = Math.max(10, Math.min(500, this.config.density));
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: rng(),
        y: rng(),           // random initial y so they are spread out at t=0
        speed: 0.15 + rng() * 0.25, // base speed normalized
        length: 0.018 + rng() * 0.032,
        opacity: 0.4 + rng() * 0.6,
      });
    }
  }

  updateConfig(config: Partial<RainOverlayConfig>): void {
    const prev = this.config;
    this.config = { ...this.config, ...config };
    this.enabled = this.config.enabled;
    this.startTime = this.config.startTime;
    this.endTime = this.config.endTime;

    // PRD Section 31: Invalidate simulation cache when relevant params change
    if (
      config.seed !== undefined && config.seed !== prev.seed ||
      config.density !== undefined && config.density !== prev.density
    ) {
      this.initParticles();
    }
  }

  getConfig(): RainOverlayConfig {
    return { ...this.config };
  }

  render(ctx: LayerRenderContext): void {
    if (!this.enabled) return;
    if (this.particles.length === 0) this.initParticles();

    const { ctx: canvasCtx, width, height, currentTime, isPreview } = ctx;
    const layerTime = Math.max(0, currentTime - this.startTime);

    // Fade in/out at boundaries (0.5s)
    const fadeInEnd = this.startTime + 0.5;
    const fadeOutStart = isFinite(this.endTime) ? this.endTime - 0.5 : Infinity;
    let layerAlpha = this.config.opacity;
    if (currentTime < fadeInEnd) {
      layerAlpha *= (currentTime - this.startTime) / 0.5;
    } else if (currentTime > fadeOutStart) {
      layerAlpha *= (this.endTime - currentTime) / 0.5;
    }
    layerAlpha = Math.max(0, Math.min(1, layerAlpha));

    // PRD Section 28: in preview, use fewer particles
    const particleSubset = isPreview
      ? this.particles.slice(0, Math.ceil(this.particles.length * 0.4))
      : this.particles;

    const speedMultiplier = this.config.speed;
    const angleRad = (this.config.direction * Math.PI) / 180;
    const sinA = Math.sin(angleRad);
    const cosA = Math.cos(angleRad);

    canvasCtx.save();
    canvasCtx.globalAlpha = layerAlpha;
    canvasCtx.globalCompositeOperation = this.config.blendMode;

    for (const p of particleSubset) {
      // Deterministic position from seed + time
      const travelY = (layerTime * p.speed * speedMultiplier) % 1.0;
      const py = (p.y + travelY) % 1.0;
      const px = p.x + sinA * travelY * 0.5; // slight horizontal drift

      const startX = px * width;
      const startY = py * height;
      const lenPx = p.length * height * this.config.size;

      const endX = startX + sinA * lenPx;
      const endY = startY + cosA * lenPx;

      canvasCtx.beginPath();
      canvasCtx.moveTo(startX, startY);
      canvasCtx.lineTo(endX, endY);
      canvasCtx.strokeStyle = `rgba(180,220,255,${p.opacity * 0.9})`;
      canvasCtx.lineWidth = this.config.size * 1.2;
      canvasCtx.stroke();
    }

    canvasCtx.restore();
  }

  dispose(): void {
    this.particles = [];
  }
}
