import { describe, it, expect } from 'vitest';
import {
  correctDrift,
  buildTimeWarp,
  warpTime,
  extractAnchors,
  type DriftAnchor,
} from '../sync/drift-corrector';
import type { LyricLine } from '../../types/lyrics';

/**
 * PRD Module I — drift correction. A global offset cannot fix cumulative
 * drift; these tests pin the piecewise time-warp behaviour.
 */

let idCounter = 0;
function line(
  text: string,
  start: number | null,
  end: number | null,
  confidence = 0.9,
  wordStarts: number[] = []
): LyricLine {
  const id = `t-${idCounter++}`;
  return {
    id,
    text,
    startTime: start,
    endTime: end,
    confidence,
    source: 'SOURCE_AUDIO_ALIGNMENT',
    words: wordStarts.map((s, i) => ({
      id: `${id}-w${i}`,
      text: text.split(/\s+/)[i] ?? '',
      startTime: s,
      endTime: s + 0.3,
      confidence,
      timingSource: 'matched' as const,
    })),
  };
}

/** Builds aligned + prior line pairs where prior drifts progressively. */
function progressiveDriftFixture() {
  // True vocal times: 10, 30, 60, 90. The alignment drifts +0.08 → +0.5s.
  const truth = [10, 30, 60, 90];
  const drift = [10.08, 30.22, 60.41, 90.5];
  const prior = truth.map((t, i) => line(`line ${i}`, t, t + 2));
  // The aligned draft reuses the SAME line ids (the orchestrator merges ids
  // before drift correction) with drifted timings.
  const aligned = prior.map((p, i) => ({ ...p, startTime: drift[i], endTime: drift[i] + 2 }));
  return { prior, aligned, truth };
}

describe('correctDrift: auto anchors from prior timing', () => {
  it('corrects progressive drift while keeping the median constant offset', () => {
    const { prior, aligned, truth } = progressiveDriftFixture();
    const result = correctDrift(aligned, prior);
    expect(result.applied).toBe(true);

    const errorsBefore = aligned.map((l, i) => l.startTime! - truth[i]);
    const errorsAfter = result.lines.map((l, i) => l.startTime! - truth[i]);
    const spreadBefore = Math.max(...errorsBefore) - Math.min(...errorsBefore);
    const spreadAfter = Math.max(...errorsAfter) - Math.min(...errorsAfter);
    // The progressive component is gone; only a near-constant residual remains.
    expect(spreadAfter).toBeLessThan(spreadBefore / 2);
    expect(Math.max(...errorsAfter.map(Math.abs))).toBeLessThan(Math.max(...errorsBefore.map(Math.abs)));
  });

  it('never produces negative, overlapping or non-monotonic output', () => {
    const { prior, aligned } = progressiveDriftFixture();
    const result = correctDrift(aligned, prior);
    let prevEnd = 0;
    for (const l of result.lines) {
      expect(l.startTime!).toBeGreaterThanOrEqual(0);
      expect(l.startTime!).toBeGreaterThanOrEqual(prevEnd - 0.011);
      expect(l.endTime!).toBeGreaterThan(l.startTime!);
      for (const w of l.words ?? []) {
        expect(w.startTime).toBeGreaterThanOrEqual(0);
        expect(w.endTime).toBeGreaterThan(w.startTime);
      }
      prevEnd = l.endTime!;
    }
  });

  it('warps word timestamps too, keeping them inside their line', () => {
    const p = [
      line('a', 10, 12, 0.9, [10, 10.5]),
      line('b', 20, 22, 0.9, [20, 20.5]),
      line('c', 50, 52, 0.9, [50, 50.5]),
      line('d', 80, 82, 0.9, [80, 80.5]),
    ];
    const drifts = [10.0, 20.4, 51.2, 81.8];
    const aligned = p.map((l, i) => ({
      ...l,
      startTime: drifts[i],
      endTime: drifts[i] + 2,
      words: drifts[i] !== undefined
        ? [0, 0.5].map((o, wi) => ({
            ...l.words![wi],
            startTime: drifts[i] + o,
            endTime: drifts[i] + o + 0.3,
          }))
        : l.words,
    }));
    const result = correctDrift(aligned, p);
    expect(result.applied).toBe(true);
    for (const l of result.lines) {
      for (const w of l.words ?? []) {
        expect(w.startTime).toBeGreaterThanOrEqual(0);
        expect(w.endTime).toBeGreaterThan(w.startTime);
      }
    }
  });

  it('is a no-op for a pure constant offset (Global Offset territory)', () => {
    const truth = [5, 15, 30, 50];
    const prior = truth.map((t, i) => line(`l${i}`, t, t + 2));
    const aligned = prior.map((p, i) => ({ ...p, startTime: truth[i] + 0.25, endTime: truth[i] + 2.25 }));
    const result = correctDrift(aligned, prior);
    expect(result.applied).toBe(false);
    expect(result.skippedReason).toBe('no-progressive-drift');
    expect(result.residualConstantSec).toBeCloseTo(0.25, 2);
    expect(result.lines).toBe(aligned); // untouched
  });

  it('is a no-op with fewer than 3 anchors', () => {
    const prior = [line('a', 10, 12), line('b', 40, 42)];
    const aligned = prior.map((p) => ({ ...p, startTime: p.startTime! + 0.6, endTime: p.endTime! + 0.6 }));
    const result = correctDrift(aligned, prior);
    expect(result.applied).toBe(false);
    expect(result.skippedReason).toBe('too-few-anchors');
  });

  it('is a no-op when the prior lines carry no timing (from-scratch TXT sync)', () => {
    const prior = [
      line('a', null, null),
      line('b', null, null),
      line('c', null, null),
      line('d', null, null),
    ];
    const aligned = prior.map((l, i) => line(l.text, 10 + i * 10, 12 + i * 10));
    const result = correctDrift(aligned, prior);
    expect(result.applied).toBe(false);
    expect(result.skippedReason).toBe('no-reference');
  });

  it('ignores low-confidence lines when extracting anchors', () => {
    const prior = [10, 30, 60, 90].map((t, i) => line(`l${i}`, t, t + 2));
    const aligned = [10.0, 30.9, 61.5, 92.1].map((t, i) => line(`l${i}`, t, t + 2, 0.3));
    const anchors = extractAnchors(aligned, prior, 0.6);
    expect(anchors).toHaveLength(0);
  });
});

