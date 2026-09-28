/**
 * Motion Layer System
 * PRD Section 19, 20, 42: Generic compositing layer abstraction.
 * All visual elements implement this interface.
 */

export interface LayerPrepareContext {
  /** Canvas width in pixels */
  width: number;
  /** Canvas height in pixels */
  height: number;
  /** Project-level seed for deterministic effects */
  projectSeed: number;
  /** Whether this is a preview (lower quality allowed) or export */
  isPreview: boolean;
}

export interface LayerRenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Current time in seconds */
  currentTime: number;
  /** Total project duration in seconds */
  totalDuration: number;
  /** Whether this is a preview (lower quality allowed) */
  isPreview: boolean;
}

/**
 * Core compositing layer interface.
 * PRD Section 19: Every visual element should implement this.
 */
export interface MotionLayer {
  id: string;
  type: MotionLayerType;
  /** Start time in seconds. Use 0 for layers active from the start. */
  startTime: number;
  /** End time in seconds. Use Infinity for layers active until the end. */
  endTime: number;
  /** Z-index for compositing order. Lower = further back. */
  zIndex: number;
  enabled: boolean;

  /**
   * Optional: called once before rendering begins.
   * Use to pre-load assets, pre-compute geometry, or initialize caches.
   */
  prepare?(context: LayerPrepareContext): void | Promise<void>;

  /**
   * Render the layer into the provided canvas context at the given time.
   */
  render(context: LayerRenderContext): void;

  /**
   * Optional: release any allocated resources.
   */
  dispose?(): void;
}

/**
 * PRD Section 20: Default compositing order
 * 1. Background
 * 2. Background texture
 * 3. Background media
 * 4. Decorative/effect overlays
 * 5. Previous/secondary lyrics
 * 6. Current lyrics
 * 7. Word emphasis / lyric effects
 * 8. Watermark
 * 9. Foreground decoration
 * 10. Global post-processing
 */
export type MotionLayerType =
  | 'background'
  | 'background-texture'
  | 'background-media'
  | 'overlay'
  | 'lyrics-secondary'
  | 'lyrics-primary'
  | 'lyrics-effect'
  | 'watermark'
  | 'foreground-decoration'
  | 'post-process'
  | 'transition';

/** Default zIndex values by layer type for deterministic ordering */
export const LAYER_ZINDEX: Record<MotionLayerType, number> = {
  'background': 0,
  'background-texture': 10,
  'background-media': 20,
  'overlay': 30,
  'lyrics-secondary': 40,
  'lyrics-primary': 50,
  'lyrics-effect': 60,
  'watermark': 70,
  'foreground-decoration': 80,
  'post-process': 90,
  'transition': 100,
};

/**
 * Check if a layer is active at the given time.
 * PRD Section 32.
 */
export function isLayerActive(layer: MotionLayer, currentTime: number): boolean {
  return (
    layer.enabled &&
    currentTime >= layer.startTime &&
    currentTime < layer.endTime
  );
}

/**
 * Sort layers by zIndex for deterministic compositing order.
 * PRD Section 20.
 */
export function sortLayers(layers: MotionLayer[]): MotionLayer[] {
  return [...layers].sort((a, b) => a.zIndex - b.zIndex);
}
