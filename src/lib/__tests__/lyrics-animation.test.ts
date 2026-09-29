import { describe, it, expect } from 'vitest';
import type { VisualLyricBlock } from '../../types/lyrics';
import { resolveLyricsTypeState } from '../render/lyricsAnimation/lyricsTypes';
import { applyLyricsEffect } from '../render/lyricsAnimation/lyricsEffects';
import { getLyricsAnimationState } from '../render/lyricsAnimation/animationEngine';

function createMockBlock(overrides: Partial<VisualLyricBlock> = {}): VisualLyricBlock {
  return {
    id: 'block-1',
    sourceLineId: 'line-1',
    text: 'we are falling tonight',
    lines: ['we are falling tonight'],
    startTime: 10.0,
    endTime: 14.0,
    duration: 4.0,
    layoutType: 'single-line',
    sceneIndex: 0,
    fontSizeMultiplier: 1.0,
    words: [
      { id: 'w0', text: 'we', startTime: 10.0, endTime: 10.8 },
      { id: 'w1', text: 'are', startTime: 10.8, endTime: 11.6 },
      { id: 'w2', text: 'falling', startTime: 11.6, endTime: 12.8 },
      { id: 'w3', text: 'tonight', startTime: 12.8, endTime: 14.0 },
    ],
    ...overrides,
  };
}

describe('Lyrics Type Layer (Layer 1: Content & Display Behavior)', () => {
  it('single-line displays all words simultaneously with solid opacity 1.0', () => {
    const block = createMockBlock();
    const result = resolveLyricsTypeState('single-line', block, 11.0);
    expect(result.blockActive).toBe(true);
    expect(result.units).toHaveLength(4);
    expect(result.units.every((u) => u.isRevealed && u.opacity === 1.0)).toBe(true);
    // Typography is rock-solid with zero translation or scale
    expect(result.units.every((u) => u.translateX === 0 && u.translateY === 0 && u.scale === 1.0)).toBe(true);
  });

  it('word-by-word reveals words sequentially at exact timestamps with fixed positions', () => {
    const block = createMockBlock();

    // At 10.2s: word 0 ("we") is revealed; words 1, 2, 3 are not
    const at10_2 = resolveLyricsTypeState('word-by-word', block, 10.2);
    expect(at10_2.units[0].isRevealed).toBe(true);
    expect(at10_2.units[0].opacity).toBe(1.0);
    expect(at10_2.units[1].isRevealed).toBe(false);
    expect(at10_2.units[1].opacity).toBe(0.0);

    // At 11.0s: word 0 and word 1 are revealed; words 2 and 3 are not
    const at11_0 = resolveLyricsTypeState('word-by-word', block, 11.0);
    expect(at11_0.units[0].isRevealed).toBe(true);
    expect(at11_0.units[1].isRevealed).toBe(true);
    expect(at11_0.units[2].isRevealed).toBe(false);

    // Fixed position check: zero translation, zero scale
    expect(at11_0.units.every((u) => u.translateX === 0 && u.translateY === 0 && u.scale === 1.0)).toBe(true);
  });

  it('highlighted-word keeps all words visible, highlighting the active word', () => {
    const block = createMockBlock();
    // At 11.0s: word 1 ("are") is active (10.8 -> 11.6)
    const result = resolveLyricsTypeState('highlighted-word', block, 11.0, '#E6C280');
    expect(result.units.every((u) => u.isRevealed)).toBe(true);
    // Active word is full opacity with accent color
    expect(result.units[1].isActive).toBe(true);
    expect(result.units[1].opacity).toBe(1.0);
    expect(result.units[1].colorOverride).toBe('#E6C280');
    // Inactive words remain visible at 0.42 opacity
    expect(result.units[0].opacity).toBe(0.42);
    expect(result.units[2].opacity).toBe(0.42);
  });

  it('karaoke transitions words from dimmed to sung state', () => {
    const block = createMockBlock();
    // At 11.0s: word 0 is past, word 1 is active, words 2 & 3 are not reached
    const result = resolveLyricsTypeState('karaoke', block, 11.0, '#E6C280');
    expect(result.units[0].isPast).toBe(true);
    expect(result.units[0].opacity).toBe(1.0); // Already sung
    expect(result.units[1].isActive).toBe(true);
    expect(result.units[1].opacity).toBe(1.0); // Actively sung
    expect(result.units[1].colorOverride).toBe('#E6C280');
    expect(result.units[2].opacity).toBe(0.45); // Not yet sung
    expect(result.units[3].opacity).toBe(0.45);
  });

  it('progressive provides continuous reveal progress from 0.0 to 1.0', () => {
    const block = createMockBlock({ startTime: 10.0, endTime: 14.0, duration: 4.0 });
    const atStart = resolveLyricsTypeState('progressive', block, 10.0);
    expect(atStart.revealProgress).toBeCloseTo(0.0, 2);

    const atMid = resolveLyricsTypeState('progressive', block, 12.0);
    expect(atMid.revealProgress).toBeCloseTo(0.5, 2);

    const atEnd = resolveLyricsTypeState('progressive', block, 14.0);
    expect(atEnd.revealProgress).toBeCloseTo(1.0, 2);
  });
});

