import { describe, it, expect } from 'vitest';
import { chunkLyricLine, chunkAllLyricLines, getActiveVisualBlockAt } from '../layout/lyric-chunker';
import { calculateBlockMotion, getAdaptiveMotionTimings } from '../motion/adaptive-motion';
import type { LyricLine } from '../../types/lyrics';

describe('PATCH — Lyric Chunking & Motion Refinement (Acceptance Tests A–I)', () => {
  // Test A: "baby" -> single compact visual
  it('A. "baby": produces a single compact visual with centered-hero layout', () => {
    const line: LyricLine = {
      id: 'test-a',
      text: 'baby',
      startTime: 2.0,
      endTime: 3.5,
      source: 'SOURCE_LRC',
    };
    const chunks = chunkLyricLine(line);
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toBe('baby');
    expect(chunks[0].layoutType).toBe('centered-hero');
    expect(chunks[0].startTime).toBe(2.0);
    expect(chunks[0].endTime).toBe(3.5);
  });

  // Test B: "I love you" -> single 3-word visual
  it('B. "I love you": produces a single 3-word visual', () => {
    const line: LyricLine = {
      id: 'test-b',
      text: 'I love you',
      startTime: 4.0,
      endTime: 6.0,
      source: 'SOURCE_LRC',
    };
    const chunks = chunkLyricLine(line);
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toBe('I love you');
    expect(chunks[0].lines.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].startTime).toBe(4.0);
    expect(chunks[0].endTime).toBe(6.0);
  });

  // Test C: "I can't resist them butterflies" -> multiple visual chunks, not one paragraph
  it('C. "I can\'t resist them butterflies": produces multiple visual chunks, not one paragraph', () => {
    const line: LyricLine = {
      id: 'test-c',
      text: "I can't resist them butterflies",
      startTime: 12.0,
      endTime: 17.0, // 5.0 seconds
      source: 'SOURCE_LRC',
    };
    const chunks = chunkLyricLine(line);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Neither chunk should contain all 5 words
    expect(chunks[0].text).toBe("I can't resist");
    expect(chunks[1].text).toBe('them butterflies');
    // All chunks must be strictly bounded within [12.0, 17.0]
    expect(chunks[0].startTime).toBeGreaterThanOrEqual(12.0);
    expect(chunks[chunks.length - 1].endTime).toBeLessThanOrEqual(17.0);
  });

  // Test D: 10+ word lyric -> automatic editorial splitting into 3-5 word blocks
  it('D. 10+ word lyric: automatically splits into editorial blocks of 3-5 words each', () => {
    const line: LyricLine = {
      id: 'test-d',
      text: "I can't resist them butterflies sexy, clunky, donkey, donkey, donkey and falling in love again",
      startTime: 20.0,
      endTime: 28.0, // 8 seconds
      source: 'SOURCE_LRC',
    };
    const chunks = chunkLyricLine(line);
    expect(chunks.length).toBeGreaterThanOrEqual(3);

    for (const chunk of chunks) {
      const wordCount = chunk.text.split(' ').length;
      expect(wordCount).toBeGreaterThanOrEqual(2);
      expect(wordCount).toBeLessThanOrEqual(5);
    }
  });

  // Test E: Very short 0.4s lyric -> micro-animation
  it('E. Very short 0.4s lyric: applies micro-animation without overshoot or cut-off', () => {
    const line: LyricLine = {
      id: 'test-e',
      text: 'now',
      startTime: 5.0,
      endTime: 5.4, // 0.4 seconds
      source: 'SOURCE_LRC',
    };
    const chunks = chunkLyricLine(line);
    expect(chunks.length).toBe(1);

    const block = chunks[0];
    const timings = getAdaptiveMotionTimings(block.duration);
    expect(timings.isMinimal).toBe(true);

    const enterMotion = calculateBlockMotion(block, 5.02);
    expect(enterMotion.isActive).toBe(true);
    expect(enterMotion.opacity).toBeGreaterThan(0);
    expect(enterMotion.translateY).toBeLessThanOrEqual(3); // micro movement only

    const midMotion = calculateBlockMotion(block, 5.2);
    expect(midMotion.opacity).toBe(1.0);

    const afterMotion = calculateBlockMotion(block, 5.41);
    expect(afterMotion.isActive).toBe(false);
    expect(afterMotion.opacity).toBe(0);
  });

  // Test F: Long 5-6s lyric -> multiple visual states where appropriate
  it('F. Long 5-6s lyric: produces multiple visual states across the duration', () => {
    const line: LyricLine = {
      id: 'test-f',
      text: 'under the streetlights fading into dark velvet skies',
      startTime: 30.0,
      endTime: 36.0, // 6.0 seconds
      source: 'SOURCE_LRC',
    };
    const chunks = chunkLyricLine(line);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].duration).toBeGreaterThan(1.5);
    expect(chunks[chunks.length - 1].duration).toBeGreaterThan(1.5);
  });

  // Test G: Two consecutive lyrics -> no previous lyric residue
  it('G. Two consecutive lyrics: absolute zero previous-lyric residue after end time', () => {
    const line1: LyricLine = {
      id: 'line-1',
      text: 'First phrase',
      startTime: 10.0,
      endTime: 13.0,
      source: 'SOURCE_LRC',
    };
    const line2: LyricLine = {
      id: 'line-2',
      text: 'Second phrase',
      startTime: 13.05,
      endTime: 16.0,
      source: 'SOURCE_LRC',
    };

    const allBlocks = chunkAllLyricLines([line1, line2]);

    // Right after line1 ends (e.g. 13.02s during transition gap)
    const atGap = getActiveVisualBlockAt(allBlocks, 13.02);
    expect(atGap.activeBlock).toBeNull();
    // At this gap, line 1 is fully ended, opacity must be 0
    const m1 = calculateBlockMotion(allBlocks[0], 13.02);
    expect(m1.opacity).toBe(0);

    // During line2 (14.0s)
    const atLine2 = getActiveVisualBlockAt(allBlocks, 14.0);
    expect(atLine2.activeBlock?.sourceLineId).toBe('line-2');

    // Line 1 residue at 14.0s is strictly zero
    const m1AtLine2 = calculateBlockMotion(allBlocks[0], 14.0);
    expect(m1AtLine2.isActive).toBe(false);
    expect(m1AtLine2.opacity).toBe(0);
  });

  // Test H: Fast lyrics -> compressed animation without overlap
  it('H. Fast lyrics: compressed entrance/exit fits strictly inside fast segment', () => {
    const fastLine: LyricLine = {
      id: 'fast-1',
      text: 'quick word here',
      startTime: 8.0,
      endTime: 8.8, // 0.8s fast segment
      source: 'SOURCE_LRC',
    };
    const chunks = chunkLyricLine(fastLine);
    const timings = getAdaptiveMotionTimings(chunks[0].duration);
    expect(timings.enterSec).toBeLessThanOrEqual(0.12);
    expect(timings.exitSec).toBeLessThanOrEqual(0.12);
    expect(timings.enterSec + timings.exitSec).toBeLessThan(0.8);
  });

  // Test I: Slow lyrics -> more breathing room
  it('I. Slow lyrics: provides luxurious breathing room during hold phase', () => {
    const slowLine: LyricLine = {
      id: 'slow-1',
      text: 'held in my heart',
      startTime: 0,
      endTime: 4.0, // 4.0s slow phrase
      source: 'SOURCE_LRC',
    };
    const chunks = chunkLyricLine(slowLine);
    const timings = getAdaptiveMotionTimings(chunks[0].duration);
    expect(timings.holdSec).toBeGreaterThanOrEqual(3.0);
  });
});
