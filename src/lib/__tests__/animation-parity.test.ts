import { describe, it, expect } from 'vitest';
import { resolveAnimationConfig } from '../render/animation-resolver';
import { createRenderContext } from '../render/render-context';
import type { LyricLine } from '../../types/lyrics';
import { DEEP_FOREST } from '../styles/presets';

describe('animation-resolver', () => {
  it('passes through canonical config unchanged', () => {
    const r = resolveAnimationConfig({ lyricsType: 'karaoke', lyricsEffect: 'glow' });
    expect(r.type).toBe('karaoke');
    expect(r.effect).toBe('glow');
  });

  it('maps a legacy preset to canonical when canonical fields are missing', () => {
    expect(resolveAnimationConfig({ textAnimationPreset: 'kinetic' })).toMatchObject({
      type: 'word-by-word',
      effect: 'kinetic',
    });
    expect(resolveAnimationConfig({ textAnimationPreset: 'blur-to-sharp' })).toMatchObject({
      type: 'single-line',
      effect: 'blur',
    });
  });

  it('builds config from legacy textAnimationConfig', () => {
    const r = resolveAnimationConfig({
      textAnimationPreset: 'word-by-word',
      textAnimationConfig: { enterDuration: 300, intensity: 1.5, wordStagger: 0.05 },
    });
    expect(r.config?.duration).toBe(300);
    expect(r.config?.intensity).toBe(1.5);
    expect(r.config?.stagger).toBe(50);
  });

  it('is deterministic for identical input', () => {
    const input = { lyricsType: 'single-line' as const, lyricsEffect: 'fade' as const };
    expect(resolveAnimationConfig(input)).toEqual(resolveAnimationConfig(input));
  });
});

describe('preview/export parity (createRenderContext)', () => {
  const lines: LyricLine[] = [
    { id: 'a', text: 'hello world', startTime: 0, endTime: 2, source: 'SOURCE_MANUAL' },
  ];
  const input = {
    lines,
    style: DEEP_FOREST,
    trackTitle: 'Song',
    artistName: 'Artist',
    motion: {
      lyricsType: 'word-by-word' as const,
      lyricsEffect: 'fade' as const,
      textAnimation: 'word-by-word' as const,
      rain: {} as any,
      watermark: {} as any,
    },
  };

  it('resolves identical timing/animation/layout regardless of target quality', () => {
    const preview = createRenderContext(input, 1.23, { width: 540, height: 960, isPreview: true });
    const exportCtx = createRenderContext(input, 1.23, { width: 1080, height: 1920, isPreview: false });

    // Timing and animation must be identical between preview and export.
    expect(preview.currentTime).toBe(exportCtx.currentTime);
    expect(preview.lyricsType).toBe(exportCtx.lyricsType);
    expect(preview.lyricsEffect).toBe(exportCtx.lyricsEffect);
    expect(preview.lyricsEffectConfig).toEqual(exportCtx.lyricsEffectConfig);
    expect(preview.lines).toBe(exportCtx.lines);
    expect(preview.projectSeed).toBe(exportCtx.projectSeed);

    // Only resolution / quality flag may differ.
    expect(preview.isPreview).toBe(true);
    expect(exportCtx.isPreview).toBe(false);
    expect(preview.width).not.toBe(exportCtx.width);
  });

  it('is deterministic for identical input and time', () => {
    const a = createRenderContext(input, 2.5, { width: 1080, height: 1920, isPreview: false });
    const b = createRenderContext(input, 2.5, { width: 1080, height: 1920, isPreview: false });
    expect(a).toEqual(b);
  });
});
