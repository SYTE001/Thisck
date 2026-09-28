/**
 * Watermark Layer
 * PRD Section 25: Dedicated watermark layer with animation presets.
 * PRD Section 26: Static assets preloaded and cached; animate transforms.
 */

import type { MotionLayer, LayerPrepareContext, LayerRenderContext } from '../render/motion-layer';
import { LAYER_ZINDEX } from '../render/motion-layer';

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

export type WatermarkSourceType = 'video' | 'text';
export type WatermarkTextStyle = 'plain' | 'glass';

export interface WatermarkConfig {
  id: string;
  enabled: boolean;
  startTime: number;
  endTime: number;
  sourceType: WatermarkSourceType;
  
  // Video Mode
  /** URL or data URL of the video (previously imageUrl) */
  videoUrl: string | null;
  loop: boolean;
  
  // Text Mode
  text: string;
  textStyle: WatermarkTextStyle;

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
  sourceType: 'text',
  videoUrl: null,
  loop: true,
  text: '@username',
  textStyle: 'plain',
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

  // Video element caching
  private videoEl: HTMLVideoElement | null = null;
  private videoUrlLoaded: string | null = null;
  
  /** PRD Section 26: Preload video asset once. */
  async prepare(_ctx: LayerPrepareContext): Promise<void> {
    if (!this.enabled) return;
    if (this.config.sourceType === 'video' && this.config.videoUrl) {
      if (this.videoUrlLoaded !== this.config.videoUrl) {
        this.videoEl = document.createElement('video');
        this.videoEl.src = this.config.videoUrl;
        this.videoEl.muted = true;
        this.videoEl.playsInline = true;
        this.videoEl.crossOrigin = 'anonymous';
        // Wait for video metadata to know its intrinsic size
        await new Promise<void>((resolve, reject) => {
          if (!this.videoEl) return reject(new Error('Video element missing'));
          this.videoEl.onloadedmetadata = () => resolve();
          this.videoEl.onerror = () => reject(new Error('Failed to load watermark video'));
        }).catch((e) => {
          this.loadError = (e as Error).message;
          this.videoEl = null;
        });
        
        if (this.videoEl) {
          this.videoUrlLoaded = this.config.videoUrl;
          this.loadError = null;
        }
      }
    }
  }

  updateConfig(config: Partial<WatermarkConfig>): void {
    const prevUrl = this.config.videoUrl;
    this.config = { ...this.config, ...config };
    this.enabled = this.config.enabled;
    this.startTime = this.config.startTime;
    this.endTime = this.config.endTime;

    if (this.config.sourceType === 'video' && this.config.videoUrl !== prevUrl) {
      this.videoUrlLoaded = null;
      this.videoEl = null;
    }
  }

  getConfig(): WatermarkConfig {
    return { ...this.config };
  }

  getLoadError(): string | null {
    return this.loadError;
  }

  render(ctx: LayerRenderContext): void {
    if (!this.enabled) return;

    const { ctx: canvasCtx, width, height, currentTime } = ctx;

    const padding = this.config.paddingFraction * width;
    let baseSize = this.config.sizeFraction * width;
    let itemWidth = baseSize;
    let itemHeight = baseSize;

    // Determine intrinsic dimensions
    if (this.config.sourceType === 'video') {
      if (!this.videoEl) return; // Not yet loaded
      const aspect = this.videoEl.videoWidth / (this.videoEl.videoHeight || 1);
      itemHeight = baseSize;
      itemWidth = baseSize * aspect;
      
      // Update video time deterministically
      const localTime = currentTime - this.startTime;
      const vidDur = this.videoEl.duration || 1;
      let vidTime = localTime;
      if (this.config.loop) {
        vidTime = localTime % vidDur;
      } else {
        vidTime = Math.min(localTime, vidDur);
      }
      this.videoEl.currentTime = vidTime;
    } else {
      // Text mode
      canvasCtx.font = `600 ${baseSize}px "Inter", sans-serif`;
      const metrics = canvasCtx.measureText(this.config.text);
      itemWidth = metrics.width;
      itemHeight = baseSize; // approximate
    }

    const { x, y } = resolvePosition(this.config.position, width, height, itemWidth, itemHeight, padding);
    const animState = this.calculateAnimation(currentTime);

    canvasCtx.save();
    canvasCtx.globalAlpha = Math.max(0, Math.min(1, this.config.opacity * animState.opacity));

    // Transform
    const cx = x + itemWidth / 2;
    const cy = y + itemHeight / 2;
    canvasCtx.translate(cx, cy);
    canvasCtx.scale(animState.scale, animState.scale);
    canvasCtx.translate(-cx, -cy);

    if (this.config.sourceType === 'video' && this.videoEl) {
      canvasCtx.drawImage(this.videoEl, x + animState.translateX, y + animState.translateY, itemWidth, itemHeight);
    } else if (this.config.sourceType === 'text') {
      const drawX = x + animState.translateX;
      const drawY = y + animState.translateY;
      
      if (this.config.textStyle === 'glass') {
        const p = baseSize * 0.4;
        canvasCtx.save();
        canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        canvasCtx.lineWidth = 1;
        // Blur backdrop (requires modern canvas)
        if ('filter' in canvasCtx) {
          canvasCtx.filter = 'blur(10px)';
        }
        canvasCtx.beginPath();
        canvasCtx.roundRect(drawX - p, drawY - itemHeight * 0.2 - p, itemWidth + p*2, itemHeight + p*2, baseSize * 0.2);
        canvasCtx.fill();
        canvasCtx.filter = 'none';
        canvasCtx.stroke();
        canvasCtx.restore();
      }
      
      canvasCtx.fillStyle = '#ffffff';
      canvasCtx.textBaseline = 'top';
      canvasCtx.fillText(this.config.text, drawX, drawY - itemHeight * 0.2); // adjusting for baseline
    }

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
    this.videoEl = null;
    this.videoUrlLoaded = null;
  }
}

function resolvePosition(
  position: WatermarkPosition,
  width: number,
  height: number,
  itemW: number,
  itemH: number,
  padding: number
): { x: number; y: number } {
  switch (position) {
    case 'top-left':
      return { x: padding, y: padding };
    case 'top-center':
      return { x: (width - itemW) / 2, y: padding };
    case 'top-right':
      return { x: width - itemW - padding, y: padding };
    case 'bottom-left':
      return { x: padding, y: height - itemH - padding };
    case 'bottom-center':
      return { x: (width - itemW) / 2, y: height - itemH - padding };
    case 'bottom-right':
    default:
      return { x: width - itemW - padding, y: height - itemH - padding };
  }
}
