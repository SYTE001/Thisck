import { describe, it, expect } from 'vitest';
import { calculateWordByWordState, getDistributedWords } from '../render/lyricsAnimation/presets/wordByWord';
import { calculateBlockMotion } from '../motion/adaptive-motion';
import type { VisualLyricBlock, Word } from '../../types/lyrics';

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
    ...overrides,
  };
}

describe('getDistributedWords', () => {
  it('uses word-level timestamps when available', () => {
    const existingWords: Word[] = [
      { id: 'w1', text: 'we', startTime: 10.0, endTime: 10.5 },
      { id: 'w2', text: 'are', startTime: 10.5, endTime: 11.2 },
    ];
    const block = createMockBlock({ words: existingWords });
    const result = getDistributedWords(block);
    expect(result).toBe(existingWords);
    expect(result[0].startTime).toBe(10.0);
    expect(result[1].startTime).toBe(10.5);
  });

  it('distributes words naturally across the lyric line duration when timestamps are missing', () => {
    const block = createMockBlock({ words: undefined });
    const words = getDistributedWords(block);
    expect(words).toHaveLength(4);
    expect(words[0].text).toBe('we');
    expect(words[1].text).toBe('are');
    expect(words[2].text).toBe('falling');
    expect(words[3].text).toBe('tonight');

    // First word starts at block startTime
    expect(words[0].startTime).toBe(10.0);

    // Each subsequent word starts strictly after the previous
    for (let i = 1; i < words.length; i++) {
      expect(words[i].startTime).toBeGreaterThan(words[i - 1].startTime);
    }

    // Last word starts before the block ends, leaving time to read
    expect(words[3].startTime).toBeLessThan(block.endTime);
    expect(words[3].endTime).toBe(block.endTime);
  });

  it('handles single word lyric gracefully', () => {
    const block = createMockBlock({ text: 'Hello', words: undefined });
    const words = getDistributedWords(block);
    expect(words).toHaveLength(1);
    expect(words[0].startTime).toBe(10.0);
    expect(words[0].endTime).toBe(14.0);
  });

  it('handles rapid lyrics with short duration', () => {
    const block = createMockBlock({ startTime: 5.0, endTime: 5.6, duration: 0.6, words: undefined });
    const words = getDistributedWords(block);
    expect(words).toHaveLength(4);
    expect(words[0].startTime).toBe(5.0);
    expect(words[3].startTime).toBeLessThan(5.6);
  });

  it('handles slow lyrics with long duration', () => {
    const block = createMockBlock({ startTime: 0, endTime: 10, duration: 10, words: undefined });
    const words = getDistributedWords(block);
    expect(words).toHaveLength(4);
    expect(words[0].startTime).toBe(0);
    expect(words[3].startTime).toBeLessThanOrEqual(8.0); // around 80% mark
  });
});

