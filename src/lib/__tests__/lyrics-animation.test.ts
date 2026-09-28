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

  it('effect "kinetic" produces crisp upward micro-slide entry', () => {
    const block = createMockBlock();
    const typeResult = resolveLyricsTypeState('word-by-word', block, 10.85);
    const effectResult = applyLyricsEffect('kinetic', typeResult.units, block, 10.85, { duration: 200, intensity: 1.0 });

    // While entering, translateY is slightly positive (entering from below) and decreases to 0
    expect(effectResult.units[1].translateY).toBeGreaterThan(0);
    expect(effectResult.units[1].translateY).toBeLessThanOrEqual(5.0);
  });

  it('effect "wave" creates subtle rhythmic vertical sine offset', () => {
    const block = createMockBlock();
    const typeResult = resolveLyricsTypeState('single-line', block, 11.0);
    const effectResult = applyLyricsEffect('wave', typeResult.units, block, 11.0, { intensity: 1.0 });

    // Different words at different indices receive different vertical wave offsets
    expect(effectResult.units[0].translateY).not.toBe(effectResult.units[2].translateY);
  });

  it('effect "blur" applies soft blur-in that sharpens to 0', () => {
    const block = createMockBlock();
    const typeResult = resolveLyricsTypeState('word-by-word', block, 10.85);
    const effectResult = applyLyricsEffect('blur', typeResult.units, block, 10.85, { duration: 200, intensity: 1.0 });

    expect(effectResult.units[1].blur).toBeGreaterThan(0);
  });

  it('effect "glow" adds bloom to active units', () => {
    const block = createMockBlock();
    const typeResult = resolveLyricsTypeState('highlighted-word', block, 11.0);
    const effectResult = applyLyricsEffect('glow', typeResult.units, block, 11.0, { intensity: 1.0 });

    expect(effectResult.units[1].glow).toBeGreaterThan(0);
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
