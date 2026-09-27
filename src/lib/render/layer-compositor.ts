/**
 * Layer Compositor
 * PRD Section 8: Layer Compositor — combines visual layers in deterministic order.
 * PRD Section 19-20: Generic layer architecture with controlled ordering.
 */

import type { MotionLayer, LayerPrepareContext, LayerRenderContext } from './motion-layer';
import { isLayerActive, sortLayers } from './motion-layer';

export interface CompositorConfig {
  /** Width of the output canvas */
  width: number;
  /** Height of the output canvas */
  height: number;
  /** Project-level seed for deterministic effects */
  projectSeed: number;
}

/**
 * Layer Compositor: manages and renders all visual layers in order.
 * PRD Section 19: prevents visual features from being hard-coded into the lyric renderer.
 * PRD Section 27: disabled layers incur zero render cost.
 */
export class LayerCompositor {
  private layers: MotionLayer[] = [];
  private config: CompositorConfig;
  private prepared = false;

  constructor(config: CompositorConfig) {
    this.config = config;
  }

  /** Register a layer. Layers are automatically sorted by zIndex at render time. */
  addLayer(layer: MotionLayer): void {
    this.layers.push(layer);
    this.prepared = false; // need to re-prepare
  }

  /** Replace a layer by id. */
  replaceLayer(layer: MotionLayer): void {
    const idx = this.layers.findIndex((l) => l.id === layer.id);
    if (idx >= 0) {
      this.layers[idx].dispose?.();
      this.layers[idx] = layer;
    } else {
      this.layers.push(layer);
    }
    this.prepared = false;
  }

  removeLayer(id: string): void {
    const idx = this.layers.findIndex((l) => l.id === id);
    if (idx >= 0) {
      this.layers[idx].dispose?.();
      this.layers.splice(idx, 1);
    }
  }

  getLayer(id: string): MotionLayer | null {
    return this.layers.find((l) => l.id === id) ?? null;
  }

  getLayers(): MotionLayer[] {
    return [...this.layers];
  }

  updateConfig(config: Partial<CompositorConfig>): void {
    this.config = { ...this.config, ...config };
    this.prepared = false;
  }

  /**
   * Prepare all enabled layers (preload assets, pre-compute).
   * PRD Section 8: Scene Resolver / prepare phase.
   */
  async prepare(isPreview = false): Promise<void> {
    const ctx: LayerPrepareContext = {
      width: this.config.width,
      height: this.config.height,
      projectSeed: this.config.projectSeed,
      isPreview,
    };

    // Prepare in parallel for performance
    await Promise.all(
      this.layers
        .filter((l) => l.enabled && l.prepare)
        .map((l) => l.prepare!(ctx))
    );

    this.prepared = true;
  }

  /**
   * Render the current frame by invoking all active layers in zIndex order.
   * PRD Section 20: Deterministic compositing order.
   * PRD Section 27: Disabled layers incur zero cost.
   */
  renderFrame(
    ctx: CanvasRenderingContext2D,
    currentTime: number,
    isPreview = false
  ): void {
    const sorted = sortLayers(this.layers);
    const renderCtx: LayerRenderContext = {
      ctx,
      width: this.config.width,
      height: this.config.height,
      currentTime,
      isPreview,
    };

    for (const layer of sorted) {
      if (!isLayerActive(layer, currentTime)) continue;
      layer.render(renderCtx);
    }
  }

  /**
   * Release all layer resources.
   * PRD Section 15: Clean worker resources / release cached resources.
   */
  dispose(): void {
    for (const layer of this.layers) {
      layer.dispose?.();
    }
    this.layers = [];
    this.prepared = false;
  }

  isPrepared(): boolean {
    return this.prepared;
  }
}