describe('calculateWordByWordState', () => {
  it('returns strictly 0 opacity before block startTime', () => {
    const block = createMockBlock({ startTime: 10.0, endTime: 14.0 });
    const motion = calculateBlockMotion(block, 8.0);
    const state = calculateWordByWordState(block, 8.0, motion);
    expect(state.words.every((w) => w.opacity === 0)).toBe(true);
  });

  it('returns strictly 0 opacity after block endTime', () => {
    const block = createMockBlock({ startTime: 10.0, endTime: 14.0 });
    const motion = calculateBlockMotion(block, 15.0);
    const state = calculateWordByWordState(block, 15.0, motion);
    expect(state.words.every((w) => w.opacity === 0)).toBe(true);
  });

  it('animates the incoming word with opacity 0->1 while maintaining rock-solid stable position', () => {
    const block = createMockBlock({
      startTime: 10.0,
      endTime: 14.0,
      words: [
        { id: 'w1', text: 'we', startTime: 10.0, endTime: 10.8 },
        { id: 'w2', text: 'are', startTime: 10.8, endTime: 11.5 },
      ],
    });

    // Right as word 1 begins (10.0s):
    const motionAtStart = calculateBlockMotion(block, 10.0);
    const stateAtStart = calculateWordByWordState(block, 10.0, motionAtStart);
    // At t=0, progress=0: opacity=0, scale=1.00 (stable), translateY=0 (no jump)
    expect(stateAtStart.words[0].opacity).toBeCloseTo(0, 2);
    expect(stateAtStart.words[0].scale).toBeCloseTo(1.00, 2);
    expect(stateAtStart.words[0].translateY).toBeCloseTo(0, 1);

    // Midway through entry of word 1 (e.g. 100ms in):
    const motionMidEntry = calculateBlockMotion(block, 10.1);
    const stateMidEntry = calculateWordByWordState(block, 10.1, motionMidEntry);
    expect(stateMidEntry.words[0].opacity).toBeGreaterThan(0.5);
    expect(stateMidEntry.words[0].scale).toBeCloseTo(1.00, 2);
    expect(stateMidEntry.words[0].translateY).toBe(0);

    // Word 2 has not started yet, so remains hidden at scale 1.0 and translateY 0
    expect(stateMidEntry.words[1].opacity).toBe(0);
    expect(stateMidEntry.words[1].scale).toBe(1.00);
    expect(stateMidEntry.words[1].translateY).toBe(0);
  });

  it('respects optional custom verticalMovement and scale if explicitly configured', () => {
    const block = createMockBlock({
      startTime: 10.0,
      endTime: 14.0,
      words: [
        { id: 'w1', text: 'we', startTime: 10.0, endTime: 10.8 },
      ],
    });
    const motion = calculateBlockMotion(block, 10.0);
    const state = calculateWordByWordState(block, 10.0, motion, { verticalMovement: 6, activeWordScale: 1.05 });
    expect(state.words[0].translateY).toBeCloseTo(6, 1);
  });

  it('keeps previously revealed words visible when subsequent words animate', () => {
    const block = createMockBlock({
      startTime: 10.0,
      endTime: 14.0,
      words: [
        { id: 'w1', text: 'we', startTime: 10.0, endTime: 10.5 },
        { id: 'w2', text: 'are', startTime: 10.6, endTime: 11.2 },
        { id: 'w3', text: 'falling', startTime: 11.3, endTime: 12.0 },
      ],
    });

    // When word 3 is entering at 11.35s:
    const motion = calculateBlockMotion(block, 11.35);
    const state = calculateWordByWordState(block, 11.35, motion);

    // Word 1 and Word 2 are previously revealed words: must stay visible at full opacity
    expect(state.words[0].opacity).toBe(1.0);
    expect(state.words[0].translateY).toBe(0);
    expect(state.words[1].opacity).toBe(1.0);
    expect(state.words[1].translateY).toBe(0);

    // Word 3 is actively entering
    expect(state.words[2].opacity).toBeGreaterThan(0);
  });

  it('handles multi-line and long lyrics correctly', () => {
    const longText = 'the quiet stars illuminate the pathway home across the valley';
    const block = createMockBlock({
      text: longText,
      lines: ['the quiet stars illuminate', 'the pathway home across the valley'],
      duration: 5.0,
      startTime: 20.0,
      endTime: 25.0,
      words: undefined,
    });
    const motion = calculateBlockMotion(block, 22.5);
    const state = calculateWordByWordState(block, 22.5, motion);
    expect(state.words.length).toBe(10);
    // Early words in line 1 should already be visible
    expect(state.words[0].opacity).toBe(1.0);
    expect(state.words[1].opacity).toBe(1.0);
  });

  it('does not animate the line as a whole block', () => {
    const block = createMockBlock();
    const motion = calculateBlockMotion(block, 11.0);
    const state = calculateWordByWordState(block, 11.0, motion);
    // Line transform stays neutral
    expect(state.line.translateY).toBe(0);
    expect(state.line.scale).toBe(1);
    expect(state.line.blur).toBe(0);
  });
});
