import { describe, it, expect } from 'vitest';
import { renderEditorialFrame } from '../render/canvas-renderer';
import type { LyricLine, VisualLyricBlock } from '../../types/lyrics';
import type { StyleConfig } from '../../types/project';
import { DEEP_FOREST } from '../styles/presets';

interface Draw {
  text: string;
  x: number;
  y: number;
}

function makeMockCtx() {
  const draws: Draw[] = [];
  let fontSize = 10;
  const ctx = {
    draws,
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    beginPath: () => {},
    rect: () => {},
    clip: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {},
    roundRect: () => {},
    createPattern: () => ({}),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {},
    globalAlpha: 1,
    textAlign: 'center',
    textBaseline: 'top',
    filter: 'none',
    letterSpacing: '0px',
    lineWidth: 1,
    shadowBlur: 0,
    shadowColor: '',
    fillStyle: '',
    strokeStyle: '',
    globalCompositeOperation: 'source-over',
    get font() { return ''; },
    set font(v: string) {
      const m = String(v).match(/(\d+(?:\.\d+)?)px/);
      fontSize = m ? parseFloat(m[1]) : 10;
    },
    measureText: (t: string) => ({ width: t.length * fontSize * 0.5 }),
    fillText: (text: string, x: number, y: number) => { draws.push({ text, x, y }); },
  } as unknown as CanvasRenderingContext2D & { draws: Draw[] };
  return ctx;
}

const lines: LyricLine[] = [
  { id: 'l1', startTime: 0, endTime: 4, text: 'we are falling tonight' } as LyricLine,
];

const block: VisualLyricBlock = {
  id: 'b1',
  sourceLineId: 'l1',
  text: 'we are falling tonight',
  lines: ['we are falling tonight'],
  startTime: 0,
  endTime: 4,
  duration: 4,
  layoutType: 'single-line',
  sceneIndex: 0,
  fontSizeMultiplier: 1.0,
  words: [
    { id: 'w0', text: 'we', startTime: 0, endTime: 0.9 },
    { id: 'w1', text: 'are', startTime: 0.9, endTime: 1.8 },
    { id: 'w2', text: 'falling', startTime: 1.8, endTime: 3.0 },
    { id: 'w3', text: 'tonight', startTime: 3.0, endTime: 4.0 },
  ],
};

const style = {
  ...DEEP_FOREST,
  grainIntensity: 0,
  vignetteIntensity: 0,
  showStarDecoration: false,
  alternatingScenes: false,
} as StyleConfig;

function renderFrame(t: number, effect: string, config: any = {}, isPreview = true) {
  const ctx = makeMockCtx();
  renderEditorialFrame(ctx, {
    width: 1080,
    height: 1920,
    currentTime: t,
    lines,
    style,
    visualBlocks: [block],
    lyricsType: 'word-by-word',
    lyricsEffect: effect as any,
    lyricsEffectConfig: { intensity: 1.0, ...config },
    isPreview,
  });
  return ctx.draws;
}

describe('Rendered frame: Wave Ripple is actually visible', () => {
  it('draws one glyph per character with a travelling vertical offset', () => {
    // t = 3.5s: all four words have been revealed (word-by-word)
    const draws = renderFrame(3.5, 'wave');

    // 19 characters in "we are falling tonight" (2 + 3 + 7 + 7)
    expect(draws.length).toBe(19);

    const ys = draws.map((d) => d.y);
    const spread = Math.max(...ys) - Math.min(...ys);
    // 0.16em of an 88px font => up to ~14px ripple, so the spread must be clearly non-zero
    expect(spread).toBeGreaterThan(4);
    expect(spread).toBeLessThanOrEqual(0.16 * 88 * 2 + 1);

    // Characters are laid out left to right (x never goes backwards)
    for (let i = 1; i < draws.length; i++) {
      expect(draws[i].x).toBeGreaterThanOrEqual(draws[i - 1].x);
    }
  });

  it('ripple changes over time but keeps identical horizontal layout', () => {
    const a = renderFrame(3.5, 'wave');
    const b = renderFrame(3.62, 'wave');

    expect(a.map((d) => d.y)).not.toEqual(b.map((d) => d.y));
    // Horizontal positions never change (layout is untouched by the effect)
    expect(a.map((d) => d.x)).toEqual(b.map((d) => d.x));
  });

  it('"none" draws whole words at a single flat baseline (no per-character ripple)', () => {
    const draws = renderFrame(3.5, 'none');
    // 4 words, each drawn as a single fillText
    expect(draws.length).toBe(4);
    const ys = new Set(draws.map((d) => d.y));
    expect(ys.size).toBe(1);
  });

  it('intensity 200% produces a wider ripple than 100%', () => {
    const spread100 = (() => {
      const ys = renderFrame(2.0, 'wave', { intensity: 1.0 }).map((d) => d.y);
      return Math.max(...ys) - Math.min(...ys);
    })();
    const spread200 = (() => {
      const ys = renderFrame(2.0, 'wave', { intensity: 2.0 }).map((d) => d.y);
      return Math.max(...ys) - Math.min(...ys);
    })();

    expect(spread100).toBeGreaterThan(4);
    expect(spread200).toBeCloseTo(spread100 * 2, 3);
  });

  it('preview and export render byte-identical wave geometry (same renderer path)', () => {
    const preview = renderFrame(2.0, 'wave', { intensity: 1.0 }, true);
    const exported = renderFrame(2.0, 'wave', { intensity: 1.0 }, false);
    expect(exported).toEqual(preview);
  });
});
