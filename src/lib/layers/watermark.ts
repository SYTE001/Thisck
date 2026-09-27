/**
 * Watermark Layer
 * PRD Section 25: Dedicated watermark layer with animation presets.
 * PRD Section 26: Static assets preloaded and cached; animate transforms.
 */

import type { MotionLayer, LayerPrepareContext, LayerRenderContext } from '../render/motion-layer';
import { LAYER_ZINDEX } from '../render/motion-layer';
import { imageCache } from '../render/layer-cache';

export type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export type WatermarkAnimationPreset =
  | 'none'
  | 'fade-in'
  | 'fade-out'
  | 'fade-in-out'
  | 'subtle-scale'
  | 'subtle-slide'
  | 'pulse';

export interface WatermarkConfig {
  id: string;
  enabled: boolean;
  startTime: number;
  endTime: number;
  /** URL or data URL of the watermark image/icon */
  imageUrl: string | null;
  position: WatermarkPosition;
  /** Size as a fraction of canvas width (0.05 = 5%). Default 0.08. */
  sizeFraction: number;
  /** Base opacity 0..1. Default 0.7. */
  opacity: number;
  animationPreset: WatermarkAnimationPreset;
  /** Padding from edges as fraction of canvas width. Default 0.04. */
  paddingFraction: number;
}

export const DEFAULT_WATERMARK_CONFIG: WatermarkConfig = {
  id: 'watermark',
  enabled: false,
  startTime: 0,
  endTime: Infinity,
  imageUrl: null,
  position: 'bottom-right',
  sizeFraction: 0.08,
  opacity: 0.7,
  animationPreset: 'fade-in-out',
  paddingFraction: 0.04,
};

/** Simple easing helpers */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/**
 * Watermark layer implementing MotionLayer.
 * PRD Section 26: Reuse source image data, animate transforms only.
 */
export class WatermarkLayer implements MotionLayer {
  readonly id: string;
  readonly type = 'watermark' as const;
  readonly zIndex = LAYER_ZINDEX['watermark'];

  startTime: number;
  endTime: number;
  enabled: boolean;

  private config: WatermarkConfig;
  private loadError: string | null = null;

  constructor(config: Partial<WatermarkConfig> = {}) {
    this.config = { ...DEFAULT_WATERMARK_CONFIG, ...config };
    this.id = this.config.id;
    this.enabled = this.config.enabled;
    this.startTime = this.config.startTime;
    this.endTime = this.config.endTime;
  }

  /** PRD Section 26: Preload image asset once. */
  async prepare(_ctx: LayerPrepareContext): Promise<void> {
    if (!this.enabled || !this.config.imageUrl) return;
    try {
      await imageCache.load(this.config.imageUrl);
      this.loadError = null;
    } catch (e) {
      this.loadError = (e as Error).message;
      // PRD Section 33: Export validation should surface this error.
    }
  }

  updateConfig(config: Partial<WatermarkConfig>): void {
    const prevUrl = this.config.imageUrl;
    this.config = { ...this.config, ...config };
    this.enabled = this.config.enabled;
    this.startTime = this.config.startTime;
    this.endTime = this.config.endTime;

    // PRD Section 31: Invalidate image cache if asset changed
    if (config.imageUrl !== undefined && config.imageUrl !== prevUrl && prevUrl) {
      imageCache.invalidate(prevUrl);
    }
  }

  getConfig(): WatermarkConfig {
    return { ...this.config };
  }

  getLoadError(): string | null {
    return this.loadError;
  }

  render(ctx: LayerRenderContext): void {
    if (!this.enabled || !this.config.imageUrl) return;

    const img = imageCache.get(this.config.imageUrl);
    if (!img) return; // Not yet loaded; skip this frame silently

    const { ctx: canvasCtx, width, height, currentTime } = ctx;

    // Resolve position
    const padding = this.config.paddingFraction * width;
    const size = this.config.sizeFraction * width;
    const { x, y } = resolvePosition(this.config.position, width, height, size, padding);

    // Calculate animation state
    const animState = this.calculateAnimation(currentTime);

    canvasCtx.save();
    canvasCtx.globalAlpha = Math.max(0, Math.min(1, this.config.opacity * animState.opacity));

    // Apply transform: scale around center of watermark
    const cx = x + size / 2;
    const cy = y + size / 2;
    canvasCtx.translate(cx, cy);
    canvasCtx.scale(animState.scale, animState.scale);
    canvasCtx.translate(-cx, -cy);

    canvasCtx.drawImage(img, x + animState.translateX, y + animState.translateY, size, size);
    canvasCtx.restore();
  }

  private calculateAnimation(currentTime: number): {
    opacity: number;
    scale: number;
    translateX: number;
    translateY: number;
  } {
    const result = { opacity: 1, scale: 1, translateX: 0, translateY: 0 };

    const duration = isFinite(this.endTime) ? this.endTime - this.startTime : null;
    const elapsed = currentTime - this.startTime;
    const fadeRange = 0.6; // seconds for fade transitions

    switch (this.config.animationPreset) {
      case 'none':
        break;

      case 'fade-in': {
        if (elapsed < fadeRange) {
          result.opacity = easeOutCubic(elapsed / fadeRange);
        }
        break;
      }

      case 'fade-out': {
        if (duration !== null && elapsed > duration - fadeRange) {
          const t = (elapsed - (duration - fadeRange)) / fadeRange;
          result.opacity = 1 - easeOutCubic(Math.min(1, t));
        }
        break;
      }

      case 'fade-in-out': {
        if (elapsed < fadeRange) {
          result.opacity = easeOutCubic(elapsed / fadeRange);
        } else if (duration !== null && elapsed > duration - fadeRange) {
          const t = (elapsed - (duration - fadeRange)) / fadeRange;
          result.opacity = 1 - easeOutCubic(Math.min(1, t));
        }
        break;
      }

      case 'subtle-scale': {
        // Gentle pulse between 0.97 and 1.0
        const phase = (elapsed * 0.5) % 1.0; // 2s cycle
        result.scale = 0.97 + 0.03 * easeInOutSine(phase < 0.5 ? phase * 2 : (1 - phase) * 2);
        break;
      }

      case 'subtle-slide': {
        // Gentle vertical drift
        const phase = (elapsed * 0.4) % 1.0; // 2.5s cycle
        result.translateY = 3 * easeInOutSine(phase < 0.5 ? phase * 2 : (1 - phase) * 2) - 1.5;
        break;
      }

      case 'pulse': {
        // Opacity pulse
        const phase = (elapsed * 0.8) % 1.0; // ~1.25s cycle
        result.opacity = 0.7 + 0.3 * easeInOutSine(phase < 0.5 ? phase * 2 : (1 - phase) * 2);
        break;
      }
    }

    return result;
  }

  dispose(): void {
    // Image stays in global cache; nothing to release here
  }
}

function resolvePosition(
  position: WatermarkPosition,
  width: number,
  height: number,
  size: number,
  padding: number
): { x: number; y: number } {
  switch (position) {
    case 'top-left':
      return { x: padding, y: padding };
    case 'top-center':
      return { x: (width - size) / 2, y: padding };
    case 'top-right':
      return { x: width - size - padding, y: padding };
    case 'bottom-left':
      return { x: padding, y: height - size - padding };
    case 'bottom-center':
      return { x: (width - size) / 2, y: height - size - padding };
    case 'bottom-right':
    default:
      return { x: width - size - padding, y: height - size - padding };
  }
}
