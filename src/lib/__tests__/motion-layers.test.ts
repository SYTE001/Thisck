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
import { VideoTransitionsLayer } from '../layers/video-transitions';
import { calculateTextAnimationState } from '../render/text-animation';
import { applyLyricsEffect, getWaveOffsetY, WAVE_FREQUENCY_HZ } from '../render/lyricsAnimation/lyricsEffects';
import { resolveLyricsTypeState } from '../render/lyricsAnimation/lyricsTypes';
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
    rain.render({ ctx: mockCtx, width: 1080, height: 1920, currentTime: 5, totalDuration: 100, isPreview: false });
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
    const wm = new WatermarkLayer({ ...DEFAULT_WATERMARK_CONFIG, enabled: true, sourceType: 'video', videoUrl: null });
    let called = false;
    const mockCtx = {
      save: () => { called = true; },
      restore: () => {},
    } as unknown as CanvasRenderingContext2D;
    wm.render({ ctx: mockCtx, width: 1080, height: 1920, currentTime: 1, totalDuration: 100, isPreview: false });
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

// ─── VideoTransitionsLayer (Prompt Section 25) ───────────────────────────────

describe('VideoTransitionsLayer', () => {
  function makeMockCtx() {
    let alpha = 1;
    const ops: string[] = [];
    const ctx = {
      ops,
      save: () => ops.push('save'),
      restore: () => ops.push('restore'),
      fillRect: (x: number, y: number, w: number, h: number) => ops.push(`fillRect(${x},${y},${w},${h})`),
      get globalAlpha() { return alpha; },
      set globalAlpha(v: number) { alpha = v; ops.push(`alpha=${v.toFixed(2)}`); },
      fillStyle: '#000000',
    } as unknown as CanvasRenderingContext2D & { ops: string[] };
    return ctx;
  }

  it('Fade In starts at 100% black, has partial opacity at midpoint, and becomes invisible at end', () => {
    const layer = new VideoTransitionsLayer({
      enabled: true,
      fadeIn: true,
      fadeInDuration: 2.0,
      fadeOut: false,
    });

    // Start (t = 0s): 100% black
    const ctxStart = makeMockCtx();
    layer.render({ ctx: ctxStart, width: 1080, height: 1920, currentTime: 0, totalDuration: 10, isPreview: false });
    expect(ctxStart.ops).toContain('alpha=1.00');
    expect(ctxStart.ops).toContain('fillRect(0,0,1080,1920)');

    // Midpoint (t = 1.0s): 50% black
    const ctxMid = makeMockCtx();
    layer.render({ ctx: ctxMid, width: 1080, height: 1920, currentTime: 1.0, totalDuration: 10, isPreview: false });
    expect(ctxMid.ops).toContain('alpha=0.50');
    expect(ctxMid.ops).toContain('fillRect(0,0,1080,1920)');

    // End (t = 2.0s): fully transparent (no black rectangle drawn)
    const ctxEnd = makeMockCtx();
    layer.render({ ctx: ctxEnd, width: 1080, height: 1920, currentTime: 2.0, totalDuration: 10, isPreview: false });
    expect(ctxEnd.ops.some((op) => op.startsWith('fillRect'))).toBe(false);
  });

  it('Fade Out is inactive before transition, partially black at midpoint, and 100% black at end', () => {
    const layer = new VideoTransitionsLayer({
      enabled: true,
      fadeIn: false,
      fadeOut: true,
      fadeOutDuration: 2.0,
    });
    const totalDuration = 10.0;

    // Before transition (t = 7.0s): no black overlay
    const ctxBefore = makeMockCtx();
    layer.render({ ctx: ctxBefore, width: 1080, height: 1920, currentTime: 7.0, totalDuration, isPreview: false });
    expect(ctxBefore.ops.some((op) => op.startsWith('fillRect'))).toBe(false);

    // Midpoint (t = 9.0s): 50% black
    const ctxMid = makeMockCtx();
    layer.render({ ctx: ctxMid, width: 1080, height: 1920, currentTime: 9.0, totalDuration, isPreview: false });
    expect(ctxMid.ops).toContain('alpha=0.50');
    expect(ctxMid.ops).toContain('fillRect(0,0,1080,1920)');

    // End (t = 10.0s): 100% black
    const ctxEnd = makeMockCtx();
    layer.render({ ctx: ctxEnd, width: 1080, height: 1920, currentTime: 10.0, totalDuration, isPreview: false });
    expect(ctxEnd.ops).toContain('alpha=1.00');
    expect(ctxEnd.ops).toContain('fillRect(0,0,1080,1920)');
  });
});

