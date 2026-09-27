/**
 * Tests for the Motion Layer System
 * PRD Section 38: Add tests for timeline, overlay, watermark, renderer.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { isLayerActive, sortLayers, LAYER_ZINDEX } from '../render/motion-layer';
import type { MotionLayer, LayerRenderContext } from '../render/motion-layer';
import { LayerCache, TextMeasurementCache } from '../render/layer-cache';
import { RainOverlayLayer, DEFAULT_RAIN_CONFIG } from '../layers/rain-overlay';
import { WatermarkLayer, DEFAULT_WATERMARK_CONFIG } from '../layers/watermark';
import { calculateTextAnimationState } from '../render/text-animation';
import { createInitialJobState, computeEstimatedRemaining } from '../render/render-job';
import type { VisualLyricBlock } from '../../types/lyrics';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeLayer(
  override: Partial<MotionLayer> = {}
): MotionLayer {
  return {
    id: 'test-layer',
    type: 'overlay',
    startTime: 0,
    endTime: 10,
    zIndex: 30,
    enabled: true,
    render: (_ctx: LayerRenderContext) => {},
    ...override,
  };
}

function makeBlock(override: Partial<VisualLyricBlock> = {}): VisualLyricBlock {
  return {
    id: 'block-1',
    sourceLineId: 'line-1',
    text: 'Hello world',
    lines: ['Hello world'],
    startTime: 1.0,
    endTime: 3.0,
    duration: 2.0,
    layoutType: 'single-line',
    sceneIndex: 0,
    fontSizeMultiplier: 1.0,
    ...override,
  };
}

// ─── isLayerActive ────────────────────────────────────────────────────────────

describe('isLayerActive', () => {
  it('returns true when currentTime is within [startTime, endTime)', () => {
    const layer = makeLayer({ startTime: 2, endTime: 8 });
    expect(isLayerActive(layer, 2)).toBe(true);
    expect(isLayerActive(layer, 5)).toBe(true);
    expect(isLayerActive(layer, 7.999)).toBe(true);
  });

  it('returns false at exact endTime (exclusive upper bound)', () => {
    const layer = makeLayer({ startTime: 2, endTime: 8 });
    expect(isLayerActive(layer, 8)).toBe(false);
  });

  it('returns false before startTime', () => {
    const layer = makeLayer({ startTime: 2, endTime: 8 });
    expect(isLayerActive(layer, 0)).toBe(false);
    expect(isLayerActive(layer, 1.999)).toBe(false);
  });

  it('returns false when layer is disabled', () => {
    const layer = makeLayer({ startTime: 0, endTime: 10, enabled: false });
    expect(isLayerActive(layer, 5)).toBe(false);
  });
});

// ─── sortLayers ───────────────────────────────────────────────────────────────

describe('sortLayers (PRD Section 20)', () => {
  it('sorts layers by zIndex ascending', () => {
    const a = makeLayer({ id: 'a', zIndex: 50 });
    const b = makeLayer({ id: 'b', zIndex: 10 });
    const c = makeLayer({ id: 'c', zIndex: 90 });
    const sorted = sortLayers([a, b, c]);
    expect(sorted.map((l) => l.id)).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate the input array', () => {
    const layers = [makeLayer({ id: 'x', zIndex: 30 }), makeLayer({ id: 'y', zIndex: 10 })];
    const original = [...layers];
    sortLayers(layers);
    expect(layers[0].id).toBe(original[0].id);
  });
});

// ─── LAYER_ZINDEX ─────────────────────────────────────────────────────────────

describe('LAYER_ZINDEX (PRD Section 20 ordering)', () => {
  it('background < overlay < lyrics-primary < watermark < post-process', () => {
    expect(LAYER_ZINDEX['background']).toBeLessThan(LAYER_ZINDEX['overlay']);
    expect(LAYER_ZINDEX['overlay']).toBeLessThan(LAYER_ZINDEX['lyrics-primary']);
    expect(LAYER_ZINDEX['lyrics-primary']).toBeLessThan(LAYER_ZINDEX['watermark']);
    expect(LAYER_ZINDEX['watermark']).toBeLessThan(LAYER_ZINDEX['post-process']);
  });
});

// ─── LayerCache ───────────────────────────────────────────────────────────────

describe('LayerCache (PRD Section 9, 31)', () => {
  let cache: LayerCache<string>;

  beforeEach(() => {
    cache = new LayerCache();
  });

  it('returns null when key does not exist', () => {
    expect(cache.get('missing', 'hash1')).toBeNull();
  });

  it('stores and retrieves a value with matching hash', () => {
    cache.set('key1', 'hello', 'abc');
    expect(cache.get('key1', 'abc')).toBe('hello');
  });

  it('invalidates when depHash changes (granular invalidation)', () => {
    cache.set('key1', 'hello', 'abc');
    expect(cache.get('key1', 'xyz')).toBeNull(); // different hash
  });

  it('invalidate(key) removes only that entry', () => {
    cache.set('a', 'alpha', 'h1');
    cache.set('b', 'beta', 'h2');
    cache.invalidate('a');
    expect(cache.get('a', 'h1')).toBeNull();
    expect(cache.get('b', 'h2')).toBe('beta');
  });

  it('invalidateAll clears every entry', () => {
    cache.set('a', 'alpha', 'h1');
    cache.set('b', 'beta', 'h2');
    cache.invalidateAll();
    expect(cache.get('a', 'h1')).toBeNull();
    expect(cache.get('b', 'h2')).toBeNull();
  });
});

// ─── TextMeasurementCache ─────────────────────────────────────────────────────

describe('TextMeasurementCache (PRD Section 10)', () => {
  it('returns null for uncached entry', () => {
    const c = new TextMeasurementCache();
    expect(c.get('hello', 'Arial 16px')).toBeNull();
  });

  it('stores and retrieves metrics', () => {
    const c = new TextMeasurementCache();
    c.set('hello', 'Arial 16px', { width: 42, height: 16 });
    const m = c.get('hello', 'Arial 16px');
    expect(m).not.toBeNull();
    expect(m!.width).toBe(42);
  });

  it('invalidateFont removes matching entries only', () => {
    const c = new TextMeasurementCache();
    c.set('hello', '600 88px "Cormorant Garamond"', { width: 100, height: 88 });
    c.set('world', '400 32px "Plus Jakarta Sans"', { width: 60, height: 32 });
    c.invalidateFont('Cormorant Garamond');
    expect(c.get('hello', '600 88px "Cormorant Garamond"')).toBeNull();
    expect(c.get('world', '400 32px "Plus Jakarta Sans"')).not.toBeNull();
  });
});

// ─── RainOverlayLayer ─────────────────────────────────────────────────────────

describe('RainOverlayLayer (PRD Section 23, 27, 29)', () => {
  it('initializes with default config when enabled=false', () => {
    const rain = new RainOverlayLayer();
    expect(rain.enabled).toBe(false);
    expect(rain.startTime).toBe(0);
    expect(rain.endTime).toBe(Infinity);
  });

  it('remains inactive (enabled=false) and render is a no-op', () => {
    const rain = new RainOverlayLayer({ ...DEFAULT_RAIN_CONFIG, enabled: false });
    let called = false;
    // Simulate render context — render should exit early
    const mockCtx = {
      save: () => { called = true; },
      restore: () => {},
    } as unknown as CanvasRenderingContext2D;
    rain.render({ ctx: mockCtx, width: 1080, height: 1920, currentTime: 5, isPreview: false });
    expect(called).toBe(false);
  });

  it('updateConfig with new seed re-initializes particles (determinism)', () => {
    const rain = new RainOverlayLayer({ ...DEFAULT_RAIN_CONFIG, enabled: true, density: 20, seed: 1 });
    rain.prepare({ width: 1080, height: 1920, projectSeed: 42, isPreview: false });
    rain.updateConfig({ seed: 999 });
    // No crash = particles re-initialized
    expect(rain.getConfig().seed).toBe(999);
  });

  it('timeline range is respected via isLayerActive', () => {
    const rain = new RainOverlayLayer({ ...DEFAULT_RAIN_CONFIG, enabled: true, startTime: 5, endTime: 15 });
    expect(isLayerActive(rain, 4.9)).toBe(false);
    expect(isLayerActive(rain, 5.0)).toBe(true);
    expect(isLayerActive(rain, 14.9)).toBe(true);
    expect(isLayerActive(rain, 15.0)).toBe(false);
  });
});

// ─── WatermarkLayer ───────────────────────────────────────────────────────────

describe('WatermarkLayer (PRD Section 25, 26)', () => {
  it('initializes with defaults', () => {
    const wm = new WatermarkLayer();
    expect(wm.enabled).toBe(false);
    expect(wm.startTime).toBe(0);
    expect(wm.endTime).toBe(Infinity);
    expect(wm.type).toBe('watermark');
  });

  it('has correct zIndex for compositing order', () => {
    const wm = new WatermarkLayer();
    expect(wm.zIndex).toBe(LAYER_ZINDEX['watermark']);
  });

  it('does not render when imageUrl is null', () => {
    const wm = new WatermarkLayer({ ...DEFAULT_WATERMARK_CONFIG, enabled: true, imageUrl: null });
    let called = false;
    const mockCtx = {
      save: () => { called = true; },
      restore: () => {},
    } as unknown as CanvasRenderingContext2D;
    wm.render({ ctx: mockCtx, width: 1080, height: 1920, currentTime: 1, isPreview: false });
    expect(called).toBe(false);
  });
});

// ─── calculateTextAnimationState ─────────────────────────────────────────────

describe('calculateTextAnimationState (PRD Section 21, 22)', () => {
  it('returns opacity=0 before block startTime', () => {
    const block = makeBlock({ startTime: 2, endTime: 5 });
    const state = calculateTextAnimationState(block, 0, 'fade');
    expect(state.opacity).toBe(0);
  });

  it('returns opacity=0 after block endTime', () => {
    const block = makeBlock({ startTime: 2, endTime: 5 });
    const state = calculateTextAnimationState(block, 6, 'fade');
    expect(state.opacity).toBe(0);
  });

  it('returns opacity > 0 during hold phase', () => {
    const block = makeBlock({ startTime: 0, endTime: 4 });
    // Mid-duration should be in hold phase
    const state = calculateTextAnimationState(block, 2, 'slide-up');
    expect(state.opacity).toBeGreaterThan(0.9);
  });

  it('scale-in preset uses scale transform not translateY', () => {
    const block = makeBlock({ startTime: 0, endTime: 4 });
    const state = calculateTextAnimationState(block, 2, 'scale-in');
    expect(state.translateY).toBe(0);
  });

  it('blur-to-sharp has blur > 0 during enter phase', () => {
    const block = makeBlock({ startTime: 0, endTime: 4 });
    // Enter phase: just after startTime
    const state = calculateTextAnimationState(block, 0.05, 'blur-to-sharp');
    expect(state.blur).toBeGreaterThan(0);
  });
});

// ─── RenderJobState ───────────────────────────────────────────────────────────

describe('RenderJobState (PRD Section 18)', () => {
  it('createInitialJobState has IDLE status', () => {
    const state = createInitialJobState('job-1');
    expect(state.status).toBe('IDLE');
    expect(state.percentage).toBe(0);
    expect(state.errorMessage).toBeNull();
    expect(state.estimatedRemainingMs).toBeNull();
  });

  it('computeEstimatedRemaining returns null when < 30 frames', () => {
    expect(computeEstimatedRemaining(10, 1000, 500)).toBeNull();
    expect(computeEstimatedRemaining(29, 1000, 1000)).toBeNull();
  });

  it('computeEstimatedRemaining returns a number when >= 30 frames', () => {
    const eta = computeEstimatedRemaining(30, 1000, 3000); // 100ms/frame, 970 remaining
    expect(eta).not.toBeNull();
    expect(eta!).toBeGreaterThan(0);
  });

  it('computeEstimatedRemaining returns 0 when all frames done', () => {
    const eta = computeEstimatedRemaining(1000, 1000, 30000);
    expect(eta).toBe(0);
  });
});