describe('Lyrics Effect Layer (Layer 2: Visual Motion Layer)', () => {
  it('effect "none" produces strictly 0 translation, scale 1.0, blur 0, glow 0', () => {
    const block = createMockBlock();
    const typeResult = resolveLyricsTypeState('word-by-word', block, 11.0);
    const effectResult = applyLyricsEffect('none', typeResult.units, block, 11.0);

    for (const unit of effectResult.units) {
      expect(unit.translateX).toBe(0);
      expect(unit.translateY).toBe(0);
      expect(unit.scale).toBe(1.0);
      expect(unit.blur).toBe(0);
      expect(unit.glow).toBe(0);
    }
    expect(effectResult.lineTransform.translateY).toBe(0);
    expect(effectResult.lineTransform.scale).toBe(1.0);
  });

  it('effect "fade" smoothly transitions opacity without position displacement', () => {
    const block = createMockBlock();
    const typeResult = resolveLyricsTypeState('word-by-word', block, 10.85); // Word 1 just revealed 50ms ago
    const effectResult = applyLyricsEffect('fade', typeResult.units, block, 10.85, { duration: 200 });

    // Word 1 is fading in
    expect(effectResult.units[1].opacity).toBeGreaterThan(0);
    expect(effectResult.units[1].opacity).toBeLessThan(1.0);
    // Zero position displacement!
    expect(effectResult.units[1].translateX).toBe(0);
    expect(effectResult.units[1].translateY).toBe(0);
    expect(effectResult.units[1].scale).toBe(1.0);
  });

  it('effect "kinetic" produces crisp upward micro-slide entry scaled to font size', () => {
    const block = createMockBlock();
    const typeResult = resolveLyricsTypeState('word-by-word', block, 10.85);
    const effectResult = applyLyricsEffect(
      'kinetic',
      typeResult.units,
      block,
      10.85,
      { intensity: 1.0 },
      88
    );

    // While entering, translateY is positive (entering from below) and decreases to 0.
    // Amplitude is em-relative: 0.18em of an 88px font ~ 15.8px max.
    expect(effectResult.units[1].translateY).toBeGreaterThan(0);
    expect(effectResult.units[1].translateY).toBeLessThanOrEqual(0.18 * 88);
  });

  it('effect "wave" creates a travelling vertical offset that is clearly visible at 88px font', () => {
    const block = createMockBlock();
    const typeResult = resolveLyricsTypeState('single-line', block, 11.0);
    const effectResult = applyLyricsEffect('wave', typeResult.units, block, 11.0, { intensity: 1.0 }, 88);

    // Different words at different indices receive different vertical wave offsets
    expect(effectResult.units[0].translateY).not.toBe(effectResult.units[2].translateY);

    // Wave amplitude must be visually meaningful: peak amplitude is 0.16em of 88px ~ 14px
    let maxAbs = 0;
    // Sample a full cycle so we hit the sine peak regardless of start phase
    for (let t = 11.0; t < 11.0 + 1 / 1.4; t += 1 / 240) {
      const sampled = applyLyricsEffect('wave', typeResult.units, block, t, { intensity: 1.0 }, 88);
      maxAbs = Math.max(maxAbs, ...sampled.units.map((u) => Math.abs(u.translateY)));
    }
    expect(maxAbs).toBeGreaterThan(8);
    expect(maxAbs).toBeLessThanOrEqual(0.16 * 88 + 0.001);
  });

  it('effect "wave" keeps moving for the whole block and never touches opacity', () => {
    const block = createMockBlock();
    const typeResult = resolveLyricsTypeState('single-line', block, 11.0);
    const noneRef = applyLyricsEffect('none', typeResult.units, block, 11.0, {}, 88);

    // Far past the reveal, the wave must still be alive
    const late = applyLyricsEffect('wave', typeResult.units, block, 13.5, { intensity: 1.0 }, 88);
    const later = applyLyricsEffect('wave', typeResult.units, block, 13.9, { intensity: 1.0 }, 88);

    expect(late.units[0].translateY).not.toBe(0);
    expect(late.units[0].translateY).not.toBe(later.units[0].translateY);

    // Opacity is not modulated by the wave
    expect(late.units.map((u) => u.opacity)).toEqual(noneRef.units.map((u) => u.opacity));
  });

  it('em-relative displacement scales linearly with font size', () => {
    const block = createMockBlock();
    const typeResult = resolveLyricsTypeState('single-line', block, 11.0);
    const small = applyLyricsEffect('wave', typeResult.units, block, 11.0, { intensity: 1.0 }, 44);
    const large = applyLyricsEffect('wave', typeResult.units, block, 11.0, { intensity: 1.0 }, 88);

    // Same phase => exactly 2x displacement when the font size doubles
    expect(large.units[0].translateY).toBeCloseTo(small.units[0].translateY * 2, 6);
  });

  it('effect "blur" applies soft blur-in that sharpens to 0', () => {
    const block = createMockBlock();
    const typeResult = resolveLyricsTypeState('word-by-word', block, 10.85);
    const effectResult = applyLyricsEffect('blur', typeResult.units, block, 10.85, { intensity: 1.0 }, 88);

    expect(effectResult.units[1].blur).toBeGreaterThan(0);
  });

  it('effect "glow" adds bloom to active units', () => {
    const block = createMockBlock();
    const typeResult = resolveLyricsTypeState('highlighted-word', block, 11.0);
    const effectResult = applyLyricsEffect('glow', typeResult.units, block, 11.0, { intensity: 1.0 }, 88);

    expect(effectResult.units[1].glow).toBeGreaterThan(0);
  });
});

