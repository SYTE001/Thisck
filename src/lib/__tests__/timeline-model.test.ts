import { describe, it, expect } from 'vitest';
import {
  getSortedLines,
  getTimelineDuration,
  getLineIndexAt,
  getActiveLineAt,
  getActiveBlockAt,
  detectOverlaps,
  detectGaps,
  getOutputRange,
} from '../timeline/timeline-model';
import type { LyricLine, VisualLyricBlock } from '../../types/lyrics';

function line(id: string, start: number | null, end: number | null): LyricLine {
  return { id, text: id, startTime: start, endTime: end, source: 'SOURCE_MANUAL' };
}

describe('timeline-model', () => {
  const lines: LyricLine[] = [
    line('a', 0, 2),
    line('b', 2, 4),
    line('c', 4, 6),
  ];

  it('sorts chronologically, untimed last', () => {
    const sorted = getSortedLines([line('c', 4, 6), line('u', null, null), line('a', 0, 2)]);
    expect(sorted.map((l) => l.id)).toEqual(['a', 'c', 'u']);
  });

  it('getTimelineDuration pads when unbounded', () => {
    expect(getTimelineDuration(lines, null)).toBe(6 + 1.5);
  });

  it('getTimelineDuration uses media when longer', () => {
    expect(getTimelineDuration(lines, 20)).toBe(20);
    expect(getTimelineDuration(lines, 3)).toBe(6);
  });

  it('getLineIndexAt finds active line', () => {
    expect(getLineIndexAt(lines, 0)).toBe(0);
    expect(getLineIndexAt(lines, 2)).toBe(1);
    expect(getLineIndexAt(lines, 5.9)).toBe(2);
  });

  it('getLineIndexAt returns -1 outside any line', () => {
    expect(getLineIndexAt(lines, 6)).toBe(-1);
    expect(getLineIndexAt(lines, 100)).toBe(-1);
  });

  it('getActiveLineAt returns the line object', () => {
    expect(getActiveLineAt(lines, 3)?.id).toBe('b');
    expect(getActiveLineAt(lines, 50)).toBeNull();
  });

  it('getActiveBlockAt finds block', () => {
    const blocks: VisualLyricBlock[] = [
      { id: 'x', sourceLineId: 'a', text: 'x', lines: ['x'], startTime: 0, endTime: 3, duration: 3, layoutType: 'single-line', sceneIndex: 0, fontSizeMultiplier: 1 },
    ];
    expect(getActiveBlockAt(blocks, 1)?.id).toBe('x');
    expect(getActiveBlockAt(blocks, 5)).toBeNull();
  });

  it('detectOverlaps finds overlapping lines', () => {
    const overlapping = [line('a', 0, 3), line('b', 2, 5)];
    const result = detectOverlaps(overlapping);
    expect(result).toHaveLength(1);
    expect(result[0].overlapSec).toBeCloseTo(1);
  });

  it('detectOverlaps respects tolerance', () => {
    const almost = [line('a', 0, 2.03), line('b', 2, 4)];
    expect(detectOverlaps(almost, 0.05)).toHaveLength(0);
    expect(detectOverlaps(almost, 0)).toHaveLength(1);
  });

  it('detectGaps finds gaps', () => {
    const gapped = [line('a', 0, 2), line('b', 5, 7)];
    const result = detectGaps(gapped, 1);
    expect(result).toHaveLength(1);
    expect(result[0].gapSec).toBeCloseTo(3);
  });

  it('getOutputRange resolves through the model', () => {
    const r = getOutputRange(lines, undefined, 20);
    expect(r.endTime).toBe(20);
    expect(r.source).toBe('AUDIO');
  });

  it('does not mutate input', () => {
    const original = [line('c', 4, 6), line('a', 0, 2)];
    const snapshot = JSON.stringify(original);
    getSortedLines(original);
    detectOverlaps(original);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});