// ─── WatermarkLayer (Prompt Section 25) ──────────────────────────────────────

describe('WatermarkLayer text & glass modes', () => {
  function makeMockCtx() {
    let alpha = 1;
    const ops: string[] = [];
    const ctx = {
      ops,
      save: () => ops.push('save'),
      restore: () => ops.push('restore'),
      fillText: (text: string, x: number, y: number) => ops.push(`fillText(${text},${Math.round(x)},${Math.round(y)})`),
      measureText: (text: string) => ({ width: text.length * 10 }),
      roundRect: (x: number, y: number, w: number, h: number) => ops.push(`roundRect(${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)})`),
      fill: () => ops.push('fill'),
      stroke: () => ops.push('stroke'),
      beginPath: () => ops.push('beginPath'),
      translate: () => {},
      scale: () => {},
      get globalAlpha() { return alpha; },
      set globalAlpha(v: number) { alpha = v; ops.push(`alpha=${v.toFixed(2)}`); },
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      textBaseline: 'top',
    } as unknown as CanvasRenderingContext2D & { ops: string[] };
    return ctx;
  }

  it('renders arbitrary text watermark', () => {
    const wm = new WatermarkLayer({
      enabled: true,
      sourceType: 'text',
      text: '@sound_studio',
      textStyle: 'plain',
      opacity: 0.8,
    });

    const ctx = makeMockCtx();
    wm.render({ ctx, width: 1080, height: 1920, currentTime: 1, totalDuration: 10, isPreview: false });
    expect(ctx.ops.some((op) => op.includes('fillText(@sound_studio'))).toBe(true);
    expect(ctx.ops).toContain('alpha=0.80');
  });

  it('Plain output != Glass output', () => {
    const wmPlain = new WatermarkLayer({
      enabled: true,
      sourceType: 'text',
      text: '@artist',
      textStyle: 'plain',
    });

    const wmGlass = new WatermarkLayer({
      enabled: true,
      sourceType: 'text',
      text: '@artist',
      textStyle: 'glass',
    });

    const ctxPlain = makeMockCtx();
    const ctxGlass = makeMockCtx();

    wmPlain.render({ ctx: ctxPlain, width: 1080, height: 1920, currentTime: 1, totalDuration: 10, isPreview: false });
    wmGlass.render({ ctx: ctxGlass, width: 1080, height: 1920, currentTime: 1, totalDuration: 10, isPreview: false });

    // Glass output contains backdrop rounded rectangle and stroke
    expect(ctxGlass.ops.some((op) => op.includes('roundRect'))).toBe(true);
    expect(ctxGlass.ops).toContain('stroke');
    // Plain output does not contain backdrop rect
    expect(ctxPlain.ops.some((op) => op.includes('roundRect'))).toBe(false);
    expect(ctxPlain.ops).not.toEqual(ctxGlass.ops);
  });
});

// ─── Lyrics Effect: em-relative amplitudes (1080x1920, font 88px) ──────────────

