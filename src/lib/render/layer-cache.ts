/**
 * Static Layer Cache
 * PRD Section 9: Anything that does not change between frames must not
 * be regenerated every frame. Use granular invalidation.
 */

export type CacheKey = string;

interface CacheEntry<T> {
  value: T;
  /** Dependency hash used to detect staleness */
  depHash: string;
}

/**
 * Generic typed cache with dependency-based invalidation.
 * PRD Section 31: Caches must be invalidated based on dependencies.
 */
export class LayerCache<T> {
  private store = new Map<CacheKey, CacheEntry<T>>();

  get(key: CacheKey, depHash: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.depHash !== depHash) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: CacheKey, value: T, depHash: string): void {
    this.store.set(key, { value, depHash });
  }

  invalidate(key: CacheKey): void {
    this.store.delete(key);
  }

  invalidateAll(): void {
    this.store.clear();
  }

  has(key: CacheKey, depHash: string): boolean {
    return this.get(key, depHash) !== null;
  }
}

/**
 * Text measurement cache.
 * PRD Section 10: The renderer should not call expensive text measurement
 * APIs unnecessarily on every frame.
 */
export interface TextMetrics {
  width: number;
  /** Estimated text height based on font size */
  height: number;
}

export class TextMeasurementCache {
  private cache = new Map<string, TextMetrics>();

  private makeKey(text: string, font: string): string {
    return `${font}|${text}`;
  }

  get(text: string, font: string): TextMetrics | null {
    return this.cache.get(this.makeKey(text, font)) ?? null;
  }

  set(text: string, font: string, metrics: TextMetrics): void {
    this.cache.set(this.makeKey(text, font), metrics);
  }

  /**
   * Measure text, using cache when available.
   * The ctx must have the correct font set before calling.
   */
  measure(
    ctx: CanvasRenderingContext2D,
    text: string,
    font: string,
    fontSize: number
  ): TextMetrics {
    const cached = this.get(text, font);
    if (cached) return cached;

    const m = ctx.measureText(text);
    const metrics: TextMetrics = {
      width: m.width,
      height: fontSize,
    };
    this.set(text, font, metrics);
    return metrics;
  }

  invalidate(): void {
    this.cache.clear();
  }

  /** Invalidate only entries whose font matches. */
  invalidateFont(fontFamily: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(fontFamily)) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Procedural noise canvas cache.
 * PRD Section 9: Static layers must not be regenerated every frame.
 */
let cachedNoiseCanvas: HTMLCanvasElement | null = null;
let cachedNoiseWidth = 0;
let cachedNoiseHeight = 0;

export function getNoiseCanvas(width = 512, height = 512): HTMLCanvasElement {
  if (
    cachedNoiseCanvas &&
    cachedNoiseWidth === width &&
    cachedNoiseHeight === height
  ) {
    return cachedNoiseCanvas;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.random() * 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 40; // low alpha
    }
    ctx.putImageData(imgData, 0, 0);
  }
  cachedNoiseCanvas = canvas;
  cachedNoiseWidth = width;
  cachedNoiseHeight = height;
  return canvas;
}

export function invalidateNoiseCanvas(): void {
  cachedNoiseCanvas = null;
}

/**
 * Image preload cache.
 * PRD Section 26: Static watermark assets should be preloaded and cached.
 */
export class ImageCache {
  private cache = new Map<string, HTMLImageElement>();
  private loading = new Map<string, Promise<HTMLImageElement>>();

  async load(url: string): Promise<HTMLImageElement> {
    const cached = this.cache.get(url);
    if (cached) return cached;

    const inFlight = this.loading.get(url);
    if (inFlight) return inFlight;

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.cache.set(url, img);
        this.loading.delete(url);
        resolve(img);
      };
      img.onerror = () => {
        this.loading.delete(url);
        reject(new Error(`Failed to load image: ${url}`));
      };
      img.src = url;
    });

    this.loading.set(url, promise);
    return promise;
  }

  get(url: string): HTMLImageElement | null {
    return this.cache.get(url) ?? null;
  }

  invalidate(url: string): void {
    this.cache.delete(url);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}

/** Singleton image cache for the application */
export const imageCache = new ImageCache();