describe('Lyrics Effect visibility at 1080x1920 (fontSize 88)', () => {
  const EFFECTS_WITH_MOTION = ['wave', 'kinetic', 'slide', 'blur', 'bounce', 'pop', 'scale'] as const;

  it('every moving effect produces a transform different from "none" at 100% intensity', () => {
    const block = createMockBlock();
    // Sample a few moments across the block so enter animations are captured too
    const times = [10.05, 10.2, 10.5, 11.0, 12.0, 13.0];

    for (const effect of EFFECTS_WITH_MOTION) {
      let differsFromNone = false;
      let maxMotion = 0;

      for (const t of times) {
        const typeResult = resolveLyricsTypeState('single-line', block, t);
        const baseline = applyLyricsEffect('none', typeResult.units, block, t, {}, 88);
        const applied = applyLyricsEffect(effect, typeResult.units, block, t, { intensity: 1.0 }, 88);

        applied.units.forEach((u, i) => {
          const base = baseline.units[i];
          const moved =
            Math.abs(u.translateX - base.translateX) > 0.01 ||
            Math.abs(u.translateY - base.translateY) > 0.01 ||
            Math.abs(u.scale - base.scale) > 0.001 ||
            Math.abs(u.blur - base.blur) > 0.01;
          if (moved) differsFromNone = true;
          maxMotion = Math.max(
            maxMotion,
            Math.abs(u.translateX - base.translateX),
            Math.abs(u.translateY - base.translateY),
            Math.abs(u.blur - base.blur)
          );
        });
      }

      expect(differsFromNone, `effect "${effect}" must move relative to "none"`).toBe(true);
      // Sanity: motion is never absurd (> 1 em) at 100% intensity
      expect(maxMotion).toBeLessThanOrEqual(88);
    }
  });

  it('"none" stays strictly static even when a large font size is passed', () => {
    const block = createMockBlock();
    const typeResult = resolveLyricsTypeState('word-by-word', block, 11.0);
    const result = applyLyricsEffect('none', typeResult.units, block, 11.0, { intensity: 2.0 }, 400);

    for (const u of result.units) {
      expect(u.translateX).toBe(0);
      expect(u.translateY).toBe(0);
      expect(u.scale).toBe(1.0);
      expect(u.blur).toBe(0);
      expect(u.glow).toBe(0);
    }
  });
});

