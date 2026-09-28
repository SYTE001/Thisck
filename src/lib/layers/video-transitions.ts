/**
 * Video Transitions Layer
 * Composites global Fade In / Fade Out to black.
 */

import type { MotionLayer, LayerPrepareContext, LayerRenderContext } from '../render/motion-layer';
import { LAYER_ZINDEX } from '../render/motion-layer';

export interface VideoTransitionsConfig {
  id: string;
  enabled: boolean;
  fadeIn: boolean;
  fadeInDuration: number;
  fadeOut: boolean;
  fadeOutDuration: number;
}

export const DEFAULT_TRANSITIONS_CONFIG: VideoTransitionsConfig = {
  id: 'video-transitions',
  enabled: true,
  fadeIn: false,
  fadeInDuration: 0.7,
  fadeOut: false,
  fadeOutDuration: 0.7,
};

export class VideoTransitionsLayer implements MotionLayer {
  readonly id: string;
  readonly type = 'transition' as const;
  readonly zIndex = LAYER_ZINDEX['transition'] || 1000; // Over everything

  startTime: number = 0;
  endTime: number = Infinity;
  enabled: boolean;

  private config: VideoTransitionsConfig;

  constructor(config: Partial<VideoTransitionsConfig> = {}) {
    this.config = { ...DEFAULT_TRANSITIONS_CONFIG, ...config };
    this.id = this.config.id;
    this.enabled = this.config.enabled;
  }

  prepare(_ctx: LayerPrepareContext): void {
    // Nothing to preload
  }

  updateConfig(config: Partial<VideoTransitionsConfig>): void {
    this.config = { ...this.config, ...config };
    this.enabled = this.config.enabled;
  }

  getConfig(): VideoTransitionsConfig {
    return { ...this.config };
  }

  render(ctx: LayerRenderContext): void {
    if (!this.enabled) return;

    const { ctx: canvasCtx, width, height, currentTime, totalDuration } = ctx;
    
    let blackOpacity = 0;

    if (this.config.fadeIn && this.config.fadeInDuration > 0) {
      const fadeInEnd = Math.min(this.config.fadeInDuration, totalDuration);
      if (currentTime < fadeInEnd) {
        const progress = Math.max(0, Math.min(1, currentTime / fadeInEnd));
        blackOpacity = Math.max(blackOpacity, 1 - progress);
      }
    }

    if (this.config.fadeOut && this.config.fadeOutDuration > 0) {
      const fadeOutDuration = Math.min(this.config.fadeOutDuration, totalDuration);
      const fadeOutStart = totalDuration - fadeOutDuration;
      if (currentTime > fadeOutStart) {
        const progress = Math.max(0, Math.min(1, (currentTime - fadeOutStart) / fadeOutDuration));
        blackOpacity = Math.max(blackOpacity, progress);
      }
    }

    // Resolving overlap: If both apply, Math.max ensures the darker overlay wins (deterministic).
    
    if (blackOpacity > 0) {
      canvasCtx.save();
      canvasCtx.globalAlpha = Math.max(0, Math.min(1, blackOpacity));
      canvasCtx.fillStyle = '#000000';
      canvasCtx.fillRect(0, 0, width, height);
      canvasCtx.restore();
    }
  }

  dispose(): void {}
}