describe('correctDrift: user anchors', () => {
  it('honours user anchors exactly, without a residual shift', () => {
    const target = [line('a', 10.5, 12.5), line('b', 30.5, 32.5), line('c', 60.5, 62.5)];
    const anchors: DriftAnchor[] = [
      { expected: 10, detected: 10.5, weight: 1 },
      { expected: 30, detected: 30.5, weight: 1 },
      { expected: 60, detected: 60.5, weight: 1 },
    ];
    const result = correctDrift(target, [], { extraAnchors: anchors });
    expect(result.applied).toBe(true);
    // Every anchor lands on its expected time.
    expect(result.lines[0].startTime).toBeCloseTo(10, 1);
    expect(result.lines[1].startTime).toBeCloseTo(30, 1);
    expect(result.lines[2].startTime).toBeCloseTo(60, 1);
  });
});

describe('time warp primitives', () => {
  it('keeps zero fixed and moves pre-anchor times monotonically', () => {
    const warp = buildTimeWarp([
      { detected: 10, target: 10.5 },
      { detected: 30, target: 30.4 },
    ]);
    expect(warpTime(warp, 0)).toBe(0);
    // Before the first anchor the shift ramps linearly toward the anchor.
    const early = warpTime(warp, 5);
    expect(early).toBeGreaterThanOrEqual(5);
    expect(early).toBeLessThanOrEqual(10.5);
  });

  it('interpolates monotonically between anchors and through the tail', () => {
    const warp = buildTimeWarp([
      { detected: 10, target: 10.2 },
      { detected: 20, target: 20.6 },
      { detected: 30, target: 31.2 },
    ]);
    let prev = -Infinity;
    for (let t = 0; t <= 40; t += 0.5) {
      const mapped = warpTime(warp, t);
      expect(mapped).toBeGreaterThanOrEqual(prev);
      expect(mapped).toBeGreaterThanOrEqual(0);
      prev = mapped;
    }
    // The tail continues at slope 1 with the last anchor's shift bounded.
    expect(warpTime(warp, 40)).toBeCloseTo(31.2 + 10, 3);
  });
});