describe('Full Integration: Independence and Deterministic Scrubbing', () => {
  it('combining Word by Word + None produces zero movement when playing or seeking', () => {
    const block = createMockBlock();

    // Test multiple timeline points
    const times = [10.0, 10.4, 10.8, 11.2, 11.6, 12.0, 12.8, 13.5];
    for (const t of times) {
      const state = getLyricsAnimationState('word-by-word', 'none', block, t);
      // All units have 0 translation and 1.0 scale
      for (const u of state.words) {
        expect(u.translateX).toBe(0);
        expect(u.translateY).toBe(0);
        expect(u.scale).toBe(1.0);
      }
      expect(state.line.translateY).toBe(0);
      expect(state.line.scale).toBe(1.0);
    }
  });

  it('seeking forward and seeking backward is strictly deterministic', () => {
    const block = createMockBlock();
    const targetTime = 11.2;

    const firstSample = getLyricsAnimationState('word-by-word', 'fade', block, targetTime);
    // Simulate seeking to 13.0, then back to targetTime
    getLyricsAnimationState('word-by-word', 'fade', block, 13.0);
    const secondSample = getLyricsAnimationState('word-by-word', 'fade', block, targetTime);

    expect(firstSample.words.map((w) => w.opacity)).toEqual(secondSample.words.map((w) => w.opacity));
    expect(firstSample.words.map((w) => w.translateY)).toEqual(secondSample.words.map((w) => w.translateY));
  });

  it('wave ripple stays deterministic under scrubbing and is font-size driven end to end', () => {
    const block = createMockBlock();
    const t = 11.4;

    const at88 = getLyricsAnimationState('word-by-word', 'wave', block, t, { intensity: 1.0 }, '#E6C280', 88);
    getLyricsAnimationState('word-by-word', 'wave', block, 13.8, { intensity: 1.0 }, '#E6C280', 88);
    const at88Again = getLyricsAnimationState('word-by-word', 'wave', block, t, { intensity: 1.0 }, '#E6C280', 88);

    // Deterministic after seeking
    expect(at88.words.map((w) => w.translateY)).toEqual(at88Again.words.map((w) => w.translateY));

    // At 88px the wave must be clearly visible: peak > 8px
    let maxAbs = 0;
    for (let s = t; s < t + 1 / 1.4; s += 1 / 240) {
      const sampled = getLyricsAnimationState('word-by-word', 'wave', block, s, { intensity: 1.0 }, '#E6C280', 88);
      maxAbs = Math.max(maxAbs, ...sampled.words.map((w) => Math.abs(w.translateY)));
    }
    expect(maxAbs).toBeGreaterThan(8);

    // Same timeline, 200% intensity => roughly double the amplitude
    const strong = getLyricsAnimationState('word-by-word', 'wave', block, t, { intensity: 2.0 }, '#E6C280', 88);
    expect(Math.abs(strong.words[0].translateY)).toBeCloseTo(Math.abs(at88.words[0].translateY) * 2, 5);
  });

  it('"none" is unaffected by the font size parameter while other effects are not', () => {
    const block = createMockBlock();
    const t = 10.3;

    const noneSmall = getLyricsAnimationState('word-by-word', 'none', block, t, undefined, '#E6C280', 40);
    const noneLarge = getLyricsAnimationState('word-by-word', 'none', block, t, undefined, '#E6C280', 200);
    expect(noneSmall.words.map((w) => w.translateY)).toEqual(noneLarge.words.map((w) => w.translateY));

    const kineticSmall = getLyricsAnimationState('word-by-word', 'kinetic', block, t, { intensity: 1.0 }, '#E6C280', 40);
    const kineticLarge = getLyricsAnimationState('word-by-word', 'kinetic', block, t, { intensity: 1.0 }, '#E6C280', 200);
    expect(Math.abs(kineticLarge.words[0].translateY)).toBeGreaterThan(
      Math.abs(kineticSmall.words[0].translateY)
    );
  });

  it('changing Lyrics Effect does not affect Lyrics Type word reveal timestamps', () => {
    const block = createMockBlock();
    const t = 11.0;

    const stateNone = getLyricsAnimationState('word-by-word', 'none', block, t);
    const stateKinetic = getLyricsAnimationState('word-by-word', 'kinetic', block, t);
    const stateWave = getLyricsAnimationState('word-by-word', 'wave', block, t);

    // In all three, word 0 and word 1 are revealed, word 2 and word 3 are not
    expect(stateNone.words[0].opacity > 0).toBe(true);
    expect(stateNone.words[1].opacity > 0).toBe(true);
    expect(stateNone.words[2].opacity === 0).toBe(true);

    expect(stateKinetic.words[0].opacity > 0).toBe(true);
    expect(stateKinetic.words[1].opacity > 0).toBe(true);
    expect(stateKinetic.words[2].opacity === 0).toBe(true);

    expect(stateWave.words[0].opacity > 0).toBe(true);
    expect(stateWave.words[1].opacity > 0).toBe(true);
    expect(stateWave.words[2].opacity === 0).toBe(true);
  });
});