describe('Lyrics Effect amplitude is font-size relative (render scale sanity)', () => {
  const RENDER_FONT_SIZE = 88;

  function makeWaveBlock(): VisualLyricBlock {
    return makeBlock({
      text: 'we are falling tonight',
      lines: ['we are falling tonight'],
      startTime: 1.0,
      endTime: 5.0,
      duration: 4.0,
      words: [
        { id: 'w0', text: 'we', startTime: 1.0, endTime: 1.8 },
        { id: 'w1', text: 'are', startTime: 1.8, endTime: 2.6 },
        { id: 'w2', text: 'falling', startTime: 2.6, endTime: 3.8 },
        { id: 'w3', text: 'tonight', startTime: 3.8, endTime: 5.0 },
      ],
    });
  }

  /** Peak absolute displacement of an effect over a full sampling window. */
  function peakDisplacement(effect: 'wave' | 'kinetic' | 'slide' | 'bounce' | 'blur', fontSize: number): number {
    const block = makeWaveBlock();
    let peak = 0;
    for (let t = 1.0; t < 5.0; t += 1 / 240) {
      const units = resolveLyricsTypeState('single-line', block, t).units;
      const res = applyLyricsEffect(effect, units, block, t, { intensity: 1.0 }, fontSize);
      for (const u of res.units) {
        peak = Math.max(peak, Math.abs(u.translateX), Math.abs(u.translateY), Math.abs(u.blur));
      }
    }
    return peak;
  }

  it('wave peak amplitude exceeds 8px at a 88px font (was previously ~3px and invisible)', () => {
    const peak = peakDisplacement('wave', RENDER_FONT_SIZE);
    expect(peak).toBeGreaterThan(8);
    // 0.16em of 88px = 14.08px is the theoretical maximum
    expect(peak).toBeLessThanOrEqual(0.16 * RENDER_FONT_SIZE + 0.001);
  });

  it('kinetic, slide, bounce and blur are all clearly visible at 88px', () => {
    for (const effect of ['kinetic', 'slide', 'bounce', 'blur'] as const) {
      expect(peakDisplacement(effect, RENDER_FONT_SIZE), `${effect} must be visible`).toBeGreaterThan(8);
    }
  });

  it('amplitudes scale with the font size (same visual ratio at any canvas size)', () => {
    for (const effect of ['wave', 'kinetic', 'slide', 'bounce', 'blur'] as const) {
      const small = peakDisplacement(effect, 44);
      const large = peakDisplacement(effect, 88);
      expect(large).toBeCloseTo(small * 2, 4);
    }
  });

  it('every non-none effect differs from "none" at 100% intensity on an 88px font', () => {
    const block = makeWaveBlock();
    const t = 1.05;
    const units = resolveLyricsTypeState('single-line', block, t).units;
    const baseline = applyLyricsEffect('none', units, block, t, {}, RENDER_FONT_SIZE);

    const effects = ['fade', 'fade-in-out', 'wave', 'kinetic', 'scale', 'pop', 'blur', 'slide', 'bounce', 'glow', 'highlight', 'pulse'] as const;

    for (const effect of effects) {
      const res = applyLyricsEffect(effect, units, block, t, { intensity: 1.0 }, RENDER_FONT_SIZE);
      const differs = res.units.some((u, i) => {
        const b = baseline.units[i];
        return (
          Math.abs(u.translateX - b.translateX) > 0.01 ||
          Math.abs(u.translateY - b.translateY) > 0.01 ||
          Math.abs(u.scale - b.scale) > 0.001 ||
          Math.abs(u.blur - b.blur) > 0.01 ||
          Math.abs(u.glow - b.glow) > 0.01 ||
          Math.abs(u.opacity - b.opacity) > 0.001
        );
      });
      expect(differs, `effect "${effect}" must render differently from "none"`).toBe(true);
    }
  });

  it('"none" remains 100% static regardless of font size or intensity', () => {
    const block = makeWaveBlock();
    const units = resolveLyricsTypeState('word-by-word', block, 2.0).units;
    for (const fontSize of [40, 88, 400]) {
      const res = applyLyricsEffect('none', units, block, 2.0, { intensity: 2.0 }, fontSize);
      for (const u of res.units) {
        expect(u.translateX).toBe(0);
        expect(u.translateY).toBe(0);
        expect(u.scale).toBe(1.0);
        expect(u.blur).toBe(0);
        expect(u.glow).toBe(0);
      }
    }
  });

  it('wave propagates left to right and runs at a calm 1.2-1.6 Hz', () => {
    expect(WAVE_FREQUENCY_HZ).toBeGreaterThanOrEqual(1.2);
    expect(WAVE_FREQUENCY_HZ).toBeLessThanOrEqual(1.6);

    const t = 2.0;
    const left = getWaveOffsetY(0, t, 1.0, RENDER_FONT_SIZE, 1.0);
    const right = getWaveOffsetY(3, t, 1.0, RENDER_FONT_SIZE, 1.0);
    // A travelling wave: neighbouring units are out of phase, not identical
    expect(left).not.toBeCloseTo(right, 3);

    // One full period brings the wave back to the same offset
    const period = 1 / WAVE_FREQUENCY_HZ;
    expect(getWaveOffsetY(0, t + period, 1.0, RENDER_FONT_SIZE, 1.0)).toBeCloseTo(left, 6);
  });
});

